import { knex } from '../../shared/db/knex.js';

const db = (trx) => trx ?? knex;

/** Most recent favourites returned per kind (BR-FV7). A cap, not a page: the
 *  list is a shortlist, and an unbounded read would be a free denial of service. */
export const LIST_LIMIT = 200;

/** ON CONFLICT DO NOTHING is the idempotency (BR-FV2): the primary key is
 *  (user, target), so the second add finds the row and changes nothing. */
export function addRestaurant(userId, restaurantId, trx) {
  return db(trx)('favourite_restaurants')
    .insert({ user_id: userId, restaurant_id: restaurantId })
    .onConflict(['user_id', 'restaurant_id'])
    .ignore();
}

export function removeRestaurant(userId, restaurantId, trx) {
  return db(trx)('favourite_restaurants').where({ user_id: userId, restaurant_id: restaurantId }).del();
}

export function addItem(userId, foodItemId, trx) {
  return db(trx)('favourite_items')
    .insert({ user_id: userId, food_item_id: foodItemId })
    .onConflict(['user_id', 'food_item_id'])
    .ignore();
}

export function removeItem(userId, foodItemId, trx) {
  return db(trx)('favourite_items').where({ user_id: userId, food_item_id: foodItemId }).del();
}

/** Restaurant rows, newest favourite first. Soft-deleted and non-ACTIVE ones
 *  are included on purpose: the page shows them as unavailable (BR-FV5). */
export function listRestaurants(userId, trx) {
  return db(trx)('favourite_restaurants as f')
    .join('restaurants as r', 'r.id', 'f.restaurant_id')
    .where('f.user_id', userId)
    .select('r.*', 'f.created_at as favourited_at')
    .orderBy([{ column: 'f.created_at', order: 'desc' }, { column: 'r.id' }])
    .limit(LIST_LIMIT);
}

/** Item rows with the facts that decide availability: the item's own flag and
 *  deletion, its category, and its restaurant's status. */
export function listItems(userId, trx) {
  return db(trx)('favourite_items as f')
    .join('food_items as fi', 'fi.id', 'f.food_item_id')
    .join('restaurants as r', 'r.id', 'fi.restaurant_id')
    .leftJoin('menu_categories as c', 'c.id', 'fi.category_id')
    .where('f.user_id', userId)
    .select(
      'fi.id', 'fi.name', 'fi.description', 'fi.price', 'fi.image_url',
      'fi.is_available', 'fi.deleted_at',
      'c.is_active as category_active', 'c.deleted_at as category_deleted_at',
      'r.id as restaurant_id', 'r.name as restaurant_name', 'r.status as restaurant_status',
      'r.deleted_at as restaurant_deleted_at',
      'f.created_at as favourited_at',
    )
    .orderBy([{ column: 'f.created_at', order: 'desc' }, { column: 'fi.id' }])
    .limit(LIST_LIMIT);
}

/** Which of these ids this user has favourited: one query for a whole page. */
export async function restaurantIdsAmong(userId, ids, trx) {
  if (!ids.length) return new Set();
  const rows = await db(trx)('favourite_restaurants')
    .where({ user_id: userId }).whereIn('restaurant_id', ids).select('restaurant_id');
  return new Set(rows.map((r) => r.restaurant_id));
}

export async function itemIdsAmong(userId, ids, trx) {
  if (!ids.length) return new Set();
  const rows = await db(trx)('favourite_items')
    .where({ user_id: userId }).whereIn('food_item_id', ids).select('food_item_id');
  return new Set(rows.map((r) => r.food_item_id));
}
