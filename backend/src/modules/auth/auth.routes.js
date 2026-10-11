import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { wrapAll } from '../../shared/http/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authLimiter, refreshLimiter } from '../../middleware/rateLimiters.js';
import * as rawCtrl from './auth.controller.js';
const ctrl = wrapAll(rawCtrl);
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
} from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), ctrl.register);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), ctrl.login);
authRouter.post('/refresh', refreshLimiter, validate({ body: refreshSchema }), ctrl.refresh);
authRouter.post('/logout', authenticate, validate({ body: refreshSchema }), ctrl.logout);
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  ctrl.changePassword,
);
