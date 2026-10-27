import { knex } from '../db/knex.js';

/**
 * Resolves who a notification goes to, in one place. A caller names a user or
 * a role-target ("the owner of order X"); this returns that user's contact
 * details. Only active, non-deleted users are ever contacted.
 *
 * Reads users/orders/restaurants directly rather than through the module
 * indexes: this is shared infrastructure that orders and delivery already
 * depend on, so going through them would be circular.
 */

/**
 * Egyptian mobile (the format the app validates, see validation/common.js) to
 * E.164. Already-international numbers are kept if they look plausible.
 * Returns null when it is not a usable number.
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[\s()-]/g, '');
  if (/^0[1]\d{9}$/.test(s)) return `+20${s.slice(1)}`;
  if (/^\+201[0125]\d{8}$/.test(s)) return s;
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  return null;
}

/** The address a channel delivers to, or null when the user has none. */
export function addressFor(user, channel) {
  if (channel === 'EMAIL') return user.email || null;
  if (channel === 'SMS') return normalizePhone(user.phone);
  return null;
}

/** "sara@example.com" -> "s***@example.com" for logs. */
export function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = String(email).split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

const toRecipient = (row) =>
  row && {
    userId: row.id,
    email: row.email,
    phone: row.phone,
    fullName: row.full_name,
    // The user's own choice; templates fall back to English for anything else.
    lang: row.preferred_language ?? 'en',
  };

/** An active, non-deleted user by id, or null. */
export async function loadUser(userId, db = knex) {
  if (!userId) return null;
  const row = await db('users')
    .where({ id: userId, status: 'ACTIVE' })
    .whereNull('deleted_at')
    .first('id', 'email', 'phone', 'full_name', 'preferred_language');
  return toRecipient(row) ?? null;
}

const ORDER_USER_COLUMN = {
  ORDER_CUSTOMER: (q) => q.select('o.customer_user_id as user_id'),
  ORDER_RESTAURANT_OWNER: (q) =>
    q.join('restaurants as r', 'r.id', 'o.restaurant_id').select('r.owner_user_id as user_id'),
};

/**
 * @param {{ userId?: string, kind?: string, orderId?: string }} target
 *   `userId` wins; otherwise `kind` is ORDER_CUSTOMER or
 *   ORDER_RESTAURANT_OWNER and `orderId` names the order.
 * @returns {Promise<object|null>} recipient, or null if nobody to contact.
 */
export async function resolveRecipient({ userId, kind, orderId }, db = knex) {
  if (userId) return loadUser(userId, db);
  const pick = ORDER_USER_COLUMN[kind];
  if (!pick || !orderId) return null;
  const row = await pick(db('orders as o').where('o.id', orderId)).first();
  return loadUser(row?.user_id, db);
}
