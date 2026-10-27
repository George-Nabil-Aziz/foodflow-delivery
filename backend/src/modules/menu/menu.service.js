import { withTransaction } from '../../shared/db/transaction.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import * as repo from './menu.repository.js';
import { toCategoryDto, toItemDto, toPublicMenuDto } from './menu.mapper.js';
import { groupDtosForItems } from './options.service.js';

/* --------------------------------------------------------------- categories */

export async function listCategories(restaurantId) {
  const rows = await repo.listCategories(restaurantId);
  return rows.map(toCategoryDto);
}

export async function createCategory(restaurantId, input) {
  const row = await repo.insertCategory(restaurantId, input);
  return toCategoryDto(row);
}

export async function updateCategory(restaurantId, id, input) {
  const patch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.displayOrder !== undefined) patch.display_order = input.displayOrder;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const row = await repo.updateCategory(id, restaurantId, patch);
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return toCategoryDto(row);
}

/**
 * Deleting a non-empty category is refused with the item count, so the UI can
 * say what is in the way rather than just "cannot delete" (BR-R8).
 */
export async function deleteCategory(restaurantId, id) {
  const category = await repo.findCategory(id, restaurantId);
  if (!category) throw new NotFoundError('RESOURCE_NOT_FOUND');

  const itemCount = await repo.countItemsInCategory(id);
  if (itemCount > 0) {
    throw new ConflictError('CATEGORY_NOT_EMPTY', {
      details: [{
        field: 'id',
        issue: `This category still contains ${itemCount} item(s). Move or delete them first.`,
        itemCount,
      }],
    });
  }
  await repo.softDeleteCategory(id, restaurantId);
}

/** Atomic: a partially applied reorder would leave a half-sorted menu. */
export async function reorderCategories(restaurantId, categories) {
  return withTransaction(async (trx) => {
    for (const entry of categories) {
      const updated = await repo.updateCategory(
        entry.id, restaurantId, { display_order: entry.displayOrder }, trx,
      );
      if (!updated) throw new NotFoundError('RESOURCE_NOT_FOUND');
    }
    const rows = await repo.listCategories(restaurantId, {}, trx);
    return rows.map(toCategoryDto);
  });
}

/* -------------------------------------------------------------------- items */

export async function listItems(restaurantId, filters) {
  const rows = await repo.listItems(restaurantId, filters);
  const groups = await groupDtosForItems(rows.map((r) => r.id));
  return rows.map((r) => toItemDto(r, groups.get(r.id)));
}

/**
 * A category must belong to the same restaurant (BR-R6). Deliberately 422
 * rather than 404: the caller owns the item operation, and naming the real
 * problem is more useful than hiding a category id they already supplied.
 */
async function assertCategoryOwned(restaurantId, categoryId, trx) {
  const category = await repo.findCategory(categoryId, restaurantId, trx);
  if (!category) {
    throw new ValidationError('VALIDATION_ERROR', {
      details: [{ field: 'categoryId', issue: 'This category does not belong to your restaurant.' }],
    });
  }
  return category;
}

export async function createItem(restaurantId, input) {
  await assertCategoryOwned(restaurantId, input.categoryId);
  const row = await repo.insertItem(restaurantId, input);
  return toItemDto(row);
}

export async function updateItem(restaurantId, id, input) {
  if (input.categoryId !== undefined) await assertCategoryOwned(restaurantId, input.categoryId);

  const patch = {};
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.price !== undefined) patch.price = input.price;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.isAvailable !== undefined) patch.is_available = input.isAvailable;
  if (input.displayOrder !== undefined) patch.display_order = input.displayOrder;

  const row = await repo.updateItem(id, restaurantId, patch);
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return toItemDto(row);
}

/**
 * Availability has its own endpoint because "we ran out" is the most frequent
 * action of a restaurant's day and must never require opening a form. It
 * touches only `is_available`.
 */
export async function setAvailability(restaurantId, id, isAvailable) {
  const row = await repo.updateItem(id, restaurantId, { is_available: isAvailable });
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return toItemDto(row);
}

export async function deleteItem(restaurantId, id) {
  const row = await repo.softDeleteItem(id, restaurantId);
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
}

/* ------------------------------------------------- cross-module interface */

export async function getMenuForRestaurant(restaurantId, { publicOnly = true } = {}, trx) {
  if (!publicOnly) {
    const [categories, items] = await Promise.all([
      repo.listCategories(restaurantId, {}, trx),
      repo.listItems(restaurantId, {}, trx),
    ]);
    return toPublicMenuDto(categories, items, await groupDtosForItems(items.map((i) => i.id), trx));
  }
  const { categories, items } = await repo.publicMenu(restaurantId, trx);
  return toPublicMenuDto(categories, items, await groupDtosForItems(items.map((i) => i.id), trx));
}

export const getItemsByIds = repo.findItemsByIds;

/**
 * The single authority on whether an item can be ordered, called by cart add
 * and by checkout. A soft-deleted item is 404; an unavailable one or one in an
 * inactive category is 422 (BR-C7).
 */
export async function assertItemOrderable(foodItemId, trx) {
  const item = await repo.findItemById(foodItemId, trx);
  if (!item) throw new NotFoundError('RESOURCE_NOT_FOUND');

  if (!item.is_available) {
    throw new ValidationError('ITEM_UNAVAILABLE', {
      details: [{ field: 'foodItemId', issue: `"${item.name}" is currently unavailable.` }],
    });
  }

  const category = await repo.findCategory(item.category_id, item.restaurant_id, trx);
  if (!category || !category.is_active) {
    throw new ValidationError('ITEM_UNAVAILABLE', {
      details: [{ field: 'foodItemId', issue: `"${item.name}" is not on the menu right now.` }],
    });
  }
  return item;
}

export const countAvailableItems = async (restaurantId, trx) => {
  const rows = await repo.listItems(restaurantId, { isAvailable: 'true' }, trx);
  return rows.length;
};
