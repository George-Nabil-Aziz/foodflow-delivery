# Story 07 — Restaurant Order Processing

**Phase:** 4 · **Depends on:** story-06 · **Blocks:** story-08

## Goal

Give the restaurant the working screen of its day: a live queue of incoming
orders with exactly the actions each one allows — accept, reject, start
preparing, mark ready — and the dispatch trigger that hands the order on to the
delivery side.

## User Story

> As a **restaurant owner**
> I want to see incoming orders and move each one through preparation
> So that my kitchen knows what to cook and my customers know what is happening.

## Scope

**In:** the restaurant order queue and detail; the four transitions T1, T3, T5
and the rejection/cancellation paths T2/T4/T6; rejection reason codes; the
`requestDispatch` hook fired on `CONFIRMED`; the incoming-orders and
order-history screens; restaurant order statistics on the dashboard.

**Out:** driver assignment itself (story-08 — this story only fires the
trigger), customer-side views (story-06), admin force-cancel (story-10).

## Actors

**RESTAURANT** — primary, acting only on their own orders.

## Preconditions

- Story-06 complete: orders exist in `PENDING`.
- Story-03 complete: the restaurant is `ACTIVE`.

## Functional Requirements

Implements spec-07's restaurant half (FR-6.3 – FR-6.5) and spec-08's FR-7.1
trigger.

1. `GET /api/restaurant/orders` lists the restaurant's orders, filterable by status and by active/history scope.
2. `GET /api/restaurant/orders/:id` shows the full order with items, customer contact detail and the status timeline.
3. `POST .../accept` performs T1 `PENDING → CONFIRMED`.
4. `POST .../reject` performs T2 with a mandatory reason code.
5. `POST .../start-preparing` performs T3 `CONFIRMED → PREPARING`.
6. `POST .../ready` performs T5 `PREPARING → READY_FOR_PICKUP`.
7. `POST .../cancel` performs T4 or T6 with a mandatory reason.
8. Reaching `CONFIRMED` sets `dispatch_state = UNASSIGNED` so dispatch can begin (BR-D1).
9. The queue polls every 10 seconds and signals a new `PENDING` order.
10. The dashboard shows today's order count, revenue and current rating.

## Business Rules

The transition table in [master-sdd §7.3](../master-sdd.md#73-order-state-machine),
plus BR-O8 (attribution and reason), BR-O9 (row lock), BR-R9 (a suspended
restaurant's in-flight orders still complete) and BR-D1 (dispatch at
`CONFIRMED`, not at `READY_FOR_PICKUP`, so the driver gets travel lead time).

## Acceptance Criteria

```gherkin
Given an order for my restaurant is PENDING
When I accept it
Then its status becomes CONFIRMED, confirmedAt is stamped, a status event records
  me as the actor, and its dispatch state becomes UNASSIGNED

Given an order for my restaurant is PENDING
When I reject it with the reason OUT_OF_STOCK and a note
Then it becomes CANCELLED with cancelledBy RESTAURANT and that reason, and the
  customer sees "Rejected by restaurant" with the reason

Given an order is PENDING
When I try to reject it without a reason
Then I receive 422 — a rejection the customer cannot understand is not acceptable

Given an order is CONFIRMED
When I start preparing it
Then its status becomes PREPARING and preparingAt is stamped

Given an order is PREPARING
When I mark it ready
Then its status becomes READY_FOR_PICKUP and readyAt is stamped

Given an order is PENDING
When I try to mark it ready
Then I receive 409 INVALID_ORDER_TRANSITION — statuses cannot be skipped

Given an order is PREPARING
When I try to accept it again
Then I receive 409 INVALID_ORDER_TRANSITION

Given an order is OUT_FOR_DELIVERY
When I try to change its status
Then I receive 409 — the order is the driver's responsibility now

Given an order is DELIVERED or CANCELLED
When I try any action on it
Then I receive 409 — terminal states are terminal

Given an order belonging to a different restaurant
When I try to accept it
Then I receive 404 RESOURCE_NOT_FOUND, not 403

Given I am preparing an order and I run out of an ingredient
When I cancel it with the reason OUT_OF_STOCK
Then it becomes CANCELLED with my attribution and the customer sees the reason

Given two of my staff accept the same order at the same moment
When both requests are processed
Then one receives 200 and the other receives 409 — the row lock serialises them

Given my restaurant is suspended by an admin while an order is PREPARING
When I continue working
Then I can still move that order to READY_FOR_PICKUP; only new orders are blocked

Given my restaurant is not yet approved
When I open the orders screen
Then it is disabled with an explanation and the API returns 403 RESTAURANT_NOT_APPROVED

Given a new PENDING order arrives
When my queue next polls
Then the order appears within one polling interval with a visible and audible cue

Given an order in each status
When I view the queue
Then each card offers only the actions legal from its current status
```

## API Impact

New: `GET /api/restaurant/orders`, `GET /api/restaurant/orders/:id`,
`POST /api/restaurant/orders/:id/{accept,reject,start-preparing,ready,cancel}`.
All under `authorize('RESTAURANT')` + `requireApprovedRestaurant` + ownership.

## Database Impact

No new tables. Writes `orders.status` and its timestamps,
`orders.dispatch_state`, `orders.cancelled_by` / `cancellation_reason`, and
appends `order_status_events`. Relies on `idx_orders_restaurant_status` for the
queue.

## Frontend Impact

`restaurant/IncomingOrdersView` — the queue grouped by status, polled at 10 s,
with a new-order cue; `restaurant/OrderDetailView`; `restaurant/OrderHistoryView`;
`IncomingOrderCard` and `OrderActionBar`; a rejection dialog with a reason
select and an optional note; today's statistics on the dashboard.

`OrderActionBar` derives its buttons from the same transition shape the backend
uses, so an illegal action is never offered — and the server re-checks anyway.

## Backend Impact

The restaurant-facing controllers and routes in `modules/restaurants/`, each a
thin wrapper over `orders.transition(...)`. The `onTransition` hook calls
`delivery.requestDispatch(orderId, { trx })` when an order reaches `CONFIRMED`.
No new status-changing code path is introduced — that is what keeps G3 true.

## Validation

`reason` required for reject and cancel, from the `cancellation_reason` enum;
`note` ≤300; list filters `status` (enum) and `scope ∈ {active, history}`;
pagination.

## Error Cases

| Case | Expected |
|------|----------|
| Skipping a status | `409 INVALID_ORDER_TRANSITION` |
| Repeating a completed transition | `409` |
| Acting on a terminal order | `409` |
| Acting on `OUT_FOR_DELIVERY` | `409` |
| Another restaurant's order | `404` |
| Missing rejection reason | `422` |
| Unapproved or suspended restaurant, new actions | `403 RESTAURANT_NOT_APPROVED` |
| Lost concurrency race | `409` with the current status |

## Security Considerations

- Ownership is applied in SQL (`restaurant_id = req.restaurant.id`), and a cross-restaurant order ID returns 404 rather than 403 — **the single most important authorization test in the suite**, because role alone would otherwise let any restaurant accept any order.
- The restaurant sees the customer's first name, masked phone and delivery address — never their email or their orders elsewhere ([security.md §9](../architecture/security.md#9-data-exposure-rules)).
- No route accepts a restaurant ID; it is derived from the token.
- Every transition is attributed to the acting user in `order_status_events`, so an internal dispute about who rejected an order has an answer.
- Reason codes come from a fixed enum, so free text cannot be injected into a status field.

## Related Specs

- [spec-07 — Order Placement & Lifecycle](../specs/spec-07-order-placement-lifecycle.md) (primary)
- [spec-08 — Delivery Assignment & Driver Operations](../specs/spec-08-delivery-assignment-driver-operations.md) (the dispatch trigger)

## Dependencies

**Depends on:** story-06.
**Must happen before:** story-08 — dispatch has nothing to offer until a restaurant confirms an order.
**Can happen in parallel with:** story-10's non-order admin screens.

## Testing Requirements

- Unit: covered by story-06's state machine matrix; here, the reason-required rule per actor.
- Integration: every restaurant-side legal transition stamps its timestamp and writes an event; every illegal one returns 409 — driven by the same table the implementation uses; cross-restaurant access returns 404; **two parallel accepts produce one 200 and one 409**; reaching `CONFIRMED` sets `dispatch_state = UNASSIGNED`; rejection stores attribution and reason and surfaces them to the customer; a suspended restaurant can still complete in-flight orders but cannot receive new ones.
- Frontend: `OrderActionBar` offers only legal actions for each of the seven statuses; the rejection dialog blocks submission without a reason; the queue polls, dedupes and signals new orders; polling pauses when the tab is hidden.
- E2E: `restaurant-rejects` — reject with a reason and confirm the customer sees it; and the middle segment of `full-order-journey` (accept → prepare → ready).
