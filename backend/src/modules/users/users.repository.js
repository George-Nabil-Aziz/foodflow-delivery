import { knex } from '../../shared/db/knex.js';

const db = (trx) => trx ?? knex;

export function findById(id, trx) {
  return db(trx)('users').where({ id }).whereNull('deleted_at').first();
}

export function findByEmail(email, trx) {
  return db(trx)('users').where({ email }).whereNull('deleted_at').first();
}

/** Admin only: deleted rows are invisible everywhere else. */
export function findByIdIncludingDeleted(id, trx) {
  const q = db(trx)('users').where({ id });
  return (trx ? q.forUpdate() : q).first();
}

export async function softDelete(id, trx) {
  const [row] = await db(trx)('users').where({ id }).update({ deleted_at: knex.fn.now() }).returning('*');
  return row;
}

export async function restore(id, trx) {
  const [row] = await db(trx)('users').where({ id }).update({ deleted_at: null }).returning('*');
  return row;
}

export async function updateProfile(id, patch, trx) {
  const [row] = await db(trx)('users').where({ id }).update(patch).returning('*');
  return row;
}

export async function setStatus(id, status, trx) {
  const [row] = await db(trx)('users').where({ id }).update({ status }).returning('*');
  return row;
}

/* ---------------------------------------------------------------- addresses */
// Ownership is applied in SQL, not after the fetch: a forgotten predicate is a
// missing row rather than a leaked one.

export function listAddresses(userId, trx) {
  return db(trx)('customer_addresses')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .orderBy([{ column: 'is_default', order: 'desc' }, { column: 'created_at', order: 'asc' }]);
}

export function findAddress(id, userId, trx) {
  return db(trx)('customer_addresses')
    .where({ id, user_id: userId })
    .whereNull('deleted_at')
    .first();
}

export async function insertAddress(userId, data, trx) {
  const [row] = await db(trx)('customer_addresses')
    .insert({ ...data, user_id: userId })
    .returning('*');
  return row;
}

export async function updateAddress(id, userId, patch, trx) {
  const [row] = await db(trx)('customer_addresses')
    .where({ id, user_id: userId })
    .whereNull('deleted_at')
    .update(patch)
    .returning('*');
  return row;
}

export async function softDeleteAddress(id, userId, trx) {
  const [row] = await db(trx)('customer_addresses')
    .where({ id, user_id: userId })
    .whereNull('deleted_at')
    .update({ deleted_at: knex.fn.now(), is_default: false })
    .returning('*');
  return row;
}

export async function clearDefault(userId, trx) {
  await db(trx)('customer_addresses')
    .where({ user_id: userId, is_default: true })
    .update({ is_default: false });
}

export async function countAddresses(userId, trx) {
  const row = await db(trx)('customer_addresses')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .count()
    .first();
  return Number(row?.count ?? 0);
}
