# FoodFlow — Final verification report

> **Date:** 2026-09-27 · **Verified on:** Node.js 24.15, PostgreSQL 18.4, Windows 11
> Companions: [../README.md](../README.md) · [AS-BUILT.md](AS-BUILT.md)

Everything in this report was produced by running the commands shown, against
a real database, on the committed code. Where something is incomplete it says
so.

---

## 1. Summary

| | |
|---|---|
| Specs implemented | **10 / 10** |
| Stories implemented | **10 / 10** |
| REST endpoints | **91** implemented, 91 documented, **0 drift either way** |
| Database tables | 17 domain tables (+2 Knex bookkeeping), 14 enums, 67 indexes, 32 FKs, 23 check constraints |
| Backend tests | **610 passing / 610**, 15 files, 35 s |
| Frontend tests | **43 passing / 43**, 4 files, 2 s |
| Backend lint | **0 errors, 0 warnings** |
| Frontend lint | **0 errors, 0 warnings** |
| Frontend production build | **passes** — 169 kB main chunk, 64 kB gzipped |
| Backend boot + smoke test | **passes** — health, discovery and login verified against seeded data |
| TODO / FIXME / placeholder / mock in shipped code | **none** |

Source size: 6,842 lines of backend source, 6,400 lines of frontend source,
5,752 lines of test code, 15,055 lines of documentation across 60 files.

---

## 2. Specs and stories

Every spec has working code behind it and every story's slice is reachable
end to end in the running application.

| Spec | Implemented in | Story | Verified by |
|---|---|---|---|
| 01 Platform Foundation & API Contract | `shared/`, `middleware/`, `app.js`, `routes.js` | 01 Walking Skeleton | `tests/unit/platform.test.js`, `tests/integration/platform.test.js` |
| 02 Identity, Authentication & Authorization | `modules/auth`, `modules/users` | 02 Registration, Login & Profile | `auth.test.js`, `authorization.test.js`, `traceability.test.js` |
| 03 Restaurant Profile & Operating Status | `modules/restaurants` | 03 Onboarding & Menu | `restaurantMenu.test.js`, `tests/unit/orderability.test.js` |
| 04 Menu Management | `modules/menu` | 03 Onboarding & Menu | `restaurantMenu.test.js` |
| 05 Restaurant Discovery & Search | `modules/discovery` | 04 Discovery & Browsing | `restaurantMenu.test.js` (discovery block) |
| 06 Cart Management | `modules/cart` | 05 Cart Management | `cart.test.js`, `tests/unit/cartValidator.test.js`, `lifecycle-traceability.test.js` |
| 07 Order Placement & Lifecycle | `modules/orders` | 06 Placement & Tracking · 07 Restaurant Processing | `orders.test.js`, `tests/unit/orderStateMachine.test.js` (281 cases), `lifecycle-traceability.test.js` |
| 08 Delivery Assignment & Driver Operations | `modules/delivery` | 08 Driver Onboarding & Delivery | `delivery.test.js` |
| 09 Reviews & Ratings | `modules/reviews` | 09 Reviews & Ratings | `reviewsAdmin.test.js` |
| 10 Platform Administration & Reporting | `modules/admin` | 10 Administration & Reporting | `reviewsAdmin.test.js`, `platform.test.js` |

---

## 3. API surface

`npm run routes` walks the live Express stack, including middleware inherited
from `router.use()`, and reports:

```
TOTAL: 91     # NODE_ENV=development
TOTAL: 92     # NODE_ENV=test
```

**91 production routes**, plus one test-only route under `NODE_ENV=test`
(`GET /api/__test_boom`, gated on `config.env === 'test'`, which exists to
prove the error middleware converts an unexpected throw into a 500 envelope
without leaking a stack trace). That the count drops to 91 outside the test
environment is itself the evidence that the gate works.

A diff of the live routes against the reference tables in
[`sdd/architecture/api-design.md`](sdd/architecture/api-design.md) is empty in
both directions: nothing implemented is undocumented, and nothing documented is
unimplemented.

Distribution: restaurant self-service 24 · admin 23 · driver 12 · orders 5 ·
cart 5 · auth 5 · addresses 5 · public discovery 6 · reviews 3 · profile 2 ·
health 1.

Four of these were reconciled during the build and are itemised in
[AS-BUILT.md §1.3–1.4](AS-BUILT.md).

---

## 4. Database

Real PostgreSQL throughout — no mock, no in-memory substitute, in development
or in test. Nine migrations, applied and verified:

| Object | Count | Notes |
|---|---|---|
| Domain tables | 17 | `users`, `refresh_tokens`, `customer_addresses`, `restaurants`, `restaurant_hours`, `driver_profiles`, `menu_categories`, `food_items`, `carts`, `cart_items`, `orders`, `order_items`, `order_status_events`, `delivery_assignments`, `reviews`, `admin_audit_logs`, `notifications` |
| Enum types | 14 | Including the 7-member `order_status` and the corrected `assignment_status` |
| Indexes | 67 | Including 6 partial unique indexes that enforce business invariants |
| Foreign keys | 32 | |
| Check constraints | 23 | Including `chk_orders_cancel_fields`, which refuses a cancellation without attribution |

The invariants that the database, not the application, enforces:

| Index | Invariant | Rule |
|---|---|---|
| `uq_carts_one_active` | one `ACTIVE` cart per customer | BR-C1 |
| `uq_assignments_driver_active` | one `ACCEPTED` assignment per driver | BR-D5 |
| `uq_assignments_order_accepted` | one accepted driver per order | — |
| `uq_assignments_order_open` | one live offer per order | — |
| `uq_addresses_one_default` | one default address per customer | BR-U6 |
| `uq_reviews_order` | one review per order | BR-V2 |

Money is `NUMERIC(10,2)` in the database and BigInt minor units in JavaScript.
No float touches a price anywhere in the codebase.

---

## 5. Frontend

| | |
|---|---|
| Route-level views | 32 (customer 9, restaurant 7, admin 6, driver 5, public 5) |
| Shared and role components | 15 |
| Pinia stores | 3 — `auth`, `cart`, `ui`. Deliberately few: everything else is server state |
| Router | Role guards per route group; 404 and 403 views |
| Build | `vite build` passes, 2.4 s, code-split per view |

The cart store mirrors the server and computes nothing: totals, `canCheckout`
and per-line issues all come from `GET /api/cart`. Duplicating that arithmetic
in the client guarantees the two eventually disagree, about money.

Every add-to-cart entry point routes through the `useAddToCart` composable, so
the cross-restaurant conflict is handled identically wherever it occurs, and
"Keep my cart" is the default action in that dialog — replacing a cart is
destructive and is never the pre-selected option.

The HTTP client performs **single-flight refresh**: concurrent 401s share one
refresh request rather than racing to rotate the token family and triggering
the reuse detector against the user.

---

## 6. Security controls

Implemented and exercised. Passing tests demonstrate that these controls behave
as specified; **they are not a claim that the application is comprehensively
secure.** No penetration test has been performed, and an independent review is
recommended before any real deployment.

| Control | Implementation | Named test |
|---|---|---|
| SQL injection | Knex parameter binding everywhere; `LIKE` patterns escaped in `escapeLikePattern` | TC-134, TC-329 |
| Mass assignment | Zod strips unknown keys; controllers read `req.validated`, never `req.body` — asserted structurally across every controller file | TC-059, TC-302 |
| IDOR | Ownership re-checked in the service layer; no client id is trusted | TC-037, TC-038, TC-041, TC-047, TC-048, TC-067 |
| Cross-tenant disclosure | 404 for another tenant's row, 403 only for the wrong role, so the API never confirms an id exists | TC-037, TC-041, ADR-010 |
| Price tampering | The client sends no prices; totals are recomputed from the live menu at checkout | TC-170 |
| JWT algorithm confusion | `algorithms: ['HS256']` pinned; `iss`/`aud` verified; 30 s clock-skew tolerance | TC-020, TC-021 |
| Token replay | Single-use rotating refresh tokens; presenting a revoked token revokes the whole family | TC-022–TC-024 |
| Password storage | bcrypt cost 12; hashes never leave the repository layer | TC-003, TC-057 |
| XSS | Vue escapes interpolation; **no `v-html`, `innerHTML` or `document.write` anywhere in `frontend/src`**, enforced structurally | TC-332, TC-333 |
| CORS | Explicit origin allow-list; `*` rejected under `NODE_ENV=production` | TC-343 |
| Rate limiting | Global bucket plus tighter buckets on auth, refresh, checkout and reviews | TC-018, TC-344 |
| PII boundaries | A driver offer shows district and distance; the full address only after accepting | TC-252, TC-336 |
| Secret handling | No real secret in the repository; `.env` git-ignored; startup fails on a short `JWT_SECRET`; errors leak neither the secret nor the connection string | TC-345 |
| Session revocation | Suspending a user revokes every session and invalidates the live token | TC-278 |

---

## 7. Test results

```
backend   15 files   610 passed / 610   34.65 s
frontend   4 files    43 passed /  43    2.19 s
```

Backend breakdown:

| File | Tests |
|---|---|
| `unit/orderStateMachine.test.js` | 281 — all 245 (status, target, actor) combinations, plus reason requirements |
| `unit/platform.test.js` | 34 |
| `unit/orderability.test.js` | 27 |
| `unit/money.test.js` | 15 |
| `unit/cartValidator.test.js` | 11 |
| `integration/orders.test.js` | 35 |
| `integration/cart.test.js` | 28 |
| `integration/restaurantMenu.test.js` | 28 |
| `integration/reviewsAdmin.test.js` | 25 |
| `integration/auth.test.js` | 23 |
| `integration/platform.test.js` | 23 |
| `integration/delivery.test.js` | 22 |
| `integration/authorization.test.js` | 15 |
| `integration/traceability.test.js` | 30 |
| `integration/lifecycle-traceability.test.js` | 13 |

Integration tests run against real PostgreSQL. Two independent rails prevent
them from touching a development database: the suite aborts unless
`NODE_ENV=test` **and** the resolved database name ends in `_test`, and tests
read `TEST_DATABASE_URL` only.

### Traceability

The matrix documents **424 test cases**: 410 API/service/unit/component cases
in [`testing/test-cases/`](testing/test-cases/) and 14 browser scenarios in
[`testing/e2e-scenarios.md`](testing/e2e-scenarios.md).

| | Count | Named in an automated test |
|---|--:|--:|
| Non-E2E cases | 410 | **312** |
| E2E browser scenarios | 14 | 0 — no browser suite was run |
| **Total** | **424** | **312** |

Of the 98 non-E2E cases not named in a test, **none is Critical**: the gap is
48 High, 39 Medium and 11 Low. Before this verification pass 268 IDs were
named and **43 Critical cases were unnamed**; that gap is now closed, by
`tests/integration/traceability.test.js` (30 cases),
`tests/integration/lifecycle-traceability.test.js` (13 cases) and
`frontend/tests/unit/xss.test.js` (TC-333).

The remaining 98 are behaviours that other tests largely exercise without
carrying the case ID. That makes them untraceable through
[`testing/test-matrix.md`](testing/test-matrix.md), which is a real
documentation gap rather than a claim that the behaviour is untested. Closing
it is the first item in §10.

---

## 8. Bugs found and fixed during verification

Each was root-caused before anything was changed. **No test was weakened or
deleted to make the implementation pass.**

### Implementation bugs

| Bug | Symptom | Fix |
|---|---|---|
| **Concurrent first add-to-cart returned 500** | Two tabs adding from different restaurants raced to create the cart. The unique-violation recovery read ran inside a transaction PostgreSQL had already aborted, so it failed too. Reproduced 7 times in 8. | `INSERT … ON CONFLICT (customer_user_id) WHERE status = 'ACTIVE' DO NOTHING` plus a re-read, so the conflict never raises. 0 failures in 10 runs; the loser now correctly receives `409 CART_RESTAURANT_MISMATCH`. Found by TC-353. |
| **Drivers were permanently blocked after one delivery** | `assignment_status` had no terminal success state, so an assignment stayed `ACCEPTED` after delivery and `uq_assignments_driver_active` treated the driver as forever busy. | Added `COMPLETED`; assignments close as `COMPLETED` on delivery and `CANCELLED` otherwise. |
| **Thrown `AppError`s escaped as unhandled rejections** | Express 4 does not await handlers, so a rejected promise hung the request instead of reaching the error middleware. 10 failures. | `asyncHandler` / `wrapAll`, applied to all 8 route files and 23 inline admin handlers. |
| **Refresh-token family revocation was rolled back** | Reuse detection called `revokeFamily` inside the transaction that then threw, so the revocation undid itself — a reused token stayed usable. | Reuse detection moved outside the transaction. |
| **Empty address PATCH returned 500** | `knex.update({})` throws. | Non-empty refine on `updateAddressSchema`. |
| **Router audit passed vacuously** | `listRoutes` ignored `router.use()` middleware, so protected and unprotected routes looked identical. | Rewrote it to accumulate inherited middleware; named the function returned by `authorize()` so the audit can see it. |
| **`escapeLikePattern` emitted a literal `${m}`** | A shell heredoc mangled a backslash. | Corrected; found by TC-134. |

### Documentation errors found (and corrected)

| Error | Correction |
|---|---|
| Actor-qualified transitions stated as 14, refusals as 231 | Correct figures are **16** and **229**. The transition table in code was always right; the prose arithmetic was wrong. |
| A GMV figure in an admin test | 116.00 + 12.00 + 17.40 = **145.40**, not 145.10 |
| AC-06-16 promised a 409 on concurrent cancel-vs-accept | Both legitimately succeed; the invariant is serialization. Recorded as **finding D-06**, criterion reworded, TC-225 rewritten and TC-226 added |
| TC-246's setup violated `uq_assignments_order_open` | Rewritten as concurrent accepts of one offer plus a stale-offer case |
| Three planned endpoints missing from the API reference | Findings D-01/D-02/D-03, now added |
| Opening-hours inclusivity unstated | Finding D-05, now stated in BR-R3 |
| Suspended-customer in-flight orders unspecified | Finding D-04, now **BR-R10** |

All six findings in
[`testing/coverage-analysis.md §10`](testing/coverage-analysis.md) are marked
resolved with the change that resolved them.

---

## 9. Build and runnability

Verified in this session, in order:

1. `npx knex migrate:latest` — schema applied to the development database.
2. `npx knex seed:run` — 15 users, 6 restaurants, 10 categories, 12 items,
   7 orders, 1 review.
3. `node src/server.js` — booted on port 4000.
4. `GET /api/health` → `{"status":"ok","database":"up","version":"1.0.0"}`.
5. `GET /api/restaurants?limit=2` → seeded restaurants returned.
6. `POST /api/auth/login` with the seeded admin → 200 with an access token, and
   no password hash anywhere in the payload.
7. `npm run build` (frontend) → `✓ built in 2.41s`.
8. `npm test` (both workspaces) → 610 + 43 passing.
9. `npm run lint` (both workspaces) → clean.

The project is in a runnable state. A fresh clone needs `npm install`,
`cp backend/.env.example backend/.env`, a PostgreSQL instance (Docker or the
embedded fallback), `npm run migrate && npm run seed`, then `npm run dev`.

---

## 10. Known issues and limitations

Nothing here is hidden, and nothing here blocks running the application.

### Gaps in this build

1. **98 non-E2E test cases are not named in an automated test** (48 High,
   39 Medium, 11 Low; zero Critical). The behaviours are largely covered by
   other tests, but without the case ID they cannot be traced through the
   matrix. Closing this is mechanical: assert the same behaviour under the
   documented ID.
2. **No end-to-end browser suite has been run.** All 14 Playwright scenarios in
   [`testing/e2e-scenarios.md`](testing/e2e-scenarios.md) — 7 of them Critical
   — are written but not executed here. The verification above exercises the
   API and the component layer, not a real browser, so the full
   customer/restaurant/driver/admin journeys are proven endpoint by endpoint
   rather than click by click. This is the largest single gap in this report.
3. **No load, soak or accessibility audit.** The NFR-5 latency target and the
   axe/keyboard passes described in the test plan have not been run.
4. **TC-368 simulates a mid-commit failure with a trigger**, not by severing
   the connection. It proves atomicity and safe retry; it does not prove
   behaviour under a genuine network partition.

### Deliberate scope boundaries

* **No payment gateway.** `payment_method` is recorded; `CASH_ON_DELIVERY` is
  the only settled path.
* **Order updates are polled, not pushed.** Visibility-aware polling with
  backoff; WebSockets are the natural next step.
* **Dispatch ranks drivers by straight-line distance** over stored
  coordinates — no routing engine, no live GPS tracking.
* **Background jobs run in-process**, guarded by advisory locks. Correct and
  multi-instance-safe, but a dedicated queue would be better at scale.
* **Notifications are persisted rows only** — no email or push transport.
* **Images are URLs** — no upload pipeline or object storage.
* **Rate limiting uses an in-memory store**, so limits are per-replica. Risk
  R-09; a Redis store is the fix.

---

## 11. Documentation

60 markdown files, 15,055 lines.

| Location | Contents |
|---|---|
| [`../README.md`](../README.md) | Setup, configuration, scripts, architecture notes, development accounts |
| [`AS-BUILT.md`](AS-BUILT.md) | Divergences from the plan, operational notes |
| `VERIFICATION.md` | This report |
| [`sdd/`](sdd/README.md) | 33 files — master SDD, 7 architecture documents with ADRs, 10 specs, 10 stories, implementation plan, dependency map, assumptions, risks |
| [`testing/`](testing/README.md) | 25 files — strategy, plan, 424-row traceability matrix, 410 test cases across 17 files plus 14 E2E scenarios, test data, coverage analysis |

Specs, stories and test cases are numbered independently: `spec-01` is not
`story-01` is not `TC-001`. [`testing/test-matrix.md`](testing/test-matrix.md)
is the only correct way to trace between them.
