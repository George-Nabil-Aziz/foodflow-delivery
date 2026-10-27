import { ok } from '../../shared/http/envelope.js';
import * as service from './orders.service.js';

/* ---------------------------------------------------------- customer side */

export async function checkout(req, res) {
  const order = await service.checkout(req.user.id, req.validated.body);
  res.status(201).json(ok(order, { requestId: req.id }));
}

export async function listMine(req, res) {
  const { data, meta } = await service.listForCustomer(req.user.id, req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}

export async function getMine(req, res) {
  res.json(ok(await service.getCustomerOrder(req.user.id, req.validated.params.id), { requestId: req.id }));
}

export async function getStatus(req, res) {
  res.json(ok(await service.getCustomerOrderStatus(req.user.id, req.validated.params.id), { requestId: req.id }));
}

export async function cancelMine(req, res) {
  const order = await service.cancelByCustomer(req.user.id, req.validated.params.id, req.validated.body);
  res.json(ok(order, { requestId: req.id }));
}

export async function confirmPayment(req, res) {
  const { id } = req.validated.params;
  const order = await service.confirmPayment(req.user.id, id, req.validated.body.providerPaymentId);
  res.json(ok(order, { requestId: req.id }));
}

export async function simulatePayment(req, res) {
  res.json(ok(await service.simulatePayment(req.user.id, req.validated.params.id), { requestId: req.id }));
}

/* -------------------------------------------------------- restaurant side */

export async function listForRestaurant(req, res) {
  const { data, meta } = await service.listForRestaurant(req.restaurant.id, req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}

export async function getForRestaurant(req, res) {
  res.json(ok(await service.getRestaurantOrder(req.restaurant.id, req.validated.params.id), { requestId: req.id }));
}

/** One factory for the four restaurant transitions: each route differs only in
 *  its target status and whether a reason is required. */
const restaurantTransition = (toStatus, { requireReason = false } = {}) =>
  async function handler(req, res) {
    const body = req.validated.body ?? {};
    const order = await service.restaurantTransition({
      restaurantId: req.restaurant.id,
      ownerUserId: req.user.id,
      orderId: req.validated.params.id,
      toStatus,
      reason: requireReason ? body.reason : body.reason,
      note: body.note,
    });
    res.json(ok(order, { requestId: req.id }));
  };

export const accept = restaurantTransition('CONFIRMED');
export const startPreparing = restaurantTransition('PREPARING');
export const markReady = restaurantTransition('READY_FOR_PICKUP');
export const reject = restaurantTransition('CANCELLED', { requireReason: true });
export const cancelByRestaurant = restaurantTransition('CANCELLED', { requireReason: true });
