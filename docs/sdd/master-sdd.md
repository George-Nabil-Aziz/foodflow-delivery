# FoodFlow — Master Software Design Document

**Version:** 1.0
**Status:** Approved for implementation
**Last updated:** 2026-09-22

> This is the entry point for the FoodFlow SDD. It defines the domain, the
> architecture and the cross-cutting rules. Detail lives in
> [`architecture/`](architecture/), [`specs/`](specs/) and [`stories/`](stories/).
> Where this document and a spec disagree, **this document wins** and the spec
> must be corrected.

---

## 1. Project Overview

FoodFlow is a full-stack food delivery management platform that connects
customers, restaurants, delivery drivers, and administrators through a
centralized ordering and delivery workflow.

A customer browses active restaurants, builds a cart from one restaurant's
menu, and places an order. The restaurant accepts and prepares it. A driver is
dispatched, collects the order, and delivers it. The customer can then review
the restaurant and the driver. Administrators approve restaurants and drivers,
suspend bad actors, moderate reviews, and monitor platform health.

**Stack:** Vue 3 (frontend) · Node.js + Express 4 (backend) · PostgreSQL 16
(database) · JWT (authentication) · REST (API) · Vitest + Supertest + Playwright
(testing).

**Shape:** a single deployable **modular monolith** with enforced domain
boundaries — not microservices. See [ADR-001](architecture/system-architecture.md#adr-001-modular-monolith-over-microservices).

---

## 2. Goals

| # | Goal | How it is measured |
|---|------|--------------------|
| G1 | A customer can complete the full journey — register → browse → cart → order → track → review — without leaving the app | E2E scenario `customer-happy-path` passes |
| G2 | An order's financial and item data is immutable once placed | Changing a menu price/name never alters a historical order (integration test) |
| G3 | Every order status change is legal, attributed, and auditable | State machine rejects illegal transitions; `order_status_events` records the actor for every change |
| G4 | Every protected endpoint enforces both role **and** ownership | Authorization test matrix covers all protected routes |
| G5 | The whole system runs locally with `docker compose up` + `npm run dev` | Fresh-clone setup reproducible in under 10 minutes |
| G6 | Domain modules stay decoupled enough that any one could be extracted later | No cross-module imports except through a module's public `index.js` |

---

## 3. Non-Goals

Explicitly **out of scope for v1**. Each is listed with the reason and the
fallback actually implemented.

| Non-goal | Why excluded | v1 fallback |
|----------|-------------|-------------|
| Real-time GPS driver tracking | Needs a streaming transport, map tiles and a mobile client | Status-based tracking: the customer sees the order status timeline, not a moving pin. `driver_profiles` still stores a last-known coordinate for dispatch distance sorting |
| Mobile push notifications | Needs native apps and a push service | Email and SMS ([spec-13](specs/spec-13-notifications.md)) and live in-page updates ([spec-14](specs/spec-14-live-updates.md)) |
| Recommendation engine | Needs traffic and an ML pipeline that does not exist yet | Restaurants are sorted by rating, delivery fee, or name — explicit, deterministic sorts |
| Complex logistics / route optimization | Multi-order batching and routing is a research problem | Nearest-available-driver dispatch, one active delivery per driver |
| Microservices | Premature for a single team and one deployable | Modular monolith with enforced boundaries ([ADR-001](architecture/system-architecture.md#adr-001-modular-monolith-over-microservices)) |
| Multi-tenancy / franchise hierarchies | No requirement for restaurant groups | One restaurant ↔ one owner user |
| Internationalization | Single-locale product for v1 | English (LTR) only; all user-facing copy centralized in `src/i18n/en.js` so a second locale is additive |

Everything above is tracked in [§24 Future Enhancements](#24-future-enhancements).

**Delivered after v1** (each was a non-goal here before): card payments with
automatic refunds behind a provider interface ([spec-11](specs/spec-11-card-payments.md)),
discount codes ([spec-12](specs/spec-12-discount-codes.md)), real email and SMS
delivery ([spec-13](specs/spec-13-notifications.md)), and live updates over
Server-Sent Events with polling as the fallback ([spec-14](specs/spec-14-live-updates.md)).

**One deliberate inclusion beyond the suggested minimum:** a `refresh_tokens`
table and a refresh/logout flow. Rationale: a JWT-only design forces a choice
between long-lived, un-revocable access tokens (a genuine security hole, since
an admin suspension could not take effect) and constant re-login. A short access
token plus a revocable refresh token is the smallest design that makes
"suspend this user" actually mean something. See [ADR-004](architecture/security.md#adr-004-short-access-token-plus-revocable-refresh-token).

---

## 4. Actors

FoodFlow has exactly four roles. Role is stored on `users.role` and is **fixed
at account creation** — there is no role switching ([ADR-005](architecture/security.md#adr-005-single-fixed-role-per-user)).

### 4.1 CUSTOMER
Self-registers. Browses and searches restaurants, views menus, manages one
active cart, places orders, tracks and cancels eligible orders, reviews
completed orders, manages profile and delivery addresses.

### 4.2 RESTAURANT
A restaurant **owner user**. Created by self-registration but the restaurant
lands in `PENDING_APPROVAL` and cannot trade until an admin approves it. Manages
the restaurant profile, opening hours, the accepting-orders toggle, menu
categories and food items, and processes incoming orders (accept, reject,
prepare, ready).

### 4.3 DRIVER
Created **by an admin only** — drivers are vetted, not self-served
([ADR-006](architecture/security.md#adr-006-drivers-are-admin-provisioned)).
Sets availability, receives delivery offers, accepts or declines them, marks
pickup and delivery, views delivery history and profile.

### 4.4 ADMIN
Seeded by migration; additional admins are created by an existing admin.
Approves and suspends restaurants and drivers, manages user accounts, views all
orders, force-cancels stuck orders, moderates reviews, and views platform
statistics.

### 4.5 Actor → capability matrix

| Capability | CUSTOMER | RESTAURANT | DRIVER | ADMIN |
|---|:--:|:--:|:--:|:--:|
| Self-register | ✅ | ✅ (restaurant → `PENDING_APPROVAL`) | ❌ | ❌ |
| Browse/search restaurants | ✅ | ✅ | ✅ | ✅ |
| Manage cart | ✅ | ❌ | ❌ | ❌ |
| Place order | ✅ | ❌ | ❌ | ❌ |
| Cancel own order | ✅ (PENDING, CONFIRMED) | ❌ | ❌ | ✅ (any active) |
| Manage own menu | ❌ | ✅ | ❌ | ❌ |
| Accept / reject order | ❌ | ✅ (own restaurant) | ❌ | ❌ |
| Advance prep status | ❌ | ✅ (own restaurant) | ❌ | ❌ |
| Accept delivery offer | ❌ | ❌ | ✅ | ❌ |
| Mark picked up / delivered | ❌ | ❌ | ✅ (assigned order) | ❌ |
| Write review | ✅ (own delivered order) | ❌ | ❌ | ❌ |
| Hide / restore review | ❌ | ❌ | ❌ | ✅ |
| Approve / suspend accounts | ❌ | ❌ | ❌ | ✅ |
| View platform statistics | ❌ | ❌ | ❌ | ✅ |

---

## 5. Functional Requirements

Requirement IDs (`FR-x.y`) are referenced by specs, stories and test names.

### FR-1 Identity & Access — [spec-02](specs/spec-02-identity-authentication-authorization.md)
- **FR-1.1** Customers and restaurant owners self-register with email, password, full name, phone.
- **FR-1.2** Passwords are hashed with bcrypt (cost 12). Plaintext is never stored, logged or returned.
- **FR-1.3** Login returns a 15-minute access JWT and a 30-day rotating refresh token.
- **FR-1.4** Every non-public request is authenticated by access-token middleware.
- **FR-1.5** Authorization is enforced by a role guard **and** a resource-ownership check.
- **FR-1.6** Users can change their password; doing so revokes all their refresh tokens.
- **FR-1.7** Suspended or deleted users are rejected at authentication time, not merely at login.
- **FR-1.8** Users can view and update their own profile; customers manage multiple delivery addresses with exactly one default.

### FR-2 Restaurant Management — [spec-03](specs/spec-03-restaurant-profile-operations.md)
- **FR-2.1** A restaurant owner manages exactly one restaurant profile.
- **FR-2.2** A new restaurant is `PENDING_APPROVAL` and is invisible to customers until approved.
- **FR-2.3** Restaurants configure name, description, cuisine, contact, images, address, delivery fee, minimum order, and average preparation time.
- **FR-2.4** Restaurants define weekly opening hours per day of week.
- **FR-2.5** Restaurants can toggle `is_accepting_orders` to pause intake without going offline permanently.
- **FR-2.6** A restaurant is *orderable* only when `status = ACTIVE` **and** `is_accepting_orders = true` **and** the current time falls inside that day's opening hours.

### FR-3 Menu Management — [spec-04](specs/spec-04-menu-management.md)
- **FR-3.1** A restaurant manages menu categories with a display order.
- **FR-3.2** A restaurant manages food items with name, description, price, image URL, availability and category.
- **FR-3.3** Category names are unique per restaurant; item names are unique per category.
- **FR-3.4** Items can be toggled available/unavailable without deletion.
- **FR-3.5** Deleting a category is blocked while it holds non-deleted items.
- **FR-3.6** Food items and categories are soft-deleted so historical orders keep a referential trail.

### FR-4 Discovery — [spec-05](specs/spec-05-restaurant-discovery-search.md)
- **FR-4.1** Customers list approved restaurants with pagination.
- **FR-4.2** Customers filter by cuisine, open-now, and minimum rating; and sort by rating, delivery fee or name.
- **FR-4.3** Customers search restaurants and food items by partial name (trigram, case-insensitive).
- **FR-4.4** Customers view a restaurant detail page with its categories and items.
- **FR-4.5** Unavailable items are shown but visually and programmatically marked non-orderable.

### FR-5 Cart — [spec-06](specs/spec-06-cart-management.md)
- **FR-5.1** A customer has at most one `ACTIVE` cart, enforced by a partial unique index.
- **FR-5.2** A cart is bound to exactly one restaurant.
- **FR-5.3** Adding an item from a different restaurant fails with `CART_RESTAURANT_MISMATCH` — never a silent mix, never a silent wipe.
- **FR-5.4** An explicit replace operation clears the cart and rebinds it to the new restaurant.
- **FR-5.5** Quantity per line is an integer 1–20.
- **FR-5.6** Unavailable items, items of unapproved/closed restaurants, and soft-deleted items cannot be added.
- **FR-5.7** The cart is re-validated server-side on every read and at checkout; stale lines are reported, never silently priced.

### FR-6 Orders — [spec-07](specs/spec-07-order-placement-lifecycle.md)
- **FR-6.1** Checkout converts the active cart into an immutable order **snapshot**.
- **FR-6.2** Order totals are computed server-side; client-supplied prices are ignored.
- **FR-6.3** Orders follow the state machine in [§7.3](#73-order-state-machine).
- **FR-6.4** Every transition is validated, attributed to an actor, and appended to `order_status_events`.
- **FR-6.5** Customers view order history and detail; restaurants view their incoming and past orders; drivers view assigned and past deliveries.
- **FR-6.6** Customers cancel only from `PENDING` or `CONFIRMED`.
- **FR-6.7** An order is **completed** when it reaches `DELIVERED`; it is **closed** when `DELIVERED` or `CANCELLED`.

### FR-7 Delivery — [spec-08](specs/spec-08-delivery-assignment-driver-operations.md)
- **FR-7.1** Dispatch begins when an order reaches `CONFIRMED`.
- **FR-7.2** An offer goes to the nearest `AVAILABLE` driver and expires after 90 seconds.
- **FR-7.3** A driver has at most one accepted, undelivered assignment.
- **FR-7.4** If no driver accepts, the order stays in its current state, is flagged `dispatch_state = UNASSIGNED`, and is escalated to admins after 15 minutes. **An order is never auto-cancelled for lack of a driver.**
- **FR-7.5** Only the accepted driver may move `READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED`.
- **FR-7.6** Delivering an order sets the driver back to `AVAILABLE`.

### FR-8 Reviews — [spec-09](specs/spec-09-reviews-ratings.md)
- **FR-8.1** Exactly one review per delivered order, by that order's customer.
- **FR-8.2** Restaurant rating (1–5) is mandatory; driver rating is optional and only offered when a driver delivered the order.
- **FR-8.3** Ratings are aggregated onto `restaurants` and `driver_profiles` inside the same transaction as the review write.
- **FR-8.4** A review is editable by its author for 24 hours, then frozen.
- **FR-8.5** Admins can hide a review; hidden reviews are excluded from public lists and from aggregates.

### FR-9 Administration — [spec-10](specs/spec-10-platform-administration-reporting.md)
- **FR-9.1** Admins list, filter and search users, restaurants and drivers.
- **FR-9.2** Admins approve, reject, suspend and reactivate restaurants and drivers.
- **FR-9.3** Suspending an account immediately revokes its refresh tokens and blocks its access tokens.
- **FR-9.4** Admins view any order and force-cancel a stuck active order with a mandatory reason.
- **FR-9.5** Admins see platform statistics: order counts by status, GMV, active restaurants/drivers, unassigned-order backlog, average delivery time; today's numbers and the 30-day average rating; 30-day top restaurants, drivers, customers and items, the top-rated restaurants; and a recent-activity feed.
- **FR-9.6** Every admin mutation is written to `admin_audit_logs`.
- **FR-9.10** Admins place an order on an active customer's behalf, to one of the customer's saved addresses, paid cash on delivery, under the same rules as checkout.
- **FR-9.11** Admins create customer, admin and restaurant-owner accounts with a one-time initial password; a customer may start with a default delivery address.

FR-9.7 – FR-9.9 (driver creation, review moderation, stuck orders) are detailed in spec-10.

### FR-10 Platform Foundation — [spec-01](specs/spec-01-platform-foundation-api-contract.md)
- **FR-10.1** All API responses use one envelope ([§14](#14-error-handling)).
- **FR-10.2** All request input is validated by schema before reaching a service.
- **FR-10.3** All errors funnel through one error handler; no stack traces leave the process in production.
- **FR-10.4** Configuration comes from validated environment variables; the process refuses to boot on invalid config.
- **FR-10.5** Every request carries a correlation ID, echoed in the `X-Request-Id` response header and in every log line.

### FR-11 Card Payments — [spec-11](specs/spec-11-card-payments.md)
- Customers pay by card at checkout through a payment provider; the amount is the server-computed total and the payment is verified with the provider before the order is shown to the restaurant.
- A paid card order that is cancelled, by any path, is refunded automatically after commit; a failed refund is visible to admins, who can retry it (audited).
- An unpaid card order is cancelled by `SYSTEM` after `PAYMENT_TIMEOUT_MINUTES`. Admin-placed orders stay cash on delivery.

### FR-12 Discount Codes — [spec-12](specs/spec-12-discount-codes.md)
- Admins create, edit, deactivate and delete percentage or fixed codes, with optional caps, minimum subtotal, restaurant scope, validity window and usage limits (audited).
- Customers apply a code to their cart; checkout re-validates it in the same transaction, and the usage limits hold under concurrency.

### FR-13 Notifications — [spec-13](specs/spec-13-notifications.md)
- Notifications are delivered by email (SMTP) and SMS (Twilio) after commit, never blocking the operation; failures are retried with backoff and capped per recipient. With no provider configured they are logged only.

### FR-14 Live Updates — [spec-14](specs/spec-14-live-updates.md)
- Customers, restaurant owners and drivers receive order and offer events over Server-Sent Events, scoped to what each may see; clients refetch through the normal endpoints and fall back to polling when the stream is unavailable.

### FR-15 Item Options — [spec-15](specs/spec-15-item-options.md)
- Restaurants attach option groups (sizes, extras) with priced options to an item; customers choose them, with a line note, when adding to the cart. The server prices each line from live data and snapshots the choices on the order.

### FR-16 Favourites — [spec-16](specs/spec-16-favourites.md)
- Customers favourite restaurants and food items, see them on a Favourites page, and see filled hearts in discovery. Entries that stop being orderable stay listed as unavailable.

### FR-17 Restaurant Analytics — [spec-17](specs/spec-17-restaurant-analytics.md)
- Restaurant owners see their own delivered orders, revenue, average order value, cancellation rate, top items, busiest hours and average preparation time over 7, 30 or 90 days.

### FR-18 Delivery Zones — [spec-18](specs/spec-18-delivery-zones.md)
- Each restaurant delivers within a radius of its location. Discovery tells a signed-in customer whether a restaurant delivers to their address, and checkout and admin placement refuse an address outside the zone.

---

## 6. Non-Functional Requirements

Scoped to a portfolio-grade, intermediate-to-advanced application — realistic,
verifiable, and not enterprise cosplay.

| ID | Category | Requirement | Verification |
|----|----------|-------------|--------------|
| NFR-1 | Maintainability | Domain modules communicate only through public module interfaces; no cross-module table access | ESLint `no-restricted-imports` rule + review |
| NFR-2 | Maintainability | No file over ~300 lines; controllers contain no business logic | Lint rule + review |
| NFR-3 | Scalability | The backend is stateless; sessions live in the DB, so the API can run as N replicas behind a load balancer | Design review; no in-process caches holding user state |
| NFR-4 | Scalability | All list endpoints are paginated with a hard `limit` cap of 100 | API integration test asserts the cap |
| NFR-5 | Performance | p95 server time < 300 ms for read endpoints on a 10k-order seed dataset | `npm run bench` against the seeded DB |
| NFR-6 | Performance | No N+1 queries on list endpoints; item collections are fetched in one query per collection | Query-count assertion in integration tests |
| NFR-7 | Reliability | Checkout, status transitions and review submission run in a single DB transaction and are atomic | Integration test with a forced mid-transaction failure |
| NFR-8 | Reliability | Order state transitions are concurrency-safe under simultaneous actor requests | Concurrency test: two parallel accepts → one 200, one 409 |
| NFR-9 | Security | See [§16](#16-security) and [security.md](architecture/security.md) | Authorization test matrix, dependency audit |
| NFR-10 | Testability | ≥80% line coverage backend, ≥70% frontend; 100% of order-state-machine transitions covered | `npm run test:coverage` gate in CI |
| NFR-11 | Code quality | ESLint + Prettier pass with zero warnings; CI blocks on failure | CI pipeline |
| NFR-12 | API consistency | Every response conforms to the envelope; every error carries a documented `code` | Contract test iterating the error-code registry |
| NFR-13 | Responsive UI | All screens usable from 360 px to 1920 px; no horizontal scroll | Playwright viewport tests at 360/768/1440 |
| NFR-14 | Accessibility | Keyboard-navigable flows, labelled form controls, visible focus, ≥4.5:1 text contrast, live-region status announcements | `@axe-core/playwright` on key screens, zero serious/critical violations |
| NFR-15 | Observability | Structured JSON logs with correlation ID; `/health` reports DB connectivity | Manual verification + health-check test |

---

## 7. Business Rules

Canonical rules. Each has an ID referenced by specs, stories and test names.

### 7.1 Account rules

| ID | Rule |
|----|------|
| BR-A1 | Email is unique across all users, case-insensitively (`CITEXT`). |
| BR-A2 | Password: 8–72 characters, at least one letter and one digit. The 72-byte ceiling is bcrypt's, and is enforced explicitly rather than silently truncated. |
| BR-A3 | Self-registration may only create `CUSTOMER` or `RESTAURANT`. A `role` of `DRIVER` or `ADMIN` in a registration payload is rejected with 403, never silently downgraded. |
| BR-A4 | `CUSTOMER` accounts are `ACTIVE` on creation. `RESTAURANT` accounts are `ACTIVE` but their restaurant is `PENDING_APPROVAL`. `DRIVER` accounts are created by an admin as `ACTIVE` with a `PENDING_APPROVAL` driver profile. |
| BR-A5 | A `SUSPENDED` user can neither log in nor use an existing access token. |
| BR-A6 | Users are soft-deleted (`deleted_at`); their historical orders and reviews survive with the display-name snapshot taken at order time. |
| BR-A7 | A customer has 0..N addresses and at most one `is_default = true`. Setting a new default clears the previous one in the same transaction. |
| BR-A8 | An address referenced by an active order cannot be hard-deleted; it is soft-deleted, and the order keeps its own JSONB snapshot regardless. |

### 7.2 Restaurant & menu rules

| ID | Rule |
|----|------|
| BR-R1 | One owner user ↔ one restaurant (unique `owner_user_id`). |
| BR-R2 | A restaurant is visible to customers only when `status = ACTIVE`. |
| BR-R3 | A restaurant is **orderable** only when `status = ACTIVE` **and** `is_accepting_orders = true` **and** now ∈ today's opening hours — **opening inclusive, closing exclusive**, so a restaurant closing at 14:00 is closed at 14:00 (finding D-05). Orderability is computed server-side; the client never decides. |
| BR-R4 | `delivery_fee ≥ 0`, `minimum_order_amount ≥ 0`, both with 2 decimal places. |
| BR-R5 | Food item `price > 0`, maximum 9999.99, 2 decimals. |
| BR-R6 | A food item belongs to exactly one category, and that category must belong to the same restaurant. Cross-restaurant category assignment is a 422. |
| BR-R7 | Marking a category inactive hides it and all of its items from customer-facing responses but does not change item availability flags. |
| BR-R8 | Deleting a category with non-deleted items returns 409 `CATEGORY_NOT_EMPTY`. |
| BR-R9 | Suspending a restaurant immediately makes it non-orderable but does **not** cancel its in-flight orders; those run to completion. |
| BR-R10 | Suspending a **customer** likewise does not cancel their in-flight orders: the food is already cooked and the driver already en route, so the order runs to completion. The suspended customer simply cannot authenticate to watch it, and the state machine grants them no transitions. (Finding D-04.) |

### 7.3 Order state machine

**States:** `PENDING`, `CONFIRMED`, `PREPARING`, `READY_FOR_PICKUP`,
`OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`.

There is **no separate `REJECTED` state**. A restaurant rejection is a
`CANCELLED` order with `cancelled_by = RESTAURANT` and a reason code. See
[ADR-007](architecture/system-architecture.md#adr-007-single-cancelled-terminal-state).

```text
  PENDING ──accept──▶ CONFIRMED ──start──▶ PREPARING ──ready──▶ READY_FOR_PICKUP
     │                    │                     │                      │
     │                    │                     │                   pick up
     │                    │                     │                      ▼
     │                    │                     │              OUT_FOR_DELIVERY
     │                    │                     │                      │
     │                    │                     │                   deliver
     │                    │                     │                      ▼
     │                    │                     │                  DELIVERED ●
     ▼                    ▼                     ▼
  CANCELLED ●◀────────────┴─────────────────────┘
     ▲
     └──── admin force-cancel only, from READY_FOR_PICKUP / OUT_FOR_DELIVERY
```

**Transition table — the authoritative source for `orderStateMachine.js`:**

| # | From | To | Permitted actors | Guard conditions |
|---|------|----|------------------|------------------|
| T1 | `PENDING` | `CONFIRMED` | RESTAURANT (owner) | Order belongs to the caller's restaurant |
| T2 | `PENDING` | `CANCELLED` | CUSTOMER (owner), RESTAURANT (owner), ADMIN, SYSTEM | Restaurant and admin must supply a reason; SYSTEM fires on the 10-minute no-response timeout |
| T3 | `CONFIRMED` | `PREPARING` | RESTAURANT (owner) | — |
| T4 | `CONFIRMED` | `CANCELLED` | CUSTOMER (owner), RESTAURANT (owner), ADMIN | Customer's last cancellation point. Restaurant must supply a reason (e.g. `OUT_OF_STOCK`) |
| T5 | `PREPARING` | `READY_FOR_PICKUP` | RESTAURANT (owner) | — |
| T6 | `PREPARING` | `CANCELLED` | RESTAURANT (owner), ADMIN | **Customer may not cancel** — food is being cooked |
| T7 | `READY_FOR_PICKUP` | `OUT_FOR_DELIVERY` | DRIVER (accepted assignee) | An `ACCEPTED` `delivery_assignment` exists for this driver and order |
| T8 | `READY_FOR_PICKUP` | `CANCELLED` | ADMIN | Exceptional; reason mandatory |
| T9 | `OUT_FOR_DELIVERY` | `DELIVERED` | DRIVER (accepted assignee) | Sets `delivered_at`; driver → `AVAILABLE` |
| T10 | `OUT_FOR_DELIVERY` | `CANCELLED` | ADMIN | Exceptional (accident, undeliverable); reason mandatory; driver → `AVAILABLE` |

**Every transition not in this table is invalid** and returns
`409 INVALID_ORDER_TRANSITION`. Explicitly invalid and individually tested:
backwards moves (`PREPARING → CONFIRMED`), skips (`PENDING → PREPARING`,
`CONFIRMED → READY_FOR_PICKUP`), any transition out of the terminal states
`DELIVERED` and `CANCELLED`, a customer cancelling at `PREPARING` or later, a
restaurant touching `OUT_FOR_DELIVERY`, and a driver acting on an order they
were not assigned.

**Answers to the lifecycle questions:**

- **When can a customer cancel?** Only at `PENDING` or `CONFIRMED` (T2, T4). From `PREPARING` onward, ingredients are committed.
- **When can a restaurant reject?** At `PENDING` (T2, "reject") and at `CONFIRMED`/`PREPARING` (T4, T6, "cancel with reason"). Rejection always requires a reason code.
- **When can a driver update status?** Only at T7 and T9, only on an order with their own `ACCEPTED` assignment, and only in that order.
- **What if no driver is available?** Nothing destructive happens. The order keeps its status, `dispatch_state` becomes `UNASSIGNED`, dispatch retries every 60 s, and after 15 min the order appears in the admin "unassigned backlog" panel. The customer sees "finding a driver". (FR-7.4)
- **What happens on delivery?** `delivered_at` is stamped, the driver's assignment closes, the driver returns to `AVAILABLE`, and the order becomes eligible for review.
- **When is an order completed?** At `DELIVERED`. "Closed" means `DELIVERED` or `CANCELLED`; only closed orders leave the active-order views.

### 7.4 Cart rules

| ID | Rule |
|----|------|
| BR-C1 | At most one `ACTIVE` cart per customer (partial unique index on `carts(customer_user_id) WHERE status = 'ACTIVE'`). |
| BR-C2 | A cart's `restaurant_id` is set by its first item and is immutable while items remain. |
| BR-C3 | Adding an item from a different restaurant returns `409 CART_RESTAURANT_MISMATCH` with both restaurant names in `details`, so the UI can ask "Start a new cart with X?". The cart is **never** silently mixed or silently emptied. |
| BR-C4 | `POST /api/cart/items?replace=true` is the explicit switch: it clears the cart, rebinds the restaurant, and adds the item — in one transaction. |
| BR-C5 | Quantity is an integer 1–20. `0` is not an update; removal is `DELETE`. |
| BR-C6 | Adding an item already in the cart increments the existing line rather than creating a duplicate (unique on `(cart_id, food_item_id)`). |
| BR-C7 | An item can be added only if it is `is_available`, not soft-deleted, its category is active, and its restaurant is orderable. |
| BR-C8 | Cart reads re-validate every line against live menu data and return per-line `issues[]` (`ITEM_UNAVAILABLE`, `ITEM_REMOVED`, `PRICE_CHANGED`). Displayed prices are always live menu prices — the cart stores no prices ([ADR-008](architecture/system-architecture.md#adr-008-carts-reference-live-prices-orders-snapshot-them)). |
| BR-C9 | Checkout fails with `422 CART_HAS_ISSUES` if any line has an issue. The customer must resolve them explicitly. |
| BR-C10 | Checkout fails with `422 BELOW_MINIMUM_ORDER` if subtotal < the restaurant's `minimum_order_amount`. |
| BR-C11 | Checkout fails with `422 CART_EMPTY` on an empty cart. |
| BR-C12 | On successful checkout the cart becomes `CONVERTED`, and a new `ACTIVE` cart is created lazily on the customer's next add. |
| BR-C13 | A menu change after checkout can never affect the created order (BR-O1). |

### 7.5 Order & pricing rules

| ID | Rule |
|----|------|
| BR-O1 | `order_items` stores `item_name_snapshot`, `item_description_snapshot` and `unit_price` copied at checkout. Renaming, repricing or deleting a food item afterwards leaves historical orders byte-identical. |
| BR-O2 | `order_items.food_item_id` is `ON DELETE SET NULL` — the link is a convenience, the snapshot is the truth. |
| BR-O3 | `line_total = unit_price × quantity`; `subtotal = Σ line_total`; `tax_amount = round((subtotal − discount_amount) × TAX_RATE, 2)`; `total_amount = subtotal − discount_amount + delivery_fee + tax_amount`. `discount_amount` is 0 without a code and never exceeds the subtotal; a discount never reduces the delivery fee, and the restaurant minimum is judged before it ([spec-12](specs/spec-12-discount-codes.md)). All money is `NUMERIC(10,2)`, never floating point ([ADR-009](architecture/database-design.md#adr-009-numeric102-for-money)). |
| BR-O4 | `delivery_fee` is snapshotted from the restaurant at checkout. |
| BR-O5 | The client sends no prices. Any price-like field in a checkout payload is stripped, and its presence is logged as a possible tampering signal. |
| BR-O6 | The delivery address is snapshotted into `orders.delivery_address_snapshot` (JSONB). Editing the address book never rewrites history. |
| BR-O7 | `order_number` is a human-readable unique identifier `FF-YYYYMMDD-XXXXXX`; internal identity remains the UUID. |
| BR-O8 | A cancellation requires `cancelled_by` and a `cancellation_reason` code; for `CUSTOMER` the reason defaults to `CUSTOMER_CHANGED_MIND`. |
| BR-O9 | Concurrent transition attempts are serialized with `SELECT ... FOR UPDATE` on the order row; the loser gets `409 INVALID_ORDER_TRANSITION`. |
| BR-O10 | A customer may have multiple concurrent open orders; the single-cart constraint (BR-C1) is about carts, not orders. |

### 7.6 Delivery rules

| ID | Rule |
|----|------|
| BR-D1 | Dispatch runs when an order enters `CONFIRMED`, giving the driver travel lead time. |
| BR-D2 | Only drivers with `driver_profiles.status = ACTIVE` and `availability = AVAILABLE` receive offers. |
| BR-D3 | Offers go to the nearest eligible driver by straight-line distance from the restaurant; ties break on longest idle time. |
| BR-D4 | An offer expires 90 s after creation. Expiry or decline triggers the next candidate. |
| BR-D5 | A driver has at most one `ACCEPTED` and undelivered assignment (partial unique index on `delivery_assignments(driver_user_id) WHERE status = 'ACCEPTED'`). |
| BR-D6 | Accepting sets `orders.driver_user_id` and driver `availability = ON_DELIVERY`. |
| BR-D7 | A driver cannot mark pickup before the order is `READY_FOR_PICKUP`; premature attempts return `409 INVALID_ORDER_TRANSITION`. |
| BR-D8 | Delivery or admin force-cancel releases the driver to `AVAILABLE`. |
| BR-D9 | A driver going `OFFLINE` while on a delivery is refused with `409 DRIVER_HAS_ACTIVE_DELIVERY`. |
| BR-D10 | Declining an offer carries no penalty in v1 but is recorded for future scoring. |

### 7.7 Review rules

| ID | Rule |
|----|------|
| BR-V1 | Reviewable only when the order is `DELIVERED`; a `CANCELLED` order is never reviewable. |
| BR-V2 | One review per order (unique on `reviews.order_id`), written by that order's customer only. |
| BR-V3 | `restaurant_rating` is an integer 1–5 and is required; `comment` is optional, ≤1000 characters. |
| BR-V4 | `driver_rating` (1–5) is accepted only if the order has a `driver_user_id`; otherwise 422. |
| BR-V5 | Aggregates (`rating_average`, `rating_count`) are recomputed inside the review transaction. `rating_average` is `NUMERIC(3,2)`. |
| BR-V6 | Editable by the author for 24 hours after creation; afterwards `409 REVIEW_EDIT_WINDOW_CLOSED`. Edits recompute aggregates. |
| BR-V7 | Admin hiding sets `status = HIDDEN`, excludes the review from public lists, and recomputes aggregates without it. |
| BR-V8 | Public review responses expose the customer's first name and last initial only — never the email, phone or full name. |

---

## 8. System Architecture

Summary here; full detail in [architecture/system-architecture.md](architecture/system-architecture.md).

```text
┌──────────────────────────────────────────────────────────────┐
│  Vue 3 SPA (Vite)                                            │
│  customer · restaurant · driver · admin  (route-guarded)     │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS · REST · JSON · Bearer JWT
┌───────────────────────────▼──────────────────────────────────┐
│  Express 4 API — single deployable modular monolith          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ middleware: requestId · cors · helmet · rateLimit ·     │  │
│  │             authenticate · authorize · validate        │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ modules (routes → controllers → services → repos)      │  │
│  │ auth · users · restaurants · menu · discovery ·        │  │
│  │ cart · orders · delivery · reviews · admin             │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ shared: db · errors · logger · config · money · jwt    │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ jobs (in-process interval): dispatch · offer-expiry ·  │  │
│  │       order-timeout · unassigned-escalation            │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────────┘
                            │ pg pool (Knex)
┌───────────────────────────▼──────────────────────────────────┐
│  PostgreSQL 16 — citext · pg_trgm · pgcrypto                 │
└──────────────────────────────────────────────────────────────┘
```

**Module boundary rule (NFR-1):** a module may import another module only via
its `index.js` public interface, and may query only its own tables. Orders needs
menu data → it calls `menu.getItemsForOrder(ids)`; it does not `SELECT` from
`food_items`. This is what makes a later extraction mechanical rather than
archaeological.

---

## 9. Frontend Architecture

Summary; detail in [architecture/frontend-architecture.md](architecture/frontend-architecture.md).

- **Vue 3** `<script setup>` SFCs, **Vite**, **Vue Router 4**, **Pinia**, **Axios**, **Tailwind CSS**.
- Structure: `src/{router,layouts,views,components,composables,stores,services,utils,i18n}`, with `views/` and `components/` split by role (`customer/`, `restaurant/`, `driver/`, `admin/`, `shared/`).
- **Global Pinia stores only where state is genuinely shared:** `auth` (session, user, role), `cart` (badge count + contents), `ui` (toasts, global loading). Everything else — restaurant lists, order lists, menus — is **local view state loaded through composables** (`useRestaurants`, `useOrders`, `useOrderPolling`). Server data is not hoarded in global state.
- Route guards: `requiresAuth`, `requiresRole`, `requiresGuest`. Each role has its own route subtree; a wrong-role visit renders a 403 view rather than a blank redirect loop.
- Layouts: every signed-in role, the customer included, uses `DashboardLayout`, a sidebar shell whose header holds only the name, role, language, theme and sign-out. The public pages use `SiteLayout`, which renders `DashboardLayout` for a signed-in customer and `PublicLayout` for everyone else. Create and edit forms are pages of their own.
- A single Axios instance attaches the access token, refreshes once on 401 with a request queue, and maps envelope errors to typed client errors.

---

## 10. Backend Architecture

Summary; detail in [architecture/backend-architecture.md](architecture/backend-architecture.md).

Four layers, strictly one-directional:

```text
route      → HTTP method, path, middleware chain. No logic.
controller → parse validated input, call service, format response. No logic, no SQL.
service    → business rules, transactions, cross-module orchestration. No SQL strings, no req/res.
repository → SQL / Knex queries, row↔domain mapping. No business rules.
```

A controller never touches a repository. A service never sees `req` or `res`. A
repository never decides anything. Violations are caught in review and by the
import-boundary lint rule.

---

## 11. Database Architecture

Summary; full ERD, DDL sketches and index list in
[architecture/database-design.md](architecture/database-design.md).

**17 tables:** `users`, `customer_addresses`, `restaurants`,
`restaurant_hours`, `driver_profiles`, `menu_categories`, `food_items`,
`carts`, `cart_items`, `orders`, `order_items`, `order_status_events`,
`delivery_assignments`, `reviews`, `refresh_tokens`, `admin_audit_logs`,
`notifications`.

Conventions: UUID v4 primary keys (`gen_random_uuid()`); `created_at` /
`updated_at` `TIMESTAMPTZ` on every table with an `updated_at` trigger;
`deleted_at` soft deletes on entities referenced by history; money as
`NUMERIC(10,2)`; enums as PostgreSQL native `ENUM` types; foreign keys always
explicit with a deliberate `ON DELETE` choice per relationship.

---

## 12. Authentication & Authorization

Detail in [architecture/security.md](architecture/security.md).

- **Registration:** validate → check email uniqueness → bcrypt hash (cost 12) → insert user (+ restaurant shell for `RESTAURANT`) → issue tokens.
- **Login:** look up by `CITEXT` email → `bcrypt.compare` → reject if `status ≠ ACTIVE` → issue tokens. A wrong email and a wrong password return the **same** `401 INVALID_CREDENTIALS` in the same time envelope (a dummy hash comparison runs on the unknown-email path so timing does not leak account existence).
- **Access token:** HS256, 15 min, claims `{ sub, role, email, jti, iat, exp, iss, aud }`. No permissions are baked in — they are resolved server-side per request.
- **Refresh token:** 256-bit random, stored **hashed** (SHA-256), 30-day expiry, single-use with rotation, and reuse detection that revokes the whole family.
- **`authenticate` middleware:** verify signature/expiry → load user → reject if suspended/deleted → attach `req.user`.
- **`authorize(...roles)` middleware:** role gate. Ownership is always a second, separate service-layer check — `authorize('RESTAURANT')` says *a* restaurant, the service says *this* restaurant.

**Authorization boundaries:**
- Customer → only rows where `customer_user_id = req.user.id`.
- Restaurant → only rows where `restaurant_id = (the caller's restaurant)`.
- Driver → only assignments/orders where `driver_user_id = req.user.id`.
- Admin → unrestricted read; writes are audited.

An ownership failure returns **404**, not 403, wherever a 403 would confirm that
someone else's resource exists ([ADR-010](architecture/security.md#adr-010-404-over-403-for-cross-tenant-resources)).

---

## 13. API Design

Full endpoint reference in [architecture/api-design.md](architecture/api-design.md).

- Base path `/api` in v1 (`/api/v2` is the escape hatch if a breaking change arrives).
- Resource-oriented plural nouns. Status transitions are **sub-resource actions**, not PATCHes of a status field: `POST /api/restaurant/orders/:id/accept` rather than `PATCH {status}`. Each action carries its own authorization and validation, which a generic status PATCH cannot express cleanly ([ADR-011](architecture/api-design.md#adr-011-action-endpoints-for-state-transitions)).
- Domains: `/auth`, `/me`, `/addresses`, `/restaurants`, `/restaurant` (owner self-service), `/menu`, `/cart`, `/orders`, `/driver`, `/reviews`, `/admin`.
- Pagination: `?page=1&limit=20` (limit ≤100) with a `meta.pagination` block.
- Status codes: 200 / 201 / 204 / 400 / 401 / 403 / 404 / 409 / 422 / 429 / 500.

---

## 14. Error Handling

**One envelope for every response.** Success:

```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "c1f...", "pagination": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 } }
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_ORDER_TRANSITION",
    "message": "This order can no longer be cancelled.",
    "details": [
      { "field": "status", "issue": "Order is PREPARING; customers may cancel only while PENDING or CONFIRMED." }
    ]
  },
  "meta": { "requestId": "c1f..." }
}
```

The suggested flat shape was changed: `code`, `message` and `errors` are nested
under `error`. Nesting lets a client branch on `if (!body.success)` and then read
one object, and it keeps `meta` (request ID, pagination) uniform across success
and failure. `errors` was renamed `details` because it also carries
non-validation context.

**Error-code registry** — every code is defined once in
`shared/errors/codes.js` and covered by a contract test:

| HTTP | Code | Raised when |
|------|------|-------------|
| 400 | `MALFORMED_REQUEST` | Unparseable JSON, bad UUID in a path |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 401 | `TOKEN_MISSING` / `TOKEN_INVALID` / `TOKEN_EXPIRED` | Access-token problems |
| 401 | `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED` | Refresh failures; reuse revokes the family |
| 403 | `FORBIDDEN_ROLE` | Authenticated but wrong role |
| 403 | `ACCOUNT_SUSPENDED` | User or restaurant suspended |
| 403 | `RESTAURANT_NOT_APPROVED` | Owner acting before approval |
| 404 | `RESOURCE_NOT_FOUND` | Missing, or not owned by the caller |
| 409 | `EMAIL_ALREADY_REGISTERED` | Duplicate email |
| 409 | `CART_RESTAURANT_MISMATCH` | BR-C3 |
| 409 | `INVALID_ORDER_TRANSITION` | Not in the §7.3 table, or lost a concurrency race |
| 409 | `CATEGORY_NOT_EMPTY` | BR-R8 |
| 409 | `REVIEW_ALREADY_EXISTS` | BR-V2 |
| 409 | `REVIEW_EDIT_WINDOW_CLOSED` | BR-V6 |
| 409 | `DRIVER_HAS_ACTIVE_DELIVERY` | BR-D5 / BR-D9 |
| 409 | `HAS_ACTIVE_ORDERS` | BR-A6 — delete refused: customer or restaurant has orders in progress |
| 409 | `OFFER_NO_LONGER_AVAILABLE` | Offer expired or taken |
| 422 | `VALIDATION_ERROR` | Schema failure; `details[]` is field-by-field |
| 422 | `CART_EMPTY` / `CART_HAS_ISSUES` / `BELOW_MINIMUM_ORDER` | BR-C11 / BR-C9 / BR-C10 |
| 422 | `ITEM_UNAVAILABLE` | BR-C7 |
| 422 | `RESTAURANT_UNAVAILABLE` | BR-R3 violated at add-to-cart or checkout |
| 422 | `ORDER_NOT_REVIEWABLE` | BR-V1 |
| 429 | `RATE_LIMIT_EXCEEDED` | Limiter tripped |
| 500 | `INTERNAL_ERROR` | Unexpected; message is generic, detail goes to logs only |

**Handling rules:** services throw typed `AppError` subclasses carrying a code
and an HTTP status; controllers never build error responses; one terminal error
middleware maps `AppError` → envelope and anything else → `INTERNAL_ERROR` with
the stack logged against the request ID. Postgres error codes (`23505` unique,
`23503` FK) are translated at the repository boundary so raw driver errors never
surface. `unhandledRejection` and `uncaughtException` log and exit for the
supervisor to restart.

---

## 15. Validation

**Backend validation is the source of truth. Frontend validation exists only to
improve UX and is never trusted.** Detail in
[architecture/backend-architecture.md](architecture/backend-architecture.md#4-validation-layer).

Zod schemas live beside each module (`modules/<domain>/<domain>.schemas.js`) and
are applied by a `validate({ body, params, query })` middleware that strips
unknown keys — so an injected `role`, `status` or `price` never reaches a
service. Key rules:

| Area | Rules |
|------|-------|
| Registration | email RFC-valid ≤255, normalized to lowercase; password 8–72 with a letter and a digit; `fullName` 2–100; `phone` `^\+?[1-9]\d{7,14}$`; `role` ∈ {CUSTOMER, RESTAURANT} |
| Login | email + non-empty password; no format feedback that would enumerate accounts |
| Address | `label` ≤50; `line1` 5–200; `city` 2–100; `latitude` −90..90; `longitude` −180..180 |
| Restaurant | `name` 2–120; `description` ≤2000; `cuisineType` from a fixed enum; `deliveryFee` 0–999.99; `minimumOrderAmount` 0–9999.99; `avgPreparationMinutes` 5–180 |
| Hours | `dayOfWeek` 0–6; `opensAt`/`closesAt` `HH:mm`; `closesAt > opensAt` unless `isClosed` |
| Category | `name` 2–60; `displayOrder` 0–999 |
| Food item | `name` 2–120; `description` ≤1000; `price` >0 ≤9999.99, exactly 2 decimals; `imageUrl` http(s) ≤500 chars; `categoryId` a UUID owned by the same restaurant |
| Cart | `foodItemId` UUID; `quantity` integer 1–20; `notes` ≤200 |
| Checkout | `addressId` UUID owned by the caller; `customerNote` ≤500; `paymentMethod` = `CASH_ON_DELIVERY`. **Any price field is stripped and ignored** |
| Transitions | `reason` required for restaurant/admin cancellations, from a fixed code enum; free-text `reasonNote` ≤300 |
| Review | `restaurantRating` integer 1–5 required; `driverRating` integer 1–5 optional; `comment` ≤1000 |
| Pagination | `page` ≥1; `limit` 1–100; `sort` from an allow-list (never interpolated into SQL) |

The frontend mirrors these with VeeValidate plus a shared rules module, showing
inline errors on blur and mapping backend `details[]` back onto the offending
fields.

---

## 16. Security

Detail in [architecture/security.md](architecture/security.md). Security is
specified inside the relevant specs and stories, not bolted on at the end.

| Concern | Measure |
|---------|---------|
| Password storage | bcrypt cost 12; never logged, never serialized; `password_hash` excluded from every response because mappers allow-list fields |
| JWT | HS256, ≥256-bit secret from env, 15-min access tokens, `iss`/`aud` verified, algorithm pinned (no `alg: none`) |
| Session revocation | Hashed, rotating, single-use refresh tokens with reuse detection; suspension revokes the family |
| Authorization | Role guard + explicit ownership check at the service layer; a default-deny router audit test asserts every route declares a guard |
| SQL injection | Parameterized queries only via Knex bindings; no string-concatenated SQL; `sort`/`order` validated against an allow-list |
| Input validation | Zod at the edge with unknown-key stripping (mass-assignment defence) |
| CORS | Allow-list from `CORS_ORIGINS`; credentials enabled only for known origins; no `*` in production |
| Rate limiting | Global 300 req/15 min/IP; `/auth/login` and `/auth/register` 10/15 min per IP+email; checkout 20/hour/user |
| Sensitive data | Responses built by explicit mappers; other users' email/phone never exposed; reviews show first name + last initial |
| Error messages | Generic outward text, full detail in logs keyed by request ID; no stack traces, SQL or file paths in responses |
| Secrets & env | `.env` git-ignored, `.env.example` committed, config validated at boot, secrets never logged |
| Headers | `helmet` defaults + HSTS; JSON body limit 100 KB |
| Role isolation | Separate route subtrees per role; four independent authorization test suites |
| Dependency hygiene | `npm audit --audit-level=high` in CI |

---

## 17. Testing Strategy

Detail in [architecture/testing-strategy.md](architecture/testing-strategy.md).

| Layer | Tools | What it covers |
|-------|-------|----------------|
| Backend unit | Vitest | Pure logic: state machine, money math, cart validation, price snapshotting, JWT utils, validation schemas |
| Backend service | Vitest + a real PostgreSQL test DB | Transactions, business rules, ownership checks, aggregate recomputation |
| API integration | Vitest + Supertest | The full HTTP path per endpoint: auth, validation, authorization, envelope, error codes |
| Frontend unit | Vitest | Stores, composables, utils, validation rules |
| Frontend component | Vitest + Vue Test Utils | Rendering, props/events, form validation, conditional UI by role |
| E2E | Playwright | Cross-role journeys against a seeded stack |
| Accessibility | `@axe-core/playwright` | Key screens per role |

**Non-negotiables:** the §7.3 transition table is exhaustively tested — every
legal transition passes, and **every illegal one is asserted to fail** with
`INVALID_ORDER_TRANSITION`. Every protected route appears in the authorization
matrix test with all four roles plus anonymous. Every business rule ID (BR-\*)
maps to at least one test whose name cites the ID.

**Primary E2E scenario** (`e2e/full-order-journey.spec.js`): customer registers
→ logs in → browses → opens a restaurant → adds items → attempts a
cross-restaurant add and gets the conflict → replaces the cart → checks out →
order is `PENDING` → restaurant accepts → prepares → marks ready → driver
accepts the offer → picks up → delivers → customer sees `DELIVERED` → customer
reviews → the restaurant's rating average updates.

---

## 18. Specs Index

| Spec | Title | Implemented by |
|------|-------|----------------|
| [spec-01](specs/spec-01-platform-foundation-api-contract.md) | Platform Foundation & API Contract | story-01, story-02 |
| [spec-02](specs/spec-02-identity-authentication-authorization.md) | Identity, Authentication & Authorization | story-02, story-03, story-08, story-10 |
| [spec-03](specs/spec-03-restaurant-profile-operations.md) | Restaurant Profile & Operating Status | story-03, story-10 |
| [spec-04](specs/spec-04-menu-management.md) | Menu Management | story-03, story-04, story-05 |
| [spec-05](specs/spec-05-restaurant-discovery-search.md) | Restaurant Discovery & Search | story-04 |
| [spec-06](specs/spec-06-cart-management.md) | Cart Management | story-05, story-06 |
| [spec-07](specs/spec-07-order-placement-lifecycle.md) | Order Placement & Lifecycle | story-06, story-07, story-08, story-10 |
| [spec-08](specs/spec-08-delivery-assignment-driver-operations.md) | Delivery Assignment & Driver Operations | story-07, story-08 |
| [spec-09](specs/spec-09-reviews-ratings.md) | Reviews & Ratings | story-09, story-10 |
| [spec-10](specs/spec-10-platform-administration-reporting.md) | Platform Administration & Reporting | story-03, story-08, story-09, story-10 |
| [spec-11](specs/spec-11-card-payments.md) | Card Payments | story-11 |
| [spec-12](specs/spec-12-discount-codes.md) | Discount Codes | story-12 |
| [spec-13](specs/spec-13-notifications.md) | Notifications | story-13 |
| [spec-14](specs/spec-14-live-updates.md) | Live Updates | story-14 |
| [spec-15](specs/spec-15-item-options.md) | Item Options | story-15 |
| [spec-16](specs/spec-16-favourites.md) | Favourites | story-16 |
| [spec-17](specs/spec-17-restaurant-analytics.md) | Restaurant Analytics | story-17 |
| [spec-18](specs/spec-18-delivery-zones.md) | Delivery Zones | story-18 |

## 19. Stories Index

| Story | Title | Related specs |
|-------|-------|---------------|
| [story-01](stories/story-01-platform-foundation-walking-skeleton.md) | Platform Foundation & Walking Skeleton | spec-01 |
| [story-02](stories/story-02-customer-registration-login-profile.md) | Customer Registration, Login & Profile | spec-01, spec-02 |
| [story-03](stories/story-03-restaurant-onboarding-menu-management.md) | Restaurant Onboarding, Profile & Menu Management | spec-02, spec-03, spec-04, spec-10 |
| [story-04](stories/story-04-restaurant-discovery-menu-browsing.md) | Restaurant Discovery, Search & Menu Browsing | spec-04, spec-05 |
| [story-05](stories/story-05-cart-management.md) | Cart Management | spec-04, spec-06 |
| [story-06](stories/story-06-order-placement-customer-tracking.md) | Order Placement & Customer Order Tracking | spec-06, spec-07 |
| [story-07](stories/story-07-restaurant-order-processing.md) | Restaurant Order Processing | spec-07, spec-08 |
| [story-08](stories/story-08-driver-onboarding-delivery-execution.md) | Driver Onboarding, Assignment & Delivery Execution | spec-02, spec-07, spec-08, spec-10 |
| [story-09](stories/story-09-reviews-ratings.md) | Reviews & Ratings | spec-09, spec-10 |
| [story-10](stories/story-10-platform-administration-reporting.md) | Platform Administration & Reporting | spec-02, spec-07, spec-09, spec-10 |

No orphans: every spec has ≥1 implementing story and every story cites ≥1 spec.
Verified in [dependency-map.md](dependency-map.md#1-coverage-matrix).

---

## 20. Dependency Graph

```text
                          story-01 (foundation)
                                  │
                          story-02 (customer auth)
                                  │
              ┌───────────────────┼───────────────────┐
              │                                       │
       story-03 (restaurant                     story-10 (admin)
        onboarding + menu)                    needs 02 for the guard
              │                               and the user list; grows
       story-04 (discovery)                   with 03, 07 and 09
              │
       story-05 (cart)
              │
       story-06 (place + track order)
              │
       story-07 (restaurant processing)
              │
       story-08 (driver delivery)
              │
       story-09 (reviews)
```

Full edge-by-edge rationale, parallelization opportunities and the critical path
are in [dependency-map.md](dependency-map.md).

## 21. Implementation Order

Six phases; rationale and per-phase exit criteria in
[implementation-plan.md](implementation-plan.md).

| Phase | Stories | Delivers |
|-------|---------|----------|
| 1 — Foundation & Identity | story-01, story-02 | Running stack, auth, customer profile |
| 2 — Supply side | story-03 | Approved restaurants with real menus |
| 3 — Demand side | story-04, story-05 | Browsing, search and a working cart |
| 4 — Transaction core | story-06, story-07 | Orders placed, tracked and processed |
| 5 — Fulfilment | story-08 | Dispatch and delivery; the journey closes |
| 6 — Trust & operations | story-09, story-10 | Reviews, admin control, statistics, hardening |

## 22. Assumptions

Full list with rationale and revisit-triggers in [assumptions.md](assumptions.md).
The load-bearing ones: single currency (SAR) and single timezone
(`Asia/Riyadh`); cash on delivery only; a flat configurable VAT rate defaulting
to 15%; a flat per-restaurant delivery fee rather than distance-based; addresses
are free-text with optional coordinates, not geocoded; straight-line
nearest-driver dispatch rather than routing; background jobs run in-process on
`setInterval` rather than on a queue (acceptable for one replica — flagged in
[risks.md](risks.md) as R-06).

## 23. Risks

Full register with likelihood, impact and mitigation in [risks.md](risks.md).
Top five: order state-machine races under concurrent actors (R-01); price and
menu drift corrupting historical orders (R-02); the cart/restaurant switch being
mishandled and losing customer work (R-03); authorization gaps between roles
(R-04); and dispatch starvation leaving orders unassigned (R-05).

## 24. Future Enhancements

Ordered by expected value, not by difficulty. Items 1, 2, 3 and 5 have since been built (specs 11–14); what remains of them is noted on each.

1. ~~**Payment gateway integration**~~ — built in [spec-11](specs/spec-11-card-payments.md). Remaining: a provider for Egypt (the Moyasar adapter takes SAR only), and checking the Moyasar adapter against real test keys.
2. ~~**WebSocket / SSE live updates**~~ — built in [spec-14](specs/spec-14-live-updates.md). Remaining: an admin stream, and a shared broker (Postgres NOTIFY or Redis) once there is more than one process.
3. ~~**Real notification transports**~~ — built in [spec-13](specs/spec-13-notifications.md). Remaining: a per-user language preference (Arabic templates exist).
4. **Live driver GPS tracking** — a map on the customer's tracking screen; `driver_profiles` already carries coordinates.
5. ~~**Promotions and discount codes**~~ — built in [spec-12](specs/spec-12-discount-codes.md).
6. **Scheduled orders** — an `orders.scheduled_for` column plus a dispatch delay.
7. **Distance-based delivery fees and zone management.**
8. **Restaurant replies to reviews.**
9. **Extracting dispatch to a queue-backed worker** (BullMQ) once one process is no longer enough — the job module boundary is already drawn.
10. **Recommendations and personalized ranking**, once there is enough order history to learn from.
11. **Internationalization (Arabic, RTL)** — copy is already centralized.
12. **Multi-restaurant carts**, if research shows customers want them; today's rules deliberately forbid it.
