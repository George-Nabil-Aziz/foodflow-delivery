# Spec 17 — Restaurant Analytics

**Status:** Approved · **Owner:** Restaurant Operations · **Covers:** FR-17.1 – FR-17.9

## Objective

Give a restaurant owner a trading summary of their own restaurant for the last
7, 30 or 90 days: how many orders were delivered and what they earned, how many
were cancelled, what sells, when orders come in and how long the kitchen takes.

Everything is computed from data the platform already holds, by SQL aggregation
at read time, in the manner of the admin dashboard statistics
([spec-10](spec-10-platform-administration-reporting.md)). No new table, no
cache, no stored counters: a number that cannot drift from the orders is worth a
few milliseconds.

## Scope

**In scope**
- `GET /api/restaurant/analytics?days=7|30|90`, for the caller's own restaurant.
- An **Analytics** page in the restaurant sidebar with a period selector and plain bars (no chart library); English and Arabic.

**Out of scope** — other periods or custom date ranges, export, per-item
trends, comparisons with the previous period, driver or customer breakdowns,
platform-wide analytics (that is the admin dashboard), payouts or accounting.

## Actors

| Actor | Can |
|-------|-----|
| **RESTAURANT** | Read the analytics of their own restaurant (approved or suspended restaurants; see BR-RA7) |
| **CUSTOMER / DRIVER / ADMIN** | None: `403 FORBIDDEN_ROLE` |

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-17.1 | The response has the delivered-order count and the revenue for the period |
| FR-17.2 | The response has the average order value (null when nothing was delivered) |
| FR-17.3 | The response has the cancelled-order count and the cancellation rate (null when no order finished) |
| FR-17.4 | The response has the top five items by quantity sold, each with its quantity and revenue |
| FR-17.5 | The response has orders by hour of day: 24 buckets, hours 0–23, in the platform time zone |
| FR-17.6 | The response has the average preparation time in minutes, from accepted to ready (null when no order has both) |
| FR-17.7 | The Analytics page has a 7 / 30 / 90 day selector (default 30), the figures above as tiles and simple bars for top items and hours, an empty state, a retry on failure, and states the money figure and the time zone it uses |
| FR-17.8 | The period is validated: anything but 7, 30 or 90 is `422` |
| FR-17.9 | Arabic strings in `i18n/ar/analytics.js` |

## Business Rules

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-RA1 | The period is one of 7, 30 or 90 days, counted back from now; the default is 30 | `analyticsQuery` schema |
| BR-RA2 | **Cohort.** Every figure is about orders **placed** (`placed_at`) in the period. The cancellation rate therefore compares like with like: of the orders that started in the window and have finished, how many ended cancelled | One `placed_at >= now() - N days` predicate in every query |
| BR-RA3 | **Revenue is `orders.subtotal − orders.discount_amount`, summed over `DELIVERED` orders.** `subtotal` is the sum of the item line totals, so revenue is the food the restaurant sold; it excludes the delivery fee (it pays for delivery) and tax (collected on behalf of the state), and it takes off the discount because the customer did not pay for that part of the food. It is not `total_amount`. A cancelled order earns nothing | `sum(subtotal - discount_amount) FILTER (WHERE status = 'DELIVERED')` |
| BR-RA4 | **Average order value** is the same figure divided by the delivered count, rounded half-up to 2 decimals by the database on `NUMERIC`; no float touches money. Null with no delivered orders | `round(avg(subtotal - discount_amount), 2)` |
| BR-RA5 | **Hour of day** is the hour the order was **placed**, in the platform time zone (`PLATFORM_TIMEZONE`, `Africa/Cairo`), the same zone opening hours are read in. A UTC hour would put the lunch rush in the wrong bar. Only delivered orders are counted, so the chart shows demand that was served. The response always has 24 buckets, zero-filled, and names the zone | `placed_at AT TIME ZONE ?` with `config.platformTimezone` |
| BR-RA6 | **Cancellation rate** is `cancelled / (delivered + cancelled)` as a percentage with one decimal. Orders still in progress are in neither side. Every cancellation counts, whoever caused it (customer, restaurant, timeout or admin) | Computed from the two counts |
| BR-RA7 | **Scope and access.** The restaurant is resolved from the token (`attachRestaurant`); the route accepts no restaurant id, so an owner cannot read another restaurant's figures whatever they send. Like the order routes it needs an approved restaurant: a `PENDING_APPROVAL` or rejected restaurant is `403 RESTAURANT_NOT_APPROVED`, a suspended one can still read its history | Router guards `requireApprovedRestaurant` |
| BR-RA8 | **Top items** group delivered order lines by the item name snapshot (as the admin leaderboard does), so history survives a rename or a deleted item; ordered by quantity, then name | `GROUP BY oi.item_name_snapshot` |
| BR-RA9 | **Preparation time** is the average over orders with both events of the **first** `CONFIRMED` event (accepted) to the first `READY_FOR_PICKUP` event (ready) in `order_status_events`. An order that never got ready is not in the average; a negative interval (clock skew) is ignored | Lateral `min(created_at)` per status |
| BR-RA10 | Read-only and uncached | — |

## Data Requirements

No new table and no migration. The queries read `orders`, `order_items` and
`order_status_events`, using the existing `idx_orders_restaurant_status
(restaurant_id, status, created_at DESC)` for the owner's rows and
`idx_order_items_order` and `idx_status_events_order` for the joins. The period
is capped at 90 days and one restaurant's orders are a small set, so no index
was added.

## API Requirements

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/restaurant/analytics` | R +own | `?days=7\|30\|90` (default 30) |

```jsonc
{
  "success": true,
  "data": {
    "periodDays": 30,
    "timezone": "Africa/Cairo",
    "deliveredOrders": 12,
    "revenue": "1450.50",              // subtotal - discount, delivered orders; a money string
    "averageOrderValue": "120.88",     // null with no delivered orders
    "cancelledOrders": 3,
    "cancellationRate": 20,            // percent, 1 decimal; null when no order finished
    "topItems": [ { "name": "Mixed Grill", "quantity": 20, "revenue": "1160.00" } ],
    "ordersByHour": [ { "hour": 0, "orders": 0 }, "... 24 entries" ],
    "averagePreparationMinutes": 18.5  // null when no order has both events
  }
}
```

Errors: `401 TOKEN_MISSING`, `403 FORBIDDEN_ROLE`, `403 RESTAURANT_NOT_APPROVED`,
`422 VALIDATION_ERROR` (`days`).

## Frontend Requirements

- `AnalyticsView` at `/restaurant/analytics`, sidebar **Analytics** after Categories. Like the other operational links it is disabled, with the reason, while the restaurant is not active.
- Period buttons (`aria-pressed`) for 7, 30 and 90 days; a slow answer for an earlier period cannot overwrite a later choice.
- Tiles: delivered orders, revenue (with the note "Food sold after discounts. Excludes delivery fee and tax."), average order value, cancellation rate with the cancelled count, average preparation time. A missing figure is a dash, never `NaN` or 0.
- Top items as horizontal bars scaled to the largest; orders by hour as 24 vertical bars, left to right in both languages, with a title and a screen-reader list for every hour, and the time zone named. Plain Tailwind, no chart library.
- With no delivered orders the tiles show and the charts are replaced by an empty state.
- Arabic strings in `i18n/ar/analytics.js`.

## Backend Requirements

Module `modules/analytics/` (`analytics.service.js`, `analytics.schemas.js`,
`analytics.controller.js`, `index.js`). The service runs one summary query and
three more in parallel (top items, hours, preparation time). The module owns no
tables. The restaurant router mounts the controller through `analytics/index.js`,
after `requireApprovedRestaurant`.

## Validation

| Field | Rule |
|-------|------|
| `days` | integer, one of 7, 30, 90; default 30 |

Unknown query keys, including a `restaurantId`, are ignored.

## Authorization

Layer one: `authorize('RESTAURANT')` on the router. Layer two: the restaurant is
`req.restaurant`, resolved from the token's owner id, and is the only value the
SQL is parameterised by.

## Error Handling

| Condition | Response |
|-----------|----------|
| `days` not 7, 30 or 90 | `422 VALIDATION_ERROR` |
| Restaurant not approved | `403 RESTAURANT_NOT_APPROVED` |
| Other role / no token | `403 FORBIDDEN_ROLE` / `401 TOKEN_MISSING` |

## Testing Requirements

Integration (`analytics.test.js`, real PostgreSQL) — an empty restaurant gives
zeros, nulls and 24 buckets; revenue is subtotal minus discount and not the
total; the average rounds to two decimals; the cancellation rate ignores orders
in progress; the top five are ordered by quantity with ties by name, add up
across orders and ignore cancelled orders; hours are bucketed in the platform
zone, not UTC; preparation time averages accepted to ready and ignores an order
that never got ready; the 7, 30 and 90 day windows and the default; a bad `days`
is 422; an owner sees only their own restaurant even when passing another's id;
customer, driver and admin are 403 and anonymous 401; a pending restaurant is 403
and a suspended one is 200.

Frontend (`favouritesAndAnalytics.test.js`) — the page asks for 30 days and shows
every figure, reloads for the chosen period and marks it pressed, shows dashes
and an empty message with nothing delivered, and offers a retry on failure.

## Edge Cases

- **Day boundaries:** the window is a rolling `N × 24 hours`, not calendar days, so "last 7 days" does not change at midnight.
- **Daylight saving:** Egypt observes it; the hour is computed by the database from the zone's rules, so an order at 22:30 UTC lands in the right local hour in both seasons.
- **Discount larger than the subtotal** cannot occur (`chk_orders_discount`), so revenue is never negative.
- **A delivered order with no accepted event** (seeded or legacy data) is simply absent from the preparation average.
- **An item renamed in the middle of the period** appears as two entries, because the order line keeps the name it was sold under.

## Related Stories

[Story 17](../stories/story-17-restaurant-analytics.md).

## Dependencies

[Spec-07](spec-07-order-placement-lifecycle.md) (orders, order items and the status
events), [spec-12](spec-12-discount-codes.md) (`discount_amount`),
[spec-03](spec-03-restaurant-profile-operations.md) (the restaurant guards), and
[spec-10](spec-10-platform-administration-reporting.md) for the aggregation
pattern.
