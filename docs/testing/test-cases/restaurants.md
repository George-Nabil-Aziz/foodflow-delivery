# Test Cases — Restaurant Management (TC-071 – TC-090, TC-416 – TC-417)

> Covers [spec-03](../../sdd/specs/spec-03-restaurant-profile-operations.md) ·
> [story-03](../../sdd/stories/story-03-restaurant-onboarding-menu-management.md) ·
> FR-2.1 – FR-2.8 · BR-R1 – BR-R4, BR-R9 – BR-R12

**Priority rationale.** Orderability is Critical — it is the single server-side
answer to "can a customer order right now?", and every cart and checkout path
depends on it. Profile editing is Medium; approval is High because it gates all
supply.

---

## Profile & ownership

### TC-071 — Owner retrieves their own restaurant profile
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-01 · **Rules** FR-2.1
**Type** API · **Priority** High
**Data** `OWNER_A`
**Steps** 1. `GET /api/restaurant/profile`.
**Expected** 200; `REST_A`'s data including `status`, `isOrderable`, `deliveryFee`, `minimumOrderAmount`; `rejectionReason` is null.

### TC-072 — Newly registered restaurant is PENDING_APPROVAL and invisible
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-01 · **Rules** FR-2.2, BR-R2
**Type** API · **Priority** High
**Steps** 1. Register a restaurant owner. 2. `GET /api/restaurant/profile`. 3. As an anonymous user, `GET /api/restaurants` and `GET /api/restaurants/{new}`.
**Expected** Step 2 → `status PENDING_APPROVAL`. Step 3 → absent from the list; direct fetch returns 404.

### TC-073 — Pending restaurant can edit profile and hours
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-02 · **Rules** FR-2.7
**Type** API · **Priority** High
**Data** `OWNER_PENDING`
**Steps** 1. `PATCH /api/restaurant/profile`. 2. `PUT /api/restaurant/hours` with `HOURS_FULL_WEEK`.
**Expected** Both 200 — a restaurant awaiting approval must be able to finish setting itself up.

### TC-074 — Owner updates profile fields
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** FR-2.3
**Type** API · **Priority** Medium
**Steps** 1. `PATCH /api/restaurant/profile` with name, description, cuisine, phone, images, fee, minimum, prep minutes.
**Expected** 200 with all values persisted.

### TC-075 — Changing the restaurant name does not change its slug
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** spec-03 data requirements
**Type** Service · **Priority** Medium
**Steps** 1. Note `REST_A`'s slug. 2. Rename the restaurant. 3. Re-read the profile.
**Expected** `name` changed, `slug` identical.
**Notes** A changing slug would break every shared link. Historical orders keep `restaurant_name_snapshot` independently.

### TC-076 — Slug collisions are suffixed
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** spec-03 data requirements
**Type** Unit · **Priority** Low
**Steps** 1. Generate slugs for three restaurants all named "Olive Grill".
**Expected** `olive-grill`, `olive-grill-2`, `olive-grill-3`; all unique.

### TC-077 — Invalid restaurant data is rejected
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** BR-R4, validation §15
**Type** API · **Priority** Medium
**Steps** 1. `PATCH` with `deliveryFee: "-1.00"`, then `minimumOrderAmount: "-5.00"`, then `avgPreparationMinutes: 4`, then `200`, then `cuisineType: "MARTIAN"`, then `name: "A"`.
**Expected** 422 each with the offending `details[].field`; no partial application.

---

## Opening hours

### TC-078 — Owner replaces the full week of opening hours
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** FR-2.4, BR-R10, ADR-014
**Type** API · **Priority** High
**Data** `HOURS_FULL_WEEK`
**Steps** 1. `PUT /api/restaurant/hours` with all seven days.
**Expected** 200; exactly seven `restaurant_hours` rows, one per `day_of_week`.

### TC-079 — Hours payload missing a day is rejected atomically
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-07 · **Rules** BR-R10
**Type** API · **Priority** High
**Data** `HOURS_MISSING_DAY`
**Steps** 1. Save a valid week. 2. `PUT` a payload with Wednesday absent.
**Expected** 422 naming the missing `dayOfWeek`.
**Post** **The previously saved week is unchanged** — the replacement is all-or-nothing.

### TC-080 — Duplicate day in the hours payload is rejected
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** BR-R10
**Type** API · **Priority** Medium
**Data** `HOURS_DUPLICATE_DAY`
**Steps** 1. `PUT` eight entries with Monday twice.
**Expected** 422.

### TC-081 — Overnight hours are rejected
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-08 · **Rules** BR-R11, A-09
**Type** API · **Priority** Medium
**Data** `HOURS_OVERNIGHT`
**Steps** 1. `PUT` a day with `opensAt 22:00`, `closesAt 02:00`.
**Expected** 422 explaining that overnight hours are not supported in this version.
**Notes** A documented limitation, not a defect. A late-night restaurant sets `closesAt 23:59`, accepting a one-minute gap at midnight.

### TC-082 — Equal open and close times are rejected
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** BR-R11
**Type** API · **Priority** Low
**Data** `HOURS_EQUAL`
**Steps** 1. `PUT` a day with `opensAt` = `closesAt` = `11:00`.
**Expected** 422 — a zero-length open window is meaningless.

### TC-083 — A closed day needs no times
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** FR-2.4
**Type** API · **Priority** Low
**Data** `HOURS_CLOSED_DAY`
**Steps** 1. `PUT` a week where Monday is `isClosed: true` with no times.
**Expected** 200; that day's `is_closed` is true.

---

## Orderability

### TC-084 — Orderability truth table
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-09 · **Rules** BR-R3, FR-2.6
**Type** Unit · **Priority** Critical
**Steps** 1. Evaluate `orderability(restaurant, hoursToday, now)` across every combination of `status ∈ {PENDING_APPROVAL, ACTIVE, SUSPENDED, REJECTED}` × `isAcceptingOrders ∈ {true, false}` × `inHours ∈ {true, false}` — 16 combinations.
**Expected** `isOrderable` is true **only** for `ACTIVE` + accepting + in-hours. Every other combination returns false with the specific reason `NOT_ACTIVE`, `NOT_ACCEPTING` or `CLOSED_NOW`, in that precedence.
**Notes** One pure function is the sole authority; duplicating the condition anywhere else is how a UI comes to offer an order the API then refuses.

### TC-085 — Orderability boundary minutes
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-09 · **Rules** BR-R3
**Type** Unit · **Priority** High
**Data** `HOURS_BOUNDARY` (12:00–14:00)
**Steps** 1. Evaluate at 11:59, 12:00, 13:59 and 14:00 with a controlled clock.
**Expected** 11:59 closed · 12:00 **open** · 13:59 open · 14:00 **closed**.
**Notes** Opening is inclusive, closing exclusive. Stated explicitly so the implementation cannot pick the other convention silently.

### TC-086 — Toggling accepting-orders changes orderability immediately
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-09 · **Rules** FR-2.5, BR-R3
**Type** API · **Priority** High
**Steps** 1. As `OWNER_A`, `PATCH /api/restaurant/accepting-orders` `{ isAcceptingOrders: false }`. 2. `GET /api/restaurants/{REST_A}` anonymously. 3. Attempt to add one of its items to a cart.
**Expected** `isOrderable` false with reason `NOT_ACCEPTING`; the cart add returns 422 `RESTAURANT_UNAVAILABLE`.

### TC-087 — Accepting-orders toggle requires an ACTIVE restaurant
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** FR-2.5
**Type** API · **Priority** Medium
**Steps** 1. As `OWNER_PENDING`, `PATCH /api/restaurant/accepting-orders`.
**Expected** 403 `RESTAURANT_NOT_APPROVED`.

---

## Approval lifecycle

### TC-088 — Admin approval makes a restaurant visible and orderable
**Spec** spec-03, spec-10 · **Story** story-03 · **AC** AC-03-04 · **Rules** FR-9.2, BR-R2
**Type** Integration · **Priority** High
**Pre** `REST_PENDING` has at least one available item.
**Steps** 1. As `ADMIN_A`, `POST /api/admin/restaurants/{REST_PENDING}/approve`. 2. Anonymously `GET /api/restaurants`.
**Expected** 200; status becomes `ACTIVE` with `approved_at` and `approved_by_user_id` set; the restaurant now appears in the public listing **within the same test**.
**Post** One `admin_audit_logs` row.

### TC-089 — Approving a restaurant with no available items is refused
**Spec** spec-10 · **Story** story-03 · **AC** AC-03-05 · **Rules** BR-AD10
**Type** API · **Priority** High
**Data** `REST_PENDING_EMPTY`
**Steps** 1. `POST /api/admin/restaurants/{REST_PENDING_EMPTY}/approve`.
**Expected** 422 explaining that a restaurant needs at least one available item.
**Post** Status unchanged; no audit row.
**Notes** Approving an empty restaurant would put a dead listing in front of customers.

### TC-090 — Rejection reason is surfaced to the owner
**Spec** spec-10 · **Story** story-03 · **AC** AC-03-06 · **Rules** BR-AD5
**Type** Integration · **Priority** High
**Steps** 1. As `ADMIN_A`, `POST /api/admin/restaurants/{REST_PENDING}/reject` `{ reason: "Address could not be verified" }`. 2. As `OWNER_PENDING`, `GET /api/restaurant/profile`.
**Expected** Status `REJECTED`; `rejectionReason` is exactly the submitted text; the profile remains editable so it can be resubmitted.
**Notes** Without the reason reaching the owner, they have no path to fixing the problem.

---

## Gap-closure cases (added during coverage analysis)

### TC-416 — An unapproved restaurant's order screens are disabled and refused
**Spec** spec-03, spec-07 · **Story** story-07 · **AC** AC-07-14 · **Rules** FR-2.7
**Type** Integration · **Priority** High
**Data** `OWNER_PENDING`
**Steps** 1. Log in and open the incoming-orders screen. 2. Call `GET /api/restaurant/orders` and `POST /api/restaurant/orders/:id/accept` directly.
**Expected** The screen renders a disabled state explaining that approval is pending; both API calls return 403 `RESTAURANT_NOT_APPROVED`.
**Notes** The UI state and the API guard are asserted together — either alone would leave the other free to drift.

### TC-417 — A new order appears in the queue within one polling interval
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-15 · **Rules** FR-6.5, frontend-architecture §5
**Type** Integration · **Priority** Medium
**Steps** 1. Open the restaurant's incoming-orders screen with a controlled clock. 2. Place an order from a customer session. 3. Advance the clock by one polling interval.
**Expected** The order appears without a manual refresh, with a visible and audible new-order cue; it is not duplicated on the following tick.
**Notes** Polling is the v1 transport; when WebSockets replace it (Future Enhancement 2) this case's expectation stands and only the mechanism changes.
