import { NotFoundError } from '../../shared/errors/AppError.js';
import * as restaurants from '../restaurants/index.js';
import { toPublicRestaurantDto } from '../restaurants/index.js';
import * as menu from '../menu/index.js';
import * as repo from './favourites.repository.js';

/**
 * Favourites belong to the signed-in customer and every query is keyed by the
 * caller's id, taken from the token: there is no user id in any URL, so one
 * customer cannot read or change another's list (BR-FV1).
 */

export async function addRestaurant(userId, restaurantId) {
  // Only a restaurant a customer can see can be favourited; anything else is
  // indistinguishable from a missing id (BR-FV3). getPublicRestaurant throws.
  await restaurants.getPublicRestaurant(restaurantId);
  await repo.addRestaurant(userId, restaurantId);
  return { restaurantId, isFavourite: true };
}

export async function removeRestaurant(userId, restaurantId) {
  // Removing something that is not there is not an error (BR-FV2).
  await repo.removeRestaurant(userId, restaurantId);
}

export async function addItem(userId, foodItemId) {
  const [item] = await menu.getItemsByIds([foodItemId]);
  if (!item || item.deleted_at) throw new NotFoundError('RESOURCE_NOT_FOUND');
  // The item's restaurant must be browsable. An item that is merely
  // unavailable may be favourited: it will be back.
  await restaurants.getPublicRestaurant(item.restaurant_id);
  await repo.addItem(userId, foodItemId);
  return { foodItemId, isFavourite: true };
}

export async function removeItem(userId, foodItemId) {
  await repo.removeItem(userId, foodItemId);
}

/**
 * Both lists, newest first. Nothing is hidden: a restaurant that cannot take
 * orders right now, or an item that is unavailable or gone, is returned with
 * `isOrderable` / `isAvailable` false so the page can say so (BR-FV5).
 */
export async function listFavourites(userId) {
  const now = new Date();
  const [restaurantRows, itemRows] = await Promise.all([
    repo.listRestaurants(userId),
    repo.listItems(userId),
  ]);

  const restaurantDtos = await Promise.all(restaurantRows.map(async (r) => {
    // A soft-deleted restaurant is not orderable whatever its hours say.
    const orderability = r.deleted_at
      ? { isOrderable: false, isOpenNow: false, reason: 'NOT_ACTIVE' }
      : await restaurants.orderabilityFor(r, undefined, now);
    return {
      ...toPublicRestaurantDto(r, orderability),
      // Only an ACTIVE, undeleted restaurant has a page to open.
      isBrowsable: r.status === 'ACTIVE' && !r.deleted_at,
      isFavourite: true,
      favouritedAt: r.favourited_at,
    };
  }));

  const itemDtos = itemRows.map((i) => {
    const browsable = i.restaurant_status === 'ACTIVE' && !i.restaurant_deleted_at;
    const onMenu = !i.deleted_at && i.category_active === true && !i.category_deleted_at;
    return {
      id: i.id,
      name: i.name,
      description: i.description,
      price: i.price,
      imageUrl: i.image_url,
      // False when the item is switched off, deleted, in a hidden category, or
      // its restaurant is not on the platform: in every case it cannot be bought.
      isAvailable: Boolean(i.is_available && onMenu && browsable),
      isFavourite: true,
      favouritedAt: i.favourited_at,
      restaurant: { id: i.restaurant_id, name: i.restaurant_name, isBrowsable: browsable },
    };
  });

  return { restaurants: restaurantDtos, items: itemDtos };
}

/** Marks a page of discovery results for a signed-in customer (FR-16.6). */
export const restaurantIdsAmong = repo.restaurantIdsAmong;
export const itemIdsAmong = repo.itemIdsAmong;
