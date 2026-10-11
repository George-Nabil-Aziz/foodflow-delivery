# Spec 06 — Cart Management

**Status:** Approved · **Owner:** Ordering · **Covers:** FR-5.1 – FR-5.7

## Objective

Maintain one active, single-restaurant cart per customer that always reflects
live menu truth, handles the "switch restaurant" moment explicitly rather than
guessing, and hands checkout a cart that has already been validated.

The cart is where most of this domain's subtle bugs live: prices drift, items
disappear, restaurants close, and customers add something from a second
restaurant. Each of those is specified below rather than left to implementation
instinct.

## Scope

**In scope**
- `carts` and `cart_items` tables.
- Add, update quantity, remove, clear.
- Single-active-cart and single-restaurant invariants.
- The cross-restaurant conflict and the explicit replace flow.
- Live re-validation with per-line issue reporting.
- Server-computed totals preview.
- Cart page, cart drawer/badge, and the switch-restaurant dialog.

**Out of scope** — order creation (spec-07; checkout consumes this spec's
validation), menu authoring (spec-04), saved carts or wishlists (not a feature).

## Actors

**CUSTOMER** only. No other role has a cart; restaurants, drivers and admins get
`403 FORBIDDEN_ROLE` on every route here.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-5.1 | At most one `ACTIVE` cart per customer, created lazily on first add |
| FR-5.2 | A cart is bound to one restaurant, set by its first item |
| FR-5.3 | Adding an item from another restaurant → `409 CART_RESTAURANT_MISMATCH` carrying both restaurant names |
| FR-5.4 | `POST /api/cart/items?replace=true` clears, rebinds and adds in one transaction |
| FR-5.5 | Quantity is an integer 1–20 |
| FR-5.6 | Unavailable, removed, inactive-category and non-orderable-restaurant items cannot be added |
| FR-5.7 | Every cart read re-validates lines against live menu data and reports `issues[]` |
| FR-5.8 | `GET /api/cart` returns server-computed `totals` and a server-decided `canCheckout` |
| FR-5.9 | Adding an item already present increments the existing line |
| FR-5.10 | An empty cart returns 200 with `items: []`, never 404 |

## Business Rules

BR-C1 – BR-C13 from [master-sdd §7.4](../master-sdd.md#74-cart-rules) are
normative. The ones that shape the code:

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-C1 | One `ACTIVE` cart | `uq_carts_one_active` partial unique index — a race cannot produce two |
| BR-C2 | `restaurant_id` set by the first item, immutable while items remain | Service; cleared when the cart empties |
| BR-C3 | Cross-restaurant add is a **conflict**, never a silent mix or a silent wipe | 409 with `currentRestaurant` and `requestedRestaurant` in `details` |
| BR-C4 | `?replace=true` is the only way to switch | One transaction: delete lines → rebind → insert |
| BR-C5 | Quantity 1–20; `0` is not an update | `chk_cart_items_quantity` + Zod |
| BR-C6 | Duplicate add increments | `uq_cart_items_line` + `ON CONFLICT … DO UPDATE` |
| BR-C7 | Add requires: available, not deleted, active category, orderable restaurant | `menu.assertItemOrderable` + `restaurants.assertOrderable` |
| BR-C8 | Reads report issues; **the cart stores no prices** | ADR-008; live join to `food_items` |
| BR-C9 | Checkout blocked while any issue exists | `canCheckout` false; spec-07 returns `422 CART_HAS_ISSUES` |
| BR-C10 | Subtotal below the restaurant's minimum blocks checkout | `meetsMinimum` false; spec-07 returns `422 BELOW_MINIMUM_ORDER` |
| BR-C12 | Successful checkout marks the cart `CONVERTED` | Spec-07, in the checkout transaction |

### The three issue codes

| Issue | Raised when | Customer's resolution |
|-------|-------------|----------------------|
| `ITEM_UNAVAILABLE` | `is_available = false`, or its category went inactive | Remove the line |
| `ITEM_REMOVED` | The item was soft-deleted (the line may already be gone via cascade) | Nothing to do; the line disappears |
| `PRICE_CHANGED` | The live price differs from the price shown when the line was added | Acknowledge the new price |

`PRICE_CHANGED` needs a reference point, and the cart stores no prices — so
`cart_items` carries `price_seen_at_add NUMERIC(10,2)` used **solely** for this
comparison. It is never used in a total and never copied to an order. This is a
deliberate, narrow exception to ADR-008: without it, a price could change
between add and checkout with no way to tell the customer, which is exactly the
scenario the rule exists to prevent. The exception is safe because the column is
write-once and read only by the comparison.

## Data Requirements

```sql
carts (
  id uuid PK,
  customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id uuid NULL REFERENCES restaurants(id) ON DELETE SET NULL,
  status cart_status NOT NULL DEFAULT 'ACTIVE',
  created_at, updated_at
);
CREATE UNIQUE INDEX uq_carts_one_active ON carts (customer_user_id) WHERE status = 'ACTIVE';

cart_items (
  id uuid PK,
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  food_item_id uuid NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  notes text,
  price_seen_at_add numeric(10,2) NOT NULL,
  created_at, updated_at
);
CREATE UNIQUE INDEX uq_cart_items_line ON cart_items (cart_id, food_item_id);
```

`food_item_id ON DELETE CASCADE` is the deliberate opposite of
`order_items`'s `SET NULL`: a cart is a working draft and should lose a deleted
item, while an order is a record and must never lose anything (BR-M2 vs BR-O2).

## API Requirements

| Method | Route | Auth | Role | Errors |
|--------|-------|------|------|--------|
| GET | `/api/cart` | 🔓 | C | 401, 403 |
| POST | `/api/cart/items` | 🔓 | C | 409 `CART_RESTAURANT_MISMATCH`, 422 `ITEM_UNAVAILABLE` / `RESTAURANT_UNAVAILABLE` / `VALIDATION_ERROR`, 404 |
| PATCH | `/api/cart/items/:itemId` | 🔓 | C +own | 404, 422 |
| DELETE | `/api/cart/items/:itemId` | 🔓 | C +own | 404 |
| DELETE | `/api/cart` | 🔓 | C | — (204, idempotent) |

Full payloads including the conflict body in
[api-design §6](../architecture/api-design.md#6-cart--apicart).

## Frontend Requirements

- `cart` Pinia store mirroring the server response — `items`, `restaurant`, `totals`, `issues`, `canCheckout`, `meetsMinimum`, `itemCount`. **It computes nothing.** Duplicating the total client-side guarantees an eventual disagreement about money.
- Header cart badge showing `itemCount`, updated after every mutation.
- `customer/CartView` — line items with quantity steppers (disabled at 1 and 20 with a tooltip explaining why), remove buttons, per-line issue banners with the resolution action, an order summary, a minimum-order progress hint ("SAR 12.00 to reach the minimum"), and a checkout button disabled with a stated reason when `canCheckout` is false.
- **Switch-restaurant dialog** — triggered by catching `CART_RESTAURANT_MISMATCH`: "Your cart has 3 items from Olive Grill. Start a new cart with Pasta House?" with "Keep my cart" as the default action and "Start new cart" as the destructive one. Confirming retries with `?replace=true`. Dismissing changes nothing.
- Add-to-cart from `FoodItemCard` and from the item detail modal, both routed through the same store action, so the conflict is handled identically wherever it happens.

## Backend Requirements

Module `modules/cart/` with `cart.service.js`, `cartValidator.js`,
`cart.repository.js`.

`cartValidator.js` is pure: given cart lines and live item rows, it returns per-
line issues and the cart-level issue summary. Being pure is what makes the
matrix of stale-data cases cheap to test.

**Add flow (the important one):**
1. Open a transaction; `SELECT … FOR UPDATE` the customer's active cart (or create one).
2. `menu.assertItemOrderable(foodItemId)` → 404 / `422 ITEM_UNAVAILABLE`.
3. `restaurants.assertOrderable(item.restaurantId)` → `422 RESTAURANT_UNAVAILABLE`.
4. If the cart has a `restaurant_id` and it differs:
   - `replace !== true` → throw `409 CART_RESTAURANT_MISMATCH` with both names and the current item count.
   - `replace === true` → delete all lines, set the new `restaurant_id`.
5. If the cart is empty or unbound, bind it to the item's restaurant.
6. `INSERT … ON CONFLICT (cart_id, food_item_id) DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 20)`.
7. Commit; return the full re-validated cart.

Step 6's `LEAST` caps rather than failing: a customer clicking "add" on their
20th unit should get 20, not an error about a limit they were not shown.

**Read flow:** load the cart and its lines, fetch the live items in one
`getItemsByIds` call, run `cartValidator`, compute totals through
`shared/money.js`, evaluate `canCheckout = issues.length === 0 && meetsMinimum &&
restaurant.isOrderable && items.length > 0`.

Public interface for spec-07: `getActiveCartForCheckout(customerId, { trx })`
(row-locked, fully validated) and `markConverted(cartId, { trx })`.

## Validation

| Field | Rule |
|-------|------|
| `foodItemId` | UUID, exists, orderable |
| `quantity` | integer 1–20; on add it is the increment, on PATCH the absolute value |
| `notes` | ≤200 chars, optional |
| `replace` | boolean query param, default false |
| `:itemId` | UUID of a `cart_items` row **in the caller's cart** |

## Authorization

`authorize('CUSTOMER')` on every route. Ownership is structural: the cart is
resolved from `req.user.id`, never from a client-supplied cart ID, so there is
no cart to address but your own. `:itemId` is scoped by
`WHERE cart_id = :callersCartId`, so another customer's line ID is a 404.

## Error Handling

| Condition | Response |
|-----------|----------|
| Cross-restaurant add without `replace` | `409 CART_RESTAURANT_MISMATCH` + both restaurants + current item count |
| Unavailable item | `422 ITEM_UNAVAILABLE` naming the item |
| Restaurant closed or paused | `422 RESTAURANT_UNAVAILABLE` with the reason (`CLOSED_NOW` / `NOT_ACCEPTING` / `NOT_ACTIVE`) |
| Quantity 0 or 21 | `422` naming the 1–20 range |
| Another customer's cart line | `404` |
| Item soft-deleted between page load and add | `404 RESOURCE_NOT_FOUND` |
| Empty cart read | `200` with `items: []`, `restaurant: null`, `canCheckout: false` |

## Testing Requirements

Unit — `cartValidator` across the full matrix: available / unavailable /
deleted / price-changed / category-inactive / restaurant-closed; totals
arithmetic including tax rounding; `canCheckout` truth table.

Integration — the `cart.integration` suite in
[testing-strategy §4](../architecture/testing-strategy.md#4-backend-service-and-api-integration-tests).
Required cases: first add creates and binds the cart; second add to the same
restaurant succeeds; **cross-restaurant add returns 409 and leaves the cart
byte-identical**; `?replace=true` clears and rebinds atomically; duplicate add
increments and caps at 20; quantity 0/21 rejected; removing the last line clears
`restaurant_id`; an unavailable item cannot be added; a closed restaurant cannot
be added to; a price change appears as `PRICE_CHANGED` on the next read with the
new price shown; a deleted item disappears from the cart; concurrent adds from
two requests produce exactly one cart (the partial index is doing the work);
another customer's cart is unreachable.

Frontend — the store mirrors and never recomputes; the badge updates after each
mutation; the switch dialog appears on 409 and only replaces on confirmation;
dismissing leaves the cart untouched; the stepper is disabled at both bounds
with an accessible explanation; the checkout button's disabled reason is
rendered as text.

## Edge Cases

| Case | Expected |
|------|----------|
| Two browser tabs add from different restaurants | Whichever commits first binds the cart; the second gets 409 and its UI offers the switch |
| Customer adds, restaurant deletes the item, customer opens the cart | The line is gone (cascade); the cart shows the remaining items and a notice that an item is no longer offered |
| Customer adds, restaurant raises the price, customer opens the cart | The new price is shown with a `PRICE_CHANGED` badge; checkout is blocked until acknowledged (BR-C9) |
| Customer removes every line | Cart stays `ACTIVE` with `restaurant_id = NULL`; the next add from any restaurant succeeds with no conflict |
| Restaurant closes while the cart is open | `canCheckout` false with `RESTAURANT_UNAVAILABLE`; the items are preserved so the customer can order later |
| Cart left for days | Still `ACTIVE` (no expiry in v1, [assumptions.md](../assumptions.md) A-11); revalidation on read handles all staleness |
| Checkout succeeds | Cart becomes `CONVERTED`; the next add creates a fresh `ACTIVE` cart (BR-C12) |
| Quantity PATCH to 0 | `422` — removal is `DELETE`, and conflating the two makes "remove" reachable by accident |

## Related Stories

- [story-05 — Cart Management](../stories/story-05-cart-management.md) (primary)
- [story-06 — Order Placement & Customer Order Tracking](../stories/story-06-order-placement-customer-tracking.md) (consumes the validated cart)

## Dependencies

**Depends on:** [spec-01](spec-01-platform-foundation-api-contract.md), [spec-02](spec-02-identity-authentication-authorization.md), [spec-03](spec-03-restaurant-profile-operations.md) (orderability), [spec-04](spec-04-menu-management.md) (item orderability, live prices).
**Depended on by:** [spec-07](spec-07-order-placement-lifecycle.md).
