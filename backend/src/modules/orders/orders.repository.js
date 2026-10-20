import { knex } from '../../shared/db/knex.js';

const db = (trx) => trx ?? knex;

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
const CLOSED_STATUSES = ['DELIVERED', 'CANCELLED'];

export { ACTIVE_STATUSES, CLOSED_STATUSES };

export async function countActiveForCustomer(customerUserId, trx) {
  const [row] = await db(trx)('orders')
    .where({ customer_user_id: customerUserId })
    .whereIn('status', ACTIVE_STATUSES)
    .count();
  return Number(row?.count ?? 0);
}

export async function countActiveForRestaurant(restaurantId, trx) {
  const [row] = await db(trx)('orders')
    .where({ restaurant_id: restaurantId })
    .whereIn('status', ACTIVE_STATUSES)
    .count();
  return Number(row?.count ?? 0);
}

/**
 * Row-locking read used before every transition (BR-O9).
 *
 * Concurrent actors serialize here: the second transaction blocks, then
 * re-reads the new status and fails the state check. Without this, a customer
 * cancelling while a restaurant accepts could produce two applied transitions.
 */
export function findByIdForUpdate(id, trx) {
  return trx('orders').where({ id }).forUpdate().first();
}

export function findById(id, trx) {
  return db(trx)('orders').where({ id }).first();
}

/** Ownership predicates live in the query, so a miss is a missing row. */
export function findForCustomer(id, customerUserId, trx) {
  return db(trx)('orders').where({ id, customer_user_id: customerUserId }).first();
}

export function findForRestaurant(id, restaurantId, trx) {
  return db(trx)('orders').where({ id, restaurant_id: restaurantId }).first();
}

export function findForDriver(id, driverUserId, trx) {
  return db(trx)('orders').where({ id, driver_user_id: driverUserId }).first();
}

export async function insertOrder(data, trx) {
  const [row] = await trx('orders').insert(data).returning('*');
  return row;
}

/**
 * Inserts an order, regenerating its order number if that number is taken.
 *
 * `uq_orders_order_number` is a unique index and the number is six random
 * characters, so a collision is rare but not impossible — and an unhandled one
 * fails the whole checkout with a 500 for a customer who did nothing wrong.
 * Each attempt runs in its own savepoint, because in PostgreSQL a raised
 * unique violation aborts the enclosing transaction and would take the retry
 * with it.
 */
export async function insertOrderWithUniqueNumber(data, nextOrderNumber, trx, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await trx.transaction(async (sp) => {
        const [row] = await sp('orders')
          .insert({ ...data, order_number: attempt === 0 ? data.order_number : nextOrderNumber() })
          .returning('*');
        return row;
      });
    } catch (err) {
      const collided = err?.code === '23505' && String(err.constraint ?? '').includes('order_number');
      if (!collided || attempt === attempts - 1) throw err;
    }
  }
  /* c8 ignore next */
  throw new Error('unreachable: order number retries exhausted');
}

export async function insertItems(orderId, items, trx) {
  if (!items.length) return [];
  return trx('order_items')
    .insert(items.map((i) => ({ ...i, order_id: orderId })))
    .returning('*');
}

export function listItems(orderId, trx) {
  return db(trx)('order_items').where({ order_id: orderId }).orderBy('created_at');
}

export function listEvents(orderId, trx) {
  return db(trx)('order_status_events').where({ order_id: orderId }).orderBy('created_at');
}

export async function appendEvent(
  { orderId, from, to, actorUserId, actorRole, reason, note },
  trx,
) {
  const [row] = await db(trx)('order_status_events')
    .insert({
      order_id: orderId,
      from_status: from ?? null,
      to_status: to,
      actor_user_id: actorUserId ?? null,
      actor_role: actorRole,
      reason: reason ?? null,
      note: note ?? null,
    })
    .returning('*');
  return row;
}

export async function updateOrder(id, patch, trx) {
  const [row] = await db(trx)('orders').where({ id }).update(patch).returning('*');
  return row;
}

/* ------------------------------------------------------------------ lists */

const withRestaurantJoin = (conn) =>
  conn('orders as o')
    .leftJoin('restaurants as r', 'r.id', 'o.restaurant_id')
    .select(
      'o.*',
      'r.logo_url as restaurant_logo_url',
      'r.phone as restaurant_phone',
      conn.raw(
        `(SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count`,
      ),
      conn.raw(`EXISTS(SELECT 1 FROM reviews rv WHERE rv.order_id = o.id) AS has_review`),
      conn.raw('count(*) OVER() AS total_count'),
    );

export async function listForCustomer(customerUserId, { scope, limit, offset }, trx) {
  const conn = db(trx);
  const q = withRestaurantJoin(conn)
    .where('o.customer_user_id', customerUserId)
    .orderBy('o.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (scope === 'active') q.whereIn('o.status', ACTIVE_STATUSES);
  if (scope === 'past') q.whereIn('o.status', CLOSED_STATUSES);
  const rows = await q;
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function listForRestaurant(restaurantId, { scope, status, limit, offset }, trx) {
  const conn = db(trx);
  const q = conn('orders as o')
    .leftJoin('users as cu', 'cu.id', 'o.customer_user_id')
    .where('o.restaurant_id', restaurantId)
    .select(
      'o.*',
      'cu.full_name as customer_full_name',
      'cu.phone as customer_phone',
      conn.raw(`(SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count`),
      conn.raw('count(*) OVER() AS total_count'),
    )
    .orderBy('o.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (status) q.where('o.status', status);
  else if (scope === 'active') q.whereIn('o.status', ACTIVE_STATUSES);
  else if (scope === 'history') q.whereIn('o.status', CLOSED_STATUSES);
  const rows = await q;
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export function findDetailForRestaurant(id, restaurantId, trx) {
  const conn = db(trx);
  return conn('orders as o')
    .leftJoin('users as cu', 'cu.id', 'o.customer_user_id')
    .where({ 'o.id': id, 'o.restaurant_id': restaurantId })
    .select('o.*', 'cu.full_name as customer_full_name', 'cu.phone as customer_phone')
    .first();
}

export function findDetailForAdmin(id, trx) {
  const conn = db(trx);
  return conn('orders as o')
    .leftJoin('users as cu', 'cu.id', 'o.customer_user_id')
    .leftJoin('users as du', 'du.id', 'o.driver_user_id')
    .where('o.id', id)
    .select(
      'o.*',
      'cu.full_name as customer_full_name',
      'cu.email as customer_email',
      'cu.phone as customer_phone',
      'du.full_name as driver_full_name',
      'du.phone as driver_phone',
    )
    .first();
}

export function findDriverUser(driverUserId, trx) {
  if (!driverUserId) return Promise.resolve(null);
  return db(trx)('users').where({ id: driverUserId }).first('id', 'full_name', 'phone');
}

/* ------------------------------------------------------------- admin lists */

export async function adminList({ status, restaurantId, from, to, q: search, limit, offset }, trx) {
  const conn = db(trx);
  const q = conn('orders as o')
    .leftJoin('users as cu', 'cu.id', 'o.customer_user_id')
    .select(
      'o.*',
      'cu.full_name as customer_full_name',
      conn.raw('count(*) OVER() AS total_count'),
    )
    .orderBy('o.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (status) q.where('o.status', status);
  if (restaurantId) q.where('o.restaurant_id', restaurantId);
  if (from) q.where('o.created_at', '>=', from);
  if (to) q.where('o.created_at', '<=', to);
  // Search by what an admin has in hand: the order number, the restaurant or the customer.
  if (search) {
    q.where((b) => b.whereILike('o.order_number', `%${search}%`)
      .orWhereILike('o.restaurant_name_snapshot', `%${search}%`)
      .orWhereILike('cu.full_name', `%${search}%`));
  }
  const rows = await q;
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/** Stuck orders for the admin operations view (FR-9.9). */
export async function listStuck({ unassignedMinutes, pendingMinutes, deliveringMinutes }, trx) {
  const conn = db(trx);
  const { rows } = await conn.raw(
    `
    SELECT o.*, 'UNASSIGNED' AS stuck_reason FROM orders o
      WHERE o.dispatch_state = 'UNASSIGNED'
        AND o.status IN ('CONFIRMED','PREPARING','READY_FOR_PICKUP')
        AND o.confirmed_at < now() - (? || ' minutes')::interval
    UNION ALL
    SELECT o.*, 'UNANSWERED' AS stuck_reason FROM orders o
      WHERE o.status = 'PENDING' AND o.placed_at < now() - (? || ' minutes')::interval
    UNION ALL
    SELECT o.*, 'DELIVERING_TOO_LONG' AS stuck_reason FROM orders o
      WHERE o.status = 'OUT_FOR_DELIVERY' AND o.picked_up_at < now() - (? || ' minutes')::interval
    ORDER BY placed_at ASC
    `,
    [unassignedMinutes, pendingMinutes, deliveringMinutes],
  );
  return rows;
}

export async function listUnassigned({ minutes }, trx) {
  const conn = db(trx);
  const { rows } = await conn.raw(
    `
    SELECT o.*, r.name AS restaurant_name
    FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
    WHERE o.dispatch_state = 'UNASSIGNED'
      AND o.status IN ('CONFIRMED','PREPARING','READY_FOR_PICKUP')
      AND o.confirmed_at < now() - (? || ' minutes')::interval
    ORDER BY o.confirmed_at ASC
    `,
    [minutes],
  );
  return rows;
}

export function hasReview(orderId, trx) {
  return db(trx)('reviews').where({ order_id: orderId }).first('id');
}
