import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { wrapAll, asyncHandler } from '../../shared/http/asyncHandler.js';
import * as rawCtrl from './delivery.controller.js';
const ctrl = wrapAll(rawCtrl);
import * as service from './delivery.service.js';
import {
  updateDriverProfileSchema, availabilitySchema, locationSchema,
  declineSchema, offerParam, orderParam, deliveriesQuery,
} from './delivery.schemas.js';

export const driverRouter = Router();

driverRouter.use(authenticate, authorize('DRIVER'));

/** Profile is readable while PENDING_APPROVAL so the driver can see why they
 *  cannot work yet; everything operational requires an ACTIVE profile. */
driverRouter.get('/profile', ctrl.getProfile);
driverRouter.patch('/profile', validate({ body: updateDriverProfileSchema }), ctrl.updateProfile);

const requireActive = asyncHandler(async (req, _res, next) => {
  try {
    await service.assertActiveDriver(req.user.id);
    next();
  } catch (err) {
    next(err);
  }
});

driverRouter.patch('/availability', requireActive, validate({ body: availabilitySchema }), ctrl.setAvailability);
driverRouter.patch('/location', requireActive, validate({ body: locationSchema }), ctrl.updateLocation);

driverRouter.get('/offers', requireActive, ctrl.listOffers);
driverRouter.post('/offers/:id/accept', requireActive, validate({ params: offerParam }), ctrl.acceptOffer);
driverRouter.post('/offers/:id/decline', requireActive, validate({ params: offerParam, body: declineSchema }), ctrl.declineOffer);

driverRouter.get('/deliveries', requireActive, validate({ query: deliveriesQuery }), ctrl.listDeliveries);
driverRouter.get('/deliveries/:orderId', requireActive, validate({ params: orderParam }), ctrl.getDelivery);
driverRouter.post('/deliveries/:orderId/pick-up', requireActive, validate({ params: orderParam }), ctrl.pickUp);
driverRouter.post('/deliveries/:orderId/deliver', requireActive, validate({ params: orderParam }), ctrl.deliver);

driverRouter.get('/reviews', requireActive, ctrl.listReviews);
