import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeStockedRestaurant, makeRestaurant, makeCategory, makeItem, authHeader,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

const fullWeek = (overrides = {}) => ({
  hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek, isClosed: false, opensAt: '11:00', closesAt: '23:00', ...overrides,
  })),
});

describe('TC-071..TC-083: restaurant profile and hours', () => {
  it('TC-071/TC-074: the owner reads and updates their own profile', async () => {
    const { owner, restaurant } = await makeStockedRestaurant({ name: 'Olive Grill' });

    const read = await request(app).get('/api/restaurant/profile').set(authHeader(owner));
    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ id: restaurant.id, name: 'Olive Grill', status: 'ACTIVE' });

    const updated = await request(app).patch('/api/restaurant/profile').set(authHeader(owner))
      .send({ description: 'Charcoal grilled classics.', deliveryFee: '15.00', avgPreparationMinutes: 25 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.deliveryFee).toBe('15.00');
  });

  it('TC-075: renaming does not change the slug', async () => {
    const { owner, restaurant } = await makeStockedRestaurant({ name: 'Olive Grill' });
    const before = restaurant.slug;

    await request(app).patch('/api/restaurant/profile').set(authHeader(owner)).send({ name: 'Olive Grill House' });

    const after = await knex('restaurants').where({ id: restaurant.id }).first();
    expect(after.name).toBe('Olive Grill House');
    expect(after.slug).toBe(before);
  });

  it('TC-077: invalid profile values are refused', async () => {
    const { owner } = await makeStockedRestaurant();
    const cases = [
      { deliveryFee: '-1.00' }, { minimumOrderAmount: '-5.00' },
      { avgPreparationMinutes: 4 }, { avgPreparationMinutes: 200 },
      { cuisineType: 'MARTIAN' }, { name: 'A' },
    ];
    for (const body of cases) {
      const res = await request(app).patch('/api/restaurant/profile').set(authHeader(owner)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
  });

  it('TC-078: a full week replaces the schedule', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const res = await request(app).put('/api/restaurant/hours').set(authHeader(owner)).send(fullWeek());

    expect(res.status).toBe(200);
    const rows = await knex('restaurant_hours').where({ restaurant_id: restaurant.id });
    expect(rows).toHaveLength(7);
  });

  it('TC-079: a week missing a day is refused and leaves the stored week intact', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    await request(app).put('/api/restaurant/hours').set(authHeader(owner)).send(fullWeek());

    const partial = { hours: fullWeek().hours.filter((h) => h.dayOfWeek !== 3) };
    const res = await request(app).put('/api/restaurant/hours').set(authHeader(owner)).send(partial);

    expect(res.status).toBe(422);
    const rows = await knex('restaurant_hours').where({ restaurant_id: restaurant.id });
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.day_of_week === 3).opens_at).toBe('11:00:00');
  });

  it('TC-080/TC-081/TC-082: duplicate day, overnight and equal times are refused', async () => {
    const { owner } = await makeStockedRestaurant();

    const duplicate = { hours: [...fullWeek().hours, { dayOfWeek: 1, isClosed: true }] };
    expect((await request(app).put('/api/restaurant/hours').set(authHeader(owner)).send(duplicate)).status).toBe(422);

    const overnight = fullWeek();
    overnight.hours[0] = { dayOfWeek: 0, isClosed: false, opensAt: '22:00', closesAt: '02:00' };
    const res = await request(app).put('/api/restaurant/hours').set(authHeader(owner)).send(overnight);
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/overnight/i);

    const equal = fullWeek();
    equal.hours[0] = { dayOfWeek: 0, isClosed: false, opensAt: '11:00', closesAt: '11:00' };
    expect((await request(app).put('/api/restaurant/hours').set(authHeader(owner)).send(equal)).status).toBe(422);
  });

  it('TC-086: pausing intake makes the restaurant non-orderable immediately', async () => {
    const { owner, restaurant, main } = await makeStockedRestaurant();
    const customer = await makeUser({ role: 'CUSTOMER' });

    await request(app).patch('/api/restaurant/accepting-orders')
      .set(authHeader(owner)).send({ isAcceptingOrders: false });

    const seen = await request(app).get(`/api/restaurants/${restaurant.id}`);
    expect(seen.body.data.isOrderable).toBe(false);
    expect(seen.body.data.unavailableReason).toBe('NOT_ACCEPTING');

    const add = await request(app).post('/api/cart/items').set(authHeader(customer))
      .send({ foodItemId: main.id, quantity: 1 });
    expect(add.status).toBe(422);
    expect(add.body.error.code).toBe('RESTAURANT_UNAVAILABLE');
  });
});

describe('TC-091..TC-114: menu management', () => {
  it('TC-091/TC-092/TC-093: categories are unique per restaurant, case-insensitively', async () => {
    const { owner } = await makeStockedRestaurant();
    const { owner: other } = await makeStockedRestaurant({ name: 'Other Place' });

    expect((await request(app).post('/api/restaurant/categories').set(authHeader(owner))
      .send({ name: 'Starters' })).status).toBe(201);

    const duplicate = await request(app).post('/api/restaurant/categories').set(authHeader(owner))
      .send({ name: 'starters' });
    expect(duplicate.status).toBe(409);

    // The same name in a different restaurant is fine.
    expect((await request(app).post('/api/restaurant/categories').set(authHeader(other))
      .send({ name: 'Starters' })).status).toBe(201);
  });

  it('TC-094: a soft-deleted category name can be reused', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const created = await request(app).post('/api/restaurant/categories')
      .set(authHeader(owner)).send({ name: 'Seasonal' });

    await request(app).delete(`/api/restaurant/categories/${created.body.data.id}`).set(authHeader(owner));

    const again = await request(app).post('/api/restaurant/categories')
      .set(authHeader(owner)).send({ name: 'Seasonal' });
    expect(again.status).toBe(201);
    expect(restaurant.id).toBeTruthy();
  });

  it('TC-096: deleting a non-empty category is refused with the count', async () => {
    const { owner, category } = await makeStockedRestaurant();

    const res = await request(app).delete(`/api/restaurant/categories/${category.id}`).set(authHeader(owner));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_NOT_EMPTY');
    expect(res.body.error.details[0].itemCount).toBe(2);
  });

  it('TC-098: deactivating a category hides its items without changing their flags', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const seasonal = await makeCategory(restaurant, { name: 'Seasonal' });
    const item = await makeItem(restaurant, seasonal, { name: 'Pumpkin Stew' });

    await request(app).patch(`/api/restaurant/categories/${seasonal.id}`)
      .set(authHeader(owner)).send({ isActive: false });

    const publicMenu = await request(app).get(`/api/restaurants/${restaurant.id}/menu`);
    const names = publicMenu.body.data.flatMap((c) => c.items.map((i) => i.name));
    expect(names).not.toContain('Pumpkin Stew');

    const row = await knex('food_items').where({ id: item.id }).first();
    expect(row.is_available).toBe(true);
  });

  it('TC-104: price boundaries, including the values that must be accepted', async () => {
    const { owner, category } = await makeStockedRestaurant();
    const cases = [
      ['0.00', 422], ['-5.00', 422], ['12.345', 422],
      ['9999.99', 201], ['10000.00', 422], ['0.01', 201],
    ];
    let n = 0;
    for (const [price, expected] of cases) {
      n += 1;
      const res = await request(app).post('/api/restaurant/items').set(authHeader(owner))
        .send({ categoryId: category.id, name: `Priced ${n}`, price });
      expect(res.status, `price ${price}`).toBe(expected);
    }
  });

  it('TC-107: dangerous image URL schemes are refused', async () => {
    const { owner, category } = await makeStockedRestaurant();
    for (const imageUrl of ['javascript:alert(1)', 'data:text/html,<script>', `https://x.test/${'a'.repeat(500)}`]) {
      const res = await request(app).post('/api/restaurant/items').set(authHeader(owner))
        .send({ categoryId: category.id, name: `Img ${Math.random()}`, price: '10.00', imageUrl });
      expect(res.status, imageUrl.slice(0, 20)).toBe(422);
    }
    const ok = await request(app).post('/api/restaurant/items').set(authHeader(owner))
      .send({ categoryId: category.id, name: 'Good Image', price: '10.00', imageUrl: 'https://x.test/a.jpg' });
    expect(ok.status).toBe(201);
  });

  it('TC-108: a category from another restaurant is refused on categoryId', async () => {
    const { owner } = await makeStockedRestaurant();
    const { category: foreign } = await makeStockedRestaurant({ name: 'Other Place' });

    const res = await request(app).post('/api/restaurant/items').set(authHeader(owner))
      .send({ categoryId: foreign.id, name: 'Sneaky Dish', price: '10.00' });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('categoryId');
  });

  it('TC-109: another restaurant item is unreachable', async () => {
    const { owner } = await makeStockedRestaurant();
    const { main: foreignItem } = await makeStockedRestaurant({ name: 'Other Place' });

    for (const [method, path, body] of [
      ['patch', `/api/restaurant/items/${foreignItem.id}`, { name: 'Hijacked' }],
      ['patch', `/api/restaurant/items/${foreignItem.id}/availability`, { isAvailable: false }],
      ['delete', `/api/restaurant/items/${foreignItem.id}`, {}],
    ]) {
      const res = await request(app)[method](path).set(authHeader(owner)).send(body);
      expect(res.status, path).toBe(404);
    }

    const row = await knex('food_items').where({ id: foreignItem.id }).first();
    expect(row.is_available).toBe(true);
    expect(row.deleted_at).toBeNull();
  });

  it('TC-110: the availability toggle changes only availability', async () => {
    const { owner, main } = await makeStockedRestaurant();
    const before = await knex('food_items').where({ id: main.id }).first();

    await request(app).patch(`/api/restaurant/items/${main.id}/availability`)
      .set(authHeader(owner)).send({ isAvailable: false });

    const after = await knex('food_items').where({ id: main.id }).first();
    expect(after.is_available).toBe(false);
    expect(after.name).toBe(before.name);
    expect(after.price).toBe(before.price);
    expect(after.category_id).toBe(before.category_id);
    expect(after.description).toBe(before.description);
  });

  it('TC-111: an unavailable item stays on the public menu, flagged', async () => {
    const { owner, restaurant, main } = await makeStockedRestaurant();
    await request(app).patch(`/api/restaurant/items/${main.id}/availability`)
      .set(authHeader(owner)).send({ isAvailable: false });

    const res = await request(app).get(`/api/restaurants/${restaurant.id}/menu`);
    const item = res.body.data.flatMap((c) => c.items).find((i) => i.id === main.id);
    expect(item).toBeDefined();
    expect(item.isAvailable).toBe(false);
  });

  it('TC-112: deleting an item is a soft delete', async () => {
    const { owner, restaurant, main } = await makeStockedRestaurant();
    await request(app).delete(`/api/restaurant/items/${main.id}`).set(authHeader(owner));

    const row = await knex('food_items').where({ id: main.id }).first();
    expect(row).toBeDefined();
    expect(row.deleted_at).not.toBeNull();

    const menu = await request(app).get(`/api/restaurants/${restaurant.id}/menu`);
    expect(menu.body.data.flatMap((c) => c.items).map((i) => i.id)).not.toContain(main.id);
  });

  it('TC-099: bulk reorder is atomic', async () => {
    const { owner, restaurant, category } = await makeStockedRestaurant();
    const second = await makeCategory(restaurant, { name: 'Desserts' });

    const bad = await request(app).put('/api/restaurant/categories/order').set(authHeader(owner))
      .send({ categories: [
        { id: category.id, displayOrder: 5 },
        { id: '11111111-1111-1111-1111-111111111111', displayOrder: 6 },
      ] });
    expect(bad.status).toBe(404);

    const unchanged = await knex('menu_categories').where({ id: category.id }).first();
    expect(unchanged.display_order).toBe(0);

    const good = await request(app).put('/api/restaurant/categories/order').set(authHeader(owner))
      .send({ categories: [{ id: category.id, displayOrder: 2 }, { id: second.id, displayOrder: 1 }] });
    expect(good.status).toBe(200);
  });
});

describe('TC-115..TC-134: discovery', () => {
  it('TC-115/TC-116: only ACTIVE restaurants are discoverable', async () => {
    const active = await makeStockedRestaurant({ name: 'Visible' });
    const pending = await makeStockedRestaurant({ name: 'Pending', status: 'PENDING_APPROVAL' });
    const suspended = await makeStockedRestaurant({ name: 'Suspended', status: 'SUSPENDED' });

    const list = await request(app).get('/api/restaurants');
    const ids = list.body.data.map((r) => r.id);
    expect(ids).toContain(active.restaurant.id);
    expect(ids).not.toContain(pending.restaurant.id);
    expect(ids).not.toContain(suspended.restaurant.id);

    for (const hidden of [pending, suspended]) {
      expect((await request(app).get(`/api/restaurants/${hidden.restaurant.id}`)).status).toBe(404);
      expect((await request(app).get(`/api/restaurants/${hidden.restaurant.id}/menu`)).status).toBe(404);
    }
  });

  it('TC-117: public payloads carry no owner or approval metadata', async () => {
    const { restaurant } = await makeStockedRestaurant();
    const res = await request(app).get(`/api/restaurants/${restaurant.id}`);
    const body = JSON.stringify(res.body);

    expect(body).not.toMatch(/ownerUserId|owner_user_id/);
    expect(body).not.toMatch(/approvedBy|approved_by/);
    expect(body).not.toMatch(/@example\.com/);
  });

  it('TC-118/TC-119/TC-120/TC-121: pagination', async () => {
    for (let i = 0; i < 21; i += 1) await makeStockedRestaurant({ name: `Place ${i}` });

    const page2 = await request(app).get('/api/restaurants?page=2&limit=20');
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta.pagination).toEqual({ page: 2, limit: 20, total: 21, totalPages: 2 });

    expect((await request(app).get('/api/restaurants?limit=500')).status).toBe(422);
    expect((await request(app).get('/api/restaurants?limit=101')).status).toBe(422);
    expect((await request(app).get('/api/restaurants?page=-1')).status).toBe(422);
    expect((await request(app).get('/api/restaurants?page=0')).status).toBe(422);

    const beyond = await request(app).get('/api/restaurants?page=999');
    expect(beyond.status).toBe(200);
    expect(beyond.body.data).toEqual([]);
  });

  it('TC-124: openNow excludes paused and closed restaurants', async () => {
    const open = await makeStockedRestaurant({ name: 'Open Now' });
    const paused = await makeStockedRestaurant({ name: 'Paused', isAcceptingOrders: false });
    const closed = await makeStockedRestaurant({ name: 'Closed', closedToday: true });

    const res = await request(app).get('/api/restaurants?openNow=true');
    const ids = res.body.data.map((r) => r.id);

    expect(ids).toContain(open.restaurant.id);
    expect(ids).not.toContain(paused.restaurant.id);
    expect(ids).not.toContain(closed.restaurant.id);
  });

  it('TC-125: the SQL openNow filter agrees with the JS orderability flag', async () => {
    await makeStockedRestaurant({ name: 'A open' });
    await makeStockedRestaurant({ name: 'B paused', isAcceptingOrders: false });
    await makeStockedRestaurant({ name: 'C closed', closedToday: true });
    await makeStockedRestaurant({ name: 'D suspended', status: 'SUSPENDED' });

    const all = await request(app).get('/api/restaurants?limit=100');
    const orderableByFlag = all.body.data.filter((r) => r.isOrderable).map((r) => r.id).sort();

    const filtered = await request(app).get('/api/restaurants?openNow=true&limit=100');
    const orderableBySql = filtered.body.data.map((r) => r.id).sort();

    expect(orderableBySql).toEqual(orderableByFlag);
  });

  it('TC-128: unrated restaurants sort last under a rating sort', async () => {
    const rated = await makeStockedRestaurant({ name: 'One Star' });
    const unrated = await makeStockedRestaurant({ name: 'Brand New' });
    await knex('restaurants').where({ id: rated.restaurant.id })
      .update({ rating_average: '1.00', rating_count: 4 });

    const res = await request(app).get('/api/restaurants?sort=rating&order=desc&limit=100');
    const ids = res.body.data.map((r) => r.id);

    expect(ids.indexOf(rated.restaurant.id)).toBeLessThan(ids.indexOf(unrated.restaurant.id));
  });

  it('TC-129: the sort parameter is allow-listed', async () => {
    for (const sort of ['passwordHash', 'password_hash', 'name;DROP TABLE users']) {
      const res = await request(app).get(`/api/restaurants?sort=${encodeURIComponent(sort)}`);
      expect(res.status, sort).toBe(422);
    }
    expect((await request(app).get('/api/restaurants?order=sideways')).status).toBe(422);
    expect(await knex('users')).toBeDefined();
  });

  it('TC-132/TC-133/TC-134: search matches partially, excludes inactive and escapes wildcards', async () => {
    const visible = await makeStockedRestaurant({ name: 'Olive Grill' });
    await makeItem(visible.restaurant, visible.category, { name: 'Mixed Grill Platter' });
    const hidden = await makeStockedRestaurant({ name: 'Hidden Grill', status: 'SUSPENDED' });
    await makeItem(hidden.restaurant, hidden.category, { name: 'Secret Grill Dish' });

    const res = await request(app).get('/api/search?q=rill');
    expect(res.body.data.restaurants.map((r) => r.name)).toContain('Olive Grill');
    expect(res.body.data.restaurants.map((r) => r.name)).not.toContain('Hidden Grill');
    expect(res.body.data.foodItems.map((i) => i.name)).not.toContain('Secret Grill Dish');

    const upper = await request(app).get('/api/search?q=GRILL');
    expect(upper.body.data.restaurants.length).toBeGreaterThan(0);

    // A wildcard must be literal, not a match-everything pattern. Two
    // characters, because a single one is below the documented minimum.
    const wildcard = await request(app).get('/api/search?q=%25%25');
    expect(wildcard.status).toBe(200);
    expect(wildcard.body.data.restaurants).toEqual([]);
    expect(wildcard.body.data.foodItems).toEqual([]);

    const underscores = await request(app).get('/api/search?q=__');
    expect(underscores.status).toBe(200);
    expect(underscores.body.data.restaurants).toEqual([]);

    expect((await request(app).get('/api/search?q=a')).status).toBe(422);
    expect((await request(app).get('/api/search?q=%20%20')).status).toBe(422);

    const injection = await request(app).get(`/api/search?q=${encodeURIComponent("'; DROP TABLE users; --")}`);
    expect(injection.status).toBe(200);
    expect(await knex('users')).toBeDefined();
  });

  it('TC-419: the cuisine list reflects only cuisines with an active restaurant', async () => {
    await makeStockedRestaurant({ name: 'Levant Place', cuisineType: 'LEVANTINE' });
    await makeStockedRestaurant({ name: 'Hidden Italian', cuisineType: 'ITALIAN', status: 'SUSPENDED' });

    const res = await request(app).get('/api/cuisines');
    const types = res.body.data.map((c) => c.cuisineType);
    expect(types).toContain('LEVANTINE');
    expect(types).not.toContain('ITALIAN');
  });
});

describe('TC-425: a newly registered restaurant can reach approval', () => {
  /*
   * Regression test for a deadlock found by TC-394.
   *
   * Menu management used to require an ACTIVE restaurant, while BR-AD10 refuses
   * to approve a restaurant with no available food item. A restaurant that
   * registered through the product could therefore never be approved. Every
   * existing fixture created restaurants that were already ACTIVE with items
   * inserted straight into the database, so nothing caught it.
   */
  it('TC-425: a PENDING_APPROVAL owner can build the menu that approval requires', async () => {
    const { restaurant, owner } = await makeRestaurant({ status: 'PENDING_APPROVAL' });
    const admin = await makeUser({ role: 'ADMIN' });

    // BR-AD10: an empty restaurant cannot be approved.
    const tooEarly = await request(app)
      .post(`/api/admin/restaurants/${restaurant.id}/approve`)
      .set(authHeader(admin));
    expect(tooEarly.status).toBe(422);

    // So the owner must be able to create a category and an item while pending.
    const category = await request(app)
      .post('/api/restaurant/categories')
      .set(authHeader(owner))
      .send({ name: 'Mains' });
    expect(category.status).toBe(201);

    const item = await request(app)
      .post('/api/restaurant/items')
      .set(authHeader(owner))
      .send({ categoryId: category.body.data.id, name: 'Mixed Grill', price: '58.00' });
    expect(item.status).toBe(201);

    // And approval now succeeds, which closes the loop.
    const approved = await request(app)
      .post(`/api/admin/restaurants/${restaurant.id}/approve`)
      .set(authHeader(admin));
    expect(approved.status).toBe(200);
    expect((await knex('restaurants').where({ id: restaurant.id }).first()).status).toBe('ACTIVE');
  });

  it('TC-426: a pending restaurant still cannot trade', async () => {
    const { owner } = await makeRestaurant({ status: 'PENDING_APPROVAL' });

    // Setup is open; trading is not. Both refusals name the same cause.
    for (const call of [
      request(app).get('/api/restaurant/orders').set(authHeader(owner)),
      request(app).get('/api/restaurant/stats').set(authHeader(owner)),
      request(app).patch('/api/restaurant/accepting-orders')
        .set(authHeader(owner)).send({ isAcceptingOrders: true }),
    ]) {
      const res = await call;
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RESTAURANT_NOT_APPROVED');
    }
  });

  it('TC-427: a pending restaurant\u2019s menu is not public', async () => {
    const { restaurant, owner } = await makeRestaurant({ status: 'PENDING_APPROVAL' });
    const category = await request(app).post('/api/restaurant/categories')
      .set(authHeader(owner)).send({ name: 'Mains' });
    await request(app).post('/api/restaurant/items').set(authHeader(owner))
      .send({ categoryId: category.body.data.id, name: 'Secret Dish', price: '58.00' });

    // BR-R2: building a menu early does not publish it.
    expect((await request(app).get(`/api/restaurants/${restaurant.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/restaurants/${restaurant.id}/menu`)).status).toBe(404);

    const listing = await request(app).get('/api/restaurants?limit=50');
    expect(JSON.stringify(listing.body.data)).not.toContain('Secret Dish');
  });
});
