import { verifyAccessToken } from '../shared/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../shared/errors/AppError.js';
import { knex } from '../shared/db/knex.js';

/**
 * Verifies the access token, then loads the user and rejects suspended or
 * soft-deleted accounts.
 *
 * The database lookup is not optional for performance reasons: it is what makes
 * an admin suspension take effect on the very next request rather than whenever
 * the token happens to expire (FR-1.7, FR-9.3).
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ') || header.slice(7).trim() === '') {
      throw new UnauthorizedError('TOKEN_MISSING');
    }
    const payload = verifyAccessToken(header.slice(7).trim());

    const user = await knex('users')
      .select('id', 'email', 'full_name', 'role', 'status', 'deleted_at')
      .where({ id: payload.sub })
      .first();

    if (!user || user.deleted_at) throw new UnauthorizedError('TOKEN_INVALID');
    if (user.status === 'SUSPENDED') throw new ForbiddenError('ACCOUNT_SUSPENDED');

    req.user = { id: user.id, email: user.email, fullName: user.full_name, role: user.role, status: user.status };
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional authentication for endpoints that behave differently when signed in. */
export async function authenticateOptional(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();
  try {
    await authenticate(req, _res, next);
  } catch {
    next();
  }
}
