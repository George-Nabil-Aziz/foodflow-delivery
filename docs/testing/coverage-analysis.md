# FoodFlow — Coverage Analysis

> Measured against [`../sdd/`](../sdd/) after writing all 430 test cases.
> Figures are derived from the case files, not estimated.

---

## 1. Headline

| Dimension | Covered | Total | Coverage |
|-----------|--------:|------:|---------:|
| Specs | 10 | 10 | **100%** |
| Stories | 10 | 10 | **100%** |
| Acceptance criteria | 165 | 165 | **100%** |
| Business rules (`BR-*`) | 84 | 84 | **100%** |
| API endpoints | 90 | 90 | **100%** |
| Order state transitions | 245 | 245 | **100%** |
| Roles (+ anonymous) | 5 | 5 | **100%** |

**430 test cases**, `TC-001` – `TC-430`, all IDs unique with no gaps.

---

## 2. Spec and story coverage

| Spec | Cases | | Story | Cases |
|------|------:|---|-------|------:|
| spec-01 Platform Foundation | 29 | | story-01 Walking Skeleton | 24 |
| spec-02 Identity & Authorization | 73 | | story-02 Customer Auth & Profile | 76 |
| spec-03 Restaurant Profile | 31 | | story-03 Restaurant & Menu | 60 |
| spec-04 Menu Management | 34 | | story-04 Discovery | 30 |
| spec-05 Discovery & Search | 27 | | story-05 Cart | 49 |
| spec-06 Cart | 50 | | story-06 Order Placement | 56 |
| spec-07 Orders & Lifecycle | 80 | | story-07 Restaurant Processing | 24 |
| spec-08 Delivery | 42 | | story-08 Driver & Delivery | 48 |
| spec-09 Reviews | 30 | | story-09 Reviews | 31 |
| spec-10 Administration | 48 | | story-10 Administration | 43 |

Counts exceed 430 in total because a case commonly traces to more than one spec
or story — which is the point of a vertical slice.

**Distribution sanity check.** spec-07 (orders) and spec-06 (cart) carry the
most cases, and spec-05 (discovery) the fewest relative to its size. That is the
intended shape: order and cart defects cost money and are silent, discovery
defects are visible and harmless. Coverage is weighted by consequence, not
spread evenly for tidiness.

---

## 3. Acceptance criteria — 165 / 165

Every criterion in [acceptance-criteria-index.md](acceptance-criteria-index.md)
maps to at least one case. Verified mechanically by extracting `AC-*` references
from the case files and differencing against the index.

| Story | ACs | Story | ACs |
|-------|----:|-------|----:|
| story-01 | 10 / 10 | story-06 | 20 / 20 |
| story-02 | 16 / 16 | story-07 | 16 / 16 |
| story-03 | 17 / 17 | story-08 | 19 / 19 |
| story-04 | 16 / 16 | story-09 | 18 / 18 |
| story-05 | 18 / 18 | story-10 | 15 / 15 |

**Eleven criteria initially had no case.** They were not explained away — cases
were written to close them:

| AC | Was missing | Now covered by |
|----|-------------|----------------|
| AC-01-01 | Fresh-clone setup | TC-407 |
| AC-01-02 | Health endpoint healthy | TC-408 |
| AC-01-03 | Health endpoint degraded | TC-409 |
| AC-01-04 | Correlation ID echo | TC-410 |
| AC-01-09 | Frontend 404 view | TC-411 |
| AC-04-13 | Inactive category hidden from public menu | TC-414 |
| AC-04-15 | Filter state restored from URL | TC-415 |
| AC-07-14 | Unapproved restaurant order screens | TC-416 |
| AC-07-15 | New order appears in the queue | TC-417 |
| AC-10-02 | Admin self-suspension | TC-280 (reference corrected) |
| AC-10-15 | Destructive-action confirmation dialog | TC-418 |

The story-01 cluster is the informative one: the foundation story was initially
under-tested because its criteria are infrastructural rather than user-facing,
which is exactly the kind of gap a traceability check exists to surface.

---

## 4. Business rules — 84 / 84

All `BR-*` identifiers defined in the master SDD and the specs are referenced by
at least one case's **Rules** field. Highest-density rules:

| Rule | Cases | Why so many |
|------|------:|-------------|
| BR-C3 restaurant mismatch | 7 | Both wrong implementations must be excluded (mix, wipe) plus the UI flow |
| BR-O1 order snapshots | 6 | Goal G2; tested at unit, service, API and E2E level |
| BR-D5 one delivery per driver | 5 | Concurrency plus the availability and suspension interactions |
| ADR-010 404-over-403 | 9 | Probed in every domain with an owned resource |
| BR-R3 orderability | 8 | Referenced by cart, checkout, discovery and the SQL/JS consistency check |

Two rules needed deliberate attention:

- **BR-F4** (every error code exists exactly once in the registry) is covered by the contract test inside TC-303 and the registry assertions in TC-338, rather than by a dedicated case — it is a property of the codebase, not a behaviour.
- **BR-M3** (a price change affects future orders but never existing ones) is covered jointly by TC-155 (live cart price), TC-172 (order unchanged) and TC-350 (the cross-over), since the rule is only meaningful as the conjunction of all three.

---

## 5. API endpoint coverage — 90 / 90

Every endpoint in [api-design.md](../sdd/architecture/api-design.md) and in the
spec route tables has at least one case. Endpoints also carry the **standard six
probes** from [test-strategy §5](test-strategy.md#5-the-standard-api-probe)
through the generated cases TC-029 (anonymous), TC-030 (wrong role) and TC-031
(router audit), so per-endpoint negative coverage is uniform without 540
hand-written cases.

| Domain | Endpoints | Primary cases |
|--------|----------:|---------------|
| `/auth` | 5 | TC-001 – TC-028 |
| `/me`, `/addresses` | 7 | TC-055 – TC-070 |
| `/restaurants` (public), `/search`, `/cuisines` | 6 | TC-115 – TC-134, TC-419 |
| `/restaurant` (owner) | 17 | TC-071 – TC-114, TC-416 – TC-417, TC-421, TC-423 |
| `/cart` | 5 | TC-135 – TC-166 |
| `/orders` | 5 | TC-167 – TC-196 |
| `/driver` | 11 | TC-229 – TC-254, TC-422 |
| `/reviews` | 4 | TC-255 – TC-276, TC-420 |
| `/admin` | 23 | TC-277 – TC-300, TC-418, TC-424 – TC-430 |
| `/health` | 1 | TC-408, TC-409 |

Six read endpoints initially had no dedicated case — `/api/cuisines`,
`/api/reviews/mine`, `/api/restaurant/reviews`, `/api/driver/reviews`,
`/api/restaurant/stats` and `/api/admin/audit-logs`. Cases TC-419 – TC-424 were
added to close them. This is the predictable blind spot: read endpoints that
return no money and change no state are the ones people forget.

---

## 6. Order state transition coverage — 245 / 245

TC-198 asserts **every** `from × to × role` combination — 7 statuses × 7 statuses
× 5 actors — against the §7.3 table: 16 actor-qualified edges permitted, 229
refused. TC-197 additionally asserts that the implementation's table *is* the SDD
table, so a new edge fails before any behavioural test has to catch it.

| Transition | Legal-path case | Illegal-actor case |
|---|---|---|
| T1 PENDING → CONFIRMED | TC-203 | TC-212, TC-215 |
| T2 PENDING → CANCELLED | TC-208, TC-209, TC-196 | TC-220 |
| T3 CONFIRMED → PREPARING | TC-204 | TC-212 |
| T4 CONFIRMED → CANCELLED | TC-208, TC-210 | TC-220 |
| T5 PREPARING → READY_FOR_PICKUP | TC-205 | TC-215 |
| T6 PREPARING → CANCELLED | TC-210 | **TC-213** (customer excluded) |
| T7 READY_FOR_PICKUP → OUT_FOR_DELIVERY | TC-206 | TC-214, TC-216, TC-217 |
| T8 READY_FOR_PICKUP → CANCELLED | TC-211 | TC-200 |
| T9 OUT_FOR_DELIVERY → DELIVERED | TC-207 | TC-214, TC-216, TC-218 |
| T10 OUT_FOR_DELIVERY → CANCELLED | TC-211 | TC-200 |

Plus the structural refusals: self-transitions (TC-199), terminal states
(TC-200), skips (TC-201) and backwards moves (TC-202).

**TC-213 is the case that earns its keep.** `PREPARING → CANCELLED` is a legal
edge — but only for RESTAURANT and ADMIN. An implementation that checked only
the edge and not the actor list would pass every other transition test and still
let customers cancel food already being cooked.

---

## 7. Role and authorization coverage

All four roles plus anonymous are covered in both directions — permitted and
refused.

| Boundary | Cases |
|----------|-------|
| Anonymous → every protected endpoint | TC-029 |
| Every role → every endpoint (generated matrix) | TC-030 |
| Default-deny router audit | TC-031 |
| Customer → admin / restaurant / driver | TC-032 – TC-035 |
| Customer → another customer's data | TC-036 – TC-039 |
| Restaurant → another restaurant | TC-040 – TC-043, TC-109, TC-219 |
| Restaurant → admin / driver / self-approval | TC-044, TC-045 |
| Driver → another driver | TC-047, TC-048, TC-216 |
| Driver → restaurant / admin / self-provisioning | TC-049, TC-050, TC-230 |
| Admin positive path | TC-053 |
| Admin self-protection | TC-054, TC-280 |

**39 cases** assert cross-tenant isolation specifically, and TC-339 sweeps every
domain to confirm a cross-tenant miss is indistinguishable from a genuine 404.

---

## 8. Negative and security coverage

**Negative scenarios: 210 of 424 cases (50%)** assert a rejection, a refusal or
an unchanged state, measured by scanning every **Expected** field for a 4xx
status, a refusal, or an explicit "unchanged" assertion. That ratio is deliberate — in this domain the interesting
behaviour is mostly what the system declines to do.

Roughly distributed as: authorization refusals (~39), business-rule refusals
across cart, checkout, reviews and delivery (~41), security probes (~24),
validation rejections (~22), edge-case refusals (~22), illegal state transitions
(~19) and concurrency losers (~11). These are indicative rather than exact,
because many cases assert more than one kind of refusal.

Security coverage maps to the [threat model](../sdd/architecture/security.md#1-threat-model):

| Threat | Cases |
|--------|-------|
| Credential stuffing | TC-018, TC-344 |
| Account enumeration | TC-014, TC-015, TC-339 |
| Token theft / forgery | TC-323 – TC-328 |
| Refresh replay | TC-022, TC-023 |
| IDOR / horizontal escalation | TC-036 – TC-048, TC-339 |
| Vertical escalation | TC-030 – TC-035, TC-044, TC-050 |
| Mass assignment | TC-009, TC-059, TC-301 |
| Price tampering | TC-170, TC-171 |
| Business-logic abuse | TC-195, TC-213, TC-247, TC-260 |
| SQL injection | TC-134, TC-329 – TC-331 |
| XSS | TC-332 – TC-334, TC-107 |
| Data exposure | TC-002, TC-057, TC-252, TC-253, TC-276, TC-335 – TC-337 |
| Denial of wallet/service | TC-119, TC-305, TC-344 |

**This does not constitute proof of security** — see [test-strategy §8](test-strategy.md#8-on-the-limits-of-security-testing).

---

## 9. E2E and cross-cutting

14 journey-level scenarios (TC-393 – TC-406) covering all four role journeys,
the seven highest-value business rules end to end, and one combined
responsive/accessibility pass across nine screens at three viewport widths.

Frontend behaviour: 24 cases (TC-369 – TC-392) plus TC-411, TC-415, TC-418 —
covering the HTTP layer, routing guards, forms, cart behaviour, order tracking
and the loading/empty/error state triad. None asserts that a component merely
renders.

---

## 10. Findings

Discrepancies found in the SDD while writing these tests. **Nothing was silently
changed.** Each is recorded with a resolution consistent with the existing
design, and the test cases follow the resolution.

### D-01 — `PUT /api/restaurant/categories/order` is missing from the API reference
**Where:** defined in [spec-04](../sdd/specs/spec-04-menu-management.md#api-requirements)
and used by [story-03](../sdd/stories/story-03-restaurant-onboarding-menu-management.md);
absent from [api-design.md §5](../sdd/architecture/api-design.md#5-restaurant-self-service--apirestaurant).
**Resolution:** the endpoint exists. The spec is the more detailed source and
master-sdd does not contradict it; the central reference table is incomplete.
**Action:** add the row to api-design.md §5. Tested by TC-099.
**Status: resolved during implementation** — the row is now in api-design.md §5.

### D-02 — `GET /api/restaurant/reviews` is missing from the API reference
**Where:** defined in [spec-09](../sdd/specs/spec-09-reviews-ratings.md#api-requirements);
absent from api-design.md §9.
**Resolution:** the endpoint exists. **Action:** add it to api-design.md §9.
Tested by TC-421.
**Status: resolved during implementation.**

### D-03 — `GET /api/driver/reviews` is missing from the API reference
**Where:** defined in spec-09; absent from api-design.md §8.
**Resolution:** as D-02. Tested by TC-422.
**Status: resolved during implementation** — added to api-design.md §8.

### D-04 — Behaviour of an in-flight order when the *customer* is suspended is unspecified
**Where:** BR-R9 and BR-AD3 state that suspending a *restaurant* leaves in-flight
orders running. No rule states the equivalent for a suspended customer.
**Resolution:** applied the same principle — the order completes, because the
food is cooked and the driver is en route; the suspended customer simply cannot
authenticate to watch it. This is consistent with BR-R9 and with the state
machine, which grants a suspended customer no transitions anyway.
**Action:** add an explicit rule to spec-10 or master-sdd §7.1. Tested by TC-359
with the assumption stated in the case.
**Status: resolved during implementation** — recorded as BR-R10 in master-sdd §7.1.

### D-05 — Opening-hours boundary inclusivity was not stated
**Where:** BR-R3 defines orderability as "now ∈ today's opening hours" without
saying whether the endpoints are inclusive.
**Resolution:** opening inclusive, closing exclusive — a restaurant closing at
14:00 is closed at 14:00. This matches the `closes_at > opens_at` constraint and
ordinary usage.
**Action:** state it in spec-03 BR-R3. Pinned by TC-085 so the implementation
cannot silently pick the other convention.
**Status: resolved during implementation** — BR-R3 in master-sdd §7.1 now states it,
and `restaurants/orderability.js` is the single implementation.

**No contradictions were found** between the SDD, specs, stories and acceptance
criteria on any business rule, state transition, permission or validation rule.
Five of the six findings are omissions in supporting documentation; D-06 is an
imprecise illustrative outcome in one acceptance criterion, not a conflict in
the state machine itself.

---

## 11. Known limitations

Stated rather than hidden. None is an unexplained gap.

| Limitation | Why | Mitigation |
|---|---|---|
| **TC-015 (login timing parity) may be flaky in CI** | Timing assertions are sensitive to noisy runners | Asserts on the median of 30 samples with a 50 ms tolerance; if it still flakes, move to the nightly suite rather than delete it |
| **TC-407 (fresh-clone setup) is not run per-push** | It takes minutes and needs a cold machine | Run once per phase on a clean CI runner |
| **Load and stress testing is out of scope** | Not justified at the assumed scale ([A-21](../sdd/assumptions.md)) | The NFR-5 benchmark script checks the p95 target on a 10k-order dataset |
| **Rate-limit cases assume one replica** | In-memory store ([R-09](../sdd/risks.md)) | Documented in TC-018 and TC-344; revisit with a Redis store |
| **No penetration testing** | Requires an independent specialist | Security cases verify implemented controls only; an external review is recommended before launch |
| **Accessibility is automated plus keyboard, not audited** | axe catches roughly a third of real issues | TC-406 adds a manual keyboard pass; a full audit is recommended before launch |
| **Notification content is not asserted beyond the call** | The transport is a stub by design | Asserted at the interface: right template, right payload |
| **Browser matrix is Playwright's three engines** | No legacy-browser requirement | Chromium, Firefox, WebKit |

---

## 12. Recommended additions once the system is built

Deferred deliberately — these need a running system or real data:

1. **Mutation testing** on `orderStateMachine.js` and `orderPricing.js`, to check the tests actually detect injected faults rather than merely executing the lines.
2. **Property-based testing** for `money` arithmetic and cart totals, which would explore rounding combinations no hand-written case will.
3. **Contract snapshot tests** on response shapes, to catch unintended payload changes.
4. **Soak testing** of the dispatch and expiry jobs over hours, to surface the drift and leak classes that a short run cannot.
5. **Chaos testing** of database failover during checkout, extending TC-368 from a single forced failure into a repeated one.

### D-06 — AC-06-16's illustrative outcome does not hold for that actor pair
**Where:** [story-06](../sdd/stories/story-06-order-placement-customer-tracking.md)
AC-06-16 states that when a customer cancels "at the same moment" the restaurant
accepts, "one succeeds and the other receives 409 showing the new status".

**What the implementation actually does:** the row lock serializes the two
requests correctly, but **both then succeed** — because `PENDING → CONFIRMED`
(T1, restaurant) followed by `CONFIRMED → CANCELLED` (T4, customer) are *both*
legal edges. The customer's cancellation window is still open at `CONFIRMED`.
A 409 arises only once the order reaches `PREPARING`.

**Resolution:** the state machine is correct and unchanged; the acceptance
criterion's illustrative outcome is imprecise. The real invariant — and what
TC-225 now asserts — is that the transitions are serialized, each recorded
transition is a legal edge, no status is applied twice, and no impossible state
results. The genuine one-wins-one-loses case is two actors attempting the *same*
edge, which TC-226 covers (two staff accepting: exactly one 200, one 409).

**Action:** reword AC-06-16 to describe serialization and history consistency
rather than a guaranteed 409, or change its example to two simultaneous accepts.
**Status: resolved during implementation** — the criterion in story-06 has been
reworded, TC-225 asserts serialization and history consistency, and TC-226 covers
the genuine one-wins-one-loses case.
