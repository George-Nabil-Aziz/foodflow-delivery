# Testing Strategy

> Parent: [master-sdd.md](../master-sdd.md) · Vitest · Supertest · Vue Test Utils · Playwright

## 1. Principles

1. **TDD by default.** Write the failing test, watch it fail for the right reason, then implement. Every story's task list in [implementation-plan.md](../implementation-plan.md) is ordered that way.
2. **Test behaviour, not implementation.** "A customer cannot cancel a `PREPARING` order" survives a refactor; "`orderService.cancel` calls `assertTransition`" does not.
3. **Real PostgreSQL, never a mocked database.** The design leans on partial unique indexes, check constraints and `SELECT … FOR UPDATE`; a mock would pass while the real invariant broke. Only genuinely external things (clock, notification transport) are faked.
4. **Every business rule ID is traceable to a test.** Test names cite the rule: `it('BR-C3: rejects an item from a different restaurant with CART_RESTAURANT_MISMATCH')`. A coverage script greps the suite for every `BR-*` in the master SDD and fails if one has no test.
5. **Illegal paths are tested as hard as legal ones.** For the state machine, the negative cases *are* the feature.

## 2. The pyramid, concretely

| Layer | Count (approx.) | Runtime | Runs on |
|-------|-----------------|---------|---------|
| Backend unit | ~180 | <5 s | Every save |
| Backend service + API integration | ~220 | ~60 s | Every commit |
| Frontend unit + component | ~150 | ~20 s | Every commit |
| E2E | ~12 scenarios | ~3 min | Pre-merge and nightly |

## 3. Backend unit tests

Pure functions, no I/O.

| Target | What is asserted |
|--------|------------------|
| `orderStateMachine` | **Every cell of the [§7.3](../master-sdd.md#73-order-state-machine) table.** A data-driven test iterates all `status × status × role` combinations (7×7×5 = 245) and asserts allow/deny against the table — so an accidental extra edge fails immediately |
| `orderPricing` | `line_total`, `subtotal`, tax rounding at half-up 2dp, `total` identity; a 0.1+0.2 regression test |
| `money` | Add/multiply/round on minor units; no float leakage |
| `cartValidator` | Issue detection: unavailable, removed, price-changed, restaurant-closed |
| `orderNumber` | Format `FF-YYYYMMDD-XXXXXX`, uniqueness over 10k generations |
| Zod schemas | Each rule from [master-sdd §15](../master-sdd.md#15-validation) — boundary values in and out, and unknown-key stripping |
| `jwt` | Sign/verify round trip, expiry rejection, `alg: none` rejection, `iss`/`aud` mismatch rejection |
| `mask` | Phone masking leaves exactly the documented digits |

## 4. Backend service and API integration tests

Supertest against the real app and a real `foodflow_test` database, truncated
between tests.

**Per endpoint, the standard battery:**
1. Happy path → correct status, envelope shape, and DTO fields.
2. Unauthenticated → 401 `TOKEN_MISSING`.
3. Each wrong role → 403 `FORBIDDEN_ROLE`.
4. Right role, someone else's resource → 404 `RESOURCE_NOT_FOUND`.
5. Invalid payload → 422 `VALIDATION_ERROR` with the right `details[].field`.
6. Documented conflict cases → the specific 409/422 code.

**Scenario suites that matter most:**

| Suite | Covers |
|-------|--------|
| `auth.integration` | Register both roles; duplicate email 409; `role: ADMIN` rejected 403; login; suspended login 403; refresh rotation; **reuse detection revokes the family**; password change revokes sessions; timing parity between unknown-email and wrong-password |
| `authorization.matrix` | Generated: every protected route × {anonymous, CUSTOMER, RESTAURANT, DRIVER, ADMIN} → expected status. One table, no gaps |
| `cart.integration` | One active cart (BR-C1); restaurant binding (BR-C2); **mismatch 409 with both names** (BR-C3); `?replace=true` clears and rebinds (BR-C4); quantity bounds; duplicate add increments (BR-C6); unavailable item rejected (BR-C7); issues surfaced on read (BR-C8) |
| `checkout.integration` | Snapshot correctness; totals; empty cart; below minimum; cart with issues; restaurant closed between add and checkout; address not owned; cart → `CONVERTED`; **price change after checkout leaves the order unchanged** (G2, BR-O1) |
| `orderLifecycle.integration` | Each legal transition end to end with the right actor; each illegal one rejected; customer cancel window; restaurant reject with reason; admin force-cancel; `order_status_events` written for every change |
| `concurrency.integration` | Two parallel accepts → one 200, one 409; two drivers accept one offer → one wins (BR-D5); double checkout → one order |
| `delivery.integration` | Dispatch on `CONFIRMED`; offer expiry re-dispatches; no-driver leaves the order intact and flags `UNASSIGNED` (FR-7.4); pickup before ready 409; unassigned driver acting on an order 404; delivery frees the driver |
| `reviews.integration` | Only delivered orders (BR-V1); one per order (BR-V2); driver rating requires a driver (BR-V4); **aggregate recomputation** (BR-V5); 24 h edit window (BR-V6); hidden reviews leave the aggregate (BR-V7); public payload hides PII (BR-V8) |
| `admin.integration` | Approve/reject/suspend flows; suspension revokes tokens *and* blocks the existing access token (FR-9.3); audit rows written; statistics arithmetic against a known fixture |
| `contract.integration` | Every response matches the envelope schema; every code in `codes.js` is reachable and documented |
| `transactional.integration` | Forced failure mid-checkout leaves **no** order, **no** order items and an untouched cart (NFR-7) |

**Fixtures.** `tests/helpers/factories.js` can produce an order in any lifecycle
state in one call (`makeOrder({ status: 'PREPARING' })`), which is what keeps the
negative-path tests short enough that people actually write them.

## 5. Frontend tests

| Kind | Targets |
|------|---------|
| Store unit | `auth`: login/logout/restore/clear-on-refresh-failure. `cart`: mirrors server state and never recomputes totals. `ui`: toast lifecycle |
| Composable unit | `useOrderPolling` starts, pauses on hidden, stops on terminal status, backs off on repeated failure, clears on unmount; `useApi` loading/error transitions; the HTTP layer's **single-flight refresh** under five concurrent 401s |
| Component | `FoodItemCard` disabled + explained when unavailable; `CartLineItem` enforces 1–20 and emits remove at the boundary; `OrderActionBar` renders only the actions legal for the current status and role; `ReviewForm` requires a restaurant rating and hides the driver rating when there was no driver; `StatusBadge` pairs color with text |
| View-level | `CheckoutView` renders the right message for `BELOW_MINIMUM_ORDER`, `CART_HAS_ISSUES`, `RESTAURANT_UNAVAILABLE`; the cross-restaurant switch dialog confirms before replacing and cancels without side effects |
| Accessibility | `@axe-core/playwright` on login, restaurant list, menu, cart, checkout, order tracking, restaurant orders, driver active delivery, admin dashboard — zero serious/critical |

## 6. End-to-end scenarios

Playwright against a seeded stack; each scenario logs in as each role in its own
browser context so cross-role hand-offs are genuinely cross-session.

1. **`full-order-journey`** (the primary scenario) — customer registers → logs in → browses → opens a restaurant → adds two items → tries an item from another restaurant → sees the switch dialog → cancels it → checks out → sees `PENDING`; restaurant accepts → starts preparing → marks ready; driver accepts the offer → picks up → delivers; customer's tracking view reaches `DELIVERED` → submits a review → the restaurant's rating average updates on the listing page.
2. **`cart-restaurant-switch`** — confirming the switch clears the old cart and rebinds (BR-C3/C4).
3. **`customer-cancels`** — cancel at `PENDING` succeeds; the cancel control is gone at `PREPARING`.
4. **`restaurant-rejects`** — rejection with a reason shows the customer "Rejected by restaurant" with that reason.
5. **`no-driver-available`** — with no drivers online, the order stays `READY_FOR_PICKUP`, the customer sees "finding a driver", and the order appears in the admin unassigned backlog (FR-7.4).
6. **`menu-price-change`** — change an item's price after checkout; the historical order still shows the original price (G2).
7. **`restaurant-approval`** — a pending restaurant is absent from the customer listing and cannot open its menu screens; after admin approval it appears and works.
8. **`driver-single-delivery`** — a driver on an active delivery receives no new offers and cannot go offline (BR-D5, BR-D9).
9. **`admin-suspends-restaurant`** — suspension removes it from listings immediately while its in-flight order still completes (BR-R9).
10. **`role-isolation`** — each role visiting another role's URL gets the 403 view; the API returns 403/404 as specified.
11. **`review-moderation`** — hiding a review removes it from the public list and lowers the aggregate (BR-V7).
12. **`responsive-smoke`** — the primary journey at 360 px with no horizontal scroll.

## 7. Coverage and CI

| Gate | Threshold |
|------|-----------|
| Backend line coverage | ≥80% |
| Backend branch coverage | ≥75% |
| `orderStateMachine` | 100% lines and branches |
| Frontend line coverage | ≥70% |
| Lint | Zero warnings |
| `npm audit` | No high or critical |

CI pipeline: `install → lint → backend unit → migrate test DB → backend
integration → frontend unit/component → build → E2E → coverage gate`. A failing
gate blocks the merge; coverage thresholds are floors, and lowering one requires
a comment explaining why.

## 8. What is deliberately not tested

- Third-party library internals (Express routing, Knex SQL generation, bcrypt's correctness).
- Exact CSS values or DOM structure — component tests assert behaviour and accessible names.
- The stubbed notification transport beyond "it was called with the right template and payload".
- Performance beyond NFR-5's benchmark script, which is a check, not a suite.
