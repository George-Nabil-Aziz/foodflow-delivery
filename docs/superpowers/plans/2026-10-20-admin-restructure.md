# Admin Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the admin Users page into per-role sidebar pages, replace the
Orders tabs with a Status filter, and add soft delete, restore and a "Deleted"
filter for customers, admins, restaurants and drivers.

**Architecture:**

- **Backend:** the admin module gains delete and restore operations.
  - Each one goes through the owning module's public interface (users,
    restaurants, delivery, orders) and writes an audit row in the same
    transaction, which is the existing pattern.
  - The three admin list endpoints stop hiding deleted rows and gain a
    `deleted` query parameter.
- **Frontend:** a new `UserListView` serves both Customers and Admins. The
  Restaurants and Drivers views gain a Joined column, a Deleted tab, and
  Delete and Restore actions.

**Tech Stack:**

- Backend: Node, Express, Knex, PostgreSQL and Zod, tested with Vitest and
  Supertest.
- Frontend: Vue 3 (`<script setup>`), Vue Router and Tailwind 3.4, tested with
  Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-20-admin-restructure-design.md`

## Global Constraints

**Process**
- **Do not commit.** The working tree on `main` holds unrelated uncommitted
  work. George commits when he asks. No task has a commit step.

**Backend conventions**
- **Module boundaries:** the admin module never writes another module's
  tables directly. It calls the module's `index.js` exports. Add an export
  whenever a task needs a new capability.
- **Audit:** every admin mutation calls `audit({...}, trx)` inside its
  `withTransaction`. The action names are `USER_DELETED`, `USER_RESTORED`,
  `DRIVER_DELETED`, `DRIVER_RESTORED`, `RESTAURANT_DELETED` and
  `RESTAURANT_RESTORED`.
- **Errors:** every code must exist in `backend/src/shared/errors/codes.js`.
  - The only new code is `HAS_ACTIVE_ORDERS` (409), with the public message
    "There are orders still in progress."
  - Everything else reuses existing codes: `UNPROCESSABLE` (422), `CONFLICT`
    (409), `DRIVER_HAS_ACTIVE_DELIVERY` (409) and `RESOURCE_NOT_FOUND` (404).
- **`details[0].issue` strings** must be copied exactly from the spec's
  tables. The frontend translates them by their exact English text.
- **Reasons:** delete takes `{ reason }` of 5–300 characters
  (`reasonSchema`). Restore takes an optional reason
  (`optionalReasonSchema`).

**Frontend conventions**
- **i18n:** every new English UI string gets an Arabic entry in
  `frontend/src/i18n/ar/admin.js`. Every new API message or issue gets one in
  `frontend/src/i18n/ar/errors.js`. Keys are the exact English text.
- **Test IDs:** new backend tests are named `TC-425` to `TC-430`, which follow
  the last case in `docs/testing/test-cases/*.md` (TC-424).

---

### Task 1: List endpoints include deleted rows, the `deleted` filter, and Joined dates

**Files:**
- Modify: `backend/src/modules/admin/admin.routes.js` (`usersQuery`, `driversQuery`, `restaurantsQuery`)
- Modify: `backend/src/modules/admin/admin.service.js` (`listUsers`, `listDrivers`)
- Modify: `backend/src/modules/delivery/delivery.repository.js` (`adminListDrivers`)
- Modify: `backend/src/modules/restaurants/restaurants.repository.js` (`adminList`)
- Modify: `backend/src/modules/restaurants/restaurants.mapper.js` (`toAdminRestaurantDto`)
- Create: `backend/tests/integration/adminDeletion.test.js`

**Interfaces:**
- Produces:
  - Query param `deleted: 'include' | 'only'` (default `'include'`) on
    `GET /admin/users`, `/admin/drivers` and `/admin/restaurants`.
  - Response fields:
    - users rows: `deletedAt`
    - driver rows: `createdAt`, now the user's creation date; `deletedAt`
    - restaurant rows: `deletedAt`, `owner.createdAt`
  - Filtering rule:
    - `deleted=only` returns deleted rows only.
    - Any `status` filter returns non-deleted rows only.
    - Otherwise every row is returned.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/integration/adminDeletion.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeOrder, makeDriver,
  makeAssignment, authHeader, TEST_PASSWORD,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

const ids = (res) => res.body.data.map((r) => r.id);

describe('TC-425: admin lists show deleted rows and filter them', () => {
  it('TC-425: users, drivers and restaurants include deleted rows unless a status is chosen', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const live = await makeUser({ role: 'CUSTOMER' });
    const gone = await makeUser({ role: 'CUSTOMER', deletedAt: new Date() });

    const all = await request(app).get('/api/admin/users?role=CUSTOMER').set(authHeader(admin));
    expect(all.status).toBe(200);
    expect(ids(all)).toEqual(expect.arrayContaining([live.id, gone.id]));
    expect(all.body.data.find((u) => u.id === gone.id).deletedAt).not.toBeNull();
    expect(all.body.data.find((u) => u.id === live.id).deletedAt).toBeNull();

    const only = await request(app).get('/api/admin/users?role=CUSTOMER&deleted=only').set(authHeader(admin));
    expect(ids(only)).toEqual([gone.id]);

    const active = await request(app).get('/api/admin/users?role=CUSTOMER&status=ACTIVE').set(authHeader(admin));
    expect(ids(active)).toEqual([live.id]);

    const { user: driverUser } = await makeDriver();
    await knex('users').where({ id: driverUser.id }).update({ deleted_at: knex.fn.now() });
    const drivers = await request(app).get('/api/admin/drivers?deleted=only').set(authHeader(admin));
    expect(drivers.body.data.map((d) => d.userId)).toEqual([driverUser.id]);
    expect(drivers.body.data[0].deletedAt).not.toBeNull();

    const { restaurant } = await makeStockedRestaurant();
    await knex('restaurants').where({ id: restaurant.id }).update({ deleted_at: knex.fn.now() });
    const rAll = await request(app).get('/api/admin/restaurants').set(authHeader(admin));
    expect(ids(rAll)).toContain(restaurant.id);
    const rActive = await request(app).get('/api/admin/restaurants?status=ACTIVE').set(authHeader(admin));
    expect(ids(rActive)).not.toContain(restaurant.id);
  });
});

describe('TC-426: Joined is the account creation date', () => {
  it('TC-426: restaurant owners and drivers report their user created_at', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { restaurant, owner } = await makeStockedRestaurant();
    const { user: driverUser } = await makeDriver();
    const joined = new Date('2025-01-15T10:00:00Z');
    await knex('users').whereIn('id', [owner.id, driverUser.id]).update({ created_at: joined });

    const r = await request(app).get('/api/admin/restaurants').set(authHeader(admin));
    const row = r.body.data.find((x) => x.id === restaurant.id);
    expect(new Date(row.owner.createdAt).toISOString()).toBe(joined.toISOString());

    const d = await request(app).get('/api/admin/drivers').set(authHeader(admin));
    const drow = d.body.data.find((x) => x.userId === driverUser.id);
    expect(new Date(drow.createdAt).toISOString()).toBe(joined.toISOString());
  });
});
```

(The imports for delete and restore are used by the tests in Tasks 2 and 3.)

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd backend && npx vitest run tests/integration/adminDeletion.test.js`

Expected: FAIL. `deleted=only` is rejected with a 422 (unknown query key), and
the deleted rows are missing from the lists.

- [ ] **Step 3: Add the query parameter**

In `admin.routes.js`, add a shared enum near `reasonSchema`, then add it to
the three queries:

```js
/** Deleted rows are listed by default, so an admin can find and restore them. */
const deletedFilter = z.enum(['include', 'only']).default('include');
```

```js
const usersQuery = paginationQuery.extend({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().min(2).max(60).optional(),
  deleted: deletedFilter,
});
```

Add `deleted: deletedFilter,` the same way to `driversQuery` and to
`restaurantsQuery`.

- [ ] **Step 4: Users list**

In `admin.service.js` `listUsers`:
- Remove `.whereNull('deleted_at')`.
- After the existing `if (query.status) …` line, add:

```js
  // A deleted account has no live status, so it only shows under "All" and "Deleted".
  if (query.deleted === 'only') q.whereNotNull('deleted_at');
  else if (query.status) q.whereNull('deleted_at');
```

- In the row mapping, add `deletedAt: u.deleted_at,` after `lastLoginAt`.

- [ ] **Step 5: Drivers list**

In `delivery.repository.js`, change the signature and the query of
`adminListDrivers`:

```js
export async function adminListDrivers({ status, availability, q, deleted, limit, offset }, trx) {
  const conn = db(trx);
  const query = conn('driver_profiles as d')
    .join('users as u', 'u.id', 'd.user_id')
    .select(
      'd.*',
      'u.full_name',
      'u.email',
      'u.phone',
      'u.status as user_status',
      'u.created_at as user_created_at',
      'u.deleted_at as user_deleted_at',
      conn.raw('count(*) OVER() AS total_count'),
    )
    .orderBy('d.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (deleted === 'only') query.whereNotNull('u.deleted_at');
  else if (status || availability) query.whereNull('u.deleted_at');
  if (status) query.where('d.status', status);
  if (availability) query.where('d.availability', availability);
  if (q) query.where((b) => b.whereILike('u.full_name', `%${q}%`).orWhereILike('u.email', `%${q}%`));
  const rows = await query;
  return { rows, total: rows[0]?.total_count ?? 0 };
}
```

In `admin.service.js` `listDrivers`, replace `createdAt: d.created_at,` with:

```js
      // Joined is the account's creation date, not the profile row's.
      createdAt: d.user_created_at,
      deletedAt: d.user_deleted_at,
```

- [ ] **Step 6: Restaurants list**

In `restaurants.repository.js` `adminList`:
- Remove `.whereNull('r.deleted_at')`.
- Add `'u.created_at as owner_created_at',` after `'u.email as owner_email',`.
- Change the signature to `({ status, q, deleted, limit, offset }, trx)`.
- Replace the line `if (status) query.where('r.status', status);` with:

```js
  if (deleted === 'only') query.whereNotNull('r.deleted_at');
  else if (status) query.whereNull('r.deleted_at');
  if (status) query.where('r.status', status);
```

In `restaurants.mapper.js` `toAdminRestaurantDto`, change the `owner` line
and add `deletedAt`:

```js
  owner: {
    id: r.owner_user_id, fullName: r.owner_full_name, email: r.owner_email,
    createdAt: r.owner_created_at,
  },
  deletedAt: r.deleted_at ?? null,
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `cd backend && npx vitest run tests/integration/adminDeletion.test.js`

Expected: PASS (TC-425, TC-426).

- [ ] **Step 8: Run the whole backend suite**

Run: `cd backend && npm test`

Expected: PASS.

If a test asserted that deleted rows are hidden from the admin lists, it now
fails. Read it before changing anything:
- If it tests the admin list, update it to the new rule from the spec.
- If it tests anything else (discovery, dispatch), the change leaked: fix
  the code, not the test.

---

### Task 2: Delete endpoints

**Files:**
- Modify: `backend/src/shared/errors/codes.js`
- Modify: `backend/src/modules/users/users.repository.js`, `users.service.js`, `index.js`
- Modify: `backend/src/modules/restaurants/restaurants.repository.js`, `restaurants.service.js`, `index.js`
- Modify: `backend/src/modules/orders/orders.repository.js`, `orders.service.js`, `index.js`
- Modify: `backend/src/modules/admin/admin.service.js`, `admin.routes.js`
- Test: `backend/tests/integration/adminDeletion.test.js`

**Interfaces:**
- Consumes: Task 1's list rules, used in the tests to observe a deletion.
- Produces:
  - **users module exports:**
    - `getUserByIdIncludingDeleted(id, trx) → row | undefined`
    - `softDeleteUser(id, trx) → row`
    - `restoreUser(id, trx) → row`
  - **restaurants module exports:**
    - `getRestaurantByIdIncludingDeleted(id, trx) → row | undefined`
    - `softDeleteRestaurant(id, trx) → row`
    - `restoreRestaurant(id, trx) → row`
  - **orders module exports:**
    - `countActiveOrdersForCustomer(userId, trx) → number`
    - `countActiveOrdersForRestaurant(restaurantId, trx) → number`
  - **admin service:**
    - `deleteUser(adminUserId, userId, { reason })`
    - `deleteDriver(adminUserId, userId, { reason })`
    - `deleteRestaurant(adminUserId, restaurantId, { reason })`
    - Each returns `{ id, deletedAt }`.
  - **Routes:**
    - `DELETE /api/admin/users/:id`
    - `DELETE /api/admin/drivers/:id` (`:id` is the user id)
    - `DELETE /api/admin/restaurants/:id`
    - The body of each is `{ reason }`.

- [ ] **Step 1: Write the failing tests**

Append to `adminDeletion.test.js`:

```js
const login = (email) => request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
const reason = { reason: 'Account closed at the owner’s request' };

describe('TC-427: deleting a customer or an admin', () => {
  it('TC-427: soft-deletes, audits, ends sessions and blocks sign-in', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ role: 'CUSTOMER' });

    const res = await request(app).delete(`/api/admin/users/${customer.id}`).set(authHeader(admin)).send(reason);
    expect(res.status).toBe(200);
    expect(res.body.data.deletedAt).not.toBeNull();

    const row = await knex('users').where({ id: customer.id }).first();
    expect(row.deleted_at).not.toBeNull();
    const auditRow = await knex('admin_audit_logs').where({ action: 'USER_DELETED', entity_id: customer.id }).first();
    expect(auditRow).toBeTruthy();

    expect((await request(app).get('/api/me').set(authHeader(customer))).status).toBe(401);
    expect((await login(customer.email)).status).toBe(401);
  });

  it('TC-427: refuses self, active orders, role accounts, repeats and a missing reason', async () => {
    const admin = await makeUser({ role: 'ADMIN' });

    const self = await request(app).delete(`/api/admin/users/${admin.id}`).set(authHeader(admin)).send(reason);
    expect(self.status).toBe(422);
    expect(self.body.error.details[0].issue).toBe('You cannot delete your own account.');

    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const { restaurant, owner } = await makeStockedRestaurant();
    await makeOrder({ customer, restaurant, address, status: 'PREPARING' });
    const busy = await request(app).delete(`/api/admin/users/${customer.id}`).set(authHeader(admin)).send(reason);
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('HAS_ACTIVE_ORDERS');
    expect(busy.body.error.details[0].issue).toBe('This customer has an order in progress.');

    const viaUsers = await request(app).delete(`/api/admin/users/${owner.id}`).set(authHeader(admin)).send(reason);
    expect(viaUsers.status).toBe(422);
    expect(viaUsers.body.error.details[0].issue).toBe('Delete this account from the Restaurants or Drivers page.');

    const gone = await makeUser({ role: 'CUSTOMER', deletedAt: new Date() });
    const again = await request(app).delete(`/api/admin/users/${gone.id}`).set(authHeader(admin)).send(reason);
    expect(again.status).toBe(409);
    expect(again.body.error.details[0].issue).toBe('This record is already deleted.');

    const noReason = await request(app).delete(`/api/admin/users/${gone.id}`).set(authHeader(admin)).send({});
    expect(noReason.status).toBe(422);
    expect(await knex('admin_audit_logs')).toHaveLength(0);
  });
});

describe('TC-428: deleting a restaurant', () => {
  it('TC-428: deletes the restaurant and its owner, and hides it from customers', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { restaurant, owner } = await makeStockedRestaurant();

    const res = await request(app).delete(`/api/admin/restaurants/${restaurant.id}`).set(authHeader(admin)).send(reason);
    expect(res.status).toBe(200);
    expect((await knex('restaurants').where({ id: restaurant.id }).first()).deleted_at).not.toBeNull();
    expect((await knex('users').where({ id: owner.id }).first()).deleted_at).not.toBeNull();
    expect(await knex('admin_audit_logs').where({ action: 'RESTAURANT_DELETED', entity_id: restaurant.id })).toHaveLength(1);

    const listed = await request(app).get('/api/restaurants');
    expect(ids(listed)).not.toContain(restaurant.id);
  });

  it('TC-428: refuses a restaurant with orders in progress', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const { restaurant } = await makeStockedRestaurant();
    await makeOrder({ customer, restaurant, address, status: 'CONFIRMED' });

    const res = await request(app).delete(`/api/admin/restaurants/${restaurant.id}`).set(authHeader(admin)).send(reason);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HAS_ACTIVE_ORDERS');
    expect(res.body.error.details[0].issue).toBe('This restaurant has orders in progress.');
    expect((await knex('restaurants').where({ id: restaurant.id }).first()).deleted_at).toBeNull();
  });
});

describe('TC-429: deleting a driver', () => {
  it('TC-429: deletes the account and takes the driver offline', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { user } = await makeDriver({ availability: 'AVAILABLE' });

    const res = await request(app).delete(`/api/admin/drivers/${user.id}`).set(authHeader(admin)).send(reason);
    expect(res.status).toBe(200);
    expect((await knex('users').where({ id: user.id }).first()).deleted_at).not.toBeNull();
    expect((await knex('driver_profiles').where({ user_id: user.id }).first()).availability).toBe('OFFLINE');
  });

  it('TC-429: refuses a driver with an active delivery', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const { restaurant } = await makeStockedRestaurant();
    const { user } = await makeDriver();
    const order = await makeOrder({ customer, restaurant, address, driver: user, status: 'OUT_FOR_DELIVERY' });
    await makeAssignment(order, user, { status: 'ACCEPTED' });

    const res = await request(app).delete(`/api/admin/drivers/${user.id}`).set(authHeader(admin)).send(reason);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_HAS_ACTIVE_DELIVERY');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd backend && npx vitest run tests/integration/adminDeletion.test.js -t "TC-42[789]"`

Expected: FAIL with 404, because the routes don't exist yet.

- [ ] **Step 3: Register the error code**

In `codes.js`:
- Add `HAS_ACTIVE_ORDERS: 409,` after `DRIVER_HAS_ACTIVE_DELIVERY: 409,` in
  `CODES`.
- Add
  `HAS_ACTIVE_ORDERS: 'There are orders still in progress.',` after the
  `DRIVER_HAS_ACTIVE_DELIVERY` message in `PUBLIC_MESSAGES`.

`platform.test.js` ("every error code in the registry maps to its documented
status") must keep passing.

- [ ] **Step 4: Add the users module capabilities**

In `users.repository.js`, after `findByEmail`:

```js
/** Admin only: deleted rows are invisible everywhere else. */
export function findByIdIncludingDeleted(id, trx) {
  return db(trx)('users').where({ id }).first();
}

export async function softDelete(id, trx) {
  const [row] = await db(trx)('users').where({ id }).update({ deleted_at: knex.fn.now() }).returning('*');
  return row;
}

export async function restore(id, trx) {
  const [row] = await db(trx)('users').where({ id }).update({ deleted_at: null }).returning('*');
  return row;
}
```

In `users.service.js`, after `export const setUserStatus = repo.setStatus;`:

```js
export const getUserByIdIncludingDeleted = repo.findByIdIncludingDeleted;
export const softDeleteUser = repo.softDelete;
export const restoreUser = repo.restore;
```

In `users/index.js`, add `getUserByIdIncludingDeleted, softDeleteUser,
restoreUser,` to the `./users.service.js` export list.

- [ ] **Step 5: Add the restaurants module capabilities**

In `restaurants.repository.js`, after `findByOwner`:

```js
/** Admin only: deleted rows are invisible everywhere else. */
export function findByIdIncludingDeleted(id, trx) {
  return db(trx)('restaurants').where({ id }).first();
}

export async function softDelete(id, trx) {
  const [row] = await db(trx)('restaurants').where({ id }).update({ deleted_at: knex.fn.now() }).returning('*');
  return row;
}

export async function restore(id, trx) {
  const [row] = await db(trx)('restaurants').where({ id }).update({ deleted_at: null }).returning('*');
  return row;
}
```

In `restaurants.service.js`, after `export const adminList = repo.adminList;`:

```js
export const getRestaurantByIdIncludingDeleted = repo.findByIdIncludingDeleted;
export const softDeleteRestaurant = repo.softDelete;
export const restoreRestaurant = repo.restore;
```

In `restaurants/index.js`, add `getRestaurantByIdIncludingDeleted,
softDeleteRestaurant, restoreRestaurant,` to the `./restaurants.service.js`
export list.

- [ ] **Step 6: Add the orders module capabilities**

In `orders.repository.js`, after the `export { ACTIVE_STATUSES, CLOSED_STATUSES };` line:

```js
export async function countActiveForCustomer(customerUserId, trx) {
  const [row] = await db(trx)('orders')
    .where({ customer_user_id: customerUserId })
    .whereIn('status', ACTIVE_STATUSES)
    .count();
  return Number(row?.count ?? 0);
}

export async function countActiveForRestaurant(restaurantId, trx) {
  const [row] = await db(trx)('orders')
    .where({ restaurant_id: restaurantId })
    .whereIn('status', ACTIVE_STATUSES)
    .count();
  return Number(row?.count ?? 0);
}
```

In `orders.service.js`, next to `export const getOrderById = repo.findById;`:

```js
export const countActiveOrdersForCustomer = repo.countActiveForCustomer;
export const countActiveOrdersForRestaurant = repo.countActiveForRestaurant;
```

In `orders/index.js`, add `countActiveOrdersForCustomer,
countActiveOrdersForRestaurant,` to the `./orders.service.js` export list.

- [ ] **Step 7: Admin service operations**

In `admin.service.js`, add after `reactivateUser`:

```js
/* --------------------------------------------------------------- deletion */
// Soft delete (BR-A6): the row stays, so orders and reviews keep their history,
// and `authenticate` rejects a deleted account on its very next request.

const alreadyDeleted = () => new ConflictError('CONFLICT', {
  details: [{ field: 'id', issue: 'This record is already deleted.' }],
});

export async function deleteUser(adminUserId, userId, { reason }) {
  if (adminUserId === userId) {
    throw new ValidationError('UNPROCESSABLE', {
      details: [{ field: 'id', issue: 'You cannot delete your own account.' }],
    });
  }
  return withTransaction(async (trx) => {
    const user = await users.getUserByIdIncludingDeleted(userId, trx);
    if (!user) throw new NotFoundError('RESOURCE_NOT_FOUND');
    // A restaurant or driver account has its own rules (orders, deliveries).
    if (user.role === 'RESTAURANT' || user.role === 'DRIVER') {
      throw new ValidationError('UNPROCESSABLE', {
        details: [{ field: 'id', issue: 'Delete this account from the Restaurants or Drivers page.' }],
      });
    }
    if (user.deleted_at) throw alreadyDeleted();
    if (await orders.countActiveOrdersForCustomer(userId, trx)) {
      throw new ConflictError('HAS_ACTIVE_ORDERS', {
        details: [{ field: 'id', issue: 'This customer has an order in progress.' }],
      });
    }

    const row = await users.softDeleteUser(userId, trx);
    await auth.revokeAllForUser(userId, trx);
    await audit(
      { adminUserId, action: 'USER_DELETED', entityType: 'user', entityId: userId, metadata: { reason } },
      trx,
    );
    return { id: userId, deletedAt: row.deleted_at };
  });
}

export async function deleteDriver(adminUserId, userId, { reason }) {
  return withTransaction(async (trx) => {
    const user = await users.getUserByIdIncludingDeleted(userId, trx);
    if (!user || user.role !== 'DRIVER') throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (user.deleted_at) throw alreadyDeleted();
    const active = await delivery.findActiveAssignment(userId, trx);
    if (active) {
      throw new ConflictError('DRIVER_HAS_ACTIVE_DELIVERY', {
        details: [{ field: 'id', issue: 'This driver has an active delivery.', orderId: active.order_id }],
      });
    }

    const row = await users.softDeleteUser(userId, trx);
    // Dispatch already skips deleted users; OFFLINE makes the profile say so too.
    await delivery.updateProfileRaw(userId, { availability: 'OFFLINE' }, trx);
    await auth.revokeAllForUser(userId, trx);
    await audit(
      { adminUserId, action: 'DRIVER_DELETED', entityType: 'driver', entityId: userId, metadata: { reason } },
      trx,
    );
    return { id: userId, deletedAt: row.deleted_at };
  });
}

/** The owner's account exists only for this restaurant, so it goes with it. */
export async function deleteRestaurant(adminUserId, restaurantId, { reason }) {
  return withTransaction(async (trx) => {
    const restaurant = await restaurants.getRestaurantByIdIncludingDeleted(restaurantId, trx);
    if (!restaurant) throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (restaurant.deleted_at) throw alreadyDeleted();
    if (await orders.countActiveOrdersForRestaurant(restaurantId, trx)) {
      throw new ConflictError('HAS_ACTIVE_ORDERS', {
        details: [{ field: 'id', issue: 'This restaurant has orders in progress.' }],
      });
    }

    const row = await restaurants.softDeleteRestaurant(restaurantId, trx);
    await users.softDeleteUser(restaurant.owner_user_id, trx);
    await auth.revokeAllForUser(restaurant.owner_user_id, trx);
    await audit(
      {
        adminUserId, action: 'RESTAURANT_DELETED', entityType: 'restaurant', entityId: restaurantId,
        metadata: { reason, ownerUserId: restaurant.owner_user_id },
      },
      trx,
    );
    return { id: restaurantId, deletedAt: row.deleted_at };
  });
}
```

- [ ] **Step 8: Routes**

In `admin.routes.js`:
- After the `/users/:id/reactivate` route:

```js
adminRouter.delete(
  '/users/:id',
  validate({ params: idParam, body: reasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.deleteUser(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);
```

- After the `/drivers/:id/suspend` route:

```js
adminRouter.delete(
  '/drivers/:id',
  validate({ params: idParam, body: reasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.deleteDriver(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);
```

- After the `/restaurants/:id/reactivate` route:

```js
adminRouter.delete(
  '/restaurants/:id',
  validate({ params: idParam, body: reasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.deleteRestaurant(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);
```

- [ ] **Step 9: Run the tests and confirm they pass**

Run: `cd backend && npx vitest run tests/integration/adminDeletion.test.js`

Expected: PASS (TC-425 to TC-429).

If the `/api/me` check returns 403 rather than 401, read
`middleware/authenticate.js:26`. Its current code throws
`UnauthorizedError('TOKEN_INVALID')` for a deleted user, so 401 is the
expected status.

- [ ] **Step 10: Run the whole backend suite**

Run: `cd backend && npm test`

Expected: PASS.

---

### Task 3: Restore endpoints

**Files:**
- Modify: `backend/src/modules/admin/admin.service.js`, `admin.routes.js`
- Test: `backend/tests/integration/adminDeletion.test.js`

**Interfaces:**
- Consumes:
  - Task 2: `users.getUserByIdIncludingDeleted`, `users.restoreUser`,
    `restaurants.getRestaurantByIdIncludingDeleted`,
    `restaurants.restoreRestaurant`.
- Produces:
  - `restoreUser(adminUserId, userId, { reason })`,
    `restoreDriver(...)` and `restoreRestaurant(...)`. Each returns
    `{ id, deletedAt: null }`.
  - Routes `POST /api/admin/users/:id/restore`,
    `/api/admin/drivers/:id/restore` and
    `/api/admin/restaurants/:id/restore`. The body is optional
    `{ reason }`.

- [ ] **Step 1: Write the failing tests**

Append to `adminDeletion.test.js`:

```js
describe('TC-430: restoring a deleted record', () => {
  it('TC-430: a restored customer can sign in again and keeps their status', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ role: 'CUSTOMER', status: 'SUSPENDED', deletedAt: new Date() });

    const res = await request(app).post(`/api/admin/users/${customer.id}/restore`).set(authHeader(admin)).send({});
    expect(res.status).toBe(200);
    const row = await knex('users').where({ id: customer.id }).first();
    expect(row.deleted_at).toBeNull();
    expect(row.status).toBe('SUSPENDED');
    expect(await knex('admin_audit_logs').where({ action: 'USER_RESTORED', entity_id: customer.id })).toHaveLength(1);

    const active = await makeUser({ role: 'CUSTOMER', deletedAt: new Date() });
    await request(app).post(`/api/admin/users/${active.id}/restore`).set(authHeader(admin)).send({});
    expect((await login(active.email)).status).toBe(200);
  });

  it('TC-430: a restored restaurant brings its owner back with its old status', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { restaurant, owner } = await makeStockedRestaurant({ status: 'SUSPENDED' });
    await request(app).delete(`/api/admin/restaurants/${restaurant.id}`).set(authHeader(admin)).send(reason);

    const res = await request(app).post(`/api/admin/restaurants/${restaurant.id}/restore`).set(authHeader(admin)).send({});
    expect(res.status).toBe(200);
    const r = await knex('restaurants').where({ id: restaurant.id }).first();
    expect(r.deleted_at).toBeNull();
    expect(r.status).toBe('SUSPENDED');
    expect((await knex('users').where({ id: owner.id }).first()).deleted_at).toBeNull();
  });

  it('TC-430: a restored driver stays offline', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { user } = await makeDriver();
    await request(app).delete(`/api/admin/drivers/${user.id}`).set(authHeader(admin)).send(reason);

    const res = await request(app).post(`/api/admin/drivers/${user.id}/restore`).set(authHeader(admin)).send({});
    expect(res.status).toBe(200);
    expect((await knex('users').where({ id: user.id }).first()).deleted_at).toBeNull();
    expect((await knex('driver_profiles').where({ user_id: user.id }).first()).availability).toBe('OFFLINE');
  });

  it('TC-430: refuses a record that is not deleted, and role accounts on /users', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const live = await makeUser({ role: 'CUSTOMER' });
    const notDeleted = await request(app).post(`/api/admin/users/${live.id}/restore`).set(authHeader(admin)).send({});
    expect(notDeleted.status).toBe(409);
    expect(notDeleted.body.error.details[0].issue).toBe('This record is not deleted.');

    const { user } = await makeDriver();
    await knex('users').where({ id: user.id }).update({ deleted_at: knex.fn.now() });
    const viaUsers = await request(app).post(`/api/admin/users/${user.id}/restore`).set(authHeader(admin)).send({});
    expect(viaUsers.status).toBe(422);
    expect(viaUsers.body.error.details[0].issue).toBe('Restore this account from the Restaurants or Drivers page.');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd backend && npx vitest run tests/integration/adminDeletion.test.js -t "TC-430"`

Expected: FAIL with 404.

- [ ] **Step 3: Admin service operations**

In `admin.service.js`, after `deleteRestaurant`:

```js
/* ---------------------------------------------------------------- restore */
// Restore only clears deleted_at: suspension and approval are left as they were.

const notDeleted = () => new ConflictError('CONFLICT', {
  details: [{ field: 'id', issue: 'This record is not deleted.' }],
});

export async function restoreUser(adminUserId, userId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const user = await users.getUserByIdIncludingDeleted(userId, trx);
    if (!user) throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (user.role === 'RESTAURANT' || user.role === 'DRIVER') {
      throw new ValidationError('UNPROCESSABLE', {
        details: [{ field: 'id', issue: 'Restore this account from the Restaurants or Drivers page.' }],
      });
    }
    if (!user.deleted_at) throw notDeleted();
    await users.restoreUser(userId, trx);
    await audit(
      { adminUserId, action: 'USER_RESTORED', entityType: 'user', entityId: userId, metadata: { reason } },
      trx,
    );
    return { id: userId, deletedAt: null };
  });
}

export async function restoreDriver(adminUserId, userId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const user = await users.getUserByIdIncludingDeleted(userId, trx);
    if (!user || user.role !== 'DRIVER') throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (!user.deleted_at) throw notDeleted();
    await users.restoreUser(userId, trx);
    await audit(
      { adminUserId, action: 'DRIVER_RESTORED', entityType: 'driver', entityId: userId, metadata: { reason } },
      trx,
    );
    return { id: userId, deletedAt: null };
  });
}

export async function restoreRestaurant(adminUserId, restaurantId, { reason } = {}) {
  return withTransaction(async (trx) => {
    const restaurant = await restaurants.getRestaurantByIdIncludingDeleted(restaurantId, trx);
    if (!restaurant) throw new NotFoundError('RESOURCE_NOT_FOUND');
    if (!restaurant.deleted_at) throw notDeleted();
    await restaurants.restoreRestaurant(restaurantId, trx);
    await users.restoreUser(restaurant.owner_user_id, trx);
    await audit(
      {
        adminUserId, action: 'RESTAURANT_RESTORED', entityType: 'restaurant', entityId: restaurantId,
        metadata: { reason, ownerUserId: restaurant.owner_user_id },
      },
      trx,
    );
    return { id: restaurantId, deletedAt: null };
  });
}
```

- [ ] **Step 4: Routes**

In `admin.routes.js`, add three routes after the matching delete routes from
Task 2.

Users:

```js
adminRouter.post(
  '/users/:id/restore',
  validate({ params: idParam, body: optionalReasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.restoreUser(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);
```

Drivers:

```js
adminRouter.post(
  '/drivers/:id/restore',
  validate({ params: idParam, body: optionalReasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.restoreDriver(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);
```

Restaurants:

```js
adminRouter.post(
  '/restaurants/:id/restore',
  validate({ params: idParam, body: optionalReasonSchema }),
  asyncHandler(async (req, res) => {
    res.json(ok(await service.restoreRestaurant(req.user.id, req.validated.params.id, req.validated.body), { requestId: req.id }));
  }),
);
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd backend && npm test`

Expected: PASS, including TC-430.

---

### Task 4: Frontend API client, translations and the Deleted badge

**Files:**
- Modify: `frontend/src/services/api.js` (`adminApi`)
- Create: `frontend/src/components/shared/DeletedBadge.vue`
- Modify: `frontend/src/i18n/ar/errors.js`, `frontend/src/i18n/ar/admin.js`

**Interfaces:**
- Consumes: the routes from Tasks 2 and 3.
- Produces:
  - **`adminApi` methods:**
    - `deleteUser(id, reason)`, `restoreUser(id)`
    - `deleteDriver(id, reason)`, `restoreDriver(id)`
    - `deleteRestaurant(id, reason)`, `restoreRestaurant(id)`
  - **The `DeletedBadge` component:**
    - Prop: `at: String`, an ISO date.
    - It renders a grey "Deleted" pill followed by the date.

This task has no behaviour of its own. It is verified through Tasks 5–8, and
by the build in Step 5.

- [ ] **Step 1: API methods**

In `api.js`, add to `adminApi` after `reactivateUser`:

```js
  // DELETE carries its reason in the body, which axios takes as `data`.
  deleteUser: (id, reason) => http.delete(`/admin/users/${id}`, { data: { reason } }),
  restoreUser: (id) => http.post(`/admin/users/${id}/restore`, {}),
```

After `suspendDriver`:

```js
  deleteDriver: (id, reason) => http.delete(`/admin/drivers/${id}`, { data: { reason } }),
  restoreDriver: (id) => http.post(`/admin/drivers/${id}/restore`, {}),
```

After `reactivateRestaurant`:

```js
  deleteRestaurant: (id, reason) => http.delete(`/admin/restaurants/${id}`, { data: { reason } }),
  restoreRestaurant: (id) => http.post(`/admin/restaurants/${id}/restore`, {}),
```

- [ ] **Step 2: The `DeletedBadge` component**

Create `frontend/src/components/shared/DeletedBadge.vue`:

```vue
<script setup>
import { t } from '../../i18n/index.js';
import { formatDateTime } from '../../utils/datetime.js';

/** Stands in for a deleted record's status: a deleted row has no live one. */
defineProps({ at: { type: String, required: true } });
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
    <span class="rounded-full border border-slate-400 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
      {{ t('Deleted') }}
    </span>
    <span class="text-xs text-slate-500">{{ formatDateTime(at) }}</span>
  </span>
</template>
```

- [ ] **Step 3: Arabic error catalogue**

In `i18n/ar/errors.js`, add these entries:

- In the `error.message` section, after the "This driver has an active
  delivery." entry:

```js
  'There are orders still in progress.': 'لا تزال هناك طلبات قيد التنفيذ.',
```

- In the `details[].issue` section, wherever the admin issues are listed:

```js
  'You cannot delete your own account.': 'لا يمكنك حذف حسابك.',
  'This customer has an order in progress.': 'لدى هذا العميل طلب قيد التنفيذ.',
  'This restaurant has orders in progress.': 'لدى هذا المطعم طلبات قيد التنفيذ.',
  'This record is already deleted.': 'تم حذف هذا السجل من قبل.',
  'This record is not deleted.': 'هذا السجل غير محذوف.',
  'Delete this account from the Restaurants or Drivers page.': 'احذف هذا الحساب من صفحة المطاعم أو السائقين.',
  'Restore this account from the Restaurants or Drivers page.': 'استعد هذا الحساب من صفحة المطاعم أو السائقين.',
```

If you can't find a `details[].issue` section, find where
`'You cannot suspend your own account.'` lives and add the entries there.

- [ ] **Step 4: Arabic admin catalogue**

In `i18n/ar/admin.js`, add (skip any key that already exists):

```js
  // Admin restructure: per-role pages, deletion and restore
  Customers: 'العملاء',
  Admins: 'المشرفون',
  Deleted: 'محذوف',
  Delete: 'حذف',
  Restore: 'استعادة',
  Joined: 'تاريخ الانضمام',
  Queues: 'قوائم الانتظار',
  'Loading customers': 'جارٍ تحميل العملاء',
  'Loading admins': 'جارٍ تحميل المشرفين',
  'No customers match these filters': 'لا يوجد عملاء يطابقون هذه الفلاتر',
  'No admins match these filters': 'لا يوجد مشرفون يطابقون هذه الفلاتر',
  'Delete {name}?': 'حذف {name}؟',
  'Delete account': 'حذف الحساب',
  'Delete restaurant': 'حذف المطعم',
  'Delete driver': 'حذف السائق',
  '{name} deleted': 'تم حذف {name}',
  '{name} restored': 'تمت استعادة {name}',
  'They will no longer be able to sign in until restored. Their past orders and reviews are kept.':
    'لن يتمكن من تسجيل الدخول حتى تتم استعادته. تبقى طلباته وتقييماته السابقة محفوظة.',
  'The restaurant disappears from customers, and the owner’s account is deleted with it. Past orders and reviews are kept, and both can be restored.':
    'يختفي المطعم عن العملاء ويُحذف حساب مالكه معه. تبقى الطلبات والتقييمات السابقة محفوظة، ويمكن استعادة الاثنين.',
```

- [ ] **Step 5: Build**

Run: `cd frontend && npx vite build`

Expected: the build succeeds.

---

### Task 5: Orders: the tabs become a Status filter

**Files:**
- Modify: `frontend/src/views/admin/OrdersView.vue`
- Modify: `frontend/e2e/tc-396-admin-journey.spec.js` (step 4)

**Interfaces:**
- Consumes: nothing new.
- Produces: a `<select id="o-status">` with the label "Status". Its option
  values are `all`, each of the seven statuses, `unassigned` and `stuck`.

- [ ] **Step 1: Update the e2e test to the new control (it should fail first)**

In `tc-396-admin-journey.spec.js` step 4, replace
`await page.getByRole('tab', { name: /^preparing$/i }).click();` with:

```js
  await page.getByLabel('Status').selectOption('PREPARING');
```

- [ ] **Step 2: Replace the tabs in the template**

In `OrdersView.vue`:
- Remove the `AppTabs` import and the `tabs` computed. Keep `STATUSES`.
- Replace the `<AppTabs … />` line with:

```vue
    <!-- One filter for every view: the statuses, then the two dispatch queues. -->
    <div class="card mt-4 p-4 sm:max-w-xs">
      <label for="o-status" class="field-label">{{ t('Status') }}</label>
      <select id="o-status" :value="view" class="field-input" @change="setView($event.target.value)">
        <option value="all">{{ t('All orders') }}</option>
        <option v-for="s in STATUSES" :key="s" :value="s">{{ enumText(s) }}</option>
        <optgroup :label="t('Queues')">
          <option value="unassigned">{{ t('Waiting for a driver') }}</option>
          <option value="stuck">{{ t('Stuck') }}</option>
        </optgroup>
      </select>
    </div>
```

- [ ] **Step 3: Check it in the browser**

Run the app (`/start-local`, or `npm run dev` in both packages), sign in as
the admin and open `/admin/orders`. Check:
- each option loads its list;
- Waiting for a driver and Stuck have no pagination;
- `/admin/orders?view=stuck` opens with Stuck selected.

Check at 375px and at desktop width.

- [ ] **Step 4: Run the e2e test**

Run: `cd frontend && npx playwright test e2e/tc-396-admin-journey.spec.js`

Expected: steps 1 and 4 pass. Step 2 still opens `/admin/users`, and Task 6
updates it. If step 2 fails now, that's expected: note it and continue.

---

### Task 6: Customers and Admins pages replace Users

**Files:**
- Create: `frontend/src/views/admin/UserListView.vue`
- Delete: `frontend/src/views/admin/UsersView.vue`
- Modify: `frontend/src/router/routes.admin.js`
- Modify: `frontend/src/layouts/DashboardLayout.vue` (the `ADMIN` nav)
- Modify: `frontend/e2e/tc-396-admin-journey.spec.js` (step 2, plus a new step 2b)

**Interfaces:**
- Consumes:
  - Task 4: `adminApi.deleteUser`, `adminApi.restoreUser`, `DeletedBadge`.
  - Task 1: the `deleted=only` parameter and `deletedAt` on each row.
- Produces:
  - Route names `admin-customers` (`/admin/customers`) and `admin-admins`
    (`/admin/admins`).
  - `admin-users` (`/admin/users`) redirects to `admin-customers`.

- [ ] **Step 1: Update the e2e test first**

In `tc-396-admin-journey.spec.js`:

1. In the setup, next to
   `const victim = await registerCustomer({ fullName: 'Suspendable Customer' });`,
   add:

```js
  const leaver = await registerCustomer({ fullName: 'Departing Customer' });
```

2. In step 2, replace these two lines:

```js
  await page.goto('/admin/users');
  await page.getByRole('tab', { name: 'Customer', exact: true }).click();
```

with:

```js
  await page.goto('/admin/customers');
```

3. After step 2's last line (`await expect(victimRow.getByText('Suspended'))…`),
   add:

```js
  /* 2b. Delete a customer, find them under Deleted, and restore them. */
  await page.getByLabel('Search').fill(leaver.user.email);
  const leaverRow = page.locator('tr', { hasText: leaver.user.email });
  await leaverRow.getByRole('button', { name: 'Delete' }).click();
  await confirmDialog(page, { reason: 'Customer asked to close the account', confirmLabel: 'Delete account' });
  await expect(leaverRow.getByText('Deleted')).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('Status').selectOption('DELETED');
  await expect(leaverRow).toBeVisible();
  await leaverRow.getByRole('button', { name: 'Restore' }).click();
  await expect(leaverRow).toBeHidden({ timeout: 20_000 });
```

Before relying on `leaver.user.email`, open `frontend/e2e/helpers/api.js`
and check what `registerCustomer` returns. Step 2 already uses
`victim.user.email`, so use the same shape for `leaver`.

- [ ] **Step 2: Create `UserListView.vue`**

```vue
<script setup>
import { onMounted, ref, watch } from 'vue';
import { adminApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatDateTime } from '../../utils/datetime.js';
import { t } from '../../i18n/index.js';
import { rawEnumText } from '../../utils/labels.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import DeletedBadge from '../../components/shared/DeletedBadge.vue';

/**
 * One account list per role: Customers and Admins in the sidebar. Restaurant
 * owners and drivers are managed from their own pages, where their orders and
 * deliveries decide what an admin may do.
 */
const props = defineProps({ role: { type: String, required: true } }); // 'CUSTOMER' | 'ADMIN'

const COPY = {
  CUSTOMER: { title: 'Customers', loading: 'Loading customers', empty: 'No customers match these filters' },
  ADMIN: { title: 'Admins', loading: 'Loading admins', empty: 'No admins match these filters' },
};

const auth = useAuthStore();
const ui = useUiStore();

const users = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const pageSize = ref(20);
const loading = ref(true);
const busy = ref(null);
// status: '' | 'ACTIVE' | 'SUSPENDED' | 'DELETED'
const filters = ref({ status: '', q: '' });
const dialog = ref({ open: false, config: {}, user: null, action: null });

async function load(page = 1) {
  loading.value = true;
  try {
    const params = { page, limit: pageSize.value, role: props.role };
    if (filters.value.status === 'DELETED') params.deleted = 'only';
    else if (filters.value.status) params.status = filters.value.status;
    if (filters.value.q.trim().length >= 2) params.q = filters.value.q.trim();

    const res = await adminApi.users(params);
    users.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());
// Customers -> Admins reuses this instance; start the new list from scratch.
watch(() => props.role, () => { filters.value = { status: '', q: '' }; load(1); });

/** Destructive actions name their target and require a reason. */
function askSuspend(user) {
  dialog.value = {
    open: true,
    user,
    action: 'suspend',
    config: {
      title: t('Suspend {name}?', { name: user.fullName }),
      message: t('This immediately ends every session for {email} and blocks their existing access token. They will not be able to sign in until reactivated.', { email: user.email }),
      confirmLabel: 'Suspend account',
      requireReason: true,
      variant: 'danger',
    },
  };
}

function askDelete(user) {
  dialog.value = {
    open: true,
    user,
    action: 'delete',
    config: {
      title: t('Delete {name}?', { name: user.fullName }),
      message: 'They will no longer be able to sign in until restored. Their past orders and reviews are kept.',
      confirmLabel: 'Delete account',
      requireReason: true,
      variant: 'danger',
    },
  };
}

async function confirmAction({ reason }) {
  const { user, action } = dialog.value;
  dialog.value = { ...dialog.value, open: false };
  busy.value = user.id;
  try {
    if (action === 'suspend') {
      await adminApi.suspendUser(user.id, reason);
      ui.toastSuccess(t('{name} suspended', { name: user.fullName }));
    } else {
      await adminApi.deleteUser(user.id, reason);
      ui.toastSuccess(t('{name} deleted', { name: user.fullName }));
    }
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}

async function reactivate(user) {
  busy.value = user.id;
  try {
    await adminApi.reactivateUser(user.id, 'Reactivated by administrator');
    ui.toastSuccess(t('{name} reactivated', { name: user.fullName }));
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}

async function restore(user) {
  busy.value = user.id;
  try {
    await adminApi.restoreUser(user.id);
    ui.toastSuccess(t('{name} restored', { name: user.fullName }));
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t(COPY[role].title) }}</h1>

    <div class="card mt-4 grid gap-3 p-4 sm:grid-cols-3">
      <div class="sm:col-span-2">
        <label for="u-search" class="field-label">{{ t('Search') }}</label>
        <input id="u-search" v-model="filters.q" type="search" class="field-input"
               :placeholder="t('Search by name or email')" @input="load(1)">
      </div>
      <div>
        <label for="u-status" class="field-label">{{ t('Status') }}</label>
        <select id="u-status" v-model="filters.status" class="field-input" @change="load(1)">
          <option value="">{{ t('All statuses') }}</option>
          <option value="ACTIVE">{{ t('Active', null, 'status') }}</option>
          <option value="SUSPENDED">{{ t('Suspended') }}</option>
          <option value="DELETED">{{ t('Deleted') }}</option>
        </select>
      </div>
    </div>

    <AppSpinner v-if="loading" :label="COPY[role].loading" />
    <EmptyState v-else-if="users.length === 0" class="mt-4" :title="COPY[role].empty" />

    <template v-else>
      <div class="card table-wrap mt-4 overflow-x-auto">
        <table class="table-cards w-full text-start text-sm">
          <thead class="border-b border-slate-200 text-slate-600">
            <tr>
              <th scope="col" class="p-3">{{ t('Name') }}</th>
              <th scope="col" class="p-3">{{ t('Email') }}</th>
              <th scope="col" class="p-3">{{ t('Status') }}</th>
              <th scope="col" class="p-3">{{ t('Joined') }}</th>
              <th scope="col" class="p-3">{{ t('Actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-b border-slate-100 last:border-0">
              <td :data-label="t('Name')" class="p-3 font-medium text-slate-900">{{ user.fullName }}</td>
              <td :data-label="t('Email')" class="p-3 text-slate-700">{{ user.email }}</td>
              <td :data-label="t('Status')" class="p-3">
                <DeletedBadge v-if="user.deletedAt" :at="user.deletedAt" />
                <span v-else class="rounded-full border px-2 py-0.5 text-xs"
                      :class="user.status === 'ACTIVE'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'border-slate-400 bg-slate-100 text-slate-800'">
                  {{ rawEnumText(user.status) }}
                </span>
              </td>
              <td :data-label="t('Joined')" class="p-3 text-slate-600">{{ formatDateTime(user.createdAt) }}</td>
              <td :data-label="t('Actions')" class="p-3">
                <button v-if="user.deletedAt" type="button" :disabled="busy === user.id"
                        class="action-link text-brand-700 hover:underline" @click="restore(user)">
                  {{ t('Restore') }}
                </button>
                <!-- An admin cannot suspend or delete themselves: locking the
                     last administrator out is unrecoverable. -->
                <span v-else-if="user.id === auth.user?.id" class="text-xs text-slate-500">{{ t('This is you') }}</span>
                <span v-else class="flex flex-wrap gap-x-4 gap-y-2">
                  <button v-if="user.status === 'ACTIVE'" type="button" :disabled="busy === user.id"
                          class="action-link text-red-700 hover:underline" @click="askSuspend(user)">
                    {{ t('Suspend') }}
                  </button>
                  <button v-else type="button" :disabled="busy === user.id"
                          class="action-link text-brand-700 hover:underline" @click="reactivate(user)">
                    {{ t('Reactivate') }}
                  </button>
                  <button type="button" :disabled="busy === user.id"
                          class="action-link text-red-700 hover:underline" @click="askDelete(user)">
                    {{ t('Delete') }}
                  </button>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :pagination="pagination" :limit="pageSize" @change="load"
          @update:limit="(n) => { pageSize = n; load(1); }" />
    </template>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmAction" @cancel="dialog.open = false" />
  </div>
</template>
```

- [ ] **Step 3: Routes**

In `routes.admin.js`:
- Replace the `users` line with:

```js
      // Users became one page per role; old links land on Customers.
      { path: 'users', name: 'admin-users', redirect: { name: 'admin-customers' } },
      { path: 'customers', name: 'admin-customers', meta, props: { role: 'CUSTOMER' }, component: () => import('../views/admin/UserListView.vue') },
      { path: 'admins', name: 'admin-admins', meta, props: { role: 'ADMIN' }, component: () => import('../views/admin/UserListView.vue') },
```

- Then delete `frontend/src/views/admin/UsersView.vue`.

- [ ] **Step 4: Sidebar**

In `DashboardLayout.vue`, replace the `ADMIN:` array with:

```js
  ADMIN: [
    { to: { name: 'admin-dashboard' }, label: 'Dashboard', always: true, exact: true },
    { to: { name: 'admin-orders' }, label: 'Orders', always: true },
    { to: { name: 'admin-restaurants' }, label: 'Restaurants', always: true },
    { to: { name: 'admin-drivers' }, label: 'Drivers', always: true },
    { to: { name: 'admin-customers' }, label: 'Customers', always: true },
    { to: { name: 'admin-admins' }, label: 'Admins', always: true },
    { to: { name: 'admin-reviews' }, label: 'Reviews', always: true },
  ],
```

- [ ] **Step 5: Remove orphaned translations**

Run: `cd frontend && grep -rn "'All users'\|'Role'" src --include=*.vue`

If nothing uses `'All users'` any more, delete its line from
`i18n/ar/admin.js`. Keep `'Role'` if any view still uses it.

- [ ] **Step 6: Check it in the browser**

Check:
- the sidebar order;
- that `/admin/users` lands on Customers;
- that Customers ↔ Admins resets the filters and reloads;
- that your own row says "This is you";
- that delete asks for a reason, and the row turns into Deleted with a
  Restore button;
- that the Deleted filter shows only deleted rows.

Check at 375px and at desktop width, in Arabic too.

- [ ] **Step 7: Run the e2e test**

Run: `cd frontend && npx playwright test e2e/tc-396-admin-journey.spec.js`

Expected: steps 1, 2, 2b and 4 pass. Step 3 (restaurants) is unchanged and
passes.

---

### Task 7: Restaurants gain Joined, a Deleted tab, and Delete and Restore

**Files:**
- Modify: `frontend/src/views/admin/RestaurantsView.vue`

**Interfaces:**
- Consumes:
  - Task 4: `adminApi.deleteRestaurant`, `adminApi.restoreRestaurant`,
    `DeletedBadge`.
  - Task 1: `deleted=only`, `r.deletedAt`, `r.owner.createdAt`.

- [ ] **Step 1: Script**

1. Import the date formatter and the badge:

```js
import { formatDateTime } from '../../utils/datetime.js';
import DeletedBadge from '../../components/shared/DeletedBadge.vue';
```

2. Add the tab to the end of `tabs`:

```js
  { key: 'DELETED', label: t('Deleted') },
```

3. In `load`, replace `if (statusFilter.value) params.status = statusFilter.value;` with:

```js
    if (statusFilter.value === 'DELETED') params.deleted = 'only';
    else if (statusFilter.value) params.status = statusFilter.value;
```

4. In `confirmAction`, add a branch after the `suspend` line:

```js
    if (action === 'delete') await adminApi.deleteRestaurant(restaurant.id, reason);
```

5. Add a `restore` function after `reactivate`:

```js
async function restore(restaurant) {
  busy.value = restaurant.id;
  try {
    await adminApi.restoreRestaurant(restaurant.id);
    ui.toastSuccess(t('{name} restored', { name: restaurant.name }));
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}
```

- [ ] **Step 2: Template**

1. Add a Joined column header after Rating:

```vue
                <th scope="col" class="p-3">{{ t('Joined') }}</th>
```

2. Add its cell after the Rating `<td>`:

```vue
                <td :data-label="t('Joined')" class="p-3 text-slate-600">{{ formatDateTime(r.owner.createdAt) }}</td>
```

3. Replace the Status cell's content (`{{ enumText(r.status) }}` and the
   rejection reason span) with:

```vue
                  <DeletedBadge v-if="r.deletedAt" :at="r.deletedAt" />
                  <template v-else>
                    {{ enumText(r.status) }}
                    <span v-if="r.rejectionReason" class="block text-xs text-slate-500">
                      {{ r.rejectionReason }}
                    </span>
                  </template>
```

4. Replace the whole Actions `<td>` body with:

```vue
                  <button v-if="r.deletedAt" type="button" :disabled="busy === r.id"
                          class="action-link text-brand-700 hover:underline" @click="restore(r)">
                    {{ t('Restore') }}
                  </button>
                  <span v-else class="flex flex-wrap gap-x-4 gap-y-2">
                    <button v-if="r.status === 'ACTIVE'" type="button" :disabled="busy === r.id"
                            class="action-link text-red-700 hover:underline"
                            @click="ask(r, 'suspend', {
                              title: t('Suspend {name}?', { name: r.name }),
                              message: 'The restaurant disappears from customer listings immediately. Orders already in progress will still complete.',
                              confirmLabel: 'Suspend restaurant',
                              requireReason: true,
                              variant: 'danger',
                            })">
                      {{ t('Suspend') }}
                    </button>
                    <!-- Approving needs the application's details, which live on the queue tab. -->
                    <button v-else-if="r.status === 'PENDING_APPROVAL'" type="button"
                            class="action-link text-brand-700 hover:underline" @click="setTab('PENDING_APPROVAL')">
                      {{ t('Review') }}
                    </button>
                    <button v-else type="button" :disabled="busy === r.id"
                            class="action-link text-brand-700 hover:underline" @click="reactivate(r)">
                      {{ t('Reactivate') }}
                    </button>
                    <button type="button" :disabled="busy === r.id"
                            class="action-link text-red-700 hover:underline"
                            @click="ask(r, 'delete', {
                              title: t('Delete {name}?', { name: r.name }),
                              message: 'The restaurant disappears from customers, and the owner’s account is deleted with it. Past orders and reviews are kept, and both can be restored.',
                              confirmLabel: 'Delete restaurant',
                              requireReason: true,
                              variant: 'danger',
                            })">
                      {{ t('Delete') }}
                    </button>
                  </span>
```

- [ ] **Step 3: Check it in the browser**

Check:
- the Joined column shows the owner's date;
- deleting a restaurant with no open orders turns its row into Deleted;
- the Deleted tab lists it, and Restore brings it back under its old status;
- deleting one that has an open order shows the translated "This restaurant
  has orders in progress." toast.

Check at 375px, where the card layout is used.

---

### Task 8: Drivers gain Joined, a Deleted tab, and Delete and Restore

**Files:**
- Modify: `frontend/src/views/admin/DriversView.vue`

**Interfaces:**
- Consumes:
  - Task 4: `adminApi.deleteDriver`, `adminApi.restoreDriver`, `DeletedBadge`.
  - Task 1: `deleted=only`, `d.deletedAt`, and `d.createdAt`, which is now
    the user's.

- [ ] **Step 1: Script**

1. Import the date formatter and the badge:

```js
import { formatDateTime } from '../../utils/datetime.js';
import DeletedBadge from '../../components/shared/DeletedBadge.vue';
```

2. Add `{ key: 'DELETED', label: t('Deleted') },` to the end of `tabs`.

3. In `load`, replace `if (tab.value) params.status = tab.value;` with:

```js
    if (tab.value === 'DELETED') params.deleted = 'only';
    else if (tab.value) params.status = tab.value;
```

4. Change the dialog to carry an action. Replace `askSuspend` and
   `confirmSuspend` with:

```js
function askSuspend(driver) {
  dialog.value = {
    open: true,
    driver,
    action: 'suspend',
    config: {
      title: t('Suspend {name}?', { name: driver.fullName }),
      message: 'A driver who is currently on a delivery cannot be suspended: the order is already in their vehicle.',
      confirmLabel: 'Suspend driver',
      requireReason: true,
      variant: 'danger',
    },
  };
}

function askDelete(driver) {
  dialog.value = {
    open: true,
    driver,
    action: 'delete',
    config: {
      title: t('Delete {name}?', { name: driver.fullName }),
      message: 'They will no longer be able to sign in until restored. Their past orders and reviews are kept.',
      confirmLabel: 'Delete driver',
      requireReason: true,
      variant: 'danger',
    },
  };
}

async function confirmAction({ reason }) {
  const { driver, action } = dialog.value;
  dialog.value = { ...dialog.value, open: false };
  busy.value = driver.userId;
  try {
    if (action === 'suspend') {
      await adminApi.suspendDriver(driver.userId, reason);
      ui.toastSuccess('Driver suspended');
    } else {
      await adminApi.deleteDriver(driver.userId, reason);
      ui.toastSuccess(t('{name} deleted', { name: driver.fullName }));
    }
    await load();
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}

async function restore(driver) {
  busy.value = driver.userId;
  try {
    await adminApi.restoreDriver(driver.userId);
    ui.toastSuccess(t('{name} restored', { name: driver.fullName }));
    await load();
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}
```

5. In the template, change `@accept="confirmSuspend"` to
   `@accept="confirmAction"`, and change the dialog's initial ref to
   `ref({ open: false, config: {}, driver: null, action: null })`.

- [ ] **Step 2: Template**

1. Add a Joined column header after Rating:
   `<th scope="col" class="p-3">{{ t('Joined') }}</th>`.

2. Add its cell after the Rating `<td>`:

```vue
                <td :data-label="t('Joined')" class="p-3 text-slate-600">{{ formatDateTime(d.createdAt) }}</td>
```

3. Change the Status cell to:

```vue
                <td :data-label="t('Status')" class="p-3">
                  <DeletedBadge v-if="d.deletedAt" :at="d.deletedAt" />
                  <template v-else>{{ enumText(d.status) }}</template>
                </td>
```

4. Replace the Actions `<td>` body with:

```vue
                  <button v-if="d.deletedAt" type="button" :disabled="busy === d.userId"
                          class="action-link text-brand-700 hover:underline" @click="restore(d)">
                    {{ t('Restore') }}
                  </button>
                  <span v-else class="flex flex-wrap gap-x-4 gap-y-2">
                    <button v-if="d.status === 'ACTIVE'" type="button" :disabled="busy === d.userId"
                            class="action-link text-red-700 hover:underline" @click="askSuspend(d)">
                      {{ t('Suspend') }}
                    </button>
                    <button v-else-if="d.status === 'PENDING_APPROVAL'" type="button"
                            :disabled="busy === d.userId" class="action-link text-brand-700 hover:underline"
                            @click="approve(d)">
                      {{ t('Approve') }}
                    </button>
                    <button type="button" :disabled="busy === d.userId"
                            class="action-link text-red-700 hover:underline" @click="askDelete(d)">
                      {{ t('Delete') }}
                    </button>
                  </span>
```

- [ ] **Step 3: Check it in the browser**

Check the same things as in Task 7: delete, the Deleted tab, and Restore.
Restoring a driver must leave them offline. A driver with an accepted
delivery must show "This driver has an active delivery."

---

### Task 9: Documentation and the full test run

**Files:**
- Modify: `docs/sdd/architecture/api-design.md` (the admin endpoint table, around line 433)
- Modify: `docs/sdd/specs/spec-10-platform-administration-reporting.md`
- Modify: `docs/testing/test-cases/admin.md`

- [ ] **Step 1: API design**

In the admin table of `api-design.md`:
- Add `&deleted=` (include | only) to the `GET /api/admin/users`,
  `/api/admin/drivers` and `/api/admin/restaurants` rows.
- Add these rows, in the same column format as the existing ones:

```markdown
| DELETE | `/api/admin/users/:id` | A | `{ reason }`; soft delete of a CUSTOMER or ADMIN; revokes sessions |
| POST | `/api/admin/users/:id/restore` | A | Clears `deleted_at`; status unchanged |
| DELETE | `/api/admin/drivers/:id` | A | `{ reason }`; soft delete; sets OFFLINE; refused during an active delivery |
| POST | `/api/admin/drivers/:id/restore` | A | Clears `deleted_at`; stays OFFLINE |
| DELETE | `/api/admin/restaurants/:id` | A | `{ reason }`; soft-deletes the restaurant and its owner; refused with orders in progress |
| POST | `/api/admin/restaurants/:id/restore` | A | Restores the restaurant and its owner; status unchanged |
```

- [ ] **Step 2: spec-10**

Add a section, "Deletion and restore", to spec-10. It summarises spec §5 and
§5a of `docs/superpowers/specs/2026-10-20-admin-restructure-design.md`:
- the rules table;
- the `deleted` list filter;
- that restore keeps the status the record had before deletion.

It links to that spec rather than copying it.

- [ ] **Step 3: Test cases**

1. Update the title of `admin.md` from `(TC-277 – TC-300, TC-418)` to
   `(TC-277 – TC-300, TC-418, TC-425 – TC-430)`.
2. Add cases TC-425 to TC-430 in the file's existing format. Each case's
   title is the matching test's `it` name from Tasks 1–3, and each lists:
   - **Spec:** spec-10
   - **Rules:** BR-A6
3. Append a "Status" line to each case: TC-425 to TC-430 are automated in
   `backend/tests/integration/adminDeletion.test.js`.

- [ ] **Step 4: Full verification**

Run all four:
- `cd backend && npm test`
- `cd frontend && npm test`
- `cd frontend && npx vite build`
- `cd frontend && npx playwright test`

Expected: all of them pass. Report the actual output to George, including
any failure.
