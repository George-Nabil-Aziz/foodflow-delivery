# Spec 01 — Platform Foundation & API Contract

**Status:** Approved · **Owner:** Platform · **Covers:** FR-10.1 – FR-10.5, NFR-1, NFR-11, NFR-12, NFR-15

## Objective

Establish the shared substrate every other spec depends on: the response
envelope, the error taxonomy, the validation pipeline, configuration loading,
database access and transactions, logging, and the test harness. Without this,
each subsequent module would invent its own error shape and its own idea of what
a validated request is, and the API would be inconsistent by the third module.

## Scope

**In scope**
- Express application assembly, middleware order, route mounting.
- The success/error response envelope and the error-code registry.
- `AppError` hierarchy, the terminal error handler, PostgreSQL error translation.
- Zod `validate` middleware with unknown-key stripping.
- Environment configuration loaded and validated at boot.
- Knex setup, connection pool, `NUMERIC` string parsing, `withTransaction` helper.
- Structured logging with a per-request correlation ID.
- Module boundary conventions and the lint rules that enforce them.
- `GET /api/health`.
- Vue application shell: Vite, router, Pinia, Tailwind, Axios instance with interceptors, layouts, shared UI primitives.
- Test harness: Vitest config, database reset helpers, factories, Supertest setup.

**Out of scope** — every domain behaviour. This spec ships no business rules.

## Actors

None directly. This spec serves developers and constrains every other spec.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-10.1 | Every response conforms to one envelope. Success: `{ success: true, data, meta }`. Failure: `{ success: false, error: { code, message, details? }, meta }`. `meta.requestId` is always present |
| FR-10.2 | Every route with input declares a Zod schema; controllers read only `req.validated` |
| FR-10.3 | Every error passes through one handler. Non-`AppError` throws become `500 INTERNAL_ERROR` with a generic message; the stack goes to logs only |
| FR-10.4 | Configuration is parsed and validated at boot; an invalid value exits the process with a readable message before the server listens |
| FR-10.5 | Every request gets a UUID correlation ID, returned as `X-Request-Id`, present in `meta.requestId` and in every log line for that request |
| FR-10.6 | `GET /api/health` returns `{ status, uptime, database, version }`; 200 when the database responds, 503 when it does not |
| FR-10.7 | A `withTransaction(fn, trx?)` helper runs `fn` in a transaction, reusing a passed transaction rather than nesting a second connection |
| FR-10.8 | The frontend shell boots, routes between public pages, renders the shared layouts, and surfaces API errors as toasts |

## Business Rules

| ID | Rule |
|----|------|
| BR-F1 | A module may import another module only through `modules/<name>/index.js`, and may query only its own tables (NFR-1) |
| BR-F2 | `req.body` may not be referenced outside `middleware/validate.js` — enforced by lint |
| BR-F3 | Money is never a JS `number` in arithmetic; all operations go through `shared/money.js` |
| BR-F4 | Every error code exists exactly once in `shared/errors/codes.js`; throwing an unregistered code fails a test |
| BR-F5 | Response DTOs are built by allow-list mappers, never by mutating or deleting fields from a row |

## Data Requirements

No domain tables. This spec owns:
- The extension setup migration (`pgcrypto`, `citext`, `pg_trgm`).
- The shared `set_updated_at()` trigger function used by every later table.
- The enum type definitions listed in [database-design §2](../architecture/database-design.md#2-enum-types).
- Knex configuration for `development`, `test` and `production`.

## API Requirements

| Method | Route | Auth | Response |
|--------|-------|------|----------|
| GET | `/api/health` | — | `200 { status: "ok", uptime, database: "up", version }` / `503 { status: "degraded", database: "down" }` |
| * | unmatched `/api/*` | — | `404 { code: "RESOURCE_NOT_FOUND" }` in the envelope |

The envelope and the full error-code registry are specified in
[master-sdd §14](../master-sdd.md#14-error-handling) and are normative for every
other spec.

## Frontend Requirements

- Vite project with `@` → `src` alias, `.env` handling for `VITE_API_URL` and `VITE_POLL_INTERVAL_MS`.
- Router with `PublicLayout` / `AuthLayout` / `CustomerLayout` / `DashboardLayout` and the guard scaffolding (guards are wired here, roles are populated by spec-02).
- Pinia with the `ui` store (toasts, global loading) and empty `auth`/`cart` stores to be filled by later specs.
- Axios instance with the request-ID pass-through, envelope unwrapping and `ApiError` mapping. The refresh interceptor is scaffolded here and completed in spec-02.
- Shared components: `AppButton`, `AppInput`, `AppSelect`, `AppCard`, `AppModal`, `AppBadge`, `AppSpinner`, `AppPagination`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `ToastHost`.
- Tailwind configured with the project's spacing/color scale and the responsive breakpoints from [frontend-architecture §7](../architecture/frontend-architecture.md#7-responsiveness-and-accessibility).
- A `NotFoundView` and a `ForbiddenView`.

## Backend Requirements

Middleware order is normative — it is the order in
[system-architecture §3](../architecture/system-architecture.md#3-request-lifecycle):
`requestId → helmet → cors → json(100kb) → rateLimit → router → authenticate →
authorize → validate → controller`, then `notFound` and `errorHandler` last.

Directory layout per
[backend-architecture §1](../architecture/backend-architecture.md#1-directory-structure).
Layer contract per [§2](../architecture/backend-architecture.md#2-layer-contract).

`server.js` responsibilities: load config → verify database connectivity → start
listening → start jobs → register `SIGTERM`/`SIGINT` for graceful drain →
register `unhandledRejection`/`uncaughtException` to log and exit.

## Validation

`validate({ body, params, query })` parses each present schema with
`safeParse`, writes the parsed result to `req.validated[key]`, and converts a
failure into `422 VALIDATION_ERROR` with
`details: [{ field: path.join('.'), issue: message }]`. Unknown keys are
stripped by Zod's default object behaviour — this is the mass-assignment
defence, so schemas must not use `.passthrough()`.

Shared schema fragments: `uuidParam`, `paginationQuery` (`page ≥1`,
`limit 1–100` with defaults), `sortQuery(allowedFields)`.

## Authorization

None at this layer beyond the scaffolding: `authenticate` and `authorize` are
defined in spec-02. The **router audit test** is introduced here as a failing
placeholder so that spec-02 makes it pass and every later spec keeps it passing.

## Error Handling

The `AppError` hierarchy:

| Class | HTTP | Used for |
|-------|------|----------|
| `ValidationError` | 422 | Schema and business-validation failures |
| `UnauthorizedError` | 401 | Missing/invalid/expired credentials |
| `ForbiddenError` | 403 | Wrong role, suspended account |
| `NotFoundError` | 404 | Missing or not-owned resources |
| `ConflictError` | 409 | State conflicts and uniqueness violations |
| `InternalError` | 500 | Unexpected |

Each carries `code`, `status`, `message` (for logs) and `publicMessage` (for
clients), plus optional `details`. `mapPgError` translates `23505`, `23503` and
`23514` by constraint name into the matching domain code.

## Testing Requirements

- Unit: envelope builders; `AppError` subclasses map to the right status; `mapPgError` for each constraint name; config schema accepts a valid env and rejects a short `JWT_SECRET`, a missing `DATABASE_URL` and `CORS_ORIGINS: "*"` in production; `money` arithmetic including the 0.1+0.2 case; `withTransaction` reuses a passed `trx` rather than opening a second one.
- Integration: `/api/health` 200 with the DB up and 503 with it down; an unmatched route returns the envelope, not Express's HTML; a thrown non-`AppError` produces `500 INTERNAL_ERROR` with no stack in the body; `X-Request-Id` is echoed and matches `meta.requestId`; a body over 100 KB is rejected.
- Contract: a schema validator asserts the envelope shape on a sample of success and error responses.
- Lint: a test asserts the boundary rule fires on a deliberate cross-module import fixture.
- Frontend: `ui` store toast lifecycle; the Axios interceptor unwraps `data.data` and converts an error body into `ApiError` with the right `code`.

## Edge Cases

| Case | Expected |
|------|----------|
| Malformed JSON body | `400 MALFORMED_REQUEST`, not Express's default HTML error |
| Body exceeds 100 KB | `413` normalized into the envelope as `MALFORMED_REQUEST` |
| Database down at boot | Process logs a clear message and exits non-zero rather than serving 500s |
| Database drops mid-flight | `/api/health` reports 503; in-flight requests surface `INTERNAL_ERROR` with the request ID |
| `NUMERIC` returned from PG | Parsed as a string, never a float (ADR-009) |
| Two concurrent `withTransaction` calls sharing a `trx` | The inner call joins the outer transaction; only the outer one commits |
| Unknown keys in a valid payload | Silently stripped, request succeeds with the known fields |

## Related Stories

- [story-01 — Platform Foundation & Walking Skeleton](../stories/story-01-platform-foundation-walking-skeleton.md) (primary)
- [story-02 — Customer Registration, Login & Profile](../stories/story-02-customer-registration-login-profile.md) (first consumer; proves the envelope and validation pipeline under a real domain)

## Dependencies

**Depends on:** nothing.
**Depended on by:** every other spec. No domain work can begin until this is
green, which is why it is Phase 1, story-01.
