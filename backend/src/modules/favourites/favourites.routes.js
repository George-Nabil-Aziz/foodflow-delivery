import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { wrapAll } from '../../shared/http/asyncHandler.js';
import { idParam } from '../../shared/validation/common.js';
import * as rawCtrl from './favourites.controller.js';
const ctrl = wrapAll(rawCtrl);

/** Customers only: a favourite is a customer's shortlist (spec-16). */
export const favouritesRouter = Router();

favouritesRouter.use(authenticate, authorize('CUSTOMER'));

favouritesRouter.get('/', ctrl.list);
// PUT and DELETE are idempotent by definition; the target id is in the path.
favouritesRouter.put('/restaurants/:id', validate({ params: idParam }), ctrl.addRestaurant);
favouritesRouter.delete('/restaurants/:id', validate({ params: idParam }), ctrl.removeRestaurant);
favouritesRouter.put('/items/:id', validate({ params: idParam }), ctrl.addItem);
favouritesRouter.delete('/items/:id', validate({ params: idParam }), ctrl.removeItem);
