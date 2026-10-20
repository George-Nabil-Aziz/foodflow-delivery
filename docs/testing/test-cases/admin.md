# Test Cases — Admin (TC-277 – TC-300, TC-418, TC-425 – TC-430)

> Covers [spec-10](../../sdd/specs/spec-10-platform-administration-reporting.md) ·
> [story-10](../../sdd/stories/story-10-platform-administration-reporting.md) ·
> FR-9.1 – FR-9.9 · BR-AD1 – BR-AD10

**Priority rationale.** Suspension taking effect immediately is Critical — it
is the payoff for the entire refresh-token design ([ADR-004](../../sdd/architecture/security.md#adr-004-short-access-token-plus-revocable-refresh-token)),
and without it FR-9.3 is untrue. Auditing is Critical because it is the only
real check on a role with unrestricted access. Statistics are Medium.

---

## Account management

### TC-277 — Admin lists and filters users
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** FR-9.1
**Type** API · **Priority** Medium
**Steps** 1. `GET /api/admin/users?role=CUSTOMER&status=ACTIVE&q=sara&page=1&limit=20`.
**Expected** 200; paginated results honouring every filter; `meta.pagination` accurate.

### TC-278 — Suspending a user revokes sessions and blocks the live token
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-01 · **Rules** FR-9.3, BR-AD2
**Type** Security · **Priority** Critical
**Steps** 1. Log in as `CUST_A`, keeping the access and refresh tokens. 2. As `ADMIN_A`, `POST /api/admin/users/{CUST_A}/suspend` with a reason. 3. Call `GET /api/me` with the **pre-suspension access token**. 4. Attempt a refresh with the stored refresh token. 5. Attempt a fresh login.
**Expected** Step 3 → 403 `ACCOUNT_SUSPENDED`. Step 4 → 401. Step 5 → 403 `ACCOUNT_SUSPENDED`.
**Post** All the user's `refresh_tokens` rows are revoked; one audit row written.
**Notes** Step 3 is the crux. If a pre-suspension token keeps working, suspension is decorative.

### TC-279 — Reactivation restores access
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** FR-9.2
**Type** Integration · **Priority** High
**Steps** 1. Suspend then `POST /api/admin/users/{id}/reactivate`. 2. Log in.
**Expected** 200; the user can log in again and receives fresh tokens; an audit row is written for each action.

### TC-280 — Admin cannot suspend their own account
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-02 · **Rules** BR-AD7
**Type** API · **Priority** High
**Steps** 1. As `ADMIN_A`, suspend `ADMIN_A`.
**Expected** 422; `ADMIN_A` remains `ACTIVE`.
**Notes** Locking the last admin out is unrecoverable without direct database access.

### TC-281 — An admin can suspend a different admin
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** BR-AD7, A-13
**Type** API · **Priority** Medium
**Steps** 1. As `ADMIN_A`, suspend `ADMIN_B`.
**Expected** 200 with an audit row — all admins are equal in v1, and only self-suspension is blocked.

### TC-282 — Suspension requires a reason
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** validation
**Type** API · **Priority** Medium
**Steps** 1. Suspend with no reason, then `""`, then a 4-character reason, then a 301-character reason.
**Expected** 422 each (valid range 5–300); no status change; no audit row.

---

## Restaurant lifecycle

### TC-283 — Suspending a restaurant hides it without stranding in-flight orders
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-05 · **Rules** BR-AD3, BR-R9
**Type** Integration · **Priority** Critical
**Pre** `REST_A` has orders in `PENDING`, `PREPARING` and `OUT_FOR_DELIVERY`.
**Steps** 1. `POST /api/admin/restaurants/{REST_A}/suspend` with a reason. 2. `GET /api/restaurants` anonymously. 3. Progress each in-flight order. 4. Attempt a new checkout against `REST_A`. 5. Log in as `OWNER_A`.
**Expected** The restaurant leaves the listing; **all three in-flight orders complete normally**; the new checkout returns 422 `RESTAURANT_UNAVAILABLE`; the owner can still log in and see the suspension.
**Notes** Suspending the restaurant does not suspend the owner's user account — two separate concerns.

### TC-284 — Reactivating a restaurant restores visibility
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** FR-9.2
**Type** Integration · **Priority** High
**Steps** 1. Reactivate a suspended restaurant. 2. List restaurants anonymously.
**Expected** Status `ACTIVE`; it reappears; audit row written.

### TC-285 — Approving an already-ACTIVE restaurant is refused
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** spec-10 error handling
**Type** API · **Priority** Low
**Steps** 1. Approve `REST_A`.
**Expected** 409 stating the current status.

### TC-286 — A rejected restaurant can be approved later
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** spec-10 edge cases
**Type** Integration · **Priority** Low
**Steps** 1. Reject a pending restaurant with a reason. 2. Later approve it.
**Expected** Both succeed; the `rejection_reason` is retained as history; both actions are audited.

---

## Driver management

### TC-287 — Suspending a driver mid-delivery is refused
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-03 · **Rules** BR-AD4
**Type** API · **Priority** High
**Data** `DRIVER_BUSY`
**Steps** 1. `POST /api/admin/drivers/{DRIVER_BUSY}/suspend`.
**Expected** 409 `DRIVER_HAS_ACTIVE_DELIVERY` naming the order; the driver stays `ACTIVE`.
**Notes** An order already in someone's car is not made safer by locking that person out of the app.

### TC-288 — Suspending a driver who only holds an unaccepted offer succeeds
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-04 · **Rules** BR-AD4
**Type** Integration · **Priority** Medium
**Steps** 1. Offer an order to `DRIVER_A`. 2. Suspend `DRIVER_A`. 3. Run the expiry and dispatch jobs.
**Expected** Suspension succeeds; the offer expires; the order is re-dispatched to another driver.
**Notes** Only an **accepted** delivery blocks suspension.

### TC-289 — Driver listing supports status and availability filters
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** FR-9.1
**Type** API · **Priority** Medium
**Steps** 1. `GET /api/admin/drivers?status=ACTIVE&availability=AVAILABLE`.
**Expected** 200; only matching drivers.

### TC-290 — Duplicate driver email is refused
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** BR-A1
**Type** API · **Priority** Medium
**Steps** 1. Create a driver with `sara.idris@gmail.com`.
**Expected** 409 `EMAIL_ALREADY_REGISTERED`; no user or profile created.

---

## Order oversight

### TC-291 — Admin views any order with its full event log
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** FR-9.4
**Type** API · **Priority** Medium
**Steps** 1. `GET /api/admin/orders/{ORDER_DELIVERED}`.
**Expected** 200 with items, totals, addresses and every `order_status_events` row including actor names and roles.

### TC-292 — Admin order list supports filtering by status, restaurant and date
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** FR-9.1
**Type** API · **Priority** Medium
**Steps** 1. `GET /api/admin/orders?status=DELIVERED&restaurantId={REST_A}&from=2026-09-01&to=2026-09-30`. 2. Submit `from` later than `to`.
**Expected** Step 1 → filtered results. Step 2 → 422.

### TC-293 — Force-cancel releases the driver and cancels the assignment
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-06 · **Rules** T10, BR-D8, BR-AD6
**Type** Integration · **Priority** Critical
**Data** `ORDER_STUCK_OUT`
**Steps** 1. `POST /api/admin/orders/{id}/force-cancel` with a reason.
**Expected** 200; `CANCELLED` with `cancelled_by = ADMIN` and the reason; the assignment becomes `CANCELLED`; **the driver returns to `AVAILABLE`**; a status event and an audit row are written.

### TC-294 — Force-cancelling a terminal order is refused
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-07 · **Rules** BR-AD6
**Type** API · **Priority** Critical
**Steps** 1. Force-cancel `ORDER_DELIVERED`. 2. Force-cancel `ORDER_CANCELLED`.
**Expected** 409 `INVALID_ORDER_TRANSITION` both times.
**Notes** Admins get more permitted transitions, never a bypass of terminality.

### TC-295 — The stuck-order view surfaces the three stuck categories
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-13 · **Rules** FR-9.9
**Type** Integration · **Priority** High
**Pre** `ORDER_UNASSIGNED_STALE`, `ORDER_PENDING_STALE` and `ORDER_STUCK_OUT` exist alongside healthy orders.
**Steps** 1. `GET /api/admin/orders/unassigned` and the stuck-order view.
**Expected** The three stale orders appear (unassigned >15 min, `PENDING` past the timeout, `OUT_FOR_DELIVERY` >90 min); healthy orders do not.

---

## Statistics

### TC-296 — GMV counts only delivered orders
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-12 · **Rules** BR-AD9
**Type** Service · **Priority** High
**Pre** A fixture with known totals across `DELIVERED`, `CANCELLED` and in-flight orders.
**Steps** 1. `GET /api/admin/stats`.
**Expected** `gmv.today` equals the sum of **delivered** order totals only; cancelled and in-flight orders contribute nothing.
**Notes** Counting cancelled orders as revenue would make the metric a lie, and an operations dashboard that lies is worse than none.

### TC-297 — Status breakdown and account counts match the fixture
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-12 · **Rules** FR-9.5
**Type** Service · **Priority** Medium
**Steps** 1. `GET /api/admin/stats` against a fixture with a known distribution.
**Expected** `orders.byStatus` matches exactly; `accounts` counts of customers, active/pending restaurants, active drivers and drivers-on-delivery match; `unassignedBacklog` matches.

### TC-298 — Average delivery time is computed from pickup to delivery
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** FR-9.5
**Type** Unit · **Priority** Medium
**Steps** 1. Compute against orders with known `picked_up_at` and `delivered_at`.
**Expected** The mean of `delivered_at − picked_up_at` over delivered orders only; orders lacking either timestamp are excluded rather than counted as zero.

---

## Auditing

### TC-299 — Every mutating admin endpoint writes exactly one audit row
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-09 · **Rules** BR-AD1, FR-9.6
**Type** Service · **Priority** Critical
**Steps** 1. Enumerate every mutating `/api/admin/*` route. 2. Invoke each successfully. 3. Count `admin_audit_logs` rows before and after each.
**Expected** Exactly one new row per successful mutation, naming the admin, the action, the entity type and ID, and the reason.
**Notes** Table-driven, so a new admin endpoint added without auditing fails CI. The audit row and the change commit in the same transaction — an unaudited mutation is impossible without deleting the code that writes it.

### TC-300 — A failed admin mutation writes no audit row
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-09 · **Rules** BR-AD1
**Type** Service · **Priority** High
**Steps** 1. Attempt a force-cancel on a delivered order (409). 2. Attempt an approval of an item-less restaurant (422). 3. Count audit rows.
**Expected** No new rows — the audit log records what happened, not what was attempted.
**Notes** Confirms the audit write is inside the transaction that rolls back, rather than fired before validation.

---

## Gap-closure cases (added during coverage analysis)

### TC-418 — Destructive admin actions require a stated reason before confirming
**Spec** spec-10 · **Story** story-10 · **AC** AC-10-15 · **Rules** BR-AD1, spec-10 frontend requirements
**Type** Component · **Priority** High
**Steps** 1. Open the confirmation dialog for suspend-user, reject-restaurant, suspend-driver, force-cancel-order and hide-review. 2. Attempt to confirm with an empty reason. 3. Enter a valid reason and confirm. 4. Dismiss a dialog without confirming.
**Expected** Each dialog **names its specific consequence** (for example, "This will cancel order FF-20260922-4K9P2M and release the driver"); confirm stays disabled until a reason of 5–300 characters is entered; dismissing issues no request and changes nothing.
**Notes** An admin acting on the wrong row is the realistic failure mode here, not an admin acting maliciously — which is why the dialog names the target rather than just asking "are you sure?".

## Deletion and restore

### TC-425 — users, drivers and restaurants include deleted rows unless a status is chosen
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** BR-A6
**Type** API · **Priority** High
**Steps** 1. Soft-delete a customer, a driver and a restaurant. 2. `GET /api/admin/users`, `/drivers` and `/restaurants` with no filter. 3. Repeat with `deleted=only`. 4. Repeat with a status filter (for example `status=ACTIVE`).
**Expected** Unfiltered lists include the deleted rows, each with a `deletedAt` value; `deleted=only` returns only deleted rows; a status filter excludes deleted rows.
**Status** Automated — `backend/tests/integration/adminDeletion.test.js`.

### TC-426 — restaurant owners and drivers report their user created_at
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** BR-A6
**Type** API · **Priority** Medium
**Steps** 1. `GET /api/admin/restaurants` and `/api/admin/drivers`. 2. Read the owner's and the driver's `createdAt`.
**Expected** Each row reports the `created_at` of the underlying user account.
**Status** Automated — `backend/tests/integration/adminDeletion.test.js`.

### TC-427 — soft-deletes, audits, ends sessions and blocks sign-in
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** BR-A6
**Type** API / Security · **Priority** Critical
**Steps** 1. As `ADMIN_A`, `DELETE /api/admin/users/{CUST_A}` with a valid reason. 2. Check the row and the audit log, call `GET /api/me` with `CUST_A`'s existing access token, and attempt a login as `CUST_A`. 3. Attempt to delete yourself, a customer with an order in progress, a RESTAURANT or DRIVER account via `/users/:id`, an already-deleted user, and any user with a missing reason.
**Expected** Step 1 → 200; `deleted_at` set, one `USER_DELETED` audit row written, `GET /api/me` with the old token → 401, login → 401. Step 3 → 422 `UNPROCESSABLE` (self; role accounts), 409 `HAS_ACTIVE_ORDERS`, 409 `CONFLICT` (repeat), and a validation error for the missing reason, with the issue strings in the design spec §5.
**Status** Automated — `backend/tests/integration/adminDeletion.test.js`.

### TC-428 — deletes the restaurant and its owner, and hides it from customers
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** BR-A6
**Type** API · **Priority** High
**Steps** 1. `DELETE /api/admin/restaurants/{id}` with a reason. 2. Check the restaurant and its owner's user, and browse discovery as a customer, and attempt a login as the owner. 3. Attempt to delete a restaurant that has an order in progress. 4. Delete the same restaurant again.
**Expected** Step 1 → 200; the restaurant and its owner both get `deleted_at`, and the restaurant disappears from discovery; the owner's login → 401. Step 3 → 409 `HAS_ACTIVE_ORDERS` ("This restaurant has orders in progress. Wait for them to finish, or force-cancel them first."). Step 4 → 409 ("This record is already deleted.").
**Status** Automated — `backend/tests/integration/adminDeletion.test.js`.

### TC-429 — deletes the account and takes the driver offline
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** BR-A6
**Type** API · **Priority** High
**Steps** 1. `DELETE /api/admin/drivers/{id}` for an available driver. 2. Check the user, the profile, the audit log and a login as the driver. 3. Delete the same driver again. 4. Attempt to delete a driver holding an ACCEPTED assignment. 5. Read `GET /api/admin/stats` before and after deleting a PENDING_APPROVAL driver.
**Expected** Step 1 → 200; the user gets `deleted_at`, the profile becomes OFFLINE, a `DRIVER_DELETED` audit row is written and login → 401. Step 3 → 409 ("This record is already deleted."). Step 4 → 409 `DRIVER_HAS_ACTIVE_DELIVERY` ("This driver has an active delivery."). Step 5 → `accounts.pendingDrivers` drops by 1.
**Status** Automated — `backend/tests/integration/adminDeletion.test.js`.

### TC-430 — a restored customer can sign in again and keeps their status
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** BR-A6
**Type** API · **Priority** High
**Steps** 1. Restore two deleted customers via `POST /api/admin/users/{id}/restore` and sign in as the second. 2. Restore a deleted (and previously suspended) restaurant. 3. Restore a deleted driver. 4. Attempt to restore a customer, a driver and a restaurant that are not deleted, and a RESTAURANT or DRIVER account via `/users/:id/restore`.
**Expected** Each restore → 200 and writes a `USER_RESTORED`, `RESTAURANT_RESTORED` or `DRIVER_RESTORED` audit row. The customer can sign in with their prior status. The restaurant returns with its owner and its old status. The driver stays OFFLINE. Step 4 → 409 `CONFLICT` ("This record is not deleted.") for the three non-deleted records, and 422 `UNPROCESSABLE` for the role accounts on `/users/:id/restore`.
**Status** Automated — `backend/tests/integration/adminDeletion.test.js`.
