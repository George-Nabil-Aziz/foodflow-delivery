# Spec 03 — Restaurant Profile & Operating Status

**Status:** Approved · **Owner:** Restaurants · **Covers:** FR-2.1 – FR-2.6

## Objective

Let a restaurant owner describe their business, define when they trade, and
pause intake — and give the rest of the system one authoritative answer to
"can a customer order from this restaurant right now?".

## Scope

**In scope**
- `restaurants` and `restaurant_hours` tables.
- Owner self-service profile read/update.
- Weekly opening hours as a full-week replacement.
- The `is_accepting_orders` pause toggle.
- The **orderability** computation (BR-R3) exposed as `restaurants.assertOrderable(id)` and as an `isOrderable` flag on every customer-facing restaurant payload.
- Restaurant approval lifecycle states as consumed here (the admin actions that drive them live in spec-10).
- Restaurant dashboard, profile, and hours screens.

**Out of scope** — menu content (spec-04), customer-facing listing and search
(spec-05), order processing (spec-07), admin approval endpoints (spec-10).

## Actors

- **RESTAURANT** — manages their own restaurant.
- **ADMIN** — changes `status` (spec-10).
- **CUSTOMER / public** — reads `ACTIVE` restaurants (spec-05).

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-2.1 | One owner user ↔ exactly one restaurant; the owner never names a restaurant ID in a request |
| FR-2.2 | A newly registered restaurant is `PENDING_APPROVAL` and invisible to customers |
| FR-2.3 | The owner maintains name, description, cuisine, phone, email, logo, cover image, address, coordinates, delivery fee, minimum order, average preparation minutes |
| FR-2.4 | The owner maintains exactly seven `restaurant_hours` rows, one per day |
| FR-2.5 | The owner toggles `is_accepting_orders` for a temporary pause |
| FR-2.6 | `isOrderable = (status = ACTIVE) AND is_accepting_orders AND now ∈ today's hours`, computed server-side |
| FR-2.7 | A `PENDING_APPROVAL` owner can edit profile and hours but cannot reach menu or order operations |
| FR-2.8 | The owner sees a dashboard with today's order count, revenue, rating and current open/closed state |

## Business Rules

BR-R1 – BR-R4 and BR-R9 from
[master-sdd §7.2](../master-sdd.md#72-restaurant--menu-rules).

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-R1 | One restaurant per owner | `uq_restaurants_owner` |
| BR-R2 | Visible to customers only when `ACTIVE` | Query predicate in spec-05's repository; a direct fetch of a non-`ACTIVE` restaurant by a customer is 404 |
| BR-R3 | Orderability is the conjunction of three conditions | `restaurants/orderability.js`, one implementation, called by cart, checkout and listing |
| BR-R4 | `delivery_fee ≥ 0`, `minimum_order_amount ≥ 0` | Zod + check constraints |
| BR-R9 | Suspension makes a restaurant non-orderable but does not cancel in-flight orders | Orderability reads `status`; nothing in suspension touches `orders` |
| BR-R10 | Opening hours are replaced as a complete week, never patched per day (ADR-014) | `PUT` semantics; the schema requires all seven `dayOfWeek` values exactly once |
| BR-R11 | Overnight hours are not supported in v1; `closes_at > opens_at` | Check constraint; documented in [assumptions.md](../assumptions.md) A-09 |
| BR-R12 | `status` is never writable through an owner endpoint | Not present in any owner schema |

## Data Requirements

`restaurants` and `restaurant_hours` per
[database-design §4](../architecture/database-design.md#4-table-detail).

- `owner_user_id` unique, `ON DELETE RESTRICT`.
- `slug` unique, generated from the name at creation and stable afterwards — a changing slug would break shared links. Collisions get a numeric suffix.
- `status restaurant_status NOT NULL DEFAULT 'PENDING_APPROVAL'`.
- `rating_average NUMERIC(3,2) DEFAULT 0`, `rating_count INT DEFAULT 0` — written only by spec-09's aggregator.
- `uq_hours_restaurant_day UNIQUE (restaurant_id, day_of_week)`.
- Index `idx_restaurants_browse (status, is_accepting_orders) WHERE deleted_at IS NULL` for spec-05.

## API Requirements

| Method | Route | Auth | Role | Notes |
|--------|-------|------|------|-------|
| GET | `/api/restaurant/profile` | 🔓 | R +own | Includes `status`, `isOrderable`, `rejectionReason` |
| PATCH | `/api/restaurant/profile` | 🔓 | R +own | Allowed while `PENDING_APPROVAL` |
| GET | `/api/restaurant/hours` | 🔓 | R +own | Seven rows |
| PUT | `/api/restaurant/hours` | 🔓 | R +own | Full-week replacement |
| PATCH | `/api/restaurant/accepting-orders` | 🔓 | R +own | `{ isAcceptingOrders }`; requires `ACTIVE` |
| GET | `/api/restaurant/stats` | 🔓 | R +own | Today's counts, revenue, rating |

```jsonc
// PUT /api/restaurant/hours
{ "hours": [
  { "dayOfWeek": 0, "isClosed": false, "opensAt": "11:00", "closesAt": "23:00" },
  { "dayOfWeek": 1, "isClosed": true },
  // … days 2–6, all seven present exactly once
]}
```

**Errors:** 403 `RESTAURANT_NOT_APPROVED` on operational routes while pending ·
422 `VALIDATION_ERROR` (missing day, duplicate day, `closesAt ≤ opensAt`) ·
404 if the owner somehow has no restaurant row (defensive; registration
guarantees one).

## Frontend Requirements

- `restaurant/DashboardView` — status banner (`Pending approval` / `Active` / `Suspended` with reason), today's stats, the accepting-orders toggle, quick links.
- `restaurant/ProfileView` — profile form with image URL fields and a live preview of how the card will look in customer listings.
- `restaurant/HoursView` — a seven-row editor with a per-day "closed" switch and a "copy to all days" helper; submits the whole week.
- `AcceptingOrdersToggle` — optimistic with rollback on failure, and a confirmation when turning intake off while orders are in flight.
- While `PENDING_APPROVAL`: menu and order navigation items render a disabled state with an explanation rather than disappearing — a hidden menu item looks like a bug, a disabled one with a reason does not.

## Backend Requirements

Module `modules/restaurants/` with `restaurants.service.js`,
`hours.service.js`, `orderability.js`, `restaurants.repository.js`.

`orderability.js` is a pure function over `(restaurant, hoursForToday, now)`
returning `{ isOrderable, reason }` where `reason ∈ { OK, NOT_ACTIVE,
NOT_ACCEPTING, CLOSED_NOW }`. Every caller — the listing, the cart add, the
checkout — uses this one function. Duplicating the condition is the fastest way
to get a UI that offers an order the API then refuses.

Public interface: `getRestaurantById`, `getByOwner`, `assertOrderable(id, trx)`
(throws `422 RESTAURANT_UNAVAILABLE` with the reason), `applyRatingAggregate`.

`requireApprovedRestaurant` middleware resolves the caller's restaurant, attaches
it to `req.restaurant`, and rejects non-`ACTIVE` with
`403 RESTAURANT_NOT_APPROVED`. It is applied to menu and order routes, not to
profile and hours (FR-2.7).

## Validation

Per [master-sdd §15](../master-sdd.md#15-validation) for restaurant and hours,
plus:
- `cuisineType` from a fixed enum (`LEVANTINE`, `ITALIAN`, `INDIAN`, `BURGERS`, `SEAFOOD`, `ASIAN`, `DESSERTS`, `COFFEE`, `HEALTHY`, `OTHER`).
- `logoUrl` / `coverImageUrl`: `http(s)` only, ≤500 chars. URLs are stored, not uploaded — file upload is a future enhancement, so the field is a URL today and a storage key later.
- Hours: exactly seven entries; `dayOfWeek` values `{0..6}` each exactly once; when `isClosed` is false both times are required and `closesAt > opensAt`.

## Authorization

Every route is `authorize('RESTAURANT')` plus ownership resolved from
`owner_user_id = req.user.id`. **No route accepts a restaurant ID** — the
IDOR surface is removed rather than defended. An owner with a `SUSPENDED` user
account is already stopped by `authenticate`.

## Error Handling

| Condition | Response |
|-----------|----------|
| Owner acting on menu/orders while pending or suspended | `403 RESTAURANT_NOT_APPROVED` with the current status in `details` |
| Hours missing a day | `422` naming the missing `dayOfWeek` |
| `closesAt ≤ opensAt` on an open day | `422` explaining the overnight limitation (BR-R11) |
| Toggling accepting-orders while not `ACTIVE` | `403 RESTAURANT_NOT_APPROVED` |
| Negative delivery fee | `422` |

## Testing Requirements

Unit — `orderability` truth table across `status × isAcceptingOrders × inHours`
(all combinations); the "closed today" and "boundary minute" cases (exactly at
`opensAt` is open, exactly at `closesAt` is closed); slug generation and
collision suffixing; the hours schema's seven-day rule.

Integration — owner reads and updates only their own restaurant; a second owner
cannot see the first's profile; hours replacement is atomic (a failing row
leaves the previous week intact); accepting-orders toggle reflected in
`isOrderable` and in spec-05's listing within the same request cycle; a pending
restaurant is 403 on menu routes and 200 on profile routes; `status` supplied in
a profile PATCH is stripped, not applied.

Frontend — dashboard renders the right banner per status; the hours editor
submits seven rows and blocks submission with a clear message when a day is
incomplete; the toggle rolls back on API failure.

## Edge Cases

| Case | Expected |
|------|----------|
| Restaurant closes while a customer is on the menu page | The next add-to-cart returns `422 RESTAURANT_UNAVAILABLE`; the page shows a closed banner on its next poll |
| Restaurant pauses intake with pending orders | Existing orders proceed normally (BR-R9); no new orders accepted |
| Admin suspends mid-order | Same as above — in-flight orders complete |
| Restaurant open 24 h | `opensAt 00:00`, `closesAt 23:59`; documented gap of one minute (A-09) |
| Owner changes the name | `slug` does not change; historical orders keep `restaurant_name_snapshot` |
| Rejected restaurant | `status = REJECTED` with `rejectionReason`; profile stays editable so it can be resubmitted for review |

## Related Stories

- [story-03 — Restaurant Onboarding, Profile & Menu Management](../stories/story-03-restaurant-onboarding-menu-management.md) (primary)
- [story-10 — Platform Administration](../stories/story-10-platform-administration-reporting.md) (approval, rejection, suspension)

## Dependencies

**Depends on:** [spec-01](spec-01-platform-foundation-api-contract.md), [spec-02](spec-02-identity-authentication-authorization.md) (the owner account and the restaurant shell are created at registration).
**Depended on by:** [spec-04](spec-04-menu-management.md), [spec-05](spec-05-restaurant-discovery-search.md), [spec-06](spec-06-cart-management.md), [spec-07](spec-07-order-placement-lifecycle.md), [spec-09](spec-09-reviews-ratings.md), [spec-10](spec-10-platform-administration-reporting.md).
