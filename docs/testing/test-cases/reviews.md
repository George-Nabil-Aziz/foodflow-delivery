# Test Cases — Reviews & Ratings (TC-255 – TC-276)

> Covers [spec-09](../../sdd/specs/spec-09-reviews-ratings.md) ·
> [story-09](../../sdd/stories/story-09-reviews-ratings.md) ·
> FR-8.1 – FR-8.7 · BR-V1 – BR-V9

**Priority rationale.** Aggregate correctness is Critical — `rating_average`
drives discovery ranking, and a drifting aggregate silently misrepresents every
restaurant on the platform. PII in public payloads is Critical. Review CRUD
itself is High.

---

## Eligibility

### TC-255 — Customer reviews a delivered order
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-01 · **Rules** FR-8.1, BR-V5
**Type** API · **Priority** High
**Data** `ORDER_DELIVERED`
**Steps** 1. `POST /api/reviews` `{ orderId, restaurantRating: 5, driverRating: 4, comment: "Fast and hot." }`.
**Expected** 201; the review is created; the response carries `editableUntil` (created + 24 h) and the **updated** restaurant aggregate, so the UI can reflect the contribution without a second request.
**Post** `restaurants.rating_average` and `rating_count` recomputed in the same transaction.

### TC-256 — A non-delivered order is not reviewable
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-02 · **Rules** BR-V1
**Type** API · **Priority** High
**Steps** 1. Review `ORDER_PENDING`, `ORDER_PREPARING`, `ORDER_OUT`.
**Expected** 422 `ORDER_NOT_REVIEWABLE` each, naming the current status; no review created.

### TC-257 — A cancelled order is never reviewable
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-03 · **Rules** BR-V1
**Type** API · **Priority** High
**Data** `ORDER_CANCELLED`
**Steps** 1. Review it.
**Expected** 422 `ORDER_NOT_REVIEWABLE`.

### TC-258 — One review per order
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-04 · **Rules** BR-V2
**Type** API · **Priority** High
**Data** `ORDER_REVIEWED`
**Steps** 1. Submit a second review for the same order.
**Expected** 409 `REVIEW_ALREADY_EXISTS`; still exactly one `reviews` row.

### TC-259 — Concurrent double-submit creates exactly one review
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-05 · **Rules** BR-V2, NFR-8
**Type** Service · **Priority** Critical
**Steps** 1. Fire two identical review submissions concurrently for one delivered order.
**Expected** Exactly one review exists; the loser receives 409.
**Post** The aggregate reflects **one** review, not two.
**Notes** Arbitrated by `uq_reviews_order`. Without it, a double-tap would inflate both the count and the average.

### TC-260 — Only the order's own customer may review it
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-06 · **Rules** BR-V2, ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_B`, review `ORDER_DELIVERED` (placed by `CUST_A`).
**Expected** 404 `RESOURCE_NOT_FOUND`; no review created.
**Notes** Stops review spam being attached to strangers' orders.

### TC-261 — A delivered order stays reviewable indefinitely
**Spec** spec-09 · **Story** story-09 · **AC** — · **Rules** BR-V9
**Type** Service · **Priority** Low
**Pre** A delivered order with `delivered_at` back-dated six months.
**Steps** 1. Submit a review.
**Expected** 201 — there is deliberately no deadline on the right to review.

---

## Ratings and validation

### TC-262 — Restaurant rating boundary values
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-18 · **Rules** BR-V3
**Type** API · **Priority** High
**Steps** 1. Submit `restaurantRating` of `0`, `1`, `5`, `6`, `3.5`, `"4"`, and omitted.
**Expected** 422 · 201 · 201 · 422 · 422 · 201 (coerced) · 422 (required).

### TC-263 — Driver rating requires a driver on the order
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-07 · **Rules** BR-V4
**Type** API · **Priority** High
**Data** `ORDER_DELIVERED_NO_DRIVER`
**Steps** 1. Review it with `driverRating: 4`.
**Expected** 422 with `details[].field = "driverRating"`; no review created.

### TC-264 — The database enforces the driver-rating rule
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-07 · **Rules** BR-V4
**Type** Service · **Priority** Medium
**Steps** 1. Direct insert with `driver_rating` set and `driver_user_id` null.
**Expected** Rejected by `chk_reviews_driver_rating`.

### TC-265 — Driver rating updates the driver's aggregate
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-08 · **Rules** BR-V5
**Type** Integration · **Priority** High
**Steps** 1. Review a delivered order with `driverRating: 4`. 2. Read `driver_profiles`.
**Expected** The driver's `rating_average` and `rating_count` are recomputed in the same transaction.

### TC-266 — Comment length boundaries
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-17 · **Rules** BR-V3
**Type** API · **Priority** Medium
**Steps** 1. Comments of 0, 1000 and 1001 characters.
**Expected** 201 (comment is optional) · 201 · 422 stating the actual length.

### TC-267 — Review omits no required traceability fields
**Spec** spec-09 · **Story** story-09 · **AC** — · **Rules** spec-09 data requirements
**Type** Service · **Priority** Medium
**Steps** 1. Create a review. 2. Read the row.
**Expected** `restaurant_id` and `driver_user_id` are copied from the order, not supplied by the client, and are immutable thereafter.

---

## Edit window

### TC-268 — Edit inside 24 hours succeeds and recomputes
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-09 · **Rules** BR-V6
**Type** Integration · **Priority** High
**Pre** `REVIEW_A` created 23 h ago.
**Steps** 1. `PATCH /api/reviews/{id}` changing the rating from 5 to 3.
**Expected** 200; the aggregate is recomputed **downward** to reflect the new value.

### TC-269 — Edit after 24 hours is refused
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-10 · **Rules** BR-V6
**Type** API · **Priority** High
**Data** `REVIEW_OLD` (created 25 h ago)
**Steps** 1. `PATCH /api/reviews/{id}`.
**Expected** 409 `REVIEW_EDIT_WINDOW_CLOSED` carrying `editableUntil`; the review is unchanged.

### TC-270 — Edit-window boundary
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-09, AC-09-10 · **Rules** BR-V6
**Type** Unit · **Priority** Medium
**Steps** 1. Evaluate editability at exactly 23 h 59 m 59 s and at 24 h 00 m 01 s with a controlled clock.
**Expected** Editable, then not.
**Notes** Uses a fake clock and back-dated rows; no test waits 24 hours.

### TC-271 — Another customer cannot edit a review
**Spec** spec-09 · **Story** story-09 · **AC** — · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_B`, `PATCH` a review authored by `CUST_A`.
**Expected** 404; the review is unchanged.

---

## Aggregates

### TC-272 — Aggregate arithmetic across a review set
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-11 · **Rules** BR-V5
**Type** Unit · **Priority** Critical
**Data** `REVIEW_SET_543`
**Steps** 1. Compute the aggregate for reviews of 5, 4 and 3. 2. For a single review of 4. 3. For zero reviews. 4. For 5, 4, 4 (average 4.333…).
**Expected** `4.00`/3 · `4.00`/1 · **`0.00`/0** · `4.33`/3 (half-up at two decimals).
**Notes** Zero reviews must give `0.00`/`0`, not null — and discovery must treat that as *unrated*, not as zero-star (see TC-128).

### TC-273 — Hiding a review lowers the aggregate and removes it from public view
**Spec** spec-09, spec-10 · **Story** story-09, story-10 · **AC** AC-09-12, AC-10-10 · **Rules** BR-V7
**Type** Integration · **Priority** Critical
**Pre** `REST_A` has reviews of 5, 4 and 3 (average 4.00, count 3).
**Steps** 1. As `ADMIN_A`, `POST /api/admin/reviews/{the 3-star}/hide` with a reason. 2. `GET /api/restaurants/{REST_A}/reviews`. 3. Read the restaurant aggregate.
**Expected** Average `4.50`, count `2`; the hidden review is absent from the public list; an audit row is written.

### TC-274 — Restoring a hidden review reverses both effects
**Spec** spec-09, spec-10 · **Story** story-09, story-10 · **AC** AC-09-13, AC-10-11 · **Rules** BR-V7
**Type** Integration · **Priority** Critical
**Steps** 1. Restore the review hidden in TC-273. 2. Re-read the list and the aggregate.
**Expected** Average back to `4.00`, count `3`; the review reappears.
**Notes** Recomputing from source rather than incrementing is what makes hide and restore exactly reversible.

### TC-275 — A restaurant whose only review is hidden returns to unrated
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-14 · **Rules** BR-V7, BR-D5.6
**Type** Integration · **Priority** High
**Steps** 1. Hide the single review. 2. Read the aggregate. 3. Sort the listing by rating.
**Expected** `0.00`/`0`; the restaurant sorts **last** as unrated, not as a zero-star venue.

---

## Public exposure

### TC-276 — Public review payloads carry no PII beyond a display name
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-15, AC-09-16 · **Rules** BR-V8, security §9
**Type** Security · **Priority** Critical
**Steps** 1. `GET /api/restaurants/{REST_A}/reviews` anonymously. 2. Serialize the body and search it. 3. Submit a review whose comment is `<script>alert(1)</script>` and re-fetch.
**Expected** Each author appears as `"Sara I."` — first name plus last initial. The body contains **no** email, phone, full surname or `customer_user_id`. The script comment is stored verbatim and returned as a plain string; rendering it in the UI produces literal text and executes nothing.
**Notes** Asserted against the **serialized body**, not the mapper, so a future field addition cannot slip past. A review comment is the largest piece of user-controlled text the system shows to strangers, which is why it is Critical rather than High.
