# Test Cases — Authorization & Roles (TC-029 – TC-054)

> Covers [spec-02](../../sdd/specs/spec-02-identity-authentication-authorization.md) ·
> all four roles · FR-1.5 · [ADR-010](../../sdd/architecture/security.md#adr-010-404-over-403-for-cross-tenant-resources)
> Cross-cutting: every spec that defines a protected endpoint.

**Priority rationale.** Authorization is Critical. A gap is silent and
unbounded — nothing alerts you that one customer read a stranger's delivery
address, and the exposure is complete before anyone notices.

**The governing rule, asserted throughout:**
**wrong role → 403 `FORBIDDEN_ROLE`; correct role, someone else's row → 404
`RESOURCE_NOT_FOUND`.** A test that expects 403 for a cross-tenant resource is
asserting the wrong requirement.

---

## The generated authorization matrix

### TC-029 — Every protected endpoint rejects anonymous callers
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** FR-1.4, NFR-9
**Type** API · **Priority** Critical
**Steps** 1. Enumerate every route not on the public allow-list. 2. Call each with no `Authorization` header.
**Expected** Every one returns 401 `TOKEN_MISSING`.
**Notes** Data-driven from the route table, so a new endpoint is covered automatically. The public allow-list is: `/api/health`, `/api/auth/{register,login,refresh}`, `/api/restaurants*` reads, `/api/search`, `/api/cuisines`.

### TC-030 — Every protected endpoint rejects the wrong role
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** FR-1.5
**Type** API · **Priority** Critical
**Steps** 1. For each protected route, call it with a token for each of the four roles. 2. Compare against the expected-role table.
**Expected** Each disallowed role receives 403 `FORBIDDEN_ROLE`; each allowed role receives something other than 403.
**Notes** This single generated case is the backbone of role isolation; TC-031–TC-046 assert the specific pairings that matter most and would be easy to get wrong individually.

### TC-031 — Default-deny router audit: no route lacks a guard
**Spec** spec-01, spec-02 · **Story** story-01, story-02 · **AC** — · **Rules** NFR-9, security §4
**Type** Service · **Priority** Critical
**Steps** 1. Walk the Express route table. 2. Assert each route either is on the public allow-list or declares `authenticate`. 3. Assert each authenticated route declares `authorize`, except the enumerated any-role routes.
**Expected** No violations.
**Notes** The any-role exceptions are exactly `POST /api/auth/logout`, `POST /api/auth/change-password`, `GET /api/me`, `PATCH /api/me`. A new endpoint added without a guard fails CI here rather than in production.

---

## Customer boundaries

### TC-032 — Customer cannot reach admin endpoints
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-14 · **Rules** FR-1.5
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_A`, call `GET /api/admin/users`, `GET /api/admin/stats`, `POST /api/admin/users/:id/suspend`, `POST /api/admin/orders/:id/force-cancel`.
**Expected** All 403 `FORBIDDEN_ROLE`; no state changes.

### TC-033 — Customer cannot manage any restaurant's menu
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** FR-1.5
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_A`, call `POST /api/restaurant/items`, `PATCH /api/restaurant/items/:id/availability`, `DELETE /api/restaurant/categories/:id`.
**Expected** All 403 `FORBIDDEN_ROLE`.
**Post** `food_items` and `menu_categories` unchanged.

### TC-034 — Customer cannot perform restaurant order transitions
**Spec** spec-07 · **Story** story-07 · **AC** — · **Rules** §7.3 transition table
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_A`, call `POST /api/restaurant/orders/:id/accept` on their own order.
**Expected** 403 `FORBIDDEN_ROLE`; order still `PENDING`.
**Notes** Owning the order does not grant the restaurant's transitions — role and ownership are independent checks.

### TC-035 — Customer cannot reach driver endpoints
**Spec** spec-08 · **Story** story-08 · **AC** — · **Rules** FR-1.5
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_A`, call `GET /api/driver/offers`, `POST /api/driver/deliveries/:orderId/deliver`.
**Expected** 403 `FORBIDDEN_ROLE`.

### TC-036 — Customer cannot read another customer's order
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-17 · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Data** `CUST_A`, `ORDER_B_FOREIGN`
**Steps** 1. As `CUST_A`, `GET /api/orders/{ORDER_B_FOREIGN}`.
**Expected** **404** `RESOURCE_NOT_FOUND` — not 403, which would confirm the order exists.

### TC-037 — Customer cannot cancel another customer's order
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-17 · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_A`, `POST /api/orders/{ORDER_B_FOREIGN}/cancel`.
**Expected** 404; `ORDER_B_FOREIGN` remains `PENDING`.

### TC-038 — Customer cannot read another customer's address
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-15 · **Rules** BR-A7, ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_A`, `GET`/`PATCH`/`DELETE` an address belonging to `CUST_B`.
**Expected** 404 on all three; `CUST_B`'s address is unchanged.

### TC-039 — Customer cannot modify another customer's cart line
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-17 · **Rules** BR-C1, ADR-010
**Type** Security · **Priority** Critical
**Data** `CART_B_OTHER`
**Steps** 1. As `CUST_A`, `PATCH`/`DELETE` a cart line ID belonging to `CUST_B`.
**Expected** 404; `CUST_B`'s cart unchanged.
**Notes** There is no cart ID in any route — the cart is resolved from the token — so only the line ID is attackable.

---

## Restaurant boundaries

### TC-040 — Restaurant cannot read or modify another restaurant's profile
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** BR-R1
**Type** Security · **Priority** Critical
**Steps** 1. As `OWNER_A`, `GET /api/restaurant/profile`. 2. Attempt to pass `restaurantId` for `REST_B` in body and query.
**Expected** Always `REST_A`'s data; the injected parameter is stripped and ignored.
**Notes** Restaurant routes accept no restaurant ID at all, so the IDOR surface is removed rather than defended.

### TC-041 — Restaurant cannot manage another restaurant's menu items
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-17 · **Rules** BR-R6
**Type** Security · **Priority** Critical
**Steps** 1. As `OWNER_A`, `PATCH`/`DELETE` an item belonging to `REST_B`.
**Expected** 404 `RESOURCE_NOT_FOUND`; `REST_B`'s item unchanged.

### TC-042 — Restaurant cannot assign its item to another restaurant's category
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-16 · **Rules** BR-R6
**Type** API · **Priority** High
**Data** `ITEM_CAT_FOREIGN`
**Steps** 1. As `OWNER_A`, create an item with `categoryId = CAT_B_PASTA`.
**Expected** 422 with `details[].field = "categoryId"`.
**Notes** Deliberately 422 rather than 404: the caller owns the *item* operation, and naming the real problem is more useful than hiding an ID they already supplied.

### TC-043 — Restaurant cannot act on another restaurant's order
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-10 · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `OWNER_A`, `POST /api/restaurant/orders/{ORDER_B_FOREIGN}/accept`.
**Expected** 404; the order remains `PENDING`.
**Notes** The single most important authorization case in the suite — `authorize('RESTAURANT')` alone would let any restaurant accept any order.

### TC-044 — Restaurant cannot reach admin or driver endpoints
**Spec** spec-08, spec-10 · **Story** story-08, story-10 · **AC** AC-10-14 · **Rules** FR-1.5
**Type** Security · **Priority** Critical
**Steps** 1. As `OWNER_A`, call `GET /api/admin/stats`, `POST /api/admin/restaurants/:id/approve` (on itself), `GET /api/driver/offers`.
**Expected** All 403 `FORBIDDEN_ROLE`.
**Notes** Self-approval is the attack that matters here: it would let a restaurant bypass admin review entirely.

### TC-045 — Restaurant cannot write its own status or rating
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** BR-R12, BR-V5
**Type** Security · **Priority** Critical
**Steps** 1. As `OWNER_A`, `PATCH /api/restaurant/profile` with `status: "ACTIVE"`, `ratingAverage: "5.00"`, `ratingCount: 999`.
**Expected** 200 with the legitimate fields applied; `status`, `rating_average` and `rating_count` unchanged in the database.

### TC-046 — Unapproved restaurant is blocked from operational routes
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-03 · **Rules** FR-2.7
**Type** API · **Priority** High
**Steps** 1. As `OWNER_PENDING`, call `POST /api/restaurant/items` and `GET /api/restaurant/orders`. 2. Call `GET /api/restaurant/profile` and `PUT /api/restaurant/hours`.
**Expected** Step 1 → 403 `RESTAURANT_NOT_APPROVED`. Step 2 → 200; a pending restaurant must still be able to finish setting itself up.

---

## Driver boundaries

### TC-047 — Driver cannot act on another driver's assignment
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-15 · **Rules** BR-D5, ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `DRIVER_B`, `POST /api/driver/deliveries/{ORDER_OUT}/deliver` (assigned to `DRIVER_BUSY`).
**Expected** 404; the order stays `OUT_FOR_DELIVERY`.

### TC-048 — Driver cannot accept an offer made to another driver
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-15 · **Rules** BR-D3
**Type** Security · **Priority** Critical
**Data** `ASSIGN_OFFERED` (offered to `DRIVER_A`)
**Steps** 1. As `DRIVER_B`, `POST /api/driver/offers/{ASSIGN_OFFERED}/accept`.
**Expected** 404; the assignment stays `OFFERED` to `DRIVER_A`.

### TC-049 — Driver cannot modify restaurant or menu data
**Spec** spec-03, spec-04 · **Story** story-03 · **AC** — · **Rules** FR-1.5
**Type** Security · **Priority** Critical
**Steps** 1. As `DRIVER_A`, call `PATCH /api/restaurant/profile`, `POST /api/restaurant/items`, `POST /api/restaurant/orders/:id/accept`.
**Expected** All 403 `FORBIDDEN_ROLE`.

### TC-050 — Driver cannot reach admin endpoints
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-14 · **Rules** FR-1.5
**Type** Security · **Priority** Critical
**Steps** 1. As `DRIVER_A`, call `GET /api/admin/users`, `POST /api/admin/drivers` (self-provisioning attempt), `GET /api/admin/stats`.
**Expected** All 403 `FORBIDDEN_ROLE`.
**Notes** Self-provisioning is the attack that matters — it would defeat ADR-006.

### TC-051 — Unapproved or suspended driver is blocked from all driver routes
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-02 · **Rules** BR-D2
**Type** API · **Priority** High
**Data** `DRIVER_PENDING`
**Steps** 1. As `DRIVER_PENDING`, call `GET /api/driver/offers` and `PATCH /api/driver/availability`.
**Expected** 403 `ACCOUNT_SUSPENDED`; the driver receives no offers from dispatch either.
**Notes** The role guard passes; the profile-status guard is what stops them.

### TC-052 — Driver cannot set availability to ON_DELIVERY
**Spec** spec-08 · **Story** story-08 · **AC** AC-08-11 · **Rules** FR-7.7
**Type** Security · **Priority** High
**Steps** 1. As `DRIVER_A`, `PATCH /api/driver/availability` `{ availability: "ON_DELIVERY" }`.
**Expected** 422 `VALIDATION_ERROR`; availability unchanged.
**Notes** `ON_DELIVERY` is system-set. Accepting it from a client would let a driver fake an assignment state.

---

## Admin boundaries

### TC-053 — Admin can perform every administrative operation
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-01 · **Rules** FR-9.1 – FR-9.9
**Type** API · **Priority** High
**Steps** 1. As `ADMIN_A`, exercise one endpoint from each admin group: stats, users, drivers, restaurants, orders, reviews, audit logs.
**Expected** All succeed (2xx); each mutation writes exactly one `admin_audit_logs` row.
**Notes** The positive counterpart to TC-032/044/050 — proving the guard permits as well as denies.

### TC-054 — Admin cannot suspend their own account
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** BR-AD7
**Type** API · **Priority** High
**Steps** 1. As `ADMIN_A`, `POST /api/admin/users/{ADMIN_A}/suspend`.
**Expected** 422; `ADMIN_A` remains `ACTIVE`.
**Notes** Locking the last admin out is unrecoverable without direct database access. `ADMIN_B` exists in the fixtures so the "admins can suspend *other* admins" path is also exercisable.
