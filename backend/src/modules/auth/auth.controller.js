import { ok } from '../../shared/http/envelope.js';
import * as authService from './auth.service.js';

const context = (req) => ({
  userAgent: req.headers['user-agent'] ?? null,
  ipAddress: req.ip ?? null,
});

export async function register(req, res) {
  const result = await authService.register(req.validated.body, context(req));
  res.status(201).json(ok(result, { requestId: req.id }));
}

export async function login(req, res) {
  const result = await authService.login(req.validated.body, context(req));
  res.json(ok(result, { requestId: req.id }));
}

export async function refresh(req, res) {
  const result = await authService.refresh(req.validated.body, context(req));
  res.json(ok(result, { requestId: req.id }));
}

export async function logout(req, res) {
  await authService.logout(req.validated.body);
  res.status(204).send();
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.validated.body;
  await authService.changePassword({ userId: req.user.id, currentPassword, newPassword });
  res.status(204).send();
}
