import { ok } from '../../shared/http/envelope.js';
import * as service from './analytics.service.js';

/** The restaurant comes from the token (`req.restaurant`), never from the
 *  request, so an owner can only ever read their own figures. */
export async function get(req, res) {
  res.json(ok(await service.restaurantAnalytics(req.restaurant.id, req.validated.query.days), { requestId: req.id }));
}
