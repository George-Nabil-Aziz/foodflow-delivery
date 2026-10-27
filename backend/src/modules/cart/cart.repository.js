import { knex } from '../../shared/db/knex.js';

const db = (trx) => trx ?? knex;

export function findActiveCart(customerUserId, trx) {
  return db(trx)('carts').where({ customer_user_id: customerUserId, status: 'ACTIVE' }).first();
}

/** Row-locked read used by add and by checkout, so concurrent mutations of one
 *  cart serialize rather than interleave. */
export function findActiveCartForUpdate(customerUserId, trx) {
  return trx('carts')
    .where({ customer_user_id: customerUserId, status: 'ACTIVE' })
    .forUpdate()
    .first();
}

/**
 * Creates the single ACTIVE cart, tolerating a concurrent creator.
 *
 * ON CONFLICT DO NOTHING rather than catch-and-retry: inside a transaction a
 * raised unique violation aborts the whole transaction, so the recovery read
 * would itself fail with `current transaction is aborted`. Letting the
 * conflict resolve silently keeps the transaction usable, and the caller
 * re-reads the row the winner inserted.
 *
 * Returns undefined when another transaction won the race.
 */
export async function createCart(customerUserId, trx) {
  const { rows } = await db(trx).raw(
    `
    INSERT INTO carts (customer_user_id, status)
    VALUES (?, 'ACTIVE')
    ON CONFLICT (customer_user_id) WHERE status = 'ACTIVE' DO NOTHING
    RETURNING *
    `,
    [customerUserId],
  );
  return rows[0];
}

export function listLines(cartId, trx) {
  return db(trx)('cart_items').where({ cart_id: cartId }).orderBy('created_at');
}

export function findLine(lineId, cartId, trx) {
  return db(trx)('cart_items').where({ id: lineId, cart_id: cartId }).first();
}

/**
 * Upsert that increments an existing line and caps at 20 (BR-C5, BR-C6).
 *
 * `LEAST(... , 20)` caps rather than failing: a customer clicking add on their
 * twentieth unit should get twenty, not an error about a limit nobody showed
 * them.
 */
export async function upsertLine({ cartId, foodItemId, quantity, notes, price }, trx) {
  const [row] = await trx.raw(
    `
    INSERT INTO cart_items (cart_id, food_item_id, quantity, notes, price_seen_at_add)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (cart_id, food_item_id) DO UPDATE
      SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 20),
          notes    = COALESCE(EXCLUDED.notes, cart_items.notes),
          updated_at = now()
    RETURNING *
    `,
    [cartId, foodItemId, quantity, notes ?? null, price],
  ).then((r) => r.rows);
  return row;
}

export async function updateLineQuantity(lineId, cartId, quantity, trx) {
  const [row] = await db(trx)('cart_items')
    .where({ id: lineId, cart_id: cartId })
    .update({ quantity })
    .returning('*');
  return row;
}

export async function deleteLine(lineId, cartId, trx) {
  return db(trx)('cart_items').where({ id: lineId, cart_id: cartId }).del();
}

export async function clearLines(cartId, trx) {
  return db(trx)('cart_items').where({ cart_id: cartId }).del();
}

export async function setRestaurant(cartId, restaurantId, trx) {
  const [row] = await db(trx)('carts')
    .where({ id: cartId })
    .update({ restaurant_id: restaurantId })
    .returning('*');
  return row;
}

export async function markConverted(cartId, trx) {
  const [row] = await db(trx)('carts')
    .where({ id: cartId })
    .update({ status: 'CONVERTED' })
    .returning('*');
  return row;
}

/** Sets or clears (null) the discount code applied to the cart. */
export async function setDiscount(cartId, discountCodeId, trx) {
  const [row] = await db(trx)('carts')
    .where({ id: cartId })
    .update({ discount_code_id: discountCodeId })
    .returning('*');
  return row;
}

export async function countLines(cartId, trx) {
  const row = await db(trx)('cart_items').where({ cart_id: cartId }).count().first();
  return Number(row?.count ?? 0);
}
