import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { wrapAll } from '../../shared/http/asyncHandler.js';
import { idParam } from '../../shared/validation/common.js';
import * as rawCtrl from './users.controller.js';
const ctrl = wrapAll(rawCtrl);
import { updateProfileSchema, createAddressSchema, updateAddressSchema } from './users.schemas.js';

export const meRouter = Router();
meRouter.get('/', authenticate, ctrl.getMe);
meRouter.patch('/', authenticate, validate({ body: updateProfileSchema }), ctrl.updateMe);

export const addressRouter = Router();
addressRouter.use(authenticate, authorize('CUSTOMER'));
addressRouter.get('/', ctrl.listAddresses);
addressRouter.post('/', validate({ body: createAddressSchema }), ctrl.createAddress);
addressRouter.patch('/:id', validate({ params: idParam, body: updateAddressSchema }), ctrl.updateAddress);
addressRouter.delete('/:id', validate({ params: idParam }), ctrl.deleteAddress);
addressRouter.post('/:id/default', validate({ params: idParam }), ctrl.setDefaultAddress);
