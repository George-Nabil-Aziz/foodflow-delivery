import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { config } from '../../src/config/index.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeDriver, makeStockedRestaurant, makeOrder, authHeader,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms);

const analytics = (owner, query = '') =>
  request(app).get(`/api/restaurant/analytics${query}`).set(authHeader(owner));

/** A delivered order placed `age` ms ago. */
const delivered = (customer, restaurant, over = {}) =>
  makeOrder({ customer, restaurant, status: 'DELIVERED', placedAt: ago(DAY), ...over });

/** Gives an order a discount, keeping chk_orders_totals true. */
async function discount(order, amount) {
  await knex('orders').where({ id: order.id }).update({
    discount_amount: amount,
    total_amount: (Number(order.total_amount) - Number(amount)).toFixed(2),
  });
}

async function addEvent(order, toStatus, at) {
  await knex('order_status_events').insert({
    order_id: order.id, to_status: toStatus, actor_role: 'RESTAURANT', created_at: at,
  });
}

describe('GET /api/restaurant/analytics: figures', () => {
  it('is all zeros and nulls for a restaurant with no orders, with 24 hour buckets', async () => {
    const { owner } = await makeStockedRestaurant();
    const res = await analytics(owner);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      periodDays: 30, timezone: config.platformTimezone, deliveredOrders: 0, revenue: '0.00',
      averageOrderValue: null, cancelledOrders: 0, cancellationRate: null,
      topItems: [], averagePreparationMinutes: null,
    });
    expect(res.body.data.ordersByHour).toHaveLength(24);
    expect(res.body.data.ordersByHour.map((h) => h.hour)).toEqual([...Array(24).keys()]);
    expect(res.body.data.ordersByHour.every((h) => h.orders === 0)).toBe(true);
  });

  it('counts delivered orders and sums revenue as subtotal minus discount, not the total', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const customer = await makeUser();
    // 2 x 58.00 = 116.00 and 1 x 18.00 = 18.00.
    await delivered(customer, restaurant);
    const second = await delivered(customer, restaurant, { items: [{ name: 'Lentil Soup', unitPrice: '18.00', quantity: 1 }] });
    await discount(second, '3.00');

    const { data } = (await analytics(owner)).body;

    expect(data.deliveredOrders).toBe(2);
    // 116.00 + (18.00 - 3.00): delivery fee (12.00) and tax are not revenue.
    expect(data.revenue).toBe('131.00');
    expect(data.averageOrderValue).toBe('65.50');
  });

  it('rounds the average order value to two decimals', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const customer = await makeUser();
    for (const price of ['10.00', '10.00', '10.01']) {
      await delivered(customer, restaurant, { items: [{ name: 'X', unitPrice: price, quantity: 1 }] });
    }
    const { data } = (await analytics(owner)).body;
    expect(data.revenue).toBe('30.01');
    expect(data.averageOrderValue).toBe('10.00');
  });

  it('computes the cancellation rate over finished orders only', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const customer = await makeUser();
    for (let i = 0; i < 3; i += 1) await delivered(customer, restaurant);
    await makeOrder({ customer, restaurant, status: 'CANCELLED', placedAt: ago(DAY) });
    // In progress: in neither side of the fraction.
    await makeOrder({ customer, restaurant, status: 'PREPARING', placedAt: ago(DAY) });

    const { data } = (await analytics(owner)).body;
    expect(data.cancelledOrders).toBe(1);
    expect(data.cancellationRate).toBe(25);
    // A cancelled order earns nothing.
    expect(data.deliveredOrders).toBe(3);
  });

  it('lists the top five items by quantity, best first, ties by name', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const customer = await makeUser();
    const quantities = { A: 7, B: 5, C: 5, D: 3, E: 2, F: 1 };
    for (const [name, quantity] of Object.entries(quantities)) {
      await delivered(customer, restaurant, { items: [{ name: `Dish ${name}`, unitPrice: '10.00', quantity }] });
    }
    // Quantities add up across orders.
    await delivered(customer, restaurant, { items: [{ name: 'Dish F', unitPrice: '10.00', quantity: 3 }] });
    // A cancelled order's items do not count.
    await makeOrder({ customer, restaurant, status: 'CANCELLED', placedAt: ago(DAY),
      items: [{ name: 'Dish G', unitPrice: '10.00', quantity: 20 }] });

    const { topItems } = (await analytics(owner)).body.data;

    expect(topItems.map((i) => [i.name, i.quantity])).toEqual([
      ['Dish A', 7], ['Dish B', 5], ['Dish C', 5], ['Dish F', 4], ['Dish D', 3],
    ]);
    expect(topItems[0].revenue).toBe('70.00');
  });

  it('buckets orders by the hour in the platform time zone, not UTC', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const customer = await makeUser();
    // 22:30 UTC yesterday is already after midnight in Cairo (UTC+2 or +3).
    const placed = new Date(Date.now() - DAY);
    placed.setUTCHours(22, 30, 0, 0);
    await delivered(customer, restaurant, { placedAt: placed });
    await delivered(customer, restaurant, { placedAt: placed });

    const localHour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: config.platformTimezone, hour: '2-digit', hourCycle: 'h23',
    }).format(placed));
    expect(localHour).not.toBe(22);

    const { ordersByHour } = (await analytics(owner)).body.data;
    expect(ordersByHour[localHour]).toEqual({ hour: localHour, orders: 2 });
    expect(ordersByHour[22].orders).toBe(0);
  });

  it('averages preparation time from accepted to ready in the event log', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const customer = await makeUser();
    const base = Date.now() - 5 * HOUR;
    for (const minutes of [10, 30]) {
      const order = await delivered(customer, restaurant);
      await addEvent(order, 'CONFIRMED', new Date(base));
      await addEvent(order, 'PREPARING', new Date(base + 60_000));
      await addEvent(order, 'READY_FOR_PICKUP', new Date(base + minutes * 60_000));
    }
    // Accepted but never ready: no pair, not in the average.
    const stuck = await makeOrder({ customer, restaurant, status: 'PREPARING', placedAt: ago(DAY) });
    await addEvent(stuck, 'CONFIRMED', new Date(base));

    const { data } = (await analytics(owner)).body;
    expect(data.averagePreparationMinutes).toBe(20);
  });
});

describe('GET /api/restaurant/analytics: period and scope', () => {
  it('honours the 7, 30 and 90 day windows and defaults to 30', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const customer = await makeUser();
    await delivered(customer, restaurant, { placedAt: ago(2 * DAY) });
    await delivered(customer, restaurant, { placedAt: ago(20 * DAY) });
    await delivered(customer, restaurant, { placedAt: ago(60 * DAY) });
    await delivered(customer, restaurant, { placedAt: ago(120 * DAY) });

    const counts = {};
    for (const days of [7, 30, 90]) {
      const res = await analytics(owner, `?days=${days}`);
      expect(res.body.data.periodDays).toBe(days);
      counts[days] = res.body.data.deliveredOrders;
    }
    expect(counts).toEqual({ 7: 1, 30: 2, 90: 3 });
    expect((await analytics(owner)).body.data.deliveredOrders).toBe(2);
  });

  it('rejects a period that is not offered', async () => {
    const { owner } = await makeStockedRestaurant();
    for (const bad of ['?days=15', '?days=0', '?days=abc', '?days=365']) {
      const res = await analytics(owner, bad);
      expect(res.status, bad).toBe(422);
    }
  });

  it('shows an owner only their own restaurant, whatever the query says', async () => {
    const mine = await makeStockedRestaurant();
    const theirs = await makeStockedRestaurant();
    const customer = await makeUser();
    await delivered(customer, mine.restaurant);
    await delivered(customer, theirs.restaurant);
    await delivered(customer, theirs.restaurant);
    await makeOrder({ customer, restaurant: theirs.restaurant, status: 'CANCELLED', placedAt: ago(DAY) });

    const res = await analytics(mine.owner, `?days=30&restaurantId=${theirs.restaurant.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deliveredOrders).toBe(1);
    expect(res.body.data.cancelledOrders).toBe(0);
    expect(res.body.data.topItems.map((i) => i.name)).toEqual(['Mixed Grill']);
    const other = await analytics(theirs.owner);
    expect(other.body.data.deliveredOrders).toBe(2);
  });

  it('is for restaurant owners only: other roles are 403, anonymous is 401', async () => {
    const customer = await makeUser();
    const { user: driver } = await makeDriver();
    const admin = await makeUser({ role: 'ADMIN' });

    for (const user of [customer, driver, admin]) {
      const res = await analytics(user);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }
    const anon = await request(app).get('/api/restaurant/analytics');
    expect(anon.status).toBe(401);
  });

  it('is closed to a restaurant awaiting approval, open to a suspended one', async () => {
    const pending = await makeStockedRestaurant({ status: 'PENDING_APPROVAL' });
    const suspended = await makeStockedRestaurant({ status: 'SUSPENDED' });

    const blocked = await analytics(pending.owner);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('RESTAURANT_NOT_APPROVED');
    expect((await analytics(suspended.owner)).status).toBe(200);
  });
});
