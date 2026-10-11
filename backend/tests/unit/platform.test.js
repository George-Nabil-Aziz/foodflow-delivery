import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../src/config/index.js';
import {
  AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError, UnauthorizedError,
} from '../../src/shared/errors/AppError.js';
import { mapPgError } from '../../src/shared/errors/pgErrorMapper.js';
import { CODES, PUBLIC_MESSAGES } from '../../src/shared/errors/codes.js';
import { ok, fail } from '../../src/shared/http/envelope.js';
import { toLimitOffset, paginationMeta } from '../../src/shared/http/pagination.js';
import { generateOrderNumber, ORDER_NUMBER_PATTERN } from '../../src/modules/orders/orderNumber.js';
import { maskPhone, displayName, firstName } from '../../src/shared/mask.js';
import { escapeLikePattern } from '../../src/shared/validation/common.js';
import { slugify, nextSlugCandidate } from '../../src/shared/slug.js';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgres://u:p@localhost:5432/foodflow',
  TEST_DATABASE_URL: 'postgres://u:p@localhost:5432/foodflow_test',
  JWT_SECRET: 'x'.repeat(32),
  CORS_ORIGINS: 'http://localhost:5173',
};

describe('TC-343 / config validation', () => {
  it('parses a valid environment and applies documented defaults', () => {
    const cfg = parseConfig(validEnv);
    expect(cfg.port).toBe(4000);
    expect(cfg.taxRate).toBe(0.14); // Egyptian VAT
    expect(cfg.jwt.accessTtl).toBe('15m');
    expect(cfg.bcryptRounds).toBe(12);
    expect(cfg.orderAcceptTimeoutMinutes).toBe(10);
    expect(cfg.deliveryOfferTtlSeconds).toBe(90);
  });

  it('refuses a JWT_SECRET shorter than 32 characters', () => {
    expect(() => parseConfig({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('refuses a missing JWT_SECRET', () => {
    const { JWT_SECRET, ...without } = validEnv;
    expect(() => parseConfig(without)).toThrow(/JWT_SECRET/);
  });

  it('refuses a missing DATABASE_URL', () => {
    const { DATABASE_URL, ...without } = validEnv;
    expect(() => parseConfig(without)).toThrow(/DATABASE_URL/);
  });

  it('TC-342: refuses a wildcard CORS origin in production', () => {
    expect(() => parseConfig({ ...validEnv, NODE_ENV: 'production', CORS_ORIGINS: '*' }))
      .toThrow(/CORS_ORIGINS/);
    expect(() => parseConfig({ ...validEnv, NODE_ENV: 'production', CORS_ORIGINS: 'https://a.com,*' }))
      .toThrow(/CORS_ORIGINS/);
  });

  it('allows a wildcard outside production, where it is only a dev convenience', () => {
    expect(() => parseConfig({ ...validEnv, NODE_ENV: 'development', CORS_ORIGINS: '*' })).not.toThrow();
  });

  it('points at the test database when NODE_ENV is test', () => {
    expect(parseConfig(validEnv).databaseUrl).toMatch(/_test$/);
  });

  it('refuses an out-of-range bcrypt cost', () => {
    expect(() => parseConfig({ ...validEnv, BCRYPT_ROUNDS: '4' })).toThrow(/BCRYPT_ROUNDS/);
  });
});

describe('error registry and AppError', () => {
  it('maps each subclass to its registered status', () => {
    expect(new NotFoundError('RESOURCE_NOT_FOUND').status).toBe(404);
    expect(new ConflictError('CART_RESTAURANT_MISMATCH').status).toBe(409);
    expect(new ValidationError('VALIDATION_ERROR').status).toBe(422);
    expect(new ForbiddenError('FORBIDDEN_ROLE').status).toBe(403);
    expect(new UnauthorizedError('TOKEN_EXPIRED').status).toBe(401);
  });

  it('BR-F4: refuses an unregistered code', () => {
    expect(() => new AppError('NOT_A_REAL_CODE')).toThrow(/not in the registry/);
  });

  it('refuses a code whose registered status contradicts the subclass', () => {
    expect(() => new NotFoundError('VALIDATION_ERROR')).toThrow(/registered as/);
  });

  it('every registered code has a public message', () => {
    for (const code of Object.keys(CODES)) {
      expect(PUBLIC_MESSAGES[code], `missing public message for ${code}`).toBeTruthy();
    }
  });

  it('keeps the internal message separate from the public one', () => {
    const err = new ConflictError('INVALID_ORDER_TRANSITION', { message: 'internal detail here' });
    expect(err.message).toBe('internal detail here');
    expect(err.publicMessage).not.toContain('internal detail');
  });
});

describe('pg error translation', () => {
  it('translates a unique violation by constraint name', () => {
    expect(mapPgError({ code: '23505', constraint: 'uq_users_email' }).code)
      .toBe('EMAIL_ALREADY_REGISTERED');
    expect(mapPgError({ code: '23505', constraint: 'uq_reviews_order' }).code)
      .toBe('REVIEW_ALREADY_EXISTS');
    expect(mapPgError({ code: '23505', constraint: 'uq_assignments_driver_active' }).code)
      .toBe('DRIVER_HAS_ACTIVE_DELIVERY');
    expect(mapPgError({ code: '23505', constraint: 'uq_assignments_order_accepted' }).code)
      .toBe('OFFER_NO_LONGER_AVAILABLE');
  });

  it('translates a foreign-key violation to not found', () => {
    expect(mapPgError({ code: '23503' }).code).toBe('RESOURCE_NOT_FOUND');
  });

  it('translates a check violation to an unprocessable error', () => {
    expect(mapPgError({ code: '23514', constraint: 'chk_orders_totals' }).status).toBe(422);
  });

  it('passes an unrelated error through untouched', () => {
    const original = new Error('boom');
    expect(mapPgError(original)).toBe(original);
  });
});

describe('response envelope', () => {
  it('shapes a success response', () => {
    expect(ok({ id: 1 }, { requestId: 'r1' }))
      .toEqual({ success: true, data: { id: 1 }, meta: { requestId: 'r1' } });
  });

  it('shapes an error response with details nested under error', () => {
    const body = fail({ code: 'VALIDATION_ERROR', message: 'bad', details: [{ field: 'email' }] },
      { requestId: 'r1' });
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toHaveLength(1);
    expect(body.meta.requestId).toBe('r1');
  });

  it('omits details when there are none', () => {
    expect(fail({ code: 'INTERNAL_ERROR', message: 'x' })).not.toHaveProperty('error.details');
  });
});

describe('pagination', () => {
  it('converts page and limit to offset', () => {
    expect(toLimitOffset({ page: 2, limit: 20 })).toEqual({ limit: 20, offset: 20, page: 2 });
    expect(toLimitOffset({})).toEqual({ limit: 20, offset: 0, page: 1 });
  });

  it('TC-119: caps the limit at 100', () => {
    expect(toLimitOffset({ page: 1, limit: 5000 }).limit).toBe(100);
  });

  it('TC-118: computes accurate meta at a boundary', () => {
    expect(paginationMeta({ page: 2, limit: 20, total: 21 }).pagination)
      .toEqual({ page: 2, limit: 20, total: 21, totalPages: 2 });
    expect(paginationMeta({ page: 1, limit: 20, total: 0 }).pagination.totalPages).toBe(0);
  });
});

describe('TC-175 / order numbers', () => {
  it('matches the documented format', () => {
    expect(generateOrderNumber(new Date(Date.UTC(2026, 8, 22)))).toMatch(ORDER_NUMBER_PATTERN);
    expect(generateOrderNumber(new Date(Date.UTC(2026, 8, 22))).startsWith('FF-20260922-')).toBe(true);
  });

  /*
   * The previous version of this asserted 10,000 generations were all
   * distinct. Six characters from a 32-symbol alphabet is about 1.07e9
   * possibilities, so by the birthday bound 10,000 draws collide roughly 4.5%
   * of the time — the assertion was false often enough to fail a clean build,
   * and it was testing the wrong property anyway. Collisions are not prevented
   * by the generator; they are made harmless by the unique index plus the
   * retry in `insertOrderWithUniqueNumber`, which TC-175b covers.
   */
  it('draws from the full keyspace, so collisions stay vanishingly rare', () => {
    const n = 10_000;
    const seen = new Set();
    for (let i = 0; i < n; i += 1) seen.add(generateOrderNumber().split('-')[2]);

    // Well under the ~0.005% expected duplicate rate for this keyspace; a
    // generator with materially less entropy fails this by orders of magnitude.
    expect(n - seen.size).toBeLessThan(5);

    // Every position varies: a suffix with a constant character would still
    // look random in aggregate but would quietly shrink the keyspace.
    for (let position = 0; position < 6; position += 1) {
      const distinct = new Set([...seen].map((s) => s[position]));
      expect(distinct.size).toBeGreaterThan(20);
    }
  });

  it('avoids ambiguous characters so it can be read aloud', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateOrderNumber().split('-')[2]).not.toMatch(/[ILOU]/);
    }
  });
});

describe('TC-276 / TC-337 / PII masking', () => {
  it('masks a phone number server-side', () => {
    expect(maskPhone('+201001234567')).toBe('+2010****4567');
    expect(maskPhone(null)).toBeNull();
  });

  it('reduces a full name to first name plus last initial', () => {
    expect(displayName('Sara Idris')).toBe('Sara I.');
    expect(displayName('Sara')).toBe('Sara');
    expect(displayName('')).toBe('Customer');
  });

  it('extracts a first name for driver and restaurant views', () => {
    expect(firstName('Sara Idris')).toBe('Sara');
  });
});

describe('TC-134 / SQL wildcard escaping', () => {
  it('escapes LIKE metacharacters so a search cannot scan the table', () => {
    expect(escapeLikePattern('%')).toBe('\\%');
    expect(escapeLikePattern('_')).toBe('\\_');
    expect(escapeLikePattern('100%_off')).toBe('100\\%\\_off');
  });

  it('leaves ordinary search text alone', () => {
    expect(escapeLikePattern('Mixed Grill')).toBe('Mixed Grill');
    // SQL metacharacters are inert because queries are parameterized; only
    // LIKE wildcards need escaping.
    expect(escapeLikePattern("' OR 1=1 --")).toBe("' OR 1=1 --");
  });
});

describe('TC-076 / slugs', () => {
  it('produces a URL-safe slug', () => {
    expect(slugify('Olive Grill')).toBe('olive-grill');
    expect(slugify('  Cafe   Noir!  ')).toBe('cafe-noir');
  });

  it('suffixes collisions', () => {
    expect(nextSlugCandidate('olive-grill', 0)).toBe('olive-grill');
    expect(nextSlugCandidate('olive-grill', 1)).toBe('olive-grill-2');
    expect(nextSlugCandidate('olive-grill', 2)).toBe('olive-grill-3');
  });

  it('falls back rather than producing an empty slug', () => {
    expect(slugify('!!!')).toBe('restaurant');
  });
});
