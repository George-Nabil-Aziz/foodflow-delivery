import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { wrapAll } from '../../shared/http/asyncHandler.js';
import { idParam, paginationQuery } from '../../shared/validation/common.js';
import * as rawCtrl from './discovery.controller.js';
const ctrl = wrapAll(rawCtrl);
import { reviewsController as rawReviewsCtrl } from '../reviews/index.js';
const reviewsCtrl = wrapAll(rawReviewsCtrl);
import { listRestaurantsQuery, searchQuery } from './discovery.schemas.js';

/**
 * Public discovery. No authentication: requiring a login to see what the
 * platform offers loses customers before they exist.
 */
export const restaurantsPublicRouter = Router();

restaurantsPublicRouter.get('/', validate({ query: listRestaurantsQuery }), ctrl.listRestaurants);
restaurantsPublicRouter.get('/:id', validate({ params: idParam }), ctrl.getRestaurant);
restaurantsPublicRouter.get('/:id/menu', validate({ params: idParam }), ctrl.getMenu);
restaurantsPublicRouter.get(
  '/:id/reviews',
  validate({ params: idParam, query: paginationQuery }),
  reviewsCtrl.listForRestaurant,
);

export const searchRouter = Router();
searchRouter.get('/', validate({ query: searchQuery }), ctrl.search);

export const cuisinesRouter = Router();
cuisinesRouter.get('/', ctrl.listCuisines);
