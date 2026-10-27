import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeDriver, makeRestaurant, makeCategory, makeItem, makeStockedRestaurant, makeAddress, authHeader,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

const put = (user, path) => request(app).put(`/api/favourites${path}`).set(authHeader(user));
const del = (user, path) => request(app).delete(`/api/favourites${path}`).set(authHeader(user));
const list = (user) => request(app).get('/api/favourites').set(authHeader(user));

const MISSING = '11111111-1111-1111-1111-111111111111';

describe('favourite restaurants (BR-FV1..FV3)', () => {
  it('adds a restaurant, and adding it twice leaves one row', async () => {
    const customer = await makeUser();
    const { restaurant } = await makeStockedRestaurant();

    const first = await put(customer, `/restaurants/${restaurant.id}`);
    const second = await put(customer, `/restaurants/${restaurant.id}`);

    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ restaurantId: restaurant.id, isFavourite: true });
    expect(second.status).toBe(200);
    expect(await knex('favourite_restaurants').where({ user_id: customer.id })).toHaveLength(1);
  });

  it('removes a favourite, and removing it again is still 204', async () => {
    const customer = await makeUser();
    const { restaurant } = await makeStockedRestaurant();
    await put(customer, `/restaurants/${restaurant.id}`);

    expect((await del(customer, `/restaurants/${restaurant.id}`)).status).toBe(204);
    expect((await del(customer, `/restaurants/${restaurant.id}`)).status).toBe(204);
    expect((await del(customer, `/restaurants/${MISSING}`)).status).toBe(204);
    expect(await knex('favourite_restaurants')).toHaveLength(0);
  });

  it('refuses a restaurant that does not exist or is not public', async () => {
    const customer = await makeUser();
    const pending = await makeStockedRestaurant({ status: 'PENDING_APPROVAL' });
    const suspended = await makeStockedRestaurant({ status: 'SUSPENDED' });
    const deleted = await makeStockedRestaurant();
    await knex('restaurants').where({ id: deleted.restaurant.id }).update({ deleted_at: new Date() });

    for (const id of [MISSING, pending.restaurant.id, suspended.restaurant.id, deleted.restaurant.id]) {
      const res = await put(customer, `/restaurants/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    }
    expect(await knex('favourite_restaurants')).toHaveLength(0);
  });

  it('rejects a malformed id with 422', async () => {
    const customer = await makeUser();
    expect((await put(customer, '/restaurants/not-a-uuid')).status).toBe(422);
  });
});

describe('favourite items (BR-FV2, BR-FV3)', () => {
  it('adds an item idempotently and removes it', async () => {
    const customer = await makeUser();
    const { main } = await makeStockedRestaurant();

    expect((await put(customer, `/items/${main.id}`)).status).toBe(200);
    expect((await put(customer, `/items/${main.id}`)).body.data).toEqual({ foodItemId: main.id, isFavourite: true });
    expect(await knex('favourite_items')).toHaveLength(1);

    expect((await del(customer, `/items/${main.id}`)).status).toBe(204);
    expect(await knex('favourite_items')).toHaveLength(0);
  });

  it('accepts an unavailable item but not a deleted one or one of a non-public restaurant', async () => {
    const customer = await makeUser();
    const { restaurant, category } = await makeStockedRestaurant();
    const off = await makeItem(restaurant, category, { isAvailable: false });
    const gone = await makeItem(restaurant, category, { deletedAt: new Date() });
    const hidden = await makeStockedRestaurant({ status: 'SUSPENDED' });

    expect((await put(customer, `/items/${off.id}`)).status).toBe(200);
    expect((await put(customer, `/items/${gone.id}`)).status).toBe(404);
    expect((await put(customer, `/items/${hidden.main.id}`)).status).toBe(404);
    expect((await put(customer, `/items/${MISSING}`)).status).toBe(404);
  });
});

describe('the favourites list (BR-FV5, BR-FV7)', () => {
  it('returns both kinds, newest first, with the public restaurant fields', async () => {
    const customer = await makeUser();
    const a = await makeStockedRestaurant({ name: 'Alpha Grill' });
    const b = await makeStockedRestaurant({ name: 'Beta Kitchen' });
    await put(customer, `/restaurants/${a.restaurant.id}`);
    await put(customer, `/restaurants/${b.restaurant.id}`);
    await put(customer, `/items/${a.main.id}`);

    const res = await list(customer);

    expect(res.status).toBe(200);
    expect(res.body.data.restaurants.map((r) => r.name)).toEqual(['Beta Kitchen', 'Alpha Grill']);
    expect(res.body.data.restaurants[0]).toMatchObject({
      isFavourite: true, isOrderable: true, isBrowsable: true, deliveryFee: '12.00',
    });
    expect(res.body.data.restaurants[0]).not.toHaveProperty('ownerUserId');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      id: a.main.id, price: '58.00', isAvailable: true, isFavourite: true,
      restaurant: { id: a.restaurant.id, name: 'Alpha Grill', isBrowsable: true },
    });
  });

  it('shows what cannot be ordered as unavailable instead of hiding it', async () => {
    const customer = await makeUser();
    const closed = await makeStockedRestaurant({ isAcceptingOrders: false });
    const live = await makeStockedRestaurant();
    const off = await makeItem(live.restaurant, live.category, { isAvailable: false });
    const gone = await makeItem(live.restaurant, live.category, { name: 'Retired Dish' });
    const hiddenCategory = await makeCategory(live.restaurant, { isActive: false });
    const inHidden = await makeItem(live.restaurant, hiddenCategory);
    const suspendedLater = await makeStockedRestaurant();

    for (const r of [closed, live, suspendedLater]) await put(customer, `/restaurants/${r.restaurant.id}`);
    for (const i of [live.main, off, gone, inHidden, suspendedLater.main]) await put(customer, `/items/${i.id}`);

    // The owner then retires one dish and the platform suspends a restaurant.
    await knex('food_items').where({ id: gone.id }).update({ deleted_at: new Date() });
    await knex('restaurants').where({ id: suspendedLater.restaurant.id }).update({ status: 'SUSPENDED' });

    const { restaurants, items } = (await list(customer)).body.data;
    const byRestaurant = Object.fromEntries(restaurants.map((r) => [r.id, r]));
    const byItem = Object.fromEntries(items.map((i) => [i.id, i]));

    expect(restaurants).toHaveLength(3);
    expect(byRestaurant[closed.restaurant.id]).toMatchObject({ isOrderable: false, isBrowsable: true });
    expect(byRestaurant[live.restaurant.id].isOrderable).toBe(true);
    expect(byRestaurant[suspendedLater.restaurant.id]).toMatchObject({ isOrderable: false, isBrowsable: false });

    expect(items).toHaveLength(5);
    expect(byItem[live.main.id].isAvailable).toBe(true);
    expect(byItem[off.id].isAvailable).toBe(false);
    expect(byItem[gone.id]).toMatchObject({ isAvailable: false, name: 'Retired Dish' });
    expect(byItem[inHidden.id].isAvailable).toBe(false);
    expect(byItem[suspendedLater.main.id]).toMatchObject({
      isAvailable: false, restaurant: { isBrowsable: false },
    });
  });

  it('shows a soft-deleted restaurant as unavailable', async () => {
    const customer = await makeUser();
    const { restaurant } = await makeStockedRestaurant();
    await put(customer, `/restaurants/${restaurant.id}`);
    await knex('restaurants').where({ id: restaurant.id }).update({ deleted_at: new Date() });

    const { restaurants } = (await list(customer)).body.data;
    expect(restaurants).toHaveLength(1);
    expect(restaurants[0]).toMatchObject({ isOrderable: false, isBrowsable: false });
  });
});

describe('isolation and roles (BR-FV1, BR-FV4)', () => {
  it('never shows or changes another customer\'s favourites', async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const { restaurant, main } = await makeStockedRestaurant();
    await put(alice, `/restaurants/${restaurant.id}`);
    await put(alice, `/items/${main.id}`);

    const bobs = (await list(bob)).body.data;
    expect(bobs).toEqual({ restaurants: [], items: [] });

    // Bob removing "his" favourite of the same restaurant touches only his own rows.
    await del(bob, `/restaurants/${restaurant.id}`);
    await del(bob, `/items/${main.id}`);
    const alices = (await list(alice)).body.data;
    expect(alices.restaurants).toHaveLength(1);
    expect(alices.items).toHaveLength(1);
  });

  it('is for customers only: other roles are 403, anonymous is 401', async () => {
    const { restaurant } = await makeStockedRestaurant();
    const { owner } = await makeRestaurant();
    const { user: driver } = await makeDriver();
    const admin = await makeUser({ role: 'ADMIN' });

    for (const user of [owner, driver, admin]) {
      expect((await list(user)).status).toBe(403);
      const res = await put(user, `/restaurants/${restaurant.id}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }
    const anon = await request(app).get('/api/favourites');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('TOKEN_MISSING');
  });
});

describe('favourite flags on discovery (BR-FV6)', () => {
  it('marks restaurants and menu items for a signed-in customer', async () => {
    const customer = await makeUser();
    const liked = await makeStockedRestaurant({ name: 'Liked Place' });
    const other = await makeStockedRestaurant({ name: 'Other Place' });
    await put(customer, `/restaurants/${liked.restaurant.id}`);
    await put(customer, `/items/${liked.main.id}`);

    const listing = await request(app).get('/api/restaurants').set(authHeader(customer));
    const flags = Object.fromEntries(listing.body.data.map((r) => [r.id, r.isFavourite]));
    expect(flags).toEqual({ [liked.restaurant.id]: true, [other.restaurant.id]: false });

    const detail = await request(app).get(`/api/restaurants/${liked.restaurant.id}`).set(authHeader(customer));
    expect(detail.body.data.isFavourite).toBe(true);

    const menu = await request(app).get(`/api/restaurants/${liked.restaurant.id}/menu`).set(authHeader(customer));
    const menuItems = menu.body.data.flatMap((c) => c.items);
    expect(Object.fromEntries(menuItems.map((i) => [i.id, i.isFavourite])))
      .toEqual({ [liked.main.id]: true, [liked.soup.id]: false });

    const search = await request(app).get('/api/search?q=Liked').set(authHeader(customer));
    expect(search.body.data.restaurants[0].isFavourite).toBe(true);
    const dish = await request(app).get('/api/search?q=Mixed').set(authHeader(customer));
    expect(dish.body.data.foodItems.find((i) => i.id === liked.main.id).isFavourite).toBe(true);
  });

  it('leaves anonymous responses exactly as they were', async () => {
    const customer = await makeUser();
    const { restaurant } = await makeStockedRestaurant();
    await put(customer, `/restaurants/${restaurant.id}`);

    const listing = await request(app).get('/api/restaurants');
    const menu = await request(app).get(`/api/restaurants/${restaurant.id}/menu`);
    const detail = await request(app).get(`/api/restaurants/${restaurant.id}`);

    expect(listing.status).toBe(200);
    expect(listing.body.data[0]).not.toHaveProperty('isFavourite');
    expect(detail.body.data).not.toHaveProperty('isFavourite');
    expect(menu.body.data[0].items[0]).not.toHaveProperty('isFavourite');
  });

  it('treats a bad token, or a non-customer, as anonymous on public routes', async () => {
    const { restaurant } = await makeStockedRestaurant();
    const { owner } = await makeRestaurant();

    const stale = await request(app).get('/api/restaurants').set('Authorization', 'Bearer not.a.token');
    expect(stale.status).toBe(200);
    expect(stale.body.data[0]).not.toHaveProperty('isFavourite');

    const asOwner = await request(app).get(`/api/restaurants/${restaurant.id}`).set(authHeader(owner));
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data).not.toHaveProperty('isFavourite');
  });
});

describe('favourites alongside delivery zones (spec-16 with spec-18)', () => {
  it('annotates one restaurant with both the favourite flag and the zone, in the list and on its page', async () => {
    const customer = await makeUser();
    await makeAddress(customer, { latitude: 24.69, longitude: 46.68 }); // about 0.6 km from the factory restaurant
    const { restaurant } = await makeStockedRestaurant();
    await put(customer, `/restaurants/${restaurant.id}`).expect(200);

    const listed = await request(app).get('/api/restaurants').set(authHeader(customer));
    const row = listed.body.data.find((r) => r.id === restaurant.id);
    expect(row).toMatchObject({ isFavourite: true, deliversToAddress: true, distanceKm: 0.6 });

    const page = await request(app).get(`/api/restaurants/${restaurant.id}`).set(authHeader(customer));
    expect(page.body.data).toMatchObject({ isFavourite: true, deliversToAddress: true });
  });
});
