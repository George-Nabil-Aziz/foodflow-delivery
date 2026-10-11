import { ok } from '../../shared/http/envelope.js';
import * as service from './restaurants.service.js';
import * as menu from '../menu/index.js';

/* ------------------------------------------------------------ own profile */

export async function getProfile(req, res) {
  res.json(ok(await service.getOwnerProfile(req.user.id), { requestId: req.id }));
}

export async function updateProfile(req, res) {
  const data = await service.updateOwnerProfile(req.user.id, req.validated.body);
  res.json(ok(data, { requestId: req.id }));
}

export async function getHours(req, res) {
  res.json(ok(await service.getHours(req.user.id), { requestId: req.id }));
}

export async function replaceHours(req, res) {
  const hours = await service.replaceHours(req.user.id, req.validated.body.hours);
  res.json(ok(hours, { requestId: req.id }));
}

export async function setAcceptingOrders(req, res) {
  const data = await service.setAcceptingOrders(req.user.id, req.validated.body.isAcceptingOrders);
  res.json(ok(data, { requestId: req.id }));
}

export async function getStats(req, res) {
  res.json(ok(await service.getOwnerStats(req.user.id), { requestId: req.id }));
}

/* ------------------------------------------------------------------- menu */

export async function listCategories(req, res) {
  res.json(ok(await menu.listCategories(req.restaurant.id), { requestId: req.id }));
}

export async function createCategory(req, res) {
  const c = await menu.createCategory(req.restaurant.id, req.validated.body);
  res.status(201).json(ok(c, { requestId: req.id }));
}

export async function updateCategory(req, res) {
  const c = await menu.updateCategory(req.restaurant.id, req.validated.params.id, req.validated.body);
  res.json(ok(c, { requestId: req.id }));
}

export async function deleteCategory(req, res) {
  await menu.deleteCategory(req.restaurant.id, req.validated.params.id);
  res.status(204).send();
}

export async function reorderCategories(req, res) {
  const rows = await menu.reorderCategories(req.restaurant.id, req.validated.body.categories);
  res.json(ok(rows, { requestId: req.id }));
}

export async function listItems(req, res) {
  res.json(ok(await menu.listItems(req.restaurant.id, req.validated.query), { requestId: req.id }));
}

export async function createItem(req, res) {
  const item = await menu.createItem(req.restaurant.id, req.validated.body);
  res.status(201).json(ok(item, { requestId: req.id }));
}

export async function updateItem(req, res) {
  const item = await menu.updateItem(req.restaurant.id, req.validated.params.id, req.validated.body);
  res.json(ok(item, { requestId: req.id }));
}

export async function setAvailability(req, res) {
  const item = await menu.setAvailability(
    req.restaurant.id, req.validated.params.id, req.validated.body.isAvailable,
  );
  res.json(ok(item, { requestId: req.id }));
}

export async function deleteItem(req, res) {
  await menu.deleteItem(req.restaurant.id, req.validated.params.id);
  res.status(204).send();
}
