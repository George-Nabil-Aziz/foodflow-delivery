# Test Cases — Security (TC-323 – TC-346)

> Covers [security.md](../../sdd/architecture/security.md) ·
> [spec-02](../../sdd/specs/spec-02-identity-authentication-authorization.md) ·
> NFR-9 · the [threat model](../../sdd/architecture/security.md#1-threat-model)

**These cases verify that the controls the SDD specifies are implemented and
effective against the attacks they were designed for. They do not establish
that FoodFlow is secure, and must not be cited as evidence of that.** Not
covered: cryptographic review, infrastructure and network security,
supply-chain compromise beyond `npm audit`, and any attack class outside the
documented threat model. An independent security review is recommended before
a real launch. See [test-strategy §8](../test-strategy.md#8-on-the-limits-of-security-testing).

Two weaknesses are **accepted and documented**, not tested away —
[R-08](../../sdd/risks.md) (refresh tokens in `localStorage`) and
[R-09](../../sdd/risks.md) (in-memory rate limiting). The cases below confirm
their *mitigations* work, not that the weaknesses are gone.

---

## Token forgery and tampering

### TC-323 — A tampered payload is rejected
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** security §3
**Type** Security · **Priority** Critical
**Data** `TOK_TAMPERED_ROLE`
**Steps** 1. Take a valid `CUST_A` token, edit the payload to `role: "ADMIN"` keeping the original signature, and call `GET /api/admin/users`.
**Expected** 401 `TOKEN_INVALID` — the signature check fails before the role is ever read.

### TC-324 — An `alg: none` token is rejected
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** security §3
**Type** Security · **Priority** Critical
**Data** `TOK_ALG_NONE`
**Steps** 1. Craft a token with header `{"alg":"none"}` and an empty signature. 2. Call any authenticated endpoint.
**Expected** 401 `TOKEN_INVALID`.
**Notes** Algorithm pinning (`algorithms: ['HS256']`) is what makes this fail to parse rather than fail open — historically one of the most exploited JWT flaws.

### TC-325 — A token signed with the wrong secret is rejected
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** security §3
**Type** Security · **Priority** Critical
**Data** `TOK_WRONG_SECRET`
**Steps** 1. Sign a structurally perfect token with a different HS256 secret.
**Expected** 401 `TOKEN_INVALID`.

### TC-326 — Issuer and audience claims are verified
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** security §3
**Type** Security · **Priority** High
**Data** `TOK_WRONG_ISSUER`
**Steps** 1. Present a correctly signed token with `iss: "evil"`. 2. Then one with a wrong `aud`.
**Expected** 401 `TOKEN_INVALID` both times.
**Notes** Prevents a token minted for a different service sharing the secret from being accepted here.

### TC-327 — A token for a soft-deleted user is rejected
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** BR-A6, FR-1.7
**Type** Security · **Priority** High
**Data** `TOK_DELETED_USER`
**Steps** 1. Call an authenticated endpoint with a valid token for `CUST_DELETED`.
**Expected** 401 `TOKEN_INVALID`.

### TC-328 — Garbage and malformed Authorization headers
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** FR-1.4
**Type** Security · **Priority** Medium
**Steps** 1. `Bearer not.a.token`. 2. `Bearer ` (empty). 3. `Basic dXNlcjpwYXNz`. 4. The raw token with no `Bearer` prefix. 5. Two `Authorization` headers.
**Expected** 401 in every case; no stack trace, no 500.

---

## Injection

### TC-329 — SQL injection through search is inert
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-11 · **Rules** NFR-9
**Type** Security · **Priority** Critical
**Data** `MAL_SQL_1`, `MAL_SQL_2`, `MAL_SQL_3`
**Steps** 1. `GET /api/search?q=' OR 1=1 --`. 2. `?q='; DROP TABLE users; --`. 3. `?q=1 UNION SELECT password_hash FROM users`.
**Expected** Each treated as a literal search string; no additional rows; `users` still exists after step 2; no password hash appears in any response.

### TC-330 — SQL injection through body fields is inert
**Spec** spec-01 · **Story** story-02 · **AC** — · **Rules** NFR-9
**Type** Security · **Priority** Critical
**Steps** 1. Register with `fullName: "'; DROP TABLE users; --"`. 2. Create an item named `"' OR '1'='1"`. 3. Submit a review comment containing SQL.
**Expected** Each stored verbatim as text and returned identically; no table is affected.

### TC-331 — Injection through path and query identifiers is inert
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** NFR-9
**Type** Security · **Priority** High
**Steps** 1. `GET /api/orders/' OR 1=1--`. 2. `?status=DELIVERED' OR '1'='1`. 3. `?sort=name; DROP TABLE users`.
**Expected** 400/422 from schema and allow-list validation; no SQL is constructed; no database error surfaces.

### TC-332 — Stored XSS payloads are returned as data, not markup
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-16 · **Rules** security
**Type** Security · **Priority** Critical
**Data** `MAL_XSS_1`, `MAL_XSS_2`
**Steps** 1. Submit a review comment, a restaurant description and an item name each containing `<script>alert(1)</script>` and `<img src=x onerror=alert(1)>`. 2. Retrieve each through its public endpoint. 3. Render each in the corresponding component.
**Expected** Stored and returned verbatim as strings; rendered as **literal text**; no script executes and no `onerror` fires.
**Notes** Vue escapes by default; the control is the absence of `v-html`, which TC-333 asserts directly.

### TC-333 — No `v-html` anywhere in user-content rendering
**Spec** spec-09 · **Story** story-09 · **AC** — · **Rules** security
**Type** Security · **Priority** Critical
**Steps** 1. Statically scan `frontend/src/**/*.vue` for `v-html`.
**Expected** No occurrences in components rendering review comments, restaurant descriptions, item names/descriptions, customer notes or cancellation notes.
**Notes** Cheaper and more reliable than trying to prove escaping behaviourally for every field.

### TC-334 — Dangerous URL schemes cannot be stored in image fields
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-15 · **Rules** validation §15
**Type** Security · **Priority** High
**Data** `MAL_XSS_3`, `ITEM_IMG_DATA`
**Steps** 1. Submit `imageUrl` of `javascript:alert(1)`, `data:text/html;base64,...`, `vbscript:msgbox(1)`, and a valid `https://` URL.
**Expected** 422 for the first three; 201 for the last.

---

## Data exposure

### TC-335 — No endpoint ever returns a password hash
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** NFR-9
**Type** Security · **Priority** Critical
**Steps** 1. Sweep every endpoint returning user-shaped data — register, login, `/api/me`, admin user list and detail, order detail, driver delivery detail, public reviews. 2. Search each serialized body for `password`, `hash`, `$2a$`, `$2b$`.
**Expected** No matches anywhere.
**Notes** Allow-list mappers are the control; asserting against serialized bodies is what makes a future column addition safe by default.

### TC-336 — Cross-role PII boundaries hold
**Spec** multiple · **Story** story-07, story-08, story-09 · **AC** AC-08-16, AC-08-17, AC-09-15 · **Rules** security §9
**Type** Security · **Priority** Critical
**Steps** 1. As a **restaurant**, read an order → assert customer first name, masked phone and address are present and **email is absent**. 2. As a **driver**, read an unaccepted offer → assert no street address, name, phone or email. 3. As a driver, read an accepted delivery → assert address, first name and masked phone present, email absent. 4. As an **anonymous** user, read public reviews → assert only `"Sara I."`.
**Expected** Every boundary as stated.

### TC-337 — Phone masking happens server-side
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-17 · **Rules** security §9
**Type** Security · **Priority** High
**Steps** 1. Read a delivery detail as the assigned driver. 2. Inspect the raw HTTP response.
**Expected** The phone arrives already masked (e.g. `+9665****4567`); the full number is never transmitted.
**Notes** A client-side mask is a picture of privacy rather than privacy — the full value would still be in the payload.

### TC-338 — Error responses leak no internals
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-06 · **Rules** FR-10.3
**Type** Security · **Priority** High
**Steps** 1. Trigger an unexpected server error. 2. Trigger a unique-constraint violation. 3. Trigger a foreign-key violation. 4. Trigger a UUID cast error.
**Expected** Generic envelope messages with a documented `code` and a `requestId`. **No** stack trace, file path, SQL fragment, constraint name, table name or driver message in any body.

### TC-339 — Ownership failures return 404, not 403
**Spec** multiple · **Story** multiple · **AC** AC-02-15, AC-06-17, AC-07-10 · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. Probe cross-tenant resources across every domain: order, address, cart line, menu item, review, delivery assignment. 2. Compare each response with the response for a genuinely non-existent UUID.
**Expected** Identical 404 `RESOURCE_NOT_FOUND` in every pair.
**Notes** A 403 would confirm the resource exists, turning UUID probing into an enumeration oracle for order volumes and account activity.

---

## Transport, headers and limits

### TC-340 — Security headers are present
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** security §6
**Type** Security · **Priority** Medium
**Steps** 1. Inspect response headers on any endpoint.
**Expected** `helmet` defaults present — `X-Content-Type-Options: nosniff`, `X-Frame-Options`/frame-ancestors, `X-DNS-Prefetch-Control`; HSTS in production configuration.

### TC-341 — CORS allows only configured origins
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** security §6
**Type** Security · **Priority** High
**Steps** 1. Send an `Origin` on the allow-list. 2. Send `https://evil.example.com`. 3. Send a preflight `OPTIONS` from the disallowed origin.
**Expected** Allowed origin is echoed with `Access-Control-Allow-Credentials: true`; the disallowed origin receives **no** permissive ACAO header; the preflight is not granted.

### TC-342 — A wildcard CORS origin is impossible in production
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-08 · **Rules** security §8, FR-10.4
**Type** Security · **Priority** High
**Steps** 1. Boot with `NODE_ENV=production` and `CORS_ORIGINS="*"`.
**Expected** The process exits with a clear message naming `CORS_ORIGINS`, before listening.

### TC-343 — A weak JWT secret prevents boot
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-08 · **Rules** FR-10.4
**Type** Security · **Priority** Critical
**Steps** 1. Boot with a `JWT_SECRET` shorter than 32 characters, then with it missing.
**Expected** Non-zero exit naming `JWT_SECRET`, **before** the server listens.
**Notes** Failing at startup is far better than discovering it at the first login, when tokens are already being issued under a guessable key.

### TC-344 — Authentication endpoints are rate-limited
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** security §7
**Type** Security · **Priority** High
**Steps** 1. 11 failed logins for one email from one IP. 2. 11 registrations from one IP. 3. 21 checkouts in an hour for one user. 4. 11 reviews in an hour.
**Expected** The over-limit request in each group returns 429 `RATE_LIMIT_EXCEEDED` with `RateLimit-*` headers.
**Notes** Single-replica behaviour only ([R-09](../../sdd/risks.md)); with N replicas the effective limit is N×.

### TC-345 — Secrets never appear in logs
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** security §8
**Type** Security · **Priority** Critical
**Steps** 1. Capture log output while performing register, login, refresh and change-password.
**Expected** No plaintext password, access token, refresh token or `Authorization` header value appears; pino redaction covers `password`, `newPassword`, `token`, `refreshToken`, `authorization`.

### TC-346 — Dependency audit is clean at high and critical
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** security §8
**Type** Security · **Priority** Medium
**Steps** 1. Run `npm audit --audit-level=high` in both workspaces.
**Expected** Exit 0.
**Notes** A point-in-time check against a moving target, which is why it runs nightly as well as in CI — not a guarantee of dependency safety.
