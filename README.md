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
| API | REST, 91 endpoints under `/api`, all documented |
| Tests | 615 backend · 43 frontend · 14 end-to-end browser scenarios |

---

## Table of contents

1. [Requirements](#requirements)
2. [Start the project](#start-the-project)
3. [Configuration](#configuration)
4. [Everyday commands](#everyday-commands)
5. [Testing](#testing)
6. [Development accounts](#development-accounts)
7. [Project structure](#project-structure)
8. [Architecture notes](#architecture-notes)
9. [Security controls](#security-controls)
10. [What was built](#what-was-built)
11. [Documentation](#documentation)
12. [Troubleshooting](#troubleshooting)
13. [Known limitations](#known-limitations)

---

## Requirements

### Required

| | Version | Check with | Notes |
|---|---|---|---|
| **Node.js** | **20 or later** | `node --version` | The code uses top-level `await` and native ES modules. Built and verified on Node 24. |
| **npm** | 9 or later | `npm --version` | Ships with Node. The repo is an npm **workspace**, so always install from the root. |
| **PostgreSQL** | **16 or later** | `psql --version` | Not optional and not substitutable — see below. Two ways to get one are in [Start the project](#start-the-project). |

### Optional

| | Why you might want it |
|---|---|
| **Docker + Docker Compose** | The easiest way to get PostgreSQL. Without it, the project ships its own PostgreSQL binaries instead. |
| **Git** | To clone the repository. |
| **~400 MB disk** | `node_modules` plus, if you use the Docker-less database, the PostgreSQL binaries and data directory. |

### Why PostgreSQL specifically

This is not a preference. Core business rules are enforced *by the database*,
not by application code:

* **partial unique indexes** — one active cart per customer, one active
  delivery per driver, one default address per customer, one review per order;
* **`SELECT … FOR UPDATE`** row locks, so concurrent requests serialise rather
  than interleave;
* **check constraints** — for example, an order cannot be cancelled without
  recording who cancelled it;
* **`NUMERIC(10,2)`** for money, so no float ever touches a price.

SQLite, MySQL and in-memory fakes cannot express these. The test suites run
against real PostgreSQL for the same reason: a fake would return whatever the
test author expected and pass while the real invariant was broken.

---

## Start the project

Every command below is run from the **project root** (the folder that contains
this README), in **one** terminal. They work the same in PowerShell, Command
Prompt, Git Bash, macOS and Linux.

### First time only

Do these once, in order. Each step has to finish before the next one.

**Step 1 — Install the dependencies**

```bash
npm install
```

Installs the backend and the frontend together. Takes a minute or two.

**Step 2 — Create the settings file**

Copy `backend/.env.example` to `backend/.env`:

```bash
# PowerShell or Command Prompt
copy backend\.env.example backend\.env

# Git Bash, macOS or Linux
cp backend/.env.example backend/.env
```

The defaults are ready to use with the database from the next step (port
**5433**). Nothing in this file is a real secret, and it is never committed.

**Step 3 — Start the database**

```bash
npm run db:local
```

Wait for `PostgreSQL is running on port 5433`. The very first run sets the
database up and takes a minute or two; after that it starts in seconds.
It keeps running in the background after the command finishes.

**Step 4 — Create the tables and the sample data**

```bash
npm run migrate
npm run seed
```

`seed` creates the sample restaurants, menus, orders and the
[development accounts](#development-accounts).

**Step 5 — Start the app**

```bash
npm run dev
```

Wait until you see both `FoodFlow API listening` and `Local: http://localhost:5173/`.

**Step 6 — Open it**

Go to **<http://localhost:5173>**. The landing page opens. Click
**Sign in** and use one of the account buttons under the form, or any account
from [Development accounts](#development-accounts).

### Every day after that

Two commands:

```bash
npm run db:local
npm run dev
```

Then open **<http://localhost:5173>**. Leave that terminal open while you use
the app — closing it stops the app.

### Stopping

1. In the terminal running `npm run dev`, press **Ctrl + C**.
2. Stop the database:

   ```bash
   npm run db:local:stop
   ```

### If something goes wrong

| What you see | Why | Fix |
|---|---|---|
| **Request failed** on the sign-in page | The backend is not running, almost always because the database is down | Run `npm run db:local`, then stop and re-run `npm run dev` |
| `Port 5173 is in use` or `EADDRINUSE :4000` | `npm run dev` is already running in another terminal | Close the other terminal. Run `npm run dev` **once** only |
| `Cannot reach the database` | Database stopped, or `backend/.env` points at the wrong port | `npm run db:local:status`; check `.env` says **5433** |
| `JWT_SECRET must be at least 32 characters` | `backend/.env` is missing | Repeat Step 2 |
| Accounts do not work / data looks wrong | Old data | `npm run seed` resets everything to the sample data |

To check the backend directly: open <http://localhost:4000/api/health>. It
should say `"status":"ok","database":"up"`.

### Using Docker for the database instead

If you have Docker, you can replace Step 3 with `npm run db:up` (PostgreSQL 16
on port **5432**). In that case `backend/.env` must use port **5432** instead
of 5433, and you stop the database with `npm run db:down`.

### Using the app

* **Light and dark theme** — the moon/sun button in the header. The choice is
  remembered; on the first visit the app follows your system setting.
* **English and Arabic** — the language button in the header (it reads
  **العربية** in English and **English** in Arabic). Arabic switches the whole
  layout to right-to-left. The choice is remembered.
* **Phones and tablets** — below 768px the header collapses into a menu
  drawer (the cart stays in the bar), admin tables turn into cards below
  1024px, and every control on a phone is at least 44px tall. Checked from
  320px to 1920px wide, in both themes and both languages.
* **Landing page** — visitors land on `/`. Browsing restaurants and menus is
  open to everyone; placing an order needs an account. Once signed in, a
  customer's `/` becomes their ordering home.

---

## Configuration

Copy `backend/.env.example` to `backend/.env` and edit. **Never commit a real
`.env`.**

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | HTTP port |
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string |
| `TEST_DATABASE_URL` | — | Required to run integration tests. **Must end in `_test`** |
| `JWT_SECRET` | — | **Required, ≥ 32 characters.** Startup fails otherwise |
| `JWT_ACCESS_TTL` | `15m` | Access-token lifetime |
| `JWT_REFRESH_TTL_DAYS` | `30` | Refresh-token family lifetime |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `foodflow` / `foodflow-app` | Both verified on every request |
| `BCRYPT_ROUNDS` | `12` | Lowered to 10 in test environments for speed |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allow-list. `*` is **rejected** when `NODE_ENV=production` |
| `TAX_RATE` | `0.15` | Applied to the item subtotal |
| `PLATFORM_TIMEZONE` | `Asia/Riyadh` | Opening hours are evaluated in this zone |
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

## Everyday commands

Run all of these from the repository root.

| Command | What it does |
|---|---|
| `npm run dev` | Backend (`:4000`) and frontend (`:5173`) together |
| `npm run dev:backend` / `npm run dev:frontend` | One at a time |
| `npm start` | Backend in production mode |
| `npm run build` | Production frontend bundle into `frontend/dist` |
| `npm run db:up` / `npm run db:down` | PostgreSQL in Docker |
| `npm run db:local` / `:status` / `:stop` | PostgreSQL without Docker |
| `npm run migrate` | Apply migrations to `DATABASE_URL` |
| `npm run migrate:test` | Apply migrations to `TEST_DATABASE_URL` |
| `npm run seed` | Load development fixtures (**destructive**) |
| `npm run routes` | Print every mounted route with its middleware chain |
| `npm run lint` / `npm run lint:fix` | ESLint across both workspaces |
| `npm test` | Backend + frontend unit and integration suites |
| `npm run test:e2e` | 14 Playwright browser scenarios |
| `npm run test:all` | Everything |
| `npm run test:coverage` | Coverage for both workspaces |

---

## Testing

Three layers, each proving something the others cannot.

```bash
npm run db:local        # or npm run db:up
npm run migrate:test
npm test                # 615 backend + 43 frontend
npm run test:e2e        # 14 browser scenarios
```

| Layer | Count | Runs against |
|---|--:|---|
| Backend unit | 368 | Pure functions — state machine, money, orderability |
| Backend integration | 247 | **Real PostgreSQL**, through the HTTP layer |
| Frontend unit + component | 43 | jsdom, Vue Test Utils |
| End-to-end | 14 scenarios | A real browser against the running stack |

The exhaustive state-machine sweep alone is 281 cases: every one of the 245
(status, target, actor) combinations, of which 229 are refusals.

### End-to-end tests

The first `npm run test:e2e` downloads a Chromium build. The suite then starts
its own backend (`:4100`) and frontend (`:5174`) against a **separate
`foodflow_e2e` database**, so it never touches your development data. It runs
serially on purpose: driver dispatch is a global background process, so a
parallel worker's driver would claim the offer another test is waiting for.

```bash
npm run test:e2e                      # all 14
npm run test:e2e -- tc-393            # one scenario
npm run test:e2e -- --headed          # watch it
npm run test:e2e -w frontend -- --ui  # Playwright's UI mode
```

### Your data is protected

Two independent rails:

1. [`backend/tests/setup.js`](backend/tests/setup.js) aborts the whole run
   unless `NODE_ENV=test` **and** the resolved database name ends in `_test`.
2. Tests never read `DATABASE_URL`; they read `TEST_DATABASE_URL` only.

Full strategy, the 424-row traceability matrix and every test case are in
[`docs/testing/`](docs/testing/README.md).

---

## Development accounts

Created by `npm run seed`. These are **development placeholders**, resolved
from `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD`. The domains `@example.com`
and `.test` are reserved by RFC 2606 and cannot receive mail. They are not real
credentials and must never be used outside a local database.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@foodflow.test` | `Admin123!seed` |
| Customer | `customer@example.com` | `Passw0rd!seed` |
| Customer (no orders yet) | `customer.new@example.com` | `Passw0rd!seed` |
| Restaurant owner | `owner@example.com` | `Passw0rd!seed` |
| Owner awaiting approval | `owner.pending@example.com` | `Passw0rd!seed` |
| Driver | `driver@example.com` | `Passw0rd!seed` |
| Driver awaiting approval | `driver.pending@example.com` | `Passw0rd!seed` |

The seed also creates 6 restaurants across a range of states (active, pending,
suspended, closed-today, paused), menus for the orderable ones, and 7 orders
spanning the lifecycle — including a delivered order that has been reviewed and
one that has not, so every screen has something to show.

On top of those it adds **96 showcase restaurants** (nine cuisines, each with a
six-dish menu and its own owner account, `owner.<slug>@example.com`), so the
listing holds **100 restaurants across 9 pages** and browsing, filtering and
pagination have real work to do. They are unrated on purpose: a rating comes
from reviews of delivered orders, and the seed does not invent those. The data
is generated from `backend/seeds/data/showcase-restaurants.js`.

### A tour in five minutes

1. Sign in as `customer@example.com`, add items from **Olive Grill**, and
   check out.
2. Sign in as `owner@example.com` in a private window — the order is in the
   incoming queue. Accept it, start preparing, mark it ready.
3. Sign in as `admin@foodflow.test`, go to **Drivers**, and approve
   `driver.pending@example.com`.
4. Sign in as a driver, go online, accept the offer, pick up, deliver.
5. Back as the customer: the tracking view reaches **Delivered** and invites a
   review.

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
│       ├── views/             32 route-level views, split by role
│       ├── components/        15 shared and role-specific components
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

A module may only reach another through that module's `index.js`, enforced by
an ESLint boundary rule — a shortcut import fails the lint build rather than
quietly eroding the architecture. Inside a module the flow is strictly
one-directional: **route → controller → service → repository**.

---

## Architecture notes

The decisions most likely to surprise a first-time reader. Each is argued in
full in [`docs/sdd/architecture/`](docs/sdd/architecture/).

* **Orders are immutable snapshots.** `order_items` copies the name,
  description and unit price as they were at checkout. A later menu edit or
  deletion cannot rewrite what a customer was charged.
* **Carts hold live prices.** A cart stores item id and quantity only. The one
  exception, `price_seen_at_add`, exists solely so checkout can raise
  `PRICE_CHANGED` instead of silently charging more.
* **The database arbitrates concurrency.** Partial unique indexes plus
  `SELECT … FOR UPDATE`, never check-then-act.
* **Money is `NUMERIC(10,2)` in PostgreSQL and BigInt minor units in
  JavaScript** ([`shared/money.js`](backend/src/shared/money.js)).
* **Order status is a table, not a set of `if`s.**
  [`orderStateMachine.js`](backend/src/modules/orders/orderStateMachine.js) is
  pure and dependency-free: 7 statuses, 10 legal edges, 16 actor-qualified
  transitions.
* **404 over 403 for other people's rows.** Wrong *role* gives 403; a
  correctly-roled caller asking for someone else's resource gets 404, so the
  API never confirms that an id exists.
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

Passing tests show these controls behave as specified. They are **not** a claim
that the application is comprehensively secure: no penetration test has been
performed, and an independent review is recommended before any real deployment.

---

## What was built

The project was delivered in four stages, each documented.

### 1. Design (`docs/sdd/`, 33 files)

10 specs and 10 stories — numbered independently, so `spec-01` is not
`story-01` — plus 7 architecture documents with ADRs, an implementation plan, a
dependency map, assumptions and risks.

### 2. Test design (`docs/testing/`, 25 files)

424 test cases traced through a 424-row matrix:
**Spec → Story → Acceptance Criterion → Test Case**. Test-case IDs are
independent of spec and story numbering, so the matrix is the only correct way
to trace between them. Six documentation discrepancies were found and recorded
rather than silently fixed; all six are now resolved in the SDD.

### 3. Implementation

91 REST endpoints, 17 domain tables, 32 route-level views, all wired to a real
database. 615 backend and 43 frontend tests.

### 4. End-to-end verification

All 14 browser scenarios implemented and passing across three consecutive runs.
Writing them surfaced nine real defects that the 610 existing tests had missed,
because every fixture created data in states the product itself could not reach:

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

A unit test asserting that 10,000 random order numbers are all distinct was
also **false about 4.5% of the time** by the birthday bound. It was replaced
with an entropy assertion plus a real collision-retry test.

Full detail: [`docs/VERIFICATION.md`](docs/VERIFICATION.md) and
[`docs/AS-BUILT.md`](docs/AS-BUILT.md).

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

---

## Troubleshooting

**`Cannot reach the database. Check DATABASE_URL and that PostgreSQL is running.`**
The database is down or `.env` points at the wrong port. Run
`npm run db:local:status`. Docker uses **5432**, the bundled server uses
**5433** — `DATABASE_URL` must match.

**`JWT_SECRET must be at least 32 characters`**
You have no `backend/.env`, or you shortened the secret. Copy
`backend/.env.example` again.

**`npm run dev` starts the frontend but not the backend**
Scroll up: the backend prints why and then waits for a file change. It is
almost always the database.

**Port 4000 or 5173 already in use**
A previous run is still going. Close it, or change `PORT` in `backend/.env`.

**Integration tests refuse to run**
By design. They need `NODE_ENV=test` and a `TEST_DATABASE_URL` whose database
name ends in `_test`. Run `npm run migrate:test` first.

**`npm run test:e2e` fails on the first run**
It downloads Chromium the first time. If that was blocked, run
`npx playwright install chromium` from `frontend/`.

**Seeded data looks wrong after experimenting**
`npm run seed` resets it. It truncates every table first.

---

## Known limitations

Deliberate scope boundaries, documented rather than hidden.

* **No payment gateway.** `payment_method` is recorded and `CASH_ON_DELIVERY`
  is the only settled path.
* **Order updates are polled, not pushed.** Polling backs off and pauses when
  the tab is hidden. WebSockets are the obvious next step.
* **Driver dispatch uses straight-line distance** over stored coordinates.
  There is no routing engine and no live GPS tracking.
* **Background jobs run in-process.** Correct for one deployment and safe
  across several thanks to advisory locks, but a dedicated queue would scale
  better.
* **Notifications are persisted rows only.** No email or push transport.
* **Images are URLs.** No upload pipeline or object storage.
* **Rate limiting uses an in-memory store**, so limits are per-replica.
* **End-to-end tests run on Chromium only.** Firefox and WebKit are unrun, and
  the accessibility bar is "no serious or critical" axe violations — moderate
  and minor findings are neither asserted nor claimed absent.
* **No load, soak or penetration testing** has been performed.
