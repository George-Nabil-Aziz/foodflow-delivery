import { ForbiddenError, UnauthorizedError } from '../shared/errors/AppError.js';

/**
 * Role gate. This is layer one of two: it says "a restaurant", and the service
 * layer says "this restaurant" via an ownership predicate applied in SQL.
 * Neither is sufficient alone.
 */
export const authorize = (...roles) =>
  // Named rather than an anonymous arrow so the guard is identifiable in the
  // router audit test and in stack traces.
  function authorize(req, _res, next) {
    if (!req.user) return next(new UnauthorizedError('TOKEN_MISSING'));
    if (roles.length && !roles.includes(req.user.role)) {
      return next(new ForbiddenError('FORBIDDEN_ROLE'));
    }
    next();
  };
