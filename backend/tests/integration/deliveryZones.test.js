import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, authHeader,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

// The factory restaurant sits at 24.695, 46.68. One degree of latitude is
// about 111.2 km, so these are roughly 0.6 km and 20 km away.
const NEAR = { latitude: 24.69, longitude: 46.68 };
const FAR = { latitude: 24.875, longitude: 46.68 };

async function setup(addressOverrides = {}, restaurantOptions = {}) {
  const customer = await makeUser({ role: 'CUSTOMER' });
  const address = await makeAddress(customer, addressOverrides);
  const stocked = await makeStockedRestaurant(restaurantOptions);
  return { customer, address, ...stocked };
}

const checkout = (customer, address, extra = {}) =>
  request(app).post('/api/orders').set(authHeader(customer))
    .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY', ...extra });

describe('restaurant radius (owner and admin)', () => {
  it('defaults to 8 km', async () => {
    const { restaurant } = await makeStockedRestaurant();
    expect(restaurant.delivery_radius_km).toBe('8.0');
  });

  it('lets the owner read and change it within 1-30 km', async () => {
    const { owner } = await makeStockedRestaurant();
    const read = await request(app).get('/api/restaurant/profile').set(authHeader(owner));
    expect(read.body.data.deliveryRadiusKm).toBe('8.0');

    const set = await request(app).patch('/api/restaurant/profile').set(authHeader(owner))
      .send({ deliveryRadiusKm: 12.5 });
    expect(set.status).toBe(200);
    expect(set.body.data.deliveryRadiusKm).toBe('12.5');
  });

  it.each([0.5, 0, 31, -3, 'abc'])('rejects a radius of %s', async (value) => {
    const { owner } = await makeStockedRestaurant();
    const res = await request(app).patch('/api/restaurant/profile').set(authHeader(owner))
      .send({ deliveryRadiusKm: value });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('shows it to an admin in the restaurant list', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    await makeStockedRestaurant();
    const res = await request(app).get('/api/admin/restaurants').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ deliveryRadiusKm: '8.0', latitude: '24.695000' });
  });

  it('is enforced by the database too', async () => {
    const { restaurant } = await makeStockedRestaurant();
    await expect(knex('restaurants').where({ id: restaurant.id }).update({ delivery_radius_km: 50 }))
      .rejects.toThrow();
  });
});

describe('discovery reports whether a restaurant delivers to the customer', () => {
  it('annotates the listing using the default address', async () => {
    const { customer, restaurant } = await setup(NEAR);
    const res = await request(app).get('/api/restaurants').set(authHeader(customer));
    const row = res.body.data.find((r) => r.id === restaurant.id);
    expect(row).toMatchObject({ deliversToAddress: true, distanceKm: 0.6, deliveryRadiusKm: '8.0' });
  });

  it('says no for an address outside the zone', async () => {
    const { customer, restaurant } = await setup(FAR);
    const res = await request(app).get('/api/restaurants').set(authHeader(customer));
    const row = res.body.data.find((r) => r.id === restaurant.id);
    expect(row.deliversToAddress).toBe(false);
    expect(row.distanceKm).toBeGreaterThan(8);
  });

  it('uses the selected address over the default one', async () => {
    const { customer, restaurant } = await setup(NEAR);
    const far = await makeAddress(customer, { ...FAR, isDefault: false, label: 'Work' });
    const res = await request(app).get(`/api/restaurants?addressId=${far.id}`).set(authHeader(customer));
    expect(res.body.data.find((r) => r.id === restaurant.id).deliversToAddress).toBe(false);
  });

  it('annotates the restaurant page and search results', async () => {
    const { customer, restaurant } = await setup(FAR);
    const page = await request(app).get(`/api/restaurants/${restaurant.id}`).set(authHeader(customer));
    expect(page.body.data.deliversToAddress).toBe(false);
    const search = await request(app).get(`/api/search?q=${encodeURIComponent(restaurant.name)}`)
      .set(authHeader(customer));
    expect(search.body.data.restaurants[0].deliversToAddress).toBe(false);
  });

  it('does not annotate an anonymous request', async () => {
    const { restaurant } = await setup(FAR);
    const list = await request(app).get('/api/restaurants');
    const row = list.body.data.find((r) => r.id === restaurant.id);
    expect(row).not.toHaveProperty('deliversToAddress');
    expect(row).not.toHaveProperty('distanceKm');
    const page = await request(app).get(`/api/restaurants/${restaurant.id}`);
    expect(page.body.data).not.toHaveProperty('deliversToAddress');
  });

  it('treats a stale token as anonymous rather than failing the page', async () => {
    const { restaurant } = await setup(FAR);
    const res = await request(app).get(`/api/restaurants/${restaurant.id}`)
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('deliversToAddress');
  });

  it('does not annotate a customer with no address, or with an address that is not theirs', async () => {
    const { restaurant } = await setup(NEAR);
    const loner = await makeUser({ role: 'CUSTOMER' });
    const none = await request(app).get(`/api/restaurants/${restaurant.id}`).set(authHeader(loner));
    expect(none.body.data).not.toHaveProperty('deliversToAddress');

    const someoneElses = await makeAddress(await makeUser({ role: 'CUSTOMER' }), FAR);
    const res = await request(app).get(`/api/restaurants/${restaurant.id}?addressId=${someoneElses.id}`)
      .set(authHeader(loner));
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('deliversToAddress');
  });

  it('reports an address with no coordinates as deliverable but unchecked', async () => {
    const { customer, restaurant } = await setup({ latitude: null, longitude: null });
    const res = await request(app).get(`/api/restaurants/${restaurant.id}`).set(authHeader(customer));
    expect(res.body.data).toMatchObject({ deliversToAddress: true, distanceKm: null, zoneChecked: false });
  });
});

describe('checkout is authoritative', () => {
  const withCart = (ctx) =>
    request(app).post('/api/cart/items').set(authHeader(ctx.customer))
      .send({ foodItemId: ctx.main.id, quantity: 1 });

  it('places the order for an address inside the zone', async () => {
    const ctx = await setup(NEAR);
    await withCart(ctx);
    const res = await checkout(ctx.customer, ctx.address);
    expect(res.status).toBe(201);
  });

  it('refuses an address outside the zone with the distance and radius', async () => {
    const ctx = await setup(FAR);
    await withCart(ctx);
    const res = await checkout(ctx.customer, ctx.address);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUTSIDE_DELIVERY_ZONE');
    expect(res.body.error.details[0]).toMatchObject({ field: 'addressId', radiusKm: 8 });
    expect(res.body.error.details[0].distanceKm).toBeGreaterThan(8);
    // Nothing was written: no order, and the cart is still there.
    expect(await knex('orders')).toHaveLength(0);
    const cart = await request(app).get('/api/cart').set(authHeader(ctx.customer));
    expect(cart.body.data.items).toHaveLength(1);
  });

  it('accepts the same address once the owner widens the radius', async () => {
    const ctx = await setup(FAR);
    await withCart(ctx);
    expect((await checkout(ctx.customer, ctx.address)).status).toBe(422);
    await knex('restaurants').where({ id: ctx.restaurant.id }).update({ delivery_radius_km: 30 });
    expect((await checkout(ctx.customer, ctx.address)).status).toBe(201);
  });

  it('applies to card orders as well, before any payment is created', async () => {
    const ctx = await setup(FAR);
    await withCart(ctx);
    const res = await checkout(ctx.customer, ctx.address, { paymentMethod: 'CARD' });
    expect(res.status).toBe(422);
    expect(await knex('payments')).toHaveLength(0);
  });

  it('lets an address without coordinates through (BR-DZ4)', async () => {
    const ctx = await setup({ latitude: null, longitude: null });
    await withCart(ctx);
    expect((await checkout(ctx.customer, ctx.address)).status).toBe(201);
  });

  it('lets any address through for a restaurant without coordinates', async () => {
    const ctx = await setup(FAR);
    await knex('restaurants').where({ id: ctx.restaurant.id }).update({ latitude: null, longitude: null });
    await withCart(ctx);
    expect((await checkout(ctx.customer, ctx.address)).status).toBe(201);
  });

  it('also stops an admin placing an order outside the zone', async () => {
    const ctx = await setup(FAR);
    const admin = await makeUser({ role: 'ADMIN' });
    const res = await request(app).post('/api/admin/orders').set(authHeader(admin)).send({
      customerUserId: ctx.customer.id, restaurantId: ctx.restaurant.id, addressId: ctx.address.id,
      items: [{ foodItemId: ctx.main.id, quantity: 1 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUTSIDE_DELIVERY_ZONE');
    expect(await knex('orders')).toHaveLength(0);
  });
});
