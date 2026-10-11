# Security Design

> Parent: [master-sdd.md](../master-sdd.md) · Spec: [spec-02](../specs/spec-02-identity-authentication-authorization.md)

Security here is a set of design decisions embedded in the specs and stories,
not a hardening pass at the end. Each control below names the layer that owns
it and the test that proves it.

## 1. Threat model

The realistic attackers for this system, and what stops each:

| Threat | Scenario | Control |
|--------|----------|---------|
| Credential stuffing | Bulk login attempts with leaked passwords | Rate limit 10/15 min per IP+email; bcrypt cost 12; uniform `INVALID_CREDENTIALS` |
| Account enumeration | Probing which emails exist via register/login/reset timing or messages | Identical message and timing for unknown email vs wrong password; registration conflict is unavoidable but rate-limited |
| Token theft | XSS or a shared machine yields an access token | 15-minute access tokens; refresh tokens rotate and are revocable; suspension kills the family |
| Refresh-token replay | A stolen refresh token used after the legitimate client already rotated it | Single-use tokens with reuse detection — the entire family is revoked and both sessions die |
| IDOR / horizontal escalation | Customer A requests order B's detail by UUID | Ownership predicates in SQL, not post-fetch checks; 404 not 403 |
| Vertical escalation | Customer calls a restaurant or admin endpoint | Role guard on every route + a default-deny router audit test |
| Mass assignment | `{"role":"ADMIN"}` or `{"status":"ACTIVE"}` in a registration or profile body | Zod strips unknown keys; `role` is never accepted on update |
| Price tampering | Client submits its own prices at checkout | Checkout schema has no price fields; totals are computed server-side (BR-O5) |
| Business-logic abuse | Cancelling a delivered order, reviewing someone else's order, driving someone else's delivery | The state machine plus ownership checks; every illegal transition is a named test |
| SQL injection | Malicious `sort`, `q` or path parameter | Knex bindings everywhere; `sort`/`order` from allow-lists; UUID params validated by schema |
| Data exposure | Driver or public review response leaking a customer's email/phone | Allow-list mappers; role-specific DTOs; masked phone for drivers |
| Denial of wallet/service | Unbounded pagination or a giant body | `limit` cap 100; 100 KB body limit; global rate limit |

## 2. Password handling

- **bcryptjs, cost 12.** Chosen over argon2 only because it installs without native build tooling, which matters for G5; cost 12 is ~250 ms on commodity hardware, which is the right trade against a login-latency budget.
- Length is validated 8–72 characters. The 72-byte cap is bcrypt's own truncation point, and it is **rejected explicitly** rather than silently truncated — silent truncation means a 100-character password is no stronger than its first 72 bytes and the user is never told.
- `password_hash` is never selected into a DTO (allow-list mappers, [backend-architecture §7](backend-architecture.md#7-response-mapping)), never logged (pino redaction on `password`, `newPassword`, `token`, `refreshToken`, `authorization`), and never returned by any endpoint.
- Changing a password revokes every refresh token for that user (FR-1.6) — otherwise "change your password, you've been compromised" would not actually evict the attacker.

## 3. Tokens

### Access token
HS256, 15-minute TTL, secret ≥32 characters from `JWT_SECRET`.

```json
{ "sub": "<userId>", "role": "CUSTOMER", "email": "…", "jti": "…",
  "iss": "foodflow", "aud": "foodflow-app", "iat": 1770000000, "exp": 1770000900 }
```

Verification pins `algorithms: ['HS256']` and checks `iss`/`aud`. Pinning the
algorithm is what makes an `alg: none` or an RS256-key-confusion forgery fail
rather than parse.

**The token carries a role, not a permission set.** `role` is a hint that saves
a lookup on the guard; every ownership decision re-reads the database. A token
minted before a suspension still fails, because `authenticate` loads the user
and rejects `status = SUSPENDED` on every request (FR-1.7).

### Refresh token
256 bits of `crypto.randomBytes`, returned to the client once and stored only as
a SHA-256 hash — a database leak yields hashes, not sessions. 30-day expiry,
single use, rotated on every refresh, with a `family_id` linking a chain.

**Reuse detection:** presenting a token that is already `revoked_at` means
either an attacker is replaying or the legitimate client raced. Both are
resolved the same way — revoke the whole `family_id` and return
`401 REFRESH_TOKEN_REUSED`. Logging everyone out is the correct response to an
ambiguous signal about a stolen session.

### Storage on the client
`localStorage`. This is a deliberate, documented trade: `httpOnly` cookies would
resist XSS better but require CSRF defences and complicate the pure-SPA
deployment. The mitigation is the short access-token TTL plus revocable refresh
tokens, and the acceptance is recorded in [risks.md](../risks.md) as R-08. With
a real production deployment the recommendation is to move refresh tokens to an
`httpOnly; SameSite=Strict; Secure` cookie.

## 4. Authorization

Two independent layers, and **both** are required:

```js
router.get('/orders/:id',
  authenticate,                 // who are you (and are you still allowed to exist)
  authorize('CUSTOMER'),        // layer 1: role
  validate({ params: idParam }),
  ctrl.getOrder);               // → service applies layer 2: ownership
```

```js
// layer 2 — in SQL, not after the fetch
const order = await orderRepo.findForCustomer(orderId, req.user.id);
if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');
```

Filtering in the `WHERE` clause rather than fetching-then-comparing means a
forgotten check is a missing row, not a leaked one — and it makes the ownership
rule visible in the query that the reviewer is already reading.

### Ownership rules by role

| Role | Predicate |
|------|-----------|
| CUSTOMER | `customer_user_id = :userId` (orders, carts, reviews, addresses) |
| RESTAURANT | `restaurant_id = (SELECT id FROM restaurants WHERE owner_user_id = :userId)` |
| DRIVER | `driver_user_id = :userId` (assignments and the orders they are attached to) |
| ADMIN | No predicate; every write is audited |

Restaurant-scoped routes never accept a `restaurantId` from the client at all
([api-design §5](api-design.md#5-restaurant-self-service--apirestaurant)) — the
restaurant is derived from the token. A parameter that cannot be supplied cannot
be tampered with.

### Router audit test
A test walks the Express route table and asserts that every route outside an
explicit public allow-list declares both `authenticate` and either `authorize`
or a documented reason. A new endpoint added without a guard fails CI — default
deny, enforced mechanically rather than by reviewer attention.

## 5. Input validation
See [master-sdd §15](../master-sdd.md#15-validation) and
[backend-architecture §4](backend-architecture.md#4-validation-layer). The
security-relevant properties: unknown keys are stripped before a service sees
the payload; `sort`/`order`/`status` filters are enum-validated, never
interpolated; UUID path params are schema-validated so a malformed ID is a 400
rather than a database error.

## 6. Transport, headers and CORS

- `helmet()` defaults plus HSTS in production.
- CORS from a `CORS_ORIGINS` allow-list, `credentials: true` only for those origins. `*` is impossible by construction — the config schema rejects it in production.
- JSON body limit 100 KB.
- HTTPS is terminated at the proxy; the app sets `trust proxy` so rate limiting sees the real client IP rather than the proxy's.

## 7. Rate limiting

| Scope | Limit | Key |
|-------|-------|-----|
| Global | 300 / 15 min | IP |
| `POST /auth/login`, `/auth/register` | 10 / 15 min | IP + email |
| `POST /auth/refresh` | 60 / 15 min | IP |
| `POST /orders` (checkout) | 20 / hour | user ID |
| `POST /reviews` | 10 / hour | user ID |

Responses carry `RateLimit-*` headers and `429 RATE_LIMIT_EXCEEDED`. The store
is in-memory for v1 — correct for one replica, and noted in
[risks.md](../risks.md) R-09 with Redis as the multi-replica fix.

## 8. Secrets and configuration

`.env` is git-ignored; `.env.example` is committed with placeholder values and
no real secrets. Config is Zod-validated at boot and the process **exits** on a
missing or weak `JWT_SECRET` (<32 chars) — failing at startup is far better than
discovering it at the first login. The logger redacts secret-bearing paths.
`npm audit --audit-level=high` runs in CI.

## 9. Data exposure rules

| Audience | May see |
|----------|---------|
| Public | Restaurant profile, menu, published reviews with `"Sara I."` as the author |
| Customer | Own everything; restaurant's public data; assigned driver's first name and masked phone once `OUT_FOR_DELIVERY` |
| Restaurant | Own orders with the customer's first name, masked phone and delivery address; never the customer's email |
| Driver | Assigned order's items, pickup address, delivery address, customer first name and masked phone; never the customer's email or order-payment history |
| Admin | Everything, with every read of PII available for audit and every write logged |

Masked phone is `+9665****4567` (`utils/mask.js` server-side — the mask is
applied when building the DTO, never in the browser, because a client-side mask
is a picture of privacy rather than privacy).

---

## Architecture Decision Records

### ADR-004: Short access token plus revocable refresh token

**Context.** The brief specifies JWT authentication. A pure stateless JWT design
cannot revoke a token before it expires, which directly breaks FR-9.3 ("suspend
takes effect immediately") — an admin suspending a fraudulent restaurant would
watch it keep accepting orders for the rest of the token's life.

**Decision.** 15-minute stateless access tokens, plus stateful, hashed,
rotating, single-use refresh tokens in `refresh_tokens`, plus a user-status
check inside `authenticate`.

**Rationale.** This is the smallest design in which suspension is real. The
per-request user load costs one indexed primary-key lookup, which is cheap and
is needed anyway to populate `req.user`. The alternative — a token denylist —
carries the same statefulness with worse ergonomics.

**Consequences.** The API is not purely stateless with respect to sessions, but
it remains horizontally scalable because the state is in PostgreSQL, not in
process memory (NFR-3). Clients must implement single-flight refresh
([frontend-architecture §3](frontend-architecture.md#3-http-layer)) or they will
trip reuse detection.

### ADR-005: Single fixed role per user

**Context.** Could one person be both a customer and a driver?

**Decision.** One role per user account, fixed at creation. Wearing two hats
means two accounts with two emails.

**Rationale.** Multi-role identity forces every authorization check to ask
"acting as what right now?", which needs role switching in the UI, a role claim
that can drift from the token, and ownership rules that vary by active context.
That is a large amount of complexity purchased for a rare case, and it is the
kind of complexity where authorization bugs live.

**Consequences.** `users.role` is immutable — no endpoint updates it, and a
`role` key in any update payload is stripped. Admin cannot "convert" a customer
into a driver; they create a driver account. Revisit only if real demand appears
(it is listed as a possible future enhancement, not a planned one).

### ADR-006: Drivers are admin-provisioned

**Context.** Customers and restaurants self-register. Should drivers?

**Decision.** No. `POST /api/admin/drivers` is the only way a driver account
comes into existence.

**Rationale.** A driver receives a stranger's home address and phone number.
Self-service registration would put that data one signup form away from anyone.
Restaurants self-register because they gate themselves behind
`PENDING_APPROVAL` before they can trade, and an unapproved restaurant sees
nobody's data; an unapproved driver account has no equivalent harmless state.

**Consequences.** Onboarding drivers is a manual admin action (acceptable — real
platforms vet drivers anyway). The registration endpoint rejects `role: DRIVER`
with 403 rather than silently creating a customer, so a client bug surfaces
loudly (BR-A3).

### ADR-010: 404 over 403 for cross-tenant resources

**Context.** When customer A requests customer B's order, is that 403 or 404?

**Decision.** `404 RESOURCE_NOT_FOUND`, identical to a genuinely nonexistent ID.

**Rationale.** A 403 confirms the resource exists, which turns UUID probing into
an enumeration oracle for order volumes and account activity. 404 reveals
nothing. The exception is role failures — `403 FORBIDDEN_ROLE` for a customer
hitting an admin route is safe, because the route's existence is public
knowledge from the API docs and a 404 there would make legitimate client bugs
much harder to diagnose.

**Consequences.** The rule is: **wrong role → 403; right role, someone else's
row → 404.** Repositories implement it naturally by carrying the ownership
predicate in the query — "not found" is literally what comes back.
