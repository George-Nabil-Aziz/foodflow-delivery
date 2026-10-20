# Test Cases — Authentication (TC-001 – TC-028)

> Covers [spec-02](../../sdd/specs/spec-02-identity-authentication-authorization.md) ·
> [story-02](../../sdd/stories/story-02-customer-registration-login-profile.md) ·
> FR-1.1 – FR-1.10 · BR-A1 – BR-A3, BR-A5
> Format: [test-plan §4](../test-plan.md#4-test-case-format) · Fixtures: [test-data.md](../test-data.md)

**Priority rationale.** Authentication is Critical throughout: a failure is
silent and unbounded — nothing alerts you that an attacker holds a session, and
the damage is complete before it is noticed.

---

## Registration

### TC-001 — Register a customer with valid data
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-01 · **Rules** FR-1.1, FR-1.2
**Type** API · **Priority** Critical
**Pre** No account exists for the email.
**Data** `nora.fresh@gmail.com`, `${TEST_USER_PASSWORD}`
**Steps** 1. `POST /api/auth/register` `{ email, password, fullName, phone, role: "CUSTOMER" }`.
**Expected** 201; `data.user` has `id`, `email`, `fullName`, `role: "CUSTOMER"`, `status: "ACTIVE"`; `data.accessToken`, `data.refreshToken`, `expiresIn: 900` present; `data.restaurant` is null.
**Post** One `users` row, `status ACTIVE`. One `refresh_tokens` row with a hashed token.
**Notes** Also asserts the envelope shape (`success`, `data`, `meta.requestId`).

### TC-002 — Registration response never exposes a password field
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-01 · **Rules** FR-1.2, NFR-9
**Type** Security · **Priority** Critical
**Steps** 1. Register a customer. 2. Serialize the whole response body to a string.
**Expected** 201; the body contains no `password`, `passwordHash` or `password_hash` key at any depth.
**Notes** Asserted against the **serialized body**, not the mapper, so a future column addition cannot slip through.

### TC-003 — Password is stored as a bcrypt hash, never plaintext
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-01 · **Rules** FR-1.2
**Type** Service · **Priority** Critical
**Steps** 1. Register a customer. 2. Read the `users` row directly.
**Expected** `password_hash` starts with `$2` and has cost 12; it does not equal the submitted password; `bcrypt.compare(password, hash)` is true.

### TC-004 — Duplicate email is rejected
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-02 · **Rules** BR-A1
**Type** API · **Priority** High
**Pre** `CUST_A` exists.
**Steps** 1. Register with `sara.idris@gmail.com`.
**Expected** 409; `error.code = EMAIL_ALREADY_REGISTERED`.
**Post** Still exactly one `users` row for that email.

### TC-005 — Duplicate email is rejected case-insensitively
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-02 · **Rules** BR-A1
**Type** API · **Priority** High
**Data** `REG_DUP_EMAIL` (`CUSTOMER.A@EXAMPLE.COM`)
**Steps** 1. Register with the upper-case variant.
**Expected** 409 `EMAIL_ALREADY_REGISTERED`.
**Notes** Proves the `CITEXT` column and `uq_users_email` are actually in place — a plain `VARCHAR` would let this through.

### TC-006 — Registering role ADMIN is refused, not downgraded
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-03 · **Rules** BR-A3
**Type** Security · **Priority** Critical
**Data** `REG_ROLE_ADMIN`
**Steps** 1. `POST /api/auth/register` with `role: "ADMIN"`.
**Expected** 403 `FORBIDDEN_ROLE`.
**Post** **No `users` row is created at all** — not an ADMIN, and not a silently-downgraded CUSTOMER.
**Notes** The post-condition is the substance of this case; a silent downgrade would pass a status-code-only assertion.

### TC-007 — Registering role DRIVER is refused
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-03 · **Rules** BR-A3, ADR-006
**Type** Security · **Priority** Critical
**Data** `REG_ROLE_DRIVER`
**Steps** 1. Register with `role: "DRIVER"`.
**Expected** 403 `FORBIDDEN_ROLE`; no row created.

### TC-008 — Unknown role value is rejected by schema
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-03 · **Rules** FR-10.2
**Type** API · **Priority** High
**Data** `REG_ROLE_UNKNOWN`
**Steps** 1. Register with `role: "SUPERUSER"`.
**Expected** 422 `VALIDATION_ERROR` with `details[].field = "role"`.

### TC-009 — Mass-assignment keys are stripped
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-04 · **Rules** BR-F2, NFR-9
**Type** Security · **Priority** Critical
**Data** `REG_MASS_ASSIGN`
**Steps** 1. Register with extra keys `status: "SUSPENDED"`, `id: "<chosen uuid>"`, `emailVerifiedAt`, `ratingAverage`.
**Expected** 201; the created user has a server-generated `id` (not the supplied one) and `status ACTIVE`.
**Notes** Verifies Zod's unknown-key stripping is the mass-assignment defence, per [backend-architecture §4](../../sdd/architecture/backend-architecture.md#4-validation-layer).

### TC-010 — Restaurant registration creates the pending restaurant shell
**Spec** spec-02, spec-03 · **Story** story-02, story-03 · **AC** AC-02-01, AC-03-01 · **Rules** BR-A4, BR-R1, FR-2.2
**Type** API · **Priority** High
**Steps** 1. Register with `role: "RESTAURANT"` and `restaurantName: "Olive Grill"`.
**Expected** 201; `data.user.role = "RESTAURANT"`, `status ACTIVE`; `data.restaurant.status = "PENDING_APPROVAL"` with a generated `slug`.
**Post** One `users` row and one `restaurants` row linked by `owner_user_id`.

### TC-011 — Restaurant registration rolls back entirely on failure
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-01 · **Rules** NFR-7
**Type** Service · **Priority** Critical
**Pre** Force the `restaurants` insert to fail (e.g. a slug-collision stub).
**Steps** 1. Register a restaurant owner.
**Expected** 5xx or the mapped error; **no `users` row and no `restaurants` row**.
**Notes** An orphan owner with no restaurant is unrecoverable through the API, which is why this is Critical rather than High.

---

## Login

### TC-012 — Login with valid credentials issues a token pair
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-05 · **Rules** FR-1.3
**Type** API · **Priority** Critical
**Data** `CUST_A`
**Steps** 1. `POST /api/auth/login` with correct credentials.
**Expected** 200; `accessToken` decodes to `{ sub, role, email, jti, iss, aud }` with `exp − iat = 900`; a `refreshToken` is returned.
**Post** A new `refresh_tokens` row; `users.last_login_at` updated.

### TC-013 — Login with the wrong password is refused
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-05 · **Rules** FR-1.3
**Type** API · **Priority** Critical
**Steps** 1. Login as `CUST_A` with an incorrect password.
**Expected** 401 `INVALID_CREDENTIALS`; no tokens; no `refresh_tokens` row.

### TC-014 — Login with an unknown email returns the identical response
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-06 · **Rules** FR-1.3, threat model "account enumeration"
**Type** Security · **Priority** Critical
**Steps** 1. Login with `nobody@example.com`. 2. Login as `CUST_A` with a wrong password. 3. Compare the two response bodies.
**Expected** Both 401 `INVALID_CREDENTIALS`; bodies identical apart from `meta.requestId`.

### TC-015 — Unknown-email and wrong-password timings are comparable
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-06 · **Rules** threat model "account enumeration"
**Type** Security · **Priority** High
**Steps** 1. Measure 30 unknown-email logins. 2. Measure 30 wrong-password logins. 3. Compare medians.
**Expected** Median difference < 50 ms, confirming the dummy bcrypt comparison runs on the unknown-email path.
**Notes** Asserts on the **median**, not the mean, so a single scheduler hiccup does not fail the build. If this proves flaky in CI, move it to the nightly suite rather than deleting it.

### TC-016 — Suspended user cannot log in
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-07 · **Rules** BR-A5
**Type** API · **Priority** Critical
**Data** `CUST_SUSPENDED`
**Steps** 1. Login with correct credentials.
**Expected** 403 `ACCOUNT_SUSPENDED`; no tokens issued.

### TC-017 — Soft-deleted user cannot log in
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** BR-A6
**Type** API · **Priority** High
**Data** `CUST_DELETED`
**Steps** 1. Login with correct credentials.
**Expected** 401 `INVALID_CREDENTIALS` — a deleted account is indistinguishable from a non-existent one.
**Notes** No Gherkin AC covers soft-deleted login; derived from BR-A6 and flagged in [coverage-analysis.md](../coverage-analysis.md) as an AC gap.

### TC-018 — Login is rate-limited per IP and email
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** NFR-9, security §7
**Type** Security · **Priority** High
**Steps** 1. Send 11 failed logins for one email from one IP within the window.
**Expected** The 11th returns 429 `RATE_LIMIT_EXCEEDED` with `RateLimit-*` headers.
**Notes** Limit is 10 per 15 minutes. Correct for a single replica only — see [R-09](../../sdd/risks.md).

---

## Tokens, refresh and session lifecycle

### TC-019 — A valid access token authenticates a request
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** FR-1.4
**Type** API · **Priority** Critical
**Data** `TOK_VALID_CUST`
**Steps** 1. `GET /api/me` with the token.
**Expected** 200; the returned user matches the token's `sub`.

### TC-020 — An expired access token is rejected with a distinct code
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-09 · **Rules** FR-1.4
**Type** API · **Priority** Critical
**Data** `TOK_EXPIRED`
**Steps** 1. `GET /api/me` with the expired token.
**Expected** 401 `TOKEN_EXPIRED` — **not** `TOKEN_INVALID`.
**Notes** The distinct code is load-bearing: the client refreshes on `TOKEN_EXPIRED` and logs out on `TOKEN_INVALID`. Conflating them causes spurious logouts.

### TC-021 — A missing token is rejected
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** FR-1.4
**Type** API · **Priority** Critical
**Data** `TOK_MISSING`
**Steps** 1. `GET /api/me` with no `Authorization` header.
**Expected** 401 `TOKEN_MISSING`.

### TC-022 — Refresh rotates the token pair and invalidates the old token
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-09 · **Rules** FR-1.9
**Type** API · **Priority** Critical
**Steps** 1. Login and capture `refreshToken` R1. 2. `POST /api/auth/refresh` with R1 → capture R2. 3. `POST /api/auth/refresh` with R1 again.
**Expected** Step 2 → 200 with a new pair and `R2 ≠ R1`. Step 3 → 401 `REFRESH_TOKEN_REUSED`.
**Post** R1's row has `revoked_at` set and `replaced_by_id` pointing at R2.

### TC-023 — Refresh-token reuse revokes the entire family
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-10 · **Rules** FR-1.9, ADR-004
**Type** Security · **Priority** Critical
**Steps** 1. Login → R1. 2. Refresh R1 → R2. 3. Refresh R1 again (reuse). 4. Attempt to refresh R2.
**Expected** Step 3 → 401 `REFRESH_TOKEN_REUSED`. Step 4 → 401, because R2 was revoked with the family.
**Post** Every `refresh_tokens` row sharing the `family_id` has `revoked_at` set.
**Notes** Logging both sessions out is the correct response to an ambiguous theft signal.

### TC-024 — Refresh tokens are stored hashed, never in the clear
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** security §3
**Type** Service · **Priority** Critical
**Steps** 1. Login and capture the refresh token. 2. Query `refresh_tokens`.
**Expected** No row contains the token value; `token_hash` equals the SHA-256 of the returned token.

### TC-025 — Logout revokes the presented refresh token only
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** FR-1.10
**Type** API · **Priority** High
**Steps** 1. Login on two devices → R_a, R_b. 2. `POST /api/auth/logout` with R_a. 3. Refresh with R_a. 4. Refresh with R_b.
**Expected** Step 3 → 401. Step 4 → 200; the other device's session survives.

### TC-026 — Changing the password revokes every session
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-12 · **Rules** FR-1.6
**Type** Security · **Priority** Critical
**Steps** 1. Login on two devices. 2. `POST /api/auth/change-password` with the correct current password. 3. Attempt to refresh with each stored refresh token.
**Expected** Step 2 → 204. Step 3 → 401 for both.
**Post** All the user's `refresh_tokens` rows are revoked; the new password authenticates.
**Notes** Without this, "change your password, you may be compromised" would not evict the attacker.

### TC-027 — Change-password requires the correct current password
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-12 · **Rules** FR-1.6
**Type** API · **Priority** Critical
**Steps** 1. `POST /api/auth/change-password` with a wrong `currentPassword`.
**Expected** 401 `INVALID_CREDENTIALS`; the password is unchanged and sessions remain valid.

### TC-028 — A token minted before suspension stops working immediately
**Spec** spec-02 · **Story** story-02, story-10 · **AC** AC-02-08 · **Rules** FR-1.7, FR-9.3, ADR-004
**Type** Security · **Priority** Critical
**Steps** 1. Login as `CUST_A` and capture the access token. 2. As `ADMIN_A`, suspend `CUST_A`. 3. Call `GET /api/me` with the token from step 1.
**Expected** 403 `ACCOUNT_SUSPENDED`.
**Notes** This is the case that justifies loading the user on every request and the whole refresh-token design. If it fails, FR-9.3 is untrue and admin suspension is decorative.
