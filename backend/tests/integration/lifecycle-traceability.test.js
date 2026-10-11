/**
 * Named coverage for the remaining Critical cases in the order-lifecycle,
 * cart and edge-case suites.
 *
 * The exhaustive unit sweep in tests/unit/orderStateMachine.test.js proves the
 * transition *table* is right. These cases prove the table is actually the
 * thing the HTTP layer consults, that the side effects fire inside the same
 * transaction, and that the database refuses what the application would refuse
 * even if the application were bypassed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { resetDatabase, knex } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeOrder, makeDriver,
  makeAssignment, makeCart, authHeader,
} from '../helpers/factories.js';
import * as cartService from '../../src/modules/cart/cart.service.js';

beforeEach(async () => { await resetDatabase(); });

/** A customer with a default address and an active cart at a stocked restaurant. */
async function readyToCheckout({ quantity = 2 } = {}) {
  const customer = await makeUser();
  const address = await makeAddress(customer);
  const stocked = await makeStockedRestaurant();
  await makeCart(customer, stocked.restaurant, [{ item: stocked.main, quantity }]);
  return { customer, address, ...stocked };
}

/* --------------------------------------------------------- cart (TC-162) */

describe('TC-162: the canCheckout truth table', () => {
  it('TC-162: canCheckout is true only when every precondition holds', async () => {
    const customer = await makeUser();
    const { restaurant, main } = await makeStockedRestaurant({ minimumOrderAmount: '50.00' });

    // 1. Empty cart.
    let view = await cartService.getCart(customer.id);
    expect(view.canCheckout).toBe(false);
    expect(view.itemCount).toBe(0);

    // 2. All clear.
    await makeCart(customer, restaurant, [{ item: main, quantity: 2 }]);
    view = await cartService.getCart(customer.id);
    expect(view.canCheckout).toBe(true);
    expect(view.issues).toEqual([]);
    expect(view.meetsMinimum).toBe(true);

    // 3. An issue present (BR-C8/BR-C9).
    await knex('food_items').where({ id: main.id }).update({ is_available: false });
    view = await cartService.getCart(customer.id);
    expect(view.canCheckout).toBe(false);
    expect(view.issues.length).toBeGreaterThan(0);
    await knex('food_items').where({ id: main.id }).update({ is_available: true });

    // 4. Below the restaurant minimum (BR-C10) - the reason is exposed, not implied.
    await knex('cart_items').update({ quantity: 1 });
    await knex('food_items').where({ id: main.id }).update({ price: '20.00' });
    view = await cartService.getCart(customer.id);
    expect(view.canCheckout).toBe(false);
    expect(view.meetsMinimum).toBe(false);
    expect(Number(view.minimumShortfall)).toBeGreaterThan(0);
    await knex('food_items').where({ id: main.id }).update({ price: '58.00' });

    // 5. Restaurant no longer orderable (BR-R3).
    await knex('restaurants').where({ id: restaurant.id }).update({ is_accepting_orders: false });
    view = await cartService.getCart(customer.id);
    expect(view.canCheckout).toBe(false);
    expect(view.restaurant.isOrderable).toBe(false);
    expect(view.restaurant.unavailableReason).toBeTruthy();
  });
});

/* ------------------------------------------- cancellation edges (TC-208+) */

describe('TC-208, TC-210, TC-211: the cancellation edges over HTTP', () => {
  it('TC-208: a customer may cancel from PENDING (T2) and from CONFIRMED (T4), and no later', async () => {
    const { restaurant } = await makeStockedRestaurant();

    for (const status of ['PENDING', 'CONFIRMED']) {
      const customer = await makeUser();
      const order = await makeOrder({ customer, restaurant, status });
      const res = await request(app).post(`/api/orders/${order.id}/cancel`)
        .set(authHeader(customer)).send({ reason: 'CUSTOMER_CHANGED_MIND' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');

      const row = await knex('orders').where({ id: order.id }).first();
      expect(row.cancelled_by).toBe('CUSTOMER');
      expect(row.cancelled_at).not.toBeNull();
    }

    // PREPARING onwards is past the point of no return: the food is being cooked.
    for (const status of ['PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const customer = await makeUser();
      const order = await makeOrder({ customer, restaurant, status });
      const res = await request(app).post(`/api/orders/${order.id}/cancel`)
        .set(authHeader(customer)).send({ reason: 'CUSTOMER_CHANGED_MIND' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_ORDER_TRANSITION');
      expect((await knex('orders').where({ id: order.id }).first()).status).toBe(status);
    }
  });

  it('TC-210: a restaurant may cancel from CONFIRMED (T4) and PREPARING (T6), with a reason', async () => {
    for (const status of ['CONFIRMED', 'PREPARING']) {
      const customer = await makeUser();
      const { restaurant, owner } = await makeStockedRestaurant();
      const order = await makeOrder({ customer, restaurant, status });

      const res = await request(app).post(`/api/restaurant/orders/${order.id}/cancel`)
        .set(authHeader(owner)).send({ reason: 'OUT_OF_STOCK' });
      expect(res.status).toBe(200);

      const row = await knex('orders').where({ id: order.id }).first();
      expect(row.status).toBe('CANCELLED');
      expect(row.cancelled_by).toBe('RESTAURANT');
      expect(row.cancellation_reason).toBe('OUT_OF_STOCK');
    }

    // A restaurant has no cancel edge once the driver holds the food.
    const customer = await makeUser();
    const { restaurant, owner } = await makeStockedRestaurant();
    const late = await makeOrder({ customer, restaurant, status: 'OUT_FOR_DELIVERY' });
    const res = await request(app).post(`/api/restaurant/orders/${late.id}/cancel`)
      .set(authHeader(owner)).send({ reason: 'OUT_OF_STOCK' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_ORDER_TRANSITION');
  });

  it('TC-211: an admin can force-cancel the late stages (T8/T10) and a reason is mandatory', async () => {
    const admin = await makeUser({ role: 'ADMIN' });

    for (const status of ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY']) {
      const customer = await makeUser();
      const { restaurant } = await makeStockedRestaurant();
      const { user: driver } = await makeDriver();
      const order = await makeOrder({ customer, restaurant, driver, status });
      await makeAssignment(order, driver, { status: 'ACCEPTED' });

      const res = await request(app).post(`/api/admin/orders/${order.id}/force-cancel`)
        .set(authHeader(admin)).send({ reason: 'ADMIN_INTERVENTION', note: 'Customer unreachable' });
      expect(res.status).toBe(200);

      const row = await knex('orders').where({ id: order.id }).first();
      expect(row.status).toBe('CANCELLED');
      expect(row.cancelled_by).toBe('ADMIN');

      // The driver must be released, or the partial unique index keeps them busy forever.
      const assignment = await knex('delivery_assignments').where({ order_id: order.id }).first();
      expect(assignment.status).toBe('CANCELLED');
      expect(await knex('delivery_assignments')
        .where({ driver_user_id: driver.id, status: 'ACCEPTED' })).toHaveLength(0);

      // Every admin mutation is audited in the same transaction (FR-9.6).
      expect(await knex('admin_audit_logs').where({ entity_id: order.id })).not.toHaveLength(0);
    }

    // No reason, no force-cancel.
    const customer = await makeUser();
    const { restaurant } = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant, status: 'PREPARING' });
    const bad = await request(app).post(`/api/admin/orders/${order.id}/force-cancel`)
      .set(authHeader(admin)).send({});
    expect(bad.status).toBe(422);
    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('PREPARING');
  });
});

/* ------------------------------------- cross-role transitions (TC-212..215) */

describe('TC-212, TC-214, TC-215: a role cannot drive another role’s transition', () => {
  it('TC-212: a customer cannot perform restaurant transitions', async () => {
    const customer = await makeUser();
    const { restaurant } = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant, status: 'PENDING' });

    for (const action of ['accept', 'start-preparing', 'ready']) {
      const res = await request(app).post(`/api/restaurant/orders/${order.id}/${action}`)
        .set(authHeader(customer)).send({});
      expect(res.status).toBe(403);
    }
    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('PENDING');
  });

  it('TC-214: a restaurant cannot perform driver transitions', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const { restaurant, owner } = await makeStockedRestaurant();
    const { user: driver } = await makeDriver();
    const order = await makeOrder({
      customer, restaurant, address, driver, status: 'READY_FOR_PICKUP',
    });
    await makeAssignment(order, driver, { status: 'ACCEPTED' });

    for (const action of ['pick-up', 'deliver']) {
      const res = await request(app).post(`/api/driver/deliveries/${order.id}/${action}`)
        .set(authHeader(owner)).send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }
    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('READY_FOR_PICKUP');
  });

  it('TC-215: a driver cannot perform restaurant transitions', async () => {
    const customer = await makeUser();
    const { restaurant } = await makeStockedRestaurant();
    const { user: driver } = await makeDriver();
    const order = await makeOrder({ customer, restaurant, status: 'CONFIRMED' });

    for (const action of ['accept', 'start-preparing', 'ready', 'reject']) {
      const res = await request(app).post(`/api/restaurant/orders/${order.id}/${action}`)
        .set(authHeader(driver)).send({ reason: 'OUT_OF_STOCK' });
      expect(res.status).toBe(403);
    }
    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('CONFIRMED');
  });
});

/* ------------------------------------------------ invariants (TC-222, 227) */

describe('TC-222, TC-227: invariants the application cannot opt out of', () => {
  it('TC-222: the database itself refuses a cancellation without attribution', async () => {
    const customer = await makeUser();
    const { restaurant } = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant, status: 'PENDING' });

    // Bypassing the service entirely: chk_orders_cancel_fields is the last line
    // of defence, so a future code path that forgets attribution still fails.
    await expect(
      knex('orders').where({ id: order.id }).update({ status: 'CANCELLED' }),
    ).rejects.toThrow(/chk_orders_cancel_fields|violates check constraint/i);

    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('PENDING');
  });

  it('TC-227: each transition fires its side effects exactly once', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const { restaurant, owner } = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant, address, status: 'PENDING' });

    // PENDING -> CONFIRMED: confirmed_at set, dispatch requested.
    await request(app).post(`/api/restaurant/orders/${order.id}/accept`)
      .set(authHeader(owner)).send({}).expect(200);
    let row = await knex('orders').where({ id: order.id }).first();
    expect(row.confirmed_at).not.toBeNull();
    expect(row.dispatch_state).toBe('UNASSIGNED');

    // CONFIRMED -> PREPARING.
    await request(app).post(`/api/restaurant/orders/${order.id}/start-preparing`)
      .set(authHeader(owner)).send({}).expect(200);
    expect((await knex('orders').where({ id: order.id }).first()).preparing_at).not.toBeNull();

    // PREPARING -> READY_FOR_PICKUP.
    await request(app).post(`/api/restaurant/orders/${order.id}/ready`)
      .set(authHeader(owner)).send({}).expect(200);
    expect((await knex('orders').where({ id: order.id }).first()).ready_at).not.toBeNull();

    // A driver takes it: READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED.
    const { user: driver } = await makeDriver();
    await knex('orders').where({ id: order.id })
      .update({ driver_user_id: driver.id, dispatch_state: 'ASSIGNED' });
    await makeAssignment(order, driver, { status: 'ACCEPTED' });

    await request(app).post(`/api/driver/deliveries/${order.id}/pick-up`)
      .set(authHeader(driver)).send({}).expect(200);
    expect((await knex('orders').where({ id: order.id }).first()).picked_up_at).not.toBeNull();

    await request(app).post(`/api/driver/deliveries/${order.id}/deliver`)
      .set(authHeader(driver)).send({}).expect(200);

    row = await knex('orders').where({ id: order.id }).first();
    expect(row.status).toBe('DELIVERED');
    expect(row.delivered_at).not.toBeNull();
    expect(row.dispatch_state).toBe('COMPLETED');

    // The driver is released, so the partial unique index lets them take another.
    expect(await knex('delivery_assignments')
      .where({ driver_user_id: driver.id, status: 'ACCEPTED' })).toHaveLength(0);
    expect((await knex('delivery_assignments').where({ order_id: order.id }).first()).status)
      .toBe('COMPLETED');

    // Exactly one event per transition - never two, never none.
    const events = await knex('order_status_events').where({ order_id: order.id }).orderBy('created_at');
    const statuses = events.map((e) => e.to_status);
    expect(statuses).toEqual(['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED']);
    expect(new Set(statuses).size).toBe(statuses.length);
  });
});

/* -------------------------------------------------- concurrency (TC-353..) */

describe('TC-353, TC-354, TC-357, TC-368: two things happening at once', () => {
  it('TC-353: two tabs adding from different restaurants leave exactly one cart', async () => {
    const customer = await makeUser();
    const a = await makeStockedRestaurant();
    const b = await makeStockedRestaurant();

    const [first, second] = await Promise.all([
      request(app).post('/api/cart/items').set(authHeader(customer))
        .send({ foodItemId: a.main.id, quantity: 1 }),
      request(app).post('/api/cart/items').set(authHeader(customer))
        .send({ foodItemId: b.main.id, quantity: 1 }),
    ]);

    // uq_carts_one_active makes this the database's decision, not a race.
    const carts = await knex('carts').where({ customer_user_id: customer.id, status: 'ACTIVE' });
    expect(carts).toHaveLength(1);

    const statuses = [first.status, second.status].sort();
    // One added; the other either added to the same cart or was refused as a
    // cross-restaurant conflict. Never two carts, never a silently merged one.
    expect(statuses[0]).toBeLessThan(500);
    expect(statuses[1]).toBeLessThan(500);

    const lines = await knex('cart_items').where({ cart_id: carts[0].id });
    const itemIds = new Set(lines.map((l) => l.food_item_id));
    const restaurantIds = new Set(
      (await knex('food_items').whereIn('id', [...itemIds])).map((i) => i.restaurant_id),
    );
    expect(restaurantIds.size).toBe(1);
  });

  it('TC-354: a customer cancelling as the restaurant accepts is serialized, never corrupted', async () => {
    const customer = await makeUser();
    const { restaurant, owner } = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant, status: 'PENDING' });

    const [accept, cancel] = await Promise.all([
      request(app).post(`/api/restaurant/orders/${order.id}/accept`).set(authHeader(owner)).send({}),
      request(app).post(`/api/orders/${order.id}/cancel`).set(authHeader(customer))
        .send({ reason: 'CUSTOMER_CHANGED_MIND' }),
    ]);

    // Finding D-06: both can legitimately succeed, because PENDING->CONFIRMED
    // and CONFIRMED->CANCELLED are both legal edges. The invariant is that the
    // recorded history is a legal path, not that someone gets a 409.
    for (const res of [accept, cancel]) expect([200, 409]).toContain(res.status);

    const events = await knex('order_status_events').where({ order_id: order.id }).orderBy('created_at');
    const path = events.map((e) => e.to_status); // the log opens with PENDING
    const LEGAL = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
      READY_FOR_PICKUP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
      OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [], CANCELLED: [],
    };
    for (let i = 1; i < path.length; i += 1) {
      expect(LEGAL[path[i - 1]]).toContain(path[i]);
    }
    expect(new Set(path).size).toBe(path.length); // no status applied twice
    expect((await knex('orders').where({ id: order.id }).first()).status).toBe(path.at(-1));
  });

  it('TC-357: an admin force-cancel racing a driver delivery resolves to one terminal state', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const admin = await makeUser({ role: 'ADMIN' });
    const { restaurant } = await makeStockedRestaurant();
    const { user: driver } = await makeDriver();

    const order = await makeOrder({
      customer, restaurant, address, driver, status: 'OUT_FOR_DELIVERY',
    });
    await makeAssignment(order, driver, { status: 'ACCEPTED' });

    const [cancel, deliver] = await Promise.all([
      request(app).post(`/api/admin/orders/${order.id}/force-cancel`).set(authHeader(admin))
        .send({ reason: 'ADMIN_INTERVENTION', note: 'Fraud review' }),
      request(app).post(`/api/driver/deliveries/${order.id}/deliver`).set(authHeader(driver)).send({}),
    ]);

    // Both target a terminal state from OUT_FOR_DELIVERY, so exactly one wins.
    const oks = [cancel.status, deliver.status].filter((s) => s === 200);
    expect(oks).toHaveLength(1);
    const loser = [cancel, deliver].find((r) => r.status !== 200);
    expect(loser.status).toBe(409);
    expect(loser.body.error.code).toBe('INVALID_ORDER_TRANSITION');

    const row = await knex('orders').where({ id: order.id }).first();
    expect(['DELIVERED', 'CANCELLED']).toContain(row.status);

    // Either way the driver is free again.
    expect(await knex('delivery_assignments')
      .where({ driver_user_id: driver.id, status: 'ACCEPTED' })).toHaveLength(0);
  });

  it('TC-368: a failed checkout leaves no partial order and the retry succeeds', async () => {
    const { customer, address, main } = await readyToCheckout();

    // Force the commit to fail on a constraint the service cannot see coming,
    // which is the closest deterministic stand-in for a mid-commit failure.
    await knex.raw(`
      CREATE OR REPLACE FUNCTION tc368_fail() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'tc368 simulated failure'; END;
      $$ LANGUAGE plpgsql;
    `);
    await knex.raw(`
      CREATE TRIGGER tc368_boom BEFORE INSERT ON order_items
      FOR EACH ROW EXECUTE FUNCTION tc368_fail();
    `);

    const failed = await request(app).post('/api/orders').set(authHeader(customer))
      .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    expect(failed.status).toBeGreaterThanOrEqual(500);

    // Nothing partial survived: no order, no items, and the cart is still ACTIVE.
    expect(await knex('orders').count('* as c')).toEqual([{ c: '0' }]);
    expect(await knex('order_items').count('* as c')).toEqual([{ c: '0' }]);
    const cart = await knex('carts').where({ customer_user_id: customer.id }).first();
    expect(cart.status).toBe('ACTIVE');
    expect(await knex('cart_items').where({ cart_id: cart.id })).toHaveLength(1);

    await knex.raw('DROP TRIGGER tc368_boom ON order_items');
    await knex.raw('DROP FUNCTION tc368_fail()');

    // The retry is safe precisely because the first attempt was atomic.
    const retry = await request(app).post('/api/orders').set(authHeader(customer))
      .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    expect(retry.status).toBe(201);
    expect(await knex('orders').count('* as c')).toEqual([{ c: '1' }]);
    expect(retry.body.data.items[0].name).toBe(main.name);
    expect((await knex('carts').where({ id: cart.id }).first()).status).not.toBe('ACTIVE');
  });
});
