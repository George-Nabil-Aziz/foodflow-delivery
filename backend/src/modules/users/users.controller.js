import { ok } from '../../shared/http/envelope.js';
import * as service from './users.service.js';

export async function getMe(req, res) {
  res.json(ok(await service.getMe(req.user.id), { requestId: req.id }));
}

export async function updateMe(req, res) {
  const user = await service.updateProfile(req.user.id, req.validated.body);
  res.json(ok({ user }, { requestId: req.id }));
}

export async function listAddresses(req, res) {
  res.json(ok(await service.listAddresses(req.user.id), { requestId: req.id }));
}

export async function createAddress(req, res) {
  const address = await service.createAddress(req.user.id, req.validated.body);
  res.status(201).json(ok(address, { requestId: req.id }));
}

export async function updateAddress(req, res) {
  const address = await service.updateAddress(req.user.id, req.validated.params.id, req.validated.body);
  res.json(ok(address, { requestId: req.id }));
}

export async function deleteAddress(req, res) {
  await service.deleteAddress(req.user.id, req.validated.params.id);
  res.status(204).send();
}

export async function setDefaultAddress(req, res) {
  const address = await service.setDefaultAddress(req.user.id, req.validated.params.id);
  res.json(ok(address, { requestId: req.id }));
}
