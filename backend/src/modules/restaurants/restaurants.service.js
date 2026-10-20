import { withTransaction } from '../../shared/db/transaction.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { knex } from '../../shared/db/knex.js';
import * as repo from './restaurants.repository.js';
import { computeOrderability, dayOfWeek } from './orderability.js';
import { toOwnerRestaurantDto, toPublicRestaurantDto, toHoursDto } from './restaurants.mapper.js';

/** Resolves and caches orderability for a restaurant row. */
export async function orderabilityFor(restaurant, trx, now = new Date()) {
  if (!restaurant) return { isOrderable: false, isOpenNow: false, reason: 'NOT_ACTIVE' };
  const hours = await repo.findHoursForDay(restaurant.id, dayOfWeek(now), trx);
  return computeOrderability(restaurant, hours, now);
}

export async function getRestaurantById(id, trx) {
  return repo.findById(id, trx);
}

export async function getByOwner(ownerUserId, trx) {
  const row = await repo.findByOwner(ownerUserId, trx);
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return row;
}

/**
 * Throws unless the restaurant can take an order right now. Called by
 * add-to-cart and by checkout, so the UI and the API can never disagree.
 */
export async function assertOrderable(restaurantId, trx) {
  const restaurant = await repo.findById(restaurantId, trx);
  const result = await orderabilityFor(restaurant, trx);
  if (!result.isOrderable) {
    throw new ValidationError('RESTAURANT_UNAVAILABLE', {
      details: [{
        field: 'restaurantId',
        issue: `This restaurant is not accepting orders right now (${result.reason}).`,
        reason: result.reason,
      }],
    });
  }
  return restaurant;
}

export async function getOwnerProfile(ownerUserId) {
  const restaurant = await getByOwner(ownerUserId);
  const orderability = await orderabilityFor(restaurant);
  return toOwnerRestaurantDto(restaurant, orderability);
}

const PROFILE_COLUMNS = {
  name: 'name', description: 'description', cuisineType: 'cuisine_type',
  phone: 'phone', email: 'email', logoUrl: 'logo_url', coverImageUrl: 'cover_image_url',
  addressLine1: 'address_line1', city: 'city', district: 'district',
  latitude: 'latitude', longitude: 'longitude', deliveryFee: 'delivery_fee',
  minimumOrderAmount: 'minimum_order_amount', avgPreparationMinutes: 'avg_preparation_minutes',
};

/**
 * Note what is absent: status, rating_average and rating_count are not in the
 * map, so an owner cannot self-approve or inflate their own rating even if they
 * send those fields (BR-R12).
 */
export async function updateOwnerProfile(ownerUserId, input) {
  const restaurant = await getByOwner(ownerUserId);
  const patch = {};
  for (const [key, column] of Object.entries(PROFILE_COLUMNS)) {
    if (input[key] !== undefined) patch[column] = input[key];
  }
  if (Object.keys(patch).length === 0) {
    const orderability = await orderabilityFor(restaurant);
    return toOwnerRestaurantDto(restaurant, orderability);
  }
  const updated = await repo.update(restaurant.id, patch);
  const orderability = await orderabilityFor(updated);
  return toOwnerRestaurantDto(updated, orderability);
}

export async function getHours(ownerUserId) {
  const restaurant = await getByOwner(ownerUserId);
  return toHoursDto(await repo.findHours(restaurant.id));
}

export async function replaceHours(ownerUserId, entries) {
  const restaurant = await getByOwner(ownerUserId);
  return withTransaction(async (trx) => {
    const rows = await repo.replaceHours(restaurant.id, entries, trx);
    return toHoursDto(rows);
  });
}

export async function setAcceptingOrders(ownerUserId, isAcceptingOrders) {
  const restaurant = await getByOwner(ownerUserId);
  if (restaurant.status !== 'ACTIVE') {
    throw new ForbiddenError('RESTAURANT_NOT_APPROVED', {
      details: [{ field: 'status', issue: `Restaurant status is ${restaurant.status}.` }],
    });
  }
  const updated = await repo.update(restaurant.id, { is_accepting_orders: isAcceptingOrders });
  const orderability = await orderabilityFor(updated);
  return toOwnerRestaurantDto(updated, orderability);
}

export async function getOwnerStats(ownerUserId) {
  const restaurant = await getByOwner(ownerUserId);
  const stats = await repo.ownerStats(restaurant.id);
  return {
    ...stats,
    ratingAverage: restaurant.rating_average,
    ratingCount: restaurant.rating_count,
    isOrderable: (await orderabilityFor(restaurant)).isOrderable,
  };
}

/** Public detail. A non-ACTIVE restaurant is 404, not a redacted record. */
export async function getPublicRestaurant(id) {
  const restaurant = await repo.findActiveById(id);
  if (!restaurant) throw new NotFoundError('RESOURCE_NOT_FOUND');
  const orderability = await orderabilityFor(restaurant);
  const hours = await repo.findHours(id);
  return { ...toPublicRestaurantDto(restaurant, orderability), hours: toHoursDto(hours) };
}

/* --------------------------------------------- called by the admin module */

export async function setStatus(id, status, extra = {}, trx) {
  const restaurant = await repo.findById(id, trx);
  if (!restaurant) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return { previous: restaurant, updated: await repo.update(id, { status, ...extra }, trx) };
}

export const countAvailableItems = repo.countAvailableItems;
export const adminList = repo.adminList;
export const getRestaurantByIdIncludingDeleted = repo.findByIdIncludingDeleted;
export const softDeleteRestaurant = repo.softDelete;
export const restoreRestaurant = repo.restore;

/** Recomputes the rating aggregate from source. Called only by the reviews
 *  module's aggregator, which is the single writer of these two columns. */
export async function applyRatingAggregate(restaurantId, trx) {
  const conn = trx ?? knex;
  await conn.raw(
    `
    UPDATE restaurants r SET
      rating_average = COALESCE((
        SELECT ROUND(AVG(restaurant_rating)::numeric, 2) FROM reviews
        WHERE restaurant_id = r.id AND status = 'PUBLISHED'), 0),
      rating_count = (
        SELECT count(*) FROM reviews
        WHERE restaurant_id = r.id AND status = 'PUBLISHED')
    WHERE r.id = ?
    `,
    [restaurantId],
  );
}
