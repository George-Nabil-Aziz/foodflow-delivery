import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { ok } from '../../shared/http/envelope.js';
import * as service from './payments.service.js';

export const paymentsRouter = Router();

/** What the checkout page needs to decide whether to offer card payment. */
paymentsRouter.get('/config', authenticate, authorize('CUSTOMER'), asyncHandler(async (req, res) => {
  res.json(ok(service.getPublicConfig(), { requestId: req.id }));
}));

// The webhook is public by necessity: Moyasar calls it, so it is authenticated
// by the shared secret token in the body rather than by a user session, and
// disabled (404) until MOYASAR_WEBHOOK_SECRET is set.
const webhookBody = z.object({
  type: z.string().max(80).optional(),
  secret_token: z.string().max(200).optional(),
  data: z.object({ id: z.string().max(100) }).passthrough().optional(),
}).passthrough();

paymentsRouter.post(
  '/webhooks/moyasar',
  validate({ body: webhookBody }),
  asyncHandler(async (req, res) => {
    await service.handleWebhook(req.validated.body);
    res.json(ok({ received: true }, { requestId: req.id }));
  }),
);
