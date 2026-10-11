# FoodFlow — Test Strategy

> Source of truth: [`../sdd/master-sdd.md`](../sdd/master-sdd.md) and the ten
> specs and ten stories beneath it. This document explains **how** FoodFlow is
> tested; [test-plan.md](test-plan.md) explains **what is run, when, and by
> whom**; [test-cases/](test-cases/) holds the cases themselves.

This strategy does not restate [`../sdd/architecture/testing-strategy.md`](../sdd/architecture/testing-strategy.md),
which sets the tooling and the pyramid as an architectural decision. It builds
on it: the architecture document says *Vitest, Supertest, real PostgreSQL, 80%
coverage*; this document says how those choices are turned into 406 executable
test cases with traceability back to 165 acceptance criteria.

---

## 1. Objectives

| # | Objective | Met when |
|---|-----------|----------|
| O1 | Every acceptance criterion in every story is executable | All 165 ACs map to ≥1 test case ([coverage-analysis.md](coverage-analysis.md)) |
| O2 | Every business rule (`BR-*`) is verified | All 58 BR IDs appear in ≥1 test case's **Rules** field |
| O3 | Money is never wrong | Pricing, snapshot and total tests are Critical and gate the build |
| O4 | No illegal order transition is reachable | All 245 `status × status × role` combinations are asserted |
| O5 | No role can act outside its authority | Every protected endpoint × 5 caller identities is asserted |
| O6 | Regressions are caught before merge | CI runs the full non-E2E suite on every push; E2E pre-merge |

## 2. Scope

**In scope.** Backend unit logic, service behaviour against a real database,
HTTP API contract, frontend stores/composables/components, cross-role
integration flows, end-to-end journeys, accessibility of key screens, and the
security controls that the SDD actually specifies.

**Out of scope, and why.**

| Not tested | Reason |
|---|---|
| Payment processing | Non-goal; `CASH_ON_DELIVERY` is the only value |
| Real email/SMS delivery | Non-goal; `NotificationService` is a stub, so tests assert the call, not the transport |
| Live GPS tracking | Non-goal |
| Third-party library internals | Express routing, Knex SQL generation and bcrypt's own correctness are their maintainers' tests |
| Load and stress testing beyond NFR-5 | A single benchmark script checks the p95 target; sustained load testing is not justified at the assumed scale ([assumptions.md A-21](../sdd/assumptions.md)) |
| Penetration testing | Test cases **verify implemented controls**; they do not establish that the system is secure. See §8. |
| Browser matrix beyond Chromium/Firefox/WebKit via Playwright defaults | No requirement for legacy browsers |

## 3. Test levels

| Level | What it proves | Environment | Speed |
|-------|----------------|-------------|-------|
| **Unit** | Pure logic is correct in isolation: state machine, money, cart validation, orderability, schemas, JWT, masking, aggregation | None — no I/O | <5 s |
| **Service** | Business rules hold against real constraints: transactions, partial unique indexes, row locks, aggregate recomputation | Real PostgreSQL (`foodflow_test`) | ~30 s |
| **API / integration** | The full HTTP path: auth, validation, authorization, envelope, status codes, error codes, DB side effects | Real app + real DB via Supertest | ~60 s |
| **Frontend unit** | Stores, composables, utilities, validation rules | jsdom, mocked HTTP | ~10 s |
| **Frontend component** | User-visible behaviour of components | jsdom + Vue Test Utils | ~10 s |
| **E2E** | Cross-role journeys through the real stack | Seeded stack, Playwright, one browser context per role | ~3 min |
| **Accessibility** | Key screens have no serious/critical violations | Playwright + axe | ~30 s |

### Why a real database rather than mocks

The design deliberately pushes correctness into the schema: `uq_carts_one_active`,
`uq_assignments_driver_active`, `chk_orders_totals`, `SELECT … FOR UPDATE`. A
mocked repository would return whatever the test author expected and would pass
while the real invariant was broken — which is precisely the class of bug these
constraints exist to prevent. Mocks are therefore used **only** for genuinely
external or non-deterministic things: the clock, the notification transport, and
HTTP in frontend tests.

## 4. Test design techniques

Each technique is applied where its failure mode lives, not uniformly:

| Technique | Applied to | Example |
|-----------|-----------|---------|
| **Decision table / state transition** | The order state machine | All 245 `from × to × role` combinations (TC-197–TC-228) |
| **Equivalence partitioning** | Enum and role inputs | Valid role, wrong role, no role, unknown role |
| **Boundary value analysis** | Quantities, ratings, prices, pagination, edit windows | Quantity 0/1/20/21; rating 0/1/5/6; limit 0/1/100/101; review edit at 23 h 59 m and 24 h 01 m |
| **Pairwise** | Discovery filter combinations | cuisine × openNow × minRating × sort |
| **Negative testing** | Every endpoint | Six standard failure probes, §5 |
| **Concurrency testing** | Every race the design names | Double accept, double offer accept, double checkout, double review, double set-default |
| **Data-driven** | Authorization and state machine | One table, generated cases — adding a route or a transition automatically adds coverage |
| **Exploratory** | Pre-release, time-boxed | §7 |

## 5. The standard API probe

Every protected endpoint gets the same six probes, so coverage is uniform and
gaps are visible by their absence rather than by inspection:

| Probe | Request | Expected |
|-------|---------|----------|
| **P1 Happy path** | Valid, authorized | 2xx, envelope `success: true`, correct DTO, correct DB side effect |
| **P2 Validation** | Malformed payload | `422 VALIDATION_ERROR` with `details[].field` |
| **P3 Authentication** | No / invalid / expired token | `401 TOKEN_MISSING` / `TOKEN_INVALID` / `TOKEN_EXPIRED` |
| **P4 Authorization** | Valid token, wrong role | `403 FORBIDDEN_ROLE` |
| **P5 Resource** | Right role, someone else's or absent resource | `404 RESOURCE_NOT_FOUND` |
| **P6 Business rule** | Well-formed but illegal state | The specific `409`/`422` code from the registry |

P5 deliberately expects **404 rather than 403** for a cross-tenant resource, per
[ADR-010](../sdd/architecture/security.md#adr-010-404-over-403-for-cross-tenant-resources).
A test asserting 403 there would be testing the wrong requirement.

Every probe additionally asserts **no unintended database side effect** — a
rejected request must leave the database exactly as it found it. This is what
catches the partially-applied write, which is more dangerous than the rejection
itself.

## 6. Priority classification

Priority is assigned from objective technical and business impact, not from
preference. The rule is: *what does a failure here cost, and can it be
detected after the fact?*

| Priority | Definition | Applies to |
|----------|------------|------------|
| **Critical** | Failure causes financial loss, data corruption, unauthorized access, or an unrecoverable state — and is often silent | Order totals and snapshots; state-machine legality; authentication; authorization and ownership; transaction atomicity; concurrency arbitration; password handling |
| **High** | Failure blocks a primary user journey or produces visibly wrong data | Checkout, cart rules, order processing, dispatch and delivery, restaurant approval, review aggregates, admin suspension taking effect |
| **Medium** | Failure degrades the experience but has a workaround and is visible | Discovery filters and sorting, search, pagination, list views, statistics, profile editing, history views |
| **Low** | Cosmetic, or an unlikely edge with a trivial consequence | Empty-state copy, label formatting, sort tie-breaks, non-blocking UI polish |

**Why these categories carry these priorities:**

- **Authentication and authorization are Critical** because a failure is silent and unbounded: nothing alerts you that a customer read a stranger's address, and the damage is done before anyone notices.
- **Financial calculations are Critical** because an error persists into immutable order history. `chk_orders_totals` means a wrong total cannot be stored — but only if the test proves the constraint is actually there.
- **Order state transitions are Critical** because an illegal transition creates a state the rest of the system has no defined behaviour for — a delivered-then-cancelled order has no correct answer for refunds, reviews or statistics.
- **Data integrity (snapshots) is Critical** because corruption is discovered months later, in a dispute, when it is unfixable.
- **Discovery is Medium**, not High: a wrong sort order is annoying and immediately visible, and no money or access depends on it.

A Critical failure blocks the merge. A High failure blocks the release. Medium
and Low are triaged.

## 7. Exploratory testing

Scripted cases check what was thought of. Two time-boxed exploratory charters
run before each release, because the cart and the state machine are where
unanticipated sequences live:

1. **Cart charter (60 min).** Drive a cart through unusual sequences while a second session mutates the menu underneath it — rename, reprice, delete, deactivate a category, close the restaurant, suspend it. Goal: find a state where displayed price, `canCheckout` and the checkout result disagree.
2. **Lifecycle charter (60 min).** Drive one order with four sessions open — customer, restaurant, driver, admin — acting in overlapping and out-of-order sequences. Goal: find a reachable state that the §7.3 table does not describe.

Findings are written up as new scripted cases before being fixed, so the
regression suite grows from what was actually found.

## 8. On the limits of security testing

The security cases in [test-cases/security.md](test-cases/security.md) verify
that **the controls the SDD specifies are implemented and effective against the
attacks they were designed for**. They do not establish that FoodFlow is secure,
and they should never be cited as evidence of that.

Specifically not covered: cryptographic review of the JWT implementation,
dependency supply-chain compromise beyond `npm audit`, infrastructure and
network security, social engineering, and any attack class not anticipated in
the [threat model](../sdd/architecture/security.md#1-threat-model). Two accepted
weaknesses are documented rather than tested away —
[R-08](../sdd/risks.md) (refresh tokens in `localStorage`) and
[R-09](../sdd/risks.md) (in-memory rate limiting); tests confirm the
*mitigations* work, not that the weaknesses are gone.

An independent security review is recommended before any real launch.

## 9. Regression strategy

| Trigger | Suite | Gate |
|---------|-------|------|
| Every file save (local) | Unit, watch mode | — |
| Every push | Unit + service + API + frontend | Blocking |
| Every pull request | The above + E2E + axe + coverage floors | Blocking |
| Nightly | Full suite + the NFR-5 benchmark + `npm audit` | Alerting |
| Before release | Full suite + both exploratory charters | Blocking |

**Regression selection.** The suite is fast enough (~2 min without E2E) that
selective execution is unnecessary and would be a false economy — the cost of
choosing wrong exceeds the time saved. The full suite runs every time.

**Regression growth rules:**
1. Every fixed defect gets a test that fails before the fix and passes after it, added to the category file for the area, with the defect ID in its **Notes**.
2. The state-machine and authorization suites are **data-driven**: adding a transition or a route automatically produces new cases. Nobody has to remember.
3. A test is deleted only when the requirement it verifies is deleted — never because it is inconvenient or slow.
4. Coverage floors are floors. Lowering one requires a comment in the PR explaining why, which makes the decision visible rather than incidental.

**Flakiness policy.** A test that fails intermittently is treated as a defect in
the test or the system, never as noise. It is quarantined within one working day
and either fixed or deleted with a written reason — a retried flaky test is
worse than no test, because it trains people to ignore red.

## 10. Entry and exit criteria

**Entry to a test cycle:** the story's implementation is complete against its
spec; migrations apply cleanly; seed data loads; the build is green.

**Exit from a story:** every AC for that story passes; every Critical and High
case in its area passes; coverage floors are met; no known Critical or High
defect is open.

**Exit from a phase** ([implementation-plan.md](../sdd/implementation-plan.md)):
the phase's exit criteria plus every E2E scenario the phase enables.

**Release exit:** all 406 cases executed; 100% Critical and High passing;
Medium/Low failures triaged with owners; both exploratory charters complete;
coverage floors met; `npm audit` clean at high and critical.

## 11. Roles

| Role | Responsibility |
|------|----------------|
| Developer | Writes unit, service, API and component tests **with** the code, TDD-first per the implementation plan |
| Reviewer | Verifies that the ACs claimed by a PR actually have executable tests, and that negative paths exist |
| CI | Enforces the gates without discretion |
| Release owner | Runs the exploratory charters and signs off the exit criteria |

There is no separate QA gate that developers hand work to. The tests are part of
the deliverable, and the traceability matrix is how that is verified rather than
assumed.
