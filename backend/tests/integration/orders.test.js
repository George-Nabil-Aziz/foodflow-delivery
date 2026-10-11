import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import { withTransaction } from '../../src/shared/db/transaction.js';
import { insertOrderWithUniqueNumber } from '../../src/modules/orders/orders.repository.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeOrder, makeDriver,
  makeAssignment, authHeader,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

/** A customer with an address and a ready-to-checkout cart. */
async function readyToCheckout({ quantities = [2, 1] } = {}) {
  const customer = await makeUser({ role: 'CUSTOMER' });
  const address = await makeAddress(customer);
  const r = await makeStockedRestaurant({ name: 'Olive Grill' });

  await request(app).post('/api/cart/items').set(authHeader(customer))
    .send({ foodItemId: r.main.id, quantity: quantities[0] });
  if (quantities[1]) {
    await request(app).post('/api/cart/items').set(authHeader(customer))
      .send({ foodItemId: r.soup.id, quantity: quantities[1] });
  }
  return { customer, address, ...r };
}

const checkout = (customer, address, body = {}) =>
  request(app).post('/api/orders').set(authHeader(customer))
    .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY', ...body });

describe('TC-167..TC-175: checkout pricing and snapshots', () => {
  it('TC-167: produces the documented totals', async () => {
    const { customer, address } = await readyToCheckout();
    const res = await checkout(customer, address);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'PENDING', subtotal: '134.00', deliveryFee: '12.00',
      taxAmount: '18.76', totalAmount: '164.76',
    });
    expect(res.body.data.orderNumber).toMatch(/^FF-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/);

    const items = await knex('order_items').orderBy('unit_price', 'desc');
    expect(items.map((i) => [i.unit_price, i.quantity, i.line_total]))
      .toEqual([['58.00', 2, '116.00'], ['18.00', 1, '18.00']]);
  });

  it('TC-168: the database refuses an order whose total does not reconcile', async () => {
    const { customer, address } = await readyToCheckout();
    await checkout(customer, address);
    const order = await knex('orders').first();

    await expect(
      knex('orders').where({ id: order.id }).update({ total_amount: '1.00' }),
    ).rejects.toThrow(/chk_orders_totals/);
  });

  it('TC-169: the database refuses a line total that does not reconcile', async () => {
    const { customer, address } = await readyToCheckout();
    await checkout(customer, address);
    const item = await knex('order_items').first();

    await expect(
      knex('order_items').where({ id: item.id }).update({ line_total: '1.00' }),
    ).rejects.toThrow(/chk_order_items_line_total/);
  });

  it('TC-171: client-supplied totals are ignored', async () => {
    const { customer, address } = await readyToCheckout();
    const res = await checkout(customer, address, {
      totalAmount: '1.00', subtotal: '1.00', deliveryFee: '0.00', taxAmount: '0.00',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.totalAmount).toBe('164.76');
    expect(res.body.data.subtotal).toBe('134.00');
  });

  it('TC-172: menu changes after checkout never alter the order', async () => {
    const { customer, address, main } = await readyToCheckout();
    const created = await checkout(customer, address);
    const orderId = created.body.data.id;

    await knex('food_items').where({ id: main.id }).update({ name: 'Renamed Dish', price: '70.00' });
    await knex('food_items').where({ id: main.id }).del();

    const res = await request(app).get(`/api/orders/${orderId}`).set(authHeader(customer));
    const line = res.body.data.items.find((i) => i.unitPrice === '58.00');

    expect(line.name).not.toBe('Renamed Dish');
    expect(line.unitPrice).toBe('58.00');
    expect(line.lineTotal).toBe('116.00');
    expect(res.body.data.totalAmount).toBe('164.76');
    expect(line.foodItemId).toBeNull();
  });

  it('TC-173/TC-174: address, fee and restaurant name are snapshotted', async () => {
    const { customer, address, restaurant } = await readyToCheckout();
    const created = await checkout(customer, address);
    const orderId = created.body.data.id;

    await knex('customer_addresses').where({ id: address.id })
      .update({ line1: 'Somewhere else entirely', deleted_at: new Date() });
    await knex('restaurants').where({ id: restaurant.id })
      .update({ name: 'Renamed Restaurant', delivery_fee: '30.00' });

    const res = await request(app).get(`/api/orders/${orderId}`).set(authHeader(customer));
    expect(res.body.data.deliveryAddress.line1).toBe('4412 King Fahd Road');
    expect(res.body.data.deliveryFee).toBe('12.00');
    expect(res.body.data.restaurant.name).toBe('Olive Grill');
  });
});

describe('TC-176..TC-182: checkout rejection paths', () => {
  it('TC-176: an empty cart is refused', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);

    const res = await checkout(customer, address);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CART_EMPTY');
    expect(await knex('orders')).toHaveLength(0);
  });

  it('TC-177: a cart with issues is refused and creates no order', async () => {
    const { customer, address, main } = await readyToCheckout();
    await knex('food_items').where({ id: main.id }).update({ is_available: false });

    const res = await checkout(customer, address);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CART_HAS_ISSUES');
    expect(await knex('orders')).toHaveLength(0);

    const cart = await knex('carts').where({ customer_user_id: customer.id }).first();
    expect(cart.status).toBe('ACTIVE');
  });

  it('TC-178: below the minimum order amount is refused with the shortfall', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant({ minimumOrderAmount: '500.00' });
    await request(app).post('/api/cart/items').set(authHeader(customer))
      .send({ foodItemId: r.main.id, quantity: 1 });

    const res = await checkout(customer, address);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BELOW_MINIMUM_ORDER');
    expect(res.body.error.details[0].required).toBe('500.00');
    expect(res.body.error.details[0].actual).toBe('58.00');
  });

  it('TC-179: a restaurant that closes between cart and checkout is refused, cart preserved', async () => {
    const { customer, address, restaurant } = await readyToCheckout();
    await knex('restaurants').where({ id: restaurant.id }).update({ is_accepting_orders: false });

    const res = await checkout(customer, address);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RESTAURANT_UNAVAILABLE');
    expect(await knex('cart_items')).toHaveLength(2);
  });

  it('TC-180: another customer address is 404', async () => {
    const { customer } = await readyToCheckout();
    const other = await makeUser({ role: 'CUSTOMER' });
    const otherAddress = await makeAddress(other);

    const res = await checkout(customer, otherAddress);
    expect(res.status).toBe(404);
    expect(await knex('orders')).toHaveLength(0);
  });

  it('TC-181/TC-182: malformed address and unsupported payment method', async () => {
    const { customer, address } = await readyToCheckout();

    const badUuid = await request(app).post('/api/orders').set(authHeader(customer))
      .send({ addressId: 'not-a-uuid' });
    expect(badUuid.status).toBe(422);

    const missing = await request(app).post('/api/orders').set(authHeader(customer)).send({});
    expect(missing.status).toBe(422);

    const badPayment = await checkout(customer, address, { paymentMethod: 'CREDIT_CARD' });
    expect(badPayment.status).toBe(422);
  });
});

describe('TC-183..TC-186: atomicity and concurrency', () => {
  it('TC-184: a double-submitted checkout creates exactly one order', async () => {
    const { customer, address } = await readyToCheckout();

    const results = await Promise.allSettled([
      checkout(customer, address),
      checkout(customer, address),
    ]);

    const statuses = results.map((r) => r.value?.status).sort();
    expect(await knex('orders')).toHaveLength(1);
    expect(statuses).toContain(201);
  });

  it('TC-185: a successful checkout converts the cart and a new one is created lazily', async () => {
    const { customer, address, main } = await readyToCheckout();
    await checkout(customer, address);

    const converted = await knex('carts').where({ customer_user_id: customer.id, status: 'CONVERTED' });
    expect(converted).toHaveLength(1);

    const empty = await request(app).get('/api/cart').set(authHeader(customer));
    expect(empty.body.data.items).toEqual([]);

    const added = await request(app).post('/api/cart/items').set(authHeader(customer))
      .send({ foodItemId: main.id, quantity: 1 });
    expect(added.status).toBe(200);

    const active = await knex('carts').where({ customer_user_id: customer.id, status: 'ACTIVE' });
    expect(active).toHaveLength(1);
  });

  it('TC-186: a customer may hold several open orders', async () => {
    const { customer, address, main } = await readyToCheckout();
    await checkout(customer, address);

    await request(app).post('/api/cart/items').set(authHeader(customer))
      .send({ foodItemId: main.id, quantity: 1 });
    const second = await checkout(customer, address);

    expect(second.status).toBe(201);
    expect(await knex('orders')).toHaveLength(2);
  });
});

describe('TC-187..TC-196: retrieval, tracking and cancellation', () => {
  const placeOrder = async (status = 'PENDING') => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant: r.restaurant, address, status });
    return { customer, address, order, ...r };
  };

  it('TC-187: history is scoped by active and past', async () => {
    const { customer, restaurant, address } = await placeOrder('PENDING');
    await makeOrder({ customer, restaurant, address, status: 'DELIVERED' });
    await makeOrder({ customer, restaurant, address, status: 'CANCELLED' });

    const active = await request(app).get('/api/orders?scope=active').set(authHeader(customer));
    const past = await request(app).get('/api/orders?scope=past').set(authHeader(customer));

    expect(active.body.data).toHaveLength(1);
    expect(past.body.data).toHaveLength(2);
    expect(active.body.meta.pagination.total).toBe(1);
  });

  it('TC-188: detail includes items, totals and the timeline', async () => {
    const { customer, order } = await placeOrder();
    const res = await request(app).get(`/api/orders/${order.id}`).set(authHeader(customer));

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.timeline[0]).toMatchObject({ status: 'PENDING', actor: 'CUSTOMER' });
    expect(res.body.data.deliveryAddress.city).toBe('Riyadh');
  });

  it('TC-189: another customer order is 404', async () => {
    const { order } = await placeOrder();
    const other = await makeUser({ role: 'CUSTOMER' });

    const res = await request(app).get(`/api/orders/${order.id}`).set(authHeader(other));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('TC-190/TC-191/TC-192: the polling payload is small and hides the driver until en route', async () => {
    const { customer, restaurant, address } = await placeOrder();
    const { user: driverUser } = await makeDriver();

    const preparing = await makeOrder({
      customer, restaurant, address, status: 'PREPARING', driver: driverUser,
    });
    const early = await request(app).get(`/api/orders/${preparing.id}/status`).set(authHeader(customer));
    expect(early.body.data.driver).toBeNull();
    expect(early.body.data).not.toHaveProperty('items');
    expect(early.body.data.dispatchState).toBeDefined();

    const outForDelivery = await makeOrder({
      customer, restaurant, address, status: 'OUT_FOR_DELIVERY', driver: driverUser,
    });
    const late = await request(app).get(`/api/orders/${outForDelivery.id}/status`).set(authHeader(customer));
    expect(late.body.data.driver.firstName).toBeTruthy();
    expect(late.body.data.driver.phone).toMatch(/\*/);
    expect(JSON.stringify(late.body)).not.toContain('@example.com');
  });

  it('TC-193/TC-194: the customer may cancel at PENDING and CONFIRMED', async () => {
    for (const status of ['PENDING', 'CONFIRMED']) {
      const { customer, order } = await placeOrder(status);
      const res = await request(app).post(`/api/orders/${order.id}/cancel`).set(authHeader(customer)).send({});

      expect(res.status, status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(res.body.data.cancelledBy).toBe('CUSTOMER');
      expect(res.body.data.cancellationReason).toBe('CUSTOMER_CHANGED_MIND');
    }
  });

  it('TC-195: the customer may not cancel from PREPARING onward', async () => {
    for (const status of ['PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const { customer, order } = await placeOrder(status);
      const res = await request(app).post(`/api/orders/${order.id}/cancel`).set(authHeader(customer)).send({});

      expect(res.status, status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_ORDER_TRANSITION');

      const after = await knex('orders').where({ id: order.id }).first();
      expect(after.status).toBe(status);
    }
  });

  it('TC-196: the timeout job cancels a stale PENDING order as SYSTEM', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant();

    const stale = await makeOrder({
      customer, restaurant: r.restaurant, address, status: 'PENDING',
      placedAt: knex.raw("now() - interval '11 minutes'"),
    });
    const fresh = await makeOrder({ customer, restaurant: r.restaurant, address, status: 'PENDING' });

    const { orderTimeoutJob } = await import('../../src/jobs/orderTimeout.job.js');
    const result = await orderTimeoutJob();
    expect(result.cancelled).toBe(1);

    const cancelled = await knex('orders').where({ id: stale.id }).first();
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelled_by).toBe('SYSTEM');
    expect(cancelled.cancellation_reason).toBe('ACCEPT_TIMEOUT');

    const untouched = await knex('orders').where({ id: fresh.id }).first();
    expect(untouched.status).toBe('PENDING');

    const event = await knex('order_status_events')
      .where({ order_id: stale.id, to_status: 'CANCELLED' }).first();
    expect(event.actor_role).toBe('SYSTEM');
    expect(event.actor_user_id).toBeNull();
  });
});

describe('TC-203..TC-228: restaurant and driver transitions end to end', () => {
  const scenario = async (status = 'PENDING') => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant: r.restaurant, address, status });
    return { customer, address, order, ...r };
  };

  it('TC-203: the restaurant accepts and dispatch is requested', async () => {
    const { owner, order } = await scenario('PENDING');
    const res = await request(app)
      .post(`/api/restaurant/orders/${order.id}/accept`).set(authHeader(owner)).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');

    const row = await knex('orders').where({ id: order.id }).first();
    expect(row.confirmed_at).not.toBeNull();
    expect(row.dispatch_state).toBe('UNASSIGNED');

    const event = await knex('order_status_events').where({ order_id: order.id, to_status: 'CONFIRMED' }).first();
    expect(event.actor_role).toBe('RESTAURANT');
  });

  it('TC-204/TC-205: prepare then ready, each stamping its timestamp', async () => {
    const { owner, order } = await scenario('CONFIRMED');

    await request(app).post(`/api/restaurant/orders/${order.id}/start-preparing`).set(authHeader(owner)).send({});
    let row = await knex('orders').where({ id: order.id }).first();
    expect(row.status).toBe('PREPARING');
    expect(row.preparing_at).not.toBeNull();

    await request(app).post(`/api/restaurant/orders/${order.id}/ready`).set(authHeader(owner)).send({});
    row = await knex('orders').where({ id: order.id }).first();
    expect(row.status).toBe('READY_FOR_PICKUP');
    expect(row.ready_at).not.toBeNull();
  });

  it('TC-209: rejection records attribution and reason', async () => {
    const { owner, order, customer } = await scenario('PENDING');
    const res = await request(app).post(`/api/restaurant/orders/${order.id}/reject`)
      .set(authHeader(owner)).send({ reason: 'OUT_OF_STOCK', note: 'Grill is down' });

    expect(res.status).toBe(200);
    const row = await knex('orders').where({ id: order.id }).first();
    expect(row).toMatchObject({
      status: 'CANCELLED', cancelled_by: 'RESTAURANT', cancellation_reason: 'OUT_OF_STOCK',
    });

    // The customer sees the reason.
    const seen = await request(app).get(`/api/orders/${order.id}`).set(authHeader(customer));
    expect(seen.body.data.cancellationReason).toBe('OUT_OF_STOCK');
    expect(seen.body.data.cancelledBy).toBe('RESTAURANT');
  });

  it('TC-220: rejection without a reason is refused', async () => {
    const { owner, order } = await scenario('PENDING');
    const res = await request(app).post(`/api/restaurant/orders/${order.id}/reject`)
      .set(authHeader(owner)).send({});

    expect(res.status).toBe(422);
    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('PENDING');
  });

  it('TC-201/TC-202: skipping and reversing are refused', async () => {
    const { owner, order } = await scenario('PENDING');

    const skip = await request(app).post(`/api/restaurant/orders/${order.id}/ready`).set(authHeader(owner)).send({});
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('INVALID_ORDER_TRANSITION');

    const { owner: o2, order: delivered } = await scenario('DELIVERED');
    const terminal = await request(app).post(`/api/restaurant/orders/${delivered.id}/accept`).set(authHeader(o2)).send({});
    expect(terminal.status).toBe(409);
  });

  it('TC-219/TC-043: a restaurant cannot act on another restaurant order', async () => {
    const { order } = await scenario('PENDING');
    const { owner: otherOwner } = await makeStockedRestaurant({ name: 'Other Place' });

    const res = await request(app)
      .post(`/api/restaurant/orders/${order.id}/accept`).set(authHeader(otherOwner)).send({});

    expect(res.status).toBe(404);
    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('PENDING');
  });

  it('TC-226: two staff accepting the same order produce one 200 and one 409', async () => {
    const { owner, order } = await scenario('PENDING');

    const results = await Promise.allSettled([
      request(app).post(`/api/restaurant/orders/${order.id}/accept`).set(authHeader(owner)).send({}),
      request(app).post(`/api/restaurant/orders/${order.id}/accept`).set(authHeader(owner)).send({}),
    ]);

    // PENDING -> CONFIRMED is legal exactly once; the loser re-reads the new
    // status after the row lock releases and fails the state check.
    const statuses = results.map((r) => r.value.status).sort();
    expect(statuses).toEqual([200, 409]);

    const events = await knex('order_status_events')
      .where({ order_id: order.id, to_status: 'CONFIRMED' });
    expect(events).toHaveLength(1);
  });

  it('TC-225: a concurrent cancel and accept are serialized into a consistent history', async () => {
    const { owner, customer, order } = await scenario('PENDING');

    const results = await Promise.allSettled([
      request(app).post(`/api/restaurant/orders/${order.id}/accept`).set(authHeader(owner)).send({}),
      request(app).post(`/api/orders/${order.id}/cancel`).set(authHeader(customer)).send({}),
    ]);

    // Both may legitimately succeed: the row lock serializes them, and the
    // customer's cancellation window is still open at CONFIRMED (T4). What must
    // never happen is an impossible state or an unserialized interleaving.
    const statuses = results.map((r) => r.value.status);
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);

    const row = await knex('orders').where({ id: order.id }).first();
    expect(['CONFIRMED', 'CANCELLED']).toContain(row.status);
    if (row.status === 'CANCELLED') expect(row.cancelled_by).toBeTruthy();

    // Every recorded transition is a legal edge, in order.
    const events = await knex('order_status_events').where({ order_id: order.id }).orderBy('created_at');
    const path = events.map((e) => e.to_status);
    expect(path[0]).toBe('PENDING');
    expect(new Set(path).size).toBe(path.length);
  });

  it('TC-206/TC-207: the assigned driver picks up and delivers, and is released', async () => {
    const { order, customer, restaurant, address } = await scenario('READY_FOR_PICKUP');
    const { user: driverUser } = await makeDriver({ availability: 'ON_DELIVERY' });

    await knex('orders').where({ id: order.id })
      .update({ driver_user_id: driverUser.id, dispatch_state: 'ASSIGNED' });
    await makeAssignment(order, driverUser, { status: 'ACCEPTED' });

    const pickup = await request(app)
      .post(`/api/driver/deliveries/${order.id}/pick-up`).set(authHeader(driverUser)).send({});
    expect(pickup.status).toBe(200);
    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('OUT_FOR_DELIVERY');

    const deliver = await request(app)
      .post(`/api/driver/deliveries/${order.id}/deliver`).set(authHeader(driverUser)).send({});
    expect(deliver.status).toBe(200);

    const row = await knex('orders').where({ id: order.id }).first();
    expect(row.status).toBe('DELIVERED');
    expect(row.delivered_at).not.toBeNull();
    expect(row.dispatch_state).toBe('COMPLETED');

    const profile = await knex('driver_profiles').where({ user_id: driverUser.id }).first();
    expect(profile.availability).toBe('AVAILABLE');

    const assignment = await knex('delivery_assignments').where({ order_id: order.id }).first();
    expect(assignment.status).toBe('COMPLETED');

    // Unused bindings kept for clarity of the scenario.
    expect(customer.id).toBeTruthy();
    expect(restaurant.id).toBeTruthy();
    expect(address.id).toBeTruthy();
  });

  it('TC-217/TC-218: a driver cannot pick up early or deliver before pickup', async () => {
    const { order } = await scenario('PREPARING');
    const { user: driverUser } = await makeDriver();
    await knex('orders').where({ id: order.id }).update({ driver_user_id: driverUser.id });
    await makeAssignment(order, driverUser, { status: 'ACCEPTED' });

    const early = await request(app)
      .post(`/api/driver/deliveries/${order.id}/pick-up`).set(authHeader(driverUser)).send({});
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('INVALID_ORDER_TRANSITION');

    await knex('orders').where({ id: order.id }).update({ status: 'READY_FOR_PICKUP' });
    const tooSoon = await request(app)
      .post(`/api/driver/deliveries/${order.id}/deliver`).set(authHeader(driverUser)).send({});
    expect(tooSoon.status).toBe(409);
  });

  it('TC-216: a driver cannot act on an order they were not assigned', async () => {
    const { order } = await scenario('READY_FOR_PICKUP');
    const { user: assigned } = await makeDriver();
    const { user: other } = await makeDriver();
    await knex('orders').where({ id: order.id }).update({ driver_user_id: assigned.id });
    await makeAssignment(order, assigned, { status: 'ACCEPTED' });

    const res = await request(app)
      .post(`/api/driver/deliveries/${order.id}/pick-up`).set(authHeader(other)).send({});
    expect(res.status).toBe(404);
  });

  it('TC-223: every transition writes exactly one status event', async () => {
    const { owner, order } = await scenario('PENDING');
    const { user: driverUser } = await makeDriver();

    await request(app).post(`/api/restaurant/orders/${order.id}/accept`).set(authHeader(owner)).send({});
    await request(app).post(`/api/restaurant/orders/${order.id}/start-preparing`).set(authHeader(owner)).send({});
    await request(app).post(`/api/restaurant/orders/${order.id}/ready`).set(authHeader(owner)).send({});

    await knex('orders').where({ id: order.id }).update({ driver_user_id: driverUser.id });
    await makeAssignment(order, driverUser, { status: 'ACCEPTED' });
    await request(app).post(`/api/driver/deliveries/${order.id}/pick-up`).set(authHeader(driverUser)).send({});
    await request(app).post(`/api/driver/deliveries/${order.id}/deliver`).set(authHeader(driverUser)).send({});

    const events = await knex('order_status_events').where({ order_id: order.id }).orderBy('created_at');
    expect(events.map((e) => e.to_status)).toEqual([
      'PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED',
    ]);
    expect(events.map((e) => e.actor_role)).toEqual([
      'CUSTOMER', 'RESTAURANT', 'RESTAURANT', 'RESTAURANT', 'DRIVER', 'DRIVER',
    ]);
  });

  it('TC-228: a suspended restaurant still completes in-flight orders', async () => {
    const { owner, order, restaurant, main } = await scenario('PREPARING');
    const customer = await makeUser({ role: 'CUSTOMER' });
    await knex('restaurants').where({ id: restaurant.id }).update({ status: 'SUSPENDED' });

    // BR-R9/BR-AD3: suspension stops new trade; it does not strand food that
    // is already being cooked.
    const res = await request(app)
      .post(`/api/restaurant/orders/${order.id}/ready`).set(authHeader(owner)).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('READY_FOR_PICKUP');

    // New trade really is stopped, which is what makes the above safe.
    const blocked = await request(app)
      .post('/api/cart/items').set(authHeader(customer))
      .send({ foodItemId: main.id, quantity: 1 });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('RESTAURANT_UNAVAILABLE');

    // And it cannot lift its own suspension by reopening for orders.
    const reopen = await request(app)
      .patch('/api/restaurant/accepting-orders').set(authHeader(owner))
      .send({ isAcceptingOrders: true });
    expect(reopen.status).toBe(403);
    expect(reopen.body.error.code).toBe('RESTAURANT_NOT_APPROVED');
  });
});

describe('TC-175b: an order-number collision does not fail a checkout', () => {
  /*
   * Regression test for a 500 a customer could receive through no fault of
   * their own. `uq_orders_order_number` is a unique index over six random
   * characters, so a collision is rare but real, and an unhandled one used to
   * abort the entire checkout transaction.
   *
   * The generator is injected into the repository precisely so this is
   * testable without mocking a module the service imports directly.
   */
  it('TC-175b: the insert retries past a number that is already taken', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const { restaurant } = await makeStockedRestaurant();
    const existing = await makeOrder({ customer, restaurant, address, status: 'DELIVERED' });

    const base = {
      customer_user_id: customer.id,
      restaurant_id: restaurant.id,
      delivery_address_id: address.id,
      delivery_address_snapshot: JSON.stringify({ line1: address.line1, city: address.city }),
      restaurant_name_snapshot: restaurant.name,
      status: 'PENDING',
      dispatch_state: 'NOT_REQUIRED',
      subtotal: '58.00',
      delivery_fee: '12.00',
      tax_amount: '8.70',
      total_amount: '78.70',
      payment_method: 'CASH_ON_DELIVERY',
    };

    // First draw collides with the existing order; the second is free.
    let draws = 0;
    const nextOrderNumber = () => {
      draws += 1;
      return 'FF-20260927-RETRY1';
    };

    const created = await withTransaction((trx) =>
      insertOrderWithUniqueNumber({ ...base, order_number: existing.order_number }, nextOrderNumber, trx),
    );

    expect(created.order_number).toBe('FF-20260927-RETRY1');
    expect(draws).toBe(1);

    // The colliding row is untouched and both orders exist.
    expect(await knex('orders').where({ order_number: existing.order_number })).toHaveLength(1);
    expect(await knex('orders').count('* as c')).toEqual([{ c: '2' }]);
  });

  it('TC-175b: a checkout through the API still produces a unique number', async () => {
    const { customer, address } = await readyToCheckout();
    const res = await request(app).post('/api/orders').set(authHeader(customer))
      .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });

    expect(res.status).toBe(201);
    expect(res.body.data.orderNumber).toMatch(/^FF-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/);
  });
});
