import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { wrapAll } from '../../shared/http/asyncHandler.js';
import { reviewLimiter } from '../../middleware/rateLimiters.js';
import { idParam } from '../../shared/validation/common.js';
import * as rawCtrl from './reviews.controller.js';
const ctrl = wrapAll(rawCtrl);
import { createReviewSchema, updateReviewSchema, reviewsQuery } from './reviews.schemas.js';

export const reviewsRouter = Router();

reviewsRouter.post(
  '/', authenticate, authorize('CUSTOMER'), reviewLimiter,
  validate({ body: createReviewSchema }), ctrl.create,
);
reviewsRouter.get(
  '/mine', authenticate, authorize('CUSTOMER'),
  validate({ query: reviewsQuery }), ctrl.listMine,
);
reviewsRouter.patch(
  '/:id', authenticate, authorize('CUSTOMER'),
  validate({ params: idParam, body: updateReviewSchema }), ctrl.update,
);
