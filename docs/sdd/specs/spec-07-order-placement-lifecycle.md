# Spec 07 — Order Placement & Lifecycle

**Status:** Approved · **Owner:** Ordering · **Covers:** FR-6.1 – FR-6.7, G2, G3, NFR-7, NFR-8

## Objective

Turn a validated cart into an immutable order, and govern that order's life
through one state machine that every actor must pass through. This is the
system's core: the correctness of the money, the history and the permissions all
converge here.

## Scope

**In scope**
- `orders`, `order_items`, `order_status_events` tables.
- Checkout: cart → order snapshot, server-computed totals.
- The order-writing function shared with an admin placing an order for a customer (FR-9.10, spec-10).
- The state machine and all ten transitions.
- Customer order history, detail, tracking and cancellation.
- Restaurant order queue and the accept/reject/prepare/ready actions.
- Order status events as an audit trail.
- The status-polling endpoint.

**Out of scope** — driver assignment and the driver's two transitions
(spec-08 owns dispatch; this spec owns T7/T9's legality), reviews (spec-09),
admin force-cancel UI (spec-10; the transition itself is here), payments
(non-goal).

## Actors

All four, each with a distinct and non-overlapping set of permitted transitions
([master-sdd §7.3](../master-sdd.md#73-order-state-machine)), plus `SYSTEM` for
the accept timeout.

An order is placed by its customer at checkout, or by an admin on the
customer's behalf (FR-9.10). Both go through the same rules; only the actor of
the first event differs.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-6.1 | `POST /api/orders` converts the active cart into an order with a full item snapshot |
| FR-6.2 | Totals are computed server-side; the request contains no prices |
| FR-6.3 | Status changes are legal only per the §7.3 table |
| FR-6.4 | Every transition writes an `order_status_events` row naming the actor |
| FR-6.5 | Each role sees exactly its own orders through its own endpoints |
| FR-6.6 | Customers cancel only from `PENDING` or `CONFIRMED` |
| FR-6.7 | `DELIVERED` = completed; `DELIVERED`/`CANCELLED` = closed |
| FR-6.8 | Checkout is one atomic transaction |
| FR-6.9 | Concurrent transitions are serialized; the loser gets 409 |
| FR-6.10 | `GET /api/orders/:id/status` provides a small polling payload |
| FR-6.11 | A `PENDING` order unanswered for `ORDER_ACCEPT_TIMEOUT_MINUTES` is cancelled by `SYSTEM` |

## Business Rules

BR-O1 – BR-O10 from [master-sdd §7.5](../master-sdd.md#75-order--pricing-rules)
and the full §7.3 transition table are normative. BR-O1 – BR-O7 apply equally to
an order an admin places (`POST /api/admin/orders`, BR-AD11), because it is
written by the same function as checkout.

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-O1 | Item name, description and price are snapshotted at checkout | `order_items` snapshot columns; nothing reads `food_items` afterwards |
| BR-O2 | `food_item_id` is `ON DELETE SET NULL` | The snapshot is the truth |
| BR-O3 | The totals formula | `orderPricing.js` + `chk_orders_totals` |
| BR-O4 | `delivery_fee` snapshotted from the restaurant | Copied in the checkout transaction |
| BR-O5 | Client prices are ignored | Not in the schema; presence logged |
| BR-O6 | Address snapshotted as JSONB | `delivery_address_snapshot` |
| BR-O7 | `order_number` = `FF-YYYYMMDD-XXXXXX` | `orderNumber.js` + unique index with retry on collision |
| BR-O8 | Cancellation requires `cancelled_by` + reason | `chk_orders_cancel_fields` |
| BR-O9 | `SELECT … FOR UPDATE` before every transition | `orderRepo.findByIdForUpdate` |
| BR-O10 | Multiple concurrent orders per customer are allowed | No constraint prevents it |

## Data Requirements

`orders`, `order_items`, `order_status_events` per
[database-design §4](../architecture/database-design.md#4-table-detail).

The constraints that make G2 and G3 structural rather than aspirational:
- `chk_orders_totals (total_amount = subtotal + delivery_fee + tax_amount)` — a pricing bug cannot persist.
- `chk_order_items_line_total (line_total = unit_price * quantity)`.
- `chk_orders_cancel_fields` — a cancellation without attribution cannot be stored.
- `order_items.food_item_id ON DELETE SET NULL`.
- `idx_orders_pending_timeout` for the timeout job.

## API Requirements

| Method | Route | Auth | Role | Transition |
|--------|-------|------|------|------------|
| POST | `/api/orders` | 🔓 | C | create → `PENDING` |
| GET | `/api/orders` | 🔓 | C +own | — |
| GET | `/api/orders/:id` | 🔓 | C +own | — |
| GET | `/api/orders/:id/status` | 🔓 | C +own | — |
| POST | `/api/orders/:id/cancel` | 🔓 | C +own | T2 / T4 |
| GET | `/api/restaurant/orders` | 🔓 | R +own | — |
| GET | `/api/restaurant/orders/:id` | 🔓 | R +own | — |
| POST | `/api/restaurant/orders/:id/accept` | 🔓 | R +own | T1 |
| POST | `/api/restaurant/orders/:id/reject` | 🔓 | R +own | T2 |
| POST | `/api/restaurant/orders/:id/start-preparing` | 🔓 | R +own | T3 |
| POST | `/api/restaurant/orders/:id/ready` | 🔓 | R +own | T5 |
| POST | `/api/restaurant/orders/:id/cancel` | 🔓 | R +own | T4 / T6 |
| POST | `/api/admin/orders` | 🔓 | A | create → `PENDING` (spec-10, FR-9.10) |
| POST | `/api/admin/orders/:id/force-cancel` | 🔓 | A | T2/T4/T6/T8/T10 |

Driver transitions T7 and T9 are routed under `/api/driver` and specified in
spec-08, but their legality is decided by this spec's state machine.

Payloads in [api-design §7](../architecture/api-design.md#7-orders--apiorders-customer-view).

## Frontend Requirements

- `customer/CheckoutView` — address picker (defaulting to the default address), order note, payment method (a single disabled `Cash on delivery` option with an explanatory caption rather than a hidden field), an order summary, and a place-order button that is disabled while `canCheckout` is false with the reason shown.
- `customer/MyOrdersView` — active and past tabs, order cards with number, restaurant, status badge, total and time.
- `customer/OrderDetailView` / `OrderTrackingView` — an `OrderTimeline` of the seven statuses with timestamps, the current step highlighted, the delivery address and items, the driver's name and masked phone once `OUT_FOR_DELIVERY`, a cancel button present **only** while `PENDING`/`CONFIRMED`, and a "finding a driver" state when `dispatchState = UNASSIGNED`.
- `restaurant/IncomingOrdersView` — polled queue grouped by status, each card carrying only the actions legal from its current status, with an audible/visual cue on a new `PENDING` order.
- `OrderActionBar` — derives its buttons from the same transition table shape as the backend, so an illegal action is not offerable. The server still re-checks; the UI is a courtesy, not a control.

## Backend Requirements

Module `modules/orders/` with `orders.service.js`, `orderStateMachine.js`
(pure), `orderPricing.js` (pure), `orderNumber.js`, `orders.repository.js`,
`orders.mapper.js`.

### Checkout transaction (FR-6.8)

```text
BEGIN
  cart = cart.getActiveCartForCheckout(customerId, { trx })   -- FOR UPDATE
  if empty                      → 422 CART_EMPTY
  restaurants.assertOrderable(cart.restaurantId, { trx })     → 422 RESTAURANT_UNAVAILABLE
  items = menu.getItemsByIds(cart.itemIds, { trx })
  issues = cartValidator(cart.lines, items)
  if issues.length             → 422 CART_HAS_ISSUES (issues in details)
  totals = orderPricing(items, cart.lines, restaurant.deliveryFee, TAX_RATE)
  if totals.subtotal < restaurant.minimumOrderAmount → 422 BELOW_MINIMUM_ORDER
  address = users.getAddressForOrder(customerId, addressId)   → 404 if not owned
  order = INSERT orders(... snapshots, totals, PENDING, dispatch_state NOT_REQUIRED)
  INSERT order_items(... name/description/price snapshots)
  INSERT order_status_events(null → PENDING, actor CUSTOMER)
  cart.markConverted(cart.id, { trx })
COMMIT
notify(restaurant, 'NEW_ORDER')        -- after commit, never inside it
```

Notification is deliberately outside the transaction: a failing notification must
not roll back a paid-for order, and a transaction must not wait on I/O it does
not control.

From the pricing step to the first event, the steps live in one function,
`insertOrder` in `orders.service.js`. Checkout calls it with the cart's lines
and actor `CUSTOMER`. `adminPlaceOrder` calls it for an admin placing an order
for a customer (spec-10, FR-9.10):

```text
BEGIN                                            -- the admin module's transaction
  customer must be an ACTIVE CUSTOMER            → 404 / 422
  restaurants.assertOrderable(restaurantId)      → 422 RESTAURANT_UNAVAILABLE
  for each item: menu.assertItemOrderable(id)    → 404 / 422 ITEM_UNAVAILABLE
    item of another restaurant                   → 404
  insertOrder(..., paymentMethod CASH_ON_DELIVERY, actor ADMIN)
    -- totals, BELOW_MINIMUM_ORDER, the customer's address (404 if not theirs),
    -- snapshots, order number, INSERT order_status_events(null → PENDING, actor ADMIN)
  audit(ORDER_PLACED)
COMMIT
notifyNewOrder(order)                            -- after commit, as at checkout
```

The customer's cart is not read or changed. The first event's `actor_user_id`
is the admin's id, so the timeline shows who placed the order.

### Transition service

```js
async function transition(orderId, toStatus, actor, { reason, note } = {}) {
  return withTransaction(async (trx) => {
    const order = await orderRepo.findByIdForUpdate(orderId, trx);   // BR-O9
    if (!order) throw new NotFoundError('RESOURCE_NOT_FOUND');
    assertActorOwnsOrder(order, actor);                              // 404 if not
    assertTransition(order.status, toStatus, { actorRole: actor.role, reason });
    const updated = await orderRepo.updateStatus(orderId, toStatus, { reason, note, actor }, trx);
    await orderRepo.appendEvent({ orderId, from: order.status, to: toStatus,
                                  actorUserId: actor.id, actorRole: actor.role, reason, note }, trx);
    await onTransition(updated, toStatus, trx);   // dispatch on CONFIRMED, release driver on DELIVERED/CANCELLED
    return updated;
  });
}
```

Every action endpoint is a thin wrapper over this one function. There is exactly
one code path that changes an order's status, which is what makes G3 testable.

`onTransition` side effects:

| To status | Effect |
|-----------|--------|
| `CONFIRMED` | `confirmed_at`; `delivery.requestDispatch(orderId, { trx })` (BR-D1) |
| `PREPARING` | `preparing_at` |
| `READY_FOR_PICKUP` | `ready_at` |
| `OUT_FOR_DELIVERY` | `picked_up_at` |
| `DELIVERED` | `delivered_at`; `dispatch_state = COMPLETED`; `delivery.releaseDriver(driverId, { trx })` |
| `CANCELLED` | `cancelled_at`, `cancelled_by`, reason; cancel any live assignment; release the driver if one was assigned |

## Validation

| Endpoint | Rules |
|----------|-------|
| `POST /api/orders` | `addressId` UUID owned by the caller; `customerNote` ≤500; `paymentMethod = CASH_ON_DELIVERY`. **No price fields exist in the schema** (BR-O5) |
| `POST .../reject`, `.../cancel` (restaurant), `force-cancel` | `reason` required, from the `cancellation_reason` enum; `note` ≤300 |
| `POST /api/orders/:id/cancel` | `reason` optional, defaults to `CUSTOMER_CHANGED_MIND` |
| List endpoints | `status` from the enum, `scope ∈ {active, past}`, pagination |

## Authorization

| Route group | Guard | Ownership |
|-------------|-------|-----------|
| `/api/orders*` | `CUSTOMER` | `customer_user_id = req.user.id` in SQL |
| `/api/restaurant/orders*` | `RESTAURANT` + approved | `restaurant_id = req.restaurant.id` in SQL |
| `/api/admin/orders*` | `ADMIN` | None; audited |

Role alone is never sufficient: a restaurant accepting another restaurant's
order passes `authorize('RESTAURANT')` and must be stopped by the ownership
check, which returns 404 (ADR-010). This is the single most important
authorization test in the suite.

## Error Handling

| Condition | Response |
|-----------|----------|
| Empty cart | `422 CART_EMPTY` |
| Cart has issues | `422 CART_HAS_ISSUES` with the offending lines |
| Below minimum | `422 BELOW_MINIMUM_ORDER` with `required` and `actual` |
| Restaurant closed at checkout | `422 RESTAURANT_UNAVAILABLE` with the reason |
| Address not owned | `404` |
| Illegal transition | `409 INVALID_ORDER_TRANSITION` with the current status and what the actor may do instead |
| Customer cancelling at `PREPARING` | `409` explaining the cancellation window (T6) |
| Restaurant acting on another's order | `404` |
| Missing reason on a rejection | `422` |
| Lost concurrency race | `409 INVALID_ORDER_TRANSITION` — the state changed underneath |

## Testing Requirements

Unit — the **245-combination state machine matrix** (`status × status × role`)
asserted against the §7.3 table; pricing including tax rounding and the
`0.1 + 0.2` case; `order_number` format and uniqueness over 10k generations.

Integration — the `checkout.integration`, `orderLifecycle.integration`,
`concurrency.integration` and `transactional.integration` suites from
[testing-strategy §4](../architecture/testing-strategy.md#4-backend-service-and-api-integration-tests).
Required, in particular:
- Snapshot fidelity: place an order, change the item's name and price, delete the item, then re-read the order — every field identical, `food_item_id` null (G2, BR-O1, BR-O2).
- Totals equal the check constraint's expectation for a multi-line cart.
- Every legal transition by the right actor succeeds and stamps its timestamp and event row.
- Every illegal transition returns 409 — driven by the same table the implementation uses, so a table change breaks the test.
- Two parallel accepts → one 200, one 409 (NFR-8).
- A forced failure after `order_items` insert leaves no order, no items and an `ACTIVE` cart (NFR-7).
- The timeout job cancels a stale `PENDING` order as `SYSTEM` with `ACCEPT_TIMEOUT`.

Frontend — the timeline renders all reached statuses with timestamps; the cancel
button appears exactly for `PENDING`/`CONFIRMED`; `OrderActionBar` offers only
legal actions per status; checkout surfaces each 422 code with a specific
message; polling stops at a terminal status.

## Edge Cases

| Case | Expected |
|------|----------|
| Customer cancels while the restaurant accepts | Row lock serializes; one wins, the other gets 409 with the new status |
| Restaurant cancels a `PREPARING` order | Allowed with a reason (T6); the customer sees the reason |
| Restaurant never responds | `SYSTEM` cancels at the timeout with `ACCEPT_TIMEOUT` |
| No driver available | The order is **not** cancelled; `dispatch_state = UNASSIGNED`; the customer sees "finding a driver" (FR-7.4) |
| Item deleted between cart add and checkout | `422 CART_HAS_ISSUES` — the customer resolves it explicitly |
| Restaurant closes between cart and checkout | `422 RESTAURANT_UNAVAILABLE` |
| Customer deletes the delivery address after ordering | The order keeps its JSONB snapshot; the driver still has the address (BR-O6, BR-A8) |
| Two orders from the same customer at once | Both proceed independently (BR-O10) |
| Admin force-cancels an `OUT_FOR_DELIVERY` order | Allowed (T10); the driver is released to `AVAILABLE` |
| Restaurant suspended mid-order | The order completes (BR-R9) |

## Related Stories

- [story-06 — Order Placement & Customer Order Tracking](../stories/story-06-order-placement-customer-tracking.md) (primary)
- [story-07 — Restaurant Order Processing](../stories/story-07-restaurant-order-processing.md) (primary)
- [story-08 — Driver Onboarding & Delivery Execution](../stories/story-08-driver-onboarding-delivery-execution.md) (T7, T9)
- [story-10 — Platform Administration](../stories/story-10-platform-administration-reporting.md) (force-cancel, order oversight)

## Dependencies

**Depends on:** [spec-01](spec-01-platform-foundation-api-contract.md), [spec-02](spec-02-identity-authentication-authorization.md), [spec-03](spec-03-restaurant-profile-operations.md), [spec-04](spec-04-menu-management.md), [spec-06](spec-06-cart-management.md).
**Depended on by:** [spec-08](spec-08-delivery-assignment-driver-operations.md), [spec-09](spec-09-reviews-ratings.md), [spec-10](spec-10-platform-administration-reporting.md).
