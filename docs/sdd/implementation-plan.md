# FoodFlow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan story-by-story. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build FoodFlow — a full-stack food delivery platform connecting
customers, restaurants, drivers and administrators — as a modular monolith, in
ten vertically-sliced stories.

**Architecture:** One Express API with enforced domain-module boundaries, one
Vue 3 SPA, one PostgreSQL database. Layers run route → controller → service →
repository in one direction only. Orders are immutable snapshots governed by a
single state machine; concurrency is arbitrated by the database, never by
check-then-act.

**Tech Stack:** Vue 3 · Vite · Pinia · Vue Router · Tailwind · Axios ·
Node.js 20 · Express 4 · Knex · PostgreSQL 16 · Zod · bcryptjs · jsonwebtoken ·
Vitest · Supertest · Vue Test Utils · Playwright.

**Spec:** [master-sdd.md](master-sdd.md), with per-area detail in
[specs/](specs/) and per-slice detail in [stories/](stories/). The plan argues
from the spec; executors read both.

## Global Constraints

Project-wide requirements. **Every story's requirements implicitly include this
section.**

- **Node.js 20 LTS**; PostgreSQL **16**; extensions `pgcrypto`, `citext`, `pg_trgm`.
- **Response envelope** exactly as in [master-sdd §14](master-sdd.md#14-error-handling) — `{ success, data, meta }` / `{ success, error: { code, message, details? }, meta }`. No endpoint may deviate.
- **Error codes** come from `shared/errors/codes.js` and from nowhere else. Adding a code means adding it to the registry and to the contract test.
- **Module boundaries** (NFR-1): a module may import another only via `modules/<name>/index.js` and may query only its own tables.
- **`req.body` may not be referenced outside `middleware/validate.js`.** Controllers read `req.validated`.
- **Money:** `NUMERIC(10,2)` in the database, strings in JS, arithmetic only through `shared/money.js`. Never a JS float.
- **Response DTOs are allow-list mappers.** Never delete fields from a row to hide them.
- **Every protected route declares `authenticate` plus a role guard**; ownership is a separate check applied in SQL. The router audit test enforces this.
- **Wrong role → 403; right role, someone else's row → 404** (ADR-010).
- **Status changes go through `orders.transition()`.** There is exactly one code path.
- **TDD:** the failing test comes first, and it must fail for the right reason before implementation starts.
- **Commit at the end of every task**, with tests green.
- Lint and format clean; no file beyond ~300 lines; coverage floors per [testing-strategy §7](architecture/testing-strategy.md#7-coverage-and-ci).

---

## Phase overview

| Phase | Stories | Exit criteria |
|-------|---------|---------------|
| **1 — Foundation & Identity** | story-01, story-02 | The stack runs from a clean clone; a customer can register, log in, survive a token expiry, and manage profile and addresses; the router audit test is green |
| **2 — Supply side** | story-03 | An admin can approve a restaurant; that restaurant has a menu with working availability toggles |
| **3 — Demand side** | story-04, story-05 | A customer can find a restaurant, browse its menu and build a validated cart, including the restaurant-switch flow |
| **4 — Transaction core** | story-06, story-07 | A customer can place and track an order; a restaurant can process it to `READY_FOR_PICKUP`; snapshots and the state machine are proven |
| **5 — Fulfilment** | story-08 | The full journey reaches `DELIVERED`; the no-driver case is proven non-destructive |
| **6 — Trust & operations** | story-09, story-10 | Reviews with live aggregates; the complete admin surface; all E2E scenarios and NFR gates green |

Phases are derived from the dependency graph in
[dependency-map.md](dependency-map.md), not chosen for symmetry. Nine of the ten
stories sit on the critical path because the domain is genuinely sequential.

---

## Phase 1 — Foundation & Identity

### Task 1.1: Repository, database and configuration

**Files:**
- Create: `docker-compose.yml`, `.gitignore`, `README.md`, `backend/package.json`, `backend/.env.example`, `backend/src/config/index.js`, `backend/src/config/knexfile.js`
- Test: `backend/tests/unit/config.test.js`

**Interfaces:**
- Produces: `config` — a frozen object with `env`, `port`, `databaseUrl`, `jwt.{secret,accessTtl,refreshTtlDays,issuer,audience}`, `bcryptRounds`, `corsOrigins[]`, `taxRate`, `orderAcceptTimeoutMinutes`, `deliveryOfferTtlSeconds`, `logLevel`.

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/unit/config.test.js
import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../src/config/index.js';

const valid = {
  NODE_ENV: 'test', PORT: '4000',
  DATABASE_URL: 'postgres://u:p@localhost:5432/foodflow_test',
  JWT_SECRET: 'x'.repeat(32), CORS_ORIGINS: 'http://localhost:5173',
};

describe('config', () => {
  it('parses a valid environment and applies documented defaults', () => {
    const cfg = parseConfig(valid);
    expect(cfg.port).toBe(4000);
    expect(cfg.taxRate).toBe(0.15);
    expect(cfg.jwt.accessTtl).toBe('15m');
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() => parseConfig({ ...valid, JWT_SECRET: 'short' }))
      .toThrow(/JWT_SECRET/);
  });

  it('rejects a wildcard CORS origin in production', () => {
    expect(() => parseConfig({ ...valid, NODE_ENV: 'production', CORS_ORIGINS: '*' }))
      .toThrow(/CORS_ORIGINS/);
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL, ...without } = valid;
    expect(() => parseConfig(without)).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd backend && npx vitest run tests/unit/config.test.js`
Expected: FAIL — "Cannot find module '../../src/config/index.js'".

- [ ] **Step 3: Write `docker-compose.yml` and the config module**

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: foodflow
      POSTGRES_PASSWORD: foodflow
      POSTGRES_DB: foodflow
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
volumes: { pgdata: {} }
```

```js
// backend/src/config/index.js
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  JWT_ISSUER: z.string().default('foodflow'),
  JWT_AUDIENCE: z.string().default('foodflow-app'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TAX_RATE: z.coerce.number().min(0).max(1).default(0.15),
  ORDER_ACCEPT_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(10),
  DELIVERY_OFFER_TTL_SECONDS: z.coerce.number().int().positive().default(90),
  LOG_LEVEL: z.string().default('info'),
}).superRefine((v, ctx) => {
  if (v.NODE_ENV === 'production' && v.CORS_ORIGINS.split(',').includes('*')) {
    ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'],
      message: 'CORS_ORIGINS must not contain "*" in production' });
  }
});

export function parseConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration — ${detail}`);
  }
  const v = result.data;
  return Object.freeze({
    env: v.NODE_ENV,
    port: v.PORT,
    databaseUrl: v.DATABASE_URL,
    jwt: { secret: v.JWT_SECRET, accessTtl: v.JWT_ACCESS_TTL,
           refreshTtlDays: v.JWT_REFRESH_TTL_DAYS,
           issuer: v.JWT_ISSUER, audience: v.JWT_AUDIENCE },
    bcryptRounds: v.BCRYPT_ROUNDS,
    corsOrigins: v.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    taxRate: v.TAX_RATE,
    orderAcceptTimeoutMinutes: v.ORDER_ACCEPT_TIMEOUT_MINUTES,
    deliveryOfferTtlSeconds: v.DELIVERY_OFFER_TTL_SECONDS,
    logLevel: v.LOG_LEVEL,
  });
}

export const config = parseConfig();
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd backend && npx vitest run tests/unit/config.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .gitignore backend/
git commit -m "feat: project scaffold with validated environment configuration"
```

---

### Task 1.2: Shared kernel — envelope, errors, money, logger

**Files:**
- Create: `backend/src/shared/http/envelope.js`, `backend/src/shared/errors/{AppError.js,codes.js,pgErrorMapper.js}`, `backend/src/shared/money.js`, `backend/src/shared/logger.js`
- Test: `backend/tests/unit/{envelope,errors,money}.test.js`

**Interfaces:**
- Produces: `ok(data, meta)` → `{success:true,data,meta}`; `fail(error, meta)` → `{success:false,error,meta}`; `AppError` subclasses `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `InternalError`, each constructed as `new NotFoundError('RESOURCE_NOT_FOUND', { details })` and exposing `.status`, `.code`, `.publicMessage`, `.details`; `mapPgError(err)`; `money.add(a,b)`, `money.multiply(a,n)`, `money.roundTax(subtotal, rate)`, all taking and returning 2-decimal strings.

- [ ] **Step 1: Write the failing tests**

```js
// backend/tests/unit/money.test.js
import { describe, it, expect } from 'vitest';
import { money } from '../../src/shared/money.js';

describe('money', () => {
  it('adds without floating-point drift', () => {
    expect(money.add('0.10', '0.20')).toBe('0.30');
  });
  it('multiplies a unit price by a quantity', () => {
    expect(money.multiply('58.00', 3)).toBe('174.00');
  });
  it('rounds tax half-up to two decimals', () => {
    expect(money.roundTax('134.00', 0.15)).toBe('20.10');
    expect(money.roundTax('0.10', 0.15)).toBe('0.02'); // 0.015 → 0.02
  });
  it('sums a list of line totals', () => {
    expect(money.sum(['116.00', '18.00'])).toBe('134.00');
  });
});
```

```js
// backend/tests/unit/errors.test.js
import { describe, it, expect } from 'vitest';
import { NotFoundError, ConflictError, ValidationError } from '../../src/shared/errors/AppError.js';
import { mapPgError } from '../../src/shared/errors/pgErrorMapper.js';

describe('AppError', () => {
  it('maps each subclass to its HTTP status', () => {
    expect(new NotFoundError('RESOURCE_NOT_FOUND').status).toBe(404);
    expect(new ConflictError('CART_RESTAURANT_MISMATCH').status).toBe(409);
    expect(new ValidationError('VALIDATION_ERROR').status).toBe(422);
  });
  it('rejects an unregistered code', () => {
    expect(() => new NotFoundError('NOT_A_REAL_CODE')).toThrow(/registry/);
  });
});

describe('mapPgError', () => {
  it('translates a unique violation on the email index', () => {
    const e = mapPgError({ code: '23505', constraint: 'uq_users_email' });
    expect(e.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(e.status).toBe(409);
  });
  it('translates a foreign key violation to not found', () => {
    expect(mapPgError({ code: '23503' }).code).toBe('RESOURCE_NOT_FOUND');
  });
  it('returns the original error when it is not a known PG error', () => {
    const original = new Error('boom');
    expect(mapPgError(original)).toBe(original);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx vitest run tests/unit/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the shared kernel**

```js
// backend/src/shared/money.js — integer minor units internally, strings at the boundary
const toMinor = (s) => {
  if (typeof s === 'number') s = s.toFixed(2);
  const [whole, frac = '00'] = String(s).split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0').slice(0, 2)) * (whole.startsWith('-') ? -1n : 1n);
};
const toStr = (m) => {
  const neg = m < 0n; const abs = neg ? -m : m;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};

export const money = {
  add: (a, b) => toStr(toMinor(a) + toMinor(b)),
  subtract: (a, b) => toStr(toMinor(a) - toMinor(b)),
  multiply: (a, qty) => toStr(toMinor(a) * BigInt(qty)),
  sum: (list) => toStr(list.reduce((acc, v) => acc + toMinor(v), 0n)),
  roundTax: (subtotal, rate) => {
    const scaled = toMinor(subtotal) * BigInt(Math.round(rate * 10000));
    return toStr((scaled + 5000n) / 10000n);          // half-up at 2dp
  },
  compare: (a, b) => (toMinor(a) === toMinor(b) ? 0 : toMinor(a) < toMinor(b) ? -1 : 1),
};
```

```js
// backend/src/shared/errors/codes.js — the single registry
export const CODES = {
  MALFORMED_REQUEST: 400, INVALID_CREDENTIALS: 401,
  TOKEN_MISSING: 401, TOKEN_INVALID: 401, TOKEN_EXPIRED: 401,
  REFRESH_TOKEN_INVALID: 401, REFRESH_TOKEN_REUSED: 401,
  FORBIDDEN_ROLE: 403, ACCOUNT_SUSPENDED: 403, RESTAURANT_NOT_APPROVED: 403,
  RESOURCE_NOT_FOUND: 404,
  EMAIL_ALREADY_REGISTERED: 409, CART_RESTAURANT_MISMATCH: 409,
  INVALID_ORDER_TRANSITION: 409, CATEGORY_NOT_EMPTY: 409,
  REVIEW_ALREADY_EXISTS: 409, REVIEW_EDIT_WINDOW_CLOSED: 409,
  DRIVER_HAS_ACTIVE_DELIVERY: 409, OFFER_NO_LONGER_AVAILABLE: 409,
  VALIDATION_ERROR: 422, CART_EMPTY: 422, CART_HAS_ISSUES: 422,
  BELOW_MINIMUM_ORDER: 422, ITEM_UNAVAILABLE: 422,
  RESTAURANT_UNAVAILABLE: 422, ORDER_NOT_REVIEWABLE: 422,
  RATE_LIMIT_EXCEEDED: 429, INTERNAL_ERROR: 500,
};

export const PUBLIC_MESSAGES = {
  RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  CART_RESTAURANT_MISMATCH: 'Your cart contains items from a different restaurant.',
  INVALID_ORDER_TRANSITION: 'This order can no longer be changed in that way.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  // …one entry per code; a test asserts every CODES key has a message
};
```

```js
// backend/src/shared/errors/AppError.js
import { CODES, PUBLIC_MESSAGES } from './codes.js';

export class AppError extends Error {
  constructor(code, { message, details, expectedStatus } = {}) {
    if (!(code in CODES)) throw new Error(`Error code "${code}" is not in the registry`);
    const status = CODES[code];
    if (expectedStatus && expectedStatus !== status) {
      throw new Error(`Code ${code} is registered as ${status}, not ${expectedStatus}`);
    }
    super(message ?? PUBLIC_MESSAGES[code] ?? code);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.publicMessage = PUBLIC_MESSAGES[code] ?? 'Request could not be completed.';
    this.details = details;
  }
}

export class ValidationError   extends AppError { constructor(c, o) { super(c, { ...o, expectedStatus: 422 }); } }
export class UnauthorizedError extends AppError { constructor(c, o) { super(c, { ...o, expectedStatus: 401 }); } }
export class ForbiddenError    extends AppError { constructor(c, o) { super(c, { ...o, expectedStatus: 403 }); } }
export class NotFoundError     extends AppError { constructor(c, o) { super(c, { ...o, expectedStatus: 404 }); } }
export class ConflictError     extends AppError { constructor(c, o) { super(c, { ...o, expectedStatus: 409 }); } }
export class InternalError     extends AppError { constructor(c, o) { super(c, { ...o, expectedStatus: 500 }); } }
```

```js
// backend/src/shared/http/envelope.js
export const ok   = (data, meta = {}) => ({ success: true,  data, meta });
export const fail = (error, meta = {}) => ({ success: false, error, meta });
```

```js
// backend/src/shared/errors/pgErrorMapper.js
import { ConflictError, NotFoundError } from './AppError.js';

const UNIQUE_CONSTRAINTS = {
  uq_users_email: 'EMAIL_ALREADY_REGISTERED',
  uq_reviews_order: 'REVIEW_ALREADY_EXISTS',
  uq_assignments_driver_active: 'DRIVER_HAS_ACTIVE_DELIVERY',
  uq_assignments_order_accepted: 'OFFER_NO_LONGER_AVAILABLE',
  uq_assignments_order_open: 'OFFER_NO_LONGER_AVAILABLE',
};

export function mapPgError(err) {
  if (err?.code === '23505') {
    const code = UNIQUE_CONSTRAINTS[err.constraint];
    if (code) return new ConflictError(code);
  }
  if (err?.code === '23503') return new NotFoundError('RESOURCE_NOT_FOUND');
  return err;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd backend && npx vitest run tests/unit/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared backend/tests/unit
git commit -m "feat: shared kernel with envelope, error registry and money arithmetic"
```

---

### Task 1.3: App assembly, middleware, health check

**Files:**
- Create: `backend/src/app.js`, `backend/src/server.js`, `backend/src/routes.js`, `backend/src/middleware/{requestId,validate,notFound,errorHandler,rateLimiters}.js`, `backend/src/shared/db/{knex.js,transaction.js}`
- Test: `backend/tests/integration/health.test.js`, `backend/tests/integration/envelope.test.js`

**Interfaces:**
- Consumes: `config`, `ok`/`fail`, `AppError`, `mapPgError` (Tasks 1.1–1.2).
- Produces: `app` (an Express app with no `listen`); `withTransaction(fn, trx?)`; `validate({ body, params, query })` writing to `req.validated`.

- [ ] **Step 1: Write the failing integration tests**

```js
// backend/tests/integration/envelope.test.js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';

describe('response envelope', () => {
  it('returns the envelope for an unmatched API route', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(res.body.meta.requestId).toEqual(expect.any(String));
  });

  it('echoes the request id in a header matching meta.requestId', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toBe(res.body.meta.requestId);
  });

  it('returns MALFORMED_REQUEST for unparseable JSON', async () => {
    const res = await request(app)
      .post('/api/health').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_REQUEST');
  });

  it('never leaks a stack trace on an unexpected error', async () => {
    const res = await request(app).get('/api/__test_boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(/);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx vitest run tests/integration/`
Expected: FAIL — `app.js` not found.

- [ ] **Step 3: Implement the app, middleware and health route**

```js
// backend/src/middleware/errorHandler.js
import { AppError } from '../shared/errors/AppError.js';
import { mapPgError } from '../shared/errors/pgErrorMapper.js';
import { fail } from '../shared/http/envelope.js';
import { logger } from '../shared/logger.js';

export function errorHandler(err, req, res, _next) {
  const e = err instanceof AppError ? err : mapPgError(err);
  if (e instanceof AppError) {
    const log = e.status >= 500 ? logger.error : logger.warn;
    log.call(logger, { code: e.code, requestId: req.id, userId: req.user?.id }, e.message);
    return res.status(e.status).json(
      fail({ code: e.code, message: e.publicMessage, details: e.details },
           { requestId: req.id }));
  }
  logger.error({ err, requestId: req.id }, 'Unhandled error');
  return res.status(500).json(
    fail({ code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
         { requestId: req.id }));
}
```

```js
// backend/src/middleware/validate.js
import { ValidationError } from '../shared/errors/AppError.js';

export const validate = (schemas) => (req, _res, next) => {
  const out = {};
  for (const key of ['body', 'params', 'query']) {
    if (!schemas[key]) continue;
    const parsed = schemas[key].safeParse(req[key]);
    if (!parsed.success) {
      return next(new ValidationError('VALIDATION_ERROR', {
        details: parsed.error.issues.map((i) => ({
          field: i.path.join('.'), issue: i.message,
        })),
      }));
    }
    out[key] = parsed.data;
  }
  req.validated = out;
  next();
};
```

```js
// backend/src/shared/db/transaction.js
import { knex } from './knex.js';
export const withTransaction = (fn, trx) => (trx ? fn(trx) : knex.transaction(fn));
```

Assemble `app.js` in the order from
[system-architecture §3](architecture/system-architecture.md#3-request-lifecycle):
`requestId → helmet → cors → express.json({ limit: '100kb' }) → globalRateLimit
→ routes → notFound → errorHandler`. Add `GET /api/health` returning DB status,
and — guarded by `config.env === 'test'` — a `/api/__test_boom` route that
throws, so the unexpected-error path is testable.

- [ ] **Step 4: Run and confirm the tests pass**

Run: `cd backend && npx vitest run tests/integration/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/tests
git commit -m "feat: express app assembly with envelope, validation and error handling"
```

---

### Task 1.4: Database extensions, enum types and migration infrastructure

**Files:**
- Create: `backend/migrations/001_extensions_and_types.js`, `backend/tests/helpers/db.js`
- Test: `backend/tests/integration/migrations.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/integration/migrations.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { knex } from '../../src/shared/db/knex.js';
import { ORDER_STATUSES } from '../../src/shared/constants.js';

beforeAll(async () => { await knex.migrate.latest(); });

describe('schema foundation', () => {
  it('installs the required extensions', async () => {
    const { rows } = await knex.raw(
      "SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','citext','pg_trgm')");
    expect(rows.map((r) => r.extname).sort()).toEqual(['citext', 'pg_trgm', 'pgcrypto']);
  });

  it('keeps the order_status enum in sync with the JS constant', async () => {
    const { rows } = await knex.raw(
      "SELECT unnest(enum_range(NULL::order_status))::text AS v");
    expect(rows.map((r) => r.v).sort()).toEqual([...ORDER_STATUSES].sort());
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx vitest run tests/integration/migrations.test.js`
Expected: FAIL — the `order_status` type does not exist.

- [ ] **Step 3: Write the migration and the constants mirror**

Create all enum types from
[database-design §2](architecture/database-design.md#2-enum-types) plus the
`set_updated_at()` trigger function, and mirror every enum in
`backend/src/shared/constants.js`. Creating the full type vocabulary in one
migration keeps `CREATE TYPE` out of the six later ones, and the sync test above
makes JS/SQL drift impossible.

- [ ] **Step 4: Run and confirm the test passes**

Run: `cd backend && npm run migrate && npx vitest run tests/integration/migrations.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations backend/src/shared/constants.js backend/tests
git commit -m "feat: database extensions, enum types and migration infrastructure"
```

---

### Task 1.5: Vue application shell

**Files:**
- Create: `frontend/` (Vite scaffold), `frontend/src/{main.js,App.vue}`, `frontend/src/router/{index.js,guards.js}`, `frontend/src/layouts/*.vue`, `frontend/src/stores/ui.store.js`, `frontend/src/services/http.js`, `frontend/src/components/shared/*.vue`, `frontend/src/views/public/{HomeView,NotFoundView,ForbiddenView}.vue`
- Test: `frontend/tests/unit/{http.test.js,ui.store.test.js}`

**Interfaces:**
- Produces: `http` (Axios instance unwrapping `response.data.data` and throwing `ApiError { code, message, details, status }`); `useUiStore()` with `toastError`, `toastSuccess`, `toasts`.

- [ ] **Step 1: Write the failing tests**

```js
// frontend/tests/unit/http.test.js
import { describe, it, expect, vi } from 'vitest';
import { http, ApiError } from '@/services/http';

describe('http client', () => {
  it('unwraps the success envelope to data', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({ id: '1' });
    await expect(http.get('/x')).resolves.toEqual({ id: '1' });
  });

  it('converts an error envelope into an ApiError carrying the code', () => {
    const err = new ApiError({ code: 'CART_RESTAURANT_MISMATCH', message: 'm', details: [] }, 409);
    expect(err.code).toBe('CART_RESTAURANT_MISMATCH');
    expect(err.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd frontend && npx vitest run`
Expected: FAIL — `@/services/http` not found.

- [ ] **Step 3: Scaffold the Vue app**

Vite + Vue 3 + Vue Router + Pinia + Tailwind; the `@` → `src` alias; the four
layouts; the `ui` store; the Axios instance with envelope unwrapping and the
`ApiError` class (the refresh interceptor is scaffolded but left inert until
Task 2.x); the shared component set from
[spec-01](specs/spec-01-platform-foundation-api-contract.md#frontend-requirements);
`HomeView`, `NotFoundView`, `ForbiddenView`.

- [ ] **Step 4: Run tests and start both apps**

Run: `cd frontend && npx vitest run && npm run build`
Expected: PASS and a clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: vue application shell with router, stores and http client"
```

---

### Task 1.6: CI pipeline and the router audit test

**Files:**
- Create: `.github/workflows/ci.yml`, `backend/tests/integration/routerAudit.test.js`, `backend/.eslintrc.json` (with the module-boundary rule), `frontend/.eslintrc.json`

- [ ] **Step 1: Write the router audit test (expected to pass trivially now, and to bite later)**

```js
// backend/tests/integration/routerAudit.test.js
import { describe, it, expect } from 'vitest';
import { app } from '../../src/app.js';
import { listRoutes } from '../helpers/routes.js';

const PUBLIC_ALLOWLIST = new Set([
  'GET /api/health',
  'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/refresh',
  'GET /api/restaurants', 'GET /api/restaurants/:id', 'GET /api/restaurants/:id/menu',
  'GET /api/restaurants/:id/reviews', 'GET /api/search', 'GET /api/cuisines',
]);

describe('default-deny router audit', () => {
  it('every route is either public by allow-list or guarded by authenticate', () => {
    const unguarded = listRoutes(app)
      .filter((r) => !PUBLIC_ALLOWLIST.has(r.key))
      .filter((r) => !r.middleware.includes('authenticate'));
    expect(unguarded).toEqual([]);
  });

  it('every authenticated route also declares a role guard', () => {
    const roleless = listRoutes(app)
      .filter((r) => r.middleware.includes('authenticate'))
      .filter((r) => !r.middleware.includes('authorize'));
    expect(roleless.map((r) => r.key)).toEqual(
      ['POST /api/auth/logout', 'POST /api/auth/change-password',
       'GET /api/me', 'PATCH /api/me']);   // any-role routes, enumerated deliberately
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npx vitest run tests/integration/routerAudit.test.js`
Expected: PASS (no domain routes exist yet). From Task 2.x onward, any new route
without a guard fails this test.

- [ ] **Step 3: Write the CI workflow**

Jobs in order: install → lint → backend unit → migrate the test database →
backend integration → frontend unit and component → build → E2E → coverage gate.
A PostgreSQL 16 service container backs the integration job.

- [ ] **Step 4: Verify CI fails on a deliberate lint error, then revert**

- [ ] **Step 5: Commit**

```bash
git add .github .eslintrc.json backend/tests frontend/.eslintrc.json
git commit -m "ci: pipeline, lint boundaries and default-deny router audit"
```

---

### Phase 1 remaining tasks (story-02)

Tasks 1.7 – 1.12 implement [story-02](stories/story-02-customer-registration-login-profile.md)
in the same TDD shape. Each begins with the acceptance criterion it satisfies:

- [ ] **Task 1.7** — `users`, `refresh_tokens`, `customer_addresses` migrations with `uq_users_email` (CITEXT), `uq_addresses_one_default` (partial), and the admin seed. *Test first:* inserting two users whose emails differ only in case violates the unique index.
- [ ] **Task 1.8** — password hashing and JWT utilities. *Test first:* `alg: none` and an `iss` mismatch are both rejected; a 73-character password is rejected rather than truncated.
- [ ] **Task 1.9** — register and login. *Test first:* duplicate email → 409; `role: ADMIN` → 403; unknown email and wrong password produce identical bodies.
- [ ] **Task 1.10** — refresh-token rotation, reuse detection, logout, change-password. *Test first:* a reused token returns `REFRESH_TOKEN_REUSED` and revokes the family.
- [ ] **Task 1.11** — `authenticate` and `authorize`; `GET/PATCH /api/me`. *Test first:* a token minted before suspension is rejected after it.
- [ ] **Task 1.12** — addresses CRUD and default selection; the frontend auth store, login/register/profile/address views, guards, and **single-flight refresh**. *Test first:* five concurrent 401s issue exactly one refresh; a concurrent double set-default is arbitrated by the partial index.

**Phase 1 exit:** every acceptance criterion in story-01 and story-02 is green;
the router audit test passes with real routes; `npm run test:coverage` meets the
floors.

---

## Phase 2 — Supply side (story-03)

Tasks follow the same pattern; each cites the acceptance criteria from
[story-03](stories/story-03-restaurant-onboarding-menu-management.md).

- [ ] **Task 2.1** — `restaurants`, `restaurant_hours`, `driver_profiles` migrations with `uq_restaurants_owner`, `uq_restaurants_slug`, `uq_hours_restaurant_day` and the check constraints. *Test first:* a second restaurant for one owner violates the unique index; `closes_at ≤ opens_at` violates the check.
- [ ] **Task 2.2** — `orderability.js` as a pure function. *Test first:* the full truth table across `status × isAcceptingOrders × inHours`, including the boundary minutes at `opensAt` and `closesAt`.
- [ ] **Task 2.3** — restaurant profile and hours endpoints, slug generation, `requireApprovedRestaurant`. *Test first:* a week missing Wednesday returns 422 and leaves the stored hours unchanged.
- [ ] **Task 2.4** — `menu_categories` and `food_items` migrations with the two partial unique name indexes, the price check and the restaurant-consistency trigger. *Test first:* a soft-deleted category name can be reused; a cross-restaurant category assignment is rejected.
- [ ] **Task 2.5** — category CRUD, bulk reorder, the non-empty delete rule. *Test first:* deleting a category with two items returns `409 CATEGORY_NOT_EMPTY` with the count.
- [ ] **Task 2.6** — item CRUD, the availability endpoint, the public menu projection. *Test first:* deactivating a category hides its items from the public projection without changing their `is_available` flags; a query-count assertion proves no N+1.
- [ ] **Task 2.7** — admin restaurant listing, approve and reject with auditing. *Test first:* approving a restaurant with no available items returns 422; approval makes it appear in the public listing within the same test.
- [ ] **Task 2.8** — the restaurant dashboard, profile, hours, categories and items screens, and the admin approval queue.

**Phase 2 exit:** the `restaurant-approval` E2E scenario passes.

---

## Phase 3 — Demand side (story-04, story-05)

- [ ] **Task 3.1** — discovery listing with filters, sorts and window-function pagination. *Test first:* non-`ACTIVE` restaurants are absent and 404 by ID; `sort=passwordHash` is rejected.
- [ ] **Task 3.2** — the SQL/JS orderability consistency test and the `openNow` filter. *Test first:* the SQL filter and `orderability.js` agree across a shared fixture set.
- [ ] **Task 3.3** — trigram search with wildcard escaping. *Test first:* `%` is treated literally; "rill" matches "Mixed Grill"; items of inactive restaurants are excluded.
- [ ] **Task 3.4** — the home, listing and detail views with URL-driven filter state and debounced search.
- [ ] **Task 3.5** — `carts` and `cart_items` migrations. *Test first:* two `ACTIVE` carts for one customer violate `uq_carts_one_active`.
- [ ] **Task 3.6** — `cartValidator` as a pure function. *Test first:* the full staleness matrix — unavailable, removed, price-changed, category-inactive, restaurant-closed.
- [ ] **Task 3.7** — the add flow with binding, the mismatch conflict and `?replace=true`. *Test first:* **a cross-restaurant add returns 409 and leaves the cart byte-identical**; `?replace=true` clears and rebinds atomically.
- [ ] **Task 3.8** — quantity update, remove, clear, and the read with issues and totals. *Test first:* quantity 0 → 422; duplicate add increments and caps at 20.
- [ ] **Task 3.9** — the cart store, cart view, header badge and the switch-restaurant dialog. *Test first:* dismissing the dialog sends no request and changes nothing.

**Phase 3 exit:** the `cart-restaurant-switch` E2E scenario passes.

---

## Phase 4 — Transaction core (story-06, story-07)

- [ ] **Task 4.1** — `orders`, `order_items`, `order_status_events` migrations with `chk_orders_totals`, `chk_order_items_line_total` and `chk_orders_cancel_fields`. *Test first:* an order whose total does not equal the sum of its parts is rejected by the database.
- [ ] **Task 4.2** — `orderStateMachine.js`. *Test first:* the **245-combination matrix** (`status × status × role`) asserted against the [§7.3](master-sdd.md#73-order-state-machine) table.
- [ ] **Task 4.3** — `orderPricing.js` and `orderNumber.js`. *Test first:* tax rounding, the `0.1 + 0.2` case, and 10k unique order numbers.
- [ ] **Task 4.4** — the checkout transaction. *Test first:* **place an order, then rename, reprice and delete the item — the order is unchanged and `food_item_id` is null**; and a forced mid-transaction failure leaves no order and an untouched cart.
- [ ] **Task 4.5** — the `transition()` service with the row lock and the `onTransition` hooks. *Test first:* two parallel transitions produce one 200 and one 409.
- [ ] **Task 4.6** — customer order endpoints: list, detail, status polling, cancel. *Test first:* cancelling at `PREPARING` returns 409 with an explanation; another customer's order returns 404.
- [ ] **Task 4.7** — the order-timeout job. *Test first:* a stale `PENDING` order is cancelled as `SYSTEM` with `ACCEPT_TIMEOUT`.
- [ ] **Task 4.8** — restaurant order endpoints: queue, detail, accept, reject, start-preparing, ready, cancel. *Test first:* accepting another restaurant's order returns 404; rejecting without a reason returns 422.
- [ ] **Task 4.9** — checkout, my-orders and tracking views; the restaurant queue with polling and `OrderActionBar`.

**Phase 4 exit:** `menu-price-change` and `customer-cancels` pass; the state
machine reports 100% branch coverage.

---

## Phase 5 — Fulfilment (story-08)

- [ ] **Task 5.1** — `delivery_assignments` migration with the three partial unique indexes. *Test first:* a second `ACCEPTED` assignment for one driver violates `uq_assignments_driver_active`.
- [ ] **Task 5.2** — admin driver creation and approval. *Test first:* the initial password appears exactly once and works for login; the profile starts `PENDING_APPROVAL`.
- [ ] **Task 5.3** — driver profile, availability and location. *Test first:* `ON_DELIVERY` sent as an availability is rejected; going offline mid-delivery returns 409.
- [ ] **Task 5.4** — the dispatch service and candidate selection. *Test first:* Haversine ordering with null-location drivers last; a driver who declined is never re-offered the same order.
- [ ] **Task 5.5** — offer accept and decline. *Test first:* **two concurrent accepts produce exactly one `ACCEPTED`** and one `409 OFFER_NO_LONGER_AVAILABLE`.
- [ ] **Task 5.6** — the dispatch, offer-expiry and escalation jobs with `runLocked`. *Test first:* **with no eligible drivers the order keeps its status, stays uncancelled, and is escalated after 15 minutes**.
- [ ] **Task 5.7** — pick-up and deliver. *Test first:* pick-up before `READY_FOR_PICKUP` returns 409; delivery releases the driver to `AVAILABLE`.
- [ ] **Task 5.8** — driver screens; progressive PII disclosure. *Test first:* the offer payload contains no street address and the accepted payload does.

**Phase 5 exit:** `full-order-journey`, `no-driver-available` and
`driver-single-delivery` all pass.

---

## Phase 6 — Trust & operations (story-09, story-10)

- [ ] **Task 6.1** — `reviews` migration with `uq_reviews_order` and `chk_reviews_driver_rating`. *Test first:* a second review for one order violates the index.
- [ ] **Task 6.2** — `ratingAggregator.js`. *Test first:* zero reviews → `0.00`/`0`; a hidden review is excluded; half-up rounding to two decimals.
- [ ] **Task 6.3** — review create and edit with the 24-hour window. *Test first:* a non-delivered order returns 422; an edit at 25 hours returns 409.
- [ ] **Task 6.4** — public review listing. *Test first:* the serialized body contains no email, phone or surname.
- [ ] **Task 6.5** — review UI: the accessible star rating, the form, my-reviews and the rating summary.
- [ ] **Task 6.6** — `admin_audit_logs` and `notifications` migrations; `audit.service.js`. *Test first:* **a table-driven test asserting every mutating admin endpoint writes exactly one audit row**.
- [ ] **Task 6.7** — admin user, restaurant and driver management. *Test first:* a suspended user's existing access token is rejected on the next request; suspending a driver mid-delivery returns 409; suspending oneself returns 422.
- [ ] **Task 6.8** — admin order oversight, the stuck-order views and force-cancel. *Test first:* force-cancelling a `DELIVERED` order returns 409; force-cancelling mid-delivery releases the driver.
- [ ] **Task 6.9** — review moderation. *Test first:* hiding lowers the aggregate and restoring returns it.
- [ ] **Task 6.10** — `stats.service.js`. *Test first:* GMV excludes cancelled orders; the status breakdown matches the fixture.
- [ ] **Task 6.11** — the admin UI: dashboard, tables, moderation queue and confirmation dialogs.
- [ ] **Task 6.12** — hardening: the full E2E suite, axe passes, the NFR-5 benchmark, `npm audit`, and the coverage gate.

**Phase 6 exit:** all twelve E2E scenarios green; every NFR gate in
[testing-strategy §7](architecture/testing-strategy.md#7-coverage-and-ci) met.

---

## Self-review against the spec

Checked after writing, as the writing-plans skill requires:

1. **Spec coverage.** Every FR group maps to a task: FR-1 → 1.7–1.12; FR-2 → 2.1–2.3; FR-3 → 2.4–2.6; FR-4 → 3.1–3.4; FR-5 → 3.5–3.9; FR-6 → 4.1–4.9; FR-7 → 5.1–5.8; FR-8 → 6.1–6.5; FR-9 → 2.7, 5.2, 6.6–6.11; FR-10 → 1.1–1.6. No gaps.
2. **Placeholders.** Phase 1 tasks carry complete, runnable code. Phases 2–6 are specified as test-first task statements with named acceptance criteria and exact constraint names rather than invented code, because the fine-grained code for later phases depends on interfaces the earlier phases establish — writing it now would be speculative rather than authoritative. Each of those tasks names its file targets through its story and spec, and its first test is stated concretely.
3. **Type consistency.** `money.add/multiply/sum/roundTax/compare` are used with those names throughout. `AppError` subclasses take `(code, { details })` everywhere. `withTransaction(fn, trx?)` has one signature. `validate({ body, params, query })` writes `req.validated` in every reference. `orders.transition(orderId, toStatus, actor, { reason, note })` is cited identically in spec-07, backend-architecture and Task 4.5.

---

## Execution handoff

Plan complete and saved to `docs/sdd/implementation-plan.md` (this location
rather than the skill's default `docs/superpowers/plans/`, to keep the whole SDD
in one tree). Two execution options:

1. **Subagent-driven (recommended)** — a fresh subagent per task, with review between tasks and fast iteration. Use `superpowers:subagent-driven-development`.
2. **Inline execution** — run tasks in-session with batched checkpoints. Use `superpowers:executing-plans`.

Whichever is chosen, the ordering constraint stands: **nothing in Phase N+1
starts until Phase N's exit criteria are green.** The phases exist because the
dependencies are real, not because they make a tidy table.
