# Test Cases — Delivery & Drivers (TC-229 – TC-254)

> Covers [spec-08](../../sdd/specs/spec-08-delivery-assignment-driver-operations.md) ·
> [story-08](../../sdd/stories/story-08-driver-onboarding-delivery-execution.md) ·
> FR-7.1 – FR-7.9 · BR-D1 – BR-D12 · [ADR-006](../../sdd/architecture/security.md#adr-006-drivers-are-admin-provisioned)

**Priority rationale.** Two things here are Critical: the **offer-acceptance
race** (two drivers, one order — arbitrated by a partial unique index, not by a
service check) and **FR-7.4**, that a missing driver never destroys an order.
PII disclosure to drivers is Critical because a driver receives a stranger's
home address.

---

## Provisioning and profile

### TC-229 — Admin creates a driver account with a one-time password
**Spec** spec-10 · **Story** story-08 · **AC** AC-08-01 · **Rules** FR-9.7, BR-AD8, ADR-006
**Type** API · **Priority** High
**Steps** 1. As `ADMIN_A`, `POST /api/admin/drivers` with email, name, phone, vehicle type and plate. 2. Re-read the driver via `GET /api/admin/drivers/{id}` and `GET /api/admin/users/{id}`.
**Expected** 201 with `user.role = DRIVER`, `driverProfile.status = PENDING_APPROVAL`, `availability = OFFLINE`, and `initialPassword` present. Step 2 returns **no** `initialPassword` — it is shown exactly once.
**Post** The returned password authenticates at `POST /api/auth/login`; an audit row is written.

### TC-230 — Driver self-registration is impossible
**Spec** spec-02 · **Story** story-08 · **AC** — · **Rules** BR-A3, ADR-006
**Type** Security · **Priority** Critical
**Steps** 1. `POST /api/auth/register` with `role: "DRIVER"`. 2. As `DRIVER_A`, `POST /api/admin/drivers`.
**Expected** 403 `FORBIDDEN_ROLE` both times; no account created.
**Notes** A driver receives a stranger's home address and phone. Self-service registration would put that data one signup form away from anyone.

### TC-231 — A PENDING_APPROVAL driver is inert
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-02 · **Rules** BR-D2
**Type** API · **Priority** High
**Data** `DRIVER_PENDING`
**Steps** 1. Log in successfully. 2. `GET /api/driver/offers`. 3. `PATCH /api/driver/availability`. 4. Run the dispatch job with a confirmed order waiting.
**Expected** Login succeeds; steps 2–3 return 403 `ACCOUNT_SUSPENDED`; step 4 creates **no** offer for this driver.

### TC-232 — Admin approval activates the driver
**Spec** spec-10 · **Story** story-08 · **AC** AC-08-03 · **Rules** FR-9.2
**Type** Integration · **Priority** High
**Steps** 1. `POST /api/admin/drivers/{DRIVER_PENDING}/approve`. 2. As that driver, set availability `AVAILABLE`. 3. Run dispatch.
**Expected** Profile `ACTIVE`; availability accepted; the driver now receives offers. An audit row is written.

### TC-233 — Driver updates vehicle details
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** FR-7.7
**Type** API · **Priority** Medium
**Steps** 1. `PATCH /api/driver/profile` `{ vehicleType: "CAR", vehiclePlate: "XYZ 9876" }`. 2. Submit `vehicleType: "SPACESHIP"` and a 1-character plate.
**Expected** 200 then 422 each.

### TC-234 — Driver toggles availability
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** FR-7.7
**Type** API · **Priority** High
**Steps** 1. `PATCH /api/driver/availability` `{ availability: "AVAILABLE" }`, then `"OFFLINE"`.
**Expected** 200 both; the value persists and governs dispatch eligibility.

### TC-235 — Availability cannot be set to ON_DELIVERY by a client
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-11 · **Rules** FR-7.7
**Type** Security · **Priority** High
**Steps** 1. `PATCH /api/driver/availability` `{ availability: "ON_DELIVERY" }`.
**Expected** 422; availability unchanged.
**Notes** `ON_DELIVERY` is system-set. Accepting it would let a driver fabricate an assignment state and become invisible to dispatch while idle.

### TC-236 — Driver cannot go offline during an active delivery
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-10 · **Rules** BR-D9
**Type** API · **Priority** High
**Data** `DRIVER_BUSY`
**Steps** 1. `PATCH /api/driver/availability` `{ availability: "OFFLINE" }`.
**Expected** 409 `DRIVER_HAS_ACTIVE_DELIVERY` naming the order; availability stays `ON_DELIVERY`.

### TC-237 — Driver location updates are validated
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** validation §15
**Type** API · **Priority** Medium
**Steps** 1. `PATCH /api/driver/location` with valid coordinates. 2. `latitude: 91`. 3. `longitude: -181`. 4. Latitude only.
**Expected** 200 · 422 · 422 · 422 — the pair must be supplied together.

---

## Dispatch

### TC-238 — Dispatch begins when an order is confirmed
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-04 · **Rules** FR-7.1, BR-D1
**Type** Integration · **Priority** High
**Pre** `DRIVER_A` is ACTIVE and AVAILABLE.
**Steps** 1. Restaurant accepts a `PENDING` order. 2. Run `dispatchJob`.
**Expected** Exactly one `delivery_assignments` row, `OFFERED` to `DRIVER_A`, with `expires_at ≈ now + 90 s`; the order's `dispatch_state` becomes `OFFERED`.
**Notes** Dispatch at `CONFIRMED` rather than `READY_FOR_PICKUP` gives the driver the whole preparation window to travel.

### TC-239 — Only ACTIVE and AVAILABLE drivers are candidates
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** BR-D2
**Type** Service · **Priority** High
**Pre** `DRIVER_OFFLINE`, `DRIVER_PENDING`, `DRIVER_BUSY` and `DRIVER_A` all exist.
**Steps** 1. Run dispatch for a confirmed order.
**Expected** Only `DRIVER_A` receives an offer.

### TC-240 — Candidates are ranked by distance, with null locations last
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** BR-D3
**Type** Unit · **Priority** Medium
**Steps** 1. Rank drivers at 1 km, 5 km, and one with no coordinates. 2. Rank two drivers at identical distance with different idle times.
**Expected** 1 km → 5 km → no-location. The tie breaks to the longest-idle driver.

### TC-241 — Only one live offer exists per order
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** `uq_assignments_order_open`
**Type** Service · **Priority** High
**Steps** 1. Run `dispatchJob` twice in succession for the same order.
**Expected** Still exactly one `OFFERED` assignment — the second tick finds a live offer and does nothing.

### TC-242 — An expired offer is re-dispatched to a different driver
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-07 · **Rules** BR-D4, BR-D12
**Type** Integration · **Priority** High
**Data** `ASSIGN_EXPIRED`
**Steps** 1. Run `offerExpiryJob`. 2. Run `dispatchJob`.
**Expected** The expired assignment becomes `EXPIRED`; the new offer goes to a **different** driver, never to the one who let it expire.

### TC-243 — Accepting an expired offer is refused
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-07 · **Rules** BR-D4
**Type** API · **Priority** High
**Steps** 1. `POST /api/driver/offers/{ASSIGN_EXPIRED}/accept`.
**Expected** 409 `OFFER_NO_LONGER_AVAILABLE`; the assignment is marked `EXPIRED`; the order gains no driver.

### TC-244 — A declined offer is never re-offered to the same driver
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-08 · **Rules** BR-D10, BR-D12
**Type** Integration · **Priority** High
**Steps** 1. `DRIVER_A` calls `POST /api/driver/offers/{id}/decline`. 2. Run dispatch repeatedly with `DRIVER_A` the only available driver.
**Expected** The decline is recorded; **no further offer is made to `DRIVER_A` for that order**; the order stays `UNASSIGNED`.
**Notes** Without BR-D12 the nearest driver who declines is also the nearest on retry — an infinite loop.

---

## Acceptance — the concurrency-critical path

### TC-245 — Accepting an offer assigns the driver
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-05 · **Rules** BR-D6
**Type** API · **Priority** Critical
**Steps** 1. `POST /api/driver/offers/{ASSIGN_OFFERED}/accept`.
**Expected** 200; assignment `ACCEPTED` with `responded_at`; `orders.driver_user_id` set; `dispatch_state = ASSIGNED`; driver availability `ON_DELIVERY`.

### TC-246 — Two drivers accepting the same offer: exactly one wins
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-06 · **Rules** BR-D5, NFR-8
**Type** Service · **Priority** Critical
**Steps** 1. Offer the same order to two drivers. 2. Fire both accepts concurrently.
**Expected** Exactly one `ACCEPTED` assignment for the order; the loser receives 409 `OFFER_NO_LONGER_AVAILABLE`; the order has exactly one `driver_user_id`; only the winner is `ON_DELIVERY`.
**Notes** Arbitrated by `uq_assignments_order_accepted` — the insert is allowed to fail and the `23505` is translated. A check-then-insert would let both through.

### TC-247 — A driver cannot hold two accepted deliveries
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-09 · **Rules** BR-D5
**Type** API · **Priority** Critical
**Data** `DRIVER_BUSY` with `ASSIGN_BUSY`
**Steps** 1. Offer a second order to `DRIVER_BUSY`. 2. Accept it.
**Expected** 409 `DRIVER_HAS_ACTIVE_DELIVERY`; the second order keeps no driver.
**Notes** Enforced by `uq_assignments_driver_active`.

### TC-248 — A driver on a delivery receives no new offers
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** BR-D2, BR-D5
**Type** Integration · **Priority** High
**Steps** 1. With `DRIVER_BUSY` the only ACTIVE driver, confirm another order and run dispatch.
**Expected** No offer is created; the order stays `UNASSIGNED`.

---

## The no-driver case

### TC-249 — With no drivers available the order is never cancelled
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-18 · **Rules** FR-7.4
**Type** Integration · **Priority** Critical
**Pre** No driver is ACTIVE and AVAILABLE.
**Steps** 1. Confirm an order and progress it to `READY_FOR_PICKUP`. 2. Run `dispatchJob` repeatedly.
**Expected** The order keeps its status; `dispatch_state` stays `UNASSIGNED`; **it is never cancelled and its status is never altered by dispatch**; the customer's status endpoint reports `UNASSIGNED` so the UI shows "finding a driver".
**Notes** Cancelling a cooked, paid-for order over a supply problem the customer cannot influence is the wrong answer. This case is the guard on that temptation.

### TC-250 — An order unassigned past 15 minutes escalates to the admin backlog
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-18 · **Rules** FR-7.4
**Type** Integration · **Priority** High
**Data** `ORDER_UNASSIGNED_STALE` (`confirmed_at` back-dated 16 minutes)
**Steps** 1. Run `unassignedEscalationJob`. 2. As `ADMIN_A`, `GET /api/admin/orders/unassigned`.
**Expected** The order appears in the backlog; an order unassigned for 5 minutes does not.

### TC-251 — A driver coming online picks up a waiting order
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** FR-7.4
**Type** Integration · **Priority** High
**Steps** 1. Leave an order `UNASSIGNED` with no drivers. 2. Bring `DRIVER_A` online as `AVAILABLE`. 3. Run dispatch.
**Expected** An offer is created for the waiting order — dispatch resumes automatically without manual intervention.

---

## Delivery execution and data exposure

### TC-252 — Offers disclose distance and district but not the full address
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-16 · **Rules** BR-D11, security §9
**Type** Security · **Priority** Critical
**Steps** 1. `GET /api/driver/offers` with a live offer. 2. Serialize the body.
**Expected** `distanceKm`, restaurant name and address, and the drop-off **district and city only**. **No** customer street address, no customer name, no phone, no email.
**Notes** A driver deciding whether to take a job needs the distance, not a stranger's street number.

### TC-253 — An accepted delivery discloses what the driver needs and nothing more
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-17 · **Rules** BR-D11, security §9
**Type** Security · **Priority** Critical
**Steps** 1. Accept an offer. 2. `GET /api/driver/deliveries/{orderId}`. 3. Serialize the body.
**Expected** Full delivery address, customer **first name**, **masked** phone, item list for verification. **No customer email**, no other orders, no order-payment history.
**Notes** The mask is applied server-side; a client-side mask is a picture of privacy rather than privacy.

### TC-254 — Delivery history is scoped and complete
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** FR-7.8
**Type** API · **Priority** Medium
**Steps** 1. `GET /api/driver/deliveries?scope=history` as `DRIVER_A`. 2. As `DRIVER_B`.
**Expected** Each driver sees only their own completed deliveries, paginated, with date, restaurant, district and rating received; neither sees the other's.
