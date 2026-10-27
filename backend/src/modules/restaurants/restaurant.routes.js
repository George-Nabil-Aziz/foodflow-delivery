import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { wrapAll } from '../../shared/http/asyncHandler.js';
import {
  attachRestaurant, requireApprovedRestaurant, requireActiveRestaurant,
} from '../../middleware/requireRestaurant.js';
import { idParam, paginationQuery } from '../../shared/validation/common.js';
import * as rawCtrl from './restaurant.controller.js';
const ctrl = wrapAll(rawCtrl);
import { ordersController as rawOrdersCtrl } from '../orders/index.js';
const ordersCtrl = wrapAll(rawOrdersCtrl);
import { reviewsController as rawReviewsCtrl } from '../reviews/index.js';
const reviewsCtrl = wrapAll(rawReviewsCtrl);
import { analyticsController as rawAnalyticsCtrl, analyticsQuery } from '../analytics/index.js';
const analyticsCtrl = wrapAll(rawAnalyticsCtrl);
import {
  updateRestaurantSchema,
  replaceHoursSchema,
  acceptingOrdersSchema,
} from './restaurants.schemas.js';
import {
  createCategorySchema,
  updateCategorySchema,
  reorderCategoriesSchema,
  createItemSchema,
  updateItemSchema,
  availabilitySchema,
  listItemsQuery,
} from '../menu/index.js';
import { restaurantReasonSchema, restaurantOrdersQuery } from '../orders/index.js';

/**
 * Restaurant self-service. No route accepts a restaurant id: it is resolved
 * from the token by `attachRestaurant`, so the IDOR surface does not exist.
 */
export const restaurantRouter = Router();

restaurantRouter.use(authenticate, authorize('RESTAURANT'), attachRestaurant);

/* ---- setup: available while PENDING_APPROVAL (FR-2.7) ------------------ */

/*
 * Profile, hours AND menu are setup, not trading.
 *
 * Gating the menu on approval deadlocked onboarding: BR-AD10 refuses to
 * approve a restaurant with no available food item, so a restaurant that could
 * not add items until it was approved could never be approved at all. The
 * owner-facing copy already promised otherwise ("finish your profile, hours
 * and menu setup"), and TC-394 builds the menu before approval. Publishing is
 * what approval controls, and a pending restaurant's menu is not public
 * anyway: the public projection requires status = ACTIVE (BR-R2).
 */
restaurantRouter.get('/profile', ctrl.getProfile);
restaurantRouter.patch('/profile', validate({ body: updateRestaurantSchema }), ctrl.updateProfile);
restaurantRouter.get('/hours', ctrl.getHours);
restaurantRouter.put('/hours', validate({ body: replaceHoursSchema }), ctrl.replaceHours);

// Categories
restaurantRouter.get('/categories', ctrl.listCategories);
restaurantRouter.post('/categories', validate({ body: createCategorySchema }), ctrl.createCategory);
restaurantRouter.put(
  '/categories/order',
  validate({ body: reorderCategoriesSchema }),
  ctrl.reorderCategories,
);
restaurantRouter.patch(
  '/categories/:id',
  validate({ params: idParam, body: updateCategorySchema }),
  ctrl.updateCategory,
);
restaurantRouter.delete('/categories/:id', validate({ params: idParam }), ctrl.deleteCategory);

// Items
restaurantRouter.get('/items', validate({ query: listItemsQuery }), ctrl.listItems);
restaurantRouter.post('/items', validate({ body: createItemSchema }), ctrl.createItem);
restaurantRouter.patch(
  '/items/:id',
  validate({ params: idParam, body: updateItemSchema }),
  ctrl.updateItem,
);
restaurantRouter.patch(
  '/items/:id/availability',
  validate({ params: idParam, body: availabilitySchema }),
  ctrl.setAvailability,
);
restaurantRouter.delete('/items/:id', validate({ params: idParam }), ctrl.deleteItem);

/* ---- trading ----------------------------------------------------------- */

// Turning order-taking back on is a claim to be trading now, so it needs an
// ACTIVE restaurant. A suspended one must not be able to undo its suspension.
restaurantRouter.patch(
  '/accepting-orders',
  requireActiveRestaurant,
  validate({ body: acceptingOrdersSchema }),
  ctrl.setAcceptingOrders,
);

// Everything below needs a restaurant that has been approved, which includes a
// suspended one finishing the orders it already took (BR-R9).
restaurantRouter.use(requireApprovedRestaurant);

restaurantRouter.get('/stats', ctrl.getStats);
restaurantRouter.get('/analytics', validate({ query: analyticsQuery }), analyticsCtrl.get);

// Orders. Each transition is its own action endpoint (ADR-011), so the role
// guard lives in the router and `reject` can require a reason while `accept`
// requires nothing.
restaurantRouter.get(
  '/orders',
  validate({ query: restaurantOrdersQuery }),
  ordersCtrl.listForRestaurant,
);
restaurantRouter.get('/orders/:id', validate({ params: idParam }), ordersCtrl.getForRestaurant);
restaurantRouter.post('/orders/:id/accept', validate({ params: idParam }), ordersCtrl.accept);
restaurantRouter.post(
  '/orders/:id/reject',
  validate({ params: idParam, body: restaurantReasonSchema }),
  ordersCtrl.reject,
);
restaurantRouter.post(
  '/orders/:id/start-preparing',
  validate({ params: idParam }),
  ordersCtrl.startPreparing,
);
restaurantRouter.post('/orders/:id/ready', validate({ params: idParam }), ordersCtrl.markReady);
restaurantRouter.post(
  '/orders/:id/cancel',
  validate({ params: idParam, body: restaurantReasonSchema }),
  ordersCtrl.cancelByRestaurant,
);

// Reviews received
restaurantRouter.get('/reviews', validate({ query: paginationQuery }), reviewsCtrl.listForOwner);
