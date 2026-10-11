# As-built notes

> Parent: [sdd/master-sdd.md](sdd/master-sdd.md) · Companion:
> [VERIFICATION.md](VERIFICATION.md)
> **Last updated:** 2026-09-27

The SDD in [`sdd/`](sdd/) is the design of record and the code follows it. This
document records everything that is true of the **built system** but is not
obvious from the plan: where the implementation diverged, why, and what was
changed in the documentation as a result.

Nothing here was changed silently. Every divergence below is also reflected in
the document it affects.

---

## 1. Divergences from the plan

### 1.1 Express 4, not Express 5

**Planned:** Express 5. **Built:** Express 4.21.

Express 5 was still not the `express@latest` tag for this project's lockfile,
and pulling a release candidate into the dependency tree of an otherwise
conservative stack was not worth the upgrade's one real benefit — automatic
forwarding of rejected promises from async handlers.

That benefit was recovered explicitly instead.
[`shared/http/asyncHandler.js`](../backend/src/shared/http/asyncHandler.js)
provides `asyncHandler(fn)` and `wrapAll(controllerModule)`; every router wraps
its controllers through `wrapAll`, so a rejected promise reaches the error
middleware exactly as it would under Express 5. This is not optional hygiene —
without it a thrown `AppError` escapes as an unhandled rejection and the client
sees a hung request rather than a 409.

Migrating to Express 5 later is a dependency bump plus deleting the wrappers.

**Documentation updated:** the stack line in
[README](sdd/README.md), [master-sdd](sdd/master-sdd.md),
[backend-architecture](sdd/architecture/backend-architecture.md) and
[implementation-plan](sdd/implementation-plan.md).

### 1.2 `assignment_status` gained a `COMPLETED` member

**Planned:** `OFFERED | ACCEPTED | DECLINED | EXPIRED | CANCELLED`.
**Built:** the same plus `COMPLETED`.

`uq_assignments_driver_active UNIQUE (driver_user_id) WHERE status = 'ACCEPTED'`
enforces BR-D5 — one live delivery per driver. With no terminal success state,
an assignment stayed `ACCEPTED` forever after delivery and the partial index
treated that driver as permanently busy: they could never accept another order.

The assignment now leaves `ACCEPTED` when the order finishes — `COMPLETED` on
delivery, `CANCELLED` otherwise — which is what the index was always assuming.

**Documentation updated:**
[database-design.md §3](sdd/architecture/database-design.md), both the enum
definition and the note under `uq_assignments_driver_active`.

### 1.3 One endpoint added: `GET /api/admin/orders/stuck`

Not in the plan. It lists orders that have sat in one status past its expected
dwell time, which is the first question an administrator asks when the
`unassigned` backlog looks wrong. It is a read-only sibling of
`GET /api/admin/orders/unassigned` and writes no audit row.

**Documentation updated:** added to the admin table in
[api-design.md §10](sdd/architecture/api-design.md).

### 1.4 Three planned endpoints were missing from the central API reference

`PUT /api/restaurant/categories/order`, `GET /api/restaurant/reviews` and
`GET /api/driver/reviews` were specified in spec-04 and spec-09 but absent from
`api-design.md`. These were found during test authoring and recorded as
findings D-01, D-02 and D-03 in
[coverage-analysis.md §10](testing/coverage-analysis.md). All three are
implemented, and the reference tables now list them.

The implemented routes and the reference now match exactly: **91 routes**, no
extras in either direction, verifiable with `npm run routes`.

### 1.5 Three under-specified behaviours were pinned down

Found while writing tests, resolved consistently with the existing design, and
now written into the SDD rather than living only in the code:

| Finding | Resolution | Recorded as |
|---|---|---|
| D-04 — in-flight orders of a suspended *customer* | The order completes, exactly as for a suspended restaurant (BR-R9) | **BR-R10**, master-sdd §7.1 |
| D-05 — opening-hours boundary inclusivity | Opening inclusive, closing exclusive | BR-R3, master-sdd §7.1 |
| D-06 — concurrent customer-cancel vs restaurant-accept | Both legitimately succeed; the invariant is serialization, not a 409 | Criterion reworded in [story-06](sdd/stories/story-06-order-placement-customer-tracking.md) |

D-06 is worth reading in full. The acceptance criterion promised "one succeeds,
the other gets 409", but `PENDING → CONFIRMED` and then `CONFIRMED → CANCELLED`
are *both* legal edges — the customer's cancellation window is still open at
`CONFIRMED`. The state machine was right and the illustration was wrong.
TC-225 now asserts what actually matters (transitions serialize, every recorded
edge is legal, no status applied twice), and TC-226 covers the genuine
one-wins-one-loses case: two restaurant staff accepting the same order.

### 1.6 The transition count in the planning documents was wrong

The docs stated 14 actor-qualified transitions and 231 refusals. The correct
figures, derived from the transition table itself, are **16 actor-qualified
transitions** and **229 refusals** out of 245 (status, target, actor)
combinations. The table in the code was never wrong; the prose arithmetic was.
Corrected in the SDD, in the testing docs, and in the exhaustive test.

---

## 2. Things the plan did not cover

### 2.1 Running PostgreSQL without Docker

The SDD assumed `docker compose up -d`. That is still the preferred path, but
[`backend/scripts/start-test-db.js`](../backend/scripts/start-test-db.js) adds a
fallback: `embedded-postgres` downloads genuine PostgreSQL binaries and runs
them from `backend/.pgdata` on port 5433.

This is a real PostgreSQL server, not an emulation or an in-memory stand-in —
which is the whole point. Several core invariants live in partial unique
indexes, `SELECT … FOR UPDATE` and check constraints; a substitute database
would return whatever the test author expected and pass while the real
invariant was broken.

### 2.2 The route audit script

[`backend/scripts/list-routes.js`](../backend/scripts/list-routes.js) (`npm run
routes`) walks the Express stack and prints every mounted route **with its
inherited middleware chain**, accumulating `router.use()` middleware down into
each route. Without that accumulation the audit passes vacuously: routes
protected by a router-level `authenticate` look unprotected, and an actually
unprotected route looks the same as a protected one.

`authorize()` returns a *named* function for the same reason — an anonymous
closure is invisible to the audit.

### 2.3 bcrypt cost in tests

Production uses cost 12. At that cost the integration suite spent 207 seconds
hashing. Tests run at `BCRYPT_ROUNDS=10`, and the assertion that mattered was
split in two: the integration cases assert the stored hash *shape*
(`/^\$2[aby]\$\d\d\$/` — a real bcrypt hash, never a plaintext password), while
a unit test on the config asserts that production is cost 12. Nothing was
weakened; the suite dropped to roughly 7 seconds per file.

### 2.4 Circular dependency between `orders` and `delivery`

Orders must notify delivery when an order is confirmed; delivery must read and
transition orders. The cycle is broken with a dynamic `await import()` inside
the delivery service, which keeps both module `index.js` boundaries intact
rather than punching a hole through them.

---

## 3. Operational notes

### 3.1 Test-database safety rails

Two independent checks, because the cost of getting this wrong is a wiped
development database:

1. [`backend/tests/setup.js`](../backend/tests/setup.js) aborts the entire run
   unless `NODE_ENV=test` **and** the resolved database name ends in `_test`.
2. Tests read `TEST_DATABASE_URL` only. `DATABASE_URL` is never consulted from
   a test.

`backend/tests/globalSetup.js` runs migrations once per suite. Individual test
files deliberately do **not** destroy the shared connection pool — an earlier
per-file `afterAll(closeDb)` destroyed the pool other workers were still using
and produced "Worker exited unexpectedly".

### 3.2 Secrets

No real secret exists anywhere in the repository.

* `backend/.env` is git-ignored; only `.env.example` is committed, and every
  value in it is a placeholder.
* Startup fails if `JWT_SECRET` is shorter than 32 characters, so the
  placeholder cannot quietly reach production.
* Seed credentials come from `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD` and
  use `@example.com` and `.test` domains, which RFC 2606 reserves and which
  cannot receive mail.
* `CORS_ORIGINS=*` is rejected when `NODE_ENV=production`.

### 3.3 Background jobs

Jobs run in-process and are wrapped in `pg_try_advisory_lock` (ADR-003), so
running several instances is safe without a queue: the lock holder runs, the
others return immediately. Set `RUN_JOBS=false` to run an instance that serves
traffic but schedules nothing.

---

## 4. Where to look next

| Topic | Document |
|---|---|
| What was built and verified | [VERIFICATION.md](VERIFICATION.md) |
| How to run it | [../README.md](../README.md) |
| Why the architecture is shaped this way | [sdd/architecture/system-architecture.md](sdd/architecture/system-architecture.md) (ADRs 1–9) and [sdd/architecture/security.md](sdd/architecture/security.md) (ADR-010) |
| What the tests cover and what they do not | [testing/coverage-analysis.md](testing/coverage-analysis.md) |
