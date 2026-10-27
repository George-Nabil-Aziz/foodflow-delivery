import { config } from '../../config/index.js';
import { withTransaction } from '../../shared/db/transaction.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { toLimitOffset, paginationMeta } from '../../shared/http/pagination.js';
import { logger } from '../../shared/logger.js';
import * as repo from './orders.repository.js';
import {
  assertTransition,
  STATUS_TIMESTAMP_COLUMN,
  allowedTransitions,
} from './orderStateMachine.js';
import { computeTotals, meetsMinimum, shortfall } from './orderPricing.js';
import { generateOrderNumber } from './orderNumber.js';
import {
  toCustomerOrderDto,
  toRestaurantOrderDto,
  toAdminOrderDto,
  toOrderStatusDto,
  toOrderSummaryDto,
} from './orders.mapper.js';
import * as cart from '../cart/index.js';
import * as restaurants from '../restaurants/index.js';
import * as menu from '../menu/index.js';
import * as users from '../users/index.js';
import * as delivery from '../delivery/index.js';
import { notify } from '../../shared/notifications.js';
import { publishAfterCommit, EVENT_TYPES } from '../../shared/events/index.js';

/**
 * Live-update push for an order row (spec-14). Queued on the transaction, so
 * it goes out only if and when the owner of that transaction commits. The
 * payload is ids plus the new status; clients refetch through the normal,
 * authorised endpoints.
 */
export function publishOrderEvent(trx, order, type = EVENT_TYPES.ORDER_STATUS) {
  publishAfterCommit(trx, {
    type,
    audience: {
      userIds: [order.customer_user_id, order.driver_user_id].filter(Boolean),
      restaurantIds: [order.restaurant_id],
    },
    data: { orderId: order.id, status: order.status },
  });
}

/* ------------------------------------------------------------------ checkout */

/**
 * Converts the active cart into an immutable order. One transaction: any
 * failure leaves no order, no items, no events and an untouched cart (NFR-7).
 *
 * Note what the input does NOT contain: prices. The client sends an address and
 * a note; every monetary figure is computed here (BR-O5).
 */
export async function checkout(customerUserId, { addressId, customerNote, paymentMethod }) {
  const order = await withTransaction(async (trx) => {
    const activeCart = await cart.getActiveCartForCheckout(customerUserId, trx);

    if (!activeCart || activeCart.items.length === 0) {
      throw new ValidationError('CART_EMPTY');
    }

    // Re-validate the restaurant and every line against live data. The cart may
    // have been built minutes ago; the world moves underneath it.
    const restaurant = await restaurants.assertOrderable(activeCart.restaurantId, trx);

    const liveItems = await cart.revalidateLines(activeCart, trx);
    const issues = liveItems.filter((l) => l.issues.length > 0);
    if (issues.length) {
      throw new ValidationError('CART_HAS_ISSUES', {
        details: issues.map((l) => ({
          field: 'items',
          issue: `"${l.name}" needs attention: ${l.issues.join(', ')}.`,
          foodItemId: l.foodItemId,
          codes: l.issues,
        })),
      });
    }

    const created = await insertOrder(
      { customerUserId, restaurant, lines: liveItems, addressId, customerNote, paymentMethod },
      { id: customerUserId, role: 'CUSTOMER' },
      trx,
    );
    await cart.markConverted(activeCart.id, trx);
    return created;
  });

  await notifyNewOrder(order);
  return getCustomerOrder(customerUserId, order.id);
}

/**
 * An admin places an order for a customer, from items picked on the admin
 * page rather than the customer's cart, which is left untouched. The same
 * checks as checkout apply: an orderable restaurant, orderable items from that
 * restaurant only, the minimum order, and an address of the customer's own.
 * Prices are still computed here, never taken from the request.
 *
 * Runs in the caller's transaction when given one, so the admin audit row
 * commits with the order; the caller then sends the notification.
 */
export async function adminPlaceOrder(adminUserId, input, trx) {
  const run = async (t) => {
    const { customerUserId, restaurantId, addressId, items, customerNote } = input;
    const restaurant = await restaurants.assertOrderable(restaurantId, t);

    const lines = [];
    for (const { foodItemId, quantity, notes } of items) {
      const item = await menu.assertItemOrderable(foodItemId, t);
      // An item of another restaurant is as unknown here as a missing one.
      if (item.restaurant_id !== restaurant.id) throw new NotFoundError('RESOURCE_NOT_FOUND');
      lines.push({
        foodItemId: item.id, name: item.name, description: item.description,
        unitPrice: item.price, quantity, notes,
      });
    }

    return insertOrder(
      { customerUserId, restaurant, lines, addressId, customerNote, paymentMethod: 'CASH_ON_DELIVERY' },
      { id: adminUserId, role: 'ADMIN' },
      t,
    );
  };
  return trx ? run(trx) : withTransaction(run);
}

/**
 * Tells the restaurant owner (SMS + email) and the customer (email) that an
 * order was placed. Recipients are resolved from the order itself.
 */
export async function notifyNewOrder(order) {
  // Outside the transaction: a failing notification must not roll back a
  // placed order, and a transaction must not wait on I/O it does not control.
  const payload = {
    orderId: order.id,
    orderNumber: order.order_number,
    restaurantId: order.restaurant_id,
    total: order.total_amount,
  };
  await notify({ template: 'NEW_ORDER', payload });
  await notify({ template: 'ORDER_PLACED', payload });
}

/** Customer-facing status messages, sent after the status change committed. */
export async function notifyStatusChange(order, toStatus) {
  const template = { OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY', CANCELLED: 'ORDER_CANCELLED' }[toStatus];
  if (!template) return;
  await notify({
    template,
    payload: { orderId: order.id, orderNumber: order.order_number, reason: order.cancellation_reason },
  });
}

/** Prices, checks the minimum and writes the order, its lines and first event. */
async function insertOrder({ customerUserId, restaurant, lines, addressId, customerNote, paymentMethod }, actor, trx) {
  const totals = computeTotals({
    lines: lines.map((l) => ({
      foodItemId: l.foodItemId,
      name: l.name,
      description: l.description,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      notes: l.notes,
    })),
    deliveryFee: restaurant.delivery_fee,
    taxRate: config.taxRate,
  });

  if (!meetsMinimum(totals.subtotal, restaurant.minimum_order_amount)) {
    throw new ValidationError('BELOW_MINIMUM_ORDER', {
      details: [{
        field: 'subtotal',
        issue: `This restaurant has a minimum order of ${restaurant.minimum_order_amount}.`,
        required: restaurant.minimum_order_amount,
        actual: totals.subtotal,
        shortfall: shortfall(totals.subtotal, restaurant.minimum_order_amount),
      }],
    });
  }

  const address = await users.getAddressForOrder(customerUserId, addressId, trx);

  const created = await repo.insertOrderWithUniqueNumber(
    {
      order_number: generateOrderNumber(),
      customer_user_id: customerUserId,
      restaurant_id: restaurant.id,
      delivery_address_id: address.id,
      // The snapshot is the truth; the FK above is a convenience that may go
      // null when the address is deleted (BR-O6).
      delivery_address_snapshot: JSON.stringify(address.snapshot),
      restaurant_name_snapshot: restaurant.name,
      status: 'PENDING',
      dispatch_state: 'NOT_REQUIRED',
      subtotal: totals.subtotal,
      delivery_fee: totals.deliveryFee,
      tax_amount: totals.taxAmount,
      total_amount: totals.totalAmount,
      payment_method: paymentMethod ?? 'CASH_ON_DELIVERY',
      customer_note: customerNote ?? null,
    },
    generateOrderNumber,
    trx,
  );

  // Snapshot columns: nothing reads food_items for this order again (BR-O1).
  await repo.insertItems(
    created.id,
    totals.lines.map((l) => ({
      food_item_id: l.foodItemId,
      item_name_snapshot: l.name,
      item_description_snapshot: l.description ?? null,
      unit_price: l.unitPrice,
      quantity: l.quantity,
      line_total: l.lineTotal,
      notes: l.notes ?? null,
    })),
    trx,
  );

  await repo.appendEvent(
    { orderId: created.id, from: null, to: 'PENDING', actorUserId: actor.id, actorRole: actor.role },
    trx,
  );

  // Checkout and admin placement both come through here, so one hook covers both.
  publishOrderEvent(trx, created, EVENT_TYPES.ORDER_CREATED);
  return created;
}

/* --------------------------------------------------------------- transition */

/**
 * The ONLY code path that changes an order's status.
 *
 * Every action endpoint is a thin wrapper over this function, which is what
 * makes goal G3 (every change legal, attributed and auditable) testable rather
 * than aspirational.
 */
export async function transition(orderId, toStatus, actor, { reason, note, scope } = {}) {
  const updated = await withTransaction(async (trx) => {
    const order = await repo.findByIdForUpdate(orderId, trx);
    if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');

    // Ownership is checked before legality, so a cross-tenant probe gets 404
    // rather than a 409 that would confirm the order exists (ADR-010).
    assertActorOwnsOrder(order, actor, scope);
    assertTransition(order.status, toStatus, { actorRole: actor.role, reason });

    const patch = { status: toStatus };
    const stamp = STATUS_TIMESTAMP_COLUMN[toStatus];
    if (stamp) patch[stamp] = trx.fn.now();

    if (toStatus === 'CANCELLED') {
      patch.cancelled_by = actor.role;
      patch.cancellation_reason = reason ?? 'CUSTOMER_CHANGED_MIND';
      patch.cancellation_note = note ?? null;
    }
    if (toStatus === 'CONFIRMED') patch.dispatch_state = 'UNASSIGNED';
    if (toStatus === 'DELIVERED') patch.dispatch_state = 'COMPLETED';

    const updated = await repo.updateOrder(orderId, patch, trx);

    await repo.appendEvent(
      {
        orderId,
        from: order.status,
        to: toStatus,
        actorUserId: actor.id ?? null,
        actorRole: actor.role,
        reason: reason ?? null,
        note: note ?? null,
      },
      trx,
    );

    await applySideEffects(order, updated, toStatus, trx);
    publishOrderEvent(trx, updated);
    return updated;
  });
  await notifyStatusChange(updated, toStatus);
  return updated;
}

/** Side effects, all inside the same transaction as the status change. */
async function applySideEffects(previous, order, toStatus, trx) {
  if (toStatus === 'CONFIRMED') {
    await delivery.requestDispatch(order.id, trx);
  }
  if (toStatus === 'DELIVERED' || toStatus === 'CANCELLED') {
    await delivery.closeAssignmentsForOrder(order.id, { cancelled: toStatus === 'CANCELLED' }, trx);
    if (previous.driver_user_id) await delivery.releaseDriver(previous.driver_user_id, trx);
  }
}

function assertActorOwnsOrder(order, actor, scope) {
  if (actor.role === 'ADMIN' || actor.role === 'SYSTEM') return;
  if (actor.role === 'CUSTOMER' && order.customer_user_id === actor.id) return;
  if (actor.role === 'RESTAURANT' && scope?.restaurantId && order.restaurant_id === scope.restaurantId) return;
  if (actor.role === 'DRIVER' && order.driver_user_id === actor.id) return;
  throw new NotFoundError('RESOURCE_NOT_FOUND');
}

/* ------------------------------------------------------------ customer side */

export async function listForCustomer(customerUserId, query) {
  const { limit, offset, page } = toLimitOffset(query);
  const { rows, total } = await repo.listForCustomer(
    customerUserId, { scope: query.scope, limit, offset },
  );
  return { data: rows.map(toOrderSummaryDto), meta: paginationMeta({ page, limit, total }) };
}

export async function getCustomerOrder(customerUserId, orderId) {
  const order = await repo.findForCustomer(orderId, customerUserId);
  if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');
  const [items, events, driver, review] = await Promise.all([
    repo.listItems(orderId),
    repo.listEvents(orderId),
    repo.findDriverUser(order.driver_user_id),
    repo.hasReview(orderId),
  ]);
  const restaurant = await restaurants.getRestaurantById(order.restaurant_id);
  return toCustomerOrderDto(
    { ...order, has_review: Boolean(review), restaurant_phone: restaurant?.phone,
      restaurant_logo_url: restaurant?.logo_url },
    { items, events, driver },
  );
}

/** Deliberately small payload: this is the most-called endpoint in the system. */
export async function getCustomerOrderStatus(customerUserId, orderId) {
  const order = await repo.findForCustomer(orderId, customerUserId);
  if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');
  const [events, driver] = await Promise.all([
    repo.listEvents(orderId),
    repo.findDriverUser(order.driver_user_id),
  ]);
  return toOrderStatusDto(order, { events, driver });
}

export async function cancelByCustomer(customerUserId, orderId, { reason } = {}) {
  await transition(orderId, 'CANCELLED', { id: customerUserId, role: 'CUSTOMER' }, {
    reason: reason ?? 'CUSTOMER_CHANGED_MIND',
  });
  return getCustomerOrder(customerUserId, orderId);
}

/* ---------------------------------------------------------- restaurant side */

export async function listForRestaurant(restaurantId, query) {
  const { limit, offset, page } = toLimitOffset(query);
  const { rows, total } = await repo.listForRestaurant(
    restaurantId, { scope: query.scope, status: query.status, limit, offset },
  );
  return {
    data: rows.map((r) => ({
      ...toOrderSummaryDto(r),
      customerFirstName: String(r.customer_full_name ?? '').split(' ')[0],
      allowedActions: allowedTransitions(r.status, 'RESTAURANT'),
    })),
    meta: paginationMeta({ page, limit, total }),
  };
}

export async function getRestaurantOrder(restaurantId, orderId) {
  const order = await repo.findDetailForRestaurant(orderId, restaurantId);
  if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');
  const [items, events] = await Promise.all([repo.listItems(orderId), repo.listEvents(orderId)]);
  return {
    ...toRestaurantOrderDto(order, { items, events }),
    allowedActions: allowedTransitions(order.status, 'RESTAURANT'),
  };
}

export async function restaurantTransition(
  { restaurantId, ownerUserId, orderId, toStatus, reason, note },
) {
  await transition(orderId, toStatus, { id: ownerUserId, role: 'RESTAURANT' }, {
    reason, note, scope: { restaurantId },
  });
  return getRestaurantOrder(restaurantId, orderId);
}

/* -------------------------------------------------------------- driver side */

export async function driverTransition({ driverUserId, orderId, toStatus }) {
  const assignment = await delivery.getAcceptedAssignment(driverUserId, orderId);
  if (!assignment) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return transition(orderId, toStatus, { id: driverUserId, role: 'DRIVER' });
}

/* --------------------------------------------------------------- admin side */

export async function adminList(query) {
  const { limit, offset, page } = toLimitOffset(query);
  const { rows, total } = await repo.adminList({ ...query, limit, offset });
  return {
    data: rows.map((r) => ({
      ...toOrderSummaryDto(r),
      customerName: r.customer_full_name,
      status: r.status,
    })),
    meta: paginationMeta({ page, limit, total }),
  };
}

export async function adminGetOrder(orderId) {
  const order = await repo.findDetailForAdmin(orderId);
  if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');
  const [items, events] = await Promise.all([repo.listItems(orderId), repo.listEvents(orderId)]);
  return toAdminOrderDto(order, { items, events });
}

export async function adminForceCancel(adminUserId, orderId, { reason, note }, trx) {
  const run = async (t) => {
    const order = await repo.findByIdForUpdate(orderId, t);
    if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');
    assertTransition(order.status, 'CANCELLED', { actorRole: 'ADMIN', reason });

    const updated = await repo.updateOrder(
      orderId,
      {
        status: 'CANCELLED',
        cancelled_at: t.fn.now(),
        cancelled_by: 'ADMIN',
        cancellation_reason: reason,
        cancellation_note: note ?? null,
      },
      t,
    );
    await repo.appendEvent(
      { orderId, from: order.status, to: 'CANCELLED', actorUserId: adminUserId,
        actorRole: 'ADMIN', reason, note },
      t,
    );
    await delivery.closeAssignmentsForOrder(orderId, { cancelled: true }, t);
    if (order.driver_user_id) await delivery.releaseDriver(order.driver_user_id, t);
    publishOrderEvent(t, updated);
    return updated;
  };
  return trx ? run(trx) : withTransaction(run);
}

export async function listUnassigned() {
  const rows = await repo.listUnassigned({ minutes: config.unassignedEscalationMinutes });
  return rows.map((r) => ({
    ...toOrderSummaryDto(r),
    restaurantName: r.restaurant_name,
    confirmedAt: r.confirmed_at,
    dispatchState: r.dispatch_state,
  }));
}

export async function listStuck() {
  const rows = await repo.listStuck({
    unassignedMinutes: config.unassignedEscalationMinutes,
    pendingMinutes: config.orderAcceptTimeoutMinutes,
    deliveringMinutes: 90,
  });
  return rows.map((r) => ({ ...toOrderSummaryDto(r), stuckReason: r.stuck_reason }));
}

/* ------------------------------------------------------- jobs / interfaces */

/** SYSTEM cancellation of a PENDING order the restaurant never answered (T2). */
export async function systemCancelStale(orderId) {
  try {
    await transition(orderId, 'CANCELLED', { id: null, role: 'SYSTEM' }, {
      reason: 'ACCEPT_TIMEOUT',
      note: 'Automatically cancelled: the restaurant did not respond in time.',
    });
    return true;
  } catch (err) {
    if (err instanceof ConflictError) return false; // Someone acted first.
    logger.error({ err, orderId }, 'system cancel failed');
    throw err;
  }
}

export const getOrderById = repo.findById;
export const countActiveOrdersForCustomer = repo.countActiveForCustomer;
export const countActiveOrdersForRestaurant = repo.countActiveForRestaurant;
export const listEvents = repo.listEvents;

export async function assignDriver(orderId, driverUserId, trx) {
  return repo.updateOrder(orderId, { driver_user_id: driverUserId, dispatch_state: 'ASSIGNED' }, trx);
}

export async function setDispatchState(orderId, dispatchState, trx) {
  return repo.updateOrder(orderId, { dispatch_state: dispatchState }, trx);
}

export async function getOrderForActor(orderId, actor) {
  const order = await repo.findById(orderId);
  if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');
  if (actor.role === 'CUSTOMER' && order.customer_user_id !== actor.id) {
    throw new NotFoundError('RESOURCE_NOT_FOUND');
  }
  return order;
}
