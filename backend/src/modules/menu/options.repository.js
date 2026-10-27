import { knex } from '../../shared/db/knex.js';

const db = (trx) => trx ?? knex;

const byOrder = [{ column: 'display_order' }, { column: 'created_at' }];

/**
 * Live groups (with their live options) for many items in two queries, so a
 * menu, a cart or a checkout never does one query per item (NFR-6).
 * Returns a Map of foodItemId -> groups[].
 */
export async function groupsForItems(itemIds, trx) {
  const result = new Map();
  if (!itemIds.length) return result;
  const conn = db(trx);
  const groups = await conn('item_option_groups')
    .whereIn('food_item_id', itemIds)
    .whereNull('deleted_at')
    .orderBy(byOrder);
  if (!groups.length) return result;
  const options = await conn('item_options')
    .whereIn('group_id', groups.map((g) => g.id))
    .whereNull('deleted_at')
    .orderBy(byOrder);
  for (const g of groups) {
    g.options = options.filter((o) => o.group_id === g.id);
    if (!result.has(g.food_item_id)) result.set(g.food_item_id, []);
    result.get(g.food_item_id).push(g);
  }
  return result;
}

/**
 * Options by id INCLUDING deleted ones, with their group's name: a cart line
 * must still be able to say what an option that has since been removed was.
 */
export function findOptionsByIds(ids, trx) {
  if (!ids.length) return Promise.resolve([]);
  return db(trx)('item_options as o')
    .join('item_option_groups as g', 'g.id', 'o.group_id')
    .whereIn('o.id', ids)
    .select('o.*', 'g.name as group_name', 'g.food_item_id');
}

/* -------------------------------------------------------- owner: groups */

/** A group, only if its item belongs to the restaurant. */
export function findGroup(groupId, restaurantId, trx) {
  return db(trx)('item_option_groups as g')
    .join('food_items as i', 'i.id', 'g.food_item_id')
    .where({ 'g.id': groupId, 'i.restaurant_id': restaurantId })
    .whereNull('g.deleted_at')
    .whereNull('i.deleted_at')
    .select('g.*')
    .first();
}

export function findOwnedItem(itemId, restaurantId, trx) {
  return db(trx)('food_items').where({ id: itemId, restaurant_id: restaurantId }).whereNull('deleted_at').first();
}

export async function insertGroup(itemId, data, trx) {
  const [row] = await db(trx)('item_option_groups')
    .insert({
      food_item_id: itemId,
      name: data.name,
      min_select: data.minSelect,
      max_select: data.maxSelect,
      display_order: data.displayOrder ?? 0,
    })
    .returning('*');
  return row;
}

export async function updateGroup(id, patch, trx) {
  const [row] = await db(trx)('item_option_groups')
    .where({ id }).whereNull('deleted_at').update(patch).returning('*');
  return row;
}

/** Soft delete; its options go with it so nothing orphaned can be priced. */
export async function softDeleteGroup(id, trx) {
  const conn = db(trx);
  await conn('item_options').where({ group_id: id }).whereNull('deleted_at').update({ deleted_at: knex.fn.now() });
  await conn('item_option_groups').where({ id }).whereNull('deleted_at').update({ deleted_at: knex.fn.now() });
}

/** Soft-deletes every group of an item, when the item itself is deleted. */
export async function softDeleteGroupsOfItem(itemId, trx) {
  const conn = db(trx);
  const ids = await conn('item_option_groups').where({ food_item_id: itemId }).whereNull('deleted_at').pluck('id');
  for (const id of ids) await softDeleteGroup(id, trx);
}

/* ------------------------------------------------------- owner: options */

export function findOption(optionId, restaurantId, trx) {
  return db(trx)('item_options as o')
    .join('item_option_groups as g', 'g.id', 'o.group_id')
    .join('food_items as i', 'i.id', 'g.food_item_id')
    .where({ 'o.id': optionId, 'i.restaurant_id': restaurantId })
    .whereNull('o.deleted_at')
    .whereNull('g.deleted_at')
    .whereNull('i.deleted_at')
    .select('o.*')
    .first();
}

export async function countLiveOptions(groupId, trx) {
  const row = await db(trx)('item_options').where({ group_id: groupId }).whereNull('deleted_at').count().first();
  return Number(row?.count ?? 0);
}

export async function insertOptions(groupId, options, trx) {
  if (!options.length) return [];
  return db(trx)('item_options')
    .insert(options.map((o, i) => ({
      group_id: groupId,
      name: o.name,
      price_delta: o.priceDelta,
      is_available: o.isAvailable ?? true,
      display_order: o.displayOrder ?? i,
    })))
    .returning('*');
}

export async function updateOption(id, patch, trx) {
  const [row] = await db(trx)('item_options')
    .where({ id }).whereNull('deleted_at').update(patch).returning('*');
  return row;
}

export async function softDeleteOption(id, trx) {
  await db(trx)('item_options').where({ id }).whereNull('deleted_at').update({ deleted_at: knex.fn.now() });
}

