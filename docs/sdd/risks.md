# Risk Register

> Parent: [master-sdd.md](master-sdd.md)

Each risk states the failure mode in concrete terms, the design decision that
addresses it, and the test that proves the mitigation works. A mitigation
without a test is a hope, so every row names one.

**Scoring:** Likelihood and Impact are Low / Medium / High. Priority is the
combination, weighted toward impact — a rare event that corrupts money outranks
a frequent one that annoys.

---

## Critical

### R-01 — Order state-machine races under concurrent actors
**Likelihood:** High · **Impact:** High · **Priority:** P0

Four actor types can act on one order. A customer cancelling at the moment a
restaurant accepts, two staff accounts accepting the same order, or an admin
force-cancelling while a driver marks delivered, could produce an order in an
impossible state — cancelled and out for delivery at once — or lose a
transition entirely.

**Mitigation.** Every transition runs inside a transaction that begins with
`SELECT … FOR UPDATE` on the order row (BR-O9), so concurrent attempts serialize
and the loser re-reads the new status and fails the state check. There is
exactly one function that changes an order's status
([backend-architecture §2](architecture/backend-architecture.md#2-layer-contract)),
so there is no second path to forget the lock. Driver acceptance is additionally
arbitrated by partial unique indexes rather than by a check-then-insert.

**Proven by.** `concurrency.integration`: two parallel accepts → one 200, one
409; two drivers accepting one offer → exactly one `ACCEPTED`; a double checkout
→ one order. Plus the 245-combination state-machine matrix.

**Residual.** Lock contention under heavy load on a single popular order —
acceptable at the assumed scale (A-21), and visible in the NFR-5 benchmark.

---

### R-02 — Price and menu drift corrupting historical orders
**Likelihood:** High · **Impact:** High · **Priority:** P0

Restaurants change prices and delete items constantly. If orders referenced live
menu rows, a customer's completed order would silently re-price itself, an
order's items would vanish when the restaurant tidied its menu, and every
revenue figure derived from history would be wrong — with no error anywhere to
signal it.

**Mitigation.** `order_items` snapshots `item_name_snapshot`,
`item_description_snapshot` and `unit_price` at checkout, and nothing reads
`food_items` for an order afterwards (BR-O1). `food_item_id` is
`ON DELETE SET NULL` (BR-O2), so deleting an item cannot cascade into order
history. The delivery fee, restaurant name and delivery address are snapshotted
too. `chk_orders_totals` means a wrong total cannot even be stored.

**Proven by.** The defining test in `checkout.integration`: place an order, then
rename the item, change its price and delete it — every field of the order is
identical and `food_item_id` is null. This is goal G2.

**Residual.** None material. The trade is disk space for correctness.

---

### R-03 — Cart/restaurant switch mishandled, losing customer work
**Likelihood:** Medium · **Impact:** High · **Priority:** P0

The obvious implementations are both wrong. Silently mixing restaurants produces
an order no kitchen can fulfil and no driver can collect. Silently clearing the
cart destroys work the customer never agreed to lose — and it is the kind of bug
that makes someone leave and not come back.

**Mitigation.** The conflict is a first-class outcome: `409
CART_RESTAURANT_MISMATCH` carrying both restaurant names and the current item
count, with the cart untouched (BR-C3). Switching requires an explicit
`?replace=true`, which clears and rebinds in one transaction (BR-C4). The UI
dialog defaults to "Keep my cart", so the destructive option requires a
deliberate choice.

**Proven by.** `cart.integration` asserts the cart is byte-identical after a
rejected cross-restaurant add; the frontend test asserts that dismissing the
dialog sends no request; the `cart-restaurant-switch` E2E scenario covers the
confirm path.

**Residual.** A customer who genuinely wants two restaurants in one order cannot
have it — a deliberate product decision, listed as Future Enhancement 12.

---

### R-04 — Authorization gaps between roles
**Likelihood:** Medium · **Impact:** High · **Priority:** P0

Four roles with overlapping endpoints invites both vertical escalation (a
customer calling an admin route) and horizontal escalation (a restaurant
accepting another restaurant's order, a driver delivering an unassigned one, a
customer reading someone else's order by UUID). A single missing check leaks
strangers' addresses and phone numbers.

**Mitigation.** Two independent layers, both required: a role guard declared in
the router, and an ownership predicate applied **in SQL** rather than after the
fetch, so a forgotten check is a missing row rather than a leaked one. Ownership
failures return 404, not 403, so UUID probing is not an enumeration oracle
(ADR-010). Restaurant- and driver-scoped routes never accept an entity ID at
all — it is derived from the token, removing the IDOR surface rather than
defending it.

**Proven by.** The generated `authorization.matrix` suite — every protected
route × {anonymous, CUSTOMER, RESTAURANT, DRIVER, ADMIN} → expected status — and
the **default-deny router audit test**, which fails CI when any new route omits
a guard.

**Residual.** A route added with a *wrong but present* guard would pass the audit
test. The matrix suite is what catches that, and it must be extended with every
new endpoint.

---

## High

### R-05 — Dispatch starvation leaving orders unassigned
**Likelihood:** Medium · **Impact:** Medium · **Priority:** P1

With few drivers online, a cooked order can sit at `READY_FOR_PICKUP`
indefinitely. The tempting fix — auto-cancelling — is worse: it destroys a
completed, unpaid-for meal over a supply problem the customer cannot influence.

**Mitigation.** The order is **never** auto-cancelled for lack of a driver
(FR-7.4). It keeps its status, is flagged `dispatch_state = UNASSIGNED`, and is
retried every 20 seconds. After 15 minutes it appears in the admin unassigned
backlog, where a human can intervene. The customer sees an honest "finding a
driver" state rather than a false ETA. Dispatch begins at `CONFIRMED` rather
than `READY_FOR_PICKUP` (BR-D1), giving the system the whole preparation window
to find someone.

**Proven by.** `delivery.integration`: with no eligible drivers, the order keeps
its status, nothing is cancelled, and it is escalated after 15 minutes. Plus the
`no-driver-available` E2E scenario.

**Residual.** An order can still sit for a long time. That is a marketplace
supply problem, not a software one, and making it visible to an operator is the
correct software response.

---

### R-06 — In-process jobs are a single point of failure
**Likelihood:** Medium · **Impact:** Medium · **Priority:** P1

Dispatch, offer expiry and order timeouts run on `setInterval` inside the API
process (ADR-003, A-14). If the process is down, offers do not expire and no
orders are dispatched. Multiple replicas would duplicate the work.

**Mitigation.** Every job is wrapped in `runLocked`, which takes a
`pg_try_advisory_lock`, so a second replica skips the tick rather than
duplicating it. Every job is idempotent and re-derives its state from the
database rather than from memory, so a missed tick is caught up by the next one
and nothing is lost by a restart. The job boundary is drawn so extraction to a
queue is mechanical (Future Enhancement 9).

**Proven by.** Job functions are exported and invoked directly in tests; a test
asserts that running a job twice produces the same result as running it once.

**Residual.** Real downtime pauses dispatch. Accepted at the assumed scale; the
migration path is documented.

---

### R-07 — Aggregate rating drift
**Likelihood:** Medium · **Impact:** Medium · **Priority:** P1

`rating_average` and `rating_count` drive discovery ranking. Maintained
incrementally, they would accumulate floating-point drift and would have no
correct answer for an edited or hidden review — leaving a restaurant's headline
number quietly wrong.

**Mitigation.** Aggregates are **recomputed from source** inside the same
transaction as the review write, never incremented (BR-V5). One implementation
(`ratingAggregator.js`) serves all three callers: create, edit, and admin
hide/restore. `NUMERIC` arithmetic in PostgreSQL, not floats in JS.

**Proven by.** `reviews.integration`: hiding a review lowers the aggregate and
restoring returns it exactly; a restaurant whose only review is hidden returns
to `0.00`/`0` rather than keeping a stale average.

**Residual.** Recomputation is O(reviews for one restaurant). At the assumed
scale this is trivial; the fix at scale is a materialized aggregate, not
arithmetic cleverness.

---

### R-08 — Refresh tokens in `localStorage` are XSS-reachable
**Likelihood:** Low · **Impact:** High · **Priority:** P1

A successful XSS would yield a 30-day refresh token rather than only a
15-minute access token.

**Mitigation.** Accepted trade, not an oversight (A-20). Mitigated by: 15-minute
access tokens; single-use refresh tokens with rotation and **reuse detection**,
so a stolen token used after the legitimate client rotates kills the whole
family and both sessions; suspension revoking all tokens; and the XSS surface
itself being narrow — Vue escapes by default and `v-html` appears nowhere,
notably not in review comments, the largest piece of user-controlled text shown
to strangers.

**Proven by.** The refresh-reuse family-revocation test; a frontend test
asserting no `v-html` in review rendering.

**Residual.** Real. **The recommendation for a production launch is to move
refresh tokens to an `httpOnly; SameSite=Strict; Secure` cookie and add CSRF
protection.** This is stated as a recommendation rather than a possibility.

---

### R-09 — In-memory rate limiting does not survive horizontal scaling
**Likelihood:** Low · **Impact:** Medium · **Priority:** P2

With N replicas, the effective limit becomes N× the configured one, weakening
brute-force protection on `/auth/login`.

**Mitigation.** Correct for the single-replica target (A-15). `express-rate-limit`
supports a Redis store as a drop-in, so the change is configuration rather than
code. bcrypt cost 12 means even a multiplied limit does not make credential
stuffing cheap.

**Proven by.** Integration tests assert the limiter trips at the configured
threshold on a single instance.

---

## Medium

### R-10 — Polling load
**Likelihood:** Medium · **Impact:** Low · **Priority:** P2

Every active customer, restaurant and driver polls on a 5–10 second interval.
At scale this is the dominant request volume.

**Mitigation.** The status endpoint returns a deliberately minimal payload;
polling pauses when the tab is hidden, stops at terminal statuses, and backs off
to 30 seconds after three consecutive failures. The polling composables are the
single seam where WebSockets replace polling (Future Enhancement 2).

**Proven by.** Composable unit tests for pause, stop and back-off.

### R-11 — Admin error or abuse
**Likelihood:** Low · **Impact:** Medium · **Priority:** P2

All admins are equal (A-13) and can suspend accounts and cancel orders. The
realistic failure is an admin acting on the wrong row, not acting maliciously.

**Mitigation.** Every mutation is audited in the same transaction as its effect,
so an unaudited change is impossible without deleting the code that writes it.
Reasons are mandatory. Destructive UI actions name their specific consequence —
"This will cancel order FF-20260922-4K9P2M and release the driver". Admins
cannot suspend themselves (BR-AD7), and the audit log is readable by other
admins, which is the only real check on the role in a single-tier model.

**Proven by.** A table-driven test asserting every mutating admin endpoint writes
exactly one audit row — so a new endpoint added without auditing fails CI.

### R-12 — Scope creep into the non-goals
**Likelihood:** Medium · **Impact:** Medium · **Priority:** P2

Payments, GPS tracking and WebSockets are each one conversation away from being
"just a small addition", and each would push the timeline well past the point
where the core journey works end to end.

**Mitigation.** The non-goals are enumerated with reasons and fallbacks
([master-sdd §3](master-sdd.md#3-non-goals)), and every one has a documented
seam — `payment_method` already exists, polling composables already isolate
transport, `NotificationService` already has the real interface. Adding any of
them later is additive rather than structural, which is the argument for not
adding them now.

### R-13 — Seed and test-data drift
**Likelihood:** Medium · **Impact:** Low · **Priority:** P3

As the schema grows, a stale seed script produces an application that looks
broken on first run and E2E scenarios that fail for the wrong reason.

**Mitigation.** The seed script is extended as part of each story's task list,
not afterwards, and the E2E suite runs against seeded data in CI — so a broken
seed fails the build rather than surprising the next developer.

### R-14 — Enum drift between PostgreSQL and JavaScript
**Likelihood:** Low · **Impact:** Medium · **Priority:** P3

Status values exist as native PostgreSQL enums and as JS constants. A value
added to one and not the other produces a runtime error at the database
boundary, in production, on an edge case.

**Mitigation.** `shared/constants.js` mirrors every enum, and a migration test
queries `enum_range` and asserts the two lists match exactly — written in
Task 1.4, before any domain table exists.

---

## Summary

| ID | Risk | L | I | Priority |
|----|------|---|---|----------|
| R-01 | Order state-machine races | H | H | P0 |
| R-02 | Price/menu drift corrupting history | H | H | P0 |
| R-03 | Cart switch losing customer work | M | H | P0 |
| R-04 | Authorization gaps between roles | M | H | P0 |
| R-05 | Dispatch starvation | M | M | P1 |
| R-06 | In-process jobs as a single point of failure | M | M | P1 |
| R-07 | Aggregate rating drift | M | M | P1 |
| R-08 | Refresh tokens in `localStorage` | L | H | P1 |
| R-09 | In-memory rate limiting | L | M | P2 |
| R-10 | Polling load | M | L | P2 |
| R-11 | Admin error or abuse | L | M | P2 |
| R-12 | Scope creep into non-goals | M | M | P2 |
| R-13 | Seed and test-data drift | M | L | P3 |
| R-14 | Enum drift between PG and JS | L | M | P3 |

The four P0 risks all concentrate in Phases 2–5 of
[implementation-plan.md](implementation-plan.md) — deliberately, because
discovering any of them is wrong in Phase 6 would mean reworking the data model
with real orders already in it.
