# Test Cases — Orders & Checkout (TC-167 – TC-196)

> Covers [spec-07](../../sdd/specs/spec-07-order-placement-lifecycle.md) ·
> [story-06](../../sdd/stories/story-06-order-placement-customer-tracking.md) ·
> FR-6.1 – FR-6.11 · BR-O1 – BR-O10 · G2 · NFR-7
> State transitions themselves: [order-state-machine.md](order-state-machine.md)

**Priority rationale.** Almost everything here is Critical. Checkout is where
money is computed and committed to immutable history; an error persists into
order records, is discovered months later in a dispute, and is unfixable by
then. `chk_orders_totals` means a wrong total cannot be stored — but only if a
test proves the constraint exists.

---

## Checkout — pricing and snapshots

### TC-167 — Checkout produces correct totals from a two-line cart
**Spec** spec-07, spec-06 · **Story** story-06 · **AC** AC-06-01 · **Rules** BR-O3, BR-O4
**Type** API · **Priority** Critical
**Pre** `CART_A_VALID`; `REST_A` fee 12.00, minimum 30.00; `TAX_RATE` 0.15.
**Data** `CUST_A`, `ADDR_A_DEFAULT`
**Steps** 1. `POST /api/orders` `{ addressId, paymentMethod: "CASH_ON_DELIVERY" }`.
**Expected** 201; `subtotal "134.00"`, `deliveryFee "12.00"`, `taxAmount "20.10"`, `totalAmount "166.10"`; status `PENDING`; two `order_items` rows with `unit_price` `"58.00"` and `"18.00"` and `line_total` `"116.00"` and `"18.00"`.
**Post** Cart `CONVERTED`; one `order_status_events` row (null → PENDING, actor CUSTOMER).

### TC-168 — The database rejects an order whose total does not reconcile
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** BR-O3
**Type** Service · **Priority** Critical
**Steps** 1. Attempt a direct insert into `orders` with `total_amount` ≠ `subtotal + delivery_fee + tax_amount`.
**Expected** The insert fails on `chk_orders_totals`.
**Notes** Proves arithmetic is enforced by the schema, so a service bug cannot persist a wrong total — it can only fail loudly.

### TC-169 — The database rejects a line total that does not reconcile
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** BR-O3
**Type** Service · **Priority** Critical
**Steps** 1. Direct insert into `order_items` with `line_total ≠ unit_price × quantity`.
**Expected** Rejected by `chk_order_items_line_total`.

### TC-170 — The checkout request contains no prices
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-02 · **Rules** BR-O5
**Type** Security · **Priority** Critical
**Steps** 1. Inspect the accepted checkout schema and a successful request payload.
**Expected** The only fields are `addressId`, `customerNote` and `paymentMethod`. No price, subtotal, fee or total field exists in the schema.

### TC-171 — Client-supplied totals are ignored
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-03 · **Rules** BR-O5
**Type** Security · **Priority** Critical
**Steps** 1. `POST /api/orders` with `totalAmount: "1.00"`, `subtotal: "1.00"`, `deliveryFee: "0.00"`, `taxAmount: "0.00"`.
**Expected** 201 with the **server-computed** figures (`166.10`), the injected fields stripped.
**Notes** Price tampering is the highest-value attack on a delivery platform; this case is the direct control.

### TC-172 — Menu changes after checkout never alter the order
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-04 · **Rules** BR-O1, BR-O2, G2
**Type** Integration · **Priority** Critical
**Steps** 1. Place an order containing "Mixed Grill" at 58.00. 2. As the owner, rename the item, change its price to 70.00, then delete it. 3. `GET /api/orders/{id}`.
**Expected** The order still shows `item_name_snapshot "Mixed Grill"`, `unit_price "58.00"`, the same line and order totals; `order_items.food_item_id` is **null** after the delete, and nothing else changed.
**Notes** The defining test for goal G2 and risk [R-02](../../sdd/risks.md). If this fails, every historical revenue figure is wrong.

### TC-173 — The delivery address is snapshotted
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** BR-O6
**Type** Integration · **Priority** Critical
**Steps** 1. Place an order. 2. Edit the address in the address book, then delete it. 3. Re-read the order.
**Expected** `delivery_address_snapshot` (JSONB) still holds the address exactly as it was at checkout.

### TC-174 — The delivery fee and restaurant name are snapshotted
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** BR-O4, BR-O1
**Type** Integration · **Priority** Critical
**Steps** 1. Place an order. 2. Change the restaurant's `deliveryFee` to 30.00 and rename it. 3. Re-read the order.
**Expected** The order keeps `deliveryFee "12.00"` and the original `restaurant_name_snapshot`.

### TC-175 — Order number format and uniqueness
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** BR-O7
**Type** Unit · **Priority** Medium
**Steps** 1. Generate 10,000 order numbers.
**Expected** Every one matches `^FF-\d{8}-[A-Z0-9]{6}$`; all are unique.
**Notes** Non-sequential by design, so daily order volume is not leaked to competitors.

---

## Checkout — rejection paths

### TC-176 — Checkout with an empty cart is refused
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-05 · **Rules** BR-C11
**Type** API · **Priority** High
**Steps** 1. `POST /api/orders` with an empty cart.
**Expected** 422 `CART_EMPTY`; no order created.

### TC-177 — Checkout with an unavailable line is refused
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-06 · **Rules** BR-C9
**Type** API · **Priority** Critical
**Data** `CART_A_UNAVAILABLE`
**Steps** 1. `POST /api/orders`.
**Expected** 422 `CART_HAS_ISSUES` with the offending line in `details`; **no order created**; the cart remains `ACTIVE`.

### TC-178 — Checkout below the minimum order amount is refused
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-07 · **Rules** BR-C10
**Type** API · **Priority** High
**Data** `CART_A_BELOW_MIN`
**Steps** 1. `POST /api/orders`.
**Expected** 422 `BELOW_MINIMUM_ORDER` with `required` and `actual` in `details`.

### TC-179 — Checkout against a restaurant that closed mid-session is refused
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-08 · **Rules** BR-R3
**Type** Integration · **Priority** High
**Steps** 1. Build a valid cart. 2. As the owner, turn off accepting-orders. 3. `POST /api/orders`.
**Expected** 422 `RESTAURANT_UNAVAILABLE` with the reason; **the cart is preserved** so the customer can order later.

### TC-180 — Checkout with another customer's address is refused
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-09 · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. `POST /api/orders` with an `addressId` belonging to `CUST_B`.
**Expected** 404 `RESOURCE_NOT_FOUND`; no order created.

### TC-181 — Checkout with a non-existent or malformed address ID
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** validation §15
**Type** API · **Priority** Medium
**Steps** 1. `addressId` = a random UUID. 2. `addressId` = `"not-a-uuid"`. 3. `addressId` absent.
**Expected** 404 · 422 · 422 — never a raw database error.

### TC-182 — Checkout rejects an unsupported payment method
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** validation §15, A-04
**Type** API · **Priority** Medium
**Steps** 1. `paymentMethod: "CREDIT_CARD"`.
**Expected** 422 — the enum holds only `CASH_ON_DELIVERY` in v1.

---

## Atomicity and concurrency

### TC-183 — A failure mid-checkout leaves nothing behind
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-11 · **Rules** NFR-7, FR-6.8
**Type** Service · **Priority** Critical
**Steps** 1. Force a failure after the `order_items` insert but before commit. 2. Inspect the database.
**Expected** No `orders` row, no `order_items`, no `order_status_events`; the cart is still `ACTIVE` with its lines intact.
**Notes** A half-created order is worse than a failed one — the customer would be charged for something the restaurant never sees.

### TC-184 — A double-submitted checkout creates exactly one order
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** BR-C12, NFR-8
**Type** Service · **Priority** Critical
**Steps** 1. Fire two identical `POST /api/orders` requests concurrently for the same cart.
**Expected** Exactly one order exists; the loser receives 422 `CART_EMPTY` (the cart is already `CONVERTED`).
**Notes** The cart row lock plus the cart-status check is what makes double-submit safe; there is no idempotency key.

### TC-185 — Successful checkout converts the cart and allows a fresh one
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-10 · **Rules** BR-C12
**Type** Integration · **Priority** High
**Steps** 1. Check out. 2. `GET /api/cart`. 3. Add a new item.
**Expected** The old cart is `CONVERTED`; step 2 returns an empty cart; step 3 lazily creates a new `ACTIVE` cart.

### TC-186 — A customer may hold several open orders at once
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** BR-O10
**Type** Integration · **Priority** Medium
**Steps** 1. Place an order. 2. Build a new cart and place a second.
**Expected** Both exist and progress independently — the single-cart rule constrains carts, not orders.

---

## Retrieval, history and tracking

### TC-187 — Customer lists their own orders with active/past scoping
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** FR-6.5, FR-6.7
**Type** API · **Priority** High
**Steps** 1. `GET /api/orders?scope=active`. 2. `?scope=past`.
**Expected** Active excludes `DELIVERED` and `CANCELLED`; past contains only those two. Paginated, newest first.

### TC-188 — Order detail includes items, totals and the status timeline
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** FR-6.4, FR-6.5
**Type** API · **Priority** High
**Steps** 1. `GET /api/orders/{ORDER_DELIVERED}`.
**Expected** Items with snapshot names and prices, all four money fields, the delivery address, and a `timeline` with one entry per recorded transition including actor role and timestamp.

### TC-189 — Order detail is scoped to the owning customer
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-17 · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_A`, `GET /api/orders/{ORDER_B_FOREIGN}`.
**Expected** 404 `RESOURCE_NOT_FOUND`.

### TC-190 — The polling endpoint returns a minimal payload
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-19 · **Rules** FR-6.10, R-10
**Type** API · **Priority** Medium
**Steps** 1. `GET /api/orders/{id}/status`.
**Expected** 200 with `status`, `dispatchState`, `updatedAt`, `timeline` and a `driver` block (or null) — and **not** the full item list or address.
**Notes** This is the most-called endpoint in the system; returning the whole order on every tick would be wasteful.

### TC-191 — Driver contact appears only once out for delivery
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** security §9
**Type** Security · **Priority** High
**Steps** 1. Poll status while `PREPARING`. 2. Poll while `OUT_FOR_DELIVERY`.
**Expected** Step 1 → `driver: null`. Step 2 → the driver's first name and a **masked** phone; never the driver's email.

### TC-192 — An unassigned order reports a dispatch state, not an error
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-20 · **Rules** FR-7.4
**Type** API · **Priority** High
**Data** `ORDER_READY` with `dispatch_state = UNASSIGNED`
**Steps** 1. `GET /api/orders/{id}/status`.
**Expected** 200 with `dispatchState: "UNASSIGNED"` and `driver: null`, so the UI can show "finding a driver".

---

## Cancellation

### TC-193 — Customer cancels a PENDING order
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-12 · **Rules** T2, BR-O8
**Type** API · **Priority** Critical
**Steps** 1. `POST /api/orders/{ORDER_PENDING}/cancel`.
**Expected** 200; status `CANCELLED`, `cancelled_by = CUSTOMER`, `cancellation_reason = CUSTOMER_CHANGED_MIND` (default), `cancelled_at` set.
**Post** An `order_status_events` row recording the customer as actor.

### TC-194 — Customer cancels a CONFIRMED order
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-13 · **Rules** T4
**Type** API · **Priority** Critical
**Steps** 1. `POST /api/orders/{ORDER_CONFIRMED}/cancel`.
**Expected** 200 — this is the customer's last cancellation point.

### TC-195 — Customer cannot cancel from PREPARING onward
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-14, AC-06-15 · **Rules** T6, FR-6.6
**Type** API · **Priority** Critical
**Steps** 1. Cancel `ORDER_PREPARING`. 2. Cancel `ORDER_READY`. 3. Cancel `ORDER_OUT`. 4. Cancel `ORDER_DELIVERED`.
**Expected** 409 `INVALID_ORDER_TRANSITION` each, with `details` explaining the cancellation window; every order keeps its status.

### TC-196 — The accept-timeout job cancels a stale PENDING order as SYSTEM
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-18 · **Rules** FR-6.11, T2
**Type** Service · **Priority** High
**Data** `ORDER_PENDING_STALE` (`placed_at` back-dated 11 minutes)
**Steps** 1. Invoke `orderTimeoutJob` directly.
**Expected** The order becomes `CANCELLED` with `cancelled_by = SYSTEM` and `cancellation_reason = ACCEPT_TIMEOUT`; a status event is written with a null `actor_user_id`.
**Post** A fresh `PENDING` order placed 1 minute ago is **untouched**.
**Notes** Driven by a back-dated timestamp, never by sleeping for 10 minutes.
