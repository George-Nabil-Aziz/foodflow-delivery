# Admin area restructure: per-role pages, an Orders filter, soft delete and restore

Date: 2026-10-20 · Status: draft for review · Extends spec-10 (platform administration)

## Goal

The admin sidebar becomes the map of the platform: one page per kind of
account. The Users page, which mixed every role behind tabs, is split up.
Admins get a way to delete accounts and restaurants, and to restore them.
Deleted records stay visible, and they can be filtered.

## 1. Navigation

The admin sidebar, in this order:

| Item | Route name | Path |
|---|---|---|
| Dashboard | `admin-dashboard` | `/admin` |
| Orders | `admin-orders` | `/admin/orders` |
| Restaurants | `admin-restaurants` | `/admin/restaurants` |
| Drivers | `admin-drivers` | `/admin/drivers` |
| Customers | `admin-customers` | `/admin/customers` (new) |
| Admins | `admin-admins` | `/admin/admins` (new) |
| Reviews | `admin-reviews` | `/admin/reviews` |

- `Users` is removed from the sidebar.
- `/admin/users` (`admin-users`) stays as a redirect to `admin-customers`, so
  old links and bookmarks still work.

## 2. Orders: tabs become one filter

The nine tabs are replaced by a **Status** select inside a filter card. The
card uses the same pattern as the menu filters in `MenuItemsView`: a
`card` with a `field-label` and a `field-input`.

*Note:* the card was later built with the shared `FilterBar` and `FilterSelect` components (one **Status** select in `OrdersView`, with the queues in an optgroup).

The select's options:

- All orders
- Pending · Confirmed · Preparing · Ready for pickup · Out for delivery ·
  Delivered · Cancelled
- an `<optgroup>` "Queues" holding: Waiting for a driver · Stuck

The rest stays as it is today:

- The behaviour per value: `adminApi.orders({ status })` for the statuses,
  `unassigned()` and `stuck()` for the queues, with no pagination on the
  queues.
- The `?view=` query parameter.
- The table.

## 3. Customers and Admins

These are two pages built from one component, `UserListView`, with a fixed
`role` prop (`CUSTOMER` or `ADMIN`). It replaces `UsersView`.

- **Filters:** a search box ("Search by name or email") and a Status select.
  The select's options are All statuses · Active · Suspended · Deleted.
- **Columns:** Name · Email · Status · Joined · Actions. There is no Role
  column, because the page is the role.
- **Actions on a row that is not deleted:**
  - Suspend or Reactivate, as today.
  - **Delete** (§5).
  - Your own row in Admins still reads "This is you", with no actions.
- **Pagination:** the same as today, with the page-size selector.
- **Empty states:** "No customers match these filters" and "No admins match
  these filters".

## 4. Restaurants and Drivers gain the Users columns

Both pages keep their tabs, their approval queues and their existing
actions. Each one gains three things:

- a **Joined** column, showing the owner's or the driver's `users.created_at`;
- a **Deleted** tab;
- a **Delete** action on every row that is not deleted.

*Note:* the filter UI was later built with the shared `FilterBar` and `FilterSelect` components; on Restaurants and Drivers the tabs became a **Status** select (Restaurants: `RestaurantsView`; Drivers: `DriversView`, both including the Deleted option).

Restaurants already shows the owner's email under the name. Drivers already
shows the driver's email.

## 5. Delete (soft delete, per BR-A6)

Delete sets `deleted_at`. Nothing is removed from the database. A deleted
account cannot sign in, because `authenticate` already rejects deleted users
on every request. Orders, reviews and audit rows survive, using the name
snapshots that were taken when each order was placed. Suspend is unchanged.

### Endpoints

All three are admin-only. Each needs a `{ reason }` of 5–300 characters, as
suspend does, and each writes one audit-log row in the same transaction.

| Endpoint | What it sets `deleted_at` on |
|---|---|
| `DELETE /api/admin/users/:id` | the user. Only for a CUSTOMER or an ADMIN account |
| `DELETE /api/admin/drivers/:id` (`:id` is the user id) | the driver's user. The profile is set to `availability = OFFLINE` |
| `DELETE /api/admin/restaurants/:id` | the restaurant **and** its owner's user |

### Rules

The codes follow the existing conventions: self-suspension is refused with
`UNPROCESSABLE`, and the active-delivery guard uses
`DRIVER_HAS_ACTIVE_DELIVERY`. The only new code is `HAS_ACTIVE_ORDERS`.

| Case | Response | `details[0].issue` |
|---|---|---|
| Deleting yourself | 422 `UNPROCESSABLE` | You cannot delete your own account. |
| A customer with an order that is not finished | 409 `HAS_ACTIVE_ORDERS` | This customer has an order in progress. Wait for it to finish, or force-cancel it first. |
| A restaurant with an order that is not finished | 409 `HAS_ACTIVE_ORDERS` | This restaurant has orders in progress. Wait for them to finish, or force-cancel them first. |
| A driver holding an ACCEPTED assignment | 409 `DRIVER_HAS_ACTIVE_DELIVERY` | This driver has an active delivery. |
| Already deleted | 409 `CONFLICT` | This record is already deleted. |
| A RESTAURANT or DRIVER account sent to `DELETE /users/:id` | 422 `UNPROCESSABLE` | Delete this account from the Restaurants or Drivers page. |

- "Not finished" means any status in the orders module's `ACTIVE_STATUSES`
  (PENDING, CONFIRMED, PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY).
- `HAS_ACTIVE_ORDERS` has the public message "There are orders still in
  progress."
- The UI shows the 409 messages as translated sentences, which tell the
  admin to wait or to force-cancel first.

### Lists include deleted rows

The admin list endpoints (`/admin/users`, `/admin/drivers`,
`/admin/restaurants`) stop hiding deleted rows. Each row gains a `deletedAt`
field. A new query parameter, `deleted`, controls what is returned:

| `deleted` | Returns |
|---|---|
| `include` (default) | every row |
| `only` | the deleted rows only |

A status filter (ACTIVE, SUSPENDED and so on) returns rows that are **not**
deleted, so a deleted row appears only under "All" and under "Deleted".

Discovery, dispatch, sign-in and the dashboard counts keep excluding deleted
rows. The dashboard driver counts did not and were changed to exclude deleted drivers.

### UI

- A deleted row shows a grey **Deleted** badge, with the deletion date
  beside it, in place of its status. Its only action is **Restore** (§5a).
- The confirm dialog is red, needs a reason, and is titled "Delete {name}?".
- Its message says the account can no longer sign in until it is restored.
- For a restaurant, the message adds that the owner's account is deleted too.

### Out of scope

- Deleting reviews.

## 5a. Restore

Restore clears `deleted_at` and returns the record exactly as it was before
deletion. Suspend and approval status are left untouched, so a restaurant
that was suspended comes back suspended. A restored driver stays OFFLINE
until they go available themselves.

### Endpoints

All three are admin-only. Each takes an optional `{ reason }`, as reactivate
does, and writes one audit-log row.

| Endpoint | What it clears `deleted_at` on |
|---|---|
| `POST /api/admin/users/:id/restore` | the user. Only for a CUSTOMER or an ADMIN account |
| `POST /api/admin/drivers/:id/restore` | the driver's user |
| `POST /api/admin/restaurants/:id/restore` | the restaurant **and** its owner's user |

### Rules

| Case | Response | `details[0].issue` |
|---|---|---|
| The record is not deleted | 409 `CONFLICT` | This record is not deleted. |
| A RESTAURANT or DRIVER account sent to `/users/:id/restore` | 422 `UNPROCESSABLE` | Restore this account from the Restaurants or Drivers page. |

There is no email or slug conflict. `uq_users_email` and
`uq_restaurants_slug` cover deleted rows too, so a deleted email or slug is
never reused while it is deleted.

### UI

**Restore** is a plain button on a deleted row, with no dialog, as
Reactivate is today. A toast confirms the restore, and the row moves back
under its status.

## 6. API additions to existing rows

| Endpoint | Change |
|---|---|
| `GET /admin/restaurants` | `owner` gains `createdAt` (from `users.created_at`). The row gains `deletedAt` |
| `GET /admin/drivers` | `createdAt` becomes the user's `created_at`. Today it is the profile's, which is a bug. The row gains `deletedAt` |
| `GET /admin/users` | gains `deletedAt` |

## 7. Testing

**Backend integration tests:**

- each delete endpoint: success, the audit row, and every 409 rule;
- signing in after deletion fails;
- each restore endpoint: success, the audit row, and every 409 rule;
- signing in after a restore works, and the status the record had before
  deletion is kept;
- `deleted=only` and `deleted=include`;
- the status filters exclude deleted rows;
- the new `owner.createdAt` and driver `createdAt` fields.

**Frontend:**

- Update `e2e/tc-396-admin-journey.spec.js`, which opens `/admin/users`.
- Add one e2e test that deletes a customer, finds them under the Deleted
  filter, and restores them.

**Docs:**

- `docs/sdd/architecture/api-design.md`: the new endpoints and the
  `deleted` parameter.
- spec-10: the delete rules.
- `docs/testing/test-cases/admin.md`: new cases.
