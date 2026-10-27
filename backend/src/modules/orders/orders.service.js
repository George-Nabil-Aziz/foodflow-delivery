import { config } from '../../config/index.js';
import { money } from '../../shared/money.js';
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
import * as payments from '../payments/index.js';
import * as discounts from '../discounts/index.js';
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

/** The code printed on an order's detail views, from its redemption snapshot. */
async function discountCodeOf(orderId) {
  return (await discounts.getOrderDiscount(orderId))?.code ?? null;
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
  const isCard = paymentMethod === 'CARD';
  if (isCard) payments.assertCardEnabled();

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
      { customerUserId, restaurant, lines: liveItems, addressId, customerNote, paymentMethod,
        discountCode: activeCart.discountCode },
      { id: customerUserId, role: 'CUSTOMER' },
      trx,
    );
    // The amount comes from the total just computed, never from the request.
    if (isCard) {
      // A discount can bring the total to zero, and a gateway cannot take a
      // zero payment: that order would only sit unpaid until it timed out.
      if (money.isZero(created.total_amount)) {
        throw new ValidationError('UNPROCESSABLE', {
          details: [{ field: 'paymentMethod', issue: 'There is nothing to pay by card. Choose cash on delivery.' }],
        });
      }
      await payments.initiate(
        { orderId: created.id, customerUserId, amount: created.total_amount }, trx,
      );
    }
    await cart.markConverted(activeCart.id, trx);
    return created;
  });

  // A card order is not announced to the restaurant until it is paid; the
  // payment listener below does that (BR-P4).
  if (!isCard) await notifyNewOrder(order);
  return getCustomerOrder(customerUserId, order.id);
}

/**
 * The customer's browser reports the gateway payment it just made. The gateway
 * is asked whether it is paid and for what amount; the order is then returned
 * with its payment state, whatever that turned out to be.
 */
export async function confirmPayment(customerUserId, orderId, providerPaymentId) {
  const payment = await payments.getForCustomerOrder(orderId, customerUserId);
  await payments.confirm(payment, providerPaymentId);
  return getCustomerOrder(customerUserId, orderId);
}

/** Development stand-in for paying on the gateway's page (fake provider only). */
export async function simulatePayment(customerUserId, orderId) {
  const payment = await payments.getForCustomerOrder(orderId, customerUserId);
  return payments.simulatePayment(payment);
}

/**
 * Runs once per payment that becomes PAID (see `payments.onPaid`). A payment
 * for a live order announces it to the restaurant; one that arrives after the
 * order was cancelled (a late 3-D Secure, say) is refunded straight away.
 */
payments.onPaid(async (payment) => {
  const order = await repo.findById(payment.order_id);
  if (!order) return;
  if (order.status === 'CANCELLED') await settleCancelled(order);
  else if (order.status === 'PENDING') {
    // The restaurant could not see this order until now, and its screen does
    // not poll while the live stream is open: tell it the order has arrived.
    publishOrderEvent(null, order, EVENT_TYPES.ORDER_CREATED);
    await notifyNewOrder(order);
  }
});

/**
 * Post-commit follow-up to a cancellation, shared by every path that cancels
 * (`transition` and the admin force-cancel): refunds a PAID card payment.
 * External I/O, so it runs after the status change has committed, and it never
 * throws - a failed refund is recorded on the payment for an admin to retry
 * (BR-P5), it does not undo the cancellation.
 */
export async function settleCancelled(order) {
  if (order.payment_method !== 'CARD') return;
  try {
    await payments.refundForOrder(order.id);
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'refund after cancellation crashed');
  }
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
      { customerUserId, restaurant, lines, addressId, customerNote, paymentMethod: 'CASH_ON_DELIVERY',
        discountCode: input.discountCode },
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
async function insertOrder(
  { customerUserId, restaurant, lines, addressId, customerNote, paymentMethod, discountCode },
  actor,
  trx,
) {
  const pricing = {
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
  };
  let totals = computeTotals(pricing);

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

  // The delivery zone is enforced here and only here for orders, so checkout
  // and the admin "make an order" path cannot disagree (spec-18 BR-DZ3).
  const address = await users.getAddressForOrder(customerUserId, addressId, trx);
  const zone = restaurants.checkDeliveryZone(restaurant, address.snapshot);
  if (!zone.deliversToAddress) {
    throw new ValidationError('OUTSIDE_DELIVERY_ZONE', {
      details: [{
        field: 'addressId',
        issue: `This restaurant delivers within ${zone.radiusKm} km and this address is ${zone.distanceKm} km away.`,
        distanceKm: zone.distanceKm,
        radiusKm: zone.radiusKm,
      }],
    });
  }

  // The minimum above is on the pre-discount subtotal; the code is validated
  // (and its row locked) here, then priced by the same computeTotals (BR-DC5).
  const discount = discountCode
    ? await discounts.validateForOrder(
      { code: discountCode, customerUserId, restaurantId: restaurant.id, subtotal: totals.subtotal }, trx,
    )
    : null;
  if (discount) totals = computeTotals({ ...pricing, discount });

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
      discount_amount: totals.discountAmount,
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

  // A code worth nothing on this order (zero-value) leaves no redemption.
  if (discount && !money.isZero(totals.discountAmount)) {
    await discounts.recordRedemption(
      { orderId: created.id, discountCodeId: discount.id, code: discount.code, amount: totals.discountAmount },
      trx,
    );
  }

  await repo.appendEvent(
    { orderId: created.id, from: null, to: 'PENDING', actorUserId: actor.id, actorRole: actor.role },
    trx,
  );

  // Checkout and admin placement both come through here, so one hook covers both.
  // A card order is hidden until paid; `payments.onPaid` announces it then.
  if (created.payment_method !== 'CARD') publishOrderEvent(trx, created, EVENT_TYPES.ORDER_CREATED);
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
export async function transition(orderId, toStatus, actor, opts = {}) {
  const updated = await withTransaction((trx) => transitionInTransaction(orderId, toStatus, actor, opts, trx));
  // After commit, outside any lock: refund a paid card order that was cancelled.
  if (toStatus === 'CANCELLED') await settleCancelled(updated);
  await notifyStatusChange(updated, toStatus);
  return updated;
}

/**
 * The body of `transition`, for a caller that owns the surrounding transaction
 * (the admin force-cancel commits its audit row with it). Such a caller must
 * call `settleCancelled` itself once its transaction has committed.
 */
async function transitionInTransaction(orderId, toStatus, actor, { reason, note, scope } = {}, trx) {
  const order = await repo.findByIdForUpdate(orderId, trx);
  if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');

  // Ownership is checked before legality, so a cross-tenant probe gets 404
  // rather than a 409 that would confirm the order exists (ADR-010).
  assertActorOwnsOrder(order, actor, scope);
  // An unpaid card order does not exist as far as the restaurant is concerned (BR-P4).
  if (
    actor.role === 'RESTAURANT' && order.payment_method === 'CARD'
    && !(await payments.isSettled(orderId, trx))
  ) {
    throw new NotFoundError('RESOURCE_NOT_FOUND');
  }
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
  const [items, events, driver, review, payment, discountCode] = await Promise.all([
    repo.listItems(orderId),
    repo.listEvents(orderId),
    repo.findDriverUser(order.driver_user_id),
    repo.hasReview(orderId),
    payments.getForOrder(orderId),
    discountCodeOf(orderId),
  ]);
  const restaurant = await restaurants.getRestaurantById(order.restaurant_id);
  return toCustomerOrderDto(
    { ...order, has_review: Boolean(review), discount_code: discountCode, restaurant_phone: restaurant?.phone,
      restaurant_logo_url: restaurant?.logo_url },
    { items, events, driver, payment: payments.toCustomerDto(payment) },
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
  const [items, events, discountCode] = await Promise.all([
    repo.listItems(orderId), repo.listEvents(orderId), discountCodeOf(orderId),
  ]);
  return {
    ...toRestaurantOrderDto({ ...order, discount_code: discountCode }, { items, events }),
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
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status ?? null,
    })),
    meta: paginationMeta({ page, limit, total }),
  };
}

export async function adminGetOrder(orderId) {
  const order = await repo.findDetailForAdmin(orderId);
  if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');
  const [items, events, payment, discountCode] = await Promise.all([
    repo.listItems(orderId), repo.listEvents(orderId), payments.getForOrder(orderId), discountCodeOf(orderId),
  ]);
  return toAdminOrderDto(
    { ...order, discount_code: discountCode },
    { items, events, payment: payments.toAdminPaymentDto(payment) },
  );
}

/**
 * Admin force-cancel: the same transition as every other cancellation, inside
 * the caller's transaction so the audit row commits with it. The caller then
 * calls `settleCancelled` (exported) once that transaction has committed.
 */
export async function adminForceCancel(adminUserId, orderId, { reason, note }, trx) {
  return withTransaction(
    (t) => transitionInTransaction(orderId, 'CANCELLED', { id: adminUserId, role: 'ADMIN' }, { reason, note }, t),
    trx,
  );
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
export async function systemCancelStale(orderId, {
  reason = 'ACCEPT_TIMEOUT',
  note = 'Automatically cancelled: the restaurant did not respond in time.',
} = {}) {
  try {
    await transition(orderId, 'CANCELLED', { id: null, role: 'SYSTEM' }, { reason, note });
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
