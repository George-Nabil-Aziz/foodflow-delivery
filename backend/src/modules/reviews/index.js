/** Public interface of the reviews module (NFR-1). */
export {
  recomputeAggregates,
  setModerationStatus,
  adminList,
  isOrderReviewed,
  listForRestaurantPublic,
  listForOwner,
} from './reviews.service.js';

export { reviewsRouter } from './reviews.routes.js';
export * as reviewsController from './reviews.controller.js';
