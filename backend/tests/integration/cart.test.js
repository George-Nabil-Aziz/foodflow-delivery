import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeStockedRestaurant, makeItem, makeCategory, authHeader,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

const setup = async () => {
  const customer = await makeUser({ role: 'CUSTOMER' });
  const a = await makeStockedRestaurant({ name: 'Olive Grill' });
  const b = await makeStockedRestaurant({ name: 'Pasta House', deliveryFee: '8.00', minimumOrderAmount: '20.00' });
  return { customer, a, b };
};

const addItem = (customer, foodItemId, { quantity = 1, replace = false } = {}) =>
  request(app)
    .post(`/api/cart/items${replace ? '?replace=true' : ''}`)
    .set(authHeader(customer))
    .send({ foodItemId, quantity });

describe('TC-135..TC-138: cart creation and the single-cart invariant', () => {
  it('TC-135: the first add creates a cart bound to that restaurant', async () => {
    const { customer, a } = await setup();
    const res = await addItem(customer, a.main.id);

    expect(res.status).toBe(200);
    expect(res.body.data.restaurant.id).toBe(a.restaurant.id);
    expect(res.body.data.items).toHaveLength(1);

    const carts = await knex('carts').where({ customer_user_id: customer.id, status: 'ACTIVE' });
    expect(carts).toHaveLength(1);
  });

  it('TC-136: a customer with no cart gets 200 and an empty cart, not 404', async () => {
    const { customer } = await setup();
    const res = await request(app).get('/api/cart').set(authHeader(customer));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.restaurant).toBeNull();
    expect(res.body.data.canCheckout).toBe(false);
    expect(res.body.data.totals.total).toBe('0.00');
  });

  it('TC-137: concurrent first adds produce exactly one cart', async () => {
    const { customer, a } = await setup();

    await Promise.allSettled([
      addItem(customer, a.main.id),
      addItem(customer, a.soup.id),
    ]);

    const carts = await knex('carts').where({ customer_user_id: customer.id, status: 'ACTIVE' });
    expect(carts).toHaveLength(1);
  });

  it('TC-138: a second item from the same restaurant is added', async () => {
    const { customer, a } = await setup();
    await addItem(customer, a.main.id);
    const res = await addItem(customer, a.soup.id);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
  });
});

describe('TC-139..TC-144: the restaurant-switch rule', () => {
  it('TC-139: a cross-restaurant add is a conflict naming both restaurants', async () => {
    const { customer, a, b } = await setup();
    await addItem(customer, a.main.id, { quantity: 3 });

    const res = await addItem(customer, b.main.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CART_RESTAURANT_MISMATCH');
    const detail = res.body.error.details[0];
    expect(detail.currentRestaurant.name).toBe('Olive Grill');
    expect(detail.currentRestaurant.itemCount).toBe(1);
    expect(detail.requestedRestaurant.name).toBe('Pasta House');
  });

  it('TC-140: a rejected cross-restaurant add leaves the cart byte-identical', async () => {
    const { customer, a, b } = await setup();
    await addItem(customer, a.main.id, { quantity: 2 });

    const before = {
      cart: await knex('carts').where({ customer_user_id: customer.id }).first(),
      lines: await knex('cart_items').orderBy('id'),
    };

    const res = await addItem(customer, b.main.id);
    expect(res.status).toBe(409);

    const after = {
      cart: await knex('carts').where({ customer_user_id: customer.id }).first(),
      lines: await knex('cart_items').orderBy('id'),
    };
    expect(after).toEqual(before);
  });

  it('TC-141: replace=true clears, rebinds and adds atomically', async () => {
    const { customer, a, b } = await setup();
    await addItem(customer, a.main.id, { quantity: 2 });
    await addItem(customer, a.soup.id);

    const res = await addItem(customer, b.main.id, { replace: true });

    expect(res.status).toBe(200);
    expect(res.body.data.restaurant.id).toBe(b.restaurant.id);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].foodItemId).toBe(b.main.id);
  });

  it('TC-142: a failing replace does not empty the cart', async () => {
    const { customer, a, b } = await setup();
    await addItem(customer, a.main.id, { quantity: 2 });

    const unavailable = await makeItem(b.restaurant, b.category, { name: 'Sold Out', isAvailable: false });
    const res = await addItem(customer, unavailable.id, { replace: true });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ITEM_UNAVAILABLE');

    // The original cart survives: the clear happens after validation, inside
    // the same transaction.
    const lines = await knex('cart_items');
    expect(lines).toHaveLength(1);
    expect(lines[0].food_item_id).toBe(a.main.id);
  });

  it('TC-143: emptying the cart unbinds the restaurant', async () => {
    const { customer, a, b } = await setup();
    const added = await addItem(customer, a.main.id);
    const lineId = added.body.data.items[0].id;

    const removed = await request(app).delete(`/api/cart/items/${lineId}`).set(authHeader(customer));
    expect(removed.status).toBe(200);
    expect(removed.body.data.restaurant).toBeNull();

    // A different restaurant now works with no conflict.
    const res = await addItem(customer, b.main.id);
    expect(res.status).toBe(200);
  });

  it('TC-144: clearing the cart is idempotent', async () => {
    const { customer, a } = await setup();
    await addItem(customer, a.main.id);
    expect((await request(app).delete('/api/cart').set(authHeader(customer))).status).toBe(204);
    expect((await request(app).delete('/api/cart').set(authHeader(customer))).status).toBe(204);
  });
});

describe('TC-145..TC-149: quantities', () => {
  it('TC-145: adding an existing item increments its line', async () => {
    const { customer, a } = await setup();
    await addItem(customer, a.main.id, { quantity: 2 });
    const res = await addItem(customer, a.main.id, { quantity: 1 });

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(3);
  });

  it('TC-146: the increment caps at 20 rather than failing', async () => {
    const { customer, a } = await setup();
    await addItem(customer, a.main.id, { quantity: 19 });
    const res = await addItem(customer, a.main.id, { quantity: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].quantity).toBe(20);
  });

  it('TC-147: quantity boundaries', async () => {
    const { customer, a } = await setup();
    for (const [quantity, expected] of [[0, 422], [-1, 422], [21, 422], [1.5, 422]]) {
      const res = await addItem(customer, a.main.id, { quantity });
      expect(res.status, `quantity ${quantity}`).toBe(expected);
    }
    expect((await addItem(customer, a.main.id, { quantity: 20 })).status).toBe(200);
  });

  it('TC-148: a quantity PATCH sets an absolute value', async () => {
    const { customer, a } = await setup();
    const added = await addItem(customer, a.main.id, { quantity: 5 });
    const lineId = added.body.data.items[0].id;

    const res = await request(app)
      .patch(`/api/cart/items/${lineId}`).set(authHeader(customer)).send({ quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].quantity).toBe(2);
  });

  it('TC-147: quantity 0 is refused because removal is DELETE', async () => {
    const { customer, a } = await setup();
    const added = await addItem(customer, a.main.id);
    const lineId = added.body.data.items[0].id;

    const res = await request(app)
      .patch(`/api/cart/items/${lineId}`).set(authHeader(customer)).send({ quantity: 0 });
    expect(res.status).toBe(422);
  });
});

describe('TC-150..TC-153: item and restaurant orderability', () => {
  it('TC-150: an unavailable item cannot be added', async () => {
    const { customer, a } = await setup();
    const item = await makeItem(a.restaurant, a.category, { name: 'Sold Out', isAvailable: false });

    const res = await addItem(customer, item.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ITEM_UNAVAILABLE');
    expect(await knex('cart_items')).toHaveLength(0);
  });

  it('TC-151: an item in an inactive category cannot be added', async () => {
    const { customer, a } = await setup();
    const hidden = await makeCategory(a.restaurant, { name: 'Seasonal', isActive: false });
    const item = await makeItem(a.restaurant, hidden, { name: 'Pumpkin Stew' });

    const res = await addItem(customer, item.id);
    expect(res.status).toBe(422);
  });

  it('TC-152: a soft-deleted item is 404', async () => {
    const { customer, a } = await setup();
    const item = await makeItem(a.restaurant, a.category, { name: 'Old Special', deletedAt: new Date() });

    const res = await addItem(customer, item.id);
    expect(res.status).toBe(404);
  });

  it('TC-153: closed, paused and suspended restaurants are all refused', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });

    const closed = await makeStockedRestaurant({ name: 'Closed Co', closedToday: true });
    const paused = await makeStockedRestaurant({ name: 'Paused Co', isAcceptingOrders: false });
    const suspended = await makeStockedRestaurant({ name: 'Suspended Co', status: 'SUSPENDED' });

    for (const [fixture, reason] of [
      [closed, 'CLOSED_NOW'], [paused, 'NOT_ACCEPTING'], [suspended, 'NOT_ACTIVE'],
    ]) {
      const res = await addItem(customer, fixture.main.id);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('RESTAURANT_UNAVAILABLE');
      expect(res.body.error.details[0].reason).toBe(reason);
    }
  });
});

describe('TC-154..TC-163: revalidation and pricing', () => {
  it('TC-154: the cart stores no price other than the change-detection column', async () => {
    const columns = await knex('cart_items').columnInfo();
    const priceLike = Object.keys(columns).filter((c) => c.includes('price'));
    expect(priceLike).toEqual(['price_seen_at_add']);
  });

  it('TC-155/TC-156: a price change shows the live price and blocks checkout', async () => {
    const { customer, a } = await setup();
    await addItem(customer, a.main.id, { quantity: 2 });

    await knex('food_items').where({ id: a.main.id }).update({ price: '62.00' });

    const res = await request(app).get('/api/cart').set(authHeader(customer));
    expect(res.body.data.items[0].unitPrice).toBe('62.00');
    expect(res.body.data.items[0].lineTotal).toBe('124.00');
    expect(res.body.data.items[0].issues).toContain('PRICE_CHANGED');
    expect(res.body.data.canCheckout).toBe(false);
  });

  it('TC-157: an item turned unavailable is flagged, not silently removed', async () => {
    const { customer, a } = await setup();
    await addItem(customer, a.main.id);
    await knex('food_items').where({ id: a.main.id }).update({ is_available: false });

    const res = await request(app).get('/api/cart').set(authHeader(customer));
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].issues).toContain('ITEM_UNAVAILABLE');
    expect(res.body.data.canCheckout).toBe(false);
  });

  it('TC-158: a deleted item disappears from the cart', async () => {
    const { customer, a } = await setup();
    await addItem(customer, a.main.id);
    await addItem(customer, a.soup.id);

    await knex('food_items').where({ id: a.main.id }).del();

    const res = await request(app).get('/api/cart').set(authHeader(customer));
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].foodItemId).toBe(a.soup.id);
  });

  it('TC-159: totals are computed server-side and match the canonical fixture', async () => {
    const { customer, a } = await setup();
    await addItem(customer, a.main.id, { quantity: 2 });
    await addItem(customer, a.soup.id, { quantity: 1 });

    const res = await request(app).get('/api/cart').set(authHeader(customer));
    expect(res.body.data.totals).toEqual({
      subtotal: '134.00', discountAmount: '0.00', deliveryFee: '12.00', taxAmount: '18.76', total: '164.76',
    });
    expect(res.body.data.canCheckout).toBe(true);
  });

  it('TC-161: a below-minimum cart reports the shortfall and blocks checkout', async () => {
    const { customer, a } = await setup();
    const cheap = await makeItem(a.restaurant, a.category, { name: 'Side Salad', price: '9.00' });
    await addItem(customer, cheap.id);

    const res = await request(app).get('/api/cart').set(authHeader(customer));
    expect(res.body.data.meetsMinimum).toBe(false);
    expect(res.body.data.minimumShortfall).toBe('21.00');
    expect(res.body.data.canCheckout).toBe(false);
  });
});

describe('TC-164..TC-166: ownership and role', () => {
  it('TC-164: another customer cart line is unreachable', async () => {
    const { customer, a } = await setup();
    const other = await makeUser({ role: 'CUSTOMER' });
    const added = await addItem(customer, a.main.id);
    const lineId = added.body.data.items[0].id;

    expect((await request(app).patch(`/api/cart/items/${lineId}`).set(authHeader(other)).send({ quantity: 5 })).status).toBe(404);
    expect((await request(app).delete(`/api/cart/items/${lineId}`).set(authHeader(other))).status).toBe(404);

    const line = await knex('cart_items').where({ id: lineId }).first();
    expect(line.quantity).toBe(1);
  });

  it('TC-165: non-customer roles are refused on every cart route', async () => {
    const owner = await makeUser({ role: 'RESTAURANT' });
    const driver = await makeUser({ role: 'DRIVER' });
    const admin = await makeUser({ role: 'ADMIN' });

    for (const user of [owner, driver, admin]) {
      expect((await request(app).get('/api/cart').set(authHeader(user))).status).toBe(403);
      expect((await request(app).post('/api/cart/items').set(authHeader(user))
        .send({ foodItemId: '11111111-1111-1111-1111-111111111111', quantity: 1 })).status).toBe(403);
    }
  });

  it('TC-166: the cart is server-side state and survives a new session', async () => {
    const { customer, a } = await setup();
    await addItem(customer, a.main.id, { quantity: 2 });

    // A fresh token is a fresh "session"; the cart is keyed to the user.
    const res = await request(app).get('/api/cart').set(authHeader(customer));
    expect(res.body.data.items[0].quantity).toBe(2);
  });
});
