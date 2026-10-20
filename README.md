# FoodFlow

A food delivery management platform: customers browse restaurants and order,
restaurant owners manage their menu and fulfil orders, drivers accept and
deliver them, and administrators approve and police the marketplace.

FoodFlow is a **modular monolith** — one deployable Node process with hard
internal boundaries between domain modules — plus a Vue 3 single-page
application. It is not a microservice system, and the reasoning is recorded in
[ADR-001](docs/sdd/architecture/system-architecture.md).

| | |
|---|---|
| Backend | Node.js 20+, Express 4, Knex, PostgreSQL 16+ |
| Frontend | Vue 3 (`<script setup>`), Pinia, Vue Router, Tailwind CSS, Vite — light/dark theme, English/Arabic (RTL) |
| Auth | JWT HS256 access tokens + rotating refresh tokens |
| API | REST, 100 endpoints under `/api`, all documented |
| Tests | 640 backend · 44 frontend · 14 end-to-end browser scenarios |

## Table of contents

**Run it**

1. [Getting started](#getting-started)
2. [Development accounts](#development-accounts)
3. [Using the app](#using-the-app)
4. [Commands](#commands)
5. [Configuration](#configuration)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

**Understand it**

8. [Project structure](#project-structure)
9. [Architecture notes](#architecture-notes)
10. [Security controls](#security-controls)
11. [What was built](#what-was-built)
12. [Known limitations](#known-limitations)
13. [Documentation](#documentation)

---

## Getting started

### Requirements

| | Version | Check with |
|---|---|---|
| **Node.js** | 20 or later (built and verified on 24) | `node --version` |
| **npm** | 9 or later | `npm --version` |

You do **not** need to install PostgreSQL: `npm run db:local` runs a
PostgreSQL 16 server that ships with the project. Docker is optional (see
[below](#using-docker-for-the-database)). Allow about 400 MB of disk space.

Run every command from the **project root**, in **one** terminal. They work in
PowerShell, Command Prompt, Git Bash, macOS and Linux.

### First run

```bash
# 1. Install backend and frontend together (npm workspace — always from the root)
npm install

# 2. Create the settings file. The defaults work as-is (database on port 5433)
copy backend\.env.example backend\.env      # PowerShell / Command Prompt
cp backend/.env.example backend/.env        # Git Bash / macOS / Linux

# 3. Start the database. Wait for "PostgreSQL is running on port 5433"
npm run db:local

# 4. Create the tables and load the sample data
npm run migrate
npm run seed

# 5. Start the app. Wait for "FoodFlow API listening" and "Local: http://localhost:5173/"
npm run dev
```

Open **<http://localhost:5173>**, click **Sign in**, and use one of the account
buttons under the form or any [development account](#development-accounts).

The first `db:local` takes a minute or two to set the database up; after that
it starts in seconds and keeps running in the background.

### Every day after that

```bash
npm run db:local
npm run dev
```

Leave that terminal open while you use the app. Closing it stops the app.

### Stopping

1. Press **Ctrl + C** in the terminal running `npm run dev`.
2. Run `npm run db:local:stop`.

### Using Docker for the database

If you have Docker, run `npm run db:up` instead of `npm run db:local`. That
starts PostgreSQL 16 on port **5432**, so change the port in `backend/.env` from
5433 to **5432**. Stop it with `npm run db:down`.

### Is it working?

Open <http://localhost:4000/api/health>. It should say
`"status":"ok","database":"up"`. If it does not, see
[Troubleshooting](#troubleshooting).

---

## Development accounts

Created by `npm run seed`. These are development placeholders only and must
never be used outside a local database. FoodFlow sends no email, so nothing is
ever delivered to these addresses.

| Role | Email | Password |
|---|---|---|
| Admin | `sayed.hanafy@foodflow.com` | `Admin123!seed` |
| Customer | `sara.idris@gmail.com` | `Passw0rd!seed` |
| Customer (no orders yet) | `nora.fresh@gmail.com` | `Passw0rd!seed` |
| Restaurant owner | `olive.grill@foodflow.com` | `Passw0rd!seed` |
| Owner awaiting approval | `new.spice@foodflow.com` | `Passw0rd!seed` |
| Driver | `driver@foodflow.com` | `Passw0rd!seed` |
| Driver awaiting approval | `driver.pending@foodflow.com` | `Passw0rd!seed` |

Passwords come from `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD` in
`backend/.env`.

**Sample data.** The seed creates:

* 6 restaurants in a range of states: active, pending, suspended, closed today
  and paused;
* menus for the restaurants that can take orders;
* 7 orders across the lifecycle, including one delivered order with a review
  and one without, so every screen has something to show;
* a year of order history (89 past orders, 75 of them delivered, 61 reviews
  in all), so the admin dashboard, ratings and leaderboards have real numbers;
* 30 customers and 5 admins, enough for the admin lists to page. Every
  customer has a saved home address, so an admin can place an order for any
  of them, except `nora.fresh@gmail.com`, who is kept empty (no addresses, no
  orders) to show the empty states;
* 96 showcase restaurants (nine cuisines, a six-dish menu each, owner
  named after the restaurant, e.g. `cedar.house@foodflow.com`).

That makes **100 restaurants across 9 pages**, so browsing, filtering and
pagination all have real data to work on. Ratings come only from reviews of
delivered orders, so a restaurant with no delivered history stays unrated.
Source: `backend/seeds/data/showcase-restaurants.js`.

### A five-minute tour

1. Sign in as `sara.idris@gmail.com`, add items from **Olive Grill**, and
   check out.
2. In a private window, sign in as `olive.grill@foodflow.com`. The order is in the
   incoming queue. Accept it, start preparing, then mark it ready.
3. Sign in as `sayed.hanafy@foodflow.com`, go to **Drivers**, and approve
   `driver.pending@foodflow.com`.
4. Sign in as a driver, go online, accept the offer, pick up the order and
   deliver it.
5. Back as the customer, the tracking view reaches **Delivered** and invites a
   review.

---

## Using the app

* **Landing page.** Visitors land on `/`. Anyone can browse restaurants and
  menus; placing an order needs an account. Once a customer signs in, `/`
  becomes their ordering home.
* **Light and dark theme.** Use the moon/sun button in the header. Your choice
  is remembered; on the first visit the app follows your system setting.
* **English and Arabic.** Use the language button in the header (it reads
  **العربية** in English and **English** in Arabic). Arabic switches the whole
  layout to right-to-left. Your choice is remembered.
* **Navigation.** Every signed-in role (customer, restaurant, driver, admin)
  moves around from a sidebar; the header keeps only the name, language,
  theme and sign-out. A customer's sidebar holds Home, Restaurants, My orders,
  Cart (with the item count), Profile, Addresses and My reviews, and the
  restaurant pages open inside it too. A sidebar item stays highlighted on the
  pages under it (an order, Add a restaurant, checkout). Visitors who are not
  signed in get a plain header instead.
* **Lists.** Admin lists share one filter row: a search that starts from the
  first character, and a status dropdown showing how many rows each choice
  holds, for example `Active (12)`. The page title shows the current total.
  Statuses are coloured (active green, awaiting approval amber, suspended red,
  rejected grey), ratings are shown as stars, and a row's name opens a details
  popup.
* **Forms on their own page.** Add a customer, admin, driver or restaurant,
  New / Edit category and Add an address each open a page of their own and
  return to the list when saved. Add an address returns to checkout when it
  was opened from there.
* **Make an order.** An admin can place an order for an existing customer from
  **Orders → Make an order**: search the customer, pick one of their saved
  addresses, search a restaurant that is taking orders, choose the dishes,
  place it. It is cash on delivery, the customer's own cart is left alone, and
  the server prices it exactly as at checkout. **Add a customer** can save a
  first delivery address for this.
* **Phones and tablets.** Below 768px the sidebar moves into a menu drawer.
  Below 1024px, admin tables turn into cards. On
  a phone every control is at least 44px tall. The layout was checked from
  320px to 1920px wide, in both themes and both languages.

---

## Commands

Run all of these from the project root.

| Command | What it does |
|---|---|
| `npm run dev` | Backend (`:4000`) and frontend (`:5173`) together |
| `npm run dev:backend` / `npm run dev:frontend` | One at a time |
| `npm start` | Backend in production mode |
| `npm run build` | Production frontend bundle into `frontend/dist` |
| `npm run db:local` / `:status` / `:stop` | Bundled PostgreSQL (port 5433) |
| `npm run db:up` / `npm run db:down` | PostgreSQL in Docker (port 5432) |
| `npm run migrate` | Apply migrations to `DATABASE_URL` |
| `npm run migrate:test` | Apply migrations to `TEST_DATABASE_URL` |
| `npm run seed` | Reset the database to the sample data (**destructive**) |
| `npm run routes` | Print every mounted route with its middleware chain |
| `npm run lint` / `npm run lint:fix` | ESLint across both workspaces |
| `npm test` | Backend + frontend unit and integration suites |
| `npm run test:e2e` | 14 Playwright browser scenarios |
| `npm run test:all` | Everything |
| `npm run test:coverage` | Coverage for both workspaces |

---

## Configuration

Settings live in `backend/.env`, copied from `backend/.env.example`. Nothing in
the example is a real secret. **Never commit a real `.env`.**

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | HTTP port |
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string |
| `TEST_DATABASE_URL` | — | Required for integration tests. **Must end in `_test`** |
| `JWT_SECRET` | — | **Required, ≥ 32 characters.** Startup fails otherwise |
| `JWT_ACCESS_TTL` | `15m` | Access-token lifetime |
| `JWT_REFRESH_TTL_DAYS` | `30` | Refresh-token family lifetime |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `foodflow` / `foodflow-app` | Both verified on every request |
| `BCRYPT_ROUNDS` | `12` | Lowered to 10 in test environments for speed |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allow-list. `*` is **rejected** when `NODE_ENV=production` |
| `TAX_RATE` | `0.14` | Applied to the item subtotal |
| `PLATFORM_TIMEZONE` | `Africa/Cairo` | Opening hours are evaluated in this zone |
| `ORDER_ACCEPT_TIMEOUT_MINUTES` | `10` | Auto-cancel window for unconfirmed orders |
| `DELIVERY_OFFER_TTL_SECONDS` | `90` | How long a driver offer stays live |
| `UNASSIGNED_ESCALATION_MINUTES` | `15` | When an undispatched order is escalated to admins |
| `RUN_JOBS` | `true` | `false` serves traffic but runs no background jobs |
| `JOB_INTERVAL_SCALE` | `1` | Scales every job interval. Only lowered for end-to-end runs |
| `RATE_LIMIT_MULTIPLIER` | `1` | Scales every rate-limit bucket. Only raised for end-to-end runs |
| `LOG_LEVEL` | `info` | pino level |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD` | see `.env.example` | Development seed credentials only |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Frontend variables live in `frontend/.env.example`: `VITE_API_URL` (default
`/api`), `VITE_POLL_INTERVAL_MS`, `VITE_OFFER_POLL_INTERVAL_MS`.

---

## Testing

```bash
npm run db:local        # or npm run db:up
npm run migrate:test
npm test                # 640 backend + 44 frontend
npm run test:e2e        # 14 browser scenarios
```

There are three layers, and each proves something the others cannot.

| Layer | Count | Runs against |
|---|--:|---|
| Backend unit | 368 | Pure functions: state machine, money, orderability |
| Backend integration | 272 | **Real PostgreSQL**, through the HTTP layer |
| Frontend unit + component | 44 | jsdom, Vue Test Utils |
| End-to-end | 14 scenarios | A real browser against the running stack |

The exhaustive state-machine sweep alone is 281 cases. It covers every one of
the 245 (status, target, actor) combinations, and 229 of them are refusals.

### End-to-end tests

The first `npm run test:e2e` downloads a Chromium build. The suite then starts
its own backend (`:4100`) and frontend (`:5174`) against a **separate
`foodflow_e2e` database**, so it never touches your development data.

It runs serially on purpose. Driver dispatch is a global background process,
so in a parallel run one worker's driver would claim the offer another test is
waiting for.

```bash
npm run test:e2e                      # all 14
npm run test:e2e -- tc-393            # one scenario
npm run test:e2e -- --headed          # watch it
npm run test:e2e -w frontend -- --ui  # Playwright's UI mode
```

### Your data is protected

Two independent safeguards:

1. [`backend/tests/setup.js`](backend/tests/setup.js) aborts the whole run
   unless `NODE_ENV=test` **and** the resolved database name ends in `_test`.
2. Tests never read `DATABASE_URL`; they read `TEST_DATABASE_URL` only.

The full strategy, the 424-row traceability matrix and every test case are in
[`docs/testing/`](docs/testing/README.md).

---

## Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| **Request failed** on the sign-in page | The backend is not running, almost always because the database is down | Run `npm run db:local`, then stop and re-run `npm run dev` |
| `Cannot reach the database` | The database stopped, or `DATABASE_URL` uses the wrong port | Run `npm run db:local:status`. The bundled server uses **5433**, Docker uses **5432** |
| `JWT_SECRET must be at least 32 characters` | `backend/.env` is missing or the secret was shortened | Copy `backend/.env.example` again |
| `npm run dev` starts the frontend but not the backend | The backend printed an error and is waiting for a file change | Scroll up to read it. It is almost always the database |
| `Port 5173 is in use` or `EADDRINUSE :4000` | `npm run dev` is already running in another terminal | Close the other terminal, or change `PORT` in `backend/.env` |
| Accounts do not work or data looks wrong | The data was changed while experimenting | `npm run seed` truncates every table and reloads the sample data |
| Integration tests refuse to run | By design: they need `NODE_ENV=test` and a `TEST_DATABASE_URL` ending in `_test` | Set both, then run `npm run migrate:test` |
| `npm run test:e2e` fails on the first run | The Chromium download was blocked | Run `npx playwright install chromium` from `frontend/` |

---

## Project structure

```
9012 Delivery/
├── backend/
│   ├── migrations/            9 Knex migrations (additive; never edited in place)
│   ├── seeds/                 development fixtures
│   ├── scripts/               route audit, PostgreSQL launcher, e2e helpers
│   ├── src/
│   │   ├── config/            env parsing and validation — fails fast at boot
│   │   ├── middleware/        authenticate, authorize, validate, rate limit, errors
│   │   ├── modules/           the domain modules (below)
│   │   ├── jobs/              scheduled jobs, guarded by advisory locks
│   │   ├── shared/            money, errors, db, http helpers — no domain logic
│   │   ├── routes.js          mounts every module router
│   │   ├── app.js             Express app (exported for tests)
│   │   └── server.js          process entry point
│   └── tests/{unit,integration}/
├── frontend/
│   ├── e2e/                   14 Playwright scenarios + helpers
│   └── src/
│       ├── views/             40 route-level views, split by role
│       ├── components/        33 shared and role-specific components
│       ├── stores/            Pinia: auth, cart, ui
│       ├── services/          axios client with single-flight refresh
│       ├── composables/       polling, validation, add-to-cart, focus trap
│       └── router/            routes with role guards
└── docs/
    ├── AS-BUILT.md            where the build diverged from the plan, and why
    ├── VERIFICATION.md        what was built, what was run, what is missing
    ├── sdd/                   design document: 10 specs, 10 stories, ADRs
    └── testing/               strategy, plan, 424-row matrix, 424 test cases
```

### Domain modules

`auth` · `users` · `restaurants` · `menu` · `discovery` · `cart` · `orders` ·
`delivery` · `reviews` · `admin`

A module may only reach another module through that module's `index.js`. An
ESLint boundary rule enforces this, so a shortcut import fails the lint build
instead of slowly eroding the architecture. Inside a module the flow is
strictly one-directional: **route → controller → service → repository**.

---

## Architecture notes

The decisions most likely to surprise a first-time reader. Each is argued in
full in [`docs/sdd/architecture/`](docs/sdd/architecture/).

* **PostgreSQL is required, not a preference.** Core business rules are
  enforced *by the database*. Partial unique indexes allow one active cart per
  customer, one active delivery per driver, one default address per customer
  and one review per order. Check constraints enforce rules such as "an order
  cannot be cancelled without recording who cancelled it". SQLite, MySQL and
  in-memory fakes cannot express these, so the tests also run against real
  PostgreSQL: a fake would pass while the real rule was broken.
* **The database arbitrates concurrency.** Partial unique indexes plus
  `SELECT … FOR UPDATE` row locks, never check-then-act. Concurrent requests
  queue up instead of interleaving.
* **Orders are immutable snapshots.** `order_items` copies the name,
  description and unit price as they were at checkout. A later menu edit or
  deletion cannot change what a customer was charged.
* **Carts hold live prices.** A cart stores item id and quantity only. The one
  exception, `price_seen_at_add`, exists solely so checkout can raise
  `PRICE_CHANGED` instead of silently charging more.
* **Money is `NUMERIC(10,2)` in PostgreSQL and BigInt minor units in
  JavaScript** ([`shared/money.js`](backend/src/shared/money.js)). No float
  ever touches a price.
* **Order status is a table, not a set of `if`s.**
  [`orderStateMachine.js`](backend/src/modules/orders/orderStateMachine.js) is
  pure and dependency-free: 7 statuses, 10 legal edges, 16 actor-qualified
  transitions.
* **404 over 403 for other people's rows.** The wrong *role* gets 403. A caller
  with the right role who asks for someone else's resource gets 404, so the API
  never confirms that an id exists.
* **Background jobs are in-process** and wrapped in `pg_try_advisory_lock`, so
  running several instances is safe without a queue.

---

## Security controls

Implemented, not merely tested.

| Control | How |
|---|---|
| SQL injection | Knex parameter binding throughout; `LIKE` terms escaped |
| Mass assignment | Zod strips unknown keys; controllers read `req.validated`, never `req.body` |
| IDOR | Ownership re-checked in the service layer; no client-supplied id is trusted |
| Price tampering | The client sends no prices; totals are recomputed server-side at checkout |
| JWT | HS256 pinned, `iss`/`aud` verified, 15-minute access tokens, single-use rotating refresh tokens with family-wide revocation on reuse |
| Passwords | bcrypt cost 12; hashes never leave the repository layer |
| XSS | Vue escapes interpolation; no `v-html`, `innerHTML` or `document.write` anywhere, enforced by a test |
| CORS | Explicit allow-list; `*` rejected under `NODE_ENV=production` |
| Rate limiting | A global bucket plus tighter per-route buckets on auth, refresh, checkout and reviews |
| PII | A driver sees a district and distance on an offer; the full address only after accepting |

Passing tests show that these controls behave as specified. They do **not**
show that the application is fully secure. No penetration test has been
performed, and an independent review is recommended before any real
deployment.

---

## What was built

The project was delivered in four stages, each documented.

1. **Design** (`docs/sdd/`, 33 files). 10 specs and 10 stories, numbered
   independently (`spec-01` is not `story-01`), plus 7 architecture documents
   with ADRs, an implementation plan, a dependency map, assumptions and risks.
2. **Test design** (`docs/testing/`, 25 files). 424 test cases traced through a
   424-row matrix: **Spec → Story → Acceptance Criterion → Test Case**.
   Test-case IDs are numbered independently of specs and stories, so the
   matrix is the only reliable way to trace between them. Six documentation
   discrepancies were found and recorded rather than silently fixed. All six
   are now resolved in the SDD.
3. **Implementation.** 100 REST endpoints, 17 domain tables and 40 route-level
   views, all wired to a real database. 640 backend and 44 frontend tests.
4. **End-to-end verification.** All 14 browser scenarios are implemented and
   passed in three consecutive runs.

### Defects found by the end-to-end tests

Writing the browser scenarios surfaced nine real defects that the 610 earlier
tests had missed. Those tests' fixtures created data in states the product
itself could never reach.

| # | Defect | Why it mattered |
|--:|---|---|
| 1 | **A new restaurant could never be approved** | Menu routes required an ACTIVE restaurant, but approval requires ≥1 available item. A genuine deadlock, and a contradiction between two SDD rules. |
| 2 | **A suspended restaurant stranded its in-flight orders** | The admin's own dialog promises "orders already in progress will still complete"; the owner could not advance them. The existing test had been bent to match the bug. |
| 3 | **Cart badge never loaded on public pages** | A signed-in customer reloading the menu — where you add items — saw an empty badge. |
| 4 | **Cart store applied out-of-order responses** | Two quick taps on different Add buttons silently dropped an item the server already had. |
| 5 | **Order-number collision crashed checkout** | Six random characters under a unique index with no retry: a 500 for a blameless customer. |
| 6 | **Primary buttons failed colour contrast** | White on `#ea580c` is 3.55:1; AA needs 4.5:1. |
| 7 | **Header overflowed small phones by 122px** | The page slid sideways under the thumb. |
| 8 | **Neither modal trapped focus** | Keyboard users tabbed out of an open dialog onto the obscured page behind it. |
| 9 | **Unavailable item cards dimmed their own explanation** | `opacity-70` pushed the sentence explaining the problem below the contrast floor. |

A unit test also asserted that 10,000 random order numbers are all distinct.
By the birthday bound, that assertion was false about 4.5% of the time. It was
replaced with an entropy assertion plus a real collision-retry test.

Full detail: [`docs/VERIFICATION.md`](docs/VERIFICATION.md) and
[`docs/AS-BUILT.md`](docs/AS-BUILT.md).

---

## Known limitations

Deliberate scope boundaries, documented rather than hidden.

* **No payment gateway.** `payment_method` is recorded, and `CASH_ON_DELIVERY`
  is the only payment path that settles.
* **Order updates are polled, not pushed.** Polling backs off and pauses when
  the tab is hidden. WebSockets are the obvious next step.
* **Driver dispatch uses straight-line distance** over stored coordinates.
  There is no routing engine and no live GPS tracking.
* **Background jobs run in-process.** That is correct for one deployment and
  safe across several thanks to advisory locks, but a dedicated queue would
  scale better.
* **Notifications are persisted rows only.** No email or push transport.
* **Images are URLs.** No upload pipeline or object storage.
* **Rate limiting uses an in-memory store**, so limits are per replica.
* **End-to-end tests run on Chromium only.** Firefox and WebKit have not been
  run. The accessibility bar is "no serious or critical axe violations".
  Moderate and minor findings are not checked, and the README does not claim
  there are none.
* **No load, soak or penetration testing** has been performed.

---

## Documentation

| | |
|---|---|
| [`docs/sdd/README.md`](docs/sdd/README.md) | Design document index — start here |
| [`docs/sdd/master-sdd.md`](docs/sdd/master-sdd.md) | The consolidated, normative design document |
| [`docs/sdd/architecture/`](docs/sdd/architecture/) | Architecture, data model, API, auth, errors, ADRs |
| [`docs/sdd/specs/`](docs/sdd/specs/) | `spec-01` … `spec-10` |
| [`docs/sdd/stories/`](docs/sdd/stories/) | `story-01` … `story-10` |
| [`docs/testing/README.md`](docs/testing/README.md) | Testing index |
| [`docs/testing/test-matrix.md`](docs/testing/test-matrix.md) | Spec → Story → Acceptance Criterion → Test Case |
| [`docs/testing/e2e-scenarios.md`](docs/testing/e2e-scenarios.md) | The 14 browser scenarios, in prose |
| [`docs/AS-BUILT.md`](docs/AS-BUILT.md) | Where the build diverged from the plan, and why |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | Final verification report |
