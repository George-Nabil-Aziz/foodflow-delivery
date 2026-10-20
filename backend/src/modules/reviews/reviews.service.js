import { knex } from '../../shared/db/knex.js';
import { withTransaction } from '../../shared/db/transaction.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { toLimitOffset, paginationMeta } from '../../shared/http/pagination.js';
import { displayName } from '../../shared/mask.js';
import { REVIEW_EDIT_WINDOW_HOURS } from '../../shared/constants.js';
import * as restaurants from '../restaurants/index.js';
import * as delivery from '../delivery/index.js';

const db = (trx) => trx ?? knex;

/**
 * Recomputes aggregates FROM SOURCE rather than incrementing.
 *
 * An incremental average accumulates floating-point drift and has no correct
 * answer for an edit or a hide. Recomputing is O(reviews for one restaurant) on
 * an indexed column and is always right. One implementation, three callers:
 * create, edit, and admin hide/restore.
 */
export async function recomputeAggregates({ restaurantId, driverUserId }, trx) {
  if (restaurantId) await restaurants.applyRatingAggregate(restaurantId, trx);
  if (driverUserId) await delivery.applyRatingAggregate(driverUserId, trx);
}

const editableUntil = (createdAt) =>
  new Date(new Date(createdAt).getTime() + REVIEW_EDIT_WINDOW_HOURS * 3600 * 1000);

const toOwnReviewDto = (r) => ({
  id: r.id,
  orderId: r.order_id,
  restaurantId: r.restaurant_id,
  restaurantName: r.restaurant_name ?? null,
  restaurantRating: r.restaurant_rating,
  driverRating: r.driver_rating,
  comment: r.comment,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  editableUntil: editableUntil(r.created_at),
  isEditable: editableUntil(r.created_at) > new Date(),
});

/** Public payload: display name only. No email, phone, surname or user id. */
const toPublicReviewDto = (r) => ({
  id: r.id,
  restaurantRating: r.restaurant_rating,
  comment: r.comment,
  createdAt: r.created_at,
  customer: { displayName: displayName(r.full_name) },
});

/**
 * Creates a review. Only the order's own customer, only once, only when
 * DELIVERED. The aggregate is recomputed inside the same transaction, so a
 * partially applied review can never leave a wrong average behind.
 */
export async function createReview(customerUserId, input) {
  const { orderId, restaurantRating, driverRating, comment } = input;

  const created = await withTransaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).first();
    // Not theirs -> 404, indistinguishable from a nonexistent order.
    if (!order || order.customer_user_id !== customerUserId) {
      throw new NotFoundError('RESOURCE_NOT_FOUND');
    }
    if (order.status !== 'DELIVERED') {
      throw new ValidationError('ORDER_NOT_REVIEWABLE', {
        details: [{ field: 'orderId', issue: `This order is ${order.status} and cannot be reviewed.` }],
      });
    }
    if (driverRating != null && !order.driver_user_id) {
      throw new ValidationError('VALIDATION_ERROR', {
        details: [{ field: 'driverRating', issue: 'This order had no assigned driver to rate.' }],
      });
    }

    let row;
    try {
      [row] = await trx('reviews')
        .insert({
          order_id: orderId,
          customer_user_id: customerUserId,
          // Copied from the order and immutable, so the aggregate query stays a
          // single-table scan and cannot drift from the order.
          restaurant_id: order.restaurant_id,
          driver_user_id: order.driver_user_id,
          restaurant_rating: restaurantRating,
          driver_rating: driverRating ?? null,
          comment: comment ?? null,
        })
        .returning('*');
    } catch (err) {
      if (err?.code === '23505') throw new ConflictError('REVIEW_ALREADY_EXISTS');
      throw err;
    }

    await recomputeAggregates(
      { restaurantId: order.restaurant_id, driverUserId: driverRating != null ? order.driver_user_id : null },
      trx,
    );
    return row;
  });

  const restaurant = await restaurants.getRestaurantById(created.restaurant_id);
  return {
    ...toOwnReviewDto(created),
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      ratingAverage: restaurant.rating_average,
      ratingCount: restaurant.rating_count,
    },
  };
}

/** Editable by the author for 24 hours, then frozen (BR-V6). */
export async function updateReview(customerUserId, reviewId, input) {
  const updated = await withTransaction(async (trx) => {
    const review = await trx('reviews').where({ id: reviewId }).forUpdate().first();
    if (!review || review.customer_user_id !== customerUserId) {
      throw new NotFoundError('RESOURCE_NOT_FOUND');
    }
    if (editableUntil(review.created_at) <= new Date()) {
      throw new ConflictError('REVIEW_EDIT_WINDOW_CLOSED', {
        details: [{
          field: 'id',
          issue: 'The 24-hour window for editing this review has closed.',
          editableUntil: editableUntil(review.created_at),
        }],
      });
    }
    if (input.driverRating != null && !review.driver_user_id) {
      throw new ValidationError('VALIDATION_ERROR', {
        details: [{ field: 'driverRating', issue: 'This order had no assigned driver to rate.' }],
      });
    }

    const patch = {};
    if (input.restaurantRating !== undefined) patch.restaurant_rating = input.restaurantRating;
    if (input.driverRating !== undefined) patch.driver_rating = input.driverRating;
    if (input.comment !== undefined) patch.comment = input.comment;

    const [row] = await trx('reviews').where({ id: reviewId }).update(patch).returning('*');
    await recomputeAggregates(
      { restaurantId: row.restaurant_id, driverUserId: row.driver_user_id },
      trx,
    );
    return row;
  });
  return toOwnReviewDto(updated);
}

export async function listOwnReviews(customerUserId, query) {
  const { limit, offset, page } = toLimitOffset(query);
  const rows = await knex('reviews as rv')
    .join('restaurants as r', 'r.id', 'rv.restaurant_id')
    .where('rv.customer_user_id', customerUserId)
    .select('rv.*', 'r.name as restaurant_name', knex.raw('count(*) OVER() AS total_count'))
    .orderBy('rv.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  return {
    data: rows.map(toOwnReviewDto),
    meta: paginationMeta({ page, limit, total: rows[0]?.total_count ?? 0 }),
  };
}

export async function listForRestaurantPublic(restaurantId, query) {
  const { limit, offset, page } = toLimitOffset(query);
  const rows = await knex('reviews as rv')
    .join('users as cu', 'cu.id', 'rv.customer_user_id')
    .where({ 'rv.restaurant_id': restaurantId, 'rv.status': 'PUBLISHED' })
    .select('rv.*', 'cu.full_name', knex.raw('count(*) OVER() AS total_count'))
    .orderBy('rv.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  return {
    data: rows.map(toPublicReviewDto),
    meta: paginationMeta({ page, limit, total: rows[0]?.total_count ?? 0 }),
  };
}

/** Owner view of reviews received. Published only; still PII-safe. */
export async function listForOwner(restaurantId, query) {
  const { limit, offset, page } = toLimitOffset(query);
  const rows = await knex('reviews as rv')
    .join('users as cu', 'cu.id', 'rv.customer_user_id')
    .where({ 'rv.restaurant_id': restaurantId, 'rv.status': 'PUBLISHED' })
    .select('rv.*', 'cu.full_name', knex.raw('count(*) OVER() AS total_count'))
    .orderBy('rv.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  return {
    data: rows.map(toPublicReviewDto),
    meta: paginationMeta({ page, limit, total: rows[0]?.total_count ?? 0 }),
  };
}

/* ------------------------------------------------- admin moderation hooks */

export async function adminList(query) {
  const { limit, offset, page } = toLimitOffset(query);
  const q = knex('reviews as rv')
    .join('users as cu', 'cu.id', 'rv.customer_user_id')
    .join('restaurants as r', 'r.id', 'rv.restaurant_id')
    .join('orders as o', 'o.id', 'rv.order_id')
    .leftJoin('users as dr', 'dr.id', 'rv.driver_user_id')
    .leftJoin('users as hb', 'hb.id', 'rv.hidden_by_user_id')
    .select(
      'rv.*', 'cu.full_name', 'cu.email as customer_email', 'r.name as restaurant_name',
      'o.order_number', 'dr.full_name as driver_name', 'hb.full_name as hidden_by_name',
      knex.raw('count(*) OVER() AS total_count'),
    )
    .orderBy('rv.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (query.status) q.where('rv.status', query.status);
  if (query.restaurantId) q.where('rv.restaurant_id', query.restaurantId);
  // Search by restaurant, customer or what the review says.
  if (query.q) {
    q.where((b) => b.whereILike('r.name', `%${query.q}%`)
      .orWhereILike('cu.full_name', `%${query.q}%`)
      .orWhereILike('rv.comment', `%${query.q}%`));
  }

  const rows = await q;
  return {
    data: rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      restaurant: { id: r.restaurant_id, name: r.restaurant_name },
      // The admin sees the whole name and email; the list still shows the short form.
      customer: { displayName: displayName(r.full_name), fullName: r.full_name, email: r.customer_email },
      orderNumber: r.order_number,
      driver: r.driver_user_id ? { id: r.driver_user_id, fullName: r.driver_name } : null,
      hiddenBy: r.hidden_by_name ?? null,
      restaurantRating: r.restaurant_rating,
      driverRating: r.driver_rating,
      comment: r.comment,
      status: r.status,
      moderationReason: r.moderation_reason,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    meta: paginationMeta({ page, limit, total: rows[0]?.total_count ?? 0 }),
  };
}

/** Hiding and restoring both recompute, so the pair is exactly reversible. */
export async function setModerationStatus(
  { reviewId, status, adminUserId, reason },
  trx,
) {
  const run = async (t) => {
    const review = await t('reviews').where({ id: reviewId }).forUpdate().first();
    if (!review) throw new NotFoundError('RESOURCE_NOT_FOUND');

    const [row] = await t('reviews')
      .where({ id: reviewId })
      .update({
        status,
        hidden_by_user_id: status === 'HIDDEN' ? adminUserId : null,
        moderation_reason: status === 'HIDDEN' ? reason : null,
      })
      .returning('*');

    await recomputeAggregates(
      { restaurantId: row.restaurant_id, driverUserId: row.driver_user_id },
      t,
    );
    return row;
  };
  return trx ? run(trx) : withTransaction(run);
}

export function isOrderReviewed(orderId, trx) {
  return db(trx)('reviews').where({ order_id: orderId }).first('id');
}
