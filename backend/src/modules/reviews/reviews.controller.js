import { ok } from '../../shared/http/envelope.js';
import * as service from './reviews.service.js';

export async function create(req, res) {
  const review = await service.createReview(req.user.id, req.validated.body);
  res.status(201).json(ok(review, { requestId: req.id }));
}

export async function update(req, res) {
  const review = await service.updateReview(req.user.id, req.validated.params.id, req.validated.body);
  res.json(ok(review, { requestId: req.id }));
}

export async function listMine(req, res) {
  const { data, meta } = await service.listOwnReviews(req.user.id, req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}

export async function listForRestaurant(req, res) {
  const { data, meta } = await service.listForRestaurantPublic(
    req.validated.params.id, req.validated.query,
  );
  res.json(ok(data, { requestId: req.id, ...meta }));
}

export async function listForOwner(req, res) {
  const { data, meta } = await service.listForOwner(req.restaurant.id, req.validated.query);
  res.json(ok(data, { requestId: req.id, ...meta }));
}
