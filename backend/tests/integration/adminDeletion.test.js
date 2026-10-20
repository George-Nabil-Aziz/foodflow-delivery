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
    const { user: liveDriver } = await makeDriver({ status: 'ACTIVE' });
    const activeDrivers = await request(app).get('/api/admin/drivers?status=ACTIVE').set(authHeader(admin));
    expect(activeDrivers.body.data.map((d) => d.userId)).toEqual([liveDriver.id]);

    const { restaurant } = await makeStockedRestaurant();
    await knex('restaurants').where({ id: restaurant.id }).update({ deleted_at: knex.fn.now() });
    const rAll = await request(app).get('/api/admin/restaurants').set(authHeader(admin));
    expect(ids(rAll)).toContain(restaurant.id);
    const rOnly = await request(app).get('/api/admin/restaurants?deleted=only').set(authHeader(admin));
    expect(ids(rOnly)).toEqual([restaurant.id]);
    expect(rOnly.body.data[0].deletedAt).not.toBeNull();
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
    expect(busy.body.error.details[0].issue).toBe('This customer has an order in progress. Wait for it to finish, or force-cancel it first.');

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

    expect((await login(owner.email)).status).toBe(401);
    const again = await request(app).delete(`/api/admin/restaurants/${restaurant.id}`).set(authHeader(admin)).send(reason);
    expect(again.status).toBe(409);
    expect(again.body.error.details[0].issue).toBe('This record is already deleted.');
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
    expect(res.body.error.details[0].issue).toBe('This restaurant has orders in progress. Wait for them to finish, or force-cancel them first.');
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
    expect(await knex('admin_audit_logs').where({ action: 'DRIVER_DELETED', entity_id: user.id })).toHaveLength(1);
    expect((await login(user.email)).status).toBe(401);

    const again = await request(app).delete(`/api/admin/drivers/${user.id}`).set(authHeader(admin)).send(reason);
    expect(again.status).toBe(409);
    expect(again.body.error.details[0].issue).toBe('This record is already deleted.');
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
    const second = await request(app).post(`/api/admin/users/${active.id}/restore`).set(authHeader(admin)).send({});
    expect(second.status).toBe(200);
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
    expect(await knex('admin_audit_logs').where({ action: 'RESTAURANT_RESTORED', entity_id: restaurant.id })).toHaveLength(1);
  });

  it('TC-430: a restored driver stays offline', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { user } = await makeDriver();
    await request(app).delete(`/api/admin/drivers/${user.id}`).set(authHeader(admin)).send(reason);

    const res = await request(app).post(`/api/admin/drivers/${user.id}/restore`).set(authHeader(admin)).send({});
    expect(res.status).toBe(200);
    expect((await knex('users').where({ id: user.id }).first()).deleted_at).toBeNull();
    expect((await knex('driver_profiles').where({ user_id: user.id }).first()).availability).toBe('OFFLINE');
    expect(await knex('admin_audit_logs').where({ action: 'DRIVER_RESTORED', entity_id: user.id })).toHaveLength(1);
  });

  it('TC-430: refuses a record that is not deleted, and role accounts on /users', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const live = await makeUser({ role: 'CUSTOMER' });
    const notDeleted = await request(app).post(`/api/admin/users/${live.id}/restore`).set(authHeader(admin)).send({});
    expect(notDeleted.status).toBe(409);
    expect(notDeleted.body.error.details[0].issue).toBe('This record is not deleted.');

    const { user: liveDriver } = await makeDriver();
    const driverNotDeleted = await request(app).post(`/api/admin/drivers/${liveDriver.id}/restore`).set(authHeader(admin)).send({});
    expect(driverNotDeleted.status).toBe(409);
    expect(driverNotDeleted.body.error.details[0].issue).toBe('This record is not deleted.');
    const { restaurant: liveRestaurant } = await makeStockedRestaurant();
    const restaurantNotDeleted = await request(app).post(`/api/admin/restaurants/${liveRestaurant.id}/restore`).set(authHeader(admin)).send({});
    expect(restaurantNotDeleted.status).toBe(409);
    expect(restaurantNotDeleted.body.error.details[0].issue).toBe('This record is not deleted.');

    const { user } = await makeDriver();
    await knex('users').where({ id: user.id }).update({ deleted_at: knex.fn.now() });
    const viaUsers = await request(app).post(`/api/admin/users/${user.id}/restore`).set(authHeader(admin)).send({});
    expect(viaUsers.status).toBe(422);
    expect(viaUsers.body.error.details[0].issue).toBe('Restore this account from the Restaurants or Drivers page.');
  });
});

describe('TC-429: dashboard driver counts', () => {
  it('TC-429: a deleted driver drops out of the dashboard counts', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { user } = await makeDriver({ status: 'PENDING_APPROVAL' });

    const before = await request(app).get('/api/admin/stats').set(authHeader(admin));
    expect(before.status).toBe(200);
    const pendingBefore = before.body.data.accounts.pendingDrivers;
    expect(pendingBefore).toBe(1);

    const del = await request(app).delete(`/api/admin/drivers/${user.id}`).set(authHeader(admin)).send(reason);
    expect(del.status).toBe(200);

    const after = await request(app).get('/api/admin/stats').set(authHeader(admin));
    expect(after.body.data.accounts.pendingDrivers).toBe(pendingBefore - 1);
  });
});
