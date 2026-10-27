# API Design

> Parent: [master-sdd.md](../master-sdd.md) · Envelope and error codes: [master-sdd §14](../master-sdd.md#14-error-handling)

## 1. Conventions

- **Base path:** `/api`. Breaking changes would ship under `/api/v2`; v1 is additive-only.
- **Auth:** `Authorization: Bearer <accessToken>`. The refresh token travels in the request body of `POST /api/auth/refresh` only.
- **Content type:** `application/json` both ways. Body limit 100 KB.
- **Casing:** `camelCase` in JSON, `snake_case` in the database. Mappers translate at the repository/controller boundary; the two vocabularies never mix in one layer.
- **Pagination:** `?page=1&limit=20`, `limit` capped at 100. Response carries `meta.pagination = { page, limit, total, totalPages }`.
- **Sorting:** `?sort=<field>&order=asc|desc`, both validated against a per-endpoint allow-list. Never interpolated into SQL.
- **Idempotency:** action endpoints are idempotent in effect — re-accepting an already-`CONFIRMED` order returns `409 INVALID_ORDER_TRANSITION`, not a second transition.
- **Ownership failures** return `404 RESOURCE_NOT_FOUND`, not 403 ([ADR-010](security.md#adr-010-404-over-403-for-cross-tenant-resources)).

### Auth column legend

| Symbol | Meaning |
|--------|---------|
| — | Public, no token |
| 🔓 | Any authenticated user |
| C / R / D / A | CUSTOMER / RESTAURANT / DRIVER / ADMIN |
| +own | Role gate **plus** a service-layer ownership check |

---

## 2. Authentication — `/api/auth`

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/auth/register` | — | Self-register a CUSTOMER or RESTAURANT |
| POST | `/api/auth/login` | — | Exchange credentials for tokens |
| POST | `/api/auth/refresh` | — | Rotate a refresh token |
| POST | `/api/auth/logout` | 🔓 | Revoke the presented refresh token |
| POST | `/api/auth/change-password` | 🔓 | Change password, revoke all sessions |

### `POST /api/auth/register`

```jsonc
// request
{
  "email": "sara@example.com",
  "password": "Str0ngPass",
  "fullName": "Sara Idris",
  "phone": "+966501234567",
  "role": "CUSTOMER",              // CUSTOMER | RESTAURANT only
  "restaurantName": "Olive Grill"  // required when role = RESTAURANT
}
```

**Validation:** master-sdd §15. `role` is rejected (403 `FORBIDDEN_ROLE`) for
`DRIVER`/`ADMIN` — never silently downgraded (BR-A3).

```jsonc
// 201
{
  "success": true,
  "data": {
    "user": { "id": "…", "email": "sara@example.com", "fullName": "Sara Idris", "role": "CUSTOMER", "status": "ACTIVE" },
    "restaurant": null,
    "accessToken": "eyJ…",
    "refreshToken": "9f2c…",
    "expiresIn": 900
  },
  "meta": { "requestId": "…" }
}
```

For `role = RESTAURANT`, `data.restaurant` is the `PENDING_APPROVAL` shell.

**Errors:** 422 `VALIDATION_ERROR` · 409 `EMAIL_ALREADY_REGISTERED` · 403 `FORBIDDEN_ROLE` · 429 `RATE_LIMIT_EXCEEDED`.

### `POST /api/auth/login`

Request `{ email, password }`. Response identical to register's `data`.
**Errors:** 401 `INVALID_CREDENTIALS` (wrong email *and* wrong password give the
same response and the same timing) · 403 `ACCOUNT_SUSPENDED` · 429.

### `POST /api/auth/refresh`

Request `{ refreshToken }` → `{ accessToken, refreshToken, expiresIn }`. The old
token is revoked on use (rotation).
**Errors:** 401 `REFRESH_TOKEN_INVALID` · 401 `REFRESH_TOKEN_REUSED` (revokes the
whole family) · 403 `ACCOUNT_SUSPENDED`.

### `POST /api/auth/change-password`

Request `{ currentPassword, newPassword }` → 204. Revokes every refresh token
for the user (FR-1.6). **Errors:** 401 `INVALID_CREDENTIALS` · 422.

---

## 3. Profile & addresses — `/api/me`, `/api/addresses`

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/me` | 🔓 | Current user + role-specific profile block |
| PATCH | `/api/me` | 🔓 | Update `fullName`, `phone` |
| GET | `/api/addresses` | C | List own addresses |
| POST | `/api/addresses` | C | Create an address |
| PATCH | `/api/addresses/:id` | C +own | Update |
| DELETE | `/api/addresses/:id` | C +own | Soft-delete |
| POST | `/api/addresses/:id/default` | C +own | Make default (clears the previous, BR-A7) |

`GET /api/me` returns `{ user, restaurant? , driverProfile? }` — the extra block
depends on role, so a client never needs a second call to learn whether its
restaurant is approved.

**Errors:** 404 `RESOURCE_NOT_FOUND` on another user's address · 422 · 409 if an
address is referenced by an active order and a hard delete is attempted (BR-A8;
the API always soft-deletes, so this is a defensive code path).

---

## 4. Discovery — `/api/restaurants` (public reads)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/restaurants` | — | Paginated list of `ACTIVE` restaurants |
| GET | `/api/restaurants/:id` | — | Restaurant detail |
| GET | `/api/restaurants/:id/menu` | — | Active categories with available-flagged items |
| GET | `/api/restaurants/:id/reviews` | — | Published reviews, paginated |
| GET | `/api/search` | — | Combined restaurant + food-item search |
| GET | `/api/cuisines` | — | Distinct cuisine list for the filter UI |

### `GET /api/restaurants`

Query: `page`, `limit`, `cuisine`, `openNow=true`, `minRating=1..5`,
`q` (name fragment), `sort ∈ {rating, deliveryFee, name, newest}`,
`order ∈ {asc, desc}`.

```jsonc
// 200
{
  "success": true,
  "data": [
    {
      "id": "…", "name": "Olive Grill", "slug": "olive-grill",
      "cuisineType": "LEVANTINE", "logoUrl": "https://…", "coverImageUrl": "https://…",
      "deliveryFee": "12.00", "minimumOrderAmount": "30.00",
      "avgPreparationMinutes": 25,
      "ratingAverage": "4.35", "ratingCount": 128,
      "isOpenNow": true, "isAcceptingOrders": true, "isOrderable": true,
      "city": "Riyadh", "district": "Al Olaya"
    }
  ],
  "meta": { "requestId": "…", "pagination": { "page": 1, "limit": 20, "total": 37, "totalPages": 2 } }
}
```

`isOrderable` is computed server-side from BR-R3 and is the **only** flag the UI
may use to enable an "Add to cart" button.

Only `status = ACTIVE` rows are ever returned. `PENDING_APPROVAL`, `SUSPENDED`
and `REJECTED` restaurants are invisible here — a direct `GET
/api/restaurants/:id` for one returns 404, not a redacted record.

### `GET /api/restaurants/:id/menu`

Returns active categories in `display_order`, each with its non-deleted items.
Unavailable items are **included** with `"isAvailable": false` (FR-4.5) so the
UI can show them greyed rather than silently shrinking the menu.

### `GET /api/search`

Query `q` (2–60 chars, required), `limit` (≤20 per group).

```jsonc
{ "success": true,
  "data": {
    "restaurants": [ { "id": "…", "name": "Olive Grill", "…": "…" } ],
    "foodItems":   [ { "id": "…", "name": "Olive Salad", "price": "22.00",
                       "restaurant": { "id": "…", "name": "Olive Grill", "isOrderable": true } } ] } }
```

Trigram `ILIKE`-style matching; results from non-`ACTIVE` restaurants are
excluded from both groups.

---

## 5. Restaurant self-service — `/api/restaurant`

All routes: role `RESTAURANT`, scoped to the caller's own restaurant resolved
from `owner_user_id`. No route accepts a `restaurantId` — the caller cannot
name a restaurant other than their own, which removes a whole class of IDOR.

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/restaurant/profile` | R +own | Own profile incl. `status` |
| PATCH | `/api/restaurant/profile` | R +own | Update profile fields |
| GET | `/api/restaurant/hours` | R +own | Weekly hours |
| PUT | `/api/restaurant/hours` | R +own | Replace the full 7-day schedule |
| PATCH | `/api/restaurant/accepting-orders` | R +own | `{ isAcceptingOrders }` toggle |
| GET | `/api/restaurant/categories` | R +own | All categories incl. inactive |
| POST | `/api/restaurant/categories` | R +own | Create |
| PATCH | `/api/restaurant/categories/:id` | R +own | Update |
| DELETE | `/api/restaurant/categories/:id` | R +own | Soft-delete (409 if non-empty) |
| PUT | `/api/restaurant/categories/order` | R +own | Reorder atomically, `[{ id, displayOrder }]` (spec-04) |
| GET | `/api/restaurant/items` | R +own | All items, filterable by category/availability |
| POST | `/api/restaurant/items` | R +own | Create |
| PATCH | `/api/restaurant/items/:id` | R +own | Update |
| PATCH | `/api/restaurant/items/:id/availability` | R +own | `{ isAvailable }` |
| DELETE | `/api/restaurant/items/:id` | R +own | Soft-delete |
| GET | `/api/restaurant/orders` | R +own | Orders, `?status=`, `?scope=active\|history` |
| GET | `/api/restaurant/orders/:id` | R +own | Order detail |
| POST | `/api/restaurant/orders/:id/accept` | R +own | T1 |
| POST | `/api/restaurant/orders/:id/reject` | R +own | T2 with reason |
| POST | `/api/restaurant/orders/:id/start-preparing` | R +own | T3 |
| POST | `/api/restaurant/orders/:id/ready` | R +own | T5 |
| POST | `/api/restaurant/orders/:id/cancel` | R +own | T4 / T6 with reason |
| GET | `/api/restaurant/stats` | R +own | Today's counts, revenue, rating |

`PUT /api/restaurant/hours` replaces all seven days atomically — a partial
update of opening hours is a footgun (a client that sends only Monday would
leave the rest stale in a PATCH model and ambiguous in a merge model).

**Guard:** every write route additionally requires `restaurant.status = ACTIVE`,
returning `403 RESTAURANT_NOT_APPROVED` otherwise, except `GET/PATCH profile`
and `GET/PUT hours` — a pending restaurant must be able to finish setting itself
up while it waits.

### `POST /api/restaurant/orders/:id/reject`

```jsonc
// request
{ "reason": "OUT_OF_STOCK", "note": "Grill is down for repair" }
```
→ 200 with the updated order. **Errors:** 409 `INVALID_ORDER_TRANSITION` (not
`PENDING`) · 404 (order belongs to another restaurant) · 422 (missing/invalid
reason).

---

## 6. Cart — `/api/cart`

All routes: role `CUSTOMER`, scoped to the caller's active cart.

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/cart` | C | Active cart, re-validated, with computed totals |
| POST | `/api/cart/items` | C | Add an item (`?replace=true` to switch restaurant) |
| PATCH | `/api/cart/items/:itemId` | C +own | Set quantity 1–20 |
| DELETE | `/api/cart/items/:itemId` | C +own | Remove a line |
| POST | `/api/cart/discount` | C | Apply a discount code (`{ code }`) to the cart |
| DELETE | `/api/cart/discount` | C | Remove the applied code |
| DELETE | `/api/cart` | C | Empty the cart |

### `GET /api/cart`

```jsonc
{
  "success": true,
  "data": {
    "id": "…",
    "restaurant": { "id": "…", "name": "Olive Grill", "deliveryFee": "12.00",
                    "minimumOrderAmount": "30.00", "isOrderable": true },
    "items": [
      { "id": "…", "foodItemId": "…", "name": "Mixed Grill", "imageUrl": "…",
        "unitPrice": "58.00", "quantity": 2, "lineTotal": "116.00",
        "notes": "No onions", "isAvailable": true, "issues": [] },
      { "id": "…", "foodItemId": "…", "name": "Lentil Soup",
        "unitPrice": "18.00", "quantity": 1, "lineTotal": "18.00",
        "isAvailable": false, "issues": ["ITEM_UNAVAILABLE"] }
    ],
    "totals": { "subtotal": "134.00", "discountAmount": "13.40", "deliveryFee": "12.00",
                "taxAmount": "18.09", "total": "150.69" },
    "discount": { "code": "SAVE10", "type": "PERCENT", "value": "10.00", "amount": "13.40" },
    "discountIssue": null,
    "issues": ["ITEM_UNAVAILABLE"],
    "canCheckout": false,
    "meetsMinimum": true
  }
}
```

`unitPrice` is the **live** menu price (ADR-008). `canCheckout` is the
server's verdict; the client must not re-derive it.

`totals.discountAmount` is `"0.00"` and `discount` is `null` without a code.
Tax is charged on the discounted subtotal and the total is
`subtotal − discountAmount + deliveryFee + taxAmount` (BR-DC6). A stored code
that no longer qualifies is returned as
`discountIssue: { code, discountCode, message, details }`, is not priced, and
sets `canCheckout` to `false`.

### `POST /api/cart/discount`

```jsonc
{ "code": "save10" }   // trimmed, matched case-insensitively
```

Returns the full cart, as `GET /api/cart`, with the code applied. The code is
judged against the cart as it is now; a refusal leaves the cart unchanged.
Checkout judges it again (BR-DC8). `DELETE /api/cart/discount` removes it and
returns the cart.

**Errors (all 422):** `CART_EMPTY` · `DISCOUNT_CODE_INVALID` ·
`DISCOUNT_CODE_EXPIRED` (`details[].startsAt` or `endsAt`) ·
`DISCOUNT_CODE_NOT_APPLICABLE` (another restaurant, or under the code's minimum
with `required`, `actual`, `shortfall`) · `DISCOUNT_CODE_LIMIT_REACHED` ·
`VALIDATION_ERROR`.

An empty cart returns `200` with `items: []` and a `null` restaurant — never
404. A customer without a cart row gets the same shape; the row is created
lazily on first add.

### `POST /api/cart/items`

```jsonc
{ "foodItemId": "…", "quantity": 2, "notes": "No onions" }
```

Adding an item already present increments the line (BR-C6).

**Cross-restaurant conflict (BR-C3):**

```jsonc
// 409
{ "success": false,
  "error": {
    "code": "CART_RESTAURANT_MISMATCH",
    "message": "Your cart contains items from a different restaurant.",
    "details": [{
      "field": "foodItemId",
      "issue": "Cart is bound to 'Olive Grill'; this item belongs to 'Pasta House'.",
      "currentRestaurant": { "id": "…", "name": "Olive Grill", "itemCount": 3 },
      "requestedRestaurant": { "id": "…", "name": "Pasta House" }
    }]
  } }
```

The client renders "Start a new cart with Pasta House?" and, on confirmation,
retries with `?replace=true`, which clears and rebinds in one transaction
(BR-C4). **The server never guesses.**

**Other errors:** 422 `ITEM_UNAVAILABLE` · 422 `RESTAURANT_UNAVAILABLE` · 404
(item soft-deleted or in an inactive category) · 422 `VALIDATION_ERROR`
(quantity out of 1–20).

---

## 7. Orders — `/api/orders` (customer view)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/orders` | C | Checkout: convert cart → order |
| GET | `/api/orders` | C | Own order history, `?scope=active\|past`, paginated |
| GET | `/api/orders/:id` | C +own | Order detail with status timeline |
| POST | `/api/orders/:id/cancel` | C +own | T2 / T4 |
| GET | `/api/orders/:id/status` | C +own | Lightweight polling payload |

### `POST /api/orders`

```jsonc
// request — note the complete absence of prices (BR-O5)
{ "addressId": "…", "customerNote": "Ring the bell twice", "paymentMethod": "CASH_ON_DELIVERY" }
```

```jsonc
// 201
{ "success": true,
  "data": {
    "id": "…", "orderNumber": "FF-20260922-4K9P2M", "status": "PENDING",
    "restaurant": { "id": "…", "name": "Olive Grill", "phone": "+9661…" },
    "items": [ { "name": "Mixed Grill", "unitPrice": "58.00", "quantity": 2, "lineTotal": "116.00" } ],
    "subtotal": "134.00", "deliveryFee": "12.00", "taxAmount": "20.10", "totalAmount": "166.10",
    "deliveryAddress": { "line1": "…", "city": "Riyadh", "district": "Al Olaya" },
    "placedAt": "2026-09-22T18:04:11.201Z",
    "timeline": [ { "status": "PENDING", "at": "2026-09-22T18:04:11.201Z", "actor": "CUSTOMER" } ]
  } }
```

A code applied to the cart (`POST /api/cart/discount`) is used and re-validated
inside this transaction; the request body does not change. An order carries
`discountAmount` (`"0.00"` without a code) and `discountCode` (`null` without
one) in every order payload, and its total is
`subtotal − discountAmount + deliveryFee + taxAmount`. The restaurant minimum is
checked on the subtotal before the discount.

**Errors:** 422 `CART_EMPTY` · 422 `CART_HAS_ISSUES` (with the offending lines in
`details`) · 422 `BELOW_MINIMUM_ORDER` (with `required` and `actual`) · 422
`RESTAURANT_UNAVAILABLE` (closed between cart and checkout) · 422
`DISCOUNT_CODE_INVALID` / `_EXPIRED` / `_NOT_APPLICABLE` / `_LIMIT_REACHED` (the
code on the cart stopped qualifying; no order is created and the cart stays
`ACTIVE`) · 404 (address not owned) · 429.

The whole operation is one transaction: lock the cart → re-validate items and
restaurant → compute totals → insert `orders` + `order_items` + the initial
`order_status_events` row → mark the cart `CONVERTED`. Any failure rolls all of
it back (NFR-7).

### `GET /api/orders/:id/status`

A deliberately small payload for the 10 s poll:
`{ status, dispatchState, updatedAt, driver: { fullName, phone } | null, timeline: [...] }`.
Returning the full order on every poll would be wasteful and would leak
churn into the client's render path.

### `POST /api/orders/:id/cancel`

Request `{ "reason": "CUSTOMER_CHANGED_MIND" }` (optional; defaults).
**Errors:** 409 `INVALID_ORDER_TRANSITION` with a `details.issue` explaining the
current status and the customer's cancellation window (BR-O8, T2/T4) · 404.

---

## 8. Driver — `/api/driver`

Role `DRIVER`, scoped to `req.user.id`.

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/driver/profile` | D +own | Profile incl. status/availability |
| PATCH | `/api/driver/profile` | D +own | Vehicle info |
| PATCH | `/api/driver/availability` | D +own | `{ availability: OFFLINE\|AVAILABLE }` |
| PATCH | `/api/driver/location` | D +own | `{ latitude, longitude }` for dispatch ranking |
| GET | `/api/driver/offers` | D +own | Live offers (polled) |
| POST | `/api/driver/offers/:id/accept` | D +own | Accept an offer |
| POST | `/api/driver/offers/:id/decline` | D +own | Decline |
| GET | `/api/driver/deliveries` | D +own | `?scope=active\|history` |
| GET | `/api/driver/deliveries/:orderId` | D +own | Detail incl. pickup + dropoff |
| POST | `/api/driver/deliveries/:orderId/pick-up` | D +own | T7 |
| POST | `/api/driver/deliveries/:orderId/deliver` | D +own | T9 |

**Errors:** 409 `OFFER_NO_LONGER_AVAILABLE` (expired or taken — the losing side
of an accept race) · 409 `DRIVER_HAS_ACTIVE_DELIVERY` (BR-D5, and on an
`OFFLINE` attempt mid-delivery, BR-D9) · 409 `INVALID_ORDER_TRANSITION`
(pick-up before `READY_FOR_PICKUP`, BR-D7) · 403 `ACCOUNT_SUSPENDED` (driver
profile not `ACTIVE`) · 404 (an assignment belonging to another driver).

A driver's delivery detail exposes the customer's **address and first name and a
masked phone** — enough to complete the delivery, and nothing more. The
customer's email is never returned to a driver.

---

## 9. Reviews — `/api/reviews`

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/reviews` | C | Create a review for a delivered order |
| GET | `/api/reviews/mine` | C | Own reviews, paginated |
| PATCH | `/api/reviews/:id` | C +own | Edit within 24 h |
| GET | `/api/restaurants/:id/reviews` | — | Public, `PUBLISHED` only |
| GET | `/api/restaurant/reviews` | R +own | Reviews received by the caller's restaurant |
| GET | `/api/driver/reviews` | D +own | Driver ratings received by the caller |

```jsonc
// POST /api/reviews
{ "orderId": "…", "restaurantRating": 5, "driverRating": 4, "comment": "Fast and hot." }
```

**Errors:** 422 `ORDER_NOT_REVIEWABLE` (not `DELIVERED`, BR-V1) · 409
`REVIEW_ALREADY_EXISTS` (BR-V2) · 409 `REVIEW_EDIT_WINDOW_CLOSED` (BR-V6) · 422
(driver rating with no driver, BR-V4) · 404 (order not the caller's).

Public review payloads carry `{ id, restaurantRating, comment, createdAt,
customer: { displayName: "Sara I." } }` — BR-V8.

---

## 10. Admin — `/api/admin`

Role `ADMIN`. Every mutation writes an `admin_audit_logs` row in the same
transaction (FR-9.6). Every list's `q` is a free-text search of 1–60
characters, so it applies from the first character typed.

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/admin/stats` | A | Platform statistics |
| GET | `/api/admin/users` | A | `?role=&status=&q=&deleted=` (`include` \| `only`), paginated |
| POST | `/api/admin/users` | A | Create a CUSTOMER, ADMIN or RESTAURANT account (FR-9.11); returns a one-time `initialPassword` (BR-AD8) |
| GET | `/api/admin/users/:id` | A | User detail + activity summary |
| GET | `/api/admin/users/:id/addresses` | A | An active customer's saved addresses, for placing an order (FR-9.10) |
| POST | `/api/admin/users/:id/suspend` | A | `{ reason }`; revokes sessions |
| POST | `/api/admin/users/:id/reactivate` | A | |
| DELETE | `/api/admin/users/:id` | A | `{ reason }`; soft delete of a CUSTOMER or ADMIN; revokes sessions |
| POST | `/api/admin/users/:id/restore` | A | Clears `deleted_at`; status unchanged |
| POST | `/api/admin/drivers` | A | Create a driver account (BR-A4, ADR-006) |
| GET | `/api/admin/drivers` | A | `?status=&availability=&q=&deleted=` (`include` \| `only`) |
| POST | `/api/admin/drivers/:id/approve` | A | `PENDING_APPROVAL → ACTIVE` |
| POST | `/api/admin/drivers/:id/suspend` | A | `{ reason }` |
| DELETE | `/api/admin/drivers/:id` | A | `{ reason }`; soft delete; sets OFFLINE; refused during an active delivery |
| POST | `/api/admin/drivers/:id/restore` | A | Clears `deleted_at`; stays OFFLINE |
| GET | `/api/admin/restaurants` | A | `?status=&q=&deleted=` (`include` \| `only`) |
| POST | `/api/admin/restaurants/:id/approve` | A | `PENDING_APPROVAL → ACTIVE` |
| POST | `/api/admin/restaurants/:id/reject` | A | `{ reason }` → `REJECTED` |
| POST | `/api/admin/restaurants/:id/suspend` | A | `{ reason }` → `SUSPENDED` |
| POST | `/api/admin/restaurants/:id/reactivate` | A | → `ACTIVE` |
| DELETE | `/api/admin/restaurants/:id` | A | `{ reason }`; soft-deletes the restaurant and its owner; refused with orders in progress |
| POST | `/api/admin/restaurants/:id/restore` | A | Restores the restaurant and its owner; status unchanged |
| POST | `/api/admin/orders` | A | Place an order for a customer (FR-9.10); 201 with the admin order detail |
| GET | `/api/admin/orders` | A | `?status=&restaurantId=&from=&to=&q=` |
| GET | `/api/admin/orders/:id` | A | Full detail incl. the event log |
| POST | `/api/admin/orders/:id/force-cancel` | A | T2/T4/T6/T8/T10, reason mandatory |
| GET | `/api/admin/orders/unassigned` | A | The FR-7.4 backlog |
| GET | `/api/admin/orders/stuck` | A | Orders sitting too long in one status (operational, added during build) |
| GET | `/api/admin/reviews` | A | `?status=&restaurantId=&q=` |
| POST | `/api/admin/reviews/:id/hide` | A | `{ reason }`; recomputes aggregates |
| POST | `/api/admin/reviews/:id/restore` | A | |
| GET | `/api/admin/discount-codes` | A | `?status=&q=` (one of `ACTIVE`, `INACTIVE`, `EXPIRED`, `SCHEDULED`; `q` 1–60), with usage statistics |
| POST | `/api/admin/discount-codes` | A | Create a code (FR-11.1); 201 |
| GET | `/api/admin/discount-codes/:id` | A | One code with statistics |
| PUT | `/api/admin/discount-codes/:id` | A | Edit everything except `code` |
| POST | `/api/admin/discount-codes/:id/deactivate` | A | `{ reason }` |
| POST | `/api/admin/discount-codes/:id/reactivate` | A | |
| DELETE | `/api/admin/discount-codes/:id` | A | `{ reason }`; soft delete |
| GET | `/api/admin/audit-logs` | A | `?entityType=&entityId=&adminId=` |

### `POST /api/admin/users`

```jsonc
// request; restaurantName is required for RESTAURANT, address is for CUSTOMER only
{ "role": "CUSTOMER", "email": "sara@example.com", "fullName": "Sara Ibrahim", "phone": "+966500000000",
  "address": { "label": "Home", "line1": "King Fahd Rd 12", "city": "Riyadh", "district": "Al Olaya" } }
```

```jsonc
// 201
{ "success": true,
  "data": {
    "user": { "id": "…", "email": "sara@example.com", "fullName": "Sara Ibrahim",
              "phone": "+966500000000", "role": "CUSTOMER", "status": "ACTIVE" },
    "restaurant": null,
    "initialPassword": "k3Rf-9xQa-Lm2P"
  } }
```

`address` has the shape of `POST /api/addresses`. It becomes the customer's
default and is written in the same transaction as the account. A RESTAURANT
account also creates its restaurant, which starts `PENDING_APPROVAL` and is
returned as `{ id, name, status }`. Audited as `USER_CREATED`. Drivers are
created through `POST /api/admin/drivers`, because they also need a vehicle.

**Errors:** 409 `EMAIL_ALREADY_REGISTERED` · 422 `VALIDATION_ERROR`
(`restaurantName` missing for RESTAURANT, `address` on a non-customer).

### `POST /api/admin/orders`

```jsonc
// request — as at checkout, no prices (BR-O5)
{ "customerUserId": "…", "restaurantId": "…", "addressId": "…",
  "items": [ { "foodItemId": "…", "quantity": 2, "notes": "No onions" } ],
  "customerNote": "Ring the bell twice", "discountCode": "SAVE10" }   // discountCode optional
```

`discountCode` is judged by the same rules as a customer's code (BR-DC8); a
refused code is the matching `422 DISCOUNT_CODE_*` and no order or audit row is
written. The `ORDER_PLACED` audit metadata records the code and amount.

`items` holds 1–50 lines, quantity 1–20 each, with no item listed twice. The
response is 201 with the same payload as `GET /api/admin/orders/:id`. The
order is always `CASH_ON_DELIVERY` and the customer's cart is not touched. It
is written by the same function as checkout (`insertOrder`), so totals,
snapshots, the delivery fee and the order number follow BR-O1..O7. The first
`order_status_events` row has `actor_role = ADMIN` and the admin's id. The
`ORDER_PLACED` audit row commits with the order; the `NEW_ORDER` notification
goes out after commit.

**Errors:** 404 (customer missing or not a CUSTOMER; item missing or of another
restaurant; address not the customer's) · 422 `UNPROCESSABLE` (customer not
`ACTIVE`) · 422 `RESTAURANT_UNAVAILABLE` · 422 `ITEM_UNAVAILABLE` · 422
`BELOW_MINIMUM_ORDER` · 422 `VALIDATION_ERROR`.

### `POST /api/admin/discount-codes`

```jsonc
// request
{ "code": "welcome20", "description": "New customers", "type": "PERCENT", "value": 20,
  "maxDiscountAmount": 30, "minSubtotal": 50, "restaurantId": null,
  "startsAt": "2026-11-01T00:00:00Z", "endsAt": "2026-12-01T00:00:00Z",
  "usageLimit": 500, "perCustomerLimit": 1 }
```

```jsonc
// 201 — also the shape of GET /:id, PUT /:id and each row of the list
{ "success": true,
  "data": { "id": "…", "code": "WELCOME20", "description": "New customers",
            "type": "PERCENT", "value": "20.00", "maxDiscountAmount": "30.00",
            "minSubtotal": "50.00", "restaurant": null,
            "startsAt": "…", "endsAt": "…", "usageLimit": 500, "perCustomerLimit": 1,
            "isActive": true, "state": "ACTIVE",
            "stats": { "usageCount": 0, "totalDiscount": "0.00" }, "createdAt": "…" } }
```

`code` is 3–30 letters, digits, `-` or `_`, stored upper-case, and cannot be
changed by `PUT`. `PUT` takes every other field (`type` and `value` required).
`state` is derived from `isActive` and the dates. `stats` counts orders carrying
the code that are not cancelled. Audited as `DISCOUNT_CODE_CREATED`,
`_UPDATED`, `_DEACTIVATED`, `_REACTIVATED` and `_DELETED`, each in the
transaction that makes the change.

**Errors:** 409 `CONFLICT` (name taken, any case) · 404 (unknown or deleted id) ·
422 `VALIDATION_ERROR` (percentage over 100, a cap on a fixed amount, end not
after start, limit under 1, unknown restaurant).

### `GET /api/admin/stats`

```jsonc
{ "success": true,
  "data": {
    "orders": { "today": 142, "byStatus": { "PENDING": 6, "CONFIRMED": 11, "PREPARING": 14,
                "READY_FOR_PICKUP": 4, "OUT_FOR_DELIVERY": 9, "DELIVERED": 92, "CANCELLED": 6 } },
    "gmv": { "today": "18420.50", "last30Days": "512300.75" },
    "accounts": { "customers": 2140, "activeRestaurants": 37, "pendingRestaurants": 4,
                  "activeDrivers": 22, "driversOnDelivery": 9, "pendingDrivers": 1 },
    "today": { "newCustomers": 12, "reviews": 9, "delivered": 92, "cancelled": 6, "inProgress": 44 },
    "averageRating30d": 4.31,
    "topRestaurants": [ { "id": "…", "name": "Olive Grill", "orders": 31, "gmv": "3980.00" } ],
    "topDrivers": [ { "id": "…", "name": "Omar K.", "deliveries": 58, "ratingAverage": "4.80", "ratingCount": 41 } ],
    "topCustomers": [ { "id": "…", "name": "Sara I.", "orders": 9, "spent": "1240.50" } ],
    "topRated": [ { "id": "…", "name": "Olive Grill", "ratingAverage": "4.90", "ratingCount": 120 } ],
    "topItems": [ { "name": "Mixed Grill", "restaurant": "Olive Grill", "quantity": 74 } ],
    "activity": [ { "kind": "ORDER", "at": "2026-09-22T18:04:11.201Z", "refId": "…",
                    "ref": "FF-20260922-4K9P2M", "detail": "CONFIRMED", "subject": "Olive Grill", "rating": null } ],
    "unassignedBacklog": 2,
    "averageDeliveryMinutes": 38
  } }
```

GMV counts `DELIVERED` orders only — counting cancelled orders as revenue would
make the number a lie. The leaderboards `topRestaurants`, `topDrivers`,
`topCustomers` and `topItems` cover `DELIVERED` orders of the last 30 days,
five rows each. `topRated` lists active restaurants with at least three
reviews. `activity` is the 20 most recent order status events, sign-ups and
reviews together (`kind` = `ORDER` \| `SIGNUP` \| `REVIEW`), newest first.
`averageRating30d` is the mean restaurant rating of the last 30 days, `null`
when there are no reviews.

---

## 11. Utility

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/health` | — | `{ status, uptime, database: "up"\|"down", version }`; 503 when the DB check fails |

---

## Architecture Decision Records

### ADR-011: Action endpoints for state transitions

**Context.** Order status changes could be modelled as
`PATCH /api/orders/:id { "status": "CONFIRMED" }`.

**Decision.** Each transition is its own sub-resource action:
`POST /api/restaurant/orders/:id/accept`, `/reject`, `/start-preparing`,
`/ready`, `POST /api/driver/deliveries/:orderId/pick-up`, `/deliver`,
`POST /api/orders/:id/cancel`, `POST /api/admin/orders/:id/force-cancel`.

**Rationale.** A generic status PATCH would need one route to carry ten
different authorization rules, three different actor types and three different
required-field sets — the routing table would say nothing and every rule would
live in a `switch`. Action endpoints put the role guard in the router where it
is auditable, let `reject` require a reason while `accept` requires nothing, and
make the API self-documenting: the set of routes a role can call *is* that
role's permission list.

**Consequences.** More routes, each trivial. The shared transition logic still
lives in one place (`orderStateMachine` + `orders.service.transition`); the
routes differ only in guard and payload. The default-deny router audit test
walks the route table and asserts every action route declares both a role guard
and a validator.

### ADR-014: `PUT` for opening hours, `PATCH` everywhere else

**Decision.** `PUT /api/restaurant/hours` replaces the entire seven-day
schedule; every other update endpoint is a partial `PATCH`.

**Rationale.** Opening hours are a set with a fixed cardinality and internal
consistency (a missing day is meaningfully different from an unchanged day). A
partial update makes "clear Tuesday" and "don't touch Tuesday" indistinguishable
in JSON. Sending all seven rows every time is cheap and unambiguous.

**Consequences.** The hours form always submits the full week. The endpoint
validates that exactly seven distinct `dayOfWeek` values are present and
replaces the rows in one transaction.
