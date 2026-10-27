/**
 * The single error-code registry (BR-F4). Every code used anywhere in the API
 * is defined here with its HTTP status and its outward-facing message.
 *
 * `AppError` refuses to construct an unregistered code, so a typo becomes a
 * loud failure rather than a silent 500.
 */
export const CODES = {
  // 400
  MALFORMED_REQUEST: 400,
  // 401
  INVALID_CREDENTIALS: 401,
  TOKEN_MISSING: 401,
  TOKEN_INVALID: 401,
  TOKEN_EXPIRED: 401,
  REFRESH_TOKEN_INVALID: 401,
  REFRESH_TOKEN_REUSED: 401,
  // 403
  FORBIDDEN_ROLE: 403,
  ACCOUNT_SUSPENDED: 403,
  RESTAURANT_NOT_APPROVED: 403,
  // 404
  RESOURCE_NOT_FOUND: 404,
  // 409
  EMAIL_ALREADY_REGISTERED: 409,
  CART_RESTAURANT_MISMATCH: 409,
  INVALID_ORDER_TRANSITION: 409,
  CATEGORY_NOT_EMPTY: 409,
  REVIEW_ALREADY_EXISTS: 409,
  REVIEW_EDIT_WINDOW_CLOSED: 409,
  DRIVER_HAS_ACTIVE_DELIVERY: 409,
  HAS_ACTIVE_ORDERS: 409,
  OFFER_NO_LONGER_AVAILABLE: 409,
  PAYMENT_NOT_REFUNDABLE: 409,
  OPTION_GROUP_UNSATISFIABLE: 409,
  CONFLICT: 409,
  // 422
  VALIDATION_ERROR: 422,
  CART_EMPTY: 422,
  CART_HAS_ISSUES: 422,
  BELOW_MINIMUM_ORDER: 422,
  DISCOUNT_CODE_INVALID: 422,
  DISCOUNT_CODE_EXPIRED: 422,
  DISCOUNT_CODE_NOT_APPLICABLE: 422,
  DISCOUNT_CODE_LIMIT_REACHED: 422,
  ITEM_UNAVAILABLE: 422,
  ITEM_OPTIONS_INVALID: 422,
  RESTAURANT_UNAVAILABLE: 422,
  ORDER_NOT_REVIEWABLE: 422,
  PAYMENT_NOT_VERIFIED: 422,
  CARD_PAYMENTS_UNAVAILABLE: 422,
  UNPROCESSABLE: 422,
  // 429
  RATE_LIMIT_EXCEEDED: 429,
  // 500
  INTERNAL_ERROR: 500,
  // 503
  PAYMENT_PROVIDER_UNAVAILABLE: 503,
};

/**
 * Outward-facing messages. Deliberately generic: detail goes to the logs,
 * keyed by the request ID, so a client learns what to do without learning
 * anything about the system's internals.
 */
export const PUBLIC_MESSAGES = {
  MALFORMED_REQUEST: 'The request could not be read.',
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  TOKEN_MISSING: 'Authentication is required.',
  TOKEN_INVALID: 'Your session is not valid. Please sign in again.',
  TOKEN_EXPIRED: 'Your session has expired.',
  REFRESH_TOKEN_INVALID: 'Your session is no longer valid. Please sign in again.',
  REFRESH_TOKEN_REUSED: 'Your session was ended for security reasons. Please sign in again.',
  FORBIDDEN_ROLE: 'You do not have permission to perform this action.',
  ACCOUNT_SUSPENDED: 'This account is suspended.',
  RESTAURANT_NOT_APPROVED: 'Your restaurant is not approved for this action yet.',
  RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  EMAIL_ALREADY_REGISTERED: 'An account with this email already exists.',
  CART_RESTAURANT_MISMATCH: 'Your cart contains items from a different restaurant.',
  INVALID_ORDER_TRANSITION: 'This order can no longer be changed in that way.',
  CATEGORY_NOT_EMPTY: 'This category still contains items.',
  REVIEW_ALREADY_EXISTS: 'You have already reviewed this order.',
  REVIEW_EDIT_WINDOW_CLOSED: 'This review can no longer be edited.',
  DRIVER_HAS_ACTIVE_DELIVERY: 'This driver has an active delivery.',
  HAS_ACTIVE_ORDERS: 'There are orders still in progress.',
  OFFER_NO_LONGER_AVAILABLE: 'This delivery offer is no longer available.',
  PAYMENT_NOT_REFUNDABLE: 'This payment cannot be refunded in its current state.',
  OPTION_GROUP_UNSATISFIABLE: 'Removing this option would leave customers unable to order the item.',
  CONFLICT: 'The request conflicts with the current state.',
  VALIDATION_ERROR: 'Some of the submitted values are not valid.',
  CART_EMPTY: 'Your cart is empty.',
  CART_HAS_ISSUES: 'Some items in your cart need attention before checkout.',
  BELOW_MINIMUM_ORDER: 'Your order is below this restaurant’s minimum.',
  DISCOUNT_CODE_INVALID: 'This discount code is not valid.',
  DISCOUNT_CODE_EXPIRED: 'This discount code is not valid at this time.',
  DISCOUNT_CODE_NOT_APPLICABLE: 'This discount code cannot be used on this order.',
  DISCOUNT_CODE_LIMIT_REACHED: 'This discount code has reached its usage limit.',
  ITEM_UNAVAILABLE: 'This item is currently unavailable.',
  ITEM_OPTIONS_INVALID: 'The chosen options are not valid for this item.',
  RESTAURANT_UNAVAILABLE: 'This restaurant is not accepting orders right now.',
  ORDER_NOT_REVIEWABLE: 'This order cannot be reviewed.',
  PAYMENT_NOT_VERIFIED: 'We could not verify this payment.',
  CARD_PAYMENTS_UNAVAILABLE: 'Card payments are not available right now.',
  UNPROCESSABLE: 'The request could not be processed.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again shortly.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'The payment service is not responding. Please try again shortly.',
};

export const isRegisteredCode = (code) => Object.hasOwn(CODES, code);
