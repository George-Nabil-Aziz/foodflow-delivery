import { NotFoundError } from '../shared/errors/AppError.js';

export function notFound(_req, _res, next) {
  next(new NotFoundError('RESOURCE_NOT_FOUND'));
}
