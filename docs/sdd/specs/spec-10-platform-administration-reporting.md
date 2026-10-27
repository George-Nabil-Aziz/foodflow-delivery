# Spec 10 — Platform Administration & Reporting

**Status:** Approved · **Owner:** Platform Ops · **Covers:** FR-9.1 – FR-9.11

## Objective

Give administrators the controls the platform cannot run without: approving the
supply side, provisioning drivers, intervening in stuck orders, moderating
abusive reviews, and seeing what is actually happening — with every action
recorded.

## Scope

**In scope**
- User, restaurant and driver management: list, search, approve, reject, suspend, reactivate, soft delete and restore.
- Driver account creation (the only path — ADR-006).
- Customer, admin and restaurant-owner account creation, a customer optionally with a first delivery address.
- Order oversight, the unassigned backlog, and force-cancel.
- Placing an order on a customer's behalf ("Make an order").
- Review moderation (hide/restore) with aggregate recomputation.
- Platform statistics, today's numbers, 30-day leaderboards and a recent-activity feed.
- `admin_audit_logs` for every mutation.
- The admin dashboard and its screens.

**Out of scope** — the business logic being administered (owned by specs 03,
07, 08, 09; this spec calls their interfaces), financial reporting and payouts
(non-goals), a permission system within the admin role (all admins are equal in
v1, [assumptions.md](../assumptions.md) A-13).

## Actors

**ADMIN** only. The admin is the platform operator, with unrestricted read
access and audited write access.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-9.1 | List, filter and search users, restaurants and drivers |
| FR-9.2 | Approve, reject, suspend and reactivate restaurants and drivers |
| FR-9.3 | Suspension revokes refresh tokens immediately and blocks existing access tokens |
| FR-9.4 | View any order; force-cancel an active one with a mandatory reason |
| FR-9.5 | Platform statistics: orders by status, GMV, account counts, unassigned backlog, average delivery time; today's numbers (orders, new customers, reviews, delivered, cancelled, in progress) and the 30-day average rating; 30-day top restaurants, drivers, customers and items, the top-rated restaurants; and a feed of the latest order events, sign-ups and reviews |
| FR-9.6 | Every admin mutation writes an `admin_audit_logs` row |
| FR-9.7 | Create driver accounts with an initial password the driver is told to change |
| FR-9.8 | Hide and restore reviews, recomputing aggregates |
| FR-9.9 | A dedicated view of stuck orders: unassigned past 15 minutes, `PENDING` past the timeout, `OUT_FOR_DELIVERY` past 90 minutes |
| FR-9.10 | Place an order on an active customer's behalf, from a restaurant and items the admin picks, to one of the customer's saved addresses, paid cash on delivery |
| FR-9.11 | Create customer, admin and restaurant-owner accounts with a one-time initial password; a customer may be given a first delivery address, a restaurant owner gets their restaurant |

## Business Rules

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-AD1 | Every mutation is audited in the same transaction as its effect | `audit.service.js` called inside the transaction; an unaudited change is impossible because the write and the log commit together |
| BR-AD2 | Suspension revokes all refresh tokens for the user | `auth.revokeAllForUser(userId, trx)` |
| BR-AD3 | Suspending a restaurant sets `restaurants.status = SUSPENDED` and does **not** touch the owner's user account or in-flight orders (BR-R9) | Separate concerns; the owner can still log in and see what happened |
| BR-AD4 | Suspending a **driver** who is mid-delivery is refused with `409 DRIVER_HAS_ACTIVE_DELIVERY` | An order in someone's car is not made safer by locking the driver out |
| BR-AD5 | Rejecting a restaurant requires a reason, stored in `rejection_reason` and shown to the owner | Otherwise the owner has no path to fixing it |
| BR-AD6 | Force-cancel requires a reason and obeys the §7.3 table via the normal transition service | Admins get more permitted transitions, not a bypass |
| BR-AD7 | An admin cannot suspend or delete their own account | Service check → `422`; locking the last admin out is unrecoverable |
| BR-AD8 | Admins are never given plaintext access to passwords; a created driver or account gets a generated initial password returned **once** in the creation response | It is shown to the admin to relay, never stored in readable form |
| BR-AD9 | GMV counts `DELIVERED` orders only | Counting cancelled orders as revenue would make the metric a lie |
| BR-AD10 | Approving a restaurant requires it to have at least one available food item | Approving an empty restaurant puts a dead listing in front of customers |
| BR-AD11 | An admin-placed order obeys checkout's rules: the customer is an `ACTIVE` CUSTOMER, the restaurant is orderable, every item is orderable and belongs to that restaurant, the minimum order applies, and the address is the customer's own. It is always `CASH_ON_DELIVERY`, the customer's cart is left untouched, and prices are computed on the server | `orders.adminPlaceOrder` writes through `insertOrder`, the function checkout uses, so BR-O1..O7 hold for both; the first `order_status_events` row has `actor_role = ADMIN` and the admin's id |
| BR-AD12 | An account created by an admin is `ACTIVE`; a restaurant created with it starts `PENDING_APPROVAL`; a customer's address becomes their default (BR-A7) and is written in the same transaction as the account | Going live stays its own audited decision (BR-AD10), as for drivers |

## Data Requirements

`admin_audit_logs` per
[database-design §4](../architecture/database-design.md#admin_audit_logs) —
append-only, with no update or delete path in code.

Columns written by this spec on other modules' tables, always through their
public interfaces: `users.status`, `restaurants.status` /
`approved_at` / `approved_by_user_id` / `rejection_reason`,
`driver_profiles.status`, `reviews.status` / `hidden_by_user_id` /
`moderation_reason`, `orders.status` (via the transition service).

Seed: the initial `ADMIN` user, created by migration from environment variables
so a fresh deployment is administrable without a manual database edit.

Statistics indexes: `idx_orders_restaurant_status`,
`idx_orders_dispatch`, plus `idx_orders_delivered_at (delivered_at) WHERE status
= 'DELIVERED'` added here for the GMV and average-delivery-time queries.

## API Requirements

The full route table is in
[api-design §10](../architecture/api-design.md#10-admin--apiadmin). Grouped:

| Group | Routes |
|-------|--------|
| Statistics | `GET /api/admin/stats` |
| Users | `GET /users`, `POST /users`, `GET /users/:id`, `GET /users/:id/addresses`, `POST /users/:id/suspend`, `POST /users/:id/reactivate`, `DELETE /users/:id`, `POST /users/:id/restore` |
| Drivers | `POST /drivers`, `GET /drivers`, `POST /drivers/:id/approve`, `POST /drivers/:id/suspend`, `DELETE /drivers/:id`, `POST /drivers/:id/restore` |
| Restaurants | `GET /restaurants`, `POST /restaurants/:id/approve`, `/reject`, `/suspend`, `/reactivate`, `DELETE /restaurants/:id`, `POST /restaurants/:id/restore` |
| Orders | `POST /orders`, `GET /orders`, `GET /orders/:id`, `GET /orders/unassigned`, `GET /orders/stuck`, `POST /orders/:id/force-cancel` |
| Reviews | `GET /reviews`, `POST /reviews/:id/hide`, `POST /reviews/:id/restore` |
| Audit | `GET /audit-logs` |

```jsonc
// POST /api/admin/drivers
{ "email": "driver@example.com", "fullName": "Omar Nasser", "phone": "+966501110000",
  "vehicleType": "MOTORCYCLE", "vehiclePlate": "ABC 1234" }

// 201 — initialPassword appears exactly once, here
{ "success": true,
  "data": { "user": { "id": "…", "email": "driver@example.com", "role": "DRIVER", "status": "ACTIVE" },
            "driverProfile": { "status": "PENDING_APPROVAL", "availability": "OFFLINE" },
            "initialPassword": "Xk4p-9Qm2-Tz7" } }
```

The driver profile starts `PENDING_APPROVAL` even though an admin created it, so
approval stays an explicit, audited second step rather than a side effect of
typing a name.

```jsonc
// POST /api/admin/users — role CUSTOMER | ADMIN | RESTAURANT
{ "role": "CUSTOMER", "email": "sara@example.com", "fullName": "Sara Ibrahim", "phone": "+966500000000",
  "address": { "label": "Home", "line1": "King Fahd Rd 12", "city": "Riyadh" } }

// 201 — restaurant is { id, name, status: "PENDING_APPROVAL" } for a RESTAURANT account
{ "success": true,
  "data": { "user": { "id": "…", "email": "sara@example.com", "role": "CUSTOMER", "status": "ACTIVE" },
            "restaurant": null,
            "initialPassword": "k3Rf-9xQa-Lm2P" } }
```

`restaurantName` is required for RESTAURANT; `address` (the shape of
`POST /api/addresses`) is accepted for CUSTOMER only. Audited as `USER_CREATED`.

```jsonc
// POST /api/admin/orders — no prices, as at checkout (BR-O5)
{ "customerUserId": "…", "restaurantId": "…", "addressId": "…",
  "items": [ { "foodItemId": "…", "quantity": 2, "notes": "No onions" } ],
  "customerNote": "Ring the bell twice" }
```

Returns 201 with the admin order detail (`GET /orders/:id`). The order and its
`ORDER_PLACED` audit row commit in one transaction; the `NEW_ORDER`
notification is sent after commit, as at checkout. `GET /users/:id/addresses`
lists the customer's saved addresses for the page to choose from.

## Frontend Requirements

- `admin/DashboardView` — refreshed every 30 seconds while open. A "Needs attention" button with the count of pending restaurants, pending drivers, the unassigned backlog and stuck orders, opening `admin/AttentionView`, where each item links to where it is handled. Then a row of today's tiles (orders, GMV, in progress now, drivers on delivery of active drivers, delivered, cancelled, new customers, reviews); a live activity feed of order events, sign-ups and reviews, where an order number opens `OrderDetailsDialog`; orders by status and a platform card (customers, active restaurants and drivers, 30-day GMV, 30-day average rating, average delivery time); and last the 30-day leaderboards: top restaurants, drivers, customers and items, and the top-rated restaurants.
- `admin/UserListView` (the Customers and Admins pages, one per role) — `PageTitle` with the total, a `FilterSelect` status filter (All, Active, Suspended, Deleted, each with its count in brackets) and search; the name opens `DetailsDialog`, a popup with everything about the account. Suspend, reactivate, delete and restore, the destructive ones with a mandatory reason dialog. "Add a customer" / "Add an admin" opens `AccountCreateView`.
- `admin/AccountCreateView` — "Add a customer / an admin / a restaurant" on a page of its own (`/admin/customers/new`, `/admin/admins/new`, `/admin/restaurants/new`): name, email and phone, the restaurant name for a restaurant, and for a customer an optional delivery address (street and city at least) that becomes their default. The initial password is shown once, with the email, after creation.
- `admin/RestaurantsView` — the restaurants list with a counted status filter, approve/reject/suspend/reactivate, delete and restore, and "Add a restaurant"; the name opens `DetailsDialog`.
- `admin/DriversView` — the drivers list with counted status filters, approve/suspend, delete and restore; "Add a driver" opens `admin/DriverCreateView`, the create-driver form on its own page.
- `admin/OrdersView` — `PageTitle` with the total; one `FilterSelect` holding every status and the two dispatch queues (waiting for a driver, stuck), each with its count; search. The order number opens `OrderDetailsDialog`. The row action reads "Cancel"; it calls force-cancel behind a reason dialog. "Make an order" opens `OrderCreateView`.
- `admin/OrderCreateView` — "Make an order" (`/admin/orders/new`): search and choose an active customer, pick one of their saved addresses (the default preselected; a customer with none cannot be ordered for), search and choose an orderable restaurant, set quantities on its menu (up to 20 each), add a note, and place the order. It is cash on delivery and the totals come from the server; the order number and total are confirmed on the page.
- `admin/ReviewsView` — the moderation list as a table: rating as `RatingStars`, the comment, the restaurant, hide/restore; a counted status filter and search. A row opens `DetailsDialog`, and the order number opens `OrderDetailsDialog`.

On every admin list, `AccountStatusBadge` colours a restaurant's or driver's
status the same way: active green, pending amber, suspended red, rejected grey;
`RatingStars` shows a rating as lit stars rather than "n/5".

Destructive actions (suspend, reject, force-cancel) always use `ConfirmDialog`
with a required reason and a named consequence — "This will cancel order
FF-20260922-4K9P2M and release the driver" — because an admin acting on the
wrong row is the realistic failure mode, not an admin acting maliciously.

## Backend Requirements

Module `modules/admin/` with `admin.service.js`, `stats.service.js`,
`audit.service.js`, `admin.repository.js`.

The admin module **owns only `admin_audit_logs`**. Every other change goes
through the owning module's public interface — `restaurants.setStatus(...)`,
`users.setUserStatus(...)`, `orders.transition(...)`,
`reviews.setStatus(...)` plus `reviews.recomputeAggregates(...)`. This is the
boundary rule (NFR-1) at its most load-bearing: an admin module that wrote
directly to `orders` would be a second code path for status changes, and G3
would stop being true.

Every mutation follows one shape:

```js
return withTransaction(async (trx) => {
  const result = await owningModule.doTheThing(id, args, { trx });
  await audit(adminId, 'RESTAURANT_SUSPENDED', 'restaurant', id, { reason }, trx);
  return result;
});
```

`stats.service.js` runs a small set of grouped aggregate queries, not one query
per tile. Statistics are read-only, computed on request, and uncached — at this
scale, correctness beats a cache, and a wrong number on an operations dashboard
is worse than a slow one.

## Validation

| Field | Rule |
|-------|------|
| `reason` (suspend, reject, hide, force-cancel) | Required, 5–300 chars |
| Driver creation | Email (unique), `fullName` 2–100, phone, `vehicleType` enum, `vehiclePlate` 2–20 |
| Account creation | `role` ∈ {CUSTOMER, ADMIN, RESTAURANT}; email (unique), `fullName` 2–100, phone; `restaurantName` 2–100, required for RESTAURANT; `address` as `POST /api/addresses`, CUSTOMER only |
| Placing an order | `customerUserId`, `restaurantId`, `addressId` UUIDs; `items` 1–50, each `foodItemId` UUID, `quantity` 1–20, `notes` ≤200, no item twice; `customerNote` ≤500 |
| List filters | `role`, `status`, `availability` from enums; `q` 1–60 on every list; `from`/`to` ISO dates with `from ≤ to` |
| Pagination | `page` ≥1, `limit` 1–100 |
| `:id` | UUID |

## Authorization

`authorize('ADMIN')` on every route. No ownership predicate — unrestricted read
is the point of the role — but:
- every mutation is audited (BR-AD1);
- self-suspension is blocked (BR-AD7);
- admins cannot read or recover passwords (BR-AD8);
- `GET /api/admin/audit-logs` makes admin activity reviewable by other admins, which is the only meaningful check on the role in a single-tier model.

## Error Handling

| Condition | Response |
|-----------|----------|
| Approving a restaurant with no available items | `422` naming BR-AD10 |
| Suspending a driver mid-delivery | `409 DRIVER_HAS_ACTIVE_DELIVERY` with the order number |
| Suspending oneself | `422` |
| Force-cancelling a `DELIVERED` or already-`CANCELLED` order | `409 INVALID_ORDER_TRANSITION` — terminal states are terminal, even for admins |
| Missing reason | `422` |
| Duplicate driver or account email | `409 EMAIL_ALREADY_REGISTERED` |
| Approving an already-`ACTIVE` restaurant | `409` with the current status |
| Placing an order for a user who is missing or not a CUSTOMER | `404` |
| Placing an order for a customer who is not `ACTIVE` | `422 UNPROCESSABLE` |
| Placing an order with an item of another restaurant, or another customer's address | `404` |
| Placing an order at a restaurant that cannot take one, or with an unavailable item | `422 RESTAURANT_UNAVAILABLE` / `422 ITEM_UNAVAILABLE` |
| Placing an order below the restaurant's minimum | `422 BELOW_MINIMUM_ORDER` |

## Testing Requirements

Unit — statistics arithmetic against a fixed fixture (GMV excludes cancelled
orders, average delivery time uses `delivered_at − picked_up_at`); the audit
payload builder; the self-suspension guard.

Integration — the `admin.integration` suite. Required:
- Approve a restaurant → it becomes visible in spec-05's listing in the same test.
- Approve a restaurant with no items → 422 (BR-AD10).
- Reject with a reason → the owner's `GET /api/restaurant/profile` shows `REJECTED` and the reason.
- Suspend a restaurant → it disappears from listings, its in-flight order still completes (BR-R9/BR-AD3), and its owner can still log in.
- **Suspend a user → their existing access token is rejected on the very next request** (FR-9.3) and their refresh token is revoked.
- Suspend a driver mid-delivery → 409.
- Create a driver → the account exists as `PENDING_APPROVAL`, the returned initial password works for login, and it is not recoverable from any later response.
- Force-cancel an active order → the order is `CANCELLED` with `cancelled_by = ADMIN`, an event row is written, the driver is released, and the assignment is cancelled.
- Hide a review → it leaves the public list and the aggregate drops; restore reverses both (BR-V7).
- Place an order for a customer (`adminPlaceOrder.test.js`) → priced on the server, first event attributed to the admin (`actor_role = ADMIN`), one `ORDER_PLACED` audit row; the customer's cart is untouched; an item of another restaurant, an unavailable item and a short order are refused; another customer's address and a suspended customer are refused; non-admins get 403.
- **Every mutating admin endpoint writes exactly one audit row** — a table-driven test over the route list, so a new admin endpoint without auditing fails.
- Non-admin roles get 403 on every `/api/admin/*` route.

Frontend — the dashboard surfaces pending approvals and stuck orders; destructive
dialogs require a reason before enabling the confirm button; the approval queue
updates after an action without a full reload; an axe pass on the dashboard and
the tables.

## Deletion and restore

Soft delete (`deleted_at`) and restore for customers, admins, drivers and
restaurants, per BR-A6. Full detail, including the UI, is in the
[admin restructure design](../../superpowers/specs/2026-10-20-admin-restructure-design.md)
(§5 Delete, §5a Restore); this section summarises it.

**Endpoints.** `DELETE /api/admin/users/:id` (CUSTOMER or ADMIN only),
`DELETE /api/admin/drivers/:id` (sets the profile OFFLINE) and
`DELETE /api/admin/restaurants/:id` (deletes the restaurant and its owner's
user). Each needs a `{ reason }` of 5–300 characters and writes one audit row in
the same transaction. Nothing is removed from the database; a deleted account
cannot sign in and its sessions are revoked. Orders, reviews and audit rows
survive on their name snapshots. Suspend is unchanged.

**Rules.**

| Case | Response | `details[0].issue` |
|------|----------|--------------------|
| Deleting yourself | 422 `UNPROCESSABLE` | You cannot delete your own account. |
| Customer with an unfinished order | 409 `HAS_ACTIVE_ORDERS` | This customer has an order in progress. Wait for it to finish, or force-cancel it first. |
| Restaurant with an unfinished order | 409 `HAS_ACTIVE_ORDERS` | This restaurant has orders in progress. Wait for them to finish, or force-cancel them first. |
| Driver holding an ACCEPTED assignment | 409 `DRIVER_HAS_ACTIVE_DELIVERY` | This driver has an active delivery. |
| Already deleted | 409 `CONFLICT` | This record is already deleted. |
| RESTAURANT or DRIVER account sent to `DELETE /users/:id` | 422 `UNPROCESSABLE` | Delete this account from the Restaurants or Drivers page. |

"Unfinished" means PENDING, CONFIRMED, PREPARING, READY_FOR_PICKUP or
OUT_FOR_DELIVERY. `HAS_ACTIVE_ORDERS` is the only new error code.

**The `deleted` list filter.** `GET /api/admin/users`, `/drivers` and
`/restaurants` no longer hide deleted rows; each row gains `deletedAt`. The
`deleted` parameter is `include` (default, every row) or `only` (deleted rows
only). A status filter returns rows that are not deleted. Discovery, dispatch,
sign-in and dashboard counts still exclude deleted rows.

**Restore.** `POST /api/admin/users/:id/restore`, `/drivers/:id/restore` and
`/restaurants/:id/restore` clear `deleted_at` and return the record exactly as it
was: suspend and approval status are untouched (a suspended restaurant comes back
suspended), a restaurant restore also restores its owner, and a restored driver
stays OFFLINE. A record that is not deleted gets 409 `CONFLICT` ("This record is
not deleted."); a RESTAURANT or DRIVER account sent to `/users/:id/restore` gets
422 `UNPROCESSABLE`. Email and slug stay reserved while a record is deleted.

## Edge Cases

| Case | Expected |
|------|----------|
| Last admin tries to suspend themselves | Blocked (BR-AD7) |
| Restaurant suspended with orders in every state | All in-flight orders complete normally; only new orders are prevented |
| Driver suspended while holding an offer | Allowed — the offer expires and is re-dispatched. Only an **accepted** delivery blocks suspension |
| Force-cancel races the driver marking delivered | The row lock decides; if delivery commits first the force-cancel gets 409 |
| Statistics during a database slow period | The endpoint is read-only and paginated where it can be; a slow response is acceptable, a cached wrong one is not |
| Audit log grows large | Indexed by entity and date; archival is a future concern, and the table is append-only so it is safe to partition later |
| Admin reactivates a rejected restaurant | Allowed: `REJECTED → ACTIVE` via approve, audited, with the rejection reason retained for history |
| Two admins act on the same restaurant simultaneously | Row lock serializes; the second sees the new status and gets 409 if their action no longer applies |

## Related Stories

- [story-10 — Platform Administration & Reporting](../stories/story-10-platform-administration-reporting.md) (primary)
- [story-03 — Restaurant Onboarding](../stories/story-03-restaurant-onboarding-menu-management.md) (approval unblocks it)
- [story-08 — Driver Onboarding & Delivery](../stories/story-08-driver-onboarding-delivery-execution.md) (driver creation and approval)
- [story-09 — Reviews & Ratings](../stories/story-09-reviews-ratings.md) (moderation)

## Dependencies

**Depends on:** [spec-01](spec-01-platform-foundation-api-contract.md), [spec-02](spec-02-identity-authentication-authorization.md), [spec-03](spec-03-restaurant-profile-operations.md), [spec-07](spec-07-order-placement-lifecycle.md), [spec-08](spec-08-delivery-assignment-driver-operations.md), [spec-09](spec-09-reviews-ratings.md).
**Depended on by:** [spec-03](spec-03-restaurant-profile-operations.md) (restaurants need approval to trade) and [spec-08](spec-08-delivery-assignment-driver-operations.md) (drivers need creating and approving). This mutual dependency is resolved in the implementation plan by shipping the admin **approval** endpoints early, in story-03, and the rest of the admin surface in story-10.
