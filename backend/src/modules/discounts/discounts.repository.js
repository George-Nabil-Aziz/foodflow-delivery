import { knex } from '../../shared/db/knex.js';

const db = (trx) => trx ?? knex;

/**
 * The lifecycle state of a code, derived rather than stored so it can never
 * drift from the dates. Order matters: an inactive code is INACTIVE even if
 * its window has also passed.
 */
const STATE_SQL = `
  CASE
    WHEN NOT dc.is_active THEN 'INACTIVE'
    WHEN dc.ends_at IS NOT NULL AND dc.ends_at <= now() THEN 'EXPIRED'
    WHEN dc.starts_at IS NOT NULL AND dc.starts_at > now() THEN 'SCHEDULED'
    ELSE 'ACTIVE'
  END
`;

/**
 * Usage counts only orders that are not cancelled, so cancelling an order gives
 * the use back (BR-DC7) without any code in the cancellation path.
 */
const USAGE_JOIN = `
  LEFT JOIN (
    SELECT od.discount_code_id,
           count(*) AS usage_count,
           COALESCE(sum(od.amount), 0) AS total_discount
    FROM order_discounts od
    JOIN orders o ON o.id = od.order_id AND o.status <> 'CANCELLED'
    GROUP BY od.discount_code_id
  ) u ON u.discount_code_id = dc.id
`;

export function findByCode(code, trx, { forUpdate = false } = {}) {
  const q = db(trx)('discount_codes').where({ code }).whereNull('deleted_at');
  return (forUpdate ? q.forUpdate() : q).first();
}

export function findById(id, trx) {
  return db(trx)('discount_codes').where({ id }).first();
}

export async function countUsage(codeId, trx) {
  const row = await db(trx)('order_discounts as od')
    .join('orders as o', 'o.id', 'od.order_id')
    .where('od.discount_code_id', codeId)
    .whereNot('o.status', 'CANCELLED')
    .count()
    .first();
  return Number(row?.count ?? 0);
}

export async function countUsageByCustomer(codeId, customerUserId, trx) {
  const row = await db(trx)('order_discounts as od')
    .join('orders as o', 'o.id', 'od.order_id')
    .where('od.discount_code_id', codeId)
    .where('o.customer_user_id', customerUserId)
    .whereNot('o.status', 'CANCELLED')
    .count()
    .first();
  return Number(row?.count ?? 0);
}

export async function insertRedemption(data, trx) {
  const [row] = await trx('order_discounts').insert(data).returning('*');
  return row;
}

export function findRedemption(orderId, trx) {
  return db(trx)('order_discounts').where({ order_id: orderId }).first();
}

export function insert(data, trx) {
  return trx('discount_codes').insert(data).returning('*').then(([row]) => row);
}

export function update(id, patch, trx) {
  return trx('discount_codes').where({ id }).update(patch).returning('*').then(([row]) => row);
}

/** Admin list with each code's derived state and its usage statistics. */
export async function list({ q, status, limit, offset }, trx) {
  const query = db(trx)('discount_codes as dc')
    .leftJoin('restaurants as r', 'r.id', 'dc.restaurant_id')
    .joinRaw(USAGE_JOIN)
    .whereNull('dc.deleted_at')
    .select(
      'dc.*',
      'r.name as restaurant_name',
      knex.raw(`${STATE_SQL} AS state`),
      knex.raw('COALESCE(u.usage_count, 0) AS usage_count'),
      knex.raw('COALESCE(u.total_discount, 0) AS total_discount'),
      knex.raw('count(*) OVER() AS total_count'),
    )
    .orderBy('dc.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (status) query.whereRaw(`${STATE_SQL} = ?`, [status]);
  if (q) {
    query.where((b) => b.whereILike('dc.code', `%${q}%`).orWhereILike('dc.description', `%${q}%`));
  }
  return query;
}

export async function findWithStats(id, trx) {
  const row = await db(trx)('discount_codes as dc')
    .leftJoin('restaurants as r', 'r.id', 'dc.restaurant_id')
    .joinRaw(USAGE_JOIN)
    .where('dc.id', id)
    .whereNull('dc.deleted_at')
    .select(
      'dc.*',
      'r.name as restaurant_name',
      knex.raw(`${STATE_SQL} AS state`),
      knex.raw('COALESCE(u.usage_count, 0) AS usage_count'),
      knex.raw('COALESCE(u.total_discount, 0) AS total_discount'),
    )
    .first();
  return row;
}
