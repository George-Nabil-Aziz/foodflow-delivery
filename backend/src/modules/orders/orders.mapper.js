import { maskPhone, firstName } from '../../shared/mask.js';

/**
 * Response mappers are allow-lists: they name the fields to include, never
 * delete the ones to exclude. A column added to the table tomorrow cannot leak.
 */
const toItemDto = (row) => ({
  id: row.id,
  foodItemId: row.food_item_id,
  name: row.item_name_snapshot,
  description: row.item_description_snapshot,
  unitPrice: row.unit_price,
  quantity: row.quantity,
  lineTotal: row.line_total,
  notes: row.notes,
  // Snapshotted at checkout, so later menu edits never change it (BR-O1).
  options: (row.options ?? []).map((o) => ({
    groupName: o.group_name_snapshot,
    name: o.option_name_snapshot,
    priceDelta: o.price_delta,
  })),
});

const toEventDto = (row) => ({
  status: row.to_status,
  fromStatus: row.from_status,
  at: row.created_at,
  actor: row.actor_role,
  reason: row.reason,
  note: row.note,
});

const baseOrder = (row) => ({
  id: row.id,
  orderNumber: row.order_number,
  status: row.status,
  dispatchState: row.dispatch_state,
  subtotal: row.subtotal,
  deliveryFee: row.delivery_fee,
  discountAmount: row.discount_amount,
  discountCode: row.discount_code ?? null,
  taxAmount: row.tax_amount,
  totalAmount: row.total_amount,
  paymentMethod: row.payment_method,
  customerNote: row.customer_note,
  cancelledBy: row.cancelled_by,
  cancellationReason: row.cancellation_reason,
  cancellationNote: row.cancellation_note,
  placedAt: row.placed_at,
  confirmedAt: row.confirmed_at,
  preparingAt: row.preparing_at,
  readyAt: row.ready_at,
  pickedUpAt: row.picked_up_at,
  deliveredAt: row.delivered_at,
  cancelledAt: row.cancelled_at,
  createdAt: row.created_at,
});

/** Customer view: their own order, plus the driver's name once en route. */
export function toCustomerOrderDto(row, { items = [], events = [], driver = null, payment = null } = {}) {
  return {
    ...baseOrder(row),
    payment,
    restaurant: {
      id: row.restaurant_id,
      name: row.restaurant_name_snapshot,
      phone: row.restaurant_phone ?? null,
      logoUrl: row.restaurant_logo_url ?? null,
    },
    deliveryAddress: row.delivery_address_snapshot,
    items: items.map(toItemDto),
    timeline: events.map(toEventDto),
    // Driver contact appears only once the order is actually out for delivery.
    driver:
      driver && row.status === 'OUT_FOR_DELIVERY'
        ? { firstName: firstName(driver.full_name), phone: maskPhone(driver.phone) }
        : null,
    canReview: row.status === 'DELIVERED' && !row.has_review,
  };
}

/** Restaurant view: customer first name and masked phone, never their email. */
export function toRestaurantOrderDto(row, { items = [], events = [] } = {}) {
  return {
    ...baseOrder(row),
    customer: {
      firstName: firstName(row.customer_full_name),
      phone: maskPhone(row.customer_phone),
    },
    deliveryAddress: row.delivery_address_snapshot,
    items: items.map(toItemDto),
    timeline: events.map(toEventDto),
  };
}

/** Admin view: everything, including both parties and the full event log. */
export function toAdminOrderDto(row, { items = [], events = [], payment = null } = {}) {
  return {
    ...baseOrder(row),
    payment,
    customer: {
      id: row.customer_user_id,
      fullName: row.customer_full_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
    restaurant: { id: row.restaurant_id, name: row.restaurant_name_snapshot },
    driver: row.driver_user_id
      ? { id: row.driver_user_id, fullName: row.driver_full_name, phone: row.driver_phone }
      : null,
    deliveryAddress: row.delivery_address_snapshot,
    items: items.map(toItemDto),
    timeline: events.map(toEventDto),
  };
}

/** Compact polling payload: the most-called endpoint in the system. */
export function toOrderStatusDto(row, { events = [], driver = null } = {}) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    dispatchState: row.dispatch_state,
    updatedAt: row.updated_at,
    driver:
      driver && row.status === 'OUT_FOR_DELIVERY'
        ? { firstName: firstName(driver.full_name), phone: maskPhone(driver.phone) }
        : null,
    timeline: events.map(toEventDto),
  };
}

export function toOrderSummaryDto(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    dispatchState: row.dispatch_state,
    totalAmount: row.total_amount,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status ?? null,
    itemCount: Number(row.item_count ?? 0),
    placedAt: row.placed_at,
    restaurant: { id: row.restaurant_id, name: row.restaurant_name_snapshot },
    canReview: row.status === 'DELIVERED' && !row.has_review,
  };
}
