# Test Cases — Cart (TC-135 – TC-166)

> Covers [spec-06](../../sdd/specs/spec-06-cart-management.md) ·
> [story-05](../../sdd/stories/story-05-cart-management.md) ·
> FR-5.1 – FR-5.10 · BR-C1 – BR-C13 · [ADR-008](../../sdd/architecture/system-architecture.md#adr-008-carts-reference-live-prices-orders-snapshot-them)

**Priority rationale.** The cart is where this domain's subtle bugs live —
prices drift, items vanish, restaurants close, customers add from a second
restaurant. Anything that could lose customer work or mislead about price is
Critical; the rest is High.

**The single most important assertion in this file** is that a rejected
cross-restaurant add leaves the cart **byte-identical** (TC-140). Both obvious
implementations are wrong: silently mixing produces an order no kitchen can
fulfil, silently wiping destroys work the customer never agreed to lose.

---

## Cart creation and the single-cart invariant

### TC-135 — First add creates a cart and binds it to the restaurant
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-01 · **Rules** FR-5.1, BR-C2
**Type** API · **Priority** High
**Pre** `CUST_NEW` has no cart.
**Steps** 1. `POST /api/cart/items` `{ foodItemId: ITEM_GRILL, quantity: 1 }`.
**Expected** 201/200; one `ACTIVE` cart bound to `REST_A` with one line.

### TC-136 — Reading a cart that has never existed returns an empty cart
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-16 · **Rules** FR-5.10
**Type** API · **Priority** High
**Data** `CUST_NEW`
**Steps** 1. `GET /api/cart`.
**Expected** **200**, not 404; `items: []`, `restaurant: null`, `canCheckout: false`, `totals` all `"0.00"`.
**Notes** A 404 here would force every client to treat a normal empty state as an error.

### TC-137 — Concurrent first adds produce exactly one cart
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-18 · **Rules** BR-C1, NFR-8
**Type** Service · **Priority** Critical
**Pre** `CUST_NEW` has no cart.
**Steps** 1. Fire two `POST /api/cart/items` requests concurrently.
**Expected** Exactly one row in `carts` with `status = 'ACTIVE'` for that customer.
**Notes** Proves `uq_carts_one_active` is present and arbitrating. A service-level "find or create" would lose this race and leave the customer with two carts, one of which would silently disappear at checkout.

### TC-138 — Adding to an existing cart of the same restaurant succeeds
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** BR-C2
**Type** API · **Priority** High
**Pre** Cart bound to `REST_A` with `ITEM_GRILL`.
**Steps** 1. Add `ITEM_SOUP` (same restaurant).
**Expected** 200; two lines; binding unchanged.

---

## The restaurant-switch rule

### TC-139 — Cross-restaurant add returns a conflict with both restaurant names
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-02 · **Rules** FR-5.3, BR-C3
**Type** API · **Priority** Critical
**Pre** `CART_A_VALID` bound to `REST_A` with 3 items.
**Steps** 1. `POST /api/cart/items` `{ foodItemId: ITEM_B_PASTA }`.
**Expected** 409 `CART_RESTAURANT_MISMATCH`; `details[0]` carries `currentRestaurant` (id, name, `itemCount: 3`) and `requestedRestaurant` (id, name).
**Notes** The client needs both names to render "Start a new cart with Pasta House?" without a second round trip.

### TC-140 — A rejected cross-restaurant add leaves the cart byte-identical
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-02 · **Rules** BR-C3
**Type** Service · **Priority** Critical
**Steps** 1. Snapshot every `cart` and `cart_items` row and `updated_at`. 2. Attempt the cross-restaurant add. 3. Re-snapshot.
**Expected** 409 and the two snapshots are **identical**, including `updated_at`.
**Notes** The defining case for [R-03](../../sdd/risks.md). A status-code-only assertion would pass even if the server had emptied the cart.

### TC-141 — `?replace=true` clears, rebinds and adds atomically
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-04 · **Rules** FR-5.4, BR-C4
**Type** Service · **Priority** Critical
**Pre** `CART_A_VALID` (3 items, `REST_A`).
**Steps** 1. `POST /api/cart/items?replace=true` `{ foodItemId: ITEM_B_PASTA, quantity: 1 }`.
**Expected** 200; the cart now holds exactly one line (`ITEM_B_PASTA`) and is bound to `REST_B`; no `REST_A` lines remain.
**Post** One transaction — no observable intermediate state with lines from both restaurants.

### TC-142 — Replace on a failing add does not empty the cart
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** BR-C4, NFR-7
**Type** Service · **Priority** Critical
**Steps** 1. `POST /api/cart/items?replace=true` with an item that is unavailable.
**Expected** 422 `ITEM_UNAVAILABLE`; the original `REST_A` cart is **still intact**.
**Notes** The clear must happen inside the same transaction as the add, after validation. Clearing first and then failing would destroy the cart for nothing.

### TC-143 — Emptying the cart unbinds the restaurant
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-15 · **Rules** BR-C2
**Type** API · **Priority** High
**Steps** 1. Remove every line. 2. `GET /api/cart`. 3. Add an item from `REST_B`.
**Expected** After step 1 the cart is `ACTIVE` with `restaurant_id = NULL`; step 3 succeeds with **no** conflict.

### TC-144 — `DELETE /api/cart` empties and unbinds, idempotently
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** FR-5.4
**Type** API · **Priority** Medium
**Steps** 1. `DELETE /api/cart` twice.
**Expected** 204 both times; no error on the second.

---

## Quantities

### TC-145 — Adding an existing item increments its line
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-05 · **Rules** FR-5.9, BR-C6
**Type** API · **Priority** High
**Pre** Cart holds 2 × `ITEM_GRILL`.
**Steps** 1. Add `ITEM_GRILL` with `quantity: 1`.
**Expected** 200; **one** line with `quantity: 3` — not a second line.

### TC-146 — Increment caps at 20 rather than failing
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-06 · **Rules** BR-C5
**Type** API · **Priority** High
**Data** `CART_A_NEAR_MAX` (19 units)
**Steps** 1. Add 5 more of the same item.
**Expected** 200; quantity is **20**.
**Notes** Capping rather than erroring is deliberate: a customer clicking "add" on their 20th unit should get 20, not an error about a limit they were never shown.

### TC-147 — Quantity boundary values on add and update
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-07, AC-05-08 · **Rules** FR-5.5, BR-C5
**Type** API · **Priority** High
**Steps** 1. Add/update with `-1`, `0`, `1`, `20`, `21`, `1.5`, `"2"`, `999999999999`.
**Expected** 422 · 422 · 200 · 200 · 422 · 422 · 200 (coerced) · 422.
**Notes** `0` is explicitly 422 — removal is `DELETE`. Conflating them makes "remove" reachable by an off-by-one in a stepper.

### TC-148 — Quantity update sets an absolute value
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** FR-5.5
**Type** API · **Priority** High
**Pre** A line with quantity 5.
**Steps** 1. `PATCH /api/cart/items/{id}` `{ quantity: 2 }`.
**Expected** 200; quantity is 2, not 7 — `PATCH` is absolute while add is an increment.

### TC-149 — Removing a line leaves the rest intact
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** FR-5.4
**Type** API · **Priority** High
**Pre** Cart with two lines.
**Steps** 1. `DELETE /api/cart/items/{first}`.
**Expected** 204; one line remains with unchanged quantity; totals recomputed.

---

## Orderability of items and restaurants

### TC-150 — An unavailable item cannot be added
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-09 · **Rules** FR-5.6, BR-C7
**Type** API · **Priority** High
**Data** `ITEM_UNAVAILABLE`
**Steps** 1. Add it.
**Expected** 422 `ITEM_UNAVAILABLE` naming the item; cart unchanged.

### TC-151 — An item in an inactive category cannot be added
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** BR-C7, BR-R7
**Type** API · **Priority** High
**Data** `ITEM_IN_INACTIVE_CAT`
**Steps** 1. Add it.
**Expected** 422 or 404 per the item-orderability check; cart unchanged.
**Notes** The item's own `is_available` is true — the category's state is what disqualifies it.

### TC-152 — A soft-deleted item cannot be added
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** BR-C7
**Type** API · **Priority** High
**Data** `ITEM_DELETED`
**Steps** 1. Add it.
**Expected** 404 `RESOURCE_NOT_FOUND`.

### TC-153 — Items of a closed or paused restaurant cannot be added
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-10 · **Rules** BR-C7, BR-R3
**Type** API · **Priority** High
**Steps** 1. Add an item of `REST_CLOSED`. 2. Add an item of `REST_PAUSED`. 3. Add an item of `REST_SUSPENDED`.
**Expected** 422 `RESTAURANT_UNAVAILABLE` with reasons `CLOSED_NOW`, `NOT_ACCEPTING` and `NOT_ACTIVE` respectively.

---

## Live revalidation and pricing

### TC-154 — The cart stores no price column
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** ADR-008
**Type** Service · **Priority** Critical
**Steps** 1. Inspect the `cart_items` schema.
**Expected** No price column other than `price_seen_at_add`, which is documented as write-once and used **only** for change detection — never in a total.

### TC-155 — Cart reads show live menu prices
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-11 · **Rules** BR-C8, ADR-008
**Type** Integration · **Priority** Critical
**Pre** Cart holds `ITEM_GRILL` added at 58.00.
**Steps** 1. As `OWNER_A`, change the price to 62.00. 2. As `CUST_A`, `GET /api/cart`.
**Expected** The line shows `unitPrice: "62.00"` and `lineTotal` computed from 62.00.
**Notes** The customer is never shown one price and charged another.

### TC-156 — A price change raises PRICE_CHANGED and blocks checkout
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-11 · **Rules** BR-C8, BR-C9
**Type** Integration · **Priority** Critical
**Steps** 1. Change the item price after it was added. 2. `GET /api/cart`.
**Expected** The line's `issues` contains `PRICE_CHANGED`; cart-level `issues` contains it; `canCheckout` is **false**.

### TC-157 — An item becoming unavailable raises ITEM_UNAVAILABLE on read
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-12 · **Rules** BR-C8
**Type** Integration · **Priority** Critical
**Steps** 1. Add `ITEM_GRILL`. 2. As the owner, toggle it unavailable. 3. `GET /api/cart`.
**Expected** The line carries `ITEM_UNAVAILABLE`; `canCheckout` false; the line is **not** silently removed.

### TC-158 — A deleted item disappears from the cart
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-13 · **Rules** BR-M2
**Type** Integration · **Priority** High
**Steps** 1. Add an item. 2. As the owner, delete it. 3. `GET /api/cart`.
**Expected** The line is gone (FK cascade) and the response surfaces that an item is no longer offered.
**Notes** Deliberately the opposite of `order_items`, which is `ON DELETE SET NULL` — a cart is a draft, an order is a record.

### TC-159 — Totals are computed server-side and correctly
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** FR-5.8, BR-O3
**Type** API · **Priority** Critical
**Data** `CART_A_VALID`
**Steps** 1. `GET /api/cart`.
**Expected** `subtotal "134.00"`, `deliveryFee "12.00"`, `taxAmount "20.10"`, `total "166.10"` — all strings, matching the canonical fixture arithmetic.

### TC-160 — Tax rounding is half-up at two decimals
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** BR-O3, ADR-009
**Type** Unit · **Priority** Critical
**Steps** 1. `money.roundTax("0.10", 0.15)` → expect `"0.02"` (0.015 rounds up). 2. `money.add("0.10","0.20")` → `"0.30"`.
**Expected** Exactly as stated.
**Notes** Asserts the rounding **direction**, which a test using only clean numbers would never pin down.

### TC-161 — Below-minimum cart reports the shortfall and blocks checkout
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-14 · **Rules** BR-C10
**Type** API · **Priority** High
**Data** `CART_A_BELOW_MIN` (9.00 against a 30.00 minimum)
**Steps** 1. `GET /api/cart`.
**Expected** `meetsMinimum: false`, `canCheckout: false`, and the response carries enough information to show "SAR 21.00 to reach the minimum".

### TC-162 — `canCheckout` truth table
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** BR-C9 – BR-C11
**Type** Unit · **Priority** Critical
**Steps** 1. Evaluate `canCheckout` across: empty cart · issues present · below minimum · restaurant not orderable · all clear.
**Expected** True **only** in the all-clear case; false in every other, each with the reason exposed.

### TC-163 — Cart revalidation issues no N+1 queries
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** NFR-6
**Type** Service · **Priority** Medium
**Pre** A cart with 15 distinct lines.
**Steps** 1. Instrument the query count. 2. `GET /api/cart`.
**Expected** Items fetched in one `getItemsByIds` call, not one query per line.

---

## Ownership and role

### TC-164 — Another customer's cart line is unreachable
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-17 · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_A`, `PATCH` and `DELETE` a line ID from `CART_B_OTHER`.
**Expected** 404 both times; `CUST_B`'s cart unchanged.

### TC-165 — Non-customer roles cannot use cart endpoints
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** FR-1.5
**Type** Security · **Priority** Critical
**Steps** 1. As `OWNER_A`, `DRIVER_A` and `ADMIN_A`, call `GET /api/cart` and `POST /api/cart/items`.
**Expected** 403 `FORBIDDEN_ROLE` for all three roles on both endpoints.

### TC-166 — Cart survives logout and login
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** BR-C1, A-11
**Type** Integration · **Priority** Medium
**Steps** 1. Build a cart. 2. Log out. 3. Log in again. 4. `GET /api/cart`.
**Expected** The same cart with the same lines — it is server-side state keyed to the user, not browser state, and carts do not expire.
