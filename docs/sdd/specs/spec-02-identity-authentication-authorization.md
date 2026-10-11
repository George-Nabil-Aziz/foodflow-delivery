# Spec 02 — Identity, Authentication & Authorization

**Status:** Approved · **Owner:** Platform · **Covers:** FR-1.1 – FR-1.8, NFR-9

## Objective

Provide one identity model for all four actors, a JWT-based session mechanism
that can actually be revoked, role-based authorization guards, and self-service
profile and address management. Every other spec's authorization story reduces
to "apply the guards this spec defines".

## Scope

**In scope**
- `users` table, roles, account status, soft delete.
- Registration (CUSTOMER, RESTAURANT), login, refresh, logout, password change.
- bcrypt password hashing.
- Access-token issue/verify; refresh-token issue/rotate/revoke with reuse detection.
- `authenticate` and `authorize` middleware; the ownership-check convention.
- `GET/PATCH /api/me` with role-specific profile blocks.
- Customer delivery addresses (CRUD + default selection).
- Frontend auth store, login/register/profile/addresses views, route guards, single-flight token refresh.

**Out of scope** — restaurant profile fields (spec-03), driver profile fields
(spec-08), admin account management (spec-10), email verification and password
reset (future enhancements).

## Actors

All four. `CUSTOMER` and `RESTAURANT` self-register; `DRIVER` is created by
spec-10's admin endpoint; `ADMIN` is seeded.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1.1 | `POST /api/auth/register` creates a CUSTOMER or RESTAURANT account and returns a session |
| FR-1.2 | Passwords hashed with bcrypt cost 12; plaintext never stored, logged or returned |
| FR-1.3 | `POST /api/auth/login` returns a 15-minute access token and a 30-day refresh token |
| FR-1.4 | `authenticate` verifies the access token, loads the user, and rejects suspended or soft-deleted users |
| FR-1.5 | `authorize(...roles)` gates by role; ownership is a separate service-layer check |
| FR-1.6 | `POST /api/auth/change-password` requires the current password and revokes every refresh token for the user |
| FR-1.7 | A suspension takes effect on the next request, not at the next login |
| FR-1.8 | `GET/PATCH /api/me`; customers manage 0..N addresses with exactly one default |
| FR-1.9 | `POST /api/auth/refresh` rotates the token; reuse of a revoked token revokes the whole family |
| FR-1.10 | `POST /api/auth/logout` revokes the presented refresh token |

## Business Rules

BR-A1 – BR-A8 from [master-sdd §7.1](../master-sdd.md#71-account-rules) are
normative here. Restated where they drive code:

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-A1 | Email unique, case-insensitive | `CITEXT` + `uq_users_email`; `23505` → `EMAIL_ALREADY_REGISTERED` |
| BR-A2 | Password 8–72 chars, ≥1 letter, ≥1 digit | Zod; 72 rejected explicitly, never truncated |
| BR-A3 | Self-registration may create only CUSTOMER or RESTAURANT | Enum in the schema; `DRIVER`/`ADMIN` → `403 FORBIDDEN_ROLE` |
| BR-A4 | Status on creation per role | Service; RESTAURANT also creates a `PENDING_APPROVAL` restaurant shell |
| BR-A5 | Suspended users cannot log in or use an existing token | Login check + `authenticate` check |
| BR-A6 | Users are soft-deleted; history survives | `deleted_at`; `authenticate` rejects deleted users |
| BR-A7 | At most one default address per customer | `uq_addresses_one_default` partial index + a transaction that clears the old default |
| BR-A8 | An address referenced by an order is never hard-deleted | Soft delete only; the order also holds a JSONB snapshot |
| BR-A9 | `users.role` is immutable | No endpoint accepts `role` on update; the key is stripped by the schema |

## Data Requirements

`users` and `customer_addresses` and `refresh_tokens` per
[database-design §4](../architecture/database-design.md#4-table-detail).

Load-bearing constraints:
- `uq_users_email UNIQUE (email)` on a `CITEXT` column.
- `uq_addresses_one_default UNIQUE (user_id) WHERE is_default AND deleted_at IS NULL` — the database, not the service, guarantees BR-A7.
- `refresh_tokens.token_hash UNIQUE`; `family_id` for family revocation.

Seed: one `ADMIN` user from environment-supplied credentials, created by
migration so a fresh environment is administrable.

## API Requirements

Full payloads in [api-design §2–3](../architecture/api-design.md#2-authentication--apiauth).

| Method | Route | Auth | Role | Key errors |
|--------|-------|------|------|------------|
| POST | `/api/auth/register` | — | — | 422, 409 `EMAIL_ALREADY_REGISTERED`, 403 `FORBIDDEN_ROLE`, 429 |
| POST | `/api/auth/login` | — | — | 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_SUSPENDED`, 429 |
| POST | `/api/auth/refresh` | — | — | 401 `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED`, 403 |
| POST | `/api/auth/logout` | 🔓 | any | 401 |
| POST | `/api/auth/change-password` | 🔓 | any | 401 `INVALID_CREDENTIALS`, 422 |
| GET | `/api/me` | 🔓 | any | 401 |
| PATCH | `/api/me` | 🔓 | any | 422 |
| GET | `/api/addresses` | 🔓 | C | 401, 403 |
| POST | `/api/addresses` | 🔓 | C | 422 |
| PATCH | `/api/addresses/:id` | 🔓 | C +own | 404, 422 |
| DELETE | `/api/addresses/:id` | 🔓 | C +own | 404 |
| POST | `/api/addresses/:id/default` | 🔓 | C +own | 404 |

## Frontend Requirements

- `auth` Pinia store: `user`, `accessToken`, `refreshToken`, `role`, `restaurant`/`driverProfile`, `isAuthenticated`; persists to `localStorage`; restores on boot; clears on logout or failed refresh.
- Views: `LoginView`, `RegisterView` (role selector: "I want to order" / "I run a restaurant"), `ProfileView`, `AddressesView`, `ForbiddenView`.
- Router guards `requiresAuth` / `requiresRole` / `requiresGuest`, and `homeFor(role)` post-login redirect honouring `?redirect=`.
- **Single-flight refresh** in the Axios interceptor — mandatory, because single-use refresh tokens plus concurrent 401s would otherwise trip reuse detection and log the user out ([frontend-architecture §3](../architecture/frontend-architecture.md#3-http-layer)).
- Address form with a "set as default" control; the list shows exactly one default badge.

## Backend Requirements

Module `modules/auth/` (tokens, register, login, refresh, logout, password) and
`modules/users/` (profile, addresses). Public interfaces per
[system-architecture §2](../architecture/system-architecture.md#2-domain-modules).

`authenticate`:
1. Extract the bearer token → `401 TOKEN_MISSING` if absent.
2. Verify with the algorithm pinned and `iss`/`aud` checked → `401 TOKEN_INVALID` / `TOKEN_EXPIRED`.
3. Load the user by `sub` → `401 TOKEN_INVALID` if missing or `deleted_at` is set.
4. `status = SUSPENDED` → `403 ACCOUNT_SUSPENDED`.
5. Attach `req.user = { id, role, email, status }`.

Step 3 is what makes FR-1.7 true and is not optional for performance reasons —
it is one indexed primary-key lookup.

Registration for `role = RESTAURANT` creates the user **and** the
`PENDING_APPROVAL` restaurant shell in one transaction; a half-created owner
with no restaurant would be unrecoverable through the API.

## Validation

Per [master-sdd §15](../master-sdd.md#15-validation): registration, login,
address. Additional rules:
- `PATCH /api/me` accepts only `fullName` and `phone`. `email`, `role` and `status` are not in the schema and are therefore stripped.
- `changePassword`: `newPassword` must differ from `currentPassword` (422 with a specific `details` entry).
- Address `latitude`/`longitude` are optional but must be supplied together.

## Authorization

- Public: register, login, refresh.
- Authenticated, any role: `/api/me`, logout, change-password.
- `CUSTOMER` only: all `/api/addresses` routes, plus ownership — the repository filters `user_id = req.user.id`, so another customer's address ID returns 404 (ADR-010).
- The **router audit test** introduced in spec-01 must now pass: every route declares a guard or is on the public allow-list.

## Error Handling

| Condition | Response |
|-----------|----------|
| Unknown email or wrong password | `401 INVALID_CREDENTIALS` — identical body and comparable timing (a dummy bcrypt comparison runs on the unknown-email path) |
| Suspended account at login or on any request | `403 ACCOUNT_SUSPENDED` |
| Duplicate email | `409 EMAIL_ALREADY_REGISTERED` |
| `role: "ADMIN"` at registration | `403 FORBIDDEN_ROLE` — never a silent downgrade to CUSTOMER |
| Expired access token | `401 TOKEN_EXPIRED` — a distinct code so the client knows to refresh rather than to log out |
| Revoked/unknown refresh token | `401 REFRESH_TOKEN_INVALID` |
| Already-used refresh token | `401 REFRESH_TOKEN_REUSED` + family revocation |
| Another user's address | `404 RESOURCE_NOT_FOUND` |

## Testing Requirements

Unit — bcrypt hash/compare; JWT sign/verify, expiry, `alg: none` rejection,
`iss`/`aud` mismatch; refresh-token hashing; every registration/login/address
schema boundary; `authenticate` against a suspended user fixture.

Integration — the `auth.integration` and `authorization.matrix` suites in
[testing-strategy §4](../architecture/testing-strategy.md#4-backend-service-and-api-integration-tests).
Specifically required: registration of both roles including the restaurant shell;
duplicate email; `role: DRIVER` rejected; login happy/wrong-password/suspended;
**a valid access token minted before suspension is rejected after it** (FR-1.7);
refresh rotation invalidates the old token; **reuse revokes the family**;
password change revokes all sessions; one-default enforcement under a concurrent
double set-default (the partial index must make one of them fail); another
customer's address returns 404.

Frontend — auth store lifecycle; guard redirects for each role; the
single-flight refresh test with five concurrent 401s issuing exactly one refresh.

## Edge Cases

| Case | Expected |
|------|----------|
| Registering an email that differs only in case | `409` — `CITEXT` makes `Sara@x.com` and `sara@x.com` the same account |
| 73-character password | `422` naming the 72-character limit, not a silent truncation |
| Restaurant registration where the restaurant insert fails | Whole transaction rolls back; no orphan user |
| Two tabs refresh simultaneously | Single-flight on the client; if both reach the server, the second gets `REFRESH_TOKEN_REUSED` and both sessions end — correct, and the reason single-flight is mandatory |
| Setting default on an address that is already default | 200, idempotent, no constraint violation |
| Deleting the default address | Soft-deleted; no address is default afterwards; checkout then requires an explicit `addressId` |
| Soft-deleted user with a live access token | `401` on the next request |
| Clock skew on token expiry | 30 s leeway allowed in verification |

## Related Stories

- [story-02 — Customer Registration, Login & Profile](../stories/story-02-customer-registration-login-profile.md) (primary)
- [story-03 — Restaurant Onboarding](../stories/story-03-restaurant-onboarding-menu-management.md) (restaurant registration path)
- [story-08 — Driver Onboarding & Delivery](../stories/story-08-driver-onboarding-delivery-execution.md) (driver login and profile)
- [story-10 — Platform Administration](../stories/story-10-platform-administration-reporting.md) (suspension revoking sessions)

## Dependencies

**Depends on:** [spec-01](spec-01-platform-foundation-api-contract.md) — envelope, validation middleware, error classes, config.
**Depended on by:** every spec except spec-01 and spec-05's public reads.
