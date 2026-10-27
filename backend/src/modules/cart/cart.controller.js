import { ok } from '../../shared/http/envelope.js';
import * as service from './cart.service.js';

export async function getCart(req, res) {
  res.json(ok(await service.getCart(req.user.id), { requestId: req.id }));
}

export async function addItem(req, res) {
  const cart = await service.addItem(req.user.id, req.validated.body, {
    replace: req.validated.query.replace,
  });
  res.json(ok(cart, { requestId: req.id }));
}

export async function updateQuantity(req, res) {
  const cart = await service.updateQuantity(
    req.user.id, req.validated.params.itemId, req.validated.body.quantity,
  );
  res.json(ok(cart, { requestId: req.id }));
}

export async function removeItem(req, res) {
  const cart = await service.removeItem(req.user.id, req.validated.params.itemId);
  res.json(ok(cart, { requestId: req.id }));
}

export async function applyDiscount(req, res) {
  res.json(ok(await service.applyDiscount(req.user.id, req.validated.body.code), { requestId: req.id }));
}

export async function removeDiscount(req, res) {
  res.json(ok(await service.removeDiscount(req.user.id), { requestId: req.id }));
}

export async function clearCart(req, res) {
  await service.clearCart(req.user.id);
  res.status(204).send();
}
