# FoodFlow — Software Design Document

> FoodFlow is a full-stack food delivery management platform that connects
> customers, restaurants, delivery drivers, and administrators through a
> centralized ordering and delivery workflow.

**Stack:** Vue 3 · Node.js + Express 4 · PostgreSQL 16 · JWT · REST
**Shape:** modular monolith — one deployable, enforced domain boundaries
**Status:** built and verified — see [../VERIFICATION.md](../VERIFICATION.md)
**Last updated:** 2026-09-27 (2026-09-22 for the plan itself)

> This directory is the **design of record** and the code follows it. Where the
> built system diverged from the plan, and why, is recorded in
> [../AS-BUILT.md](../AS-BUILT.md) — Express 4 rather than 5, a `COMPLETED`
> assignment status, and one added endpoint. Six under-specified points found
> during testing were written back into these documents rather than left in the
> code.

---

## Start here

| If you want to… | Read |
|---|---|
| Understand the whole system | [master-sdd.md](master-sdd.md) — the entry point and the normative source |
| Build it | [implementation-plan.md](implementation-plan.md) — six phases, task by task |
| Know what to build next | [dependency-map.md](dependency-map.md) — the ordering and what can run in parallel |
| Understand a feature area | [specs/](specs/) — ten specs |
| Pick up a unit of work | [stories/](stories/) — ten vertical slices with acceptance criteria |
| Understand a technical decision | [architecture/](architecture/) — seven documents plus the ADRs |
| Know what was assumed | [assumptions.md](assumptions.md) |
| Know what could go wrong | [risks.md](risks.md) |

**Precedence:** where documents disagree, [master-sdd.md](master-sdd.md) wins
and the other document is corrected. The business rules in
[§7](master-sdd.md#7-business-rules) and the order state machine in
[§7.3](master-sdd.md#73-order-state-machine) are the normative source for both
code and tests.

---

## Document map

```text
docs/sdd/
├── README.md                    ← you are here
├── master-sdd.md                ← the entry point: domain, rules, architecture
│
├── architecture/
│   ├── system-architecture.md   ← modules, boundaries, jobs, ADR-001/002/003/007/008
│   ├── backend-architecture.md  ← layers, state machine, validation, concurrency
│   ├── frontend-architecture.md ← structure, state policy, HTTP layer, routing
│   ├── database-design.md       ← ERD, tables, constraints, indexes, ADR-009/012/013
│   ├── api-design.md            ← every endpoint, by domain, ADR-011/014
│   ├── security.md              ← threat model, auth, authorization, ADR-004/005/006/010
│   └── testing-strategy.md      ← the pyramid, suites, E2E scenarios, gates
│
├── specs/    spec-01 … spec-10  ← what each area must do
├── stories/  story-01 … story-10 ← vertical slices with acceptance criteria
│
├── implementation-plan.md       ← six phases, TDD task breakdown
├── dependency-map.md            ← coverage matrix, graph, parallelization
├── assumptions.md               ← 21 documented decisions
└── risks.md                     ← 14 risks with mitigations and their tests
```

---

## Specs

| # | Spec | Scope |
|---|------|-------|
| 01 | [Platform Foundation & API Contract](specs/spec-01-platform-foundation-api-contract.md) | Envelope, errors, validation, config, DB access, logging, test harness |
| 02 | [Identity, Authentication & Authorization](specs/spec-02-identity-authentication-authorization.md) | Users, roles, JWT, refresh tokens, guards, profiles, addresses |
| 03 | [Restaurant Profile & Operating Status](specs/spec-03-restaurant-profile-operations.md) | Restaurant profile, hours, accepting-orders, orderability |
| 04 | [Menu Management](specs/spec-04-menu-management.md) | Categories, food items, availability, soft deletion |
| 05 | [Restaurant Discovery & Search](specs/spec-05-restaurant-discovery-search.md) | Listing, filters, sorts, search, public menu |
| 06 | [Cart Management](specs/spec-06-cart-management.md) | One cart, one restaurant, live revalidation, the switch flow |
| 07 | [Order Placement & Lifecycle](specs/spec-07-order-placement-lifecycle.md) | Checkout snapshot, the state machine, tracking, cancellation |
| 08 | [Delivery Assignment & Driver Operations](specs/spec-08-delivery-assignment-driver-operations.md) | Dispatch, offers, pick-up, delivery |
| 09 | [Reviews & Ratings](specs/spec-09-reviews-ratings.md) | Reviews, aggregates, moderation semantics |
| 10 | [Platform Administration & Reporting](specs/spec-10-platform-administration-reporting.md) | Accounts, approvals, oversight, statistics, audit |

## Stories

| # | Story | Phase | Depends on |
|---|-------|-------|-----------|
| 01 | [Platform Foundation & Walking Skeleton](stories/story-01-platform-foundation-walking-skeleton.md) | 1 | — |
| 02 | [Customer Registration, Login & Profile](stories/story-02-customer-registration-login-profile.md) | 1 | 01 |
| 03 | [Restaurant Onboarding, Profile & Menu Management](stories/story-03-restaurant-onboarding-menu-management.md) | 2 | 02 |
| 04 | [Restaurant Discovery, Search & Menu Browsing](stories/story-04-restaurant-discovery-menu-browsing.md) | 3 | 03 |
| 05 | [Cart Management](stories/story-05-cart-management.md) | 3 | 04 |
| 06 | [Order Placement & Customer Order Tracking](stories/story-06-order-placement-customer-tracking.md) | 4 | 05 |
| 07 | [Restaurant Order Processing](stories/story-07-restaurant-order-processing.md) | 4 | 06 |
| 08 | [Driver Onboarding, Assignment & Delivery Execution](stories/story-08-driver-onboarding-delivery-execution.md) | 5 | 07 |
| 09 | [Reviews & Ratings](stories/story-09-reviews-ratings.md) | 6 | 08 |
| 10 | [Platform Administration & Reporting](stories/story-10-platform-administration-reporting.md) | 6 | 02 (+03, 07, 08, 09) |

---

## The five decisions that shape everything else

1. **Modular monolith, not microservices** ([ADR-001](architecture/system-architecture.md#adr-001-modular-monolith-over-microservices)). Checkout spans five domains and stays one ACID transaction instead of a saga. Module boundaries are enforced by lint so extraction stays cheap later.

2. **Orders are immutable snapshots** ([ADR-008](architecture/system-architecture.md#adr-008-carts-reference-live-prices-orders-snapshot-them), BR-O1). Carts join live prices; orders copy them at checkout. A menu edit can never change what a customer was charged.

3. **One state machine, one transition function** ([§7.3](master-sdd.md#73-order-state-machine)). Ten legal transitions, each with named actors and guards. Every other transition is a tested 409. Every change is row-locked and audited.

4. **The database arbitrates concurrency.** Partial unique indexes and `SELECT … FOR UPDATE`, never check-then-act. One active cart, one accepted assignment per driver, one review per order — all schema invariants.

5. **Role guard plus ownership check, always both** ([ADR-010](architecture/security.md#adr-010-404-over-403-for-cross-tenant-resources)). Ownership is filtered in SQL, not after the fetch, and a cross-tenant miss is a 404 rather than a 403.

---

## Where this SDD departs from the brief

Four deliberate changes, each argued in place:

| Change | Why |
|--------|-----|
| **Added a Platform Foundation spec**; merged Authentication with User Management | The error envelope, validation pipeline and test harness needed an owner, otherwise the first four modules would each invent one. Auth and user management share a table and a module, so they share a spec. |
| **Error envelope nests under `error`**, and `errors` became `details` | A client branches once on `success` and then reads one object; `meta` stays uniform across success and failure; `details` also carries non-validation context. ([§14](master-sdd.md#14-error-handling)) |
| **No separate `REJECTED` order state** | Nothing treats a rejected order differently from a cancelled one. `cancelled_by` plus `cancellation_reason` capture the distinction that actually matters. ([ADR-007](architecture/system-architecture.md#adr-007-single-cancelled-terminal-state)) |
| **Added refresh tokens**, beyond plain JWT | Without revocable sessions, "suspend this account" could not take effect until the token expired — FR-9.3 would be a lie. ([ADR-004](architecture/security.md#adr-004-short-access-token-plus-revocable-refresh-token)) |

State transitions are also modelled as action endpoints
(`POST .../accept`) rather than a status PATCH, so each carries its own guard and
payload rules ([ADR-011](architecture/api-design.md#adr-011-action-endpoints-for-state-transitions)).

---

## Consistency check

Verified before sign-off:

- ✅ Exactly 10 specs, numbered `spec-01`–`spec-10`, no gaps or duplicates.
- ✅ Exactly 10 stories, numbered `story-01`–`story-10`, no gaps or duplicates.
- ✅ Every spec is implemented by ≥1 story; every story cites ≥1 spec ([coverage matrix](dependency-map.md#1-coverage-matrix)).
- ✅ Every story has Gherkin acceptance criteria.
- ✅ All 10 order transitions define actors and guards; illegal transitions are enumerated and tested.
- ✅ All four roles have a documented permission set ([§4.5](master-sdd.md#45-actor--capability-matrix)).
- ✅ Every API endpoint maps to database entities that exist in [database-design.md](architecture/database-design.md).
- ✅ Every frontend screen maps to endpoints that exist in [api-design.md](architecture/api-design.md).
- ✅ Validation, error codes and security controls are defined per area and cross-referenced.
- ✅ Every business rule ID (`BR-*`) is cited by at least one test requirement.
- ✅ Assumptions and non-goals are documented with rationale.
- ✅ The dependency graph is acyclic; the two apparent cycles (restaurants↔admin approval, drivers↔admin provisioning) are resolved by slicing, and the resolution is recorded in the owning stories.

---

## Next step

Begin [implementation-plan.md](implementation-plan.md) **Phase 1, Task 1.1**.
Nothing in Phase N+1 starts until Phase N's exit criteria are green.
