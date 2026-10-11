import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeOrder, makeDriver,
  makeAssignment, authHeader,
} from '../helpers/factories.js';
import { dispatchJob } from '../../src/jobs/dispatch.job.js';
import { offerExpiryJob } from '../../src/jobs/offerExpiry.job.js';
import { unassignedEscalationJob } from '../../src/jobs/unassignedEscalation.job.js';

beforeEach(async () => { await resetDatabase(); });

async function confirmedOrder({ status = 'CONFIRMED' } = {}) {
  const customer = await makeUser({ role: 'CUSTOMER' });
  const address = await makeAddress(customer);
  const r = await makeStockedRestaurant();
  const order = await makeOrder({
    customer, restaurant: r.restaurant, address, status, dispatchState: 'UNASSIGNED',
  });
  return { customer, address, order, ...r };
}

describe('TC-229..TC-237: driver provisioning and profile', () => {
  it('TC-229: an admin creates a driver and the password is shown exactly once', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const res = await request(app).post('/api/admin/drivers').set(authHeader(admin))
      .send({ email: 'newdriver@example.com', fullName: 'Omar Nasser', phone: '+201001110000', vehicleType: 'MOTORCYCLE', vehiclePlate: 'ABC 1234' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('DRIVER');
    expect(res.body.data.driverProfile.status).toBe('PENDING_APPROVAL');
    expect(res.body.data.initialPassword).toEqual(expect.any(String));

    // It works for login...
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'newdriver@example.com', password: res.body.data.initialPassword });
    expect(login.status).toBe(200);

    // ...and is never retrievable afterwards.
    const listed = await request(app).get('/api/admin/drivers').set(authHeader(admin));
    expect(JSON.stringify(listed.body)).not.toContain('initialPassword');

    const audit = await knex('admin_audit_logs').where({ action: 'DRIVER_CREATED' });
    expect(audit).toHaveLength(1);
  });

  it('TC-230: a driver cannot be self-registered', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'selfdriver@example.com', password: 'Str0ngPass',
      fullName: 'Self Driver', phone: '+201000000001', role: 'DRIVER',
    });
    expect(res.status).toBe(403);
    expect(await knex('users').where({ email: 'selfdriver@example.com' })).toHaveLength(0);
  });

  it('TC-231/TC-232: a pending driver is inert until approved', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { user, profile } = await makeDriver({ status: 'PENDING_APPROVAL', availability: 'OFFLINE' });

    expect((await request(app).get('/api/driver/offers').set(authHeader(user))).status).toBe(403);

    const { order } = await confirmedOrder();
    await dispatchJob();
    expect(await knex('delivery_assignments')).toHaveLength(0);
    expect(order.id).toBeTruthy();
    expect(profile.id).toBeTruthy();

    await request(app).post(`/api/admin/drivers/${user.id}/approve`).set(authHeader(admin)).send({});
    expect((await request(app).patch('/api/driver/availability').set(authHeader(user))
      .send({ availability: 'AVAILABLE' })).status).toBe(200);
  });

  it('TC-236: a driver on an active delivery cannot go offline', async () => {
    const { order } = await confirmedOrder({ status: 'READY_FOR_PICKUP' });
    const { user } = await makeDriver({ availability: 'ON_DELIVERY' });
    await makeAssignment(order, user, { status: 'ACCEPTED' });

    const res = await request(app).patch('/api/driver/availability')
      .set(authHeader(user)).send({ availability: 'OFFLINE' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_HAS_ACTIVE_DELIVERY');
  });

  it('TC-237: location updates are validated', async () => {
    const { user } = await makeDriver();
    expect((await request(app).patch('/api/driver/location').set(authHeader(user))
      .send({ latitude: 24.7, longitude: 46.7 })).status).toBe(200);
    expect((await request(app).patch('/api/driver/location').set(authHeader(user))
      .send({ latitude: 91, longitude: 46.7 })).status).toBe(422);
    expect((await request(app).patch('/api/driver/location').set(authHeader(user))
      .send({ latitude: 24.7 })).status).toBe(422);
  });
});

describe('TC-238..TC-244: dispatch', () => {
  it('TC-238: dispatch creates exactly one offer for a confirmed order', async () => {
    const { order } = await confirmedOrder();
    const { user: driver } = await makeDriver();

    const result = await dispatchJob();
    expect(result.offered).toBe(1);

    const assignments = await knex('delivery_assignments').where({ order_id: order.id });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ status: 'OFFERED', driver_user_id: driver.id });

    const row = await knex('orders').where({ id: order.id }).first();
    expect(row.dispatch_state).toBe('OFFERED');
  });

  it('TC-239: only ACTIVE and AVAILABLE drivers are candidates', async () => {
    await confirmedOrder();
    await makeDriver({ availability: 'OFFLINE' });
    await makeDriver({ status: 'PENDING_APPROVAL' });
    const { user: busy } = await makeDriver({ availability: 'ON_DELIVERY' });

    // The busy driver already holds an accepted assignment elsewhere.
    const other = await confirmedOrder({ status: 'READY_FOR_PICKUP' });
    await makeAssignment(other.order, busy, { status: 'ACCEPTED' });

    const result = await dispatchJob();
    expect(result.offered).toBe(0);
  });

  it('TC-241: a second tick does not create a second live offer', async () => {
    await confirmedOrder();
    await makeDriver();

    await dispatchJob();
    await dispatchJob();

    const open = await knex('delivery_assignments').where({ status: 'OFFERED' });
    expect(open).toHaveLength(1);
  });

  it('TC-242/TC-243: an expired offer is re-dispatched to a different driver', async () => {
    const { order } = await confirmedOrder();
    const { user: first } = await makeDriver();
    const { user: second } = await makeDriver();

    await dispatchJob();
    const original = await knex('delivery_assignments').where({ order_id: order.id }).first();

    // Accepting an expired offer is refused.
    await knex('delivery_assignments').where({ id: original.id })
      .update({ expires_at: new Date(Date.now() - 1000) });
    const late = await request(app)
      .post(`/api/driver/offers/${original.id}/accept`)
      .set(authHeader(original.driver_user_id === first.id ? first : second)).send({});
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('OFFER_NO_LONGER_AVAILABLE');

    await offerExpiryJob();
    await dispatchJob();

    const all = await knex('delivery_assignments').where({ order_id: order.id });
    const live = all.find((a) => a.status === 'OFFERED');
    expect(live).toBeDefined();
    expect(live.driver_user_id).not.toBe(original.driver_user_id);
  });

  it('TC-244: a declined offer is never re-offered to the same driver', async () => {
    const { order } = await confirmedOrder();
    const { user: only } = await makeDriver();

    await dispatchJob();
    const offer = await knex('delivery_assignments').where({ order_id: order.id }).first();

    const declined = await request(app)
      .post(`/api/driver/offers/${offer.id}/decline`).set(authHeader(only)).send({ reason: 'Too far' });
    expect(declined.status).toBe(204);

    await dispatchJob();
    await dispatchJob();

    const offers = await knex('delivery_assignments')
      .where({ order_id: order.id, driver_user_id: only.id });
    expect(offers).toHaveLength(1);
    expect(offers[0].status).toBe('DECLINED');

    const row = await knex('orders').where({ id: order.id }).first();
    expect(row.status).toBe('CONFIRMED');
    expect(row.dispatch_state).toBe('UNASSIGNED');
  });
});

describe('TC-245..TC-248: acceptance under concurrency', () => {
  it('TC-245: accepting assigns the driver and marks them ON_DELIVERY', async () => {
    const { order } = await confirmedOrder();
    const { user: driver } = await makeDriver();
    await dispatchJob();
    const offer = await knex('delivery_assignments').where({ order_id: order.id }).first();

    const res = await request(app)
      .post(`/api/driver/offers/${offer.id}/accept`).set(authHeader(driver)).send({});

    expect(res.status).toBe(200);
    const row = await knex('orders').where({ id: order.id }).first();
    expect(row.driver_user_id).toBe(driver.id);
    expect(row.dispatch_state).toBe('ASSIGNED');

    const profile = await knex('driver_profiles').where({ user_id: driver.id }).first();
    expect(profile.availability).toBe('ON_DELIVERY');
  });

  it('only one live offer per order can exist at all', async () => {
    const { order } = await confirmedOrder();
    const { user: a } = await makeDriver();
    const { user: b } = await makeDriver();
    await makeAssignment(order, a);

    // uq_assignments_order_open makes a second simultaneous offer impossible,
    // which is why "two drivers race for one order" can only arise through a
    // stale offer, not through two live ones.
    await expect(makeAssignment(order, b)).rejects.toThrow(/uq_assignments_order_open/);
  });

  it('TC-246: concurrent accepts of one offer produce exactly one acceptance', async () => {
    const { order } = await confirmedOrder();
    const { user: driver } = await makeDriver();
    await dispatchJob();
    const offer = await knex('delivery_assignments').where({ order_id: order.id }).first();

    // A double-tap or a retry: both requests race on the same offer.
    const results = await Promise.allSettled([
      request(app).post(`/api/driver/offers/${offer.id}/accept`).set(authHeader(driver)).send({}),
      request(app).post(`/api/driver/offers/${offer.id}/accept`).set(authHeader(driver)).send({}),
    ]);

    const statuses = results.map((r) => r.value.status).sort();
    expect(statuses).toEqual([200, 409]);

    const accepted = await knex('delivery_assignments').where({ order_id: order.id, status: 'ACCEPTED' });
    expect(accepted).toHaveLength(1);

    const row = await knex('orders').where({ id: order.id }).first();
    expect(row.driver_user_id).toBe(driver.id);
    expect(row.dispatch_state).toBe('ASSIGNED');
  });

  it('TC-246b: a second driver cannot accept an order already accepted', async () => {
    const { order } = await confirmedOrder();
    const { user: winner } = await makeDriver();
    const { user: latecomer } = await makeDriver();

    const won = await makeAssignment(order, winner);
    await request(app).post(`/api/driver/offers/${won.id}/accept`).set(authHeader(winner)).send({});

    // A stale offer that was created before the winner accepted.
    const stale = await knex('delivery_assignments').insert({
      order_id: order.id, driver_user_id: latecomer.id, status: 'OFFERED',
      expires_at: new Date(Date.now() + 90_000),
    }).returning('*').then(([r]) => r);

    const res = await request(app)
      .post(`/api/driver/offers/${stale.id}/accept`).set(authHeader(latecomer)).send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OFFER_NO_LONGER_AVAILABLE');

    const accepted = await knex('delivery_assignments').where({ order_id: order.id, status: 'ACCEPTED' });
    expect(accepted).toHaveLength(1);
    expect(accepted[0].driver_user_id).toBe(winner.id);
  });

  it('TC-247: a driver cannot hold two accepted deliveries', async () => {
    const first = await confirmedOrder({ status: 'READY_FOR_PICKUP' });
    const second = await confirmedOrder();
    const { user: driver } = await makeDriver({ availability: 'ON_DELIVERY' });

    await makeAssignment(first.order, driver, { status: 'ACCEPTED' });
    const offer = await makeAssignment(second.order, driver);

    const res = await request(app)
      .post(`/api/driver/offers/${offer.id}/accept`).set(authHeader(driver)).send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_HAS_ACTIVE_DELIVERY');
  });

  it('TC-248: a driver on a delivery receives no new offers', async () => {
    const busyOrder = await confirmedOrder({ status: 'READY_FOR_PICKUP' });
    const { user: driver } = await makeDriver({ availability: 'ON_DELIVERY' });
    await makeAssignment(busyOrder.order, driver, { status: 'ACCEPTED' });

    await confirmedOrder();
    const result = await dispatchJob();
    expect(result.offered).toBe(0);
  });
});

describe('TC-249..TC-251: the no-driver case', () => {
  it('TC-249: with no driver the order is never cancelled or altered', async () => {
    const { order } = await confirmedOrder({ status: 'READY_FOR_PICKUP' });

    await dispatchJob();
    await dispatchJob();
    await dispatchJob();

    const row = await knex('orders').where({ id: order.id }).first();
    expect(row.status).toBe('READY_FOR_PICKUP');
    expect(row.dispatch_state).toBe('UNASSIGNED');
    expect(row.cancelled_at).toBeNull();
    expect(await knex('delivery_assignments')).toHaveLength(0);
  });

  it('TC-250: an order unassigned past the threshold is escalated to the admin backlog', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const stale = await confirmedOrder({ status: 'READY_FOR_PICKUP' });
    const fresh = await confirmedOrder({ status: 'READY_FOR_PICKUP' });

    await knex('orders').where({ id: stale.order.id })
      .update({ confirmed_at: knex.raw("now() - interval '16 minutes'") });

    const result = await unassignedEscalationJob();
    expect(result.escalated).toBe(1);

    const backlog = await request(app).get('/api/admin/orders/unassigned').set(authHeader(admin));
    const ids = backlog.body.data.map((o) => o.id);
    expect(ids).toContain(stale.order.id);
    expect(ids).not.toContain(fresh.order.id);
  });

  it('TC-251: a driver coming online picks up a waiting order', async () => {
    const { order } = await confirmedOrder();
    await dispatchJob();
    expect(await knex('delivery_assignments')).toHaveLength(0);

    await makeDriver();
    await dispatchJob();

    const assignments = await knex('delivery_assignments').where({ order_id: order.id });
    expect(assignments).toHaveLength(1);
  });
});

describe('TC-252..TC-254: progressive PII disclosure', () => {
  it('TC-252: an offer shows distance and district but not the customer', async () => {
    const { customer } = await confirmedOrder();
    const { user: driver } = await makeDriver();
    await dispatchJob();

    const res = await request(app).get('/api/driver/offers').set(authHeader(driver));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const offer = res.body.data[0];
    expect(offer.order.dropoff.district).toBe('Al Olaya');
    expect(offer.order.dropoff).not.toHaveProperty('line1');

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('4412 King Fahd Road');
    expect(body).not.toContain(customer.email);
    expect(body).not.toContain(customer.full_name);
  });

  it('TC-253: an accepted delivery shows the address, first name and masked phone only', async () => {
    const { order, customer } = await confirmedOrder({ status: 'READY_FOR_PICKUP' });
    const { user: driver } = await makeDriver();
    await knex('orders').where({ id: order.id }).update({ driver_user_id: driver.id });
    await makeAssignment(order, driver, { status: 'ACCEPTED' });

    const res = await request(app)
      .get(`/api/driver/deliveries/${order.id}`).set(authHeader(driver));

    expect(res.status).toBe(200);
    expect(res.body.data.dropoff.line1).toBe('4412 King Fahd Road');
    expect(res.body.data.dropoff.customerFirstName).toBeTruthy();
    expect(res.body.data.dropoff.customerPhone).toMatch(/\*/);
    expect(JSON.stringify(res.body)).not.toContain(customer.email);
  });

  it('TC-254: delivery history is scoped to the driver', async () => {
    const a = await confirmedOrder({ status: 'DELIVERED' });
    const { user: driverA } = await makeDriver();
    const { user: driverB } = await makeDriver();
    await knex('orders').where({ id: a.order.id }).update({ driver_user_id: driverA.id });

    const mine = await request(app).get('/api/driver/deliveries?scope=history').set(authHeader(driverA));
    const theirs = await request(app).get('/api/driver/deliveries?scope=history').set(authHeader(driverB));

    expect(mine.body.data.map((d) => d.id)).toContain(a.order.id);
    expect(theirs.body.data).toEqual([]);
  });
});
