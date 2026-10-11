import { ok } from '../../shared/http/envelope.js';
import * as service from './delivery.service.js';
import * as orders from '../orders/index.js';

export async function getProfile(req, res) {
  res.json(ok(await service.getProfile(req.user.id), { requestId: req.id }));
}

export async function updateProfile(req, res) {
  res.json(ok(await service.updateProfile(req.user.id, req.validated.body), { requestId: req.id }));
}

export async function setAvailability(req, res) {
  const profile = await service.setAvailability(req.user.id, req.validated.body.availability);
  res.json(ok(profile, { requestId: req.id }));
}

export async function updateLocation(req, res) {
  res.json(ok(await service.updateLocation(req.user.id, req.validated.body), { requestId: req.id }));
}

export async function listOffers(req, res) {
  res.json(ok(await service.listOffers(req.user.id), { requestId: req.id }));
}

export async function acceptOffer(req, res) {
  const delivery = await service.acceptOffer(req.user.id, req.validated.params.id);
  res.json(ok(delivery, { requestId: req.id }));
}

export async function declineOffer(req, res) {
  await service.declineOffer(req.user.id, req.validated.params.id, req.validated.body);
  res.status(204).send();
}

export async function listDeliveries(req, res) {
  const { data, meta } = await service.listDeliveries(req.user.id, req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}

export async function getDelivery(req, res) {
  res.json(ok(await service.getDelivery(req.user.id, req.validated.params.orderId), { requestId: req.id }));
}

export async function pickUp(req, res) {
  await orders.driverTransition({
    driverUserId: req.user.id,
    orderId: req.validated.params.orderId,
    toStatus: 'OUT_FOR_DELIVERY',
  });
  res.json(ok(await service.getDelivery(req.user.id, req.validated.params.orderId), { requestId: req.id }));
}

export async function deliver(req, res) {
  await orders.driverTransition({
    driverUserId: req.user.id,
    orderId: req.validated.params.orderId,
    toStatus: 'DELIVERED',
  });
  res.json(ok(await service.getDelivery(req.user.id, req.validated.params.orderId), { requestId: req.id }));
}

export async function listReviews(req, res) {
  res.json(ok(await service.listDriverReviews(req.user.id), { requestId: req.id }));
}
