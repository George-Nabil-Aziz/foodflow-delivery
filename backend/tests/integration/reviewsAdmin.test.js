import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeOrder, makeDriver,
  makeAssignment, makeReview, authHeader,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

async function deliveredOrder({ withDriver = true } = {}) {
  const customer = await makeUser({ role: 'CUSTOMER' });
  const address = await makeAddress(customer);
  const r = await makeStockedRestaurant();
  const driver = withDriver ? (await makeDriver()).user : null;
  const order = await makeOrder({
    customer, restaurant: r.restaurant, address, driver, status: 'DELIVERED',
  });
  return { customer, address, order, driver, ...r };
}

describe('TC-255..TC-266: review creation', () => {
  it('TC-255: a delivered order can be reviewed and the aggregate updates at once', async () => {
    const { customer, order, restaurant } = await deliveredOrder();

    const res = await request(app).post('/api/reviews').set(authHeader(customer))
      .send({ orderId: order.id, restaurantRating: 5, driverRating: 4, comment: 'Fast and hot.' });

    expect(res.status).toBe(201);
    expect(res.body.data.restaurant.ratingAverage).toBe('5.00');
    expect(res.body.data.restaurant.ratingCount).toBe(1);
    expect(res.body.data.editableUntil).toBeTruthy();

    const row = await knex('restaurants').where({ id: restaurant.id }).first();
    expect(row.rating_average).toBe('5.00');
    expect(row.rating_count).toBe(1);
  });

  it('TC-256/TC-257: non-delivered and cancelled orders are not reviewable', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant();

    for (const status of ['PENDING', 'PREPARING', 'OUT_FOR_DELIVERY', 'CANCELLED']) {
      const order = await makeOrder({ customer, restaurant: r.restaurant, address, status });
      const res = await request(app).post('/api/reviews').set(authHeader(customer))
        .send({ orderId: order.id, restaurantRating: 5 });

      expect(res.status, status).toBe(422);
      expect(res.body.error.code).toBe('ORDER_NOT_REVIEWABLE');
    }
    expect(await knex('reviews')).toHaveLength(0);
  });

  it('TC-258/TC-259: one review per order, even under a concurrent double submit', async () => {
    const { customer, order } = await deliveredOrder();
    const body = { orderId: order.id, restaurantRating: 5 };

    const results = await Promise.allSettled([
      request(app).post('/api/reviews').set(authHeader(customer)).send(body),
      request(app).post('/api/reviews').set(authHeader(customer)).send(body),
    ]);

    const statuses = results.map((r) => r.value.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await knex('reviews')).toHaveLength(1);

    const restaurant = await knex('restaurants').where({ id: order.restaurant_id }).first();
    expect(restaurant.rating_count).toBe(1);
  });

  it('TC-260: only the order own customer may review it', async () => {
    const { order } = await deliveredOrder();
    const stranger = await makeUser({ role: 'CUSTOMER' });

    const res = await request(app).post('/api/reviews').set(authHeader(stranger))
      .send({ orderId: order.id, restaurantRating: 5 });

    expect(res.status).toBe(404);
    expect(await knex('reviews')).toHaveLength(0);
  });

  it('TC-262: rating boundaries', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant();

    for (const [rating, expected] of [[0, 422], [1, 201], [5, 201], [6, 422], [3.5, 422]]) {
      const order = await makeOrder({ customer, restaurant: r.restaurant, address, status: 'DELIVERED' });
      const res = await request(app).post('/api/reviews').set(authHeader(customer))
        .send({ orderId: order.id, restaurantRating: rating });
      expect(res.status, `rating ${rating}`).toBe(expected);
    }

    const order = await makeOrder({ customer, restaurant: r.restaurant, address, status: 'DELIVERED' });
    expect((await request(app).post('/api/reviews').set(authHeader(customer))
      .send({ orderId: order.id })).status).toBe(422);
  });

  it('TC-263/TC-265: a driver rating requires a driver and updates their aggregate', async () => {
    const noDriver = await deliveredOrder({ withDriver: false });
    const refused = await request(app).post('/api/reviews').set(authHeader(noDriver.customer))
      .send({ orderId: noDriver.order.id, restaurantRating: 5, driverRating: 4 });
    expect(refused.status).toBe(422);
    expect(refused.body.error.details[0].field).toBe('driverRating');

    const withDriver = await deliveredOrder();
    const ok = await request(app).post('/api/reviews').set(authHeader(withDriver.customer))
      .send({ orderId: withDriver.order.id, restaurantRating: 5, driverRating: 4 });
    expect(ok.status).toBe(201);

    const profile = await knex('driver_profiles').where({ user_id: withDriver.driver.id }).first();
    expect(profile.rating_average).toBe('4.00');
    expect(profile.rating_count).toBe(1);
  });

  it('TC-266: comment length boundary', async () => {
    const short = await deliveredOrder();
    expect((await request(app).post('/api/reviews').set(authHeader(short.customer))
      .send({ orderId: short.order.id, restaurantRating: 4, comment: 'a'.repeat(1000) })).status).toBe(201);

    const long = await deliveredOrder();
    expect((await request(app).post('/api/reviews').set(authHeader(long.customer))
      .send({ orderId: long.order.id, restaurantRating: 4, comment: 'a'.repeat(1001) })).status).toBe(422);
  });
});

describe('TC-268..TC-271: the edit window', () => {
  it('TC-268: editing inside 24 hours succeeds and recomputes', async () => {
    const { customer, order, restaurant } = await deliveredOrder();
    const created = await request(app).post('/api/reviews').set(authHeader(customer))
      .send({ orderId: order.id, restaurantRating: 5 });

    const res = await request(app).patch(`/api/reviews/${created.body.data.id}`)
      .set(authHeader(customer)).send({ restaurantRating: 3 });

    expect(res.status).toBe(200);
    const row = await knex('restaurants').where({ id: restaurant.id }).first();
    expect(row.rating_average).toBe('3.00');
  });

  it('TC-269/TC-270: editing after 24 hours is refused', async () => {
    const { customer, order } = await deliveredOrder();
    const review = await makeReview(order, customer, {
      createdAt: knex.raw("now() - interval '25 hours'"),
    });

    const res = await request(app).patch(`/api/reviews/${review.id}`)
      .set(authHeader(customer)).send({ restaurantRating: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REVIEW_EDIT_WINDOW_CLOSED');
    expect(res.body.error.details[0].editableUntil).toBeTruthy();
  });

  it('TC-271: another customer cannot edit a review', async () => {
    const { customer, order } = await deliveredOrder();
    const review = await makeReview(order, customer);
    const stranger = await makeUser({ role: 'CUSTOMER' });

    const res = await request(app).patch(`/api/reviews/${review.id}`)
      .set(authHeader(stranger)).send({ restaurantRating: 1 });
    expect(res.status).toBe(404);
  });
});

describe('TC-272..TC-276: aggregates and public exposure', () => {
  async function restaurantWithReviews(ratings) {
    const r = await makeStockedRestaurant();
    const reviews = [];
    for (const rating of ratings) {
      const customer = await makeUser({ role: 'CUSTOMER' });
      const address = await makeAddress(customer);
      const order = await makeOrder({
        customer, restaurant: r.restaurant, address, status: 'DELIVERED',
      });
      const created = await request(app).post('/api/reviews').set(authHeader(customer))
        .send({ orderId: order.id, restaurantRating: rating, comment: `Rated ${rating}` });
      reviews.push({ id: created.body.data.id, rating, customer });
    }
    return { ...r, reviews };
  }

  it('TC-272: aggregate arithmetic across a review set', async () => {
    const { restaurant } = await restaurantWithReviews([5, 4, 3]);
    const row = await knex('restaurants').where({ id: restaurant.id }).first();
    expect(row.rating_average).toBe('4.00');
    expect(row.rating_count).toBe(3);
  });

  it('TC-273/TC-274: hiding lowers the aggregate and restoring reverses it exactly', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { restaurant, reviews } = await restaurantWithReviews([5, 4, 3]);
    const threeStar = reviews.find((r) => r.rating === 3);

    const hidden = await request(app).post(`/api/admin/reviews/${threeStar.id}/hide`)
      .set(authHeader(admin)).send({ reason: 'Abusive language reported' });
    expect(hidden.status).toBe(200);

    let row = await knex('restaurants').where({ id: restaurant.id }).first();
    expect(row.rating_average).toBe('4.50');
    expect(row.rating_count).toBe(2);

    const publicList = await request(app).get(`/api/restaurants/${restaurant.id}/reviews`);
    expect(publicList.body.data.map((r) => r.id)).not.toContain(threeStar.id);

    const restored = await request(app).post(`/api/admin/reviews/${threeStar.id}/restore`)
      .set(authHeader(admin)).send({});
    expect(restored.status).toBe(200);

    row = await knex('restaurants').where({ id: restaurant.id }).first();
    expect(row.rating_average).toBe('4.00');
    expect(row.rating_count).toBe(3);
  });

  it('TC-275: a restaurant whose only review is hidden returns to unrated', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { restaurant, reviews } = await restaurantWithReviews([5]);

    await request(app).post(`/api/admin/reviews/${reviews[0].id}/hide`)
      .set(authHeader(admin)).send({ reason: 'Moderation test case' });

    const row = await knex('restaurants').where({ id: restaurant.id }).first();
    expect(row.rating_average).toBe('0.00');
    expect(row.rating_count).toBe(0);
  });

  it('TC-276: public review payloads carry no PII and render script text inertly', async () => {
    const { customer, order, restaurant } = await deliveredOrder();
    await request(app).post('/api/reviews').set(authHeader(customer)).send({
      orderId: order.id, restaurantRating: 5, comment: '<script>alert(1)</script>',
    });

    const res = await request(app).get(`/api/restaurants/${restaurant.id}/reviews`);
    const body = JSON.stringify(res.body);

    expect(res.body.data[0].customer.displayName).toMatch(/^\S+ \S\.$/);
    expect(body).not.toContain(customer.email);
    expect(body).not.toContain(customer.phone);
    expect(body).not.toContain('customer_user_id');
    // Stored verbatim: escaping is the renderer's job, not the API's.
    expect(res.body.data[0].comment).toBe('<script>alert(1)</script>');
  });

  it('TC-420/TC-421: own reviews and owner reviews are scoped', async () => {
    const { customer, order, owner } = await deliveredOrder();
    await request(app).post('/api/reviews').set(authHeader(customer))
      .send({ orderId: order.id, restaurantRating: 4 });
    const stranger = await makeUser({ role: 'CUSTOMER' });

    const mine = await request(app).get('/api/reviews/mine').set(authHeader(customer));
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].isEditable).toBe(true);

    const none = await request(app).get('/api/reviews/mine').set(authHeader(stranger));
    expect(none.body.data).toEqual([]);

    const received = await request(app).get('/api/restaurant/reviews').set(authHeader(owner));
    expect(received.status).toBe(200);
    expect(received.body.data).toHaveLength(1);
    expect(JSON.stringify(received.body)).not.toContain(customer.email);
  });
});

describe('TC-277..TC-300: administration', () => {
  it('TC-278: suspension revokes sessions and blocks the live token', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    await request(app).post('/api/auth/register').send({
      email: 'victim@example.com', password: 'Str0ngPass', fullName: 'Vic Tim',
      phone: '+201000000009', role: 'CUSTOMER',
    });
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'victim@example.com', password: 'Str0ngPass' });
    const victim = await knex('users').where({ email: 'victim@example.com' }).first();

    const res = await request(app).post(`/api/admin/users/${victim.id}/suspend`)
      .set(authHeader(admin)).send({ reason: 'Fraudulent activity detected' });
    expect(res.status).toBe(200);

    const live = await request(app).get('/api/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(live.status).toBe(403);
    expect(live.body.error.code).toBe('ACCOUNT_SUSPENDED');

    const refreshed = await request(app).post('/api/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken });
    expect(refreshed.status).toBe(401);

    const relogin = await request(app).post('/api/auth/login')
      .send({ email: 'victim@example.com', password: 'Str0ngPass' });
    expect(relogin.status).toBe(403);
  });

  it('TC-279: reactivation restores access', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const user = await makeUser({ role: 'CUSTOMER', status: 'SUSPENDED' });

    await request(app).post(`/api/admin/users/${user.id}/reactivate`).set(authHeader(admin)).send({});
    expect((await knex('users').where({ id: user.id }).first()).status).toBe('ACTIVE');
  });

  it('TC-282: a reason is mandatory and bounded', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const user = await makeUser({ role: 'CUSTOMER' });

    for (const body of [{}, { reason: '' }, { reason: 'abcd' }, { reason: 'a'.repeat(301) }]) {
      const res = await request(app).post(`/api/admin/users/${user.id}/suspend`)
        .set(authHeader(admin)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    expect((await knex('users').where({ id: user.id }).first()).status).toBe('ACTIVE');
    expect(await knex('admin_audit_logs')).toHaveLength(0);
  });

  it('TC-088/TC-089: approval requires at least one available item', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { restaurant: empty } = await makeStockedRestaurant({ status: 'PENDING_APPROVAL' });
    await knex('food_items').where({ restaurant_id: empty.id }).update({ is_available: false });

    const refused = await request(app).post(`/api/admin/restaurants/${empty.id}/approve`)
      .set(authHeader(admin)).send({});
    expect(refused.status).toBe(422);
    expect((await knex('restaurants').where({ id: empty.id }).first()).status).toBe('PENDING_APPROVAL');

    await knex('food_items').where({ restaurant_id: empty.id }).update({ is_available: true });
    const approved = await request(app).post(`/api/admin/restaurants/${empty.id}/approve`)
      .set(authHeader(admin)).send({});
    expect(approved.status).toBe(200);

    const listed = await request(app).get('/api/restaurants');
    expect(listed.body.data.map((r) => r.id)).toContain(empty.id);
  });

  it('TC-090: rejection reason reaches the owner', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const { restaurant, owner } = await makeStockedRestaurant({ status: 'PENDING_APPROVAL' });

    await request(app).post(`/api/admin/restaurants/${restaurant.id}/reject`)
      .set(authHeader(admin)).send({ reason: 'Address could not be verified' });

    const profile = await request(app).get('/api/restaurant/profile').set(authHeader(owner));
    expect(profile.body.data.status).toBe('REJECTED');
    expect(profile.body.data.rejectionReason).toBe('Address could not be verified');
  });

  it('TC-283: suspending a restaurant hides it without stranding in-flight orders', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const { restaurant, owner } = await makeStockedRestaurant();
    const inFlight = await makeOrder({
      customer, restaurant, address, status: 'PREPARING',
    });

    await request(app).post(`/api/admin/restaurants/${restaurant.id}/suspend`)
      .set(authHeader(admin)).send({ reason: 'Health inspection pending' });

    const listed = await request(app).get('/api/restaurants');
    expect(listed.body.data.map((r) => r.id)).not.toContain(restaurant.id);

    // The in-flight order still exists and is untouched.
    const row = await knex('orders').where({ id: inFlight.id }).first();
    expect(row.status).toBe('PREPARING');

    // The owner can still authenticate and see what happened.
    const profile = await request(app).get('/api/restaurant/profile').set(authHeader(owner));
    expect(profile.status).toBe(200);
    expect(profile.body.data.status).toBe('SUSPENDED');
  });

  it('TC-287/TC-288: a driver mid-delivery cannot be suspended, one holding an offer can', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const { restaurant } = await makeStockedRestaurant();

    const busyOrder = await makeOrder({ customer, restaurant, address, status: 'READY_FOR_PICKUP' });
    const { user: busy } = await makeDriver({ availability: 'ON_DELIVERY' });
    await makeAssignment(busyOrder, busy, { status: 'ACCEPTED' });

    const refused = await request(app).post(`/api/admin/drivers/${busy.id}/suspend`)
      .set(authHeader(admin)).send({ reason: 'Complaint under investigation' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('DRIVER_HAS_ACTIVE_DELIVERY');

    const offeredOrder = await makeOrder({ customer, restaurant, address, status: 'CONFIRMED' });
    const { user: offered } = await makeDriver();
    await makeAssignment(offeredOrder, offered, { status: 'OFFERED' });

    const allowed = await request(app).post(`/api/admin/drivers/${offered.id}/suspend`)
      .set(authHeader(admin)).send({ reason: 'Complaint under investigation' });
    expect(allowed.status).toBe(200);
  });

  it('TC-293/TC-294: force-cancel releases the driver; terminal orders are refused', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const { restaurant } = await makeStockedRestaurant();
    const { user: driver } = await makeDriver({ availability: 'ON_DELIVERY' });

    const order = await makeOrder({
      customer, restaurant, address, driver, status: 'OUT_FOR_DELIVERY',
    });
    await makeAssignment(order, driver, { status: 'ACCEPTED' });

    const res = await request(app).post(`/api/admin/orders/${order.id}/force-cancel`)
      .set(authHeader(admin)).send({ reason: 'UNDELIVERABLE_ADDRESS', note: 'Customer unreachable' });

    expect(res.status).toBe(200);
    const row = await knex('orders').where({ id: order.id }).first();
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelled_by).toBe('ADMIN');

    const profile = await knex('driver_profiles').where({ user_id: driver.id }).first();
    expect(profile.availability).toBe('AVAILABLE');

    const assignment = await knex('delivery_assignments').where({ order_id: order.id }).first();
    expect(assignment.status).toBe('CANCELLED');

    // Terminal orders refuse a force-cancel, even for an admin.
    const again = await request(app).post(`/api/admin/orders/${order.id}/force-cancel`)
      .set(authHeader(admin)).send({ reason: 'ADMIN_INTERVENTION' });
    expect(again.status).toBe(409);
  });

  it('TC-296/TC-297: GMV counts delivered orders only', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const { restaurant } = await makeStockedRestaurant();

    await makeOrder({ customer, restaurant, address, status: 'DELIVERED' });
    await makeOrder({ customer, restaurant, address, status: 'CANCELLED' });
    await makeOrder({ customer, restaurant, address, status: 'PENDING' });

    const res = await request(app).get('/api/admin/stats').set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.orders.byStatus.DELIVERED).toBe(1);
    expect(res.body.data.orders.byStatus.CANCELLED).toBe(1);
    expect(res.body.data.orders.byStatus.PENDING).toBe(1);
    // One delivered order at the canonical total.
    // 2 x 58.00 = 116.00 subtotal + 12.00 fee + 16.24 tax (14% VAT) = 144.24
    expect(res.body.data.gmv.today).toBe('144.24');
  });

  it('TC-299/TC-300/TC-424: mutations are audited, failures are not', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const user = await makeUser({ role: 'CUSTOMER' });
    const { restaurant } = await makeStockedRestaurant({ status: 'PENDING_APPROVAL' });

    await request(app).post(`/api/admin/users/${user.id}/suspend`)
      .set(authHeader(admin)).send({ reason: 'Policy violation confirmed' });
    await request(app).post(`/api/admin/restaurants/${restaurant.id}/approve`)
      .set(authHeader(admin)).send({});

    const logs = await knex('admin_audit_logs').orderBy('created_at');
    expect(logs.map((l) => l.action)).toEqual(['USER_SUSPENDED', 'RESTAURANT_APPROVED']);
    expect(logs[0].admin_user_id).toBe(admin.id);
    expect(logs[0].metadata.reason).toBe('Policy violation confirmed');

    // A failed mutation writes nothing.
    const before = (await knex('admin_audit_logs')).length;
    await request(app).post(`/api/admin/restaurants/${restaurant.id}/approve`)
      .set(authHeader(admin)).send({});
    expect((await knex('admin_audit_logs')).length).toBe(before);

    const listed = await request(app)
      .get(`/api/admin/audit-logs?entityType=user&entityId=${user.id}`).set(authHeader(admin));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].admin.id).toBe(admin.id);
  });
});
