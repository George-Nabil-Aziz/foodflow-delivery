# Test Cases — Edge Cases (TC-347 – TC-368)

> Cross-cutting cases drawn from the **Edge Cases** sections of every spec, plus
> the failure modes in [risks.md](../../sdd/risks.md).

**What belongs here.** Cases where two subsystems interact over time, or where
state changes underneath an in-flight user action. The expected behaviour is
always taken from the SDD's own rules — never invented for the test.

**Priority rationale.** Most are Critical or High: these are exactly the
sequences where an implementation that passes every happy-path test still loses
customer data or money.

---

## State changing under an active cart

### TC-347 — Restaurant is suspended while a customer holds its items
**Spec** spec-06, spec-03 · **Story** story-05 · **AC** — · **Rules** BR-R3, BR-C8, BR-R9
**Type** Integration · **Priority** High
**Steps** 1. `CUST_A` builds a cart at `REST_A`. 2. Admin suspends `REST_A`. 3. `GET /api/cart`. 4. Attempt checkout. 5. Admin reactivates. 6. `GET /api/cart` and check out.
**Expected** Step 3 → the cart and its items are **preserved**, with the restaurant reported as not orderable and `canCheckout` false. Step 4 → 422 `RESTAURANT_UNAVAILABLE`. Step 6 → the original cart is intact and checkout now succeeds.
**Notes** The cart must survive; discarding it would punish the customer for the platform's action.

### TC-348 — Restaurant closes for the day between cart and checkout
**Spec** spec-06 · **Story** story-05, story-06 · **AC** AC-06-08 · **Rules** BR-R3
**Type** Integration · **Priority** High
**Steps** 1. Build a cart while open. 2. Advance the controlled clock past closing. 3. `GET /api/cart`, then check out.
**Expected** `canCheckout` false with reason `CLOSED_NOW`; checkout returns 422 `RESTAURANT_UNAVAILABLE`; items preserved.

### TC-349 — Item becomes unavailable between cart and checkout
**Spec** spec-06 · **Story** story-05, story-06 · **AC** AC-05-12, AC-06-06 · **Rules** BR-C8, BR-C9
**Type** Integration · **Priority** Critical
**Steps** 1. Build a cart. 2. Owner toggles one item unavailable. 3. Check out. 4. Remove the offending line. 5. Check out again.
**Expected** Step 3 → 422 `CART_HAS_ISSUES` naming the line, **no order created**. Step 5 → 201.
**Notes** The customer resolves the issue explicitly; the server never silently drops a line and charges for the remainder.

### TC-350 — Price changes between adding and checking out
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-11 · **Rules** BR-C8, ADR-008
**Type** Integration · **Priority** Critical
**Steps** 1. Add an item at 58.00. 2. Owner raises the price to 62.00. 3. `GET /api/cart`. 4. Check out.
**Expected** Step 3 → the line shows **62.00** with issue `PRICE_CHANGED` and `canCheckout` false. Step 4 → 422 `CART_HAS_ISSUES`.
**Notes** The customer is never charged a price they did not see, and never shown a stale one.

### TC-351 — Item is deleted while sitting in a cart
**Spec** spec-04, spec-06 · **Story** story-05 · **AC** AC-05-13 · **Rules** BR-M2
**Type** Integration · **Priority** High
**Steps** 1. Add an item. 2. Owner deletes it. 3. `GET /api/cart`.
**Expected** The line is gone via FK cascade; remaining lines and totals are correct; the response communicates that an item is no longer offered.

### TC-352 — Category is deactivated while its item is in a cart
**Spec** spec-04, spec-06 · **Story** story-05 · **AC** — · **Rules** BR-R7, BR-C8
**Type** Integration · **Priority** Medium
**Steps** 1. Add `ITEM_IN_INACTIVE_CAT`'s sibling from an active category. 2. Owner deactivates the category. 3. `GET /api/cart` and attempt checkout.
**Expected** The line carries an issue and `canCheckout` is false; checkout is refused.

### TC-353 — Two tabs add from different restaurants simultaneously
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-18 · **Rules** BR-C1, BR-C3
**Type** Service · **Priority** Critical
**Steps** 1. From an empty cart, fire concurrent adds of `ITEM_GRILL` (`REST_A`) and `ITEM_B_PASTA` (`REST_B`).
**Expected** Exactly one `ACTIVE` cart bound to whichever committed first; the other request receives 409 `CART_RESTAURANT_MISMATCH` (or succeeds first and makes the other conflict) — **never** a cart containing items from both restaurants.

---

## Order lifecycle interference

### TC-354 — Customer cancels at the exact moment the restaurant accepts
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-16 · **Rules** BR-O9, NFR-8
**Type** Service · **Priority** Critical
**Steps** 1. Fire a customer cancel and a restaurant accept concurrently against one `PENDING` order.
**Expected** Exactly one succeeds; the loser gets 409 reflecting the new status; the final state is `CONFIRMED` **or** `CANCELLED`, never an inconsistent mix; exactly one status event is written for the winning transition.

### TC-355 — Checkout is submitted twice in rapid succession
**Spec** spec-07 · **Story** story-06 · **AC** — · **Rules** BR-C12, NFR-8
**Type** Service · **Priority** Critical
**Steps** 1. Fire two identical checkouts for one cart concurrently.
**Expected** Exactly one order; the loser receives 422 `CART_EMPTY`; the customer is never charged twice.

### TC-356 — Restaurant rejects an order the customer is already cancelling
**Spec** spec-07 · **Story** story-06, story-07 · **AC** — · **Rules** BR-O9
**Type** Service · **Priority** High
**Steps** 1. Fire a customer cancel and a restaurant reject concurrently.
**Expected** One wins; the final `cancelled_by` is whichever committed first; exactly one cancellation event exists; the other request gets 409.

### TC-357 — Admin force-cancels while the driver marks delivered
**Spec** spec-07, spec-10 · **Story** story-10 · **AC** — · **Rules** BR-O9
**Type** Service · **Priority** Critical
**Steps** 1. Fire `deliver` and `force-cancel` concurrently on one `OUT_FOR_DELIVERY` order.
**Expected** The row lock decides; if delivery commits first the force-cancel returns 409 (terminal state); if the cancel commits first the delivery returns 409. The driver ends `AVAILABLE` either way.

### TC-358 — Restaurant is suspended mid-order
**Spec** spec-07, spec-10 · **Story** story-07 · **AC** AC-07-13 · **Rules** BR-R9, BR-AD3
**Type** Integration · **Priority** High
**Steps** 1. With an order in `PREPARING`, suspend the restaurant. 2. Continue the order to `READY_FOR_PICKUP` and through delivery.
**Expected** The in-flight order completes normally; only new checkouts are blocked.

### TC-359 — Customer account is suspended with an order in flight
**Spec** spec-07, spec-10 · **Story** story-10 · **AC** — · **Rules** BR-AD2, BR-R9
**Type** Integration · **Priority** High
**Steps** 1. With `ORDER_PREPARING` open, suspend `CUST_A`. 2. Continue the order through delivery. 3. As `CUST_A`, attempt to view it.
**Expected** The order still completes — the restaurant has cooked it and the driver delivers it. The suspended customer cannot authenticate, so they cannot track it until reactivated.
**Notes** Derived from BR-R9's principle applied to accounts; no spec states it explicitly, so it is flagged as finding **D-04** in [coverage-analysis.md](../coverage-analysis.md).

---

## Delivery edge cases

### TC-360 — Driver accepts at the exact moment the offer expires
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-07 · **Rules** BR-D4
**Type** Service · **Priority** High
**Steps** 1. Set `expires_at` to the current instant. 2. Accept.
**Expected** Deterministic outcome from the `FOR UPDATE` read plus the `expires_at` comparison — a hair-late accept receives 409 `OFFER_NO_LONGER_AVAILABLE`; the order gains no driver.

### TC-361 — Order is cancelled while a driver holds it
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-19 · **Rules** BR-D8
**Type** Integration · **Priority** High
**Steps** 1. Driver accepts and is `ON_DELIVERY`. 2. Admin force-cancels. 3. Driver reads their active delivery.
**Expected** The assignment becomes `CANCELLED`; the driver becomes `AVAILABLE`; their active-delivery view shows the cancellation **with the reason** rather than an empty screen or an error.

### TC-362 — Driver never marks an order delivered
**Spec** spec-08, spec-10 · **Story** story-08 · **AC** — · **Rules** FR-9.9
**Type** Integration · **Priority** Medium
**Data** `ORDER_STUCK_OUT`
**Steps** 1. Leave the order `OUT_FOR_DELIVERY` for 91 minutes (back-dated). 2. Check the admin stuck-order view. 3. Attempt any customer or restaurant action.
**Expected** The order appears as stuck; only an admin can resolve it via T10; no other actor can force it forward.

### TC-363 — Every eligible driver declines
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-08, AC-08-18 · **Rules** BR-D12, FR-7.4
**Type** Integration · **Priority** High
**Steps** 1. With two drivers available, have both decline. 2. Run dispatch repeatedly.
**Expected** Candidates are exhausted; no further offers are made; the order stays `UNASSIGNED` and **uncancelled**; a newly available third driver receives an offer on the next tick.

---

## Data lifecycle

### TC-364 — Historical order survives deletion of everything it referenced
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-04 · **Rules** BR-O1, BR-O2, BR-O6, G2
**Type** Integration · **Priority** Critical
**Steps** 1. Place and deliver an order. 2. Delete the food item, delete its category, delete the customer's address, rename the restaurant, and soft-delete the customer. 3. Read the order as an admin.
**Expected** The order still shows the original item name and price, the original restaurant name, the original delivery address and correct totals. `food_item_id` is null; nothing else changed.
**Notes** The strongest single statement of goal G2 — the order is fully self-describing.

### TC-365 — Reviewing remains possible after the restaurant is suspended
**Spec** spec-09 · **Story** story-09 · **AC** — · **Rules** BR-V1
**Type** Integration · **Priority** Medium
**Steps** 1. Deliver an order. 2. Suspend the restaurant. 3. Submit a review.
**Expected** 201 — reviewability depends on the order being `DELIVERED`, not on the restaurant's current status. The aggregate updates even though the restaurant is unlisted.

### TC-366 — A search that matches nothing is not an error
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-16 · **Rules** spec-05 edge cases
**Type** API · **Priority** Low
**Steps** 1. Search a term matching nothing. 2. Filter to an empty intersection. 3. Request a page past the end.
**Expected** 200 with empty arrays and accurate `meta` in all three; never 404 and never an error envelope.

### TC-367 — A cart left idle for days is still usable
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** A-11, BR-C8
**Type** Integration · **Priority** Medium
**Steps** 1. Create a cart with `created_at` back-dated 30 days. 2. `GET /api/cart`.
**Expected** Still `ACTIVE`; revalidation reports any staleness; checkout succeeds if nothing changed.
**Notes** Carts deliberately do not expire — revalidation on read is what makes an old cart safe.

### TC-368 — API failure mid-journey leaves no partial state
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-11 · **Rules** NFR-7
**Type** Integration · **Priority** Critical
**Steps** 1. Sever the database connection during a checkout commit. 2. Restore it. 3. Inspect orders and the cart. 4. Retry the checkout.
**Expected** Either the order committed fully or not at all; the cart is `ACTIVE` if it did not; the retry succeeds and produces exactly one order.
**Notes** Covers the "network failure during checkout" case from the brief. The client sees a 5xx and may retry; atomicity is what makes retrying safe.
