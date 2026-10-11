import { knex } from '../../shared/db/knex.js';

const db = (trx) => trx ?? knex;

/* --------------------------------------------------------- driver profiles */

export function findProfile(userId, trx) {
  return db(trx)('driver_profiles').where({ user_id: userId }).first();
}

export function findProfileForUpdate(userId, trx) {
  return trx('driver_profiles').where({ user_id: userId }).forUpdate().first();
}

export async function updateProfile(userId, patch, trx) {
  const [row] = await db(trx)('driver_profiles').where({ user_id: userId }).update(patch).returning('*');
  return row;
}

export async function insertProfile(data, trx) {
  const [row] = await db(trx)('driver_profiles').insert(data).returning('*');
  return row;
}

export async function adminListDrivers({ status, availability, q, limit, offset }, trx) {
  const conn = db(trx);
  const query = conn('driver_profiles as d')
    .join('users as u', 'u.id', 'd.user_id')
    .whereNull('u.deleted_at')
    .select(
      'd.*',
      'u.full_name',
      'u.email',
      'u.phone',
      'u.status as user_status',
      conn.raw('count(*) OVER() AS total_count'),
    )
    .orderBy('d.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (status) query.where('d.status', status);
  if (availability) query.where('d.availability', availability);
  if (q) query.where((b) => b.whereILike('u.full_name', `%${q}%`).orWhereILike('u.email', `%${q}%`));
  const rows = await query;
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/* ------------------------------------------------------------- assignments */

export function findAssignment(id, trx) {
  return db(trx)('delivery_assignments').where({ id }).first();
}

/** Row-locked and scoped to the driver, so another driver's offer is a 404. */
export function findAssignmentForUpdate(id, driverUserId, trx) {
  return trx('delivery_assignments').where({ id, driver_user_id: driverUserId }).forUpdate().first();
}

export function findAcceptedAssignment(driverUserId, orderId, trx) {
  return db(trx)('delivery_assignments')
    .where({ driver_user_id: driverUserId, order_id: orderId, status: 'ACCEPTED' })
    .first();
}

export function findActiveAssignment(driverUserId, trx) {
  return db(trx)('delivery_assignments')
    .where({ driver_user_id: driverUserId, status: 'ACCEPTED' })
    .first();
}

export function findOpenOffer(orderId, trx) {
  return db(trx)('delivery_assignments').where({ order_id: orderId, status: 'OFFERED' }).first();
}

export async function insertOffer({ orderId, driverUserId, expiresAt, distanceKm }, trx) {
  const [row] = await db(trx)('delivery_assignments')
    .insert({
      order_id: orderId,
      driver_user_id: driverUserId,
      status: 'OFFERED',
      expires_at: expiresAt,
      distance_km: distanceKm ?? null,
    })
    .returning('*');
  return row;
}

export async function updateAssignment(id, patch, trx) {
  const [row] = await db(trx)('delivery_assignments').where({ id }).update(patch).returning('*');
  return row;
}

/** Closes every live assignment for an order (delivery or cancellation). */
export async function closeForOrder(orderId, status, trx) {
  return db(trx)('delivery_assignments')
    .where({ order_id: orderId })
    .whereIn('status', ['OFFERED', 'ACCEPTED'])
    .update({ status, responded_at: knex.fn.now() });
}

/** Live offers for a driver, with enough order context to decide. */
export function listOffersForDriver(driverUserId, trx) {
  return db(trx)('delivery_assignments as a')
    .join('orders as o', 'o.id', 'a.order_id')
    .join('restaurants as r', 'r.id', 'o.restaurant_id')
    .where({ 'a.driver_user_id': driverUserId, 'a.status': 'OFFERED' })
    .where('a.expires_at', '>', knex.fn.now())
    .select(
      'a.id', 'a.expires_at', 'a.distance_km', 'a.offered_at',
      'o.id as order_id', 'o.order_number', 'o.status as order_status',
      'o.total_amount', 'o.delivery_address_snapshot',
      'r.name as restaurant_name', 'r.address_line1 as restaurant_address', 'r.phone as restaurant_phone',
      db(trx).raw('(SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count'),
    )
    .orderBy('a.offered_at', 'desc');
}

export function listDeliveriesForDriver(driverUserId, { scope, limit, offset }, trx) {
  const conn = db(trx);
  const q = conn('orders as o')
    .join('restaurants as r', 'r.id', 'o.restaurant_id')
    .where('o.driver_user_id', driverUserId)
    .select(
      'o.*',
      'r.name as restaurant_name',
      'r.address_line1 as restaurant_address',
      conn.raw('count(*) OVER() AS total_count'),
    )
    .orderBy('o.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (scope === 'active') q.whereIn('o.status', ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY']);
  if (scope === 'history') q.whereIn('o.status', ['DELIVERED', 'CANCELLED']);
  return q;
}

export function findDeliveryDetail(orderId, driverUserId, trx) {
  return db(trx)('orders as o')
    .join('restaurants as r', 'r.id', 'o.restaurant_id')
    .join('users as cu', 'cu.id', 'o.customer_user_id')
    .where({ 'o.id': orderId, 'o.driver_user_id': driverUserId })
    .select(
      'o.*',
      'r.name as restaurant_name', 'r.address_line1 as restaurant_address', 'r.phone as restaurant_phone',
      'cu.full_name as customer_full_name', 'cu.phone as customer_phone',
    )
    .first();
}

/* --------------------------------------------------------------- dispatch */

/**
 * Candidate drivers for an order, nearest first (BR-D3).
 *
 * Excludes anyone who already has an accepted delivery, and anyone who has
 * already been offered this order - without that exclusion the nearest driver
 * who declines is also the nearest on retry, forever (BR-D12).
 *
 * Haversine in SQL; drivers with no location sort last rather than being
 * excluded, so dispatch still works before any location is reported.
 */
export async function findCandidates(orderId, restaurant, limit, trx) {
  const conn = db(trx);
  const { rows } = await conn.raw(
    `
    SELECT d.user_id,
           CASE
             WHEN d.current_latitude IS NULL OR ?::numeric IS NULL THEN NULL
             ELSE 6371 * acos(LEAST(1, GREATEST(-1,
                    cos(radians(?::numeric)) * cos(radians(d.current_latitude)) *
                    cos(radians(d.current_longitude) - radians(?::numeric)) +
                    sin(radians(?::numeric)) * sin(radians(d.current_latitude))
                  )))
           END AS distance_km
    FROM driver_profiles d
    JOIN users u ON u.id = d.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
    WHERE d.status = 'ACTIVE'
      AND d.availability = 'AVAILABLE'
      AND NOT EXISTS (
        SELECT 1 FROM delivery_assignments a
        WHERE a.driver_user_id = d.user_id AND a.status = 'ACCEPTED')
      AND NOT EXISTS (
        SELECT 1 FROM delivery_assignments a
        WHERE a.driver_user_id = d.user_id AND a.order_id = ?)
    ORDER BY distance_km ASC NULLS LAST, d.last_assigned_at ASC NULLS FIRST
    LIMIT ?
    `,
    [
      restaurant?.latitude ?? null,
      restaurant?.latitude ?? null,
      restaurant?.longitude ?? null,
      restaurant?.latitude ?? null,
      orderId,
      limit,
    ],
  );
  return rows;
}

/** Orders waiting for a driver, for the dispatch job. */
export async function findOrdersNeedingDispatch(limit, trx) {
  const conn = db(trx);
  const { rows } = await conn.raw(
    `
    SELECT o.* FROM orders o
    WHERE o.dispatch_state = 'UNASSIGNED'
      AND o.status IN ('CONFIRMED','PREPARING','READY_FOR_PICKUP')
      AND NOT EXISTS (
        SELECT 1 FROM delivery_assignments a
        WHERE a.order_id = o.id AND a.status = 'OFFERED' AND a.expires_at > now())
    ORDER BY o.confirmed_at ASC
    LIMIT ?
    `,
    [limit],
  );
  return rows;
}

export async function findExpiredOffers(limit, trx) {
  return db(trx)('delivery_assignments')
    .where({ status: 'OFFERED' })
    .where('expires_at', '<=', knex.fn.now())
    .limit(limit);
}

export async function reviewsForDriver(driverUserId, trx) {
  return db(trx)('reviews as rv')
    .join('users as cu', 'cu.id', 'rv.customer_user_id')
    .where({ 'rv.driver_user_id': driverUserId, 'rv.status': 'PUBLISHED' })
    .whereNotNull('rv.driver_rating')
    .select('rv.id', 'rv.driver_rating', 'rv.comment', 'rv.created_at', 'cu.full_name')
    .orderBy('rv.created_at', 'desc')
    .limit(50);
}
