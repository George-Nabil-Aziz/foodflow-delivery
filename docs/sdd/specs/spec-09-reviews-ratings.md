# Spec 09 — Reviews & Ratings

**Status:** Approved · **Owner:** Trust · **Covers:** FR-8.1 – FR-8.5

## Objective

Let customers rate what they actually received, keep the aggregate ratings that
drive discovery accurate at all times, and give admins a way to remove abusive
content without corrupting those aggregates.

## Scope

**In scope**
- `reviews` table.
- Creating a review for a delivered order; the 24-hour edit window.
- Restaurant rating (required) and driver rating (optional).
- Aggregate maintenance on `restaurants` and `driver_profiles`.
- Public review listing with PII-safe author display.
- Admin hide/restore and its effect on aggregates.
- Review form, my-reviews, and the public review list.

**Out of scope** — restaurant replies (future enhancement), review voting,
photo uploads, automated abuse detection.

## Actors

- **CUSTOMER** — writes and edits their own reviews.
- **Public** — reads published reviews.
- **ADMIN** — hides and restores (endpoints in spec-10; the semantics here).
- **RESTAURANT / DRIVER** — read their own received reviews.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-8.1 | One review per delivered order, by that order's customer |
| FR-8.2 | `restaurantRating` 1–5 required; `driverRating` 1–5 optional and only when a driver delivered |
| FR-8.3 | Aggregates recomputed inside the review transaction |
| FR-8.4 | Editable by the author for 24 hours, then frozen |
| FR-8.5 | Admin-hidden reviews leave public lists and aggregates |
| FR-8.6 | Public payloads show the author as first name + last initial only |
| FR-8.7 | The customer's order detail shows a "Rate this order" action while reviewable and the submitted review afterwards |

## Business Rules

BR-V1 – BR-V8 from [master-sdd §7.7](../master-sdd.md#77-review-rules).

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-V1 | Only `DELIVERED` orders are reviewable | Service check → `422 ORDER_NOT_REVIEWABLE` |
| BR-V2 | One review per order, by its customer | `uq_reviews_order` + ownership check |
| BR-V3 | Restaurant rating required, 1–5 integer; comment ≤1000 | Zod + check constraint |
| BR-V4 | Driver rating only when the order has a driver | Service check + `chk_reviews_driver_rating` |
| BR-V5 | Aggregates recomputed in the same transaction | `ratingAggregator.js` |
| BR-V6 | 24-hour edit window from `created_at` | `409 REVIEW_EDIT_WINDOW_CLOSED` |
| BR-V7 | Hidden reviews are excluded from lists and aggregates | `status = HIDDEN` + recompute |
| BR-V8 | Public payloads carry no PII beyond `"Sara I."` | Public mapper |
| BR-V9 | There is no expiry on the right to review — a delivered order stays reviewable indefinitely | No time check on creation |

BR-V9 is a deliberate choice: a review window would mainly punish customers who
were busy, and a stale review is still real information about a real order.

### Aggregate recomputation

Recompute from the source rather than incrementing a running total:

```sql
UPDATE restaurants r SET
  rating_average = COALESCE((SELECT ROUND(AVG(restaurant_rating)::numeric, 2)
                             FROM reviews WHERE restaurant_id = r.id AND status = 'PUBLISHED'), 0),
  rating_count   = (SELECT COUNT(*) FROM reviews
                    WHERE restaurant_id = r.id AND status = 'PUBLISHED')
WHERE r.id = :restaurantId;
```

Incremental updates (`avg = (avg*n + new)/(n+1)`) accumulate floating-point drift
and have no way to handle an edit or a hide correctly. Recomputing is O(reviews
for one restaurant) on an indexed column, runs only on review writes, and is
always right. If it ever becomes a bottleneck the fix is a materialized
aggregate, not arithmetic cleverness.

The same statement shape maintains `driver_profiles`.

## Data Requirements

`reviews` per [database-design §4](../architecture/database-design.md#reviews).

Load-bearing:
- `uq_reviews_order UNIQUE (order_id)` — BR-V2 is a database invariant, so a double-submit is a 409 and not two reviews.
- `chk_reviews_driver_rating (driver_rating IS NULL OR driver_user_id IS NOT NULL)` — BR-V4.
- `idx_reviews_restaurant (restaurant_id, created_at DESC) WHERE status = 'PUBLISHED'` — the public list.
- `restaurants.rating_average/rating_count` and `driver_profiles.rating_average/rating_count` are written **only** by this spec's aggregator.

`restaurant_id` and `driver_user_id` are denormalized onto `reviews` from the
order. They are what the aggregate queries filter on, and copying them keeps the
recompute a single-table scan; they are immutable once written, so they cannot
drift from the order.

## API Requirements

| Method | Route | Auth | Role | Errors |
|--------|-------|------|------|--------|
| POST | `/api/reviews` | 🔓 | C | 422 `ORDER_NOT_REVIEWABLE`, 409 `REVIEW_ALREADY_EXISTS`, 404, 422 |
| GET | `/api/reviews/mine` | 🔓 | C +own | — |
| PATCH | `/api/reviews/:id` | 🔓 | C +own | 409 `REVIEW_EDIT_WINDOW_CLOSED`, 404, 422 |
| GET | `/api/restaurants/:id/reviews` | — | public | — |
| GET | `/api/restaurant/reviews` | 🔓 | R +own | Own received reviews |
| GET | `/api/driver/reviews` | 🔓 | D +own | Own received driver ratings |
| POST | `/api/admin/reviews/:id/hide` | 🔓 | A | spec-10 |
| POST | `/api/admin/reviews/:id/restore` | 🔓 | A | spec-10 |

```jsonc
// POST /api/reviews
{ "orderId": "…", "restaurantRating": 5, "driverRating": 4, "comment": "Fast and hot." }

// 201 data
{ "id": "…", "orderId": "…", "restaurantRating": 5, "driverRating": 4,
  "comment": "Fast and hot.", "createdAt": "…",
  "editableUntil": "2026-09-23T18:40:00Z",
  "restaurant": { "id": "…", "name": "Olive Grill",
                  "ratingAverage": "4.37", "ratingCount": 129 } }
```

Returning the updated aggregate lets the UI reflect the customer's contribution
immediately without a second request.

Public list item:
`{ id, restaurantRating, comment, createdAt, customer: { displayName: "Sara I." } }`.

## Frontend Requirements

- `ReviewForm` — an accessible `StarRating` (a radio group, arrow-key operable, with a text label per value — stars alone fail NFR-14), a driver rating section rendered **only** when the order had a driver, a comment textarea with a live character counter, and a clear "you can edit this for 24 hours" note.
- Entry points: a "Rate your order" prompt on `OrderDetailView` while reviewable, and a prompt card on `MyOrdersView` for unreviewed delivered orders.
- `customer/MyReviewsView` — the customer's reviews with an edit action that is visibly disabled with a reason once the window closes, rather than failing on submit.
- Public reviews on `RestaurantDetailView` — a rating summary (average, count, distribution bars) and a paginated list.
- `restaurant/DashboardView` shows the current average and recent reviews; `driver/DashboardView` shows the driver's average.

## Backend Requirements

Module `modules/reviews/` with `reviews.service.js`, `ratingAggregator.js`,
`reviews.repository.js`, `reviews.mapper.js`.

**Create flow:**
```text
BEGIN
  order = orders.getOrderForActor(orderId, customer)      → 404 if not theirs
  if order.status <> 'DELIVERED'                          → 422 ORDER_NOT_REVIEWABLE
  if driverRating != null and order.driverUserId is null  → 422 VALIDATION_ERROR (BR-V4)
  INSERT reviews (... restaurant_id and driver_user_id copied from the order)
      -- uq_reviews_order arbitrates a double submit → 409 REVIEW_ALREADY_EXISTS
  ratingAggregator.recomputeRestaurant(order.restaurantId, trx)
  if driverRating != null: ratingAggregator.recomputeDriver(order.driverUserId, trx)
COMMIT
```

`ratingAggregator` is also called by the admin hide/restore path in spec-10 — one
implementation, three callers, so the aggregate cannot be right in one path and
wrong in another.

Public interface: `getReviewsForRestaurant(id, page)`, `isOrderReviewed(orderId)`
(used by the orders module to set a `canReview` flag on order payloads),
`recomputeAggregates(...)` for the admin path.

## Validation

| Field | Rule |
|-------|------|
| `orderId` | UUID, an order belonging to the caller, `DELIVERED` |
| `restaurantRating` | integer 1–5, required |
| `driverRating` | integer 1–5, optional; rejected when the order has no driver |
| `comment` | ≤1000 chars, optional; trimmed; stored as plain text and rendered as text (never as HTML) |
| `PATCH` body | Same fields, all optional, at least one present |

Comments are rendered with Vue's text interpolation, which escapes by default;
no `v-html` is used anywhere in the review components. This is noted explicitly
because a review comment is the system's largest piece of user-controlled text
shown to strangers.

## Authorization

- Create/edit: `CUSTOMER` + the order must be theirs (404 otherwise).
- `GET /api/reviews/mine`: scoped to `customer_user_id`.
- Public list: unauthenticated, `PUBLISHED` only, PII-safe mapper.
- Restaurant/driver read their own received reviews, filtered by their ID.
- Hide/restore: `ADMIN` only, audited.

A customer cannot review an order they did not place, an order that was
cancelled, or the same order twice — the first is a 404, the second a 422, the
third a 409, and all three are tested.

## Error Handling

| Condition | Response |
|-----------|----------|
| Order not `DELIVERED` | `422 ORDER_NOT_REVIEWABLE` naming the current status |
| Order already reviewed | `409 REVIEW_ALREADY_EXISTS` |
| Order belongs to another customer | `404` |
| Driver rating with no driver | `422` with `details[].field = "driverRating"` |
| Edit after 24 h | `409 REVIEW_EDIT_WINDOW_CLOSED` with `editableUntil` |
| Rating of 0 or 6 | `422` |
| Comment over 1000 chars | `422` with the actual length |

## Testing Requirements

Unit — the aggregator against fixtures: no reviews → `0.00`/`0`; one review;
several including a hidden one (excluded); rounding to 2 decimals half-up; the
edit-window boundary at exactly 24 h.

Integration — the `reviews.integration` suite. Required:
- Review a delivered order → 201, and the restaurant's `rating_average`/`rating_count` update in the same request.
- Reviewing a `CANCELLED` or `PREPARING` order → 422.
- Second review of the same order → 409 (including a concurrent double-submit, where the unique index must arbitrate).
- Another customer's order → 404.
- Driver rating on a driverless order → 422; on a delivered order with a driver → the driver's aggregate updates.
- Edit at 23 h 59 m succeeds and recomputes; at 24 h 01 m → 409.
- **Admin hide removes the review from the public list and lowers the aggregate; restore puts both back** (BR-V7).
- The public payload contains no email, no phone and no full surname (BR-V8) — asserted by inspecting the serialized body, not the mapper.

Frontend — `ReviewForm` requires a restaurant rating before submitting; the
driver section is absent without a driver; the character counter and the
1000-char block; the edit button is disabled with a reason after the window; the
star rating is keyboard-operable and announces its value (axe + keyboard test).

## Edge Cases

| Case | Expected |
|------|----------|
| Order delivered months ago | Still reviewable (BR-V9) |
| Restaurant deleted after a review | Reviews remain; aggregates are moot since the restaurant is no longer listed |
| Driver suspended after a review | The rating stands and still counts toward their average |
| A customer's only review is hidden | The restaurant returns to `0.00`/`0`, not to a stale average |
| Every review for a restaurant is hidden | Aggregate is `0.00`/`0`; discovery sorts it as unrated (BR-D5.6), not as 0-star |
| Comment containing `<script>` | Stored verbatim, rendered as literal text |
| Edit lowers the rating | Aggregate recomputed downward in the same transaction |
| Order force-cancelled by an admin after delivery | Not possible — `DELIVERED` is terminal, so a reviewed order cannot become unreviewable |

## Related Stories

- [story-09 — Reviews & Ratings](../stories/story-09-reviews-ratings.md) (primary)
- [story-10 — Platform Administration](../stories/story-10-platform-administration-reporting.md) (moderation)

## Dependencies

**Depends on:** [spec-01](spec-01-platform-foundation-api-contract.md), [spec-02](spec-02-identity-authentication-authorization.md), [spec-03](spec-03-restaurant-profile-operations.md) (aggregate columns), [spec-07](spec-07-order-placement-lifecycle.md) (`DELIVERED` orders), [spec-08](spec-08-delivery-assignment-driver-operations.md) (driver ratings).
**Depended on by:** [spec-05](spec-05-restaurant-discovery-search.md) (consumes the aggregates it maintains), [spec-10](spec-10-platform-administration-reporting.md).
