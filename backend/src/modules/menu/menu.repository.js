import { knex } from '../../shared/db/knex.js';

const db = (trx) => trx ?? knex;

/* --------------------------------------------------------------- categories */

export function listCategories(restaurantId, { activeOnly = false } = {}, trx) {
  const conn = db(trx);
  const q = conn('menu_categories as c')
    .where({ 'c.restaurant_id': restaurantId })
    .whereNull('c.deleted_at')
    .select(
      'c.*',
      conn.raw(
        `(SELECT count(*) FROM food_items fi
          WHERE fi.category_id = c.id AND fi.deleted_at IS NULL) AS item_count`,
      ),
    )
    .orderBy([{ column: 'c.display_order' }, { column: 'c.created_at' }]);
  if (activeOnly) q.where('c.is_active', true);
  return q;
}

export function findCategory(id, restaurantId, trx) {
  return db(trx)('menu_categories')
    .where({ id, restaurant_id: restaurantId })
    .whereNull('deleted_at')
    .first();
}

export async function insertCategory(restaurantId, data, trx) {
  const [row] = await db(trx)('menu_categories')
    .insert({
      restaurant_id: restaurantId,
      name: data.name,
      description: data.description ?? null,
      display_order: data.displayOrder ?? 0,
      is_active: data.isActive ?? true,
    })
    .returning('*');
  return row;
}

export async function updateCategory(id, restaurantId, patch, trx) {
  const [row] = await db(trx)('menu_categories')
    .where({ id, restaurant_id: restaurantId })
    .whereNull('deleted_at')
    .update(patch)
    .returning('*');
  return row;
}

export async function softDeleteCategory(id, restaurantId, trx) {
  const [row] = await db(trx)('menu_categories')
    .where({ id, restaurant_id: restaurantId })
    .whereNull('deleted_at')
    .update({ deleted_at: knex.fn.now() })
    .returning('*');
  return row;
}

export async function countItemsInCategory(categoryId, trx) {
  const row = await db(trx)('food_items')
    .where({ category_id: categoryId })
    .whereNull('deleted_at')
    .count()
    .first();
  return Number(row?.count ?? 0);
}

/* -------------------------------------------------------------------- items */

export function listItems(restaurantId, filters = {}, trx) {
  const q = db(trx)('food_items')
    .where({ restaurant_id: restaurantId })
    .whereNull('deleted_at')
    .orderBy([{ column: 'display_order' }, { column: 'name' }]);
  if (filters.categoryId) q.where({ category_id: filters.categoryId });
  if (filters.isAvailable !== undefined) q.where({ is_available: filters.isAvailable === 'true' });
  if (filters.q) q.whereILike('name', `%${filters.q}%`);
  return q;
}

export function findItem(id, restaurantId, trx) {
  return db(trx)('food_items')
    .where({ id, restaurant_id: restaurantId })
    .whereNull('deleted_at')
    .first();
}

export function findItemById(id, trx) {
  return db(trx)('food_items').where({ id }).whereNull('deleted_at').first();
}

/** One query for the whole collection: no N+1 on cart reads or checkout (NFR-6). */
export function findItemsByIds(ids, trx) {
  if (!ids.length) return Promise.resolve([]);
  return db(trx)('food_items').whereIn('id', ids);
}

export async function insertItem(restaurantId, data, trx) {
  const [row] = await db(trx)('food_items')
    .insert({
      restaurant_id: restaurantId,
      category_id: data.categoryId,
      name: data.name,
      description: data.description ?? null,
      price: data.price,
      image_url: data.imageUrl ?? null,
      is_available: data.isAvailable ?? true,
      display_order: data.displayOrder ?? 0,
    })
    .returning('*');
  return row;
}

export async function updateItem(id, restaurantId, patch, trx) {
  const [row] = await db(trx)('food_items')
    .where({ id, restaurant_id: restaurantId })
    .whereNull('deleted_at')
    .update(patch)
    .returning('*');
  return row;
}

export async function softDeleteItem(id, restaurantId, trx) {
  const [row] = await db(trx)('food_items')
    .where({ id, restaurant_id: restaurantId })
    .whereNull('deleted_at')
    .update({ deleted_at: knex.fn.now() })
    .returning('*');
  return row;
}

/**
 * Public menu in two queries: active categories, then all their items.
 * Assembled in memory rather than one query per category.
 */
export async function publicMenu(restaurantId, trx) {
  const categories = await db(trx)('menu_categories')
    .where({ restaurant_id: restaurantId, is_active: true })
    .whereNull('deleted_at')
    .orderBy([{ column: 'display_order' }, { column: 'created_at' }]);

  if (!categories.length) return { categories: [], items: [] };

  const items = await db(trx)('food_items')
    .whereIn(
      'category_id',
      categories.map((c) => c.id),
    )
    .whereNull('deleted_at')
    .orderBy([{ column: 'display_order' }, { column: 'name' }]);

  return { categories, items };
}
