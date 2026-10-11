import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../../config/index.js';
import { withTransaction } from '../../shared/db/transaction.js';
import { knex } from '../../shared/db/knex.js';
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import {
  signAccessToken,
  generateRefreshToken,
  accessTokenTtlSeconds,
} from '../../shared/jwt.js';
import { slugify, nextSlugCandidate } from '../../shared/slug.js';
import * as tokenRepo from './auth.repository.js';
import { toAuthUserDto } from './auth.mapper.js';

/**
 * A pre-computed hash compared against on the unknown-email path, so a wrong
 * email and a wrong password take comparable time and account existence is not
 * leaked through timing (threat model: account enumeration).
 */
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', 10);

export const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

async function issueSession(user, { userAgent, ipAddress } = {}, trx) {
  const refreshToken = generateRefreshToken();
  await tokenRepo.createRefreshToken(
    { userId: user.id, token: refreshToken, familyId: crypto.randomUUID(), userAgent, ipAddress },
    trx,
  );
  return {
    accessToken: signAccessToken(user),
    refreshToken,
    expiresIn: accessTokenTtlSeconds(),
  };
}

async function allocateSlug(name, trx) {
  const base = slugify(name);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = nextSlugCandidate(base, attempt);
    const clash = await trx('restaurants').where({ slug: candidate }).first('id');
    if (!clash) return candidate;
  }
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Registration. Only CUSTOMER and RESTAURANT can be self-registered (BR-A3);
 * the schema rejects anything else before this runs, and the explicit check
 * here means a DRIVER/ADMIN attempt is a loud 403 rather than a silent
 * downgrade to CUSTOMER.
 *
 * For a restaurant owner the user and the PENDING_APPROVAL restaurant shell are
 * created in one transaction: a half-created owner with no restaurant would be
 * unrecoverable through the API.
 */
export async function register(input, context = {}) {
  const { email, password, fullName, phone, role, restaurantName } = input;

  if (role !== 'CUSTOMER' && role !== 'RESTAURANT') {
    throw new ForbiddenError('FORBIDDEN_ROLE', {
      details: [{ field: 'role', issue: 'Only customer and restaurant accounts can self-register.' }],
    });
  }
  if (role === 'RESTAURANT' && !restaurantName) {
    throw new ValidationError('VALIDATION_ERROR', {
      details: [{ field: 'restaurantName', issue: 'A restaurant name is required.' }],
    });
  }

  const existing = await knex('users').where({ email }).first('id');
  if (existing) throw new ConflictError('EMAIL_ALREADY_REGISTERED');

  const passwordHash = await hashPassword(password);

  return withTransaction(async (trx) => {
    const [user] = await trx('users')
      .insert({
        email,
        password_hash: passwordHash,
        full_name: fullName,
        phone,
        role,
        status: 'ACTIVE',
      })
      .returning('*');

    let restaurant = null;
    if (role === 'RESTAURANT') {
      const slug = await allocateSlug(restaurantName, trx);
      [restaurant] = await trx('restaurants')
        .insert({
          owner_user_id: user.id,
          name: restaurantName,
          slug,
          status: 'PENDING_APPROVAL',
          is_accepting_orders: true,
        })
        .returning('*');
    }

    const session = await issueSession(user, context, trx);
    return {
      user: toAuthUserDto(user),
      restaurant: restaurant
        ? { id: restaurant.id, name: restaurant.name, slug: restaurant.slug, status: restaurant.status }
        : null,
      ...session,
    };
  });
}

export async function login({ email, password }, context = {}) {
  const user = await knex('users').where({ email }).whereNull('deleted_at').first();

  if (!user) {
    // Same code, same message, comparable timing as a wrong password.
    await bcrypt.compare(password, DUMMY_HASH);
    throw new UnauthorizedError('INVALID_CREDENTIALS');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) throw new UnauthorizedError('INVALID_CREDENTIALS');
  if (user.status === 'SUSPENDED') throw new ForbiddenError('ACCOUNT_SUSPENDED');

  await knex('users').where({ id: user.id }).update({ last_login_at: knex.fn.now() });

  const session = await issueSession(user, context);
  const profile = await loadRoleProfile(user);
  return { user: toAuthUserDto(user), ...profile, ...session };
}

async function loadRoleProfile(user) {
  if (user.role === 'RESTAURANT') {
    const r = await knex('restaurants').where({ owner_user_id: user.id }).whereNull('deleted_at').first();
    return {
      restaurant: r ? { id: r.id, name: r.name, slug: r.slug, status: r.status } : null,
      driverProfile: null,
    };
  }
  if (user.role === 'DRIVER') {
    const d = await knex('driver_profiles').where({ user_id: user.id }).first();
    return {
      restaurant: null,
      driverProfile: d ? { id: d.id, status: d.status, availability: d.availability } : null,
    };
  }
  return { restaurant: null, driverProfile: null };
}

/**
 * Rotating, single-use refresh with reuse detection.
 *
 * Presenting an already-revoked token means either an attacker is replaying or
 * a client raced. Both are resolved the same way: revoke the family.
 */
export async function refresh({ refreshToken }, context = {}) {
  // Reuse detection runs BEFORE the rotation transaction and commits on its
  // own. Revoking the family inside a transaction that then throws would be
  // rolled back with it, leaving the stolen family alive - the exact opposite
  // of the intended effect.
  const presented = await tokenRepo.findByToken(refreshToken);
  if (!presented) throw new UnauthorizedError('REFRESH_TOKEN_INVALID');

  if (presented.revoked_at) {
    await tokenRepo.revokeFamily(presented.family_id);
    throw new UnauthorizedError('REFRESH_TOKEN_REUSED');
  }

  return withTransaction(async (trx) => {
    const stored = await tokenRepo.findByToken(refreshToken, trx);
    if (!stored || stored.revoked_at) throw new UnauthorizedError('REFRESH_TOKEN_INVALID');

    if (new Date(stored.expires_at) < new Date()) {
      throw new UnauthorizedError('REFRESH_TOKEN_INVALID');
    }

    const user = await trx('users').where({ id: stored.user_id }).whereNull('deleted_at').first();
    if (!user) throw new UnauthorizedError('REFRESH_TOKEN_INVALID');
    if (user.status === 'SUSPENDED') throw new ForbiddenError('ACCOUNT_SUSPENDED');

    const nextToken = generateRefreshToken();
    const created = await tokenRepo.createRefreshToken(
      {
        userId: user.id,
        token: nextToken,
        familyId: stored.family_id,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      },
      trx,
    );
    await tokenRepo.revokeToken(stored.id, { replacedById: created.id }, trx);

    return {
      accessToken: signAccessToken(user),
      refreshToken: nextToken,
      expiresIn: accessTokenTtlSeconds(),
    };
  });
}

export async function logout({ refreshToken }) {
  const stored = await tokenRepo.findByToken(refreshToken);
  // Idempotent: logging out an already-dead token is not an error.
  if (stored && !stored.revoked_at) await tokenRepo.revokeToken(stored.id);
}

/**
 * Changing a password revokes every session (FR-1.6). Without this, "change
 * your password, you may be compromised" would not actually evict the attacker.
 */
export async function changePassword({ userId, currentPassword, newPassword }) {
  const user = await knex('users').where({ id: userId }).first();
  if (!user) throw new UnauthorizedError('TOKEN_INVALID');

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) throw new UnauthorizedError('INVALID_CREDENTIALS');

  if (currentPassword === newPassword) {
    throw new ValidationError('VALIDATION_ERROR', {
      details: [{ field: 'newPassword', issue: 'The new password must differ from the current one.' }],
    });
  }

  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (trx) => {
    await trx('users').where({ id: userId }).update({ password_hash: passwordHash });
    await tokenRepo.revokeAllForUser(userId, trx);
  });
}

export const revokeAllForUser = tokenRepo.revokeAllForUser;
