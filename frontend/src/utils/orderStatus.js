/**
 * Presentation for order status. Status is never conveyed by colour alone -
 * every badge pairs a colour with text (NFR-14).
 */
export const ORDER_FLOW = [
  'PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED',
];

export const STATUS_LABEL = {
  PENDING: 'Waiting for the restaurant',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Being prepared',
  READY_FOR_PICKUP: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const STATUS_CLASS = {
  PENDING: 'bg-amber-100 text-amber-900 border-amber-300',
  CONFIRMED: 'bg-sky-100 text-sky-900 border-sky-300',
  PREPARING: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  READY_FOR_PICKUP: 'bg-violet-100 text-violet-900 border-violet-300',
  OUT_FOR_DELIVERY: 'bg-blue-100 text-blue-900 border-blue-300',
  DELIVERED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  CANCELLED: 'bg-slate-200 text-slate-800 border-slate-400',
};

/** Payment state as the customer and admin see it (spec-11). */
export const PAYMENT_STATUS_LABEL = {
  INITIATED: 'Awaiting payment',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  REFUNDING: 'Refund in progress',
  REFUNDED: 'Refunded',
  REFUND_FAILED: 'Refund failed',
};

export const PAYMENT_STATUS_CLASS = {
  INITIATED: 'bg-amber-100 text-amber-900 border-amber-300',
  PAID: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  FAILED: 'bg-red-100 text-red-900 border-red-300',
  REFUNDING: 'bg-sky-100 text-sky-900 border-sky-300',
  REFUNDED: 'bg-slate-200 text-slate-800 border-slate-400',
  REFUND_FAILED: 'bg-red-100 text-red-900 border-red-300',
};

export const isTerminal = (status) => status === 'DELIVERED' || status === 'CANCELLED';

/** Customers may cancel only while PENDING or CONFIRMED (FR-6.6). The server
 *  refuses anything else regardless; this only keeps the UI honest. */
export const canCustomerCancel = (status) => status === 'PENDING' || status === 'CONFIRMED';

/**
 * Actions a restaurant may take from a given status. Mirrors the transition
 * table so an illegal action is never offered - the server re-checks it.
 */
export function restaurantActions(status) {
  switch (status) {
    case 'PENDING':
      return [
        { key: 'accept', label: 'Accept order', variant: 'primary' },
        { key: 'reject', label: 'Reject', variant: 'danger', requiresReason: true },
      ];
    case 'CONFIRMED':
      return [
        { key: 'start-preparing', label: 'Start preparing', variant: 'primary' },
        { key: 'cancel', label: 'Cancel', variant: 'danger', requiresReason: true },
      ];
    case 'PREPARING':
      return [
        { key: 'ready', label: 'Mark ready for pickup', variant: 'primary' },
        { key: 'cancel', label: 'Cancel', variant: 'danger', requiresReason: true },
      ];
    default:
      return [];
  }
}

export const CANCELLATION_REASONS = [
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
  { value: 'RESTAURANT_TOO_BUSY', label: 'Too busy to fulfil' },
  { value: 'RESTAURANT_CLOSED', label: 'Closing now' },
  { value: 'UNDELIVERABLE_ADDRESS', label: 'Address cannot be delivered to' },
  { value: 'ADMIN_INTERVENTION', label: 'Administrative decision' },
];

export const CART_ISSUE_LABEL = {
  ITEM_UNAVAILABLE: 'No longer available',
  ITEM_REMOVED: 'Removed from the menu',
  PRICE_CHANGED: 'Price changed',
};

export const UNAVAILABLE_REASON_LABEL = {
  NOT_ACTIVE: 'Not currently on FoodFlow',
  NOT_ACCEPTING: 'Not accepting orders right now',
  CLOSED_NOW: 'Closed right now',
};
