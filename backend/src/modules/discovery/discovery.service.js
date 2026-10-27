import { knex } from '../../shared/db/knex.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { toLimitOffset, paginationMeta } from '../../shared/http/pagination.js';
import { escapeLikePattern } from '../../shared/validation/common.js';
import { config } from '../../config/index.js';
import * as restaurants from '../restaurants/index.js';
import { toPublicRestaurantDto, dayOfWeek, minutesOfDay } from '../restaurants/index.js';
import * as menu from '../menu/index.js';
import * as users from '../users/index.js';
import * as favourites from '../favourites/index.js';

/**
 * The customer's delivery point for annotating restaurants (spec-18 FR-18.3):
 * only a signed-in customer has one, so anonymous browsing is unchanged.
 */
const browsingPoint = (user, addressId) =>
  (user?.role === 'CUSTOMER' ? users.getBrowsingAddress(user.id, addressId) : null);

/** Only a signed-in customer gets favourite flags; anyone else browses as before. */
const viewerOf = (user) => (user?.role === 'CUSTOMER' ? user.id : null);



/**
 * Discovery owns no tables. It composes the restaurants and menu modules, which
 * is why it is allowed to read across both.
 *
 * Sorting is allow-listed at the schema and mapped to a column here, so a sort
 * value never reaches SQL as text.
 */
const SORT_COLUMNS = {
  rating: 'r.rating_average',
  deliveryFee: 'r.delivery_fee',
  name: 'r.name',
  newest: 'r.created_at',
};

/**
 * The `openNow` filter expressed in SQL. This is the one place the orderability
 * rule exists twice - once here for filtering, once in orderability.js for the
 * flag - so a consistency test asserts the two agree.
 */
function applyOpenNow(query, now) {
  const today = dayOfWeek(now);
  const minutes = minutesOfDay(now);
  query
    .where('r.is_accepting_orders', true)
    .whereExists(function openToday() {
      this.select(1)
        .from('restaurant_hours as h')
        .whereRaw('h.restaurant_id = r.id')
        .andWhere('h.day_of_week', today)
        .andWhere('h.is_closed', false)
        .andWhereRaw(
          "(EXTRACT(HOUR FROM h.opens_at) * 60 + EXTRACT(MINUTE FROM h.opens_at)) <= ?",
          [minutes],
        )
        .andWhereRaw(
          "(EXTRACT(HOUR FROM h.closes_at) * 60 + EXTRACT(MINUTE FROM h.closes_at)) > ?",
          [minutes],
        );
    });
}

/**
 * Adds `isFavourite` to a list of DTOs for a signed-in customer, with one query
 * for the whole list. With no viewer the DTOs are returned untouched, so
 * anonymous responses keep exactly their old shape (BR-FV6).
 */
async function markRestaurants(dtos, viewerId) {
  if (!viewerId || !dtos.length) return dtos;
  const mine = await favourites.restaurantIdsAmong(viewerId, dtos.map((d) => d.id));
  return dtos.map((d) => ({ ...d, isFavourite: mine.has(d.id) }));
}

async function markItems(items, viewerId) {
  if (!viewerId || !items.length) return items;
  const mine = await favourites.itemIdsAmong(viewerId, items.map((i) => i.id));
  return items.map((i) => ({ ...i, isFavourite: mine.has(i.id) }));
}

export async function listRestaurants(query, user) {
  const { limit, offset, page } = toLimitOffset(query);
  const now = new Date();
  const point = await browsingPoint(user, query.addressId);

  const q = knex('restaurants as r')
    .whereNull('r.deleted_at')
    // Only ACTIVE restaurants are ever discoverable (BR-R2).
    .where('r.status', 'ACTIVE')
    .select('r.*', knex.raw('count(*) OVER() AS total_count'))
    .limit(limit)
    .offset(offset);

  if (query.cuisine) q.where('r.cuisine_type', query.cuisine);
  if (query.minRating) q.where('r.rating_average', '>=', query.minRating);
  if (query.q) q.whereRaw('r.name ILIKE ?', [`%${escapeLikePattern(query.q)}%`]);
  if (query.openNow) applyOpenNow(q, now);

  // Unrated restaurants sort LAST under a rating sort. A new restaurant is not
  // a bad restaurant, and treating a null aggregate as 0.00 would be both
  // unfair and factually wrong (BR-D5.6).
  if (query.sort === 'rating') {
    q.orderByRaw(`(r.rating_count = 0) ASC, r.rating_average ${query.order === 'asc' ? 'ASC' : 'DESC'}`);
  } else {
    q.orderBy(SORT_COLUMNS[query.sort] ?? SORT_COLUMNS.rating, query.order);
  }
  // Ties are broken by name, then id. Without a total order PostgreSQL may
  // return equal rows in a different order per query, so paging through
  // equally rated (or unrated) restaurants could repeat one and skip another.
  q.orderBy([{ column: 'r.name', order: 'asc' }, { column: 'r.id', order: 'asc' }]);

  const rows = await q;
  const data = await Promise.all(
    rows.map(async (r) => ({
      ...toPublicRestaurantDto(r, await restaurants.orderabilityFor(r, undefined, now)),
      ...restaurants.deliveryZoneFields(r, point),
    })),
  );
  return {
    data: await markRestaurants(data, viewerOf(user)),
    meta: paginationMeta({ page, limit, total: rows[0]?.total_count ?? 0 }),
  };
}

export async function getRestaurant(id, user, addressId) {
  const dto = await restaurants.getPublicRestaurant(id, await browsingPoint(user, addressId));
  const [marked] = await markRestaurants([dto], viewerOf(user));
  return marked;
}

export async function getMenu(id, user) {
  const viewerId = viewerOf(user);
  // A non-ACTIVE restaurant's menu is not browsable, even by direct id.
  const restaurant = await knex('restaurants')
    .where({ id, status: 'ACTIVE' })
    .whereNull('deleted_at')
    .first();
  if (!restaurant) throw new NotFoundError('RESOURCE_NOT_FOUND');
  const categories = await menu.getMenuForRestaurant(id, { publicOnly: true });
  if (!viewerId) return categories;
  const mine = await favourites.itemIdsAmong(viewerId, categories.flatMap((c) => c.items.map((i) => i.id)));
  return categories.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, isFavourite: mine.has(i.id) })) }));
}

/**
 * Combined search. One query per result group, never one per result.
 * Wildcards are escaped: unescaped, a search for "%" returns the entire table
 * and turns the search box into a full-table-scan button.
 */
export async function search({ q, limit = 10, addressId }, user) {
  const point = await browsingPoint(user, addressId);
  const viewerId = viewerOf(user);
  const pattern = `%${escapeLikePattern(q)}%`;
  const now = new Date();

  const restaurantRows = await knex('restaurants as r')
    .whereNull('r.deleted_at')
    .where('r.status', 'ACTIVE')
    .whereRaw('r.name ILIKE ?', [pattern])
    .select('r.*')
    .orderByRaw('(r.rating_count = 0) ASC, r.rating_average DESC, r.name ASC')
    .limit(limit);

  const itemRows = await knex('food_items as fi')
    .join('restaurants as r', 'r.id', 'fi.restaurant_id')
    .join('menu_categories as c', 'c.id', 'fi.category_id')
    .whereNull('fi.deleted_at')
    .whereNull('r.deleted_at')
    .where('r.status', 'ACTIVE')
    .where('c.is_active', true)
    .whereNull('c.deleted_at')
    .whereRaw('fi.name ILIKE ?', [pattern])
    .select(
      'fi.id', 'fi.name', 'fi.description', 'fi.price', 'fi.image_url', 'fi.is_available',
      'r.id as restaurant_id', 'r.name as restaurant_name', 'r.status as restaurant_status',
      'r.is_accepting_orders', 'r.delivery_fee',
    )
    .orderBy('fi.name')
    .limit(limit);

  const restaurantDtos = await Promise.all(
    restaurantRows.map(async (r) => ({
      ...toPublicRestaurantDto(r, await restaurants.orderabilityFor(r, undefined, now)),
      ...restaurants.deliveryZoneFields(r, point),
    })),
  );

  const itemDtos = await Promise.all(
    itemRows.map(async (i) => {
      const parent = await restaurants.getRestaurantById(i.restaurant_id);
      const orderability = await restaurants.orderabilityFor(parent, undefined, now);
      return {
        id: i.id,
        name: i.name,
        description: i.description,
        price: i.price,
        imageUrl: i.image_url,
        isAvailable: i.is_available,
        restaurant: {
          id: i.restaurant_id,
          name: i.restaurant_name,
          deliveryFee: i.delivery_fee,
          isOrderable: orderability.isOrderable,
        },
      };
    }),
  );

  return {
    restaurants: await markRestaurants(restaurantDtos, viewerId),
    foodItems: await markItems(itemDtos, viewerId),
  };
}

/** Only cuisines that actually have an active restaurant: offering a filter
 *  that returns nothing is a broken filter. */
export async function listCuisines() {
  const rows = await knex('restaurants')
    .whereNull('deleted_at')
    .where('status', 'ACTIVE')
    .select('cuisine_type')
    .count({ restaurant_count: '*' })
    .groupBy('cuisine_type')
    .orderBy('cuisine_type');
  return rows.map((r) => ({
    cuisineType: r.cuisine_type,
    restaurantCount: Number(r.restaurant_count),
  }));
}

export const platformTimezone = config.platformTimezone;
