import { Router } from 'express';
import { ok, fail } from './shared/http/envelope.js';
import { asyncHandler } from './shared/http/asyncHandler.js';
import { checkDatabase } from './shared/db/knex.js';
import { authRouter } from './modules/auth/index.js';
import { meRouter, addressRouter } from './modules/users/index.js';
import { restaurantRouter } from './modules/restaurants/index.js';
import { restaurantsPublicRouter, searchRouter, cuisinesRouter } from './modules/discovery/index.js';
import { cartRouter } from './modules/cart/index.js';
import { ordersRouter } from './modules/orders/index.js';
import { driverRouter } from './modules/delivery/index.js';
import { reviewsRouter } from './modules/reviews/index.js';
import { adminRouter } from './modules/admin/index.js';
import { paymentsRouter } from './modules/payments/index.js';

export const apiRouter = Router();

/** Health: 200 when the database answers, 503 when it does not. A health check
 *  that returns 200 with an unreachable database keeps a broken instance in the
 *  load balancer. */
apiRouter.get('/health', asyncHandler(async (req, res) => {
  const dbUp = await checkDatabase();
  const body = {
    status: dbUp ? 'ok' : 'degraded',
    uptime: Math.round(process.uptime()),
    database: dbUp ? 'up' : 'down',
    version: process.env.npm_package_version ?? '1.0.0',
  };
  res.status(dbUp ? 200 : 503).json(
    dbUp
      ? ok(body, { requestId: req.id })
      : { ...fail({ code: 'INTERNAL_ERROR', message: 'Database unavailable.' }, { requestId: req.id }), data: body },
  );
}));

apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/addresses', addressRouter);
apiRouter.use('/restaurants', restaurantsPublicRouter);
apiRouter.use('/restaurant', restaurantRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/cuisines', cuisinesRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/driver', driverRouter);
apiRouter.use('/reviews', reviewsRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/payments', paymentsRouter);
