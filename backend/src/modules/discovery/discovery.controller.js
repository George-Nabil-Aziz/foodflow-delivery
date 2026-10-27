import { ok } from '../../shared/http/envelope.js';
import * as service from './discovery.service.js';

export async function listRestaurants(req, res) {
  const { data, meta } = await service.listRestaurants(req.validated.query, req.user);
  res.json(ok(data, { requestId: req.id, ...meta }));
}

export async function getRestaurant(req, res) {
  res.json(ok(await service.getRestaurant(req.validated.params.id, req.user, req.validated.query.addressId), { requestId: req.id }));
}

export async function getMenu(req, res) {
  res.json(ok(await service.getMenu(req.validated.params.id, req.user), { requestId: req.id }));
}

export async function search(req, res) {
  res.json(ok(await service.search(req.validated.query, req.user), { requestId: req.id }));
}

export async function listCuisines(req, res) {
  res.json(ok(await service.listCuisines(), { requestId: req.id }));
}
