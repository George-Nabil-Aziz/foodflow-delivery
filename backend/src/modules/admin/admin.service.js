import crypto from 'node:crypto';
import { knex } from '../../shared/db/knex.js';
import { withTransaction } from '../../shared/db/transaction.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { toLimitOffset, paginationMeta } from '../../shared/http/pagination.js';
import { config } from '../../config/index.js';
import { notify } from '../../shared/notifications.js';
import * as auth from '../auth/index.js';
import * as users from '../users/index.js';
import * as restaurants from '../restaurants/index.js';
import * as orders from '../orders/index.js';
import * as delivery from '../delivery/index.js';
import * as payments from '../payments/index.js';
import * as reviews from '../reviews/index.js';
import { audit } from './audit.service.js';
import { toAdminRestaurantDto } from '../restaurants/index.js';

/**
 * Every mutation in this module follows one shape: do the thing through the
 * owning module's interface, then write the audit row - both in the same
 * transaction, so an unaudited change is impossible without deleting the code
 * that writes it (BR-AD1).
 *
 * The admin module owns only `admin_audit_logs`. Everything else goes through
 * another module's public interface; writing directly to `orders` here would
 * create a second status-changing code path and G3 would stop being true.
 */

/* ------------------------------------------------------------------ users */

export async function listUsers(query) {
  const { limit, offset, page } = toLimitOffset(query);
  const q = knex('users')
    .select('*', knex.raw('count(*) OVER() AS total_count'))
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (query.role) q.where('role', query.role);
  if (query.status) q.where('status', query.status);
  // A deleted account has no live status, so it only shows under "All" and "Deleted".
  if (query.deleted === 'only') q.whereNotNull('deleted_at');
  else if (query.status) q.whereNull('deleted_at');
  if (query.q) {
    q.where((b) => b.whereILike('full_name', `%${query.q}%`).orWhereILike('email', `%${query.q}%`));
  }
  const rows = await q;
  return {
    data: rows.map((u) => ({
      id: u.id, email: u.email, fullName: u.full_name, phone: u.phone,
      role: u.role, status: u.status, createdAt: u.created_at, lastLoginAt: u.last_login_at,
      deletedAt: u.deleted_at,
    })),
    meta: paginationMeta({ page, limit, total: rows[0]?.total_count ?? 0 }),
  };
}

export async function getUser(id) {
  const user = await users.getUserById(id);
  if (!user) throw new NotFoundError('RESOURCE_NOT_FOUND');
  const [orderCount] = await knex('orders').where({ customer_user_id: id }).count();
  return {
    id: user.id, email: user.email, fullName: user.full_name, phone: user.phone,
    role: user.role, status: user.status, createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    activity: { orderCount: Number(orderCount?.count ?? 0) },
  };
}

/**
 * Suspension revokes every refresh token AND blocks the existing access token
 * (via the per-request user load in `authenticate`). Without both, FR-9.3 would
 * be untrue and suspension would be decorative.
 */
export async function suspendUser(adminUserId, userId, { reason }) {
  if (adminUserId === userId) {
    throw new ValidationError('UNPROCESSABLE', {
      details: [{ field: 'id', issue: 'You cannot suspend your own account.' }],
    });
  }
  return withTransaction(async (trx) => {
    const user = await users.getUserById(userId, trx);
    if (!user) throw new NotFoundError('RESOURCE_NOT_FOUND');

    // A driver mid-delivery cannot be locked out: an order already in someone's
    // car is not made safer by taking away their app (BR-AD4).
    if (user.role === 'DRIVER') {
      const active = await delivery.findActiveAssignment(userId, trx);
      if (active) {
        throw new ConflictError('DRIVER_HAS_ACTIVE_DELIVERY', {
          details: [{ field: 'id', issue: 'This driver has an active delivery.', orderId: active.order_id }],
        });
      }
    }

    await users.setUserStatus(userId, 'SUSPENDED', trx);
    await auth.revokeAllForUser(userId, trx);
    await audit(
      { adminUserId, action: 'USER_SUSPENDED', entityType: 'user', entityId: userId, metadata: { reason } },
      trx,
    );
    return { id: userId, status: 'SUSPENDED' };
  });
}

export async function reactivateUser(adminUserId, userId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const user = await users.getUserById(userId, trx);
    if (!user) throw new NotFoundError('RESOURCE_NOT_FOUND');
    await users.setUserStatus(userId, 'ACTIVE', trx);
    await audit(
      { adminUserId, action: 'USER_REACTIVATED', entityType: 'user', entityId: userId, metadata: { reason } },
      trx,
    );
    return { id: userId, status: 'ACTIVE' };
  });
}

/* --------------------------------------------------------------- deletion */
// Soft delete (BR-A6): the row stays, so orders and reviews keep their history,
// and `authenticate` rejects a deleted account on its very next request.

const alreadyDeleted = () => new ConflictError('CONFLICT', {
  details: [{ field: 'id', issue: 'This record is already deleted.' }],
});

export async function deleteUser(adminUserId, userId, { reason }) {
  if (adminUserId === userId) {
    throw new ValidationError('UNPROCESSABLE', {
      details: [{ field: 'id', issue: 'You cannot delete your own account.' }],
    });
  }
  return withTransaction(async (trx) => {
    const user = await users.getUserByIdIncludingDeleted(userId, trx);
    if (!user) throw new NotFoundError('RESOURCE_NOT_FOUND');
    // A restaurant or driver account has its own rules (orders, deliveries).
    if (user.role === 'RESTAURANT' || user.role === 'DRIVER') {
      throw new ValidationError('UNPROCESSABLE', {
        details: [{ field: 'id', issue: 'Delete this account from the Restaurants or Drivers page.' }],
      });
    }
    if (user.deleted_at) throw alreadyDeleted();
    if (await orders.countActiveOrdersForCustomer(userId, trx)) {
      throw new ConflictError('HAS_ACTIVE_ORDERS', {
        details: [{ field: 'id', issue: 'This customer has an order in progress. Wait for it to finish, or force-cancel it first.' }],
      });
    }

    const row = await users.softDeleteUser(userId, trx);
    await auth.revokeAllForUser(userId, trx);
    await audit(
      { adminUserId, action: 'USER_DELETED', entityType: 'user', entityId: userId, metadata: { reason } },
      trx,
    );
    return { id: userId, deletedAt: row.deleted_at };
  });
}

export async function deleteDriver(adminUserId, userId, { reason }) {
  return withTransaction(async (trx) => {
    const user = await users.getUserByIdIncludingDeleted(userId, trx);
    if (!user || user.role !== 'DRIVER') throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (user.deleted_at) throw alreadyDeleted();
    const active = await delivery.findActiveAssignment(userId, trx);
    if (active) {
      throw new ConflictError('DRIVER_HAS_ACTIVE_DELIVERY', {
        details: [{ field: 'id', issue: 'This driver has an active delivery.', orderId: active.order_id }],
      });
    }

    const row = await users.softDeleteUser(userId, trx);
    // Dispatch already skips deleted users; OFFLINE makes the profile say so too.
    await delivery.updateProfileRaw(userId, { availability: 'OFFLINE' }, trx);
    await auth.revokeAllForUser(userId, trx);
    await audit(
      { adminUserId, action: 'DRIVER_DELETED', entityType: 'driver', entityId: userId, metadata: { reason } },
      trx,
    );
    return { id: userId, deletedAt: row.deleted_at };
  });
}

/** The owner's account exists only for this restaurant, so it goes with it. */
export async function deleteRestaurant(adminUserId, restaurantId, { reason }) {
  return withTransaction(async (trx) => {
    const restaurant = await restaurants.getRestaurantByIdIncludingDeleted(restaurantId, trx);
    if (!restaurant) throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (restaurant.deleted_at) throw alreadyDeleted();
    if (await orders.countActiveOrdersForRestaurant(restaurantId, trx)) {
      throw new ConflictError('HAS_ACTIVE_ORDERS', {
        details: [{ field: 'id', issue: 'This restaurant has orders in progress. Wait for them to finish, or force-cancel them first.' }],
      });
    }

    const row = await restaurants.softDeleteRestaurant(restaurantId, trx);
    await users.softDeleteUser(restaurant.owner_user_id, trx);
    await auth.revokeAllForUser(restaurant.owner_user_id, trx);
    await audit(
      {
        adminUserId, action: 'RESTAURANT_DELETED', entityType: 'restaurant', entityId: restaurantId,
        metadata: { reason, ownerUserId: restaurant.owner_user_id },
      },
      trx,
    );
    return { id: restaurantId, deletedAt: row.deleted_at };
  });
}

/* ---------------------------------------------------------------- restore */
// Restore only clears deleted_at: suspension and approval are left as they were.

const notDeleted = () => new ConflictError('CONFLICT', {
  details: [{ field: 'id', issue: 'This record is not deleted.' }],
});

export async function restoreUser(adminUserId, userId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const user = await users.getUserByIdIncludingDeleted(userId, trx);
    if (!user) throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (user.role === 'RESTAURANT' || user.role === 'DRIVER') {
      throw new ValidationError('UNPROCESSABLE', {
        details: [{ field: 'id', issue: 'Restore this account from the Restaurants or Drivers page.' }],
      });
    }
    if (!user.deleted_at) throw notDeleted();
    await users.restoreUser(userId, trx);
    await audit(
      { adminUserId, action: 'USER_RESTORED', entityType: 'user', entityId: userId, metadata: { reason } },
      trx,
    );
    return { id: userId, deletedAt: null };
  });
}

export async function restoreDriver(adminUserId, userId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const user = await users.getUserByIdIncludingDeleted(userId, trx);
    if (!user || user.role !== 'DRIVER') throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (!user.deleted_at) throw notDeleted();
    await users.restoreUser(userId, trx);
    await audit(
      { adminUserId, action: 'DRIVER_RESTORED', entityType: 'driver', entityId: userId, metadata: { reason } },
      trx,
    );
    return { id: userId, deletedAt: null };
  });
}

export async function restoreRestaurant(adminUserId, restaurantId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const restaurant = await restaurants.getRestaurantByIdIncludingDeleted(restaurantId, trx);
    if (!restaurant) throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (!restaurant.deleted_at) throw notDeleted();
    await restaurants.restoreRestaurant(restaurantId, trx);
    await users.restoreUser(restaurant.owner_user_id, trx);
    await audit(
      {
        adminUserId, action: 'RESTAURANT_RESTORED', entityType: 'restaurant', entityId: restaurantId,
        metadata: { reason, ownerUserId: restaurant.owner_user_id },
      },
      trx,
    );
    return { id: restaurantId, deletedAt: null };
  });
}

/* ------------------------------------------------------------ restaurants */

export async function listRestaurants(query) {
  const { limit, offset, page } = toLimitOffset(query);
  const { rows, total } = await restaurants.adminList({ ...query, limit, offset });
  return { data: rows.map(toAdminRestaurantDto), meta: paginationMeta({ page, limit, total }) };
}

/** Approving an empty restaurant would put a dead listing in front of
 *  customers, so at least one available item is required (BR-AD10). */
export async function approveRestaurant(adminUserId, restaurantId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const restaurant = await restaurants.getRestaurantById(restaurantId, trx);
    if (!restaurant) throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (restaurant.status === 'ACTIVE') {
      throw new ConflictError('CONFLICT', {
        details: [{ field: 'status', issue: 'This restaurant is already active.' }],
      });
    }

    const availableItems = await restaurants.countAvailableItems(restaurantId, trx);
    if (availableItems === 0) {
      throw new ValidationError('UNPROCESSABLE', {
        details: [{
          field: 'menu',
          issue: 'A restaurant needs at least one available food item before it can be approved.',
        }],
      });
    }

    const { updated } = await restaurants.setStatus(
      restaurantId, 'ACTIVE',
      { approved_at: trx.fn.now(), approved_by_user_id: adminUserId, rejection_reason: null },
      trx,
    );
    await audit(
      { adminUserId, action: 'RESTAURANT_APPROVED', entityType: 'restaurant', entityId: restaurantId, metadata: { reason } },
      trx,
    );
    return { id: updated.id, status: updated.status };
  });
}

export async function rejectRestaurant(adminUserId, restaurantId, { reason }) {
  return withTransaction(async (trx) => {
    const { updated } = await restaurants.setStatus(
      restaurantId, 'REJECTED', { rejection_reason: reason }, trx,
    );
    await audit(
      { adminUserId, action: 'RESTAURANT_REJECTED', entityType: 'restaurant', entityId: restaurantId, metadata: { reason } },
      trx,
    );
    return { id: updated.id, status: updated.status, rejectionReason: updated.rejection_reason };
  });
}

/** Suspending a restaurant does NOT cancel its in-flight orders (BR-R9) and
 *  does not touch the owner's user account (BR-AD3). */
export async function suspendRestaurant(adminUserId, restaurantId, { reason }) {
  return withTransaction(async (trx) => {
    const { updated } = await restaurants.setStatus(restaurantId, 'SUSPENDED', {}, trx);
    await audit(
      { adminUserId, action: 'RESTAURANT_SUSPENDED', entityType: 'restaurant', entityId: restaurantId, metadata: { reason } },
      trx,
    );
    return { id: updated.id, status: updated.status };
  });
}

export async function reactivateRestaurant(adminUserId, restaurantId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const { updated } = await restaurants.setStatus(
      restaurantId, 'ACTIVE', { rejection_reason: null }, trx,
    );
    await audit(
      { adminUserId, action: 'RESTAURANT_REACTIVATED', entityType: 'restaurant', entityId: restaurantId, metadata: { reason } },
      trx,
    );
    return { id: updated.id, status: updated.status };
  });
}

/* ---------------------------------------------------------------- drivers */

export async function listDrivers(query) {
  const { limit, offset, page } = toLimitOffset(query);
  const { rows, total } = await delivery.adminListDrivers({ ...query, limit, offset });
  return {
    data: rows.map((d) => ({
      id: d.id,
      userId: d.user_id,
      fullName: d.full_name,
      email: d.email,
      phone: d.phone,
      status: d.status,
      availability: d.availability,
      vehicleType: d.vehicle_type,
      vehiclePlate: d.vehicle_plate,
      ratingAverage: d.rating_average,
      ratingCount: d.rating_count,
      userStatus: d.user_status,
      // Joined is the account's creation date, not the profile row's.
      createdAt: d.user_created_at,
      deletedAt: d.user_deleted_at,
    })),
    meta: paginationMeta({ page, limit, total }),
  };
}

/**
 * Drivers are admin-provisioned (ADR-006): a driver receives a stranger's home
 * address, so self-service registration would put that data one signup form
 * away from anyone.
 *
 * The generated password is returned EXACTLY ONCE, here, and is never
 * retrievable afterwards (BR-AD8).
 */
export async function createDriver(adminUserId, input) {
  const existing = await knex('users').where({ email: input.email }).first('id');
  if (existing) throw new ConflictError('EMAIL_ALREADY_REGISTERED');

  const initialPassword = generateInitialPassword();
  const passwordHash = await auth.hashPassword(initialPassword);

  const result = await withTransaction(async (trx) => {
    const [user] = await trx('users')
      .insert({
        email: input.email,
        password_hash: passwordHash,
        full_name: input.fullName,
        phone: input.phone,
        role: 'DRIVER',
        status: 'ACTIVE',
      })
      .returning('*');

    // PENDING_APPROVAL even though an admin created it, so approval stays an
    // explicit, audited second step rather than a side effect of typing a name.
    const profile = await delivery.insertProfile(
      {
        user_id: user.id,
        vehicle_type: input.vehicleType,
        vehicle_plate: input.vehiclePlate,
        status: 'PENDING_APPROVAL',
        availability: 'OFFLINE',
      },
      trx,
    );

    await audit(
      { adminUserId, action: 'DRIVER_CREATED', entityType: 'user', entityId: user.id, metadata: { email: input.email } },
      trx,
    );
    return { user, profile };
  });

  // A welcome notice only: the password is shown to the admin once and never sent (BR-AD8).
  await notify({ userId: result.user.id, template: 'DRIVER_CREATED', payload: { role: 'DRIVER' } });

  return {
    user: {
      id: result.user.id, email: result.user.email, fullName: result.user.full_name,
      phone: result.user.phone, role: result.user.role, status: result.user.status,
    },
    driverProfile: {
      id: result.profile.id, status: result.profile.status,
      availability: result.profile.availability, vehicleType: result.profile.vehicle_type,
    },
    initialPassword,
  };
}

/**
 * An admin creates a customer, another admin, or a restaurant owner with their
 * restaurant, the same way drivers are provisioned: a generated password shown
 * exactly once (BR-AD8), and an audit entry. A restaurant created here still
 * starts PENDING_APPROVAL, so going live stays its own audited decision.
 */
export async function createAccount(adminUserId, input) {
  const existing = await knex('users').where({ email: input.email }).first('id');
  if (existing) throw new ConflictError('EMAIL_ALREADY_REGISTERED');

  const initialPassword = generateInitialPassword();
  const passwordHash = await auth.hashPassword(initialPassword);

  const result = await withTransaction(async (trx) => {
    const [user] = await trx('users')
      .insert({
        email: input.email,
        password_hash: passwordHash,
        full_name: input.fullName,
        phone: input.phone,
        role: input.role,
        status: 'ACTIVE',
      })
      .returning('*');

    let restaurant = null;
    if (input.role === 'RESTAURANT') {
      [restaurant] = await trx('restaurants')
        .insert({
          owner_user_id: user.id,
          name: input.restaurantName,
          slug: await auth.allocateSlug(input.restaurantName, trx),
          status: 'PENDING_APPROVAL',
          is_accepting_orders: true,
        })
        .returning('*');
    }

    // The first address is the default, as when a customer adds one (BR-A7).
    if (input.address) {
      const a = input.address;
      await trx('customer_addresses').insert({
        user_id: user.id,
        label: a.label ?? null,
        line1: a.line1,
        line2: a.line2 ?? null,
        city: a.city,
        district: a.district ?? null,
        postal_code: a.postalCode ?? null,
        latitude: a.latitude ?? null,
        longitude: a.longitude ?? null,
        is_default: true,
      });
    }

    await audit(
      {
        adminUserId, action: 'USER_CREATED', entityType: 'user', entityId: user.id,
        metadata: { email: input.email, role: input.role },
      },
      trx,
    );
    return { user, restaurant };
  });

  // A welcome notice only: the password is shown to the admin once and never sent (BR-AD8).
  await notify({ userId: result.user.id, template: 'ACCOUNT_CREATED', payload: { role: result.user.role } });

  return {
    user: {
      id: result.user.id, email: result.user.email, fullName: result.user.full_name,
      phone: result.user.phone, role: result.user.role, status: result.user.status,
    },
    restaurant: result.restaurant
      ? { id: result.restaurant.id, name: result.restaurant.name, status: result.restaurant.status }
      : null,
    initialPassword,
  };
}

function generateInitialPassword() {
  const chunk = () => crypto.randomBytes(3).toString('base64url').slice(0, 4);
  return `${chunk()}-${chunk()}-${chunk()}`;
}

export async function approveDriver(adminUserId, driverUserId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const profile = await delivery.findProfile(driverUserId, trx);
    if (!profile) throw new NotFoundError('RESOURCE_NOT_FOUND');
    await delivery.updateProfileRaw(
      driverUserId, { status: 'ACTIVE', approved_at: trx.fn.now(), approved_by_user_id: adminUserId }, trx,
    );
    await audit(
      { adminUserId, action: 'DRIVER_APPROVED', entityType: 'user', entityId: driverUserId, metadata: { reason } },
      trx,
    );
    return { userId: driverUserId, status: 'ACTIVE' };
  });
}

export async function suspendDriver(adminUserId, driverUserId, { reason }) {
  return withTransaction(async (trx) => {
    const profile = await delivery.findProfile(driverUserId, trx);
    if (!profile) throw new NotFoundError('RESOURCE_NOT_FOUND');

    const active = await delivery.findActiveAssignment(driverUserId, trx);
    if (active) {
      throw new ConflictError('DRIVER_HAS_ACTIVE_DELIVERY', {
        details: [{ field: 'id', issue: 'This driver has an active delivery.', orderId: active.order_id }],
      });
    }

    await delivery.updateProfileRaw(driverUserId, { status: 'SUSPENDED', availability: 'OFFLINE' }, trx);
    await audit(
      { adminUserId, action: 'DRIVER_SUSPENDED', entityType: 'user', entityId: driverUserId, metadata: { reason } },
      trx,
    );
    return { userId: driverUserId, status: 'SUSPENDED' };
  });
}

/* ----------------------------------------------------------------- orders */

export const listOrders = orders.adminList;
export const getOrder = orders.adminGetOrder;
export const listUnassigned = orders.listUnassigned;
export const listStuck = orders.listStuck;

export async function forceCancelOrder(adminUserId, orderId, { reason, note }) {
  const updated = await withTransaction(async (trx) => {
    const cancelled = await orders.adminForceCancel(adminUserId, orderId, { reason, note }, trx);
    await audit(
      { adminUserId, action: 'ORDER_FORCE_CANCELLED', entityType: 'order', entityId: orderId, metadata: { reason, note } },
      trx,
    );
    return cancelled;
  });
  // After commit: a paid card order is refunded (spec-11 BR-P5).
  await orders.settleCancelled(updated);
  await orders.notifyStatusChange(updated, 'CANCELLED');
  return { id: updated.id, status: updated.status, cancellationReason: updated.cancellation_reason };
}

/**
 * Retries a refund that failed. The gateway call happens first and is recorded
 * on the payment; the audit row commits in the same transaction as that record,
 * whether the retry succeeded or failed again (BR-AD1, BR-P6).
 */
export async function retryRefund(adminUserId, paymentId) {
  const { payment, outcome } = await payments.retryRefund(paymentId, {
    onRecorded: (trx, row, result) => audit(
      {
        adminUserId, action: 'PAYMENT_REFUND_RETRIED', entityType: 'payment', entityId: paymentId,
        metadata: { orderId: row.order_id, outcome: result, amount: row.amount, error: row.refund_error },
      },
      trx,
    ),
  });
  return { ...payments.toAdminPaymentDto(payment), outcome };
}

/** Only an active customer can have an order placed for them. */
async function assertOrderingCustomer(customerUserId, trx) {
  const customer = await users.getUserById(customerUserId, trx);
  if (!customer || customer.role !== 'CUSTOMER') throw new NotFoundError('RESOURCE_NOT_FOUND');
  if (customer.status !== 'ACTIVE') {
    throw new ValidationError('UNPROCESSABLE', {
      details: [{ field: 'customerUserId', issue: 'Only an active customer can have an order placed for them.' }],
    });
  }
  return customer;
}

/** A customer's saved addresses, for choosing where an admin-placed order goes. */
export async function listCustomerAddresses(customerUserId) {
  await assertOrderingCustomer(customerUserId);
  return users.listAddresses(customerUserId);
}

/** Places an order on a customer's behalf; the audit row commits with it. */
export async function placeOrder(adminUserId, input) {
  const order = await withTransaction(async (trx) => {
    await assertOrderingCustomer(input.customerUserId, trx);
    const created = await orders.adminPlaceOrder(adminUserId, input, trx);
    await audit(
      { adminUserId, action: 'ORDER_PLACED', entityType: 'order', entityId: created.id,
        metadata: { customerUserId: input.customerUserId, orderNumber: created.order_number } },
      trx,
    );
    return created;
  });
  await orders.notifyNewOrder(order);
  return orders.adminGetOrder(order.id);
}

/* ---------------------------------------------------------------- reviews */

export const listReviews = reviews.adminList;

export async function hideReview(adminUserId, reviewId, { reason }) {
  return withTransaction(async (trx) => {
    const row = await reviews.setModerationStatus(
      { reviewId, status: 'HIDDEN', adminUserId, reason }, trx,
    );
    await audit(
      { adminUserId, action: 'REVIEW_HIDDEN', entityType: 'review', entityId: reviewId, metadata: { reason } },
      trx,
    );
    return { id: row.id, status: row.status };
  });
}

export async function restoreReview(adminUserId, reviewId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const row = await reviews.setModerationStatus(
      { reviewId, status: 'PUBLISHED', adminUserId, reason }, trx,
    );
    await audit(
      { adminUserId, action: 'REVIEW_RESTORED', entityType: 'review', entityId: reviewId, metadata: { reason } },
      trx,
    );
    return { id: row.id, status: row.status };
  });
}

/* ------------------------------------------------------------- audit logs */

export async function listAuditLogs(query) {
  const { limit, offset, page } = toLimitOffset(query);
  const q = knex('admin_audit_logs as a')
    .join('users as u', 'u.id', 'a.admin_user_id')
    .select('a.*', 'u.full_name as admin_name', 'u.email as admin_email',
      knex.raw('count(*) OVER() AS total_count'))
    .orderBy('a.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (query.entityType) q.where('a.entity_type', query.entityType);
  if (query.entityId) q.where('a.entity_id', query.entityId);
  if (query.adminId) q.where('a.admin_user_id', query.adminId);

  const rows = await q;
  return {
    data: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      metadata: r.metadata,
      createdAt: r.created_at,
      admin: { id: r.admin_user_id, fullName: r.admin_name, email: r.admin_email },
    })),
    meta: paginationMeta({ page, limit, total: rows[0]?.total_count ?? 0 }),
  };
}

export { config as adminConfig };
