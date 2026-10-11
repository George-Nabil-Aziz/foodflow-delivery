# Story 06 — Order Placement & Customer Order Tracking

**Phase:** 4 · **Depends on:** story-05 · **Blocks:** story-07, story-09

## Goal

Turn a validated cart into an immutable order, and give the customer a history,
a detail view, a live status timeline and a cancellation window that closes when
the kitchen starts cooking.

## User Story

> As a **customer**
> I want to place my order and then follow what is happening to it
> So that I know it was received, what I was charged, and when it will arrive — and I can cancel while that is still fair.

## Scope

**In:** `orders`, `order_items`, `order_status_events`; checkout with the
immutable snapshot and server-computed totals; customer order history, detail,
status polling and cancellation (T2/T4); the state machine itself and the
`SYSTEM` accept-timeout job; the checkout, orders and tracking screens.

**Out:** the restaurant's transitions (story-07), the driver's transitions
(story-08), admin force-cancel UI (story-10), reviews (story-09), payment
capture (non-goal — cash on delivery).

## Actors

- **CUSTOMER** — primary.
- **SYSTEM** — cancels unanswered `PENDING` orders at the timeout.

## Preconditions

- Story-05 complete: a customer can hold a validated cart.
- The customer has at least one delivery address (story-02).

## Functional Requirements

Implements spec-07's customer half: FR-6.1, FR-6.2, FR-6.3 (the machine
itself), FR-6.4, FR-6.5 (customer views), FR-6.6, FR-6.7, FR-6.8, FR-6.9,
FR-6.10, FR-6.11.

1. `POST /api/orders` converts the active cart into an order in one transaction.
2. Item name, description and unit price are snapshotted; the delivery address and delivery fee are snapshotted.
3. Totals are computed server-side; the request carries no prices.
4. The order starts `PENDING` with an initial status event.
5. The customer sees active and past orders, and a detail view with the status timeline.
6. `GET /api/orders/:id/status` serves a small polling payload.
7. The customer cancels only from `PENDING` or `CONFIRMED`.
8. Illegal transitions return `409 INVALID_ORDER_TRANSITION`.
9. Concurrent transitions are serialized by a row lock.
10. A `PENDING` order unanswered for `ORDER_ACCEPT_TIMEOUT_MINUTES` is cancelled by `SYSTEM`.

## Business Rules

BR-O1 – BR-O10 from [master-sdd §7.5](../master-sdd.md#75-order--pricing-rules)
and the full transition table in [§7.3](../master-sdd.md#73-order-state-machine).

The two that define the story: **BR-O1** — an order is a snapshot, so no later
menu edit can change what a customer was charged; and **the customer's
cancellation window closes at `PREPARING`**, because from that point ingredients
are committed and the cost is real.

## Acceptance Criteria

```gherkin
Given my cart has two items totalling 134.00 from a restaurant with a 12.00
  delivery fee and a 15% tax rate
When I check out with a valid address
Then an order is created with subtotal 134.00, deliveryFee 12.00, taxAmount 20.10
  and totalAmount 166.10, and its status is PENDING

Given I place an order
When I inspect the request payload
Then it contains no prices at all — only addressId, an optional note and the payment method

Given I submit a checkout payload containing "totalAmount": "1.00"
When the order is created
Then the field is stripped and the server-computed total is used

Given I placed an order containing "Mixed Grill" at 58.00
When the restaurant later renames the item, changes its price to 70.00 and deletes it
Then my order still shows "Mixed Grill" at 58.00 with the same line total and the
  same order total

Given my cart is empty
When I check out
Then I receive 422 CART_EMPTY

Given my cart contains an item that has become unavailable
When I check out
Then I receive 422 CART_HAS_ISSUES listing the offending line, and no order is created

Given my cart subtotal is below the restaurant's minimum order amount
When I check out
Then I receive 422 BELOW_MINIMUM_ORDER stating the required and actual amounts

Given the restaurant closes between my last cart view and my checkout
When I check out
Then I receive 422 RESTAURANT_UNAVAILABLE and my cart is preserved

Given I pass an address ID belonging to another customer
When I check out
Then I receive 404 RESOURCE_NOT_FOUND

Given my checkout succeeds
When I look at my cart
Then it has been converted, and my next add creates a fresh cart

Given the database fails part-way through my checkout
When the transaction rolls back
Then no order, no order items and no status events exist, and my cart is still ACTIVE

Given my order is PENDING
When I cancel it
Then its status becomes CANCELLED with cancelledBy CUSTOMER and a status event is recorded

Given my order is CONFIRMED
When I cancel it
Then the cancellation succeeds — this is my last cancellation point

Given my order is PREPARING
When I try to cancel it
Then I receive 409 INVALID_ORDER_TRANSITION explaining that customers may cancel
  only while PENDING or CONFIRMED, and the cancel button is absent from my UI

Given my order is DELIVERED
When I try to cancel it
Then I receive 409 — terminal states are terminal

Given I cancel at the same moment the restaurant accepts
When both requests are processed
Then the row lock serialises them: every recorded transition is a legal edge, no
  status is applied twice, and the order never reaches an impossible state.
  Here both requests legitimately succeed — PENDING to CONFIRMED then CONFIRMED
  to CANCELLED are both legal, because my cancellation window is still open at
  CONFIRMED. A 409 arises when two actors attempt the same edge, or once the
  order has reached PREPARING. (Corrected per finding D-06 in
  ../../testing/coverage-analysis.md.)

Given another customer's order ID
When I request it
Then I receive 404 RESOURCE_NOT_FOUND, not 403

Given a restaurant does not respond to my PENDING order within the configured timeout
When the timeout job runs
Then my order is cancelled with cancelledBy SYSTEM and reason ACCEPT_TIMEOUT

Given my order is being tracked
When its status changes
Then my tracking view reflects it within one polling interval, and polling stops
  once the order is DELIVERED or CANCELLED

Given my order has no driver assigned yet
When I view tracking
Then I see a "finding a driver" state rather than an error
```

## API Impact

New: `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`,
`GET /api/orders/:id/status`, `POST /api/orders/:id/cancel`. Payloads in
[api-design §7](../architecture/api-design.md#7-orders--apiorders-customer-view).

## Database Impact

Migration 6: `orders`, `order_items`, `order_status_events` with
`chk_orders_totals`, `chk_order_items_line_total`, `chk_orders_cancel_fields`,
`order_items.food_item_id ON DELETE SET NULL`, and the customer, restaurant,
driver, dispatch and pending-timeout indexes.

`chk_orders_totals` is doing real work: a pricing bug cannot be persisted, only
rejected.

## Frontend Impact

`customer/CheckoutView` (address picker defaulting to the default address, order
note, a single disabled cash-on-delivery option with an explanatory caption, the
summary, and a place-order button disabled with a stated reason while
`canCheckout` is false); `customer/MyOrdersView` with active and past tabs;
`customer/OrderDetailView` and `OrderTrackingView` with `OrderTimeline`;
`OrderCard`; `useOrders` and `useOrderPolling`.

The cancel button is rendered **only** for `PENDING` and `CONFIRMED` — and the
server independently rejects anything else, so the UI is a courtesy rather than
the control.

## Backend Impact

`modules/orders/` complete: `orders.service.js`, `orderStateMachine.js` (pure),
`orderPricing.js` (pure), `orderNumber.js`, repository and mappers. The
`jobs/orderTimeout.job.js`. One `transition()` function is the only code path
that changes an order's status.

## Validation

`addressId` UUID owned by the caller; `customerNote` ≤500;
`paymentMethod = CASH_ON_DELIVERY`; **no price fields exist in the checkout
schema**; cancellation `reason` optional with a default; list filters and
pagination per the shared fragments.

## Error Cases

| Case | Expected |
|------|----------|
| Empty cart | `422 CART_EMPTY` |
| Cart with issues | `422 CART_HAS_ISSUES` with the lines |
| Below minimum | `422 BELOW_MINIMUM_ORDER` with required and actual |
| Restaurant closed at checkout | `422 RESTAURANT_UNAVAILABLE` |
| Address not owned | `404` |
| Cancel at `PREPARING` or later | `409 INVALID_ORDER_TRANSITION` with an explanation |
| Another customer's order | `404` |
| Lost concurrency race | `409` showing the new status |

## Security Considerations

- **Price integrity:** the client sends no prices, the checkout schema has no price fields, and any price-like key is stripped and logged as a possible tampering signal (BR-O5).
- **Ownership in SQL:** order queries carry `customer_user_id = req.user.id`, so another customer's order is a missing row rather than a rejected fetch.
- **Snapshot integrity:** historical orders cannot be rewritten by menu edits, which is a data-integrity control as much as a correctness one.
- **Attribution:** every status change records the actor and role in `order_status_events`, so a dispute has an audit trail.
- Checkout is rate-limited to 20 per hour per user.
- The polling endpoint returns a minimal payload — it is the most-called endpoint in the system and should not ship the full order on every tick.

## Related Specs

- [spec-07 — Order Placement & Lifecycle](../specs/spec-07-order-placement-lifecycle.md) (primary)
- [spec-06 — Cart Management](../specs/spec-06-cart-management.md) (the cart being converted)

## Dependencies

**Depends on:** story-05.
**Must happen before:** story-07 (there must be orders to process) and story-09 (reviews need delivered orders).
**Can happen in parallel with:** nothing on the critical path.

## Testing Requirements

- Unit: the **245-combination state machine matrix** (`status × status × role`) asserted against the §7.3 table; pricing with tax rounding and the `0.1 + 0.2` case; `order_number` format and uniqueness over 10k generations.
- Integration: the `checkout.integration`, `orderLifecycle.integration`, `concurrency.integration` and `transactional.integration` suites. Required: **snapshot fidelity after a rename, reprice and delete** (the defining test for G2); totals matching the check constraint for a multi-line cart; every customer-side legal and illegal transition; a forced mid-transaction failure leaving nothing behind and the cart untouched; two parallel transitions producing one 200 and one 409; the timeout job cancelling as `SYSTEM`.
- Frontend: the timeline renders reached statuses with timestamps; the cancel button appears only for `PENDING`/`CONFIRMED`; each checkout 422 code maps to a specific message; polling stops at a terminal status and pauses when the tab is hidden.
- E2E: place an order and watch it reach `PENDING`; cancel one at `PENDING`; confirm the cancel control is absent at `PREPARING`.
