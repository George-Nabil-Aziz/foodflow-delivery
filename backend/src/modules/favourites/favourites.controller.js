import { ok } from '../../shared/http/envelope.js';
import * as service from './favourites.service.js';

export async function list(req, res) {
  res.json(ok(await service.listFavourites(req.user.id), { requestId: req.id }));
}

export async function addRestaurant(req, res) {
  res.json(ok(await service.addRestaurant(req.user.id, req.validated.params.id), { requestId: req.id }));
}

export async function removeRestaurant(req, res) {
  await service.removeRestaurant(req.user.id, req.validated.params.id);
  res.status(204).send();
}

export async function addItem(req, res) {
  res.json(ok(await service.addItem(req.user.id, req.validated.params.id), { requestId: req.id }));
}

export async function removeItem(req, res) {
  await service.removeItem(req.user.id, req.validated.params.id);
  res.status(204).send();
}
