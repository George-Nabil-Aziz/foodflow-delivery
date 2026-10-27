import { ok } from '../../shared/http/envelope.js';
import * as service from './discovery.service.js';

/** Only a signed-in customer gets favourite flags; anyone else browses as before. */
const viewerOf = (req) => (req.user?.role === 'CUSTOMER' ? req.user.id : null);

export async function listRestaurants(req, res) {
  const { data, meta } = await service.listRestaurants(req.validated.query, viewerOf(req));
  res.json(ok(data, { requestId: req.id, ...meta }));
}

export async function getRestaurant(req, res) {
  res.json(ok(await service.getRestaurant(req.validated.params.id, viewerOf(req)), { requestId: req.id }));
}

export async function getMenu(req, res) {
  res.json(ok(await service.getMenu(req.validated.params.id, viewerOf(req)), { requestId: req.id }));
}

export async function search(req, res) {
  res.json(ok(await service.search(req.validated.query, viewerOf(req)), { requestId: req.id }));
}

export async function listCuisines(req, res) {
  res.json(ok(await service.listCuisines(), { requestId: req.id }));
}
