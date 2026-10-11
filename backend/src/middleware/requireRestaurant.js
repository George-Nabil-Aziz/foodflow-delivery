import { ForbiddenError, NotFoundError } from '../shared/errors/AppError.js';
import { knex } from '../shared/db/knex.js';

/**
 * Resolves the caller's restaurant from the token and attaches it to
 * `req.restaurant`.
 *
 * No restaurant-scoped route accepts a restaurant id from the client, so the
 * IDOR surface is removed rather than defended: there is no id to tamper with.
 */
export async function attachRestaurant(req, _res, next) {
  try {
    const restaurant = await knex('restaurants')
      .where({ owner_user_id: req.user.id })
      .whereNull('deleted_at')
      .first();
    if (!restaurant) throw new NotFoundError('RESOURCE_NOT_FOUND');
    req.restaurant = restaurant;
    next();
  } catch (err) {
    next(err);
  }
}

const refuse = (status) =>
  new ForbiddenError('RESTAURANT_NOT_APPROVED', {
    details: [{
      field: 'status',
      issue: `Your restaurant is ${status ?? 'unavailable'}.`,
      status: status ?? null,
    }],
  });

/**
 * Requires a restaurant that is trading right now.
 *
 * Used only where the action would extend the restaurant's reach: turning
 * order-taking back on, and reading trading statistics. Setup routes do not
 * use it (FR-2.7), and neither do order transitions — see below.
 */
export function requireActiveRestaurant(req, _res, next) {
  if (req.restaurant?.status !== 'ACTIVE') return next(refuse(req.restaurant?.status));
  next();
}

/**
 * Requires a restaurant that has been approved at least once, which includes a
 * SUSPENDED one.
 *
 * BR-R9 and BR-AD3: suspension stops new trade but must not cancel food that
 * is already being cooked — "orders already in progress will still complete",
 * as both the admin's suspend dialog and the owner's own dashboard promise.
 * Requiring ACTIVE here stranded every in-flight order at its current status,
 * because the owner could no longer advance it.
 *
 * Nothing new can arrive in the meantime: BR-R3 makes a non-ACTIVE restaurant
 * unorderable at add-to-cart and at checkout, so the only orders reachable
 * here are ones placed while the restaurant was trading.
 */
export function requireApprovedRestaurant(req, _res, next) {
  const status = req.restaurant?.status;
  if (status !== 'ACTIVE' && status !== 'SUSPENDED') return next(refuse(status));
  next();
}
