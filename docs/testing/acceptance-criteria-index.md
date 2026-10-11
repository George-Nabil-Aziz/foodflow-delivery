# FoodFlow — Acceptance Criteria Index

> Generated from the Gherkin blocks in [`../sdd/stories/`](../sdd/stories/).
> Each criterion receives a stable ID `AC-<story>-<n>`, where `n` is its 1-based
> position in that story's acceptance-criteria block.
>
> **Assigning IDs adds identifiers to existing criteria. No requirement is
> added, altered or removed.** Where a story is edited, regenerate this index
> and re-check [coverage-analysis.md](coverage-analysis.md) — an inserted
> criterion shifts the numbering of those below it.

## Summary

| Story | Criteria | IDs |
|---|---|---|
| story-01 | 10 | `AC-01-01` … `AC-01-10` |
| story-02 | 16 | `AC-02-01` … `AC-02-16` |
| story-03 | 17 | `AC-03-01` … `AC-03-17` |
| story-04 | 16 | `AC-04-01` … `AC-04-16` |
| story-05 | 18 | `AC-05-01` … `AC-05-18` |
| story-06 | 20 | `AC-06-01` … `AC-06-20` |
| story-07 | 16 | `AC-07-01` … `AC-07-16` |
| story-08 | 19 | `AC-08-01` … `AC-08-19` |
| story-09 | 18 | `AC-09-01` … `AC-09-18` |
| story-10 | 15 | `AC-10-01` … `AC-10-15` |
| **Total** | **165** | |

---

## Story 01 — Platform Foundation & Walking Skeleton

[story-01-platform-foundation-walking-skeleton.md](../sdd/stories/story-01-platform-foundation-walking-skeleton.md) — 10 criteria

| AC ID | Criterion |
|---|---|
| `AC-01-01` | Given a clean checkout and a running database When I run the documented setup commands Then the API and the frontend both start within 10 minutes of a fresh clone |
| `AC-01-02` | Given the API is running When I GET /api/health Then I receive 200 with { status: "ok", database: "up" } inside the success envelope |
| `AC-01-03` | Given the database is stopped When I GET /api/health Then I receive 503 with { status: "degraded", database: "down" } inside the envelope |
| `AC-01-04` | Given any request When the API responds Then the response carries an X-Request-Id header equal to meta.requestId |
| `AC-01-05` | Given a request to an unmatched /api path When the API responds Then I receive 404 with error.code = "RESOURCE_NOT_FOUND" in the envelope, not an HTML error page |
| `AC-01-06` | Given a route handler that throws an unexpected error When the API responds Then I receive 500 with error.code = "INTERNAL_ERROR", no stack trace in the body, and the full stack in the logs keyed by the request ID |
| `AC-01-07` | Given a request body containing keys not present in the schema When it is validated Then the extra keys are stripped and never reach the service layer |
| `AC-01-08` | Given JWT_SECRET is shorter than 32 characters When the process boots Then it exits non-zero with a message naming the offending variable, before listening |
| `AC-01-09` | Given the frontend is running When I visit an unknown route Then the 404 view renders inside the public layout |
| `AC-01-10` | Given an API call fails When the error reaches the UI Then a toast appears with a human-readable message derived from error.code |

---

## Story 02 — Customer Registration, Login & Profile

[story-02-customer-registration-login-profile.md](../sdd/stories/story-02-customer-registration-login-profile.md) — 16 criteria

| AC ID | Criterion |
|---|---|
| `AC-02-01` | Given I am a new visitor When I register with a valid email, password, name and phone as a customer Then my account is created, I receive an access token and a refresh token, and the response contains no password field of any kind |
| `AC-02-02` | Given an account already exists with "sara@example.com" When I register with "SARA@Example.com" Then I receive 409 EMAIL_ALREADY_REGISTERED |
| `AC-02-03` | Given I submit a registration payload containing "role": "ADMIN" When the request is processed Then I receive 403 FORBIDDEN_ROLE and no account is created |
| `AC-02-04` | Given I submit a registration payload containing "status": "ACTIVE" and "id": "<uuid>" When the request is processed Then those keys are stripped and the account is created with server-assigned values |
| `AC-02-05` | Given I have an account When I log in with the wrong password Then I receive 401 INVALID_CREDENTIALS |
| `AC-02-06` | Given no account exists for "nobody@example.com" When I log in with that email Then I receive 401 INVALID_CREDENTIALS — the same code, message and comparable timing as a wrong password, so account existence is not leaked |
| `AC-02-07` | Given my account has been suspended When I log in Then I receive 403 ACCOUNT_SUSPENDED |
| `AC-02-08` | Given I hold a valid access token issued before my account was suspended When I call any authenticated endpoint Then I receive 403 ACCOUNT_SUSPENDED — suspension does not wait for the token to expire |
| `AC-02-09` | Given my access token has expired When my client calls an endpoint and then refreshes Then the refresh returns a new token pair, the old refresh token stops working, and the original request succeeds on retry |
| `AC-02-10` | Given a refresh token that has already been used When it is presented again Then I receive 401 REFRESH_TOKEN_REUSED and every token in its family is revoked |
| `AC-02-11` | Given I am logged in on two tabs and both hit an expired token at once When the client refreshes Then exactly one refresh request is sent and both tabs continue working |
| `AC-02-12` | Given I am logged in When I change my password with the correct current password Then all my refresh tokens are revoked and my next refresh attempt fails |
| `AC-02-13` | Given I am a customer with no addresses When I add an address Then it is created and becomes my default automatically |
| `AC-02-14` | Given I have three addresses and the second is default When I make the third default Then exactly one address is default and it is the third |
| `AC-02-15` | Given another customer's address ID When I request it Then I receive 404 RESOURCE_NOT_FOUND, not 403 |
| `AC-02-16` | Given I am not logged in When I visit /account/profile Then I am redirected to /login with a redirect parameter, and after logging in I land on /account/profile |

---

## Story 03 — Restaurant Onboarding, Profile & Menu Management

[story-03-restaurant-onboarding-menu-management.md](../sdd/stories/story-03-restaurant-onboarding-menu-management.md) — 17 criteria

| AC ID | Criterion |
|---|---|
| `AC-03-01` | Given I registered as a restaurant owner When I log in Then I see my restaurant with status PENDING_APPROVAL and a banner explaining that customers cannot see it yet |
| `AC-03-02` | Given my restaurant is PENDING_APPROVAL When I update my profile and opening hours Then both save successfully |
| `AC-03-03` | Given my restaurant is PENDING_APPROVAL When I open the menu or orders screens Then they are visibly disabled with an explanation, and the API returns 403 RESTAURANT_NOT_APPROVED |
| `AC-03-04` | Given I am an admin and a restaurant is pending with at least one available item When I approve it Then its status becomes ACTIVE, an audit row is written, and it appears in the customer restaurant listing |
| `AC-03-05` | Given a pending restaurant has no available food items When I try to approve it Then I receive 422 explaining that a restaurant needs at least one available item |
| `AC-03-06` | Given I am an admin When I reject a restaurant with the reason "Address could not be verified" Then its status becomes REJECTED and the owner sees that exact reason on their profile |
| `AC-03-07` | Given my restaurant is ACTIVE When I submit opening hours missing Wednesday Then I receive 422 naming the missing day, and my previously saved hours are unchanged |
| `AC-03-08` | Given I submit hours where a day closes at 02:00 and opens at 22:00 When the request is processed Then I receive 422 explaining that overnight hours are not supported in this version |
| `AC-03-09` | Given my restaurant is ACTIVE and within opening hours When I turn off "accepting orders" Then isOrderable becomes false immediately and customers see the restaurant as paused |
| `AC-03-10` | Given I have a category named "Starters" When I create another category named "starters" Then I receive 409 — names are unique per restaurant regardless of case |
| `AC-03-11` | Given a category contains two items When I delete the category Then I receive 409 CATEGORY_NOT_EMPTY with the item count |
| `AC-03-12` | Given a category contains items that are all available When I deactivate the category Then the category and its items disappear from the public menu, and every item's isAvailable flag is unchanged |
| `AC-03-13` | Given an item is available When I toggle its availability off Then only is_available changes, and the item still appears on the public menu marked unavailable |
| `AC-03-14` | Given I submit a food item priced "12.345" When the request is processed Then I receive 422 — prices carry exactly two decimals |
| `AC-03-15` | Given I submit a food item with an imageUrl of "javascript:alert(1)" When the request is processed Then I receive 422 |
| `AC-03-16` | Given another restaurant's category ID When I assign one of my items to it Then I receive 422 naming categoryId |
| `AC-03-17` | Given another restaurant's item ID When I request or modify it Then I receive 404 RESOURCE_NOT_FOUND |

---

## Story 04 — Restaurant Discovery, Search & Menu Browsing

[story-04-restaurant-discovery-menu-browsing.md](../sdd/stories/story-04-restaurant-discovery-menu-browsing.md) — 16 criteria

| AC ID | Criterion |
|---|---|
| `AC-04-01` | Given approved, pending and suspended restaurants exist When I request the restaurant listing Then only the ACTIVE ones are returned |
| `AC-04-02` | Given a pending restaurant's ID When I request it directly Then I receive 404 RESOURCE_NOT_FOUND |
| `AC-04-03` | Given 21 active restaurants exist When I request page 2 with a limit of 20 Then I receive 1 restaurant and meta.pagination shows total 21 and totalPages 2 |
| `AC-04-04` | Given I request a limit of 500 When the request is processed Then I receive 422 naming the maximum of 100 |
| `AC-04-05` | Given restaurants with and without ratings exist When I sort by rating descending Then rated restaurants appear first in descending order and unrated ones appear last |
| `AC-04-06` | Given a restaurant is ACTIVE, accepting orders, and within today's hours When I view the listing Then its isOrderable is true |
| `AC-04-07` | Given a restaurant is ACTIVE and accepting orders but outside today's hours When I view the listing Then isOrderable is false and the card shows a "Closed" badge with text, not colour alone |
| `AC-04-08` | Given I filter by openNow=true When the request is processed Then only restaurants whose server-computed orderability is true are returned |
| `AC-04-09` | Given a restaurant sells "Mixed Grill" When I search for "rill" Then both the restaurant and the item are returned — matching is partial and case-insensitive |
| `AC-04-10` | Given a food item belongs to a suspended restaurant When I search for its name Then it does not appear in the results |
| `AC-04-11` | Given I search for "%" When the request is processed Then the wildcard is escaped and treated as literal text, not as a match-everything pattern |
| `AC-04-12` | Given I pass sort=passwordHash When the request is processed Then I receive 422 — sorting is restricted to an allow-list |
| `AC-04-13` | Given a restaurant has an inactive category When I view its public menu Then neither the category nor its items appear |
| `AC-04-14` | Given a restaurant has an unavailable item in an active category When I view its public menu Then the item appears with isAvailable false and its add button is disabled with a visible "Unavailable" label |
| `AC-04-15` | Given I apply filters and then reload the page When the page loads Then my filters are restored from the URL |
| `AC-04-16` | Given no restaurants match my filters When the results render Then I see an empty state offering to clear the filters, not an error |

---

## Story 05 — Cart Management

[story-05-cart-management.md](../sdd/stories/story-05-cart-management.md) — 18 criteria

| AC ID | Criterion |
|---|---|
| `AC-05-01` | Given I have no cart When I add an item from Olive Grill Then a cart is created, bound to Olive Grill, containing that item |
| `AC-05-02` | Given my cart contains 3 items from Olive Grill When I add an item from Pasta House Then I receive 409 CART_RESTAURANT_MISMATCH containing both restaurant names and my current item count, and my cart is completely unchanged |
| `AC-05-03` | Given I received CART_RESTAURANT_MISMATCH When I am shown the switch dialog and I choose "Keep my cart" Then nothing changes — no request is sent and my three items remain |
| `AC-05-04` | Given I received CART_RESTAURANT_MISMATCH When I confirm "Start new cart with Pasta House" Then the request is retried with replace=true, my cart is emptied, rebound to Pasta House, and contains only the new item |
| `AC-05-05` | Given my cart contains 2 units of Mixed Grill When I add Mixed Grill again with quantity 1 Then the existing line becomes 3 units — no duplicate line is created |
| `AC-05-06` | Given my cart contains 19 units of an item When I add 5 more Then the line is capped at 20 rather than failing |
| `AC-05-07` | Given a cart line exists When I set its quantity to 0 Then I receive 422 — removal is a DELETE, not a quantity update |
| `AC-05-08` | Given a cart line exists When I set its quantity to 21 Then I receive 422 naming the 1–20 range |
| `AC-05-09` | Given an item is marked unavailable When I try to add it Then I receive 422 ITEM_UNAVAILABLE naming the item |
| `AC-05-10` | Given a restaurant is outside its opening hours When I try to add one of its items Then I receive 422 RESTAURANT_UNAVAILABLE with the reason CLOSED_NOW |
| `AC-05-11` | Given my cart contains an item whose price then changes from 58.00 to 62.00 When I view my cart Then the line shows 62.00, carries the issue PRICE_CHANGED, and canCheckout is false |
| `AC-05-12` | Given my cart contains an item that the restaurant then marks unavailable When I view my cart Then the line carries the issue ITEM_UNAVAILABLE and canCheckout is false |
| `AC-05-13` | Given my cart contains an item that the restaurant then deletes When I view my cart Then the line is gone and I am told an item is no longer offered |
| `AC-05-14` | Given my cart subtotal is below the restaurant's minimum order amount When I view my cart Then meetsMinimum is false, canCheckout is false, and I am shown how much more is needed |
| `AC-05-15` | Given I remove the last item from my cart Then the cart remains ACTIVE with no restaurant binding, and my next add from any restaurant succeeds without a conflict |
| `AC-05-16` | Given I have never created a cart When I request my cart Then I receive 200 with an empty item list and a null restaurant, not 404 |
| `AC-05-17` | Given another customer's cart line ID When I try to modify it Then I receive 404 RESOURCE_NOT_FOUND |
| `AC-05-18` | Given two of my browser tabs add items from different restaurants at the same moment When both requests are processed Then exactly one cart exists, bound to whichever committed first, and the other request receives 409 |

---

## Story 06 — Order Placement & Customer Order Tracking

[story-06-order-placement-customer-tracking.md](../sdd/stories/story-06-order-placement-customer-tracking.md) — 20 criteria

| AC ID | Criterion |
|---|---|
| `AC-06-01` | Given my cart has two items totalling 134.00 from a restaurant with a 12.00 delivery fee and a 15% tax rate When I check out with a valid address Then an order is created with subtotal 134.00, deliveryFee 12.00, taxAmount 20.10 and totalAmount 166.10, and its status is PENDING |
| `AC-06-02` | Given I place an order When I inspect the request payload Then it contains no prices at all — only addressId, an optional note and the payment method |
| `AC-06-03` | Given I submit a checkout payload containing "totalAmount": "1.00" When the order is created Then the field is stripped and the server-computed total is used |
| `AC-06-04` | Given I placed an order containing "Mixed Grill" at 58.00 When the restaurant later renames the item, changes its price to 70.00 and deletes it Then my order still shows "Mixed Grill" at 58.00 with the same line total and the same order total |
| `AC-06-05` | Given my cart is empty When I check out Then I receive 422 CART_EMPTY |
| `AC-06-06` | Given my cart contains an item that has become unavailable When I check out Then I receive 422 CART_HAS_ISSUES listing the offending line, and no order is created |
| `AC-06-07` | Given my cart subtotal is below the restaurant's minimum order amount When I check out Then I receive 422 BELOW_MINIMUM_ORDER stating the required and actual amounts |
| `AC-06-08` | Given the restaurant closes between my last cart view and my checkout When I check out Then I receive 422 RESTAURANT_UNAVAILABLE and my cart is preserved |
| `AC-06-09` | Given I pass an address ID belonging to another customer When I check out Then I receive 404 RESOURCE_NOT_FOUND |
| `AC-06-10` | Given my checkout succeeds When I look at my cart Then it has been converted, and my next add creates a fresh cart |
| `AC-06-11` | Given the database fails part-way through my checkout When the transaction rolls back Then no order, no order items and no status events exist, and my cart is still ACTIVE |
| `AC-06-12` | Given my order is PENDING When I cancel it Then its status becomes CANCELLED with cancelledBy CUSTOMER and a status event is recorded |
| `AC-06-13` | Given my order is CONFIRMED When I cancel it Then the cancellation succeeds — this is my last cancellation point |
| `AC-06-14` | Given my order is PREPARING When I try to cancel it Then I receive 409 INVALID_ORDER_TRANSITION explaining that customers may cancel only while PENDING or CONFIRMED, and the cancel button is absent from my UI |
| `AC-06-15` | Given my order is DELIVERED When I try to cancel it Then I receive 409 — terminal states are terminal |
| `AC-06-16` | Given I cancel at the same moment the restaurant accepts When both requests are processed Then the row lock serialises them: one succeeds and the other receives 409 showing the new status |
| `AC-06-17` | Given another customer's order ID When I request it Then I receive 404 RESOURCE_NOT_FOUND, not 403 |
| `AC-06-18` | Given a restaurant does not respond to my PENDING order within the configured timeout When the timeout job runs Then my order is cancelled with cancelledBy SYSTEM and reason ACCEPT_TIMEOUT |
| `AC-06-19` | Given my order is being tracked When its status changes Then my tracking view reflects it within one polling interval, and polling stops once the order is DELIVERED or CANCELLED |
| `AC-06-20` | Given my order has no driver assigned yet When I view tracking Then I see a "finding a driver" state rather than an error |

---

## Story 07 — Restaurant Order Processing

[story-07-restaurant-order-processing.md](../sdd/stories/story-07-restaurant-order-processing.md) — 16 criteria

| AC ID | Criterion |
|---|---|
| `AC-07-01` | Given an order for my restaurant is PENDING When I accept it Then its status becomes CONFIRMED, confirmedAt is stamped, a status event records me as the actor, and its dispatch state becomes UNASSIGNED |
| `AC-07-02` | Given an order for my restaurant is PENDING When I reject it with the reason OUT_OF_STOCK and a note Then it becomes CANCELLED with cancelledBy RESTAURANT and that reason, and the customer sees "Rejected by restaurant" with the reason |
| `AC-07-03` | Given an order is PENDING When I try to reject it without a reason Then I receive 422 — a rejection the customer cannot understand is not acceptable |
| `AC-07-04` | Given an order is CONFIRMED When I start preparing it Then its status becomes PREPARING and preparingAt is stamped |
| `AC-07-05` | Given an order is PREPARING When I mark it ready Then its status becomes READY_FOR_PICKUP and readyAt is stamped |
| `AC-07-06` | Given an order is PENDING When I try to mark it ready Then I receive 409 INVALID_ORDER_TRANSITION — statuses cannot be skipped |
| `AC-07-07` | Given an order is PREPARING When I try to accept it again Then I receive 409 INVALID_ORDER_TRANSITION |
| `AC-07-08` | Given an order is OUT_FOR_DELIVERY When I try to change its status Then I receive 409 — the order is the driver's responsibility now |
| `AC-07-09` | Given an order is DELIVERED or CANCELLED When I try any action on it Then I receive 409 — terminal states are terminal |
| `AC-07-10` | Given an order belonging to a different restaurant When I try to accept it Then I receive 404 RESOURCE_NOT_FOUND, not 403 |
| `AC-07-11` | Given I am preparing an order and I run out of an ingredient When I cancel it with the reason OUT_OF_STOCK Then it becomes CANCELLED with my attribution and the customer sees the reason |
| `AC-07-12` | Given two of my staff accept the same order at the same moment When both requests are processed Then one receives 200 and the other receives 409 — the row lock serialises them |
| `AC-07-13` | Given my restaurant is suspended by an admin while an order is PREPARING When I continue working Then I can still move that order to READY_FOR_PICKUP; only new orders are blocked |
| `AC-07-14` | Given my restaurant is not yet approved When I open the orders screen Then it is disabled with an explanation and the API returns 403 RESTAURANT_NOT_APPROVED |
| `AC-07-15` | Given a new PENDING order arrives When my queue next polls Then the order appears within one polling interval with a visible and audible cue |
| `AC-07-16` | Given an order in each status When I view the queue Then each card offers only the actions legal from its current status |

---

## Story 08 — Driver Onboarding, Assignment & Delivery Execution

[story-08-driver-onboarding-delivery-execution.md](../sdd/stories/story-08-driver-onboarding-delivery-execution.md) — 19 criteria

| AC ID | Criterion |
|---|---|
| `AC-08-01` | Given I am an admin When I create a driver account Then the user is created with role DRIVER, the profile is PENDING_APPROVAL, and an initial password is returned exactly once in that response and never again |
| `AC-08-02` | Given a driver profile is PENDING_APPROVAL When that driver logs in and opens their dashboard Then they receive 403 ACCOUNT_SUSPENDED on driver endpoints and see a "waiting for approval" state |
| `AC-08-03` | Given an admin approves the driver When the driver sets themselves AVAILABLE Then they become eligible to receive offers |
| `AC-08-04` | Given an order reaches CONFIRMED and one AVAILABLE driver exists When the dispatch job runs Then exactly one OFFERED assignment is created for that driver with a 90-second expiry |
| `AC-08-05` | Given I am the offered driver When I accept Then the assignment becomes ACCEPTED, the order's driver is set, its dispatch state becomes ASSIGNED, and my availability becomes ON_DELIVERY |
| `AC-08-06` | Given two drivers are offered the same order and both accept at the same moment When both requests are processed Then exactly one assignment becomes ACCEPTED and the other driver receives 409 OFFER_NO_LONGER_AVAILABLE |
| `AC-08-07` | Given an offer has expired When I try to accept it Then I receive 409 OFFER_NO_LONGER_AVAILABLE |
| `AC-08-08` | Given I decline an offer When the dispatch job runs again Then the order is offered to a different driver and never again to me for that order |
| `AC-08-09` | Given I already hold an accepted delivery When I try to accept another offer Then I receive 409 DRIVER_HAS_ACTIVE_DELIVERY |
| `AC-08-10` | Given I am on an active delivery When I try to go OFFLINE Then I receive 409 DRIVER_HAS_ACTIVE_DELIVERY |
| `AC-08-11` | Given I submit an availability of ON_DELIVERY When the request is processed Then I receive 422 — that state is set by the system, not by me |
| `AC-08-12` | Given my accepted order is still PREPARING When I try to mark it picked up Then I receive 409 INVALID_ORDER_TRANSITION stating the current status |
| `AC-08-13` | Given my accepted order is READY_FOR_PICKUP When I mark it picked up Then its status becomes OUT_FOR_DELIVERY and pickedUpAt is stamped |
| `AC-08-14` | Given my order is OUT_FOR_DELIVERY When I mark it delivered Then its status becomes DELIVERED, deliveredAt is stamped, my assignment closes, and I become AVAILABLE again |
| `AC-08-15` | Given an order assigned to a different driver When I try to act on it Then I receive 404 RESOURCE_NOT_FOUND |
| `AC-08-16` | Given I am viewing an offer I have not yet accepted When I inspect the payload Then I see the distance and the drop-off district, but not the customer's street address, name, phone or email |
| `AC-08-17` | Given I have accepted a delivery When I view it Then I see the full delivery address, the customer's first name and a masked phone — and never their email |
| `AC-08-18` | Given no drivers are online When an order is confirmed and prepared Then it reaches READY_FOR_PICKUP and stays there with dispatch state UNASSIGNED, the customer sees "finding a driver", nothing is cancelled, and after 15 minutes the order appears in the admin unassigned backlog |
| `AC-08-19` | Given an admin force-cancels an order I am delivering When the cancellation is processed Then my assignment is cancelled, I become AVAILABLE, and my screen shows the cancellation with its reason |

---

## Story 09 — Reviews & Ratings

[story-09-reviews-ratings.md](../sdd/stories/story-09-reviews-ratings.md) — 18 criteria

| AC ID | Criterion |
|---|---|
| `AC-09-01` | Given my order was delivered When I submit a restaurant rating of 5 and a comment Then the review is created and the restaurant's rating average and count update in the same request |
| `AC-09-02` | Given my order is PREPARING When I try to review it Then I receive 422 ORDER_NOT_REVIEWABLE naming the current status |
| `AC-09-03` | Given my order was cancelled When I try to review it Then I receive 422 ORDER_NOT_REVIEWABLE — a cancelled order is never reviewable |
| `AC-09-04` | Given I already reviewed an order When I submit another review for it Then I receive 409 REVIEW_ALREADY_EXISTS |
| `AC-09-05` | Given I submit two reviews for the same order at the same moment When both requests are processed Then exactly one review exists and the other request receives 409 |
| `AC-09-06` | Given an order I did not place When I try to review it Then I receive 404 RESOURCE_NOT_FOUND |
| `AC-09-07` | Given my delivered order had no driver assigned When I submit a driver rating Then I receive 422 naming driverRating |
| `AC-09-08` | Given my delivered order had a driver When I submit a driver rating of 4 Then the driver's rating average and count update |
| `AC-09-09` | Given I submitted a review 23 hours ago When I edit it Then the edit succeeds and the aggregates are recomputed |
| `AC-09-10` | Given I submitted a review 25 hours ago When I edit it Then I receive 409 REVIEW_EDIT_WINDOW_CLOSED with the editableUntil timestamp, and my UI had already disabled the edit button with that reason |
| `AC-09-11` | Given a restaurant has reviews of 5, 4 and 3 When the aggregate is computed Then the average is 4.00 and the count is 3 |
| `AC-09-12` | Given an admin hides the 3-star review When the aggregate is recomputed Then the average becomes 4.50 and the count becomes 2, and the review disappears from the public list |
| `AC-09-13` | Given the admin restores it Then the average returns to 4.00 and the count to 3 |
| `AC-09-14` | Given a restaurant's only review is hidden When I view the restaurant Then its rating average is 0.00 with a count of 0, and discovery sorts it as unrated rather than as zero-star |
| `AC-09-15` | Given I view a restaurant's public reviews When I inspect the response body Then each author appears as a first name and last initial, and no email, phone or full surname appears anywhere in the payload |
| `AC-09-16` | Given a review comment contains "<script>alert(1)</script>" When it is displayed Then it renders as literal text and no script executes |
| `AC-09-17` | Given I submit a comment of 1001 characters Then I receive 422 stating the actual length |
| `AC-09-18` | Given I submit a rating of 0 or 6 Then I receive 422 |

---

## Story 10 — Platform Administration & Reporting

[story-10-platform-administration-reporting.md](../sdd/stories/story-10-platform-administration-reporting.md) — 15 criteria

| AC ID | Criterion |
|---|---|
| `AC-10-01` | Given I am an admin When I suspend a user Then their refresh tokens are revoked and their existing access token is rejected on their very next request |
| `AC-10-02` | Given I am an admin When I try to suspend my own account Then I receive 422 — an admin cannot lock themselves out |
| `AC-10-03` | Given a driver is currently on an accepted delivery When I try to suspend them Then I receive 409 DRIVER_HAS_ACTIVE_DELIVERY naming the order |
| `AC-10-04` | Given a driver has an unaccepted offer When I suspend them Then the suspension succeeds and the offer expires and is re-dispatched |
| `AC-10-05` | Given a restaurant has orders in PENDING, PREPARING and OUT_FOR_DELIVERY When I suspend it Then it disappears from customer listings, all three orders complete normally, and its owner can still log in and see what happened |
| `AC-10-06` | Given an order is stuck OUT_FOR_DELIVERY When I force-cancel it with a reason Then it becomes CANCELLED with cancelledBy ADMIN, a status event is written, the assignment is cancelled and the driver becomes AVAILABLE |
| `AC-10-07` | Given an order is DELIVERED When I try to force-cancel it Then I receive 409 INVALID_ORDER_TRANSITION — terminal states are terminal, even for an admin |
| `AC-10-08` | Given I force-cancel an order without a reason Then I receive 422 |
| `AC-10-09` | Given I perform any mutating admin action When the transaction commits Then exactly one admin_audit_logs row exists for it, naming me, the action, the entity and the reason |
| `AC-10-10` | Given a review is abusive When I hide it Then it disappears from the public list and the restaurant's rating average is recomputed without it |
| `AC-10-11` | Given I restore a hidden review Then it reappears and the aggregate returns to its previous value |
| `AC-10-12` | Given orders exist across every status When I open the statistics endpoint Then GMV counts only DELIVERED orders, and the status breakdown matches the actual counts |
| `AC-10-13` | Given two orders have been unassigned for more than 15 minutes When I open the dashboard Then the unassigned backlog shows 2 and links to those orders |
| `AC-10-14` | Given I am not an admin When I call any /api/admin route Then I receive 403 FORBIDDEN_ROLE |
| `AC-10-15` | Given I am an admin performing a destructive action When I open the confirmation dialog Then it names the specific consequence and requires a reason before the confirm button is enabled |

