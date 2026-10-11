# Story 02 — Customer Registration, Login & Profile

**Phase:** 1 · **Depends on:** story-01 · **Blocks:** story-03, story-05, story-06, story-10

## Goal

Deliver the complete identity slice: a customer can create an account, log in,
stay logged in across a token expiry, change their password, edit their profile
and manage delivery addresses — with the guards that every later story reuses.

## User Story

> As a **customer**
> I want to create an account, sign in, and keep my details and delivery addresses up to date
> So that I can order food without re-entering my information every time.

## Scope

**In:** `users`, `customer_addresses`, `refresh_tokens`; register, login,
refresh, logout, change password; `authenticate` and `authorize` middleware;
`GET/PATCH /api/me`; address CRUD and default selection; the frontend auth
store, login/register/profile/address views, route guards and single-flight
refresh.

**In, for the restaurant role:** registration accepts `role = RESTAURANT` and
creates the `PENDING_APPROVAL` restaurant shell. Restaurant *features* are
story-03; the registration path belongs here so the identity module ships once.

**Out:** driver accounts (story-08/10), admin account management (story-10),
email verification and password reset (future enhancements).

## Actors

CUSTOMER (primary), RESTAURANT (registration path only), and the seeded ADMIN.

## Preconditions

- Story-01 complete: envelope, validation, error handling, config, test harness.

## Functional Requirements

Implements spec-02: FR-1.1 – FR-1.10.

1. Register with email, password, full name, phone and role (`CUSTOMER` or `RESTAURANT`).
2. Passwords hashed with bcrypt cost 12.
3. Login returns a 15-minute access token and a 30-day refresh token.
4. `authenticate` verifies the token, loads the user and rejects suspended or deleted accounts on **every** request.
5. `authorize(...roles)` gates by role.
6. Refresh rotates single-use tokens; reuse revokes the family.
7. Logout revokes the presented refresh token.
8. Change password requires the current one and revokes every session.
9. `GET /api/me` returns the user plus a role-specific block; `PATCH /api/me` updates name and phone only.
10. Customers create, edit, soft-delete and default their addresses, with exactly one default.

## Business Rules

BR-A1 – BR-A9 from [spec-02](../specs/spec-02-identity-authentication-authorization.md#business-rules).
The ones with visible behaviour: case-insensitive unique email; password 8–72
with a letter and a digit; `role: DRIVER|ADMIN` at registration is a 403, not a
silent downgrade; suspension takes effect on the next request; exactly one
default address.

## Acceptance Criteria

```gherkin
Given I am a new visitor
When I register with a valid email, password, name and phone as a customer
Then my account is created, I receive an access token and a refresh token,
  and the response contains no password field of any kind

Given an account already exists with "sara@example.com"
When I register with "SARA@Example.com"
Then I receive 409 EMAIL_ALREADY_REGISTERED

Given I submit a registration payload containing "role": "ADMIN"
When the request is processed
Then I receive 403 FORBIDDEN_ROLE and no account is created

Given I submit a registration payload containing "status": "ACTIVE" and "id": "<uuid>"
When the request is processed
Then those keys are stripped and the account is created with server-assigned values

Given I have an account
When I log in with the wrong password
Then I receive 401 INVALID_CREDENTIALS

Given no account exists for "nobody@example.com"
When I log in with that email
Then I receive 401 INVALID_CREDENTIALS — the same code, message and comparable timing
  as a wrong password, so account existence is not leaked

Given my account has been suspended
When I log in
Then I receive 403 ACCOUNT_SUSPENDED

Given I hold a valid access token issued before my account was suspended
When I call any authenticated endpoint
Then I receive 403 ACCOUNT_SUSPENDED — suspension does not wait for the token to expire

Given my access token has expired
When my client calls an endpoint and then refreshes
Then the refresh returns a new token pair, the old refresh token stops working,
  and the original request succeeds on retry

Given a refresh token that has already been used
When it is presented again
Then I receive 401 REFRESH_TOKEN_REUSED and every token in its family is revoked

Given I am logged in on two tabs and both hit an expired token at once
When the client refreshes
Then exactly one refresh request is sent and both tabs continue working

Given I am logged in
When I change my password with the correct current password
Then all my refresh tokens are revoked and my next refresh attempt fails

Given I am a customer with no addresses
When I add an address
Then it is created and becomes my default automatically

Given I have three addresses and the second is default
When I make the third default
Then exactly one address is default and it is the third

Given another customer's address ID
When I request it
Then I receive 404 RESOURCE_NOT_FOUND, not 403

Given I am not logged in
When I visit /account/profile
Then I am redirected to /login with a redirect parameter, and after logging in I land on /account/profile
```

## API Impact

New: `POST /api/auth/{register,login,refresh,logout,change-password}`,
`GET/PATCH /api/me`, `GET/POST /api/addresses`,
`PATCH/DELETE /api/addresses/:id`, `POST /api/addresses/:id/default`.
Details in [api-design §2–3](../architecture/api-design.md#2-authentication--apiauth).

## Database Impact

Migration 2: `users`, `refresh_tokens`, `customer_addresses` with
`uq_users_email` on `CITEXT`, `uq_addresses_one_default` (partial), and the
refresh-token hash/family columns. Seed: the initial admin user.

## Frontend Impact

`auth` Pinia store with `localStorage` persistence and boot restore; the Axios
refresh interceptor completed with **single-flight** semantics; `LoginView`,
`RegisterView` (with the customer/restaurant role selector), `ProfileView`,
`AddressesView`; `requiresAuth`/`requiresRole`/`requiresGuest` guards active;
`homeFor(role)` post-login routing honouring `?redirect=`.

## Backend Impact

`modules/auth/` and `modules/users/`; `authenticate` and `authorize` middleware;
the auth rate limiters; the router audit test now passing.

## Validation

Registration, login, address and profile rules from
[master-sdd §15](../master-sdd.md#15-validation). Notably: `PATCH /api/me`
accepts only `fullName` and `phone`, so `email`, `role` and `status` are stripped
by the schema rather than blocklisted in code.

## Error Cases

| Case | Expected |
|------|----------|
| Duplicate email (any casing) | `409 EMAIL_ALREADY_REGISTERED` |
| Weak or 73-character password | `422` naming the actual rule |
| `role: DRIVER` at registration | `403 FORBIDDEN_ROLE` |
| Wrong password / unknown email | `401 INVALID_CREDENTIALS`, identical |
| Suspended account, any request | `403 ACCOUNT_SUSPENDED` |
| Expired access token | `401 TOKEN_EXPIRED` (distinct so the client refreshes rather than logging out) |
| Reused refresh token | `401 REFRESH_TOKEN_REUSED` + family revocation |
| Another customer's address | `404 RESOURCE_NOT_FOUND` |
| Restaurant shell insert fails during registration | Whole transaction rolls back; no orphan user |

## Security Considerations

This story establishes most of [security.md](../architecture/security.md):
bcrypt cost 12 with an explicit 72-byte rule; hashed, rotating, single-use
refresh tokens with reuse detection; algorithm-pinned JWT verification with
`iss`/`aud`; the per-request user load that makes suspension real; allow-list
mappers so `password_hash` cannot be serialized; login/register rate limiting
keyed on IP + email; 404-over-403 for cross-tenant resources; and the router
audit test going green.

## Related Specs

- [spec-02 — Identity, Authentication & Authorization](../specs/spec-02-identity-authentication-authorization.md) (implements in full)
- [spec-01 — Platform Foundation & API Contract](../specs/spec-01-platform-foundation-api-contract.md) (first real consumer of the envelope and validation pipeline)

## Dependencies

**Must happen before:** story-03, story-05, story-06, story-08, story-09, story-10.
**Depends on:** story-01.
**Can happen in parallel with:** nothing — it is the gate for the demand and supply branches.

## Testing Requirements

- Unit: bcrypt round trip; JWT sign/verify, expiry, `alg: none`, `iss`/`aud` mismatch; refresh-token hashing; every registration/login/address schema boundary.
- Integration: the `auth.integration` and `authorization.matrix` suites from [testing-strategy §4](../architecture/testing-strategy.md#4-backend-service-and-api-integration-tests) — including the suspended-token test, the refresh-reuse family revocation, the password-change session revocation, the timing-parity check, and a concurrent double set-default proving the partial index arbitrates.
- Frontend: auth store lifecycle; guard redirects per role; **the single-flight refresh test with five concurrent 401s issuing exactly one refresh**; the address form's default handling.
- E2E: register → log out → log in → edit profile → add two addresses → switch the default.
