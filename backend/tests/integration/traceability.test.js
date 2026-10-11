/**
 * Named coverage for documented test cases that the behaviour-oriented suites
 * already exercise without carrying their identifier.
 *
 * The matrix in docs/testing/test-matrix.md traces Spec -> Story -> Acceptance
 * Criterion -> Test Case. A behaviour that is asserted but whose case ID is not
 * written down anywhere cannot be traced, and an untraceable case is
 * indistinguishable from a missing one during review. Each `it` below is named
 * for exactly one documented case so the trace closes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app.js';
import { resetDatabase, knex } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeItem, makeOrder, makeDriver,
  makeAssignment, makeCart, authHeader, TEST_PASSWORD,
} from '../helpers/factories.js';
import { config } from '../../src/config/index.js';

beforeEach(async () => { await resetDatabase(); });

/* ------------------------------------------------------------------ tokens */

describe('TC-020: token expiry is distinguishable from token forgery', () => {
  it('TC-020: an expired access token returns TOKEN_EXPIRED, not TOKEN_INVALID', async () => {
    const user = await makeUser();
    // Signed with the real secret but already past its expiry, which is the
    // only way the client can tell "refresh me" from "log out".
    const expired = jwt.sign(
      { sub: user.id, role: user.role, status: user.status },
      config.jwt.secret,
      {
        algorithm: 'HS256',
        expiresIn: '-120s', // past the deliberate 30s clock-skew tolerance
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      },
    );

    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');

    const forged = jwt.sign({ sub: user.id, role: user.role }, 'not-the-real-secret-but-long-enough', {
      algorithm: 'HS256', issuer: config.jwt.issuer, audience: config.jwt.audience,
    });
    const bad = await request(app).get('/api/me').set('Authorization', `Bearer ${forged}`);
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('TOKEN_INVALID');
  });
});

/* ----------------------------------------------- role isolation (TC-033..) */

describe('TC-033..TC-035, TC-049: a role cannot reach another role’s endpoints', () => {
  it('TC-033: a customer cannot manage any restaurant menu', async () => {
    const customer = await makeUser();
    const { restaurant, category, main: item } = await makeStockedRestaurant();

    const attempts = [
      request(app).get('/api/restaurant/items').set(authHeader(customer)),
      request(app).post('/api/restaurant/items').set(authHeader(customer))
        .send({ categoryId: category.id, name: 'Sneaky', price: '1.00' }),
      request(app).patch(`/api/restaurant/items/${item.id}`).set(authHeader(customer)).send({ price: '0.01' }),
      request(app).delete(`/api/restaurant/items/${item.id}`).set(authHeader(customer)),
      request(app).post('/api/restaurant/categories').set(authHeader(customer)).send({ name: 'Sneaky' }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }

    // Nothing was created or changed.
    expect(await knex('food_items').where({ restaurant_id: restaurant.id }).count('* as c'))
      .toEqual([{ c: '2' }]);
    expect((await knex('food_items').where({ id: item.id }).first()).price).toBe('58.00');
  });

  it('TC-034: a customer cannot drive restaurant order transitions', async () => {
    const customer = await makeUser();
    const { restaurant } = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant, status: 'PENDING' });

    for (const action of ['accept', 'reject', 'start-preparing', 'ready', 'cancel']) {
      const res = await request(app)
        .post(`/api/restaurant/orders/${order.id}/${action}`)
        .set(authHeader(customer))
        .send({ reason: 'Trying it on' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }
    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('PENDING');
  });

  it('TC-035: a customer cannot reach driver endpoints', async () => {
    const customer = await makeUser();
    const routes = [
      ['get', '/api/driver/offers'],
      ['get', '/api/driver/deliveries'],
      ['get', '/api/driver/profile'],
      ['patch', '/api/driver/availability'],
      ['patch', '/api/driver/location'],
    ];
    for (const [method, path] of routes) {
      const res = await request(app)[method](path).set(authHeader(customer)).send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }
  });

  it('TC-049: a driver cannot modify restaurant or menu data', async () => {
    const { user: driver } = await makeDriver();
    const { category, main: item } = await makeStockedRestaurant();

    const attempts = [
      request(app).patch('/api/restaurant/profile').set(authHeader(driver)).send({ name: 'Mine now' }),
      request(app).patch('/api/restaurant/accepting-orders').set(authHeader(driver)).send({ isAcceptingOrders: false }),
      request(app).post('/api/restaurant/items').set(authHeader(driver))
        .send({ categoryId: category.id, name: 'Free food', price: '0.00' }),
      request(app).patch(`/api/restaurant/items/${item.id}/availability`).set(authHeader(driver))
        .send({ isAvailable: false }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }
    expect((await knex('food_items').where({ id: item.id }).first()).is_available).toBe(true);
  });
});

/* -------------------------------------------------------- IDOR (TC-037..) */

describe('TC-037, TC-038, TC-040, TC-041, TC-047, TC-048: other people’s rows are 404, never 403', () => {
  it('TC-037: a customer cannot cancel another customer’s order', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const { restaurant } = await makeStockedRestaurant();
    const order = await makeOrder({ customer: owner, restaurant, status: 'PENDING' });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set(authHeader(stranger))
      .send({ reason: 'CUSTOMER_CHANGED_MIND' });

    // 404, not 403: a 403 would confirm the id exists.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('PENDING');
  });

  it('TC-038: a customer cannot read or reach another customer’s address', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const address = await makeAddress(owner);

    const patched = await request(app).patch(`/api/addresses/${address.id}`)
      .set(authHeader(stranger)).send({ label: 'Hijacked' });
    expect(patched.status).toBe(404);

    const removed = await request(app).delete(`/api/addresses/${address.id}`).set(authHeader(stranger));
    expect(removed.status).toBe(404);

    const listed = await request(app).get('/api/addresses').set(authHeader(stranger));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(0);

    expect((await knex('customer_addresses').where({ id: address.id }).first()).label).toBe('Home');
  });

  it('TC-040: a restaurant owner sees only their own profile', async () => {
    const a = await makeStockedRestaurant();
    const b = await makeStockedRestaurant();

    const res = await request(app).get('/api/restaurant/profile').set(authHeader(a.owner));
    expect(res.status).toBe(200);
    // The endpoint is scoped by the token, so there is no id to tamper with.
    expect(res.body.data.id).toBe(a.restaurant.id);
    expect(res.body.data.id).not.toBe(b.restaurant.id);

    await request(app).patch('/api/restaurant/profile').set(authHeader(a.owner))
      .send({ name: 'Renamed by A' }).expect(200);
    expect((await knex('restaurants').where({ id: b.restaurant.id }).first()).name)
      .toBe(b.restaurant.name);
  });

  it('TC-041: a restaurant owner cannot manage another restaurant’s items', async () => {
    const a = await makeStockedRestaurant();
    const b = await makeStockedRestaurant();

    const patched = await request(app).patch(`/api/restaurant/items/${b.main.id}`)
      .set(authHeader(a.owner)).send({ price: '0.01' });
    expect(patched.status).toBe(404);

    const removed = await request(app).delete(`/api/restaurant/items/${b.main.id}`).set(authHeader(a.owner));
    expect(removed.status).toBe(404);

    const cross = await request(app).post('/api/restaurant/items').set(authHeader(a.owner))
      .send({ categoryId: b.category.id, name: 'Planted', price: '5.00' });
    expect([404, 422]).toContain(cross.status);

    const item = await knex('food_items').where({ id: b.main.id }).first();
    expect(item.price).toBe('58.00');
    expect(item.deleted_at).toBeNull();
  });

  it('TC-047: a driver cannot act on another driver’s delivery', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const { restaurant } = await makeStockedRestaurant();
    const mine = await makeDriver();
    const theirs = await makeDriver();

    const order = await makeOrder({
      customer, restaurant, address, driver: mine.user, status: 'READY_FOR_PICKUP',
    });
    await makeAssignment(order, mine.user, { status: 'ACCEPTED' });

    const pick = await request(app)
      .post(`/api/driver/deliveries/${order.id}/pick-up`)
      .set(authHeader(theirs.user));
    expect(pick.status).toBe(404);

    const read = await request(app)
      .get(`/api/driver/deliveries/${order.id}`)
      .set(authHeader(theirs.user));
    expect(read.status).toBe(404);

    expect((await knex('orders').where({ id: order.id }).first()).status).toBe('READY_FOR_PICKUP');
  });

  it('TC-048: a driver cannot accept an offer made to another driver', async () => {
    const customer = await makeUser();
    const { restaurant } = await makeStockedRestaurant();
    const offered = await makeDriver();
    const eavesdropper = await makeDriver();

    const order = await makeOrder({ customer, restaurant, status: 'CONFIRMED' });
    const assignment = await makeAssignment(order, offered.user, { status: 'OFFERED' });

    const res = await request(app)
      .post(`/api/driver/offers/${assignment.id}/accept`)
      .set(authHeader(eavesdropper.user));
    expect(res.status).toBe(404);

    const row = await knex('delivery_assignments').where({ id: assignment.id }).first();
    expect(row.status).toBe('OFFERED');
    expect(row.driver_user_id).toBe(offered.user.id);
  });
});

/* ---------------------------------------------- profile and PII (TC-057..) */

describe('TC-057, TC-059, TC-060, TC-061: the profile endpoints', () => {
  it('TC-057: no profile response ever carries the password hash', async () => {
    const user = await makeUser();

    const me = await request(app).get('/api/me').set(authHeader(user));
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toMatch(/password|\$2[aby]\$/i);

    const login = await request(app).post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(JSON.stringify(login.body.data.user)).not.toMatch(/password|\$2[aby]\$/i);
  });

  it('TC-059: a profile update silently drops email, role and status', async () => {
    const user = await makeUser({ role: 'CUSTOMER', status: 'ACTIVE' });

    const res = await request(app).patch('/api/me').set(authHeader(user)).send({
      fullName: 'Renamed Person',
      email: 'promoted@example.com',
      role: 'ADMIN',
      status: 'SUSPENDED',
      passwordHash: 'nope',
    });
    expect(res.status).toBe(200);

    // Unknown keys are stripped by the schema, so the row keeps its own truth.
    const row = await knex('users').where({ id: user.id }).first();
    expect(row.full_name).toBe('Renamed Person');
    expect(row.email).toBe(user.email);
    expect(row.role).toBe('CUSTOMER');
    expect(row.status).toBe('ACTIVE');
    expect(row.password_hash).toBe(user.password_hash);
  });

  it('TC-060: an invalid profile update is refused field by field, with nothing applied', async () => {
    const user = await makeUser({ fullName: 'Original Name' });

    for (const body of [{ fullName: 'A' }, { fullName: '' }, { fullName: '   ' }, { phone: 'abc' }]) {
      const res = await request(app).patch('/api/me').set(authHeader(user)).send(body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0]).toHaveProperty('field');
    }
    expect((await knex('users').where({ id: user.id }).first()).full_name).toBe('Original Name');
  });

  it('TC-061: the profile endpoints refuse anonymous callers', async () => {
    for (const res of await Promise.all([
      request(app).get('/api/me'),
      request(app).patch('/api/me').send({ fullName: 'Nobody' }),
    ])) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_MISSING');
    }
  });
});

/* ------------------------------------------------------ addresses (TC-064) */

describe('TC-064, TC-066, TC-067, TC-069: addresses', () => {
  it('TC-064: concurrent set-default requests cannot leave two defaults', async () => {
    const customer = await makeUser();
    const a = await makeAddress(customer, { isDefault: true, label: 'Home' });
    const b = await makeAddress(customer, { isDefault: false, label: 'Work' });
    const c = await makeAddress(customer, { isDefault: false, label: 'Gym' });

    // The partial unique index arbitrates; the application never counts first.
    const results = await Promise.allSettled([
      request(app).post(`/api/addresses/${b.id}/default`).set(authHeader(customer)),
      request(app).post(`/api/addresses/${c.id}/default`).set(authHeader(customer)),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const defaults = await knex('customer_addresses')
      .where({ user_id: customer.id, is_default: true, });
    expect(defaults).toHaveLength(1);
    expect([b.id, c.id]).toContain(defaults[0].id);
    expect(defaults[0].id).not.toBe(a.id);
  });

  it('TC-066: the address list is scoped to the caller', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await makeAddress(mine, { label: 'Mine' });
    await makeAddress(theirs, { label: 'Theirs' });

    const res = await request(app).get('/api/addresses').set(authHeader(mine));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].label).toBe('Mine');
  });

  it('TC-067: update and delete are refused on someone else’s address', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const address = await makeAddress(owner, { label: 'Home' });

    await request(app).patch(`/api/addresses/${address.id}`)
      .set(authHeader(stranger)).send({ label: 'Theirs' }).expect(404);
    await request(app).delete(`/api/addresses/${address.id}`).set(authHeader(stranger)).expect(404);

    // The owner still can.
    await request(app).patch(`/api/addresses/${address.id}`)
      .set(authHeader(owner)).send({ label: 'Renamed' }).expect(200);
    expect((await knex('customer_addresses').where({ id: address.id }).first()).label).toBe('Renamed');
  });

  it('TC-069: deleting an address leaves an order that used it intact', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const { restaurant } = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant, address, status: 'DELIVERED' });

    await request(app).delete(`/api/addresses/${address.id}`).set(authHeader(customer)).expect(204);

    // The order carries a snapshot, not a foreign key to a live row.
    const res = await request(app).get(`/api/orders/${order.id}`).set(authHeader(customer));
    expect(res.status).toBe(200);
    expect(res.body.data.deliveryAddress.line1).toBe('4412 King Fahd Road');
    expect(res.body.data.deliveryAddress.city).toBe('Riyadh');
  });
});

/* ------------------------------------------------------------ money (105) */

describe('TC-105, TC-170: money crosses the wire as an exact decimal string', () => {
  it('TC-105: a price round-trips as a string, never as a float', async () => {
    const { owner, restaurant, category } = await makeStockedRestaurant();

    const created = await request(app).post('/api/restaurant/items').set(authHeader(owner))
      .send({ categoryId: category.id, name: 'Exactly Ten Ten', price: '10.10' });
    expect(created.status).toBe(201);
    expect(created.body.data.price).toBe('10.10');
    expect(typeof created.body.data.price).toBe('string');

    // 0.1 + 0.2 in binary floating point is 0.30000000000000004; NUMERIC is not.
    expect((await knex('food_items').where({ id: created.body.data.id }).first()).price).toBe('10.10');

    const menu = await request(app).get(`/api/restaurants/${restaurant.id}/menu`);
    const listed = menu.body.data.flatMap((c) => c.items).find((i) => i.id === created.body.data.id);
    expect(listed.price).toBe('10.10');
  });

  it('TC-170: the checkout request carries no prices at all', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const { restaurant, main: item } = await makeStockedRestaurant();
    await makeCart(customer, restaurant, [{ item, quantity: 2 }]);

    // A price sent by the client is an unknown key and is stripped, so the
    // total is whatever the menu says - not what the client hoped.
    const res = await request(app).post('/api/orders').set(authHeader(customer)).send({
      addressId: address.id,
      paymentMethod: 'CASH_ON_DELIVERY',
      subtotal: '0.01',
      total: '0.01',
      items: [{ foodItemId: item.id, unitPrice: '0.01', quantity: 2 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe('116.00');
    expect(res.body.data.totalAmount).toBe('144.24');
  });
});

/* ------------------------------------------------- security (TC-302, 329+) */

describe('TC-302, TC-329, TC-332, TC-336, TC-345: implemented security controls', () => {
  it('TC-302: controllers read req.validated, never req.body', async () => {
    // A structural assertion: a controller that reaches for req.body has
    // bypassed the schema, which is the mass-assignment defence.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(process.cwd(), 'src/modules');

    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.controller.js')) {
          const src = fs.readFileSync(full, 'utf8');
          for (const [i, line] of src.split('\n').entries()) {
            if (/\breq\.body\b/.test(line) && !line.trimStart().startsWith('*')) {
              offenders.push(`${path.relative(root, full)}:${i + 1}`);
            }
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it('TC-329: SQL metacharacters in search are inert data', async () => {
    const { restaurant } = await makeStockedRestaurant();

    for (const q of ["'; DROP TABLE restaurants; --", "' OR '1'='1", 'x%_\\']) {
      const res = await request(app).get('/api/search').query({ q });
      expect(res.status).toBe(200);
      // Nothing matched, and nothing was executed.
      expect(Array.isArray(res.body.data.restaurants ?? res.body.data)).toBe(true);
    }

    // The tables are still there and the row is untouched.
    expect(await knex('restaurants').where({ id: restaurant.id }).first()).toBeTruthy();
    expect(await knex('food_items').count('* as c')).toEqual([{ c: '2' }]);
  });

  it('TC-332: a stored XSS payload comes back as data, escaped by the client', async () => {
    const payload = '<script>alert("xss")</script>';
    const { owner, restaurant, category } = await makeStockedRestaurant();

    const created = await request(app).post('/api/restaurant/items').set(authHeader(owner))
      .send({ categoryId: category.id, name: `Burger ${payload}`, price: '30.00' });
    expect(created.status).toBe(201);

    const menu = await request(app).get(`/api/restaurants/${restaurant.id}/menu`);
    const item = menu.body.data.flatMap((c) => c.items).find((i) => i.name.includes('Burger'));

    // Stored verbatim and returned as a JSON string value - not HTML, and not
    // mangled by a sanitiser that would corrupt a legitimate name like "Fish & Chips".
    expect(item.name).toBe(`Burger ${payload}`);
    expect(menu.headers['content-type']).toMatch(/application\/json/);
  });

  it('TC-336: a driver offer discloses a district but never the customer', async () => {
    const customer = await makeUser({ fullName: 'Private Person' });
    const address = await makeAddress(customer);
    const { restaurant } = await makeStockedRestaurant();
    const { user: driver } = await makeDriver();
    const order = await makeOrder({ customer, restaurant, address, status: 'CONFIRMED' });
    await makeAssignment(order, driver, { status: 'OFFERED' });

    const res = await request(app).get('/api/driver/offers').set(authHeader(driver));
    expect(res.status).toBe(200);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(customer.email);
    expect(body).not.toContain('Private Person');
    expect(body).not.toContain('4412 King Fahd Road');
  });

  it('TC-345: an error response leaks neither the secret nor the connection string', async () => {
    const res = await request(app).get('/api/__test_boom');
    expect(res.status).toBe(500);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(config.jwt.secret);
    expect(body).not.toContain('postgres://');
    // The public message is generic; the detail is logged, not returned.
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error).not.toHaveProperty('stack');
  });
});

/* -------------------------------------------------------- edge cases (349+) */

describe('TC-349, TC-350, TC-355, TC-364: checkout under change', () => {
  it('TC-349: an item that goes unavailable between cart and checkout blocks the order', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const { restaurant, main: item } = await makeStockedRestaurant();
    await makeCart(customer, restaurant, [{ item, quantity: 1 }]);

    await knex('food_items').where({ id: item.id }).update({ is_available: false });

    const res = await request(app).post('/api/orders').set(authHeader(customer))
      .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    // BR-C9: checkout refuses the whole cart; the per-line code is in details.
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CART_HAS_ISSUES');
    expect(JSON.stringify(res.body.error.details)).toContain('ITEM_UNAVAILABLE');
    expect(await knex('orders').count('* as c')).toEqual([{ c: '0' }]);
  });

  it('TC-350: a price change between adding and checking out is surfaced, not absorbed', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const { restaurant, main: item } = await makeStockedRestaurant();
    await makeCart(customer, restaurant, [{ item, quantity: 1, priceSeenAtAdd: '58.00' }]);

    await knex('food_items').where({ id: item.id }).update({ price: '64.00' });

    const blocked = await request(app).post('/api/orders').set(authHeader(customer))
      .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('CART_HAS_ISSUES');
    expect(JSON.stringify(blocked.body.error.details)).toContain('PRICE_CHANGED');
    expect(await knex('orders').count('* as c')).toEqual([{ c: '0' }]);

    // The cart shows the new price, so acknowledging it is a re-read, not a guess.
    const cart = await request(app).get('/api/cart').set(authHeader(customer));
    expect(cart.body.data.items[0].unitPrice).toBe('64.00');
  });

  it('TC-355: a double-submitted checkout produces exactly one order', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const { restaurant, main: item } = await makeStockedRestaurant();
    await makeCart(customer, restaurant, [{ item, quantity: 1 }]);

    const body = { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' };
    const [a, b] = await Promise.all([
      request(app).post('/api/orders').set(authHeader(customer)).send(body),
      request(app).post('/api/orders').set(authHeader(customer)).send(body),
    ]);

    const codes = [a.status, b.status].sort();
    expect(codes[0]).toBe(201);
    expect(codes[1]).not.toBe(201);
    expect(await knex('orders').where({ customer_user_id: customer.id }).count('* as c'))
      .toEqual([{ c: '1' }]);
  });

  it('TC-364: a historical order survives deletion of everything it referenced', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const { restaurant, category } = await makeStockedRestaurant();
    const item = await makeItem(restaurant, category, { name: 'Discontinued Special', price: '42.00' });

    const order = await makeOrder({
      customer, restaurant, address, status: 'DELIVERED',
      items: [{ name: 'Discontinued Special', unitPrice: '42.00', quantity: 1 }],
      foodItemId: item.id,
    });

    // Hard-delete the menu row the snapshot was taken from.
    await knex('food_items').where({ id: item.id }).del();
    await knex('customer_addresses').where({ id: address.id }).del();

    const res = await request(app).get(`/api/orders/${order.id}`).set(authHeader(customer));
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].name).toBe('Discontinued Special');
    expect(res.body.data.items[0].unitPrice).toBe('42.00');
    expect(res.body.data.deliveryAddress.line1).toBe('4412 King Fahd Road');

    // ON DELETE SET NULL, so the snapshot survives without a dangling reference.
    expect((await knex('order_items').where({ order_id: order.id }).first()).food_item_id).toBeNull();
  });
});
