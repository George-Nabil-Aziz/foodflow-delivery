/** Public interface of the delivery module (NFR-1). */
export {
  requestDispatch,
  dispatchOrder,
  expireOffer,
  releaseDriver,
  closeAssignmentsForOrder,
  getAcceptedAssignment,
  findOrdersNeedingDispatch,
  findExpiredOffers,
  findActiveAssignment,
  adminListDrivers,
  findProfile,
  insertProfile,
  updateProfileRaw,
  applyRatingAggregate,
} from './delivery.service.js';
export { driverRouter } from './delivery.routes.js';
