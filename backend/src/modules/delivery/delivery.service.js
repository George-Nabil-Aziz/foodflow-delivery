import { config } from '../../config/index.js';
import { withTransaction } from '../../shared/db/transaction.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { toLimitOffset, paginationMeta } from '../../shared/http/pagination.js';
import { maskPhone, firstName, displayName } from '../../shared/mask.js';
import { logger } from '../../shared/logger.js';
import { notify } from '../../shared/notifications.js';
import * as repo from './delivery.repository.js';
import * as restaurants from '../restaurants/index.js';

/* ---------------------------------------------------------------- profile */

export async function getProfile(userId) {
  const profile = await repo.findProfile(userId);
  if (!profile) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return toProfileDto(profile);
}

const toProfileDto = (p) => ({
  id: p.id,
  status: p.status,
  availability: p.availability,
  vehicleType: p.vehicle_type,
  vehiclePlate: p.vehicle_plate,
  ratingAverage: p.rating_average,
  ratingCount: p.rating_count,
  locationUpdatedAt: p.location_updated_at,
});

/** A driver must be ACTIVE, not merely authenticated with the DRIVER role. */
export async function assertActiveDriver(userId) {
  const profile = await repo.findProfile(userId);
  if (!profile) throw new NotFoundError('RESOURCE_NOT_FOUND');
  if (profile.status !== 'ACTIVE') {
    throw new ForbiddenError('ACCOUNT_SUSPENDED', {
      details: [{ field: 'status', issue: `Your driver account is ${profile.status}.`, status: profile.status }],
    });
  }
  return profile;
}

export async function updateProfile(userId, input) {
  const current = await repo.findProfile(userId);
  if (!current) throw new NotFoundError('RESOURCE_NOT_FOUND');

  const patch = {};
  if (input.vehicleType !== undefined) patch.vehicle_type = input.vehicleType;
  if (input.vehiclePlate !== undefined) patch.vehicle_plate = input.vehiclePlate;

  // A bicycle has no plate, so none is kept for one; every motor vehicle needs one.
  const vehicleType = patch.vehicle_type ?? current.vehicle_type;
  if (vehicleType === 'BICYCLE') {
    patch.vehicle_plate = null;
  } else if (!(patch.vehicle_plate ?? current.vehicle_plate)) {
    throw new ValidationError('VALIDATION_ERROR', {
      details: [{ field: 'vehiclePlate', issue: 'A plate number is required for this vehicle.' }],
    });
  }
  const row = await repo.updateProfile(userId, patch);
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return toProfileDto(row);
}

/**
 * Availability toggle. Going OFFLINE with an accepted delivery is refused: an
 * order already in someone's car is not made safer by letting them disappear
 * (BR-D9). ON_DELIVERY is rejected by the schema - it is system-set.
 */
export async function setAvailability(userId, availability) {
  return withTransaction(async (trx) => {
    const profile = await repo.findProfileForUpdate(userId, trx);
    if (!profile) throw new NotFoundError('RESOURCE_NOT_FOUND');

    if (availability === 'OFFLINE') {
      const active = await repo.findActiveAssignment(userId, trx);
      if (active) {
        throw new ConflictError('DRIVER_HAS_ACTIVE_DELIVERY', {
          details: [{ field: 'availability', issue: 'Finish your active delivery before going offline.', orderId: active.order_id }],
        });
      }
    }
    const row = await repo.updateProfile(userId, { availability }, trx);
    return toProfileDto(row);
  });
}

export async function updateLocation(userId, { latitude, longitude }) {
  const row = await repo.updateProfile(userId, {
    current_latitude: latitude,
    current_longitude: longitude,
    location_updated_at: new Date(),
  });
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return toProfileDto(row);
}

/* ----------------------------------------------------------------- offers */

/**
 * Offer payload shows distance and drop-off DISTRICT only. The full address
 * appears after acceptance: a driver deciding whether to take a job needs the
 * distance, not a stranger's street number (BR-D11).
 */
export async function listOffers(driverUserId) {
  const rows = await repo.listOffersForDriver(driverUserId);
  const now = Date.now();
  return rows.map((r) => {
    const address = r.delivery_address_snapshot ?? {};
    return {
      id: r.id,
      expiresAt: r.expires_at,
      secondsRemaining: Math.max(0, Math.round((new Date(r.expires_at).getTime() - now) / 1000)),
      distanceKm: r.distance_km,
      order: {
        id: r.order_id,
        orderNumber: r.order_number,
        status: r.order_status,
        itemCount: Number(r.item_count ?? 0),
        totalAmount: r.total_amount,
        restaurant: { name: r.restaurant_name, addressLine1: r.restaurant_address, phone: r.restaurant_phone },
        dropoff: { district: address.district ?? null, city: address.city ?? null },
      },
    };
  });
}

/**
 * Accept an offer. The concurrency-critical path.
 *
 * Two drivers accepting the same offer is arbitrated by the partial unique
 * indexes, not by a pre-check: the loser's UPDATE violates
 * uq_assignments_order_accepted and the 23505 is translated to a 409.
 */
export async function acceptOffer(driverUserId, assignmentId) {
  const { orderId } = await withTransaction(async (trx) => {
    await assertActiveDriver(driverUserId);

    const assignment = await repo.findAssignmentForUpdate(assignmentId, driverUserId, trx);
    if (!assignment) throw new NotFoundError('RESOURCE_NOT_FOUND');

    if (assignment.status !== 'OFFERED') {
      throw new ConflictError('OFFER_NO_LONGER_AVAILABLE');
    }
    if (new Date(assignment.expires_at) <= new Date()) {
      await repo.updateAssignment(assignmentId, { status: 'EXPIRED' }, trx);
      throw new ConflictError('OFFER_NO_LONGER_AVAILABLE');
    }

    const existing = await repo.findActiveAssignment(driverUserId, trx);
    if (existing) throw new ConflictError('DRIVER_HAS_ACTIVE_DELIVERY');

    await repo.updateAssignment(
      assignmentId, { status: 'ACCEPTED', responded_at: trx.fn.now() }, trx,
    );

    const orders = await import('../orders/index.js');
    await orders.assignDriver(assignment.order_id, driverUserId, trx);

    await repo.updateProfile(
      driverUserId, { availability: 'ON_DELIVERY', last_assigned_at: trx.fn.now() }, trx,
    );

    return { orderId: assignment.order_id };
  });

  return getDelivery(driverUserId, orderId);
}

export async function declineOffer(driverUserId, assignmentId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const assignment = await repo.findAssignmentForUpdate(assignmentId, driverUserId, trx);
    if (!assignment) throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (assignment.status !== 'OFFERED') throw new ConflictError('OFFER_NO_LONGER_AVAILABLE');

    await repo.updateAssignment(
      assignmentId,
      { status: 'DECLINED', responded_at: trx.fn.now(), decline_reason: reason ?? null },
      trx,
    );
    // Free the order for the next dispatch tick.
    const orders = await import('../orders/index.js');
    await orders.setDispatchState(assignment.order_id, 'UNASSIGNED', trx);
  });
}

/* ------------------------------------------------------------- deliveries */

export async function listDeliveries(driverUserId, query) {
  const { limit, offset, page } = toLimitOffset(query);
  const rows = await repo.listDeliveriesForDriver(driverUserId, { scope: query.scope, limit, offset });
  const total = rows[0]?.total_count ?? 0;
  return {
    data: rows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      status: r.status,
      totalAmount: r.total_amount,
      restaurantName: r.restaurant_name,
      district: (r.delivery_address_snapshot ?? {}).district ?? null,
      pickedUpAt: r.picked_up_at,
      deliveredAt: r.delivered_at,
      placedAt: r.placed_at,
    })),
    meta: paginationMeta({ page, limit, total }),
  };
}

/** Accepted delivery: full address, customer FIRST name and MASKED phone.
 *  Never the customer's email or their other orders (security 9). */
export async function getDelivery(driverUserId, orderId) {
  const row = await repo.findDeliveryDetail(orderId, driverUserId);
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');

  const orders = await import('../orders/index.js');
  const items = await orders.listOrderItems(orderId);

  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    totalAmount: row.total_amount,
    paymentMethod: row.payment_method,
    customerNote: row.customer_note,
    pickup: {
      restaurantName: row.restaurant_name,
      addressLine1: row.restaurant_address,
      phone: row.restaurant_phone,
    },
    dropoff: {
      ...(row.delivery_address_snapshot ?? {}),
      customerFirstName: firstName(row.customer_full_name),
      customerPhone: maskPhone(row.customer_phone),
    },
    items: items.map((i) => ({
      name: i.item_name_snapshot,
      quantity: i.quantity,
      notes: i.notes,
    })),
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
  };
}

export async function listDriverReviews(driverUserId) {
  const rows = await repo.reviewsForDriver(driverUserId);
  return rows.map((r) => ({
    id: r.id,
    rating: r.driver_rating,
    comment: r.comment,
    createdAt: r.created_at,
    customer: { displayName: displayName(r.full_name) },
  }));
}

/* --------------------------------------------------------------- dispatch */

/** Marks an order as needing a driver. The dispatch job picks it up. */
export async function requestDispatch(orderId, trx) {
  const orders = await import('../orders/index.js');
  await orders.setDispatchState(orderId, 'UNASSIGNED', trx);
}

/**
 * Creates the next offer for one order. Returns true when an offer was made.
 *
 * With no eligible candidate the order is left exactly as it is: never
 * cancelled, never altered. Cancelling a cooked order over a supply problem the
 * customer cannot influence is the wrong answer (FR-7.4).
 */
export async function dispatchOrder(order, trx) {
  const restaurant = await restaurants.getRestaurantById(order.restaurant_id, trx);
  const candidates = await repo.findCandidates(order.id, restaurant, 1, trx);
  if (!candidates.length) return false;

  const candidate = candidates[0];
  const expiresAt = new Date(Date.now() + config.deliveryOfferTtlSeconds * 1000);

  try {
    await repo.insertOffer(
      {
        orderId: order.id,
        driverUserId: candidate.user_id,
        expiresAt,
        distanceKm: candidate.distance_km != null ? Number(candidate.distance_km).toFixed(2) : null,
      },
      trx,
    );
  } catch (err) {
    // Another tick created an offer first; nothing to do.
    if (err?.code === '23505') return false;
    throw err;
  }

  const orders = await import('../orders/index.js');
  await orders.setDispatchState(order.id, 'OFFERED', trx);

  await notify({
    userId: candidate.user_id,
    template: 'NEW_OFFER',
    payload: { orderId: order.id, orderNumber: order.order_number },
  });
  return true;
}

export async function expireOffer(assignment, trx) {
  await repo.updateAssignment(assignment.id, { status: 'EXPIRED' }, trx);
  const orders = await import('../orders/index.js');
  await orders.setDispatchState(assignment.order_id, 'UNASSIGNED', trx);
  logger.info({ assignmentId: assignment.id }, 'offer expired');
}

/* ------------------------------------------------- cross-module interface */

export const getAcceptedAssignment = repo.findAcceptedAssignment;
export const findOrdersNeedingDispatch = repo.findOrdersNeedingDispatch;
export const findExpiredOffers = repo.findExpiredOffers;
export const adminListDrivers = repo.adminListDrivers;
export const findProfile = repo.findProfile;
export const insertProfile = repo.insertProfile;
export const updateProfileRaw = repo.updateProfile;
export const findActiveAssignment = repo.findActiveAssignment;

export async function releaseDriver(driverUserId, trx) {
  const profile = await repo.findProfile(driverUserId, trx);
  if (!profile) return;
  if (profile.availability === 'ON_DELIVERY') {
    await repo.updateProfile(driverUserId, { availability: 'AVAILABLE' }, trx);
  }
}

export async function closeAssignmentsForOrder(orderId, { cancelled }, trx) {
  await repo.closeForOrder(orderId, cancelled ? 'CANCELLED' : 'COMPLETED', trx);
}

/** Recomputes the driver rating aggregate from source. */
export async function applyRatingAggregate(driverUserId, trx) {
  await (trx ?? (await import('../../shared/db/knex.js')).knex).raw(
    `
    UPDATE driver_profiles d SET
      rating_average = COALESCE((
        SELECT ROUND(AVG(driver_rating)::numeric, 2) FROM reviews
        WHERE driver_user_id = d.user_id AND driver_rating IS NOT NULL AND status = 'PUBLISHED'), 0),
      rating_count = (
        SELECT count(*) FROM reviews
        WHERE driver_user_id = d.user_id AND driver_rating IS NOT NULL AND status = 'PUBLISHED')
    WHERE d.user_id = ?
    `,
    [driverUserId],
  );
}
