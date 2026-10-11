# Story 09 — Reviews & Ratings

**Phase:** 6 · **Depends on:** story-08 · **Blocks:** nothing

## Goal

Let customers rate what they actually received, keep the aggregate ratings that
drive discovery accurate at every moment, and give the restaurant and driver
sides visibility of how they are doing.

## User Story

> As a **customer**
> I want to rate and review an order after it arrives
> So that I can share what the experience was actually like and help other people choose.

## Scope

**In:** the `reviews` table; creating a review for a delivered order; the
24-hour edit window; required restaurant rating and optional driver rating;
aggregate maintenance on `restaurants` and `driver_profiles`; the public review
list with a PII-safe author display; the review form, my-reviews page, the
rating summary on the restaurant page, and the received-reviews views for
restaurants and drivers.

**Out:** admin moderation endpoints (story-10 — this story delivers the
aggregate recomputation they call), restaurant replies, review voting, photos
(future enhancements).

## Actors

- **CUSTOMER** — writes and edits.
- **Public** — reads published reviews.
- **RESTAURANT / DRIVER** — read their own received reviews.

## Preconditions

- Story-08 complete: orders can reach `DELIVERED` with a driver attached.

## Functional Requirements

Implements spec-09 in full: FR-8.1 – FR-8.7.

1. `POST /api/reviews` creates one review for a `DELIVERED` order by that order's customer.
2. `restaurantRating` (1–5) is required; `driverRating` is optional and accepted only when a driver delivered the order.
3. Aggregates are recomputed inside the review transaction.
4. The author can edit for 24 hours; afterwards the review is frozen.
5. Hidden reviews leave public lists and aggregates.
6. Public payloads show the author as first name plus last initial.
7. The order detail offers "Rate this order" while reviewable and shows the review afterwards.

## Business Rules

BR-V1 – BR-V9 from [master-sdd §7.7](../master-sdd.md#77-review-rules) and
[spec-09](../specs/spec-09-reviews-ratings.md#business-rules).

Two decisions worth naming. **Aggregates are recomputed from source, not
incremented** — an incremental average accumulates drift and has no correct
answer for an edit or a hide. And **there is no deadline on the right to
review** (BR-V9): a window would mostly punish customers who were busy, and a
late review is still real information about a real order.

## Acceptance Criteria

```gherkin
Given my order was delivered
When I submit a restaurant rating of 5 and a comment
Then the review is created and the restaurant's rating average and count update
  in the same request

Given my order is PREPARING
When I try to review it
Then I receive 422 ORDER_NOT_REVIEWABLE naming the current status

Given my order was cancelled
When I try to review it
Then I receive 422 ORDER_NOT_REVIEWABLE — a cancelled order is never reviewable

Given I already reviewed an order
When I submit another review for it
Then I receive 409 REVIEW_ALREADY_EXISTS

Given I submit two reviews for the same order at the same moment
When both requests are processed
Then exactly one review exists and the other request receives 409

Given an order I did not place
When I try to review it
Then I receive 404 RESOURCE_NOT_FOUND

Given my delivered order had no driver assigned
When I submit a driver rating
Then I receive 422 naming driverRating

Given my delivered order had a driver
When I submit a driver rating of 4
Then the driver's rating average and count update

Given I submitted a review 23 hours ago
When I edit it
Then the edit succeeds and the aggregates are recomputed

Given I submitted a review 25 hours ago
When I edit it
Then I receive 409 REVIEW_EDIT_WINDOW_CLOSED with the editableUntil timestamp,
  and my UI had already disabled the edit button with that reason

Given a restaurant has reviews of 5, 4 and 3
When the aggregate is computed
Then the average is 4.00 and the count is 3

Given an admin hides the 3-star review
When the aggregate is recomputed
Then the average becomes 4.50 and the count becomes 2, and the review disappears
  from the public list

Given the admin restores it
Then the average returns to 4.00 and the count to 3

Given a restaurant's only review is hidden
When I view the restaurant
Then its rating average is 0.00 with a count of 0, and discovery sorts it as
  unrated rather than as zero-star

Given I view a restaurant's public reviews
When I inspect the response body
Then each author appears as a first name and last initial, and no email, phone
  or full surname appears anywhere in the payload

Given a review comment contains "<script>alert(1)</script>"
When it is displayed
Then it renders as literal text and no script executes

Given I submit a comment of 1001 characters
Then I receive 422 stating the actual length

Given I submit a rating of 0 or 6
Then I receive 422
```

## API Impact

New: `POST /api/reviews`, `GET /api/reviews/mine`, `PATCH /api/reviews/:id`,
`GET /api/restaurants/:id/reviews` (public), `GET /api/restaurant/reviews`,
`GET /api/driver/reviews`. The `canReview` flag is added to customer order
payloads.

## Database Impact

Migration 8: `reviews` with `uq_reviews_order`, `chk_reviews_driver_rating`,
the 1–5 rating checks and `idx_reviews_restaurant … WHERE status = 'PUBLISHED'`.
Writes `restaurants.rating_average/rating_count` and the equivalent
`driver_profiles` columns — the only writer of those four columns in the system.

## Frontend Impact

`ReviewForm` with an accessible `StarRating` (a keyboard-operable radio group
with a text label per value — stars alone fail NFR-14), a driver-rating section
rendered only when the order had a driver, and a live character counter;
`customer/MyReviewsView` with the edit button disabled and explained after the
window closes; the rating summary and paginated review list on
`RestaurantDetailView`; recent reviews on the restaurant dashboard and the
average on the driver dashboard.

## Backend Impact

`modules/reviews/` with `reviews.service.js`, `ratingAggregator.js`,
repository and mappers. `ratingAggregator` has three callers — create, edit and
the admin hide/restore in story-10 — and one implementation, so an aggregate
cannot be right on one path and wrong on another.

## Validation

`orderId` UUID, the caller's, `DELIVERED`; `restaurantRating` integer 1–5
required; `driverRating` integer 1–5 optional and rejected without a driver;
`comment` ≤1000, trimmed, stored as plain text.

Comments render through Vue's text interpolation, which escapes by default, and
`v-html` appears nowhere in the review components. This is called out explicitly
because a review comment is the largest piece of user-controlled text the system
shows to strangers.

## Error Cases

| Case | Expected |
|------|----------|
| Order not `DELIVERED` | `422 ORDER_NOT_REVIEWABLE` naming the status |
| Already reviewed | `409 REVIEW_ALREADY_EXISTS` |
| Another customer's order | `404` |
| Driver rating without a driver | `422` on `driverRating` |
| Edit after 24 h | `409 REVIEW_EDIT_WINDOW_CLOSED` with `editableUntil` |
| Rating out of range | `422` |
| Comment too long | `422` with the actual length |

## Security Considerations

- **PII minimization in public payloads** (BR-V8): `"Sara I."` and nothing else. The test asserts this against the serialized response body, not against the mapper, so a future field addition cannot slip past it.
- **XSS:** comments are stored verbatim and rendered as text; no `v-html`.
- **Ownership:** reviewing requires the order to be the caller's — a 404 otherwise — so review spam cannot be attached to strangers' orders.
- **Integrity of aggregates:** ratings are written only by the aggregator, inside the same transaction as the review, so a partially-applied review can never leave a wrong average behind. Nothing in a restaurant-writable schema touches these columns, so a restaurant cannot inflate its own rating.
- Review creation is rate-limited to 10 per hour per user.

## Related Specs

- [spec-09 — Reviews & Ratings](../specs/spec-09-reviews-ratings.md) (implements in full)
- [spec-10 — Platform Administration & Reporting](../specs/spec-10-platform-administration-reporting.md) (moderation consumes the aggregator delivered here)

## Dependencies

**Depends on:** story-08.
**Must happen before:** nothing — it is a leaf.
**Can happen in parallel with:** story-10, which only needs this story's `reviews` table and aggregator for its moderation endpoints.

## Testing Requirements

- Unit: the aggregator against fixtures — no reviews → `0.00`/`0`; one review; several including a hidden one; half-up rounding to two decimals; the edit-window boundary at exactly 24 hours.
- Integration: the `reviews.integration` suite. Required: a review updating the aggregate in the same request; non-delivered and cancelled orders rejected; a concurrent double-submit arbitrated by the unique index; another customer's order 404; driver rating rules both ways; edit inside and outside the window; **hide lowering the aggregate and restore returning it**; and the public payload asserted to contain no email, phone or surname.
- Frontend: the form requires a restaurant rating; the driver section is absent without a driver; the character counter and limit; the edit button disabled with a reason after the window; the star rating keyboard-operable and announcing its value (axe plus a keyboard test).
- E2E: the final segment of `full-order-journey` — review a delivered order and see the restaurant's average change on the listing page.
