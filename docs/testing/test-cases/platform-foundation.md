# Test Cases — Platform Foundation (TC-407 – TC-424)

> Covers [spec-01](../../sdd/specs/spec-01-platform-foundation-api-contract.md) ·
> [story-01](../../sdd/stories/story-01-platform-foundation-walking-skeleton.md) ·
> FR-10.1 – FR-10.8 · BR-F1 – BR-F5

**Why this block sits above TC-406.** It was added during the
[coverage analysis](../coverage-analysis.md) to close the story-01 gap, using
the procedure in [test-plan §2](../test-plan.md#2-test-case-id-allocation): a
full block takes the next free IDs and the allocation table records it. IDs are
never reused or renumbered.

**Priority rationale.** Configuration and envelope failures are High rather than
Critical — they fail loudly and immediately, at boot or on the first request,
rather than silently corrupting data. The exception is the enum-sync case, which
guards a failure that surfaces only in production on an edge path.

---

### TC-407 — A fresh clone runs end to end
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-01 · **Rules** G5
**Type** Integration · **Priority** High
**Pre** A clean checkout on a machine with Node 20 and Docker, and no project containers running.
**Steps** 1. `docker compose up -d`. 2. `cd backend && npm install && npm run migrate && npm run seed && npm run dev`. 3. `cd frontend && npm install && npm run dev`. 4. Open the frontend and log in with a seeded account.
**Expected** Both processes start; migrations and seed complete without manual intervention; the home view renders with seeded restaurants; total elapsed time under 10 minutes.
**Notes** Run on a clean CI runner rather than a warm developer machine — a cached `node_modules` would hide exactly the failure this case exists to catch. Verified once per phase, not on every push.

### TC-408 — Health endpoint reports a healthy system
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-02 · **Rules** FR-10.6, NFR-15
**Type** API · **Priority** High
**Steps** 1. `GET /api/health` with the database reachable.
**Expected** 200; `{ status: "ok", uptime, database: "up", version }` inside the success envelope with `meta.requestId` present.

### TC-409 — Health endpoint reports a degraded system
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-03 · **Rules** FR-10.6
**Type** Integration · **Priority** High
**Steps** 1. Stop the database container (or point the pool at an unreachable host). 2. `GET /api/health`.
**Expected** **503** with `{ status: "degraded", database: "down" }` in the envelope — the process stays up and answers, rather than crashing or hanging.
**Notes** A health check that returns 200 while the database is unreachable is worse than none: it would keep a broken instance in the load balancer.

### TC-410 — Every response carries a correlation ID
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-04 · **Rules** FR-10.5, NFR-15
**Type** API · **Priority** High
**Steps** 1. Call a success endpoint, a 404, a 422 and a 500. 2. For each, compare the `X-Request-Id` header with `meta.requestId`. 3. Search the log output for that ID.
**Expected** The header is present on all four and equals `meta.requestId`; each request's log lines carry the same ID.
**Notes** This is what makes a support conversation tractable — the customer quotes the ID from an error screen and it resolves to the exact log lines.

### TC-411 — The frontend renders its own not-found view
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-09 · **Rules** FR-10.8
**Type** Component · **Priority** Medium
**Steps** 1. Navigate to an unknown client route. 2. Navigate to an unknown route while authenticated as each role.
**Expected** `NotFoundView` renders inside the public layout with a route back to somewhere useful; the app does not blank, throw, or redirect to login.

### TC-412 — `withTransaction` reuses a passed transaction
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** FR-10.7
**Type** Unit · **Priority** Critical
**Steps** 1. Call `withTransaction(fn)` with no existing transaction. 2. Call `withTransaction(fn, trx)` with one, from inside an outer transaction. 3. Instrument connection acquisition.
**Expected** Step 1 opens and commits its own transaction. Step 2 **joins the passed transaction** — no second connection is acquired and only the outer scope commits.
**Notes** Critical because a nested call that opened its own connection would deadlock against the outer transaction's row locks — and it would do so only under concurrency, which is the worst way to find out.

### TC-413 — PostgreSQL enums and JavaScript constants stay in sync
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** ADR-012, R-14
**Type** Service · **Priority** High
**Steps** 1. For each enum type — `user_role`, `user_status`, `restaurant_status`, `driver_status`, `driver_availability`, `vehicle_type`, `cart_status`, `order_status`, `dispatch_state`, `actor_type`, `cancellation_reason`, `assignment_status`, `payment_method`, `review_status` — query `enum_range` and compare with the mirror in `shared/constants.js`.
**Expected** Identical members, in both directions, for all fourteen.
**Notes** Drift here surfaces as a runtime error at the database boundary, in production, on an edge path — exactly the failure mode worth spending a cheap test on.

---

## Read-endpoint coverage (TC-419 – TC-424)

> Added during the [coverage analysis](../coverage-analysis.md) to close an
> endpoint gap: six documented read endpoints had no dedicated case. They are
> grouped here rather than scattered, because they share a shape — a scoped,
> paginated read whose main risks are wrong scoping and PII leakage.

### TC-419 — Cuisine list reflects only cuisines with active restaurants
**Spec** spec-05 · **Story** story-04 · **AC** — · **Rules** FR-4.7
**Type** API · **Priority** Medium
**Pre** `REST_A` is ACTIVE with cuisine `LEVANTINE`; the only `ITALIAN` restaurant is `REST_SUSPENDED`.
**Steps** 1. `GET /api/cuisines` anonymously.
**Expected** 200; `LEVANTINE` present with an accurate `restaurantCount`; **`ITALIAN` absent**, because offering a filter that returns nothing is a broken filter.

### TC-420 — Customer lists their own reviews
**Spec** spec-09 · **Story** story-09 · **AC** — · **Rules** FR-8.7
**Type** API · **Priority** Medium
**Steps** 1. As `CUST_A`, `GET /api/reviews/mine`. 2. As `CUST_B`.
**Expected** Each customer sees only their own reviews, paginated, each with `editableUntil` so the UI can disable editing without guessing. Neither sees the other's.

### TC-421 — Restaurant reads its own received reviews
**Spec** spec-09 · **Story** story-09 · **AC** — · **Rules** FR-8.7
**Type** API · **Priority** Medium
**Steps** 1. As `OWNER_A`, `GET /api/restaurant/reviews`. 2. As `OWNER_B`. 3. Serialize both bodies.
**Expected** Each owner sees only their own restaurant's **published** reviews; hidden reviews are excluded; authors appear as first name plus last initial with no email or phone (BR-V8).
**Notes** This endpoint is defined in spec-09 but absent from the central API reference — finding **D-02** in [coverage-analysis.md](../coverage-analysis.md).

### TC-422 — Driver reads their own received ratings
**Spec** spec-09 · **Story** story-09 · **AC** — · **Rules** FR-8.7
**Type** API · **Priority** Medium
**Steps** 1. As `DRIVER_A`, `GET /api/driver/reviews`. 2. As `DRIVER_B`.
**Expected** Each driver sees only ratings on deliveries they completed, with the customer's display name only. Neither sees the other's.
**Notes** Also absent from the central API reference — finding **D-03**.

### TC-423 — Restaurant dashboard statistics are scoped and correct
**Spec** spec-03 · **Story** story-03 · **AC** — · **Rules** FR-2.8
**Type** Service · **Priority** Medium
**Pre** A fixture with a known distribution of today's orders across both `REST_A` and `REST_B`.
**Steps** 1. As `OWNER_A`, `GET /api/restaurant/stats`.
**Expected** Today's order count, revenue and rating cover **only `REST_A`**; `REST_B`'s orders contribute nothing. Revenue counts delivered orders only, consistent with BR-AD9.

### TC-424 — Admin audit log is queryable and append-only
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-09 · **Rules** FR-9.6, BR-AD1
**Type** API · **Priority** High
**Steps** 1. Perform two admin mutations. 2. `GET /api/admin/audit-logs?entityType=restaurant&entityId={id}`. 3. `?adminId={ADMIN_A}`. 4. Attempt to update or delete an audit row through any API route.
**Expected** Both actions are listed with admin identity, action, entity, reason and timestamp; filters work; **no route exists to modify or delete an audit entry**.
**Notes** Readability by other admins is the only real check on a role with unrestricted access, which is why this is High rather than Medium.
