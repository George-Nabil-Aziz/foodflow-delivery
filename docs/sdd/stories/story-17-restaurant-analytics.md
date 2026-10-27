# Story 17 — Restaurant Analytics

**Phase:** 8 · **Depends on:** story-03, story-06, story-07, story-12 · **Blocks:** nothing

## Goal

Give a restaurant owner a clear picture of how their restaurant is trading over
the last 7, 30 or 90 days — orders, revenue, cancellations, best sellers, busy
hours and kitchen speed — computed from the orders the platform already holds.

## User Story

> As a **restaurant owner**
> I want to see how many orders I delivered and what they earned, what sells and when, how often orders are cancelled and how long my kitchen takes
> So that I can staff the busy hours, push what sells and spot a problem before customers do.

## Scope

**In:** `GET /api/restaurant/analytics`; the Analytics page in the restaurant
sidebar with a period selector and simple bars; Arabic strings.

**Out:** custom date ranges, export, trends and comparisons, platform-wide
analytics, payouts.

## Actors

**RESTAURANT** only, for their own restaurant. Other roles are refused with 403.

## Preconditions

- Story-03 for the restaurant and its owner guards.
- Story-06 and story-07 for orders, order items and the status events the figures are computed from.
- Story-12 for `orders.discount_amount`.

## Functional Requirements

Implements spec-17: FR-17.1 – FR-17.9.

1. Delivered-order count and revenue for the period.
2. Average order value.
3. Cancelled-order count and cancellation rate.
4. Top five items by quantity.
5. Orders by hour of day (0–23) in the platform time zone.
6. Average preparation time, accepted to ready.
7. A page with a 7 / 30 / 90 day selector, tiles, simple bars, an empty state and a retry.
8. `days` validated as 7, 30 or 90.
9. Arabic strings.

## Business Rules

BR-RA1 – BR-RA10 from [spec-17](../specs/spec-17-restaurant-analytics.md#business-rules).

The ones that shape behaviour most: every figure is about orders placed in the
period (BR-RA2); **revenue is `subtotal − discount_amount` of delivered orders**,
the food sold, not the total with delivery fee and tax (BR-RA3); the hour of day
is read in `Africa/Cairo`, not UTC (BR-RA5); the cancellation rate leaves orders
in progress out (BR-RA6); and the restaurant comes from the token, so an owner
reads only their own figures (BR-RA7).

## Acceptance Criteria

```gherkin
Given I own a restaurant with no orders
When I open Analytics
Then I see zeros, dashes for the averages and the rate, and an empty state in place of the charts

Given two delivered orders of 116.00 and 18.00, the second with a 3.00 discount
When I open Analytics
Then delivered orders is 2, revenue is 131.00 and the average order value is 65.50,
  and the delivery fee and tax are not in them

Given 3 delivered, 1 cancelled and 1 preparing order
When I open Analytics
Then the cancellation rate is 25%, because the preparing order has not finished

Given delivered orders of six different dishes
When I open Analytics
Then the top items are the five with the most units sold, best first, ties by name,
  and units add up across orders

Given an order placed at 22:30 UTC
When I look at orders by hour
Then it is counted in the Cairo hour it was placed in, not hour 22

Given orders accepted and ready 10 and 30 minutes apart
When I open Analytics
Then the average preparation time is 20 minutes

Given orders placed 2, 20, 60 and 120 days ago
When I choose 7, 30 and 90 days
Then they count 1, 2 and 3 orders; with no choice I see 30 days

Given a period that is not 7, 30 or 90
When I request it
Then I receive 422

Given another restaurant's id in the request
When I open my analytics
Then I still see only my own restaurant's figures

Given I am a customer, driver or admin
When I request the analytics
Then I receive 403; with no token, 401

Given my restaurant is awaiting approval
When I request the analytics
Then I receive 403 RESTAURANT_NOT_APPROVED; if it is suspended I can still read it
```

## API Impact

One new route, `GET /api/restaurant/analytics`. See [api-design §5](../architecture/api-design.md).

## Database Impact

None. No migration and no index: the queries use the existing order indexes.

## Frontend Impact

`AnalyticsView` at `/restaurant/analytics`, a sidebar link, `restaurantApi.analytics`,
`i18n/ar/analytics.js`.

## Backend Impact

New module `modules/analytics/`, mounted by the restaurant router after
`requireApprovedRestaurant`.

## Validation

`days` is 7, 30 or 90 (default 30), else 422.

## Error Cases

| Case | Result |
|------|--------|
| `days` not offered | 422 `VALIDATION_ERROR` |
| Restaurant not approved | 403 `RESTAURANT_NOT_APPROVED` |
| Wrong role / no token | 403 `FORBIDDEN_ROLE` / 401 `TOKEN_MISSING` |

## Security Considerations

The route accepts no restaurant id: the restaurant is resolved from the token,
so there is no IDOR surface. All SQL is parameterised, including the period and
the time zone. The response contains only the caller's own aggregates; no
customer is named.

## Related Specs

- [spec-17 — Restaurant Analytics](../specs/spec-17-restaurant-analytics.md) (primary)
- [spec-07 — Order Placement & Lifecycle](../specs/spec-07-order-placement-lifecycle.md)
- [spec-10 — Platform Administration & Reporting](../specs/spec-10-platform-administration-reporting.md) (the aggregation pattern)
- [spec-12 — Discount Codes](../specs/spec-12-discount-codes.md) (`discount_amount`)

## Dependencies

**Depends on:** story-03, story-06, story-07, story-12.
**Must happen before:** nothing.
**Can happen in parallel with:** story-16.

## Testing Requirements

- Integration: `backend/tests/integration/analytics.test.js` (real PostgreSQL) — the figures, the revenue definition, rounding, the cancellation rate, the top five, the Cairo hour bucketing, preparation time, the period windows and validation, owner scoping, and role, anonymous and approval refusals. The router audit in `authorization.test.js` covers the new route.
- Frontend: `frontend/tests/component/favouritesAndAnalytics.test.js` — the page loads 30 days, shows the figures, reloads and marks the chosen period, shows dashes and an empty state, and offers a retry.
