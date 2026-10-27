/**
 * Mirrors of the PostgreSQL enum types. A test asserts these match
 * `enum_range` exactly, so JS and SQL cannot drift (ADR-012, R-14).
 */
export const USER_ROLES = ['CUSTOMER', 'RESTAURANT', 'DRIVER', 'ADMIN'];
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'];
export const RESTAURANT_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED'];
export const DRIVER_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED'];
export const DRIVER_AVAILABILITY = ['OFFLINE', 'AVAILABLE', 'ON_DELIVERY'];
export const VEHICLE_TYPES = ['BICYCLE', 'MOTORCYCLE', 'CAR'];
export const CART_STATUSES = ['ACTIVE', 'CONVERTED', 'ABANDONED'];
export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];
export const DISPATCH_STATES = ['NOT_REQUIRED', 'UNASSIGNED', 'OFFERED', 'ASSIGNED', 'COMPLETED'];
export const ACTOR_TYPES = ['CUSTOMER', 'RESTAURANT', 'DRIVER', 'ADMIN', 'SYSTEM'];
export const CANCELLATION_REASONS = [
  'CUSTOMER_CHANGED_MIND',
  'CUSTOMER_ORDERED_BY_MISTAKE',
  'RESTAURANT_TOO_BUSY',
  'RESTAURANT_CLOSED',
  'OUT_OF_STOCK',
  'NO_DRIVER_AVAILABLE',
  'UNDELIVERABLE_ADDRESS',
  'ADMIN_INTERVENTION',
  'ACCEPT_TIMEOUT',
  'PAYMENT_TIMEOUT',
];
export const ASSIGNMENT_STATUSES = ['OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'COMPLETED'];
export const PAYMENT_METHODS = ['CASH_ON_DELIVERY', 'CARD'];
export const PAYMENT_STATUSES = ['INITIATED', 'PAID', 'FAILED', 'REFUNDING', 'REFUNDED', 'REFUND_FAILED'];
export const PAYMENT_PROVIDERS = ['moyasar', 'fake'];
export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'];
export const REVIEW_STATUSES = ['PUBLISHED', 'HIDDEN'];

export const CUISINE_TYPES = [
  'EGYPTIAN',
  'LEVANTINE',
  'ITALIAN',
  'INDIAN',
  'BURGERS',
  'SEAFOOD',
  'ASIAN',
  'DESSERTS',
  'COFFEE',
  'HEALTHY',
  'OTHER',
];

/** PostgreSQL enum type name -> JS mirror, consumed by the drift test. */
export const PG_ENUM_MIRRORS = {
  user_role: USER_ROLES,
  user_status: USER_STATUSES,
  restaurant_status: RESTAURANT_STATUSES,
  driver_status: DRIVER_STATUSES,
  driver_availability: DRIVER_AVAILABILITY,
  vehicle_type: VEHICLE_TYPES,
  cart_status: CART_STATUSES,
  order_status: ORDER_STATUSES,
  dispatch_state: DISPATCH_STATES,
  actor_type: ACTOR_TYPES,
  cancellation_reason: CANCELLATION_REASONS,
  assignment_status: ASSIGNMENT_STATUSES,
  payment_method: PAYMENT_METHODS,
  payment_status: PAYMENT_STATUSES,
  review_status: REVIEW_STATUSES,
};

export const CART_ITEM_MIN_QTY = 1;
export const CART_ITEM_MAX_QTY = 20;
export const REVIEW_EDIT_WINDOW_HOURS = 24;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** Cart line issue codes surfaced by revalidation (BR-C8). */
export const CART_ISSUES = {
  ITEM_UNAVAILABLE: 'ITEM_UNAVAILABLE',
  ITEM_REMOVED: 'ITEM_REMOVED',
  PRICE_CHANGED: 'PRICE_CHANGED',
};

/** Reasons orderability can fail, in precedence order (BR-R3). */
export const ORDERABILITY_REASONS = {
  OK: 'OK',
  NOT_ACTIVE: 'NOT_ACTIVE',
  NOT_ACCEPTING: 'NOT_ACCEPTING',
  CLOSED_NOW: 'CLOSED_NOW',
};
