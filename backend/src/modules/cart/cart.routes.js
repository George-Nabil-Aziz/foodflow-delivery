import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { wrapAll } from '../../shared/http/asyncHandler.js';
import * as rawCtrl from './cart.controller.js';
const ctrl = wrapAll(rawCtrl);
import { addItemSchema, addItemQuery, updateQuantitySchema, lineParam } from './cart.schemas.js';

export const cartRouter = Router();

// Every route is customer-only, and the cart is resolved from the token: no
// route accepts a cart id, so there is no cart to address but your own.
cartRouter.use(authenticate, authorize('CUSTOMER'));

cartRouter.get('/', ctrl.getCart);
cartRouter.post('/items', validate({ body: addItemSchema, query: addItemQuery }), ctrl.addItem);
cartRouter.patch('/items/:itemId', validate({ params: lineParam, body: updateQuantitySchema }), ctrl.updateQuantity);
cartRouter.delete('/items/:itemId', validate({ params: lineParam }), ctrl.removeItem);
cartRouter.delete('/', ctrl.clearCart);
