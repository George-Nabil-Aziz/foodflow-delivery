# FoodFlow — Test Plan

> Companion to [test-strategy.md](test-strategy.md) (how we test) and
> [test-cases/](test-cases/) (what we test). This document covers scope,
> environments, schedule, test-case conventions, tooling, defect handling and
> sign-off.

---

## 1. Plan summary

| Item | Value |
|------|-------|
| Product | FoodFlow — food delivery management platform |
| Baseline | [`../sdd/`](../sdd/) — master SDD, 10 specs, 10 stories, 7 architecture documents |
| Acceptance criteria to cover | 165 (across 10 stories) |
| Business rules to cover | 84 (`BR-A*`, `BR-R*`, `BR-C*`, `BR-O*`, `BR-D*`, `BR-V*`, plus `BR-AD*`, `BR-F*`, `BR-M*`) |
| API endpoints to cover | 90 |
| Test cases | 424 (`TC-001` – `TC-424`) |
| Order transitions to cover | 10 legal + 235 illegal combinations |
| Roles to cover | 4 + anonymous |

## 2. Test case ID allocation

IDs are allocated in fixed blocks per category so that they are stable, unique,
and extendable without renumbering. **Numbering is independent of spec and story
numbering** — `TC-001` is not tied to `spec-01` or `story-01`.

| Block | Category | File | Count |
|-------|----------|------|-------|
| TC-001 – TC-028 | Authentication | [test-cases/authentication.md](test-cases/authentication.md) | 28 |
| TC-029 – TC-054 | Authorization & roles | [test-cases/authorization.md](test-cases/authorization.md) | 26 |
| TC-055 – TC-070 | Users, profiles & addresses | [test-cases/users.md](test-cases/users.md) | 16 |
| TC-071 – TC-090, TC-416 – TC-417 | Restaurant management | [test-cases/restaurants.md](test-cases/restaurants.md) | 22 |
| TC-091 – TC-114 | Menu management | [test-cases/menu.md](test-cases/menu.md) | 24 |
| TC-115 – TC-134, TC-414 – TC-415 | Discovery & search | [test-cases/discovery.md](test-cases/discovery.md) | 22 |
| TC-135 – TC-166 | Cart | [test-cases/cart.md](test-cases/cart.md) | 32 |
| TC-167 – TC-196 | Orders & checkout | [test-cases/orders.md](test-cases/orders.md) | 30 |
| TC-197 – TC-228 | Order state machine | [test-cases/order-state-machine.md](test-cases/order-state-machine.md) | 32 |
| TC-229 – TC-254 | Delivery & drivers | [test-cases/delivery.md](test-cases/delivery.md) | 26 |
| TC-255 – TC-276 | Reviews & ratings | [test-cases/reviews.md](test-cases/reviews.md) | 22 |
| TC-277 – TC-300, TC-418 | Admin | [test-cases/admin.md](test-cases/admin.md) | 25 |
| TC-301 – TC-322 | Validation | [test-cases/validation.md](test-cases/validation.md) | 22 |
| TC-323 – TC-346 | Security | [test-cases/security.md](test-cases/security.md) | 24 |
| TC-347 – TC-368 | Edge cases | [test-cases/edge-cases.md](test-cases/edge-cases.md) | 22 |
| TC-369 – TC-392 | Frontend behaviour | [test-cases/frontend.md](test-cases/frontend.md) | 24 |
| TC-393 – TC-406 | End-to-end journeys | [e2e-scenarios.md](e2e-scenarios.md) | 14 |
| TC-407 – TC-413, TC-419 – TC-424 | Platform foundation & read endpoints | [test-cases/platform-foundation.md](test-cases/platform-foundation.md) | 13 |

New cases append to the end of their category block; when a block fills, the
next case takes the next free ID above TC-424 and the table records it. IDs are
never reused, even when a case is retired — a retired case is struck through
with the reason, so a historical defect report still resolves.

## 3. Acceptance criterion IDs

The stories carry Gherkin scenarios but did not number them. This plan assigns
stable IDs of the form **`AC-<story>-<n>`**, where `n` is the 1-based position of
the scenario in that story's acceptance-criteria block, read top to bottom.

`AC-06-04` is therefore the fourth scenario in
[story-06](../sdd/stories/story-06-order-placement-customer-tracking.md) — the
one proving that renaming, repricing and deleting a menu item leaves a placed
order unchanged.

The complete index is in
[acceptance-criteria-index.md](acceptance-criteria-index.md). Assigning IDs adds
identifiers to existing criteria; it does not alter, add or remove any
requirement.

| Story | ACs | Story | ACs |
|-------|-----|-------|-----|
| story-01 | 10 (AC-01-01 … AC-01-10) | story-06 | 20 (AC-06-01 … AC-06-20) |
| story-02 | 16 (AC-02-01 … AC-02-16) | story-07 | 16 (AC-07-01 … AC-07-16) |
| story-03 | 17 (AC-03-01 … AC-03-17) | story-08 | 19 (AC-08-01 … AC-08-19) |
| story-04 | 16 (AC-04-01 … AC-04-16) | story-09 | 18 (AC-09-01 … AC-09-18) |
| story-05 | 18 (AC-05-01 … AC-05-18) | story-10 | 15 (AC-10-01 … AC-10-15) |

**Total: 165.**

## 4. Test case format

The canonical format is the one below. Because 424 cases in fully expanded form
would bury the content in headings, the case files use a **compact rendering of
exactly the same fields** — nothing is dropped, only laid out densely. Both
forms are equivalent; the compact form is the one to write new cases in.

**Canonical (expanded) form:**

```markdown
# TC-167 — Checkout produces correct totals from a two-line cart

## Related Spec
spec-07, spec-06

## Related Story
story-06

## Related Acceptance Criteria
AC-06-01

## Business Rules
BR-O3, BR-O4

## Type
API

## Priority
Critical

## Preconditions
Customer CUST_A is authenticated and has a default address.
Restaurant REST_A is ACTIVE, orderable, delivery fee 12.00, minimum 30.00.
Cart contains 2 × Mixed Grill (58.00) and 1 × Lentil Soup (18.00).

## Test Data
CUST_A, REST_A, ITEM_GRILL, ITEM_SOUP, ADDR_A_DEFAULT

## Steps
1. POST /api/orders with { addressId: ADDR_A_DEFAULT, paymentMethod: "CASH_ON_DELIVERY" }.

## Expected Result
201. subtotal "134.00", deliveryFee "12.00", taxAmount "20.10",
totalAmount "166.10". Status PENDING. Two order_items rows with unit_price
"58.00" and "18.00".

## Postconditions
Cart status CONVERTED. One order_status_events row (null → PENDING, CUSTOMER).

## Notes
Tax at the default TAX_RATE of 0.15 applied to subtotal only (A-03).
```

**Compact form (used in the case files) — identical fields:**

```markdown
### TC-167 — Checkout produces correct totals from a two-line cart
**Spec** spec-07, spec-06 · **Story** story-06 · **AC** AC-06-01 · **Rules** BR-O3, BR-O4
**Type** API · **Priority** Critical
**Pre** CUST_A authenticated with a default address; REST_A ACTIVE and orderable, fee 12.00, minimum 30.00; cart = 2 × Mixed Grill (58.00) + 1 × Lentil Soup (18.00).
**Data** CUST_A, REST_A, ITEM_GRILL, ITEM_SOUP, ADDR_A_DEFAULT
**Steps** 1. POST `/api/orders` `{ addressId, paymentMethod: "CASH_ON_DELIVERY" }`.
**Expected** 201; subtotal `134.00`, deliveryFee `12.00`, taxAmount `20.10`, total `166.10`; status `PENDING`; two `order_items` with unit prices `58.00` / `18.00`.
**Post** Cart `CONVERTED`; one `order_status_events` row (null → PENDING, CUSTOMER).
**Notes** Tax at default `TAX_RATE` 0.15 on subtotal only (A-03).
```

Field meanings:

| Field | Meaning |
|-------|---------|
| **Spec / Story / AC** | Traceability. `AC` may be `—` for cases derived from a spec or business rule with no matching Gherkin scenario; those are flagged in [coverage-analysis.md](coverage-analysis.md) |
| **Rules** | The `BR-*` / `FR-*` / `NFR-*` / ADR identifiers verified |
| **Type** | Unit · Service · API · Component · Integration · E2E · Security · A11y |
| **Priority** | Critical · High · Medium · Low, per [test-strategy §6](test-strategy.md#6-priority-classification) |
| **Pre** | State that must exist before step 1 |
| **Data** | Fixture identifiers from [test-data.md](test-data.md) — never literal credentials |
| **Steps** | Numbered, each a single action |
| **Expected** | Status code, response body assertions, **and database side effects** |
| **Post** | State after the case, including "nothing changed" where that is the point |
| **Notes** | Rationale, links, defect IDs, or why an expectation is counter-intuitive |

## 5. Environments

| Environment | Purpose | Database | Data | Who |
|-------------|---------|----------|------|-----|
| **Local dev** | Development, watch-mode unit tests | `foodflow` (Docker) | Seed script | Developer |
| **Local test** | Unit, service, API suites | `foodflow_test` (Docker, separate database) | Created and truncated per test | Developer, CI |
| **CI** | Every gate on push and PR | `foodflow_test` in a PostgreSQL 16 service container, ephemeral per job | Migrations + factories | CI |
| **Staging** | E2E, exploratory charters, release verification | `foodflow_staging`, isolated instance | Anonymized seed only | Release owner |
| **Production** | Live | `foodflow` | Real | Nobody tests here |

### Isolation rules

These are the rules that keep test activity from ever touching real data:

1. **Automated tests connect only to a database whose name ends in `_test`.** `tests/setup.js` asserts this against `DATABASE_URL` and aborts the run otherwise. This is the single most important safeguard, because `TRUNCATE … CASCADE` runs between tests.
2. **`NODE_ENV=test` is required** for the suite to start; the config schema rejects anything else at boot for the test harness.
3. **Staging and production use separate credentials, hosts and JWT secrets.** A staging token is not valid in production.
4. **No test ever runs against production**, including read-only smoke tests. Production verification is done by observing real traffic and `/api/health`, not by executing test cases.
5. **Staging data is anonymized or synthetic.** No real customer name, email, phone or address is copied into a lower environment.
6. **Seed data is fictional throughout** — see [test-data.md](test-data.md). Seeded accounts use `@foodflow.com`; FoodFlow sends no email.
7. **Credentials come from environment variables**, never from committed files. `.env.test.example` documents the variables with placeholder values.

### Required environment variables for the test run

```bash
NODE_ENV=test
DATABASE_URL=postgres://foodflow:${DB_PASSWORD}@localhost:5432/foodflow_test
JWT_SECRET=${TEST_JWT_SECRET}        # ≥32 chars, distinct per environment
SEED_ADMIN_EMAIL=${TEST_ADMIN_EMAIL}
SEED_ADMIN_PASSWORD=${TEST_ADMIN_PASSWORD}
TAX_RATE=0.15
ORDER_ACCEPT_TIMEOUT_MINUTES=10
DELIVERY_OFFER_TTL_SECONDS=90
```

Tests that depend on timing (offer expiry, the accept timeout, the 24-hour
review window) **control the clock rather than waiting**: they use a fake timer
or insert rows with a back-dated timestamp. No test sleeps for 90 seconds.

## 6. Tooling

| Purpose | Tool |
|---------|------|
| Backend unit, service, API | Vitest + Supertest |
| Frontend unit, component | Vitest + Vue Test Utils + jsdom |
| E2E | Playwright (Chromium, Firefox, WebKit) |
| Accessibility | `@axe-core/playwright` |
| Coverage | `@vitest/coverage-v8` |
| Fixtures | `tests/helpers/factories.js` |
| DB reset | `tests/helpers/db.js` — `TRUNCATE … RESTART IDENTITY CASCADE` |
| Auth fixtures | `tests/helpers/auth.js` — real tokens per role |
| Clock control | Vitest fake timers; back-dated inserts for DB-driven timing |
| CI | GitHub Actions |

## 7. Execution schedule

Mapped to the phases in [`../sdd/implementation-plan.md`](../sdd/implementation-plan.md).
Cases become executable as their story lands; running a case before its phase is
not a failure, it is an absence.

| Phase | Stories | Case blocks that become executable |
|-------|---------|-----------------------------------|
| 1 — Foundation & Identity | 01, 02 | TC-001–TC-070 (auth, authz scaffolding, users), TC-301–TC-322 partial, TC-323–TC-336, TC-407–TC-413 |
| 2 — Supply side | 03 | TC-071–TC-114, TC-277–TC-282 (approval slice) |
| 3 — Demand side | 04, 05 | TC-115–TC-166, TC-369–TC-380 |
| 4 — Transaction core | 06, 07 | TC-167–TC-228, TC-347–TC-356 |
| 5 — Fulfilment | 08 | TC-229–TC-254, TC-283–TC-286, TC-393–TC-396 |
| 6 — Trust & operations | 09, 10 | TC-255–TC-300, TC-337–TC-346, TC-357–TC-368, TC-381–TC-406, TC-418–TC-424 |

## 8. Defect management

| Severity | Definition | Response |
|----------|------------|----------|
| **S1 Blocker** | Data loss or corruption, unauthorized access, money wrong, a primary journey broken | Stop the line. Fix before any other work. Regression test first. |
| **S2 Major** | A feature is unusable with no workaround, or a business rule is violated without data loss | Fix within the current phase; blocks the release |
| **S3 Minor** | Degraded experience with a workaround | Triaged into a phase; does not block |
| **S4 Trivial** | Cosmetic | Backlog |

**Every defect at S1 or S2 gets a regression test written before the fix**, so
the test fails, then the fix makes it pass. The test's **Notes** field records
the defect ID. This is what stops the same bug returning a quarter later.

A defect report carries: the TC ID that found it (or "exploratory"), the
environment, the request ID from the response envelope (which is why
`meta.requestId` exists), the expected and actual results, and the severity with
its justification.

## 9. Risks to the test effort

| Risk | Impact | Mitigation |
|------|--------|------------|
| Concurrency cases are inherently non-deterministic | Flaky suite, eroded trust | Drive races with explicit transaction control and barriers rather than parallel timing; assert "exactly one succeeded" rather than which one |
| Time-dependent cases (offer expiry, accept timeout, review window) | Slow or flaky | Control the clock; back-date rows; never sleep |
| E2E suite grows slow and brittle | Skipped before merge | Keep E2E to 14 journey-level scenarios; push detail down to API tests |
| Seed drift as the schema grows | E2E fails for the wrong reason | Seed extended as part of each story's tasks; CI runs E2E against the seed, so a broken seed fails the build ([R-13](../sdd/risks.md)) |
| Coverage gamed by asserting trivia | False confidence | Review requires that negative paths and DB side effects are asserted, not just status codes |
| ACs added to stories without test cases | Silent traceability gap | [coverage-analysis.md](coverage-analysis.md) is regenerated and checked each phase |

## 10. Deliverables

| Deliverable | Location |
|-------------|----------|
| Test strategy | [test-strategy.md](test-strategy.md) |
| Test plan | this document |
| 424 test cases | [test-cases/](test-cases/) and [e2e-scenarios.md](e2e-scenarios.md) |
| AC index | [acceptance-criteria-index.md](acceptance-criteria-index.md) |
| Traceability matrix | [test-matrix.md](test-matrix.md) |
| Test data definitions | [test-data.md](test-data.md) |
| Coverage analysis and gaps | [coverage-analysis.md](coverage-analysis.md) |

## 11. Sign-off

A release is signed off when, and only when:

- [ ] All 424 cases have been executed in the current cycle.
- [ ] 100% of Critical and High cases pass.
- [ ] All 165 acceptance criteria have a passing case.
- [ ] All 84 business rules have a passing case.
- [ ] All 245 state-machine combinations are asserted.
- [ ] Every protected endpoint has all six standard probes passing.
- [ ] Coverage floors met: backend ≥80% lines / ≥75% branches, `orderStateMachine` 100%, frontend ≥70%.
- [ ] Both exploratory charters completed and their findings scripted.
- [ ] `npm audit` clean at high and critical.
- [ ] No open S1 or S2 defect.
- [ ] Open S3/S4 defects are listed with owners and target phases.

Sign-off is recorded with the commit SHA tested, the environment, the date and
the person signing.
