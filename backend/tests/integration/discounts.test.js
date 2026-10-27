import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { config } from '../../src/config/index.js';
import { computeTotals } from '../../src/modules/orders/orderPricing.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, authHeader,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

const DAY = 24 * 3600 * 1000;

/** Direct insert, so a test can build states the admin API refuses (expired). */
async function makeCode(over = {}) {
  const [row] = await knex('discount_codes').insert({
    code: 'SAVE10', discount_type: 'PERCENT', value: '10.00', ...over,
  }).returning('*');
  return row;
}

/** A customer with an address and a cart of 2 x 58.00 + 1 x 18.00 = 134.00. */
async function readyToCheckout({ restaurant } = {}) {
  const customer = await makeUser({ role: 'CUSTOMER' });
  const address = await makeAddress(customer);
  const r = restaurant ?? (await makeStockedRestaurant());
  await request(app).post('/api/cart/items').set(authHeader(customer)).send({ foodItemId: r.main.id, quantity: 2 });
  await request(app).post('/api/cart/items').set(authHeader(customer)).send({ foodItemId: r.soup.id, quantity: 1 });
  return { customer, address, ...r };
}

const apply = (customer, code) => request(app).post('/api/cart/discount').set(authHeader(customer)).send({ code });
const checkout = (customer, address) =>
  request(app).post('/api/orders').set(authHeader(customer))
    .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });

const expected = (restaurant, discount) => computeTotals({
  lines: [{ unitPrice: '58.00', quantity: 2 }, { unitPrice: '18.00', quantity: 1 }],
  deliveryFee: restaurant.delivery_fee, taxRate: config.taxRate, discount,
});

describe('a valid code on the cart and at checkout', () => {
  it('shows the discount and the new total on the cart', async () => {
    const { customer, restaurant } = await readyToCheckout();
    await makeCode();
    const res = await apply(customer, 'save10'); // case-insensitive

    expect(res.status).toBe(200);
    const want = expected(restaurant, { type: 'PERCENT', value: '10.00' });
    expect(res.body.data.discount).toMatchObject({ code: 'SAVE10', amount: '13.40' });
    expect(res.body.data.totals).toMatchObject({
      subtotal: '134.00', discountAmount: '13.40', total: want.totalAmount,
    });
    expect(res.body.data.canCheckout).toBe(true);

    const again = await request(app).get('/api/cart').set(authHeader(customer));
    expect(again.body.data.totals.total).toBe(want.totalAmount);
  });

  it('can be removed again', async () => {
    const { customer, restaurant } = await readyToCheckout();
    await makeCode();
    await apply(customer, 'SAVE10');
    const res = await request(app).delete('/api/cart/discount').set(authHeader(customer));
    expect(res.status).toBe(200);
    expect(res.body.data.discount).toBeNull();
    expect(res.body.data.totals.total).toBe(expected(restaurant, null).totalAmount);
  });

  it('is priced on the server, stored on the order and snapshotted', async () => {
    const { customer, address, restaurant } = await readyToCheckout();
    const code = await makeCode();
    await apply(customer, 'SAVE10');

    const res = await checkout(customer, address);
    expect(res.status).toBe(201);
    const want = expected(restaurant, { type: 'PERCENT', value: '10.00' });
    expect(res.body.data).toMatchObject({
      subtotal: '134.00', discountAmount: '13.40', discountCode: 'SAVE10', totalAmount: want.totalAmount,
    });

    const order = await knex('orders').where({ id: res.body.data.id }).first();
    expect(order.discount_amount).toBe('13.40');
    expect(order.total_amount).toBe(want.totalAmount);
    const [row] = await knex('order_discounts').where({ order_id: order.id });
    expect(row).toMatchObject({ discount_code_id: code.id, code_snapshot: 'SAVE10', amount: '13.40' });

    // Editing, deactivating or deleting the code later changes nothing on the order.
    await knex('discount_codes').where({ id: code.id }).update({ value: '50.00', is_active: false, deleted_at: knex.fn.now() });
    const detail = await request(app).get(`/api/orders/${order.id}`).set(authHeader(customer));
    expect(detail.body.data).toMatchObject({ discountCode: 'SAVE10', discountAmount: '13.40' });
    expect((await knex('order_discounts').where({ order_id: order.id }).first()).amount).toBe('13.40');
  });

  it('is shown to the restaurant and the admin on the order', async () => {
    const { customer, address, owner } = await readyToCheckout();
    await makeCode();
    await apply(customer, 'SAVE10');
    const order = (await checkout(customer, address)).body.data;
    const admin = await makeUser({ role: 'ADMIN' });

    const forRestaurant = await request(app).get(`/api/restaurant/orders/${order.id}`).set(authHeader(owner));
    expect(forRestaurant.body.data).toMatchObject({ discountCode: 'SAVE10', discountAmount: '13.40' });
    const forAdmin = await request(app).get(`/api/admin/orders/${order.id}`).set(authHeader(admin));
    expect(forAdmin.body.data).toMatchObject({ discountCode: 'SAVE10', discountAmount: '13.40' });
  });

  it('is capped by the maximum discount and never below zero', async () => {
    const { customer, address } = await readyToCheckout();
    await makeCode({ code: 'HALF', value: '50.00', max_discount_amount: '20.00' });
    await apply(customer, 'HALF');
    expect((await checkout(customer, address)).body.data.discountAmount).toBe('20.00');

    const second = await readyToCheckout();
    await makeCode({ code: 'BIG', discount_type: 'FIXED', value: '500.00' });
    await apply(second.customer, 'BIG');
    const res = await checkout(second.customer, second.address);
    expect(res.body.data).toMatchObject({ discountAmount: '134.00', taxAmount: '0.00', totalAmount: '12.00' });
  });

  it('leaves an order without a code with a zero discount', async () => {
    const { customer, address } = await readyToCheckout();
    const res = await checkout(customer, address);
    expect(res.body.data).toMatchObject({ discountAmount: '0.00', discountCode: null });
    expect(await knex('order_discounts')).toHaveLength(0);
  });
});

describe('a code that cannot be used', () => {
  const rejected = async (code, status, errorCode) => {
    const { customer } = await readyToCheckout();
    const res = await apply(customer, code);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(errorCode);
    expect(res.body.error.details?.[0]?.issue).toBeTruthy();
    // Nothing was applied.
    expect((await request(app).get('/api/cart').set(authHeader(customer))).body.data.discount).toBeNull();
  };

  it('unknown, inactive and deleted codes are DISCOUNT_CODE_INVALID', async () => {
    await makeCode({ code: 'OFF', is_active: false });
    await makeCode({ code: 'GONE', deleted_at: new Date() });
    await rejected('NOPE', 422, 'DISCOUNT_CODE_INVALID');
    await rejected('OFF', 422, 'DISCOUNT_CODE_INVALID');
    await rejected('GONE', 422, 'DISCOUNT_CODE_INVALID');
  });

  it('expired and not-yet-started codes are DISCOUNT_CODE_EXPIRED', async () => {
    await makeCode({ code: 'OLD', starts_at: new Date(Date.now() - 3 * DAY), ends_at: new Date(Date.now() - DAY) });
    await makeCode({ code: 'SOON', starts_at: new Date(Date.now() + DAY) });
    await rejected('OLD', 422, 'DISCOUNT_CODE_EXPIRED');
    await rejected('SOON', 422, 'DISCOUNT_CODE_EXPIRED');
  });

  it('a code for another restaurant or above the cart is DISCOUNT_CODE_NOT_APPLICABLE', async () => {
    const other = await makeStockedRestaurant();
    await makeCode({ code: 'OTHER', restaurant_id: other.restaurant.id });
    await makeCode({ code: 'BIGSPEND', min_subtotal: '500.00' });
    await rejected('OTHER', 422, 'DISCOUNT_CODE_NOT_APPLICABLE');
    await rejected('BIGSPEND', 422, 'DISCOUNT_CODE_NOT_APPLICABLE');
  });

  it('a code scoped to the cart restaurant works', async () => {
    const { customer, restaurant } = await readyToCheckout();
    await makeCode({ code: 'HERE', restaurant_id: restaurant.id });
    expect((await apply(customer, 'HERE')).status).toBe(200);
  });

  it('cannot be applied to an empty cart', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    await makeCode();
    const res = await apply(customer, 'SAVE10');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CART_EMPTY');
  });

  it('checkout re-validates: a code that expired after being applied blocks the order', async () => {
    const { customer, address } = await readyToCheckout();
    const code = await makeCode();
    await apply(customer, 'SAVE10');
    await knex('discount_codes').where({ id: code.id }).update({ ends_at: new Date(Date.now() - 1000) });

    const view = await request(app).get('/api/cart').set(authHeader(customer));
    expect(view.body.data.discount).toBeNull();
    expect(view.body.data.discountIssue).toMatchObject({ code: 'DISCOUNT_CODE_EXPIRED', discountCode: 'SAVE10' });
    expect(view.body.data.canCheckout).toBe(false);

    const res = await checkout(customer, address);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DISCOUNT_CODE_EXPIRED');
    expect(await knex('orders')).toHaveLength(0);
    expect((await knex('carts').where({ customer_user_id: customer.id }).first()).status).toBe('ACTIVE');

    // Removing the code unblocks the cart.
    await request(app).delete('/api/cart/discount').set(authHeader(customer));
    expect((await checkout(customer, address)).status).toBe(201);
  });

  it('checkout rejects a code deactivated after being applied', async () => {
    const { customer, address } = await readyToCheckout();
    const code = await makeCode();
    await apply(customer, 'SAVE10');
    await knex('discount_codes').where({ id: code.id }).update({ is_active: false });
    const res = await checkout(customer, address);
    expect(res.body.error.code).toBe('DISCOUNT_CODE_INVALID');
  });

  it('the restaurant minimum is judged before the discount', async () => {
    // 134.00 - 120.00 = 14.00, under the 30.00 minimum, but the order is fine.
    const { customer, address } = await readyToCheckout();
    await makeCode({ code: 'HUGE', discount_type: 'FIXED', value: '120.00' });
    await apply(customer, 'HUGE');
    const res = await checkout(customer, address);
    expect(res.status).toBe(201);
    expect(res.body.data.discountAmount).toBe('120.00');
  });
});

describe('usage limits', () => {
  it('a per-customer limit blocks the second use, and a cancelled order frees it', async () => {
    const r = await makeStockedRestaurant();
    const { customer, address } = await readyToCheckout({ restaurant: r });
    await makeCode({ per_customer_limit: 1 });

    await apply(customer, 'SAVE10');
    const first = await checkout(customer, address);
    expect(first.status).toBe(201);

    await request(app).post('/api/cart/items').set(authHeader(customer)).send({ foodItemId: r.main.id, quantity: 2 });
    const second = await apply(customer, 'SAVE10');
    expect(second.status).toBe(422);
    expect(second.body.error.code).toBe('DISCOUNT_CODE_LIMIT_REACHED');

    await request(app).post(`/api/orders/${first.body.data.id}/cancel`).set(authHeader(customer)).send({}).expect(200);
    expect((await apply(customer, 'SAVE10')).status).toBe(200);

    // Another customer is unaffected by this one's usage.
    const other = await readyToCheckout({ restaurant: r });
    expect((await apply(other.customer, 'SAVE10')).status).toBe(200);
  });

  it('a total limit blocks everyone once reached', async () => {
    const r = await makeStockedRestaurant();
    const a = await readyToCheckout({ restaurant: r });
    const b = await readyToCheckout({ restaurant: r });
    await makeCode({ usage_limit: 1 });

    await apply(a.customer, 'SAVE10');
    await apply(b.customer, 'SAVE10'); // both may hold it: the limit bites at order time
    expect((await checkout(a.customer, a.address)).status).toBe(201);

    const res = await checkout(b.customer, b.address);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DISCOUNT_CODE_LIMIT_REACHED');
    expect(await knex('order_discounts')).toHaveLength(1);
  });

  it('two checkouts racing for the last use produce exactly one redemption', async () => {
    const r = await makeStockedRestaurant();
    const a = await readyToCheckout({ restaurant: r });
    const b = await readyToCheckout({ restaurant: r });
    await makeCode({ usage_limit: 1 });
    await apply(a.customer, 'SAVE10');
    await apply(b.customer, 'SAVE10');

    const results = await Promise.all([
      checkout(a.customer, a.address),
      checkout(b.customer, b.address),
    ]);

    expect(results.map((x) => x.status).sort()).toEqual([201, 422]);
    expect(results.find((x) => x.status === 422).body.error.code).toBe('DISCOUNT_CODE_LIMIT_REACHED');
    expect(await knex('order_discounts')).toHaveLength(1);
    expect(await knex('orders')).toHaveLength(1);
    // The loser kept their cart.
    const loser = results[0].status === 422 ? a : b;
    expect((await knex('carts').where({ customer_user_id: loser.customer.id }).first()).status).toBe('ACTIVE');
  });
});

describe('an admin places an order with a code', () => {
  it('prices it with the same rules', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant();
    await makeCode();
    const body = {
      customerUserId: customer.id, restaurantId: r.restaurant.id, addressId: address.id,
      items: [{ foodItemId: r.main.id, quantity: 2 }, { foodItemId: r.soup.id, quantity: 1 }],
    };

    const res = await request(app).post('/api/admin/orders').set(authHeader(admin)).send({ ...body, discountCode: 'save10' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ discountAmount: '13.40', discountCode: 'SAVE10' });
    const audit = await knex('admin_audit_logs').where({ action: 'ORDER_PLACED' }).first();
    expect(audit.metadata).toMatchObject({ discountCode: 'save10', discountAmount: '13.40' });

    const bad = await request(app).post('/api/admin/orders').set(authHeader(admin)).send({ ...body, discountCode: 'NOPE' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('DISCOUNT_CODE_INVALID');
    expect(await knex('orders')).toHaveLength(1);
  });
});

describe('admin management of discount codes', () => {
  const body = { code: 'welcome20', type: 'PERCENT', value: 20, maxDiscountAmount: 30, minSubtotal: 50 };

  it('creates, lists with statistics, edits, deactivates, reactivates and deletes - all audited', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const h = authHeader(admin);

    const created = await request(app).post('/api/admin/discount-codes').set(h).send(body);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      code: 'WELCOME20', type: 'PERCENT', value: '20.00', maxDiscountAmount: '30.00',
      minSubtotal: '50.00', state: 'ACTIVE', stats: { usageCount: 0, totalDiscount: '0.00' },
    });
    const id = created.body.data.id;
    expect((await knex('discount_codes').where({ id }).first()).created_by).toBe(admin.id);

    const edited = await request(app).put(`/api/admin/discount-codes/${id}`).set(h)
      .send({ type: 'FIXED', value: 15, minSubtotal: 0, description: 'Welcome' });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ code: 'WELCOME20', type: 'FIXED', value: '15.00', maxDiscountAmount: null });

    const off = await request(app).post(`/api/admin/discount-codes/${id}/deactivate`).set(h).send({ reason: 'Campaign over' });
    expect(off.body.data.state).toBe('INACTIVE');
    const on = await request(app).post(`/api/admin/discount-codes/${id}/reactivate`).set(h).send({});
    expect(on.body.data.state).toBe('ACTIVE');

    const del = await request(app).delete(`/api/admin/discount-codes/${id}`).set(h).send({ reason: 'No longer needed' });
    expect(del.status).toBe(200);
    expect((await knex('discount_codes').where({ id }).first()).deleted_at).not.toBeNull();
    expect((await request(app).get(`/api/admin/discount-codes/${id}`).set(h)).status).toBe(404);
    expect((await request(app).get('/api/admin/discount-codes').set(h)).body.data).toHaveLength(0);

    const actions = (await knex('admin_audit_logs').where({ entity_id: id }).orderBy('created_at')).map((a) => a.action);
    expect(actions).toEqual([
      'DISCOUNT_CODE_CREATED', 'DISCOUNT_CODE_UPDATED', 'DISCOUNT_CODE_DEACTIVATED',
      'DISCOUNT_CODE_REACTIVATED', 'DISCOUNT_CODE_DELETED',
    ]);

    // A deleted code releases its spelling.
    expect((await request(app).post('/api/admin/discount-codes').set(h).send(body)).status).toBe(201);
  });

  it('rejects a duplicate code regardless of case', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const h = authHeader(admin);
    await request(app).post('/api/admin/discount-codes').set(h).send(body).expect(201);
    const dup = await request(app).post('/api/admin/discount-codes').set(h).send({ ...body, code: 'Welcome20' });
    expect(dup.status).toBe(409);
    expect(await knex('admin_audit_logs').where({ action: 'DISCOUNT_CODE_CREATED' })).toHaveLength(1);
  });

  it('validates the input', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const h = authHeader(admin);
    const post = (over) => request(app).post('/api/admin/discount-codes').set(h).send({ ...body, ...over });
    expect((await post({ value: 150 })).status).toBe(422);
    expect((await post({ type: 'FIXED' })).status).toBe(422); // a cap is for percentages
    expect((await post({ code: 'a b' })).status).toBe(422);
    expect((await post({ startsAt: '2030-01-02', endsAt: '2030-01-01' })).status).toBe(422);
    expect((await post({ usageLimit: 0 })).status).toBe(422);
    expect((await post({ restaurantId: '00000000-0000-4000-8000-000000000000' })).status).toBe(422);
    expect(await knex('discount_codes')).toHaveLength(0);
  });

  it('lists with search and a state filter, and reports usage and the discount given', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const h = authHeader(admin);
    await makeCode({ code: 'ACTIVEONE' });
    await makeCode({ code: 'PAUSED', is_active: false });
    await makeCode({ code: 'ENDED', ends_at: new Date(Date.now() - DAY) });
    await makeCode({ code: 'LATER', starts_at: new Date(Date.now() + DAY) });

    const states = async (status) =>
      (await request(app).get('/api/admin/discount-codes').set(h).query(status ? { status } : {}))
        .body.data.map((c) => c.code).sort();
    expect(await states()).toEqual(['ACTIVEONE', 'ENDED', 'LATER', 'PAUSED']);
    expect(await states('INACTIVE')).toEqual(['PAUSED']);
    expect(await states('EXPIRED')).toEqual(['ENDED']);
    expect(await states('SCHEDULED')).toEqual(['LATER']);
    expect(await states('ACTIVE')).toEqual(['ACTIVEONE']);

    const search = await request(app).get('/api/admin/discount-codes').set(h).query({ q: 'paus' });
    expect(search.body.data.map((c) => c.code)).toEqual(['PAUSED']);
    expect(search.body.meta.pagination.total).toBe(1);
    expect((await request(app).get('/api/admin/discount-codes').set(h).query({ q: 'x'.repeat(61) })).status).toBe(422);

    // One redemption: usage 1, discount 13.40; a cancelled one does not count.
    const { customer, address } = await readyToCheckout();
    await request(app).post('/api/cart/discount').set(authHeader(customer)).send({ code: 'ACTIVEONE' });
    const order = (await checkout(customer, address)).body.data;
    let row = (await request(app).get('/api/admin/discount-codes').set(h).query({ q: 'ACTIVEONE' })).body.data[0];
    expect(row.stats).toEqual({ usageCount: 1, totalDiscount: '13.40' });
    await request(app).post(`/api/orders/${order.id}/cancel`).set(authHeader(customer)).send({}).expect(200);
    row = (await request(app).get('/api/admin/discount-codes').set(h).query({ q: 'ACTIVEONE' })).body.data[0];
    expect(row.stats).toEqual({ usageCount: 0, totalDiscount: '0.00' });
  });

  it('is for admins only', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const { owner } = await makeStockedRestaurant();
    const code = await makeCode();
    for (const user of [customer, owner]) {
      const h = authHeader(user);
      expect((await request(app).get('/api/admin/discount-codes').set(h)).status).toBe(403);
      expect((await request(app).post('/api/admin/discount-codes').set(h).send(body)).status).toBe(403);
      expect((await request(app).put(`/api/admin/discount-codes/${code.id}`).set(h).send(body)).status).toBe(403);
      expect((await request(app).delete(`/api/admin/discount-codes/${code.id}`).set(h).send({ reason: 'nope nope' })).status).toBe(403);
    }
    expect((await request(app).get('/api/admin/discount-codes')).status).toBe(401);
    expect(await knex('admin_audit_logs')).toHaveLength(0);
  });

  it('only a customer can use the cart endpoints', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    expect((await apply(admin, 'SAVE10')).status).toBe(403);
  });
});
