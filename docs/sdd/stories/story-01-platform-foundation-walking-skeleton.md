# Story 01 — Platform Foundation & Walking Skeleton

**Phase:** 1 · **Depends on:** nothing · **Blocks:** every other story

## Goal

Stand up a running full-stack skeleton — Vue app, Express API, PostgreSQL —
with the response envelope, error handling, validation pipeline, configuration,
logging and test harness in place, so that every later story adds domain
behaviour rather than re-litigating infrastructure.

## User Story

> As a **developer on the FoodFlow team**
> I want a running, tested application skeleton with the cross-cutting concerns already decided
> So that I can implement domain features without inventing a new error format, validation approach or test setup each time.

This is the one story whose user is the team. It is included because the
alternative — folding foundation work into story-02 — would make the first
domain story enormous and would bury the API contract inside an auth feature,
where the next four stories would each reinterpret it.

## Scope

**In:** repository layout, Docker Compose for PostgreSQL, backend app assembly,
config validation, Knex + migrations infrastructure, extensions and enum types,
the envelope, `AppError` hierarchy and error handler, `validate` middleware,
logging with correlation IDs, `/api/health`, the Vue shell with router/Pinia/
Tailwind/Axios, shared UI components, the test harness, CI pipeline, and the
seed script skeleton.

**Out:** any domain table, endpoint or screen.

## Actors

Developers. No end-user actor exercises this story directly; a visitor sees only
the public shell and the 404/403 pages.

## Preconditions

- Node.js 20 LTS and Docker available.
- An empty repository.

## Functional Requirements

Implements spec-01 in full: FR-10.1 – FR-10.8.

1. `docker compose up -d` starts PostgreSQL 16 with `pgcrypto`, `citext` and `pg_trgm`.
2. `npm run migrate` applies the extension, enum-type and trigger-function migrations.
3. `npm run dev` (backend) boots on `PORT`, refusing to start on invalid config.
4. `GET /api/health` returns 200 with database status, 503 when the database is unreachable.
5. Every response — including 404s and unexpected 500s — uses the envelope.
6. Every request carries a correlation ID in `X-Request-Id`, `meta.requestId` and every log line.
7. `npm run dev` (frontend) serves a Vue app that routes between a home page, a 404 page and a 403 page, renders the shared layouts, and displays a toast when an API call fails.
8. `npm test` runs the full suite green in both workspaces.

## Business Rules

BR-F1 – BR-F5 from [spec-01](../specs/spec-01-platform-foundation-api-contract.md#business-rules):
module import boundaries, no `req.body` outside `validate`, money only through
`shared/money.js`, one error-code registry, allow-list mappers.

## Acceptance Criteria

```gherkin
Given a clean checkout and a running database
When I run the documented setup commands
Then the API and the frontend both start within 10 minutes of a fresh clone

Given the API is running
When I GET /api/health
Then I receive 200 with { status: "ok", database: "up" } inside the success envelope

Given the database is stopped
When I GET /api/health
Then I receive 503 with { status: "degraded", database: "down" } inside the envelope

Given any request
When the API responds
Then the response carries an X-Request-Id header equal to meta.requestId

Given a request to an unmatched /api path
When the API responds
Then I receive 404 with error.code = "RESOURCE_NOT_FOUND" in the envelope, not an HTML error page

Given a route handler that throws an unexpected error
When the API responds
Then I receive 500 with error.code = "INTERNAL_ERROR", no stack trace in the body,
  and the full stack in the logs keyed by the request ID

Given a request body containing keys not present in the schema
When it is validated
Then the extra keys are stripped and never reach the service layer

Given JWT_SECRET is shorter than 32 characters
When the process boots
Then it exits non-zero with a message naming the offending variable, before listening

Given the frontend is running
When I visit an unknown route
Then the 404 view renders inside the public layout

Given an API call fails
When the error reaches the UI
Then a toast appears with a human-readable message derived from error.code
```

## API Impact

New: `GET /api/health`. Establishes the envelope, the error-code registry and
the pagination contract that every later endpoint inherits.

## Database Impact

Migrations 1–2: extensions, all enum types from
[database-design §2](../architecture/database-design.md#2-enum-types), and the
shared `set_updated_at()` trigger function. No domain tables.

Creating every enum type up front — including `order_status` and
`assignment_status`, which nothing uses yet — keeps the type vocabulary in one
migration instead of scattering `CREATE TYPE` across seven later ones.

## Frontend Impact

Vite project; router with the four layouts and guard scaffolding; Pinia with the
`ui` store; the Axios instance with envelope unwrapping and `ApiError` mapping;
Tailwind configured; the shared component set from
[spec-01](../specs/spec-01-platform-foundation-api-contract.md#frontend-requirements);
`HomeView`, `NotFoundView`, `ForbiddenView`.

## Backend Impact

The full skeleton from
[backend-architecture §1](../architecture/backend-architecture.md#1-directory-structure)
minus the `modules/` contents: `app.js`, `server.js`, `config`, `shared/*`,
`middleware/*`, `jobs/runLocked.js`, `routes.js`.

## Validation

No domain validation. Delivers the `validate` middleware, the shared schema
fragments (`uuidParam`, `paginationQuery`, `sortQuery`) and the config schema.

## Error Cases

| Case | Expected |
|------|----------|
| Malformed JSON | `400 MALFORMED_REQUEST` in the envelope |
| Body over 100 KB | `413` normalized into the envelope |
| Unmatched route | `404 RESOURCE_NOT_FOUND` |
| Unexpected throw | `500 INTERNAL_ERROR`, generic message, stack logged |
| Database unreachable at boot | Clear message, non-zero exit |
| Invalid config | Named variable, non-zero exit, before listening |

## Security Considerations

- `helmet`, CORS allow-list (config rejects `*` in production), 100 KB body limit, global rate limiter.
- Logger redaction for `password`, `newPassword`, `token`, `refreshToken`, `authorization`.
- `.env` git-ignored from the first commit; `.env.example` committed with placeholders.
- The **router audit test** is introduced here as a failing-by-default guard that story-02 satisfies and every later story must keep passing.
- `npm audit --audit-level=high` wired into CI.

## Related Specs

- [spec-01 — Platform Foundation & API Contract](../specs/spec-01-platform-foundation-api-contract.md) (implements in full)

## Dependencies

**Must happen before:** every other story.
**Can happen in parallel with:** nothing.

## Testing Requirements

- Unit: envelope builders; each `AppError` subclass's status mapping; `mapPgError` per constraint name; the config schema's accept/reject cases; `money` arithmetic including `0.1 + 0.2`; `withTransaction` reusing a passed transaction.
- Integration: `/api/health` up and down; unmatched route envelope; unexpected throw producing a stack-free 500; `X-Request-Id` echo; oversized body; malformed JSON.
- Contract: an envelope-shape validator applied to sample success and error responses.
- Frontend unit: `ui` store toast lifecycle; the Axios interceptor unwrapping `data.data` and building `ApiError` with the right code.
- CI: the pipeline runs end to end and fails on a deliberately introduced lint error and on a coverage drop.
