# Assumptions

> Parent: [master-sdd.md](master-sdd.md)

Decisions taken without an explicit requirement. Each records what was assumed,
why, what it costs, and what would make it worth revisiting. Anything here can
be overturned cheaply **except** where the "cost to change later" column says
otherwise.

---

## Commercial and locale

### A-01 — Single currency: SAR
The platform operates in one currency. Amounts are stored as `NUMERIC(10,2)`
with no currency column, and formatted as `SAR 166.10` in the UI.

*Why:* a currency column that is always the same value is noise, and
multi-currency is a pricing and settlement problem, not a formatting one.
*Cost to change later:* **moderate** — a `currency` column on `restaurants` and
`orders`, plus a formatting layer. The money helper already isolates arithmetic.
*Revisit when:* a second country is in scope.

### A-02 — Single timezone: `Asia/Riyadh`
All timestamps are `TIMESTAMPTZ` and stored in UTC, but opening-hours
comparisons and "today's orders" statistics use one fixed platform timezone from
`PLATFORM_TIMEZONE`.

*Why:* opening hours are inherently local, and per-restaurant timezones only
matter once restaurants span them.
*Cost to change later:* **low** — add a `timezone` column to `restaurants` and
resolve it in `orderability.js`, which is already the single place the
comparison happens.

### A-03 — Flat VAT at 15%, configurable
`tax_amount = round(subtotal × TAX_RATE, 2)`, with `TAX_RATE` defaulting to
`0.15`. Tax applies to the subtotal only, not to the delivery fee.

*Why:* a realistic, single-rate tax model exercises the money arithmetic
honestly without pretending to be a tax engine. Excluding the delivery fee is a
simplification, stated here rather than hidden in code.
*Cost to change later:* **low** — `orderPricing.js` is the only computation site,
and historical orders keep their own `tax_amount`.

### A-04 — Cash on delivery only
`payment_method` exists as an enum with one value. No authorization, capture,
refund or settlement.

*Why:* an explicit non-goal ([master-sdd §3](master-sdd.md#3-non-goals)).
Keeping the column means adding a gateway does not require migrating order
history.
*Cost to change later:* **moderate** — a payments module, a refund path on
cancellation, and a payment-state dimension on the order. The order model was
shaped with this in mind.

---

## Domain simplifications

### A-05 — Flat per-restaurant delivery fee
`restaurants.delivery_fee` is a fixed amount, snapshotted onto each order. It is
not distance-based, time-based or surge-priced.

*Why:* distance pricing needs geocoded addresses and a zone model, neither of
which v1 has.
*Cost to change later:* **low** — the fee is already computed server-side in one
place and snapshotted, so the input to that computation can change freely.

### A-06 — Addresses are free text with optional coordinates
No geocoding, no address validation, no map picker. Latitude and longitude are
optional and, when present, are used only to rank drivers by distance.

*Why:* a geocoding provider is an external dependency with a cost, and address
correctness is the customer's responsibility in a cash-on-delivery model.
*Cost:* dispatch ranking degrades to "no location sorts last" for customers and
drivers without coordinates, which is handled explicitly in BR-D3.
*Revisit when:* mis-delivery becomes a real support burden.

### A-07 — Straight-line nearest-driver dispatch
Candidate drivers are ranked by Haversine distance from the restaurant, not by
travel time or route.

*Why:* routing is a research problem and an API bill. Straight-line distance is
a reasonable proxy at city scale.
*Cost to change later:* **low** — `dispatchService.js` ranks candidates in one
function.

### A-08 — One active delivery per driver; no batching
A driver carries one order at a time.

*Why:* multi-order batching requires route optimization and a much more complex
assignment model, and it is an explicit non-goal.
*Cost to change later:* **high** — `uq_assignments_driver_active` would have to
go, and every "the driver's current delivery" assumption in the UI and the state
transitions would need revisiting. This is the assumption most embedded in the
design.

### A-09 — No overnight opening hours
`closes_at` must be later than `opens_at`. A restaurant trading past midnight
sets `closes_at = 23:59`.

*Why:* overnight ranges make the orderability comparison a two-interval problem
and roughly double the test matrix, for a case that affects a minority of
venues.
*Cost:* a one-minute gap at midnight for late-night restaurants — stated plainly
because it is a real, if small, correctness gap.
*Cost to change later:* **low** — one function and its truth table.
*Revisit when:* late-night restaurants are a meaningful share of supply.

### A-10 — Cart quantity capped at 20 per line
An arbitrary but deliberate bound.

*Why:* an unbounded integer invites both fat-finger errors and denial-of-service
by cart size. Twenty units of one dish covers ordinary group ordering.
*Cost to change later:* **trivial** — a constant and a check constraint.

### A-11 — Carts never expire
An `ACTIVE` cart persists indefinitely. Staleness is handled by re-validation on
read rather than by expiry.

*Why:* expiry would silently destroy customer work, and re-validation already
makes a stale cart safe. The `ABANDONED` cart status exists for a future
cleanup job that does not run in v1.
*Cost:* unbounded growth of `carts`/`cart_items` over time — small rows, and the
cleanup path is already modelled.

### A-12 — Order numbers are `FF-YYYYMMDD-XXXXXX`
Six random base-32 characters per day, unique by index with retry on collision.

*Why:* human-readable for support calls, non-sequential so daily volume is not
leaked to competitors, and short enough to read aloud.
*Cost to change later:* **low** — format lives in `orderNumber.js`; existing
numbers remain valid.

---

## Platform and operations

### A-13 — All admins are equal
No tiers, no granular permissions within the `ADMIN` role.

*Why:* a permission system for a role held by a handful of operators is
premature. The audit log provides accountability instead.
*Cost to change later:* **moderate** — a permissions table and a check in
`authorize`. The audit log means past actions remain attributable either way.

### A-14 — Background jobs run in-process
`setInterval` timers guarded by a PostgreSQL advisory lock, rather than a queue
(ADR-003).

*Why:* adding Redis and a worker for four timers contradicts the "runs locally
with two commands" goal.
*Cost:* jobs stop when the API is down; work does not scale across replicas.
Tracked as [risks.md](risks.md) R-06.
*Revisit when:* dispatch latency under load becomes a complaint, or the API runs
as more than a couple of replicas.

### A-15 — Rate limiting is in-memory
Per-process counters, not a shared store.

*Why:* correct for a single replica and dependency-free.
*Cost:* with N replicas the effective limit is N×. Tracked as R-09; the fix is a
Redis store, which `express-rate-limit` supports as a drop-in.

### A-16 — Notifications are logged, not sent
`NotificationService` writes to the `notifications` table and stdout. The
interface is real; only the transport is a stub.

*Why:* an explicit non-goal, and the seam is where a provider plugs in.
*Cost:* restaurants must have the queue screen open to notice a new order, which
is also why the queue polls and signals audibly.

### A-17 — Images are URLs, not uploads
`logo_url`, `cover_image_url` and `image_url` store external URLs validated to
`http(s)`.

*Why:* file upload needs object storage, signed URLs, size and content-type
validation, and a virus-scanning answer.
*Cost to change later:* **low** — the column becomes a storage key and the
validator changes; the field name and shape survive.

### A-18 — No email verification or password reset in v1
Accounts are usable immediately; `email_verified_at` exists but is never set.

*Why:* both require a real email transport, which is a non-goal. The column is
reserved so verification is additive.
*Cost:* **an unverified email cannot be recovered** — a customer who mistypes
their address cannot reset their password. This is the most user-hostile
assumption on this list and should be the first non-goal retired once an email
provider exists.

### A-19 — English only, LTR
All copy is centralized in `src/i18n/en.js` but there is one locale.

*Why:* internationalization is a non-goal; centralizing the copy makes a second
locale additive rather than archaeological.
*Cost to change later:* **low for the copy, moderate for RTL layout.**

### A-20 — Refresh tokens live in `localStorage`
Rather than an `httpOnly` cookie.

*Why:* keeps the SPA deployment simple and avoids CSRF machinery. Mitigated by
short access-token lifetimes, rotation and reuse detection.
*Cost:* weaker XSS posture. Documented as an accepted trade in
[security.md §3](architecture/security.md#3-tokens) and tracked as R-08. **For a
real production launch, move refresh tokens to an `httpOnly; SameSite=Strict;
Secure` cookie** — this is the recommendation, not merely an option.

---

## Scale

### A-21 — Single-city, moderate volume
Design targets are hundreds of restaurants, thousands of customers and
low-thousands of daily orders. Indexes and the NFR-5 benchmark are sized to a
10k-order dataset.

*Why:* it matches the stated scope of a portfolio-grade application, and it is
the honest basis for choosing a monolith, in-process jobs and uncached
statistics.
*Revisit when:* any of those numbers grows by 10×, at which point the first
moves are a queue for dispatch (Future Enhancement 9), a cache or materialized
view for statistics, and read replicas for discovery.
