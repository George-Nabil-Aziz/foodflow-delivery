import { ConflictError, NotFoundError, ValidationError } from './AppError.js';

/**
 * Translates PostgreSQL driver errors into domain errors at the repository
 * boundary, so a raw driver message never reaches a response.
 *
 * The design deliberately lets unique-index inserts fail rather than
 * pre-checking: a check-then-insert is a race, a unique index is not.
 */
const UNIQUE_CONSTRAINTS = {
  uq_users_email: 'EMAIL_ALREADY_REGISTERED',
  uq_reviews_order: 'REVIEW_ALREADY_EXISTS',
  uq_assignments_driver_active: 'DRIVER_HAS_ACTIVE_DELIVERY',
  uq_assignments_order_accepted: 'OFFER_NO_LONGER_AVAILABLE',
  uq_assignments_order_open: 'OFFER_NO_LONGER_AVAILABLE',
  uq_carts_one_active: 'CONFLICT',
  uq_addresses_one_default: 'CONFLICT',
  uq_categories_restaurant_name: 'CONFLICT',
  uq_food_items_category_name: 'CONFLICT',
  uq_restaurants_owner: 'CONFLICT',
  uq_restaurants_slug: 'CONFLICT',
  uq_hours_restaurant_day: 'CONFLICT',
  uq_cart_items_line: 'CONFLICT',
  uq_orders_order_number: 'CONFLICT',
};

export function mapPgError(err) {
  if (!err || typeof err !== 'object') return err;

  if (err.code === '23505') {
    const mapped = UNIQUE_CONSTRAINTS[err.constraint];
    if (mapped) return new ConflictError(mapped, { cause: err });
    return new ConflictError('CONFLICT', { cause: err });
  }
  if (err.code === '23503') return new NotFoundError('RESOURCE_NOT_FOUND', { cause: err });
  if (err.code === '23514' || err.code === '23502') {
    return new ValidationError('UNPROCESSABLE', {
      message: `Database constraint violated: ${err.constraint ?? err.column ?? 'unknown'}`,
      cause: err,
    });
  }
  return err;
}
