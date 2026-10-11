import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { ok } from '../../shared/http/envelope.js';
import { idParam, paginationQuery, uuid, trimmedString, email, phone } from '../../shared/validation/common.js';
import {
  USER_ROLES, USER_STATUSES, RESTAURANT_STATUSES, DRIVER_STATUSES,
  DRIVER_AVAILABILITY, VEHICLE_TYPES, ORDER_STATUSES, REVIEW_STATUSES,
  CANCELLATION_REASONS,
} from '../../shared/constants.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import * as service from './admin.service.js';
import { platformStats } from './stats.service.js';

/** Reason is mandatory on every destructive action (BR-AD5, FR-9.4). */
const reasonSchema = z.object({
  reason: trimmedString(5, 300),
  note: z.string().trim().max(300).optional().nullable(),
});
const optionalReasonSchema = z.object({
  reason: trimmedString(5, 300).optional(),
});

const cancelSchema = z.object({
  reason: z.enum(CANCELLATION_REASONS),
  note: z.string().trim().max(300).optional().nullable(),
});

export const adminRouter = Router();

adminRouter.use(authenticate, authorize('ADMIN'));

/* ------------------------------------------------------------ statistics */

adminRouter.get('/stats', asyncHandler(async (req, res) => {
  res.json(ok(await platformStats(), { requestId: req.id }));
}));

/* ----------------------------------------------------------------- users */

const usersQuery = paginationQuery.extend({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().min(2).max(60).optional(),
});

adminRouter.get('/users', validate({ query: usersQuery }), asyncHandler(async (req, res) => {
  const { data, meta } = await service.listUsers(req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}));

adminRouter.get('/users/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.json(ok(await service.getUser(req.validated.params.id), { requestId: req.id }));
}));

adminRouter.post(
  '/users/:id/suspend',
  validate({ params: idParam, body: reasonSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.suspendUser(req.user.id, req.validated.params.id, req.validated.body);
    res.json(ok(result, { requestId: req.id }));
  }),
);

adminRouter.post(
  '/users/:id/reactivate',
  validate({ params: idParam, body: optionalReasonSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.reactivateUser(req.user.id, req.validated.params.id, req.validated.body);
    res.json(ok(result, { requestId: req.id }));
  }),
);

/* --------------------------------------------------------------- drivers */

const driversQuery = paginationQuery.extend({
  status: z.enum(DRIVER_STATUSES).optional(),
  availability: z.enum(DRIVER_AVAILABILITY).optional(),
  q: z.string().trim().min(2).max(60).optional(),
});

const createDriverSchema = z.object({
  email,
  fullName: trimmedString(2, 100),
  phone,
  vehicleType: z.enum(VEHICLE_TYPES).default('MOTORCYCLE'),
  vehiclePlate: trimmedString(2, 20),
});

adminRouter.get('/drivers', validate({ query: driversQuery }), asyncHandler(async (req, res) => {
  const { data, meta } = await service.listDrivers(req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}));

adminRouter.post('/drivers', validate({ body: createDriverSchema }), asyncHandler(async (req, res) => {
  const result = await service.createDriver(req.user.id, req.validated.body);
  res.status(201).json(ok(result, { requestId: req.id }));
}));

adminRouter.post(
  '/drivers/:id/approve',
  validate({ params: idParam, body: optionalReasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.approveDriver(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);

adminRouter.post(
  '/drivers/:id/suspend',
  validate({ params: idParam, body: reasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.suspendDriver(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);

/* ----------------------------------------------------------- restaurants */

const restaurantsQuery = paginationQuery.extend({
  status: z.enum(RESTAURANT_STATUSES).optional(),
  q: z.string().trim().min(2).max(60).optional(),
});

adminRouter.get('/restaurants', validate({ query: restaurantsQuery }), asyncHandler(async (req, res) => {
  const { data, meta } = await service.listRestaurants(req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}));

adminRouter.post(
  '/restaurants/:id/approve',
  validate({ params: idParam, body: optionalReasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.approveRestaurant(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);

adminRouter.post(
  '/restaurants/:id/reject',
  validate({ params: idParam, body: reasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.rejectRestaurant(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);

adminRouter.post(
  '/restaurants/:id/suspend',
  validate({ params: idParam, body: reasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.suspendRestaurant(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);

adminRouter.post(
  '/restaurants/:id/reactivate',
  validate({ params: idParam, body: optionalReasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.reactivateRestaurant(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);

/* ---------------------------------------------------------------- orders */

const ordersQuery = paginationQuery.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  restaurantId: uuid.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine((v) => !v.from || !v.to || v.from <= v.to, {
  message: 'from must be before or equal to to',
  path: ['from'],
});

// Declared before /orders/:id so "unassigned" is never read as an id.
adminRouter.get('/orders/unassigned', asyncHandler(async (req, res) => {
  res.json(ok(await service.listUnassigned(), { requestId: req.id }));
}));

adminRouter.get('/orders/stuck', asyncHandler(async (req, res) => {
  res.json(ok(await service.listStuck(), { requestId: req.id }));
}));

adminRouter.get('/orders', validate({ query: ordersQuery }), asyncHandler(async (req, res) => {
  const { data, meta } = await service.listOrders(req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}));

adminRouter.get('/orders/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.json(ok(await service.getOrder(req.validated.params.id), { requestId: req.id }));
}));

adminRouter.post(
  '/orders/:id/force-cancel',
  validate({ params: idParam, body: cancelSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.forceCancelOrder(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);

/* --------------------------------------------------------------- reviews */

const reviewsQuery = paginationQuery.extend({
  status: z.enum(REVIEW_STATUSES).optional(),
  restaurantId: uuid.optional(),
});

adminRouter.get('/reviews', validate({ query: reviewsQuery }), asyncHandler(async (req, res) => {
  const { data, meta } = await service.listReviews(req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}));

adminRouter.post(
  '/reviews/:id/hide',
  validate({ params: idParam, body: reasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.hideReview(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);

adminRouter.post(
  '/reviews/:id/restore',
  validate({ params: idParam, body: optionalReasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.restoreReview(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);

/* ------------------------------------------------------------ audit logs */

const auditQuery = paginationQuery.extend({
  entityType: z.string().trim().max(40).optional(),
  entityId: uuid.optional(),
  adminId: uuid.optional(),
});

adminRouter.get('/audit-logs', validate({ query: auditQuery }), asyncHandler(async (req, res) => {
  const { data, meta } = await service.listAuditLogs(req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}));
