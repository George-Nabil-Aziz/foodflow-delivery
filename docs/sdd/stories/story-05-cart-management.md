# Story 05 — Cart Management

**Phase:** 3 · **Depends on:** story-04 · **Blocks:** story-06

## Goal

Give the customer one cart that is always honest: bound to a single restaurant,
priced from live menu data, explicit about the "you already have items from
somewhere else" moment, and clear about why checkout is or is not available.

## User Story

> As a **customer**
> I want to collect items from one restaurant in a cart and adjust it before ordering
> So that I can review exactly what I am buying and what it costs before committing.

## Scope

**In:** `carts`, `cart_items`; add, update quantity, remove, clear; the
single-active-cart and single-restaurant invariants; the cross-restaurant
conflict and the explicit replace flow; live re-validation with per-line issues;
server-computed totals; the cart page, header badge and switch-restaurant
dialog.

**Out:** checkout and order creation (story-06), menu authoring (story-03),
saved carts or wishlists (not a feature).

## Actors

**CUSTOMER** only. Every other role receives `403 FORBIDDEN_ROLE` on these
routes.

## Preconditions

- Story-04 complete: the customer can reach a menu and see orderable items.
- Story-02 complete: the customer is authenticated.

## Functional Requirements

Implements spec-06 in full: FR-5.1 – FR-5.10.

1. At most one `ACTIVE` cart per customer, created lazily on the first add.
2. The cart binds to one restaurant, set by its first item.
3. Adding an item from another restaurant returns `409 CART_RESTAURANT_MISMATCH` carrying both restaurant names and the current item count.
4. `?replace=true` clears, rebinds and adds in one transaction.
5. Quantity is an integer 1–20.
6. Unavailable, removed, inactive-category and non-orderable-restaurant items cannot be added.
7. Every read re-validates against live menu data and reports per-line `issues[]`.
8. Totals and `canCheckout` are computed by the server.
9. Adding an item already in the cart increments the existing line, capped at 20.
10. An empty cart returns 200 with `items: []`, never 404.

## Business Rules

BR-C1 – BR-C13 from [master-sdd §7.4](../master-sdd.md#74-cart-rules).

The defining one is **BR-C3**: a cross-restaurant add is a *conflict*, never a
silent mix and never a silent wipe. Silently mixing produces an order no
restaurant can fulfil; silently wiping destroys work the customer did not agree
to lose. The server refuses and hands the client everything it needs to ask.

The cart stores no prices (ADR-008) — with one narrow exception,
`cart_items.price_seen_at_add`, which exists solely so `PRICE_CHANGED` can be
detected. It is write-once, never totalled, and never copied into an order.

## Acceptance Criteria

```gherkin
Given I have no cart
When I add an item from Olive Grill
Then a cart is created, bound to Olive Grill, containing that item

Given my cart contains 3 items from Olive Grill
When I add an item from Pasta House
Then I receive 409 CART_RESTAURANT_MISMATCH containing both restaurant names
  and my current item count, and my cart is completely unchanged

Given I received CART_RESTAURANT_MISMATCH
When I am shown the switch dialog and I choose "Keep my cart"
Then nothing changes — no request is sent and my three items remain

Given I received CART_RESTAURANT_MISMATCH
When I confirm "Start new cart with Pasta House"
Then the request is retried with replace=true, my cart is emptied, rebound to
  Pasta House, and contains only the new item

Given my cart contains 2 units of Mixed Grill
When I add Mixed Grill again with quantity 1
Then the existing line becomes 3 units — no duplicate line is created

Given my cart contains 19 units of an item
When I add 5 more
Then the line is capped at 20 rather than failing

Given a cart line exists
When I set its quantity to 0
Then I receive 422 — removal is a DELETE, not a quantity update

Given a cart line exists
When I set its quantity to 21
Then I receive 422 naming the 1–20 range

Given an item is marked unavailable
When I try to add it
Then I receive 422 ITEM_UNAVAILABLE naming the item

Given a restaurant is outside its opening hours
When I try to add one of its items
Then I receive 422 RESTAURANT_UNAVAILABLE with the reason CLOSED_NOW

Given my cart contains an item whose price then changes from 58.00 to 62.00
When I view my cart
Then the line shows 62.00, carries the issue PRICE_CHANGED, and canCheckout is false

Given my cart contains an item that the restaurant then marks unavailable
When I view my cart
Then the line carries the issue ITEM_UNAVAILABLE and canCheckout is false

Given my cart contains an item that the restaurant then deletes
When I view my cart
Then the line is gone and I am told an item is no longer offered

Given my cart subtotal is below the restaurant's minimum order amount
When I view my cart
Then meetsMinimum is false, canCheckout is false, and I am shown how much more is needed

Given I remove the last item from my cart
Then the cart remains ACTIVE with no restaurant binding, and my next add from
  any restaurant succeeds without a conflict

Given I have never created a cart
When I request my cart
Then I receive 200 with an empty item list and a null restaurant, not 404

Given another customer's cart line ID
When I try to modify it
Then I receive 404 RESOURCE_NOT_FOUND

Given two of my browser tabs add items from different restaurants at the same moment
When both requests are processed
Then exactly one cart exists, bound to whichever committed first, and the other
  request receives 409
```

## API Impact

New: `GET /api/cart`, `POST /api/cart/items` (with `?replace=true`),
`PATCH /api/cart/items/:itemId`, `DELETE /api/cart/items/:itemId`,
`DELETE /api/cart`. Full payloads, including the conflict body, in
[api-design §6](../architecture/api-design.md#6-cart--apicart).

## Database Impact

Migration 5: `carts` and `cart_items` with
`uq_carts_one_active ON carts (customer_user_id) WHERE status = 'ACTIVE'`,
`uq_cart_items_line (cart_id, food_item_id)`, the 1–20 quantity check, and
`food_item_id ON DELETE CASCADE` — the deliberate opposite of `order_items`'s
`SET NULL`, because a cart is a draft that should lose a deleted item and an
order is a record that must not.

## Frontend Impact

`cart` Pinia store mirroring the server response and computing nothing; the
header cart badge; `customer/CartView` with quantity steppers bounded at 1 and
20, per-line issue banners with a resolution action, a minimum-order progress
hint and a checkout button whose disabled reason is rendered as text; the
**switch-restaurant dialog** with "Keep my cart" as the default action;
`CartLineItem` and `CartSummary`.

Add-to-cart from the menu card and from the item modal both route through one
store action, so the conflict is handled identically wherever it happens.

## Backend Impact

`modules/cart/` with `cart.service.js`, `cartValidator.js` (pure) and
`cart.repository.js`. The add flow row-locks the cart, checks item and
restaurant orderability through the `menu` and `restaurants` interfaces, handles
the binding/conflict/replace branch, then upserts with
`ON CONFLICT … DO UPDATE SET quantity = LEAST(quantity + EXCLUDED.quantity, 20)`.

## Validation

`foodItemId` UUID and orderable; `quantity` integer 1–20 (an increment on add,
an absolute value on PATCH); `notes` ≤200; `replace` boolean query param;
`:itemId` scoped to the caller's own cart.

## Error Cases

| Case | Expected |
|------|----------|
| Cross-restaurant add without `replace` | `409 CART_RESTAURANT_MISMATCH` with both restaurants and the item count |
| Unavailable item | `422 ITEM_UNAVAILABLE` |
| Closed or paused restaurant | `422 RESTAURANT_UNAVAILABLE` with the reason |
| Quantity 0 or 21 | `422` |
| Another customer's line | `404` |
| Item deleted between page load and add | `404` |
| Empty cart read | `200` with `items: []` |

## Security Considerations

- The cart is resolved from `req.user.id`; **no route accepts a cart ID**, so there is no cart to address but your own.
- `:itemId` is scoped by `WHERE cart_id = :callersCartId`, making another customer's line a 404.
- Prices come from the database on every read, so a tampered client cannot influence what is displayed or, later, charged.
- `authorize('CUSTOMER')` on every route; the other three roles are rejected.
- The one active cart per customer is a database invariant, not a service convention, so a concurrent request cannot produce two.

## Related Specs

- [spec-06 — Cart Management](../specs/spec-06-cart-management.md) (implements in full)
- [spec-04 — Menu Management](../specs/spec-04-menu-management.md) (item orderability and live prices)

## Dependencies

**Depends on:** story-04 (and transitively story-02, story-03).
**Must happen before:** story-06 — checkout consumes this story's validated cart.
**Can happen in parallel with:** story-10's admin screens.

## Testing Requirements

- Unit: `cartValidator` across the full staleness matrix — available, unavailable, deleted, price-changed, category-inactive, restaurant-closed; totals arithmetic including tax rounding; the `canCheckout` truth table.
- Integration: the `cart.integration` suite from [testing-strategy §4](../architecture/testing-strategy.md#4-backend-service-and-api-integration-tests). Required: first add binds; **cross-restaurant add returns 409 and leaves the cart byte-identical**; `?replace=true` clears and rebinds atomically; duplicate add increments and caps; quantity bounds; removing the last line clears the binding; unavailable and closed-restaurant adds rejected; price change surfacing as `PRICE_CHANGED` with the new price; a deleted item disappearing; **concurrent adds producing exactly one cart**; another customer's cart unreachable.
- Frontend: the store mirrors and never recomputes; the badge updates after each mutation; the switch dialog appears on 409, replaces only on confirmation, and leaves the cart untouched on dismissal; the stepper is disabled at both bounds with an accessible explanation; the checkout button's disabled reason is text.
- E2E: `cart-restaurant-switch` — build a cart, attempt a cross-restaurant add, confirm the switch, verify the old items are gone and the new one is present.
