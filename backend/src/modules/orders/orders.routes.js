import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { wrapAll } from '../../shared/http/asyncHandler.js';
import { checkoutLimiter } from '../../middleware/rateLimiters.js';
import { idParam } from '../../shared/validation/common.js';
import * as rawCtrl from './orders.controller.js';
const ctrl = wrapAll(rawCtrl);
import { checkoutSchema, customerCancelSchema, ordersQuery } from './orders.schemas.js';

export const ordersRouter = Router();

ordersRouter.use(authenticate, authorize('CUSTOMER'));

ordersRouter.post('/', checkoutLimiter, validate({ body: checkoutSchema }), ctrl.checkout);
ordersRouter.get('/', validate({ query: ordersQuery }), ctrl.listMine);
ordersRouter.get('/:id', validate({ params: idParam }), ctrl.getMine);
ordersRouter.get('/:id/status', validate({ params: idParam }), ctrl.getStatus);
ordersRouter.post('/:id/cancel', validate({ params: idParam, body: customerCancelSchema }), ctrl.cancelMine);
