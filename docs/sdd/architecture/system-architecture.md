# System Architecture

> Parent: [master-sdd.md](../master-sdd.md) · Spec: [spec-01](../specs/spec-01-platform-foundation-api-contract.md)

## 1. Shape of the system

FoodFlow is three processes: a Vue SPA served as static assets, one Express API
process, and one PostgreSQL instance. There is no message broker, no cache
server and no separate worker in v1 — every added process is an added failure
mode, and none of them earn their keep at this scale.

```text
Browser (Vue 3 SPA)
   │  REST/JSON over HTTPS, Bearer access token
   ▼
Express API (modular monolith, stateless)
   │  Knex → pg pool
   ▼
PostgreSQL 16
```

Background work (dispatch, offer expiry, order timeouts) runs **inside the API
process** on `setInterval` timers, guarded by a PostgreSQL advisory lock so that
running more than one replica does not double-execute jobs. See [ADR-003](#adr-003-in-process-scheduled-jobs-with-an-advisory-lock).

## 2. Domain modules

Nine domain modules plus a shared kernel. Each owns a set of tables and exposes
a narrow public interface.

| Module | Owns (tables) | Public interface (what other modules may call) |
|--------|---------------|-----------------------------------------------|
| `auth` | `refresh_tokens` | `issueTokens(user)`, `verifyAccessToken(t)`, `revokeAllForUser(userId, trx)` |
| `users` | `users`, `customer_addresses` | `getUserById(id)`, `getPublicProfile(id)`, `getAddressForOrder(userId, addressId)`, `setUserStatus(id, status, trx)` |
| `restaurants` | `restaurants`, `restaurant_hours` | `getRestaurantById(id)`, `getByOwner(userId)`, `assertOrderable(id)`, `applyRatingAggregate(id, trx)` |
| `menu` | `menu_categories`, `food_items` | `getItemsByIds(ids)`, `getMenuForRestaurant(id, {publicOnly})`, `assertItemOrderable(itemId)` |
| `discovery` | *(none — reads via `restaurants` + `menu`)* | `searchRestaurants(q)`, `listRestaurants(filters)` |
| `cart` | `carts`, `cart_items` | `getActiveCartForCustomer(id)`, `markConverted(cartId, trx)` |
| `orders` | `orders`, `order_items`, `order_status_events` | `createFromCart(...)`, `transition(orderId, to, actor, trx)`, `getOrderForActor(...)` |
| `delivery` | `delivery_assignments`, driver fields on `driver_profiles` | `dispatch(orderId)`, `getActiveAssignment(driverId)`, `releaseDriver(driverId, trx)` |
| `reviews` | `reviews` | `getReviewsForRestaurant(id)`, `isOrderReviewed(orderId)` |
| `admin` | `admin_audit_logs` | `audit(adminId, action, entity, meta, trx)` |

**Shared kernel** (`src/shared/`): `config`, `db` (Knex instance + transaction
helper), `errors` (AppError hierarchy + code registry), `logger`, `money`,
`jwt`, `http` (envelope builders), `validation` (the `validate` middleware).
The shared kernel depends on nothing in `modules/`.

### Boundary rule (NFR-1)

A module may import another module **only** through `modules/<name>/index.js`,
and may issue SQL **only** against its own tables. Concretely, this is illegal:

```js
// ❌ orders.service.js — reaching into another module's tables
const item = await knex('food_items').where({ id }).first();
```

and this is the correct form:

```js
// ✅ orders.service.js
import { menu } from '../menu/index.js';
const items = await menu.getItemsByIds(ids, { trx });
```

Enforced by ESLint `no-restricted-imports` (patterns `**/modules/*/!(index.js)`
from outside the module) plus review. The payoff is G6: extracting `delivery`
into its own service later means replacing one `index.js` with an HTTP client,
not untangling joins.

### Cross-module transactions

Many operations span modules — checkout touches `cart`, `menu`, `restaurants`,
`orders` and `delivery`. Every public module function therefore accepts an
optional `{ trx }`; the orchestrating service opens one transaction and threads
it through. Rule: **the module that starts the transaction owns the commit.**
Nested `withTransaction` calls reuse the passed `trx` rather than opening a
second connection.

## 3. Request lifecycle

```text
HTTP request
 → requestId        (uuid → req.id, X-Request-Id header)
 → helmet, cors, json body limit (100 KB)
 → rateLimit        (global, then route-specific)
 → route match
 → authenticate     (verify JWT, load user, reject suspended)
 → authorize(roles) (role gate)
 → validate(schema) (Zod; strips unknown keys)
 → controller       (maps req → service args)
 → service          (business rules; opens transaction if needed)
 → repository       (Knex query)
 → controller       (maps domain → DTO via a mapper)
 → response envelope
 → (on throw) errorHandler → envelope
```

## 4. Background jobs

| Job | Interval | Responsibility | Rule |
|-----|----------|----------------|------|
| `dispatchJob` | 20 s | Find `CONFIRMED`+ orders with `dispatch_state = UNASSIGNED` and no live offer; create the next offer | BR-D1, BR-D3 |
| `offerExpiryJob` | 15 s | Expire `OFFERED` assignments past `expires_at`; re-queue the order for dispatch | BR-D4 |
| `orderTimeoutJob` | 60 s | Cancel `PENDING` orders older than `ORDER_ACCEPT_TIMEOUT_MINUTES` (default 10) as `SYSTEM` | T2 |
| `unassignedEscalationJob` | 60 s | Flag orders unassigned for >15 min so they surface in the admin backlog panel | FR-7.4 |

All four run through one `runLocked(jobName, fn)` helper that takes a
`pg_try_advisory_lock`, so a second replica skips the tick instead of
duplicating it.

## 5. Environments & configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` |
| `PORT` | API port | `4000` |
| `DATABASE_URL` | Postgres connection string | — (required) |
| `JWT_SECRET` | HS256 signing key, ≥32 chars | — (required) |
| `JWT_ACCESS_TTL` | Access token lifetime | `15m` |
| `JWT_REFRESH_TTL_DAYS` | Refresh token lifetime | `30` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Token claims | `foodflow` / `foodflow-app` |
| `BCRYPT_ROUNDS` | Hash cost | `12` |
| `CORS_ORIGINS` | Comma-separated allow-list | `http://localhost:5173` |
| `TAX_RATE` | VAT applied to subtotal | `0.15` |
| `ORDER_ACCEPT_TIMEOUT_MINUTES` | PENDING auto-cancel | `10` |
| `DELIVERY_OFFER_TTL_SECONDS` | Offer expiry | `90` |
| `LOG_LEVEL` | pino level | `info` |

Config is parsed and validated by a Zod schema at boot (`shared/config`). An
invalid or missing required variable **exits the process with a readable
message** rather than failing later at the first request (FR-10.4).

## 6. Local development

```bash
docker compose up -d        # postgres:16 with citext, pg_trgm, pgcrypto
cd backend && npm install && npm run migrate && npm run seed && npm run dev
cd frontend && npm install && npm run dev
```

Seed data creates: 1 admin, 3 customers, 4 restaurants (3 `ACTIVE`, 1
`PENDING_APPROVAL`) with categories and items, 3 drivers, and orders in every
lifecycle state — so every screen has something to render on first run (G5).

---

## Architecture Decision Records

### ADR-001: Modular monolith over microservices

**Context.** FoodFlow has nine domains and one team. Microservices would give
independent deploys at the cost of network partitions, distributed transactions,
per-service auth and an operational footprint nobody is staffed to run.

**Decision.** One deployable Express application with enforced internal module
boundaries.

**Consequences.** Checkout — which spans cart, menu, restaurant, orders and
delivery — stays a single ACID transaction instead of a saga. Deploys are
all-or-nothing. The boundary rule (§2) is the price paid now to keep extraction
cheap later; without it, "modular" degrades into "monolith" within weeks.

### ADR-002: Knex query builder rather than a full ORM

**Context.** Options were raw `pg`, Knex, or an ORM (Sequelize/Prisma/TypeORM).

**Decision.** Knex for migrations and query building, with hand-written
repository functions and explicit row↔domain mappers.

**Rationale.** The order and cart logic is query-shaped, not object-shaped:
partial unique indexes, `SELECT ... FOR UPDATE`, trigram search and aggregate
recomputation are all things ORMs either hide or fight. Knex keeps SQL visible
and parameterized while still giving first-class migrations. Raw `pg` was
rejected only because hand-rolling migrations is wasted effort.

**Consequences.** No lazy loading and no entity cache — repositories must fetch
deliberately, which is also how NFR-6 (no N+1) gets met. Mappers are written by
hand, which is exactly what keeps `password_hash` out of responses.

### ADR-003: In-process scheduled jobs with an advisory lock

**Context.** Dispatch, offer expiry and order timeouts need periodic execution.
A queue (BullMQ + Redis) is the "proper" answer.

**Decision.** `setInterval` jobs inside the API process, each wrapped in a
`pg_try_advisory_lock`.

**Rationale.** Adding Redis for four timers contradicts G5 (runs locally with
two commands) and the non-goal of operational complexity. The advisory lock
means the design is still correct with multiple replicas — it just does not
scale the work across them.

**Consequences.** Job execution stops if the API is down; jobs are best-effort
and idempotent by design (each re-derives state from the database, never from
memory). Risk R-06 tracks this; the migration path is in Future Enhancement 9.

### ADR-007: Single `CANCELLED` terminal state

**Context.** The lifecycle needs to express customer cancellation, restaurant
rejection, admin intervention and system timeout. One option is separate
`REJECTED` and `CANCELLED` states.

**Decision.** One `CANCELLED` state, qualified by `cancelled_by`
(`CUSTOMER | RESTAURANT | DRIVER | ADMIN | SYSTEM`) and `cancellation_reason`
(a code enum).

**Rationale.** Separate states double the transition table without adding a
single distinct behaviour — nothing in the system treats a rejected order
differently from a cancelled one; both are closed, unfulfilled and
non-reviewable. The distinction that actually matters for analytics is *who
cancelled and why*, which is exactly what the two columns record.

**Consequences.** "Rejection rate" is a query (`WHERE status = 'CANCELLED' AND
cancelled_by = 'RESTAURANT'`), not a state. The UI labels a restaurant-cancelled
order "Rejected by restaurant" by reading `cancelled_by` — presentation, not
domain.

### ADR-008: Carts reference live prices; orders snapshot them

**Context.** Should `cart_items` store a price?

**Decision.** No. `cart_items` stores only `food_item_id`, `quantity` and
`notes`. Prices are joined live from `food_items` on every cart read. At
checkout, prices are copied into `order_items.unit_price` and never read from
`food_items` again.

**Rationale.** A price stored in the cart is a promise the platform never made —
it goes stale silently, and the customer is charged one number while seeing
another. A live join means the cart always shows the truth, and BR-C8's
`PRICE_CHANGED` issue flag can surface a change explicitly when it matters. The
snapshot happens at exactly the moment the price becomes a commitment: checkout.

**Consequences.** Cart reads join `food_items` (cheap, indexed). Orders are
fully self-describing (BR-O1, G2). The two concerns — "what I am considering"
and "what I agreed to pay" — are stored with the semantics each deserves.
