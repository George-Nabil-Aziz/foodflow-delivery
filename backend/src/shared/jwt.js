import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { UnauthorizedError } from './errors/AppError.js';

const ALGORITHM = 'HS256';

/** Mints a short-lived access token. Carries a role hint, never permissions. */
export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, jti: crypto.randomUUID() },
    config.jwt.secret,
    {
      algorithm: ALGORITHM,
      expiresIn: config.jwt.accessTtl,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    },
  );
}

/**
 * Verifies an access token with the algorithm pinned and iss/aud checked.
 * Pinning is what makes an "alg: none" or key-confusion forgery fail to parse
 * rather than fail open.
 */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret, {
      algorithms: [ALGORITHM],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      clockTolerance: 30,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new UnauthorizedError('TOKEN_EXPIRED', { cause: err });
    }
    throw new UnauthorizedError('TOKEN_INVALID', { cause: err });
  }
}

/** 256-bit opaque refresh token; only its SHA-256 hash is ever stored. */
export function generateRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate(from = new Date()) {
  return new Date(from.getTime() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
}

export function accessTokenTtlSeconds() {
  const ttl = config.jwt.accessTtl;
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 900;
  const n = Number(match[1]);
  return { s: n, m: n * 60, h: n * 3600, d: n * 86400 }[match[2]];
}
