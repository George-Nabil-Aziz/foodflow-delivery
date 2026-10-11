# Test Cases — Order State Machine (TC-197 – TC-228)

> Covers [master-sdd §7.3](../../sdd/master-sdd.md#73-order-state-machine) ·
> [spec-07](../../sdd/specs/spec-07-order-placement-lifecycle.md) ·
> [story-06](../../sdd/stories/story-06-order-placement-customer-tracking.md),
> [story-07](../../sdd/stories/story-07-restaurant-order-processing.md),
> [story-08](../../sdd/stories/story-08-driver-onboarding-delivery-execution.md),
> [story-10](../../sdd/stories/story-10-platform-administration-reporting.md) ·
> G3 · NFR-8

**Priority rationale.** Every case here is **Critical**. An illegal transition
creates a state the rest of the system has no defined behaviour for — a
delivered-then-cancelled order has no correct answer for refunds, reviews or
statistics — and the corruption is permanent.

**Design note.** The negative cases are the feature. A state machine that
permits the ten legal transitions but also permits an eleventh is worse than
useless, so this file spends far more effort on what must be refused.

---

## 1. The authoritative transition table

Transcribed from [master-sdd §7.3](../../sdd/master-sdd.md#73-order-state-machine).
`orderStateMachine.js` and this table must agree; TC-197 asserts it.

| # | From | To | Permitted actors | Guard |
|---|------|----|------------------|-------|
| T1 | `PENDING` | `CONFIRMED` | RESTAURANT | Order belongs to the caller's restaurant |
| T2 | `PENDING` | `CANCELLED` | CUSTOMER, RESTAURANT, ADMIN, SYSTEM | Reason required for RESTAURANT/ADMIN |
| T3 | `CONFIRMED` | `PREPARING` | RESTAURANT | — |
| T4 | `CONFIRMED` | `CANCELLED` | CUSTOMER, RESTAURANT, ADMIN | Reason required for RESTAURANT/ADMIN |
| T5 | `PREPARING` | `READY_FOR_PICKUP` | RESTAURANT | — |
| T6 | `PREPARING` | `CANCELLED` | RESTAURANT, ADMIN | **Customer excluded** |
| T7 | `READY_FOR_PICKUP` | `OUT_FOR_DELIVERY` | DRIVER | An `ACCEPTED` assignment exists for this driver and order |
| T8 | `READY_FOR_PICKUP` | `CANCELLED` | ADMIN | Reason mandatory |
| T9 | `OUT_FOR_DELIVERY` | `DELIVERED` | DRIVER | Accepted assignee only |
| T10 | `OUT_FOR_DELIVERY` | `CANCELLED` | ADMIN | Reason mandatory |

**Terminal states:** `DELIVERED` and `CANCELLED` permit no outgoing transition
for any actor, including ADMIN.

---

## 2. The exhaustive matrix

### TC-197 — The implementation's transition table matches the SDD
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** G3
**Type** Unit · **Priority** Critical
**Steps** 1. Import `TRANSITIONS` from `orderStateMachine.js`. 2. Compare it against the table in §1 — every from-state, every to-state, every actor list.
**Expected** Exact equality: 10 edges, no more, no fewer, with identical actor sets.
**Notes** This is the anchor case. If the implementation grows an eleventh edge, this fails before any behavioural test has to catch it.

### TC-198 — All 245 status × status × role combinations are adjudicated correctly
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** G3, NFR-10
**Type** Unit · **Priority** Critical
**Steps** 1. For each `from` ∈ 7 statuses, `to` ∈ 7 statuses, `actor` ∈ {CUSTOMER, RESTAURANT, DRIVER, ADMIN, SYSTEM} — 245 combinations — call `assertTransition(from, to, { actorRole })`. 2. Compare the outcome against §1.
**Expected** Exactly the 16 actor-qualified edges in §1 succeed (T1–T10 expanded by permitted actor). **All 229 remaining combinations throw `ConflictError('INVALID_ORDER_TRANSITION')`.**
**Notes** Data-driven from the same table the implementation uses, so adding a transition automatically extends coverage. `orderStateMachine.js` must reach 100% branch coverage from this case alone.

### TC-199 — Self-transitions are refused for every status and actor
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** G3
**Type** Unit · **Priority** Critical
**Steps** 1. For each status, call `assertTransition(s, s, ...)` for all five actors.
**Expected** All 35 refused.
**Notes** Re-accepting an already-`CONFIRMED` order must be a 409, not a silent no-op — a no-op would let a double-click write a second status event.

### TC-200 — Terminal states permit no outgoing transition
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-15, AC-07-09 · **Rules** FR-6.7
**Type** Unit · **Priority** Critical
**Steps** 1. From `DELIVERED` and from `CANCELLED`, attempt every other status with every actor — 60 combinations.
**Expected** All refused, **including for ADMIN**.
**Notes** Admins get *more permitted transitions*, never a bypass of terminality.

### TC-201 — Status skipping is refused
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-06 · **Rules** G3
**Type** API · **Priority** Critical
**Steps** 1. `PENDING → PREPARING`. 2. `PENDING → READY_FOR_PICKUP`. 3. `PENDING → DELIVERED`. 4. `CONFIRMED → READY_FOR_PICKUP`. 5. `PREPARING → OUT_FOR_DELIVERY`. 6. `READY_FOR_PICKUP → DELIVERED`.
**Expected** 409 `INVALID_ORDER_TRANSITION` for each, by any actor.

### TC-202 — Backwards transitions are refused
**Spec** spec-07 · **Story** story-07 · **AC** — · **Rules** G3
**Type** API · **Priority** Critical
**Steps** 1. `CONFIRMED → PENDING`. 2. `PREPARING → CONFIRMED`. 3. `READY_FOR_PICKUP → PREPARING`. 4. `OUT_FOR_DELIVERY → READY_FOR_PICKUP`. 5. `DELIVERED → OUT_FOR_DELIVERY`.
**Expected** 409 each.

---

## 3. Legal transitions, end to end

### TC-203 — T1: restaurant accepts a PENDING order
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-01 · **Rules** T1, BR-D1
**Type** API · **Priority** Critical
**Steps** 1. As `OWNER_A`, `POST /api/restaurant/orders/{ORDER_PENDING}/accept`.
**Expected** 200; status `CONFIRMED`; `confirmed_at` stamped; `dispatch_state` becomes `UNASSIGNED`; a status event records `OWNER_A` as a RESTAURANT actor.

### TC-204 — T3: restaurant starts preparing
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-04 · **Rules** T3
**Type** API · **Priority** Critical
**Steps** 1. `POST /api/restaurant/orders/{ORDER_CONFIRMED}/start-preparing`.
**Expected** 200; status `PREPARING`; `preparing_at` stamped; event written.

### TC-205 — T5: restaurant marks ready
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-05 · **Rules** T5
**Type** API · **Priority** Critical
**Steps** 1. `POST /api/restaurant/orders/{ORDER_PREPARING}/ready`.
**Expected** 200; status `READY_FOR_PICKUP`; `ready_at` stamped.

### TC-206 — T7: assigned driver marks pick-up
**Spec** spec-07, spec-08 · **Story** story-08 · **AC** AC-08-13 · **Rules** T7, BR-D7
**Type** API · **Priority** Critical
**Data** `ORDER_READY_ASSIGNED`, `DRIVER_A`
**Steps** 1. `POST /api/driver/deliveries/{orderId}/pick-up`.
**Expected** 200; status `OUT_FOR_DELIVERY`; `picked_up_at` stamped.

### TC-207 — T9: assigned driver marks delivered
**Spec** spec-07, spec-08 · **Story** story-08 · **AC** AC-08-14 · **Rules** T9, BR-D8
**Type** Integration · **Priority** Critical
**Steps** 1. `POST /api/driver/deliveries/{ORDER_OUT}/deliver`.
**Expected** 200; status `DELIVERED`; `delivered_at` stamped; `dispatch_state` `COMPLETED`; the assignment closes; **the driver returns to `AVAILABLE`**; the order becomes reviewable.

### TC-208 — T2/T4: customer cancellation at both permitted points
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-12, AC-06-13 · **Rules** T2, T4
**Type** API · **Priority** Critical
**Steps** 1. Cancel a `PENDING` order. 2. Cancel a `CONFIRMED` order.
**Expected** Both 200 with `cancelled_by = CUSTOMER`.

### TC-209 — T2: restaurant rejects a PENDING order with a reason
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-02 · **Rules** T2, BR-O8
**Type** API · **Priority** Critical
**Steps** 1. `POST /api/restaurant/orders/{ORDER_PENDING}/reject` `{ reason: "OUT_OF_STOCK", note: "Grill is down" }`.
**Expected** 200; `CANCELLED`, `cancelled_by = RESTAURANT`, `cancellation_reason = OUT_OF_STOCK`; the customer's view shows "Rejected by restaurant" with that reason.
**Notes** There is no separate `REJECTED` state ([ADR-007](../../sdd/architecture/system-architecture.md#adr-007-single-cancelled-terminal-state)); rejection is presentation over `cancelled_by`.

### TC-210 — T4/T6: restaurant cancels from CONFIRMED and PREPARING
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-07, AC-07-11 · **Rules** T4, T6
**Type** API · **Priority** Critical
**Steps** 1. Cancel a `CONFIRMED` order with a reason. 2. Cancel a `PREPARING` order with `OUT_OF_STOCK`.
**Expected** Both 200 with restaurant attribution and the reason recorded.

### TC-211 — T8/T10: admin force-cancels late-stage orders
**Spec** spec-07, spec-10 · **Story** story-10 · **AC** AC-10-06 · **Rules** T8, T10, BR-AD6
**Type** Integration · **Priority** Critical
**Steps** 1. As `ADMIN_A`, force-cancel a `READY_FOR_PICKUP` order with a reason. 2. Force-cancel an `OUT_FOR_DELIVERY` order with a reason.
**Expected** Both 200; `cancelled_by = ADMIN`; the live assignment is cancelled and **the driver is released to `AVAILABLE`**; audit rows written.

---

## 4. Actor restrictions on otherwise-legal transitions

### TC-212 — Customer cannot perform restaurant transitions
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** §7.3
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_A` (owner of the order), attempt `CONFIRMED`, `PREPARING` and `READY_FOR_PICKUP`.
**Expected** 403 `FORBIDDEN_ROLE` at the router; status unchanged.

### TC-213 — Customer cannot cancel at PREPARING even though the edge exists
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-14 · **Rules** T6
**Type** API · **Priority** Critical
**Steps** 1. As the owning customer, cancel a `PREPARING` order.
**Expected** 409 `INVALID_ORDER_TRANSITION`.
**Notes** `PREPARING → CANCELLED` **is** a legal edge — but only for RESTAURANT and ADMIN. This is the case that proves the actor list is enforced, not just the edge.

### TC-214 — Restaurant cannot perform driver transitions
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-08 · **Rules** T7, T9
**Type** Security · **Priority** Critical
**Steps** 1. As `OWNER_A`, attempt to move a `READY_FOR_PICKUP` order to `OUT_FOR_DELIVERY`, and an `OUT_FOR_DELIVERY` order to `DELIVERED`.
**Expected** 403 or 409; status unchanged — the order is the driver's responsibility from pick-up onward.

### TC-215 — Driver cannot perform restaurant transitions
**Spec** spec-07 · **Story** story-08 · **AC** — · **Rules** §7.3
**Type** Security · **Priority** Critical
**Steps** 1. As `DRIVER_A`, attempt accept, start-preparing and ready.
**Expected** 403 `FORBIDDEN_ROLE`.

### TC-216 — Driver cannot act on an order they were not assigned
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-15 · **Rules** BR-D5, ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `DRIVER_B`, pick up and deliver an order assigned to `DRIVER_BUSY`.
**Expected** 404 both times; status unchanged.

### TC-217 — Driver cannot pick up before the order is ready
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-12 · **Rules** BR-D7
**Type** API · **Priority** Critical
**Steps** 1. With an accepted assignment on a `PREPARING` order, `POST .../pick-up`.
**Expected** 409 `INVALID_ORDER_TRANSITION` naming the current status.
**Notes** The assignment is valid; the order state is not. Both guards must hold.

### TC-218 — Driver cannot deliver before pick-up
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** T9
**Type** API · **Priority** Critical
**Steps** 1. On a `READY_FOR_PICKUP` order with an accepted assignment, `POST .../deliver`.
**Expected** 409 `INVALID_ORDER_TRANSITION`.

### TC-219 — Restaurant cannot act on another restaurant's order
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-10 · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `OWNER_A`, accept `ORDER_B_FOREIGN`.
**Expected** 404; order unchanged.

---

## 5. Guards, attribution and concurrency

### TC-220 — Reason is mandatory for restaurant and admin cancellations
**Spec** spec-07 · **Story** story-07, story-10 · **AC** AC-07-03, AC-10-08 · **Rules** BR-O8
**Type** API · **Priority** High
**Steps** 1. Restaurant reject with no `reason`. 2. Admin force-cancel with no `reason`. 3. Reason `""`. 4. Reason `"NOT_A_REASON"`.
**Expected** 422 each; order unchanged.

### TC-221 — Customer cancellation defaults its reason
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** BR-O8
**Type** API · **Priority** Medium
**Steps** 1. Cancel with no `reason`.
**Expected** 200; `cancellation_reason = CUSTOMER_CHANGED_MIND`.

### TC-222 — The database refuses a cancellation without attribution
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** BR-O8
**Type** Service · **Priority** Critical
**Steps** 1. Direct update setting `status = 'CANCELLED'` with null `cancelled_by`.
**Expected** Rejected by `chk_orders_cancel_fields`.

### TC-223 — Every transition writes exactly one status event
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** FR-6.4, G3
**Type** Service · **Priority** Critical
**Steps** 1. Drive one order through `PENDING → CONFIRMED → PREPARING → READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED`. 2. Read `order_status_events`.
**Expected** Six rows (including the creation event), each with correct `from_status`, `to_status`, `actor_user_id`, `actor_role` and ascending `created_at`.

### TC-224 — SYSTEM transitions record a null actor
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-18 · **Rules** FR-6.4
**Type** Service · **Priority** High
**Steps** 1. Run the timeout job against `ORDER_PENDING_STALE`. 2. Read the event row.
**Expected** `actor_role = 'SYSTEM'`, `actor_user_id` null, `reason = ACCEPT_TIMEOUT`.

### TC-225 — Concurrent transitions are serialized by the row lock
**Spec** spec-07 · **Story** story-06, story-07 · **AC** AC-06-16, AC-07-12 · **Rules** BR-O9, NFR-8
**Type** Service · **Priority** Critical
**Steps** 1. Fire a customer cancel and a restaurant accept against the same `PENDING` order concurrently.
**Expected** Exactly one succeeds with 200; the other receives 409 `INVALID_ORDER_TRANSITION` reflecting the **new** status. The final state is one of `CONFIRMED` or `CANCELLED` — never both, never an inconsistent pair of events.
**Notes** Asserts "exactly one succeeded" rather than which one, so the case is deterministic despite the race.

### TC-226 — Two staff accepting the same order produce one transition
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-12 · **Rules** BR-O9, NFR-8
**Type** Service · **Priority** Critical
**Steps** 1. Fire two `accept` requests for one order concurrently.
**Expected** One 200, one 409; exactly one `CONFIRMED` status event; `dispatch_state` set once.

### TC-227 — Transitions fire the correct side effects
**Spec** spec-07 · **Story** story-07, story-08 · **AC** — · **Rules** spec-07 `onTransition`
**Type** Service · **Priority** Critical
**Steps** 1. Assert for each transition: `CONFIRMED` → dispatch requested and `confirmed_at` set; `PREPARING`/`READY_FOR_PICKUP`/`OUT_FOR_DELIVERY` → the matching timestamp; `DELIVERED` → `delivered_at`, `dispatch_state = COMPLETED`, driver released; `CANCELLED` → `cancelled_at`, attribution, live assignment cancelled, driver released if one was assigned.
**Expected** Each side effect occurs exactly once, inside the same transaction as the status change.

### TC-228 — A suspended restaurant can still complete in-flight orders
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-13 · **Rules** BR-R9, BR-AD3
**Type** Integration · **Priority** High
**Steps** 1. With an order in `PREPARING`, have an admin suspend the restaurant. 2. As the owner, mark the order ready.
**Expected** Step 2 succeeds — suspension stops *new* orders; it does not strand food already being cooked. New checkouts against that restaurant return 422 `RESTAURANT_UNAVAILABLE`.
