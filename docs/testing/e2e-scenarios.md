# End-to-End Scenarios (TC-393 – TC-406)

> Playwright, against a seeded stack. Each scenario uses **one browser context
> per role**, so cross-role hand-offs are genuinely cross-session rather than
> one tab pretending to be four people.

E2E is deliberately kept to 14 journey-level scenarios. Detail lives in the API
cases; a large E2E suite becomes slow and brittle and then gets skipped before
merge, which is worse than having fewer scenarios that always run.

**Preconditions common to all:** the stack is running against a seeded database
([test-data.md](test-data.md)); each scenario creates its own users with
randomized emails where it needs isolation from seed drift.

---

## Primary journeys

### TC-393 — Full order journey, customer to review
**Spec** all · **Story** story-02, 03, 04, 05, 06, 07, 08, 09 · **AC** AC-06-01, AC-07-01, AC-08-05, AC-09-01 · **Rules** G1
**Type** E2E · **Priority** Critical
**Contexts** Customer · Restaurant · Driver
**Steps**
1. **Customer:** register → log in → land on the home view.
2. Browse restaurants, open `REST_A`, view the menu.
3. Add two items to the cart; see the header badge update.
4. Attempt to add an item from `REST_B`; see the switch dialog; **choose "Keep my cart"**.
5. Open the cart, verify subtotal, delivery fee, tax and total; check out with the default address.
6. See the order at `PENDING` with its order number and timeline.
7. **Restaurant:** log in as `OWNER_A`; see the new order in the incoming queue; accept it.
8. Start preparing; mark ready.
9. **Driver:** log in as `DRIVER_A`; go `AVAILABLE`; receive the offer; accept it.
10. Mark picked up; mark delivered.
11. **Customer:** tracking view reaches `DELIVERED` within one polling interval.
12. Submit a review with a 5-star restaurant rating and a 4-star driver rating.
13. Return to the restaurant listing and confirm the rating average has changed.
**Expected** Every step succeeds; the order's totals at step 13 are identical to step 5; the timeline shows all six transitions with correct actors.
**Notes** The primary scenario and the direct proof of goal G1. If this fails, the release does not ship.

### TC-394 — Restaurant journey: onboarding through fulfilment
**Spec** spec-02, 03, 04, 07, 10 · **Story** story-03, story-07 · **AC** AC-03-01, AC-03-04, AC-07-01 · **Rules** FR-2.*, FR-3.*
**Type** E2E · **Priority** Critical
**Contexts** Restaurant · Admin
**Steps**
1. **Restaurant:** register as an owner; see the `PENDING_APPROVAL` banner; confirm menu and order screens are disabled with an explanation.
2. Complete the profile; set the full week of opening hours.
3. Create two categories and three food items.
4. **Admin:** log in; find the restaurant in the pending queue; approve it.
5. **Restaurant:** reload; the banner is gone; menu and orders are now available.
6. Toggle one item unavailable, then available again.
7. Receive an order (placed by a customer context), accept, prepare, mark ready.
**Expected** Each stage gated correctly; the restaurant appears in the public listing only after step 4.

### TC-395 — Driver journey: provisioning through delivery
**Spec** spec-02, 08, 10 · **Story** story-08 · **AC** AC-08-01, AC-08-03, AC-08-05, AC-08-13, AC-08-14 · **Rules** ADR-006
**Type** E2E · **Priority** Critical
**Contexts** Admin · Driver
**Steps**
1. **Admin:** create a driver account; note the one-time initial password.
2. **Driver:** log in with it; see the "waiting for approval" state; confirm no offers are available.
3. **Admin:** approve the driver.
4. **Driver:** go `AVAILABLE`; receive an offer for a ready order; inspect it and confirm **no customer street address is shown**.
5. Accept the offer; now the full address, customer first name and masked phone appear.
6. Mark picked up; mark delivered.
7. Confirm availability returns to `AVAILABLE` and the delivery appears in history.
**Expected** Progressive PII disclosure holds at steps 4 and 5; the driver cannot act before approval.

### TC-396 — Admin journey: dashboard through intervention
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-01, AC-10-06, AC-10-10, AC-10-12 · **Rules** FR-9.*
**Type** E2E · **Priority** High
**Contexts** Admin
**Steps**
1. Log in; view the dashboard with its stat tiles and alert strip.
2. Open the user list; filter and search; suspend a customer with a reason.
3. Open the restaurant queue; approve one and reject another with a reason.
4. Open the order list; filter by status and date; open a stuck order; force-cancel it with a reason.
5. Open the review queue; hide an abusive review; restore it.
6. Open the audit log and confirm every action from steps 2–5 is recorded.
**Expected** Every destructive action requires a reason before the confirm button enables; every action appears in the audit log with the admin's identity.

---

## Business-rule journeys

### TC-397 — Cart restaurant switch, confirmed
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-02, AC-05-04 · **Rules** BR-C3, BR-C4
**Type** E2E · **Priority** Critical
**Steps** 1. Build a three-item cart at `REST_A`. 2. Add an item from `REST_B`; see the dialog naming both restaurants and the item count. 3. Confirm "Start new cart". 4. Open the cart.
**Expected** The cart holds exactly the one `REST_B` item; no `REST_A` items remain; the header badge shows 1.

### TC-398 — Customer cancellation window closes at preparation
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-12, AC-06-14 · **Rules** T2, T4, T6
**Type** E2E · **Priority** Critical
**Contexts** Customer · Restaurant
**Steps** 1. Place an order; cancel it at `PENDING` — succeeds. 2. Place a second; restaurant accepts; cancel at `CONFIRMED` — succeeds. 3. Place a third; restaurant accepts and starts preparing; open the order detail.
**Expected** At step 3 the cancel control is **absent**, and a direct API call returns 409 with an explanation.

### TC-399 — Restaurant rejection reaches the customer with its reason
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-02 · **Rules** T2, ADR-007
**Type** E2E · **Priority** High
**Contexts** Customer · Restaurant
**Steps** 1. Customer places an order. 2. Restaurant rejects it with `OUT_OF_STOCK` and a note. 3. Customer refreshes the tracking view.
**Expected** The customer sees the order as **"Rejected by restaurant"** with the reason — presentation derived from `cancelled_by`, since there is no separate `REJECTED` state.

### TC-400 — No driver available leaves the order intact
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-18 · **Rules** FR-7.4
**Type** E2E · **Priority** Critical
**Contexts** Customer · Restaurant · Admin
**Steps** 1. Ensure no driver is `AVAILABLE`. 2. Place an order; restaurant accepts, prepares and marks ready. 3. Customer views tracking. 4. Advance the clock past 15 minutes. 5. Admin opens the unassigned backlog. 6. Bring a driver online.
**Expected** The order stays `READY_FOR_PICKUP`, **never cancelled**; the customer sees "finding a driver"; the order appears in the admin backlog; at step 6 it is dispatched and completes normally.

### TC-401 — A menu price change does not alter a placed order
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-04 · **Rules** BR-O1, G2
**Type** E2E · **Priority** Critical
**Contexts** Customer · Restaurant
**Steps** 1. Customer orders an item at 58.00 and records the total. 2. Restaurant raises the price to 70.00 and renames the item. 3. Customer reopens the order.
**Expected** The order still shows the original name, 58.00, and the identical total.

### TC-402 — Restaurant approval gates visibility
**Spec** spec-03, spec-10 · **Story** story-03 · **AC** AC-03-04 · **Rules** BR-R2
**Type** E2E · **Priority** High
**Contexts** Customer · Admin
**Steps** 1. Customer browses and confirms the pending restaurant is absent; direct-navigates to its URL. 2. Admin approves it. 3. Customer refreshes the listing.
**Expected** Step 1 → absent from the list and the direct URL shows a not-found view. Step 3 → present and browsable.

### TC-403 — One driver cannot hold two deliveries
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-09, AC-08-10 · **Rules** BR-D5, BR-D9
**Type** E2E · **Priority** High
**Contexts** Driver
**Steps** 1. Driver accepts a delivery. 2. A second order becomes ready; check the offers screen. 3. Attempt to go `OFFLINE`.
**Expected** No new offer is shown; going offline is refused with a readable explanation naming the active order.

### TC-404 — Admin suspension removes a restaurant without stranding orders
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-05 · **Rules** BR-R9, BR-AD3
**Type** E2E · **Priority** High
**Contexts** Customer · Restaurant · Admin
**Steps** 1. A customer has an order in `PREPARING` at `REST_A`. 2. Admin suspends `REST_A`. 3. Customer browses the listing. 4. Restaurant completes the in-flight order. 5. Customer attempts a new order from `REST_A`.
**Expected** The restaurant disappears from the listing; the in-flight order **completes normally**; the new order is refused.

### TC-405 — Review moderation changes the public rating
**Spec** spec-09, spec-10 · **Story** story-09, story-10 · **AC** AC-09-12, AC-09-13 · **Rules** BR-V7
**Type** E2E · **Priority** High
**Contexts** Customer · Admin
**Steps** 1. Three customers leave 5, 4 and 3-star reviews; note the average on the listing. 2. Admin hides the 3-star review. 3. Reload the restaurant page. 4. Admin restores it. 5. Reload again.
**Expected** Average 4.00 → **4.50** with the review gone from the list → back to 4.00 with it restored.

---

## Cross-cutting

### TC-406 — Responsive and accessible smoke pass
**Spec** all · **Story** story-04 – story-10 · **AC** — · **Rules** NFR-13, NFR-14
**Type** E2E / A11y · **Priority** High
**Steps** 1. Run the core customer path (browse → menu → cart → checkout → tracking) at **360 px, 768 px and 1440 px**. 2. Complete the cart and checkout flow using **keyboard only**. 3. Run `@axe-core/playwright` on: login, restaurant list, restaurant detail, cart, checkout, order tracking, restaurant incoming orders, driver active delivery, and the admin dashboard.
**Expected** No horizontal page scroll at any width; every interactive control is keyboard-reachable with a visible focus ring; modals trap focus and restore it on close; order status changes announce through a live region; **zero serious or critical axe violations** on all nine screens.
**Notes** Combines NFR-13 and NFR-14 into one scenario because they exercise the same journeys; splitting them would double the run time for no additional signal.

---

## Integration flows below the UI

These are the same journeys exercised at the API layer, where they run in
seconds rather than minutes. They are the regression workhorses; the E2E
scenarios above prove the UI wires up to them.

| Flow | Sequence | Covered by |
|------|----------|------------|
| **Customer purchase** | register → login → browse → menu → add to cart → checkout → order created | TC-001, TC-012, TC-115, TC-135, TC-167 |
| **Order fulfilment** | accept → prepare → ready → dispatch → offer → accept → pick up → deliver | TC-203 – TC-207, TC-238, TC-245 |
| **Failure: cart goes stale** | add → item unavailable → checkout refused → resolve → checkout succeeds | TC-349 |
| **Failure: restaurant closes** | add → restaurant pauses → checkout refused → cart preserved | TC-179, TC-347 |
| **Failure: no driver** | confirm → prepare → ready → dispatch finds nobody → order preserved → escalated | TC-249, TC-250 |
| **Failure: mid-checkout crash** | checkout → DB failure → nothing persisted → retry succeeds | TC-183, TC-368 |
| **Moderation** | review → hide → aggregate falls → restore → aggregate returns | TC-273, TC-274 |
| **Suspension** | login → admin suspends → live token rejected → refresh rejected | TC-278 |
