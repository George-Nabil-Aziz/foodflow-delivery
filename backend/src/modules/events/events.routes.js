import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { ok } from '../../shared/http/envelope.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { knex } from '../../shared/db/knex.js';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { issueTicket, redeemTicket } from './events.tickets.js';
import { attach } from './events.hub.js';

export const eventsRouter = Router();

const STREAM_ROLES = ['CUSTOMER', 'RESTAURANT', 'DRIVER'];

/**
 * Step one: trade the access token (a normal Authorization header) for a
 * single-use, 30-second stream ticket. Why a ticket: events.tickets.js.
 */
eventsRouter.post(
  '/ticket',
  authenticate,
  authorize(...STREAM_ROLES),
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(ok(issueTicket(req.user.id), { requestId: req.id }));
  }),
);

/**
 * Step two: open the stream with the ticket. Failures before the stream starts
 * are ordinary JSON errors; once it starts, the status line cannot change.
 *
 * No `authenticate` here: the ticket IS the credential, and the same account
 * checks run below against the database, so a user suspended after minting
 * the ticket still cannot connect.
 */
eventsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = redeemTicket(req.query.ticket);
    if (!userId) throw new UnauthorizedError('TOKEN_INVALID');

    const user = await knex('users')
      .select('id', 'role', 'status', 'deleted_at')
      .where({ id: userId })
      .first();
    if (!user || user.deleted_at) throw new UnauthorizedError('TOKEN_INVALID');
    if (user.status === 'SUSPENDED') throw new ForbiddenError('ACCOUNT_SUSPENDED');
    if (!STREAM_ROLES.includes(user.role)) throw new ForbiddenError('FORBIDDEN_ROLE');

    // Resolved server-side: the client never names a restaurant to listen to.
    let restaurantId = null;
    if (user.role === 'RESTAURANT') {
      const restaurant = await knex('restaurants')
        .where({ owner_user_id: user.id })
        .whereNull('deleted_at')
        .first('id');
      restaurantId = restaurant?.id ?? null;
    }

    attach(req, res, { user, restaurantId });
  }),
);
