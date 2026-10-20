/** Public interface of the orders module (NFR-1). */
export {
  transition,
  driverTransition,
  assignDriver,
  setDispatchState,
  getOrderById,
  countActiveOrdersForCustomer,
  countActiveOrdersForRestaurant,
  getOrderForActor,
  listEvents,
  adminList,
  adminGetOrder,
  adminForceCancel,
  adminPlaceOrder,
  notifyNewOrder,
  listUnassigned,
  listStuck,
  systemCancelStale,
} from './orders.service.js';

export { listItems as listOrderItems } from './orders.repository.js';
export { computeTotals, meetsMinimum, shortfall } from './orderPricing.js';
export { ordersRouter } from './orders.routes.js';
export * as ordersController from './orders.controller.js';
export { restaurantReasonSchema, restaurantOrdersQuery } from './orders.schemas.js';
