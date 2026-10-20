/** Public interface of the restaurants module (NFR-1). */
export {
  getRestaurantById,
  getByOwner,
  assertOrderable,
  orderabilityFor,
  getPublicRestaurant,
  setStatus,
  countAvailableItems,
  adminList,
  getRestaurantByIdIncludingDeleted,
  softDeleteRestaurant,
  restoreRestaurant,
  applyRatingAggregate,
} from './restaurants.service.js';

export {
  computeOrderability,
  isWithinHours,
  dayOfWeek,
  minutesOfDay,
} from './orderability.js';

export {
  toPublicRestaurantDto,
  toOwnerRestaurantDto,
  toAdminRestaurantDto,
} from './restaurants.mapper.js';

export { restaurantRouter } from './restaurant.routes.js';
