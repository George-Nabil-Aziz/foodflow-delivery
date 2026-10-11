import { knex } from '../../shared/db/knex.js';

const db = (trx) => trx ?? knex;

export function findById(id, trx) {
  return db(trx)('restaurants').where({ id }).whereNull('deleted_at').first();
}

export function findActiveById(id, trx) {
  return db(trx)('restaurants').where({ id, status: 'ACTIVE' }).whereNull('deleted_at').first();
}

export function findByOwner(ownerUserId, trx) {
  return db(trx)('restaurants').where({ owner_user_id: ownerUserId }).whereNull('deleted_at').first();
}

export async function update(id, patch, trx) {
  const [row] = await db(trx)('restaurants').where({ id }).update(patch).returning('*');
  return row;
}

export function findHours(restaurantId, trx) {
  return db(trx)('restaurant_hours').where({ restaurant_id: restaurantId }).orderBy('day_of_week');
}

export function findHoursForDay(restaurantId, dayOfWeek, trx) {
  return db(trx)('restaurant_hours').where({ restaurant_id: restaurantId, day_of_week: dayOfWeek }).first();
}

/** Full-week replacement in one transaction: a partially applied week would
 *  leave the restaurant open at times it never chose. */
export async function replaceHours(restaurantId, entries, trx) {
  await db(trx)('restaurant_hours').where({ restaurant_id: restaurantId }).del();
  await db(trx)('restaurant_hours').insert(
    entries.map((e) => ({
      restaurant_id: restaurantId,
      day_of_week: e.dayOfWeek,
      is_closed: e.isClosed,
      opens_at: e.isClosed ? null : e.opensAt,
      closes_at: e.isClosed ? null : e.closesAt,
    })),
  );
  return findHours(restaurantId, trx);
}

export async function countAvailableItems(restaurantId, trx) {
  const row = await db(trx)('food_items')
    .where({ restaurant_id: restaurantId, is_available: true })
    .whereNull('deleted_at')
    .count()
    .first();
  return Number(row?.count ?? 0);
}

/** Today's restaurant statistics, scoped to one restaurant (FR-2.8). */
export async function ownerStats(restaurantId, trx) {
  const conn = db(trx);
  const [counts] = await conn.raw(
    `
    SELECT
      count(*) FILTER (WHERE placed_at >= date_trunc('day', now()))                              AS orders_today,
      count(*) FILTER (WHERE status IN ('PENDING','CONFIRMED','PREPARING','READY_FOR_PICKUP'))   AS active_orders,
      count(*) FILTER (WHERE status = 'PENDING')                                                 AS pending_orders,
      COALESCE(sum(total_amount) FILTER (
        WHERE status = 'DELIVERED' AND delivered_at >= date_trunc('day', now())), 0)             AS revenue_today
    FROM orders WHERE restaurant_id = ?
    `,
    [restaurantId],
  ).then((r) => r.rows);
  return {
    ordersToday: Number(counts.orders_today),
    activeOrders: Number(counts.active_orders),
    pendingOrders: Number(counts.pending_orders),
    revenueToday: counts.revenue_today,
  };
}

/* ------------------------------------------------------------------- admin */

export async function adminList({ status, q, limit, offset }, trx) {
  const conn = db(trx);
  const query = conn('restaurants as r')
    .leftJoin('users as u', 'u.id', 'r.owner_user_id')
    .whereNull('r.deleted_at')
    .select(
      'r.*',
      'u.full_name as owner_full_name',
      'u.email as owner_email',
      conn.raw(
        `(SELECT count(*) FROM food_items fi
          WHERE fi.restaurant_id = r.id AND fi.is_available AND fi.deleted_at IS NULL)
         AS available_item_count`,
      ),
      conn.raw('count(*) OVER() AS total_count'),
    )
    .orderBy('r.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  if (status) query.where('r.status', status);
  if (q) query.whereILike('r.name', `%${q}%`);

  const rows = await query;
  return { rows, total: rows[0]?.total_count ?? 0 };
}
