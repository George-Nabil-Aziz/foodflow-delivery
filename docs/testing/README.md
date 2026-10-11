# FoodFlow — Testing Documentation

> **424 test cases** traced to **165 acceptance criteria**, **84 business
> rules**, **91 API endpoints** and **245 order state transitions**, derived
> entirely from the existing [SDD](../sdd/).

**Source of truth:** [`../sdd/`](../sdd/). Where this documentation and the SDD
disagree, the SDD wins and the test case is corrected — tests validate the
requirements, they do not redefine them. Six documentation discrepancies were
found while writing these cases; all are recorded in
[coverage-analysis.md §10](coverage-analysis.md#10-findings) with resolutions
consistent with the existing design, and all are now **resolved** in the SDD.
**No requirement was changed.**

**What actually ran:** 610 backend and 43 frontend tests pass, and 312 of the
424 documented cases are named in an automated test. The results, the gaps and
the bugs these tests found are in [../VERIFICATION.md](../VERIFICATION.md).

---

## Start here

| If you want to… | Read |
|---|---|
| Understand how we test and why | [test-strategy.md](test-strategy.md) |
| Know what runs, where, and when | [test-plan.md](test-plan.md) |
| Find the case for a requirement | [test-matrix.md](test-matrix.md) |
| See what a criterion actually says | [acceptance-criteria-index.md](acceptance-criteria-index.md) |
| Write or run a case | [test-cases/](test-cases/) |
| Set up fixtures | [test-data.md](test-data.md) |
| Check coverage and gaps | [coverage-analysis.md](coverage-analysis.md) |
| Run a full user journey | [e2e-scenarios.md](e2e-scenarios.md) |

## Structure

```text
docs/testing/
├── README.md                      ← you are here
├── test-strategy.md               ← levels, techniques, priority model, regression policy
├── test-plan.md                   ← scope, environments, ID allocation, format, sign-off
├── acceptance-criteria-index.md   ← 165 ACs given stable IDs, generated from the stories
├── test-matrix.md                 ← full traceability, generated from the case files
├── test-data.md                   ← fixtures, boundary values, malicious inputs
├── e2e-scenarios.md               ← 14 journeys (TC-393 – TC-406)
├── coverage-analysis.md           ← coverage by dimension, findings, limitations
└── test-cases/
    ├── platform-foundation.md     TC-407–413, 419–424  13
    ├── authentication.md          TC-001 – TC-028      28
    ├── authorization.md           TC-029 – TC-054      26
    ├── users.md                   TC-055 – TC-070      16
    ├── restaurants.md             TC-071 – TC-090, +2  22
    ├── menu.md                    TC-091 – TC-114      24
    ├── discovery.md               TC-115 – TC-134, +2  22
    ├── cart.md                    TC-135 – TC-166      32
    ├── orders.md                  TC-167 – TC-196      30
    ├── order-state-machine.md     TC-197 – TC-228      32
    ├── delivery.md                TC-229 – TC-254      26
    ├── reviews.md                 TC-255 – TC-276      22
    ├── admin.md                   TC-277 – TC-300, +1  25
    ├── validation.md              TC-301 – TC-322      22
    ├── security.md                TC-323 – TC-346      24
    ├── edge-cases.md              TC-347 – TC-368      22
    └── frontend.md                TC-369 – TC-392      24
```

## Traceability

```text
Spec  →  Story  →  Acceptance Criterion  →  Test Case
```

Every case names its spec, story, acceptance criterion and the business rules it
verifies. **Numbering in each column is independent** — `TC-001` is not tied to
`spec-01` or `story-01`, and one story maps to many cases.

Acceptance criteria received stable IDs (`AC-<story>-<n>`) during this work,
because the stories carried Gherkin scenarios but no identifiers. The index is
generated from the stories, so it cannot drift from them.

## Coverage at a glance

| Dimension | Coverage |
|-----------|---------:|
| Specs (10) | 100% |
| Stories (10) | 100% |
| Acceptance criteria (165) | 100% |
| Business rules (84) | 100% |
| API endpoints (90) | 100% |
| Order state transitions (245) | 100% |
| Roles + anonymous (5) | 100% |

**By priority:** 168 Critical · 159 High · 82 Medium · 15 Low.
**By type:** 171 API · 85 Security · 57 Integration · 54 Service · 23 Unit ·
20 Component · 14 E2E · 1 A11y.
**Negative scenarios:** 210 of 424 (50%).

Priority is assigned from objective impact, not preference: **Critical** means a
failure causes financial loss, data corruption or unauthorized access and is
often silent. The reasoning per category is in
[test-strategy §6](test-strategy.md#6-priority-classification).

## The ten cases that matter most

If only ten could run, these:

| Case | What it proves |
|------|----------------|
| [TC-172](test-cases/orders.md) | Renaming, repricing and deleting a menu item leaves a placed order untouched — goal G2 |
| [TC-198](test-cases/order-state-machine.md) | All 245 transition combinations are adjudicated correctly |
| [TC-171](test-cases/orders.md) | Client-supplied prices are ignored; the server computes the total |
| [TC-140](test-cases/cart.md) | A rejected cross-restaurant add leaves the cart byte-identical |
| [TC-028](test-cases/authentication.md) | A token minted before suspension stops working immediately |
| [TC-246](test-cases/delivery.md) | Two drivers accepting one offer: exactly one wins |
| [TC-249](test-cases/delivery.md) | No driver available never cancels the order |
| [TC-183](test-cases/orders.md) | A failure mid-checkout leaves nothing behind |
| [TC-339](test-cases/security.md) | Cross-tenant resources are indistinguishable from missing ones |
| [TC-213](test-cases/order-state-machine.md) | A legal edge is still refused to the wrong actor |

## Running the suite

```bash
docker compose up -d                      # PostgreSQL 16
cd backend  && npm run test:unit          # ~5 s
cd backend  && npm run migrate:test && npm run test:integration   # ~60 s
cd frontend && npm run test               # ~20 s
npm run test:e2e                          # ~3 min, pre-merge
npm run test:coverage                     # enforces the floors
```

**Safety rail:** `tests/setup.js` aborts unless `DATABASE_URL` names a database
ending in `_test`. The suite truncates tables between tests, so this check is
what stands between a misconfigured `.env` and real data. No test ever runs
against production. See [test-plan §5](test-plan.md#5-environments).

## Conventions

- **Real PostgreSQL, never a mocked database.** The design pushes correctness into partial unique indexes, check constraints and row locks; a mock would pass while the real invariant was broken.
- **Every rejection asserts no side effect.** A refused request must leave the database exactly as it found it — the partially-applied write is more dangerous than the rejection.
- **Backend validation is tested through the API**, never through the UI. A rule proven only in the browser is not proven.
- **Behaviour, not markup.** No case asserts a CSS class or that a component merely renders.
- **Clocks are controlled, never waited on.** Offer expiry, accept timeouts and the 24-hour review window use fake timers or back-dated rows.
- **Concurrency cases assert "exactly one succeeded"**, not which one — deterministic despite the race.
- **Every fixed defect gets a regression case** carrying the defect ID in its Notes.

## Regenerating the derived documents

Two documents are generated and should be regenerated after editing cases or
stories, rather than hand-edited:

- `acceptance-criteria-index.md` — from the Gherkin blocks in `../sdd/stories/`.
- `test-matrix.md` — from the case files.

Editing a story's criteria shifts the numbering of the criteria below it, so
regenerate the index and re-check [coverage-analysis.md](coverage-analysis.md)
whenever a story changes.

## What this does not claim

The security cases verify that the controls the SDD specifies are implemented
and effective against the attacks they were designed for. **They do not
establish that FoodFlow is secure.** Not covered: cryptographic review,
infrastructure and network security, supply-chain compromise beyond `npm audit`,
and any attack class outside the documented threat model. Two weaknesses are
accepted and documented rather than tested away —
[R-08](../sdd/risks.md) (refresh tokens in `localStorage`) and
[R-09](../sdd/risks.md) (in-memory rate limiting). An independent security
review is recommended before any real launch.

Other known limitations — including the one timing-sensitive case and the
absence of load and penetration testing — are listed in
[coverage-analysis.md §11](coverage-analysis.md#11-known-limitations).
