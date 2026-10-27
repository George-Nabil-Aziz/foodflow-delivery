import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { resetDatabase, knex } from '../helpers/db.js';
import {
  makeUser, makeStockedRestaurant, makeDriver, makeOrder, makeAddress, authHeader,
} from '../helpers/factories.js';
import { listRoutes } from '../../scripts/list-routes.js';

beforeEach(async () => { await resetDatabase(); });

/** Routes deliberately reachable without a token (discovery is public). */
const PUBLIC_ALLOWLIST = new Set([
  'GET /api/health',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'GET /api/restaurants',
  'GET /api/restaurants/:id',
  'GET /api/restaurants/:id/menu',
  'GET /api/restaurants/:id/reviews',
  'GET /api/search',
  'GET /api/cuisines',
  'GET /api/__test_boom',
  // Authenticated by a single-use stream ticket instead of a header (spec-14);
  // events.test.js proves it refuses a missing, used or forged ticket.
  'GET /api/events',
  // Called by Moyasar, authenticated by its shared secret token instead.
  'POST /api/payments/webhooks/moyasar',
]);

/** Authenticated but role-agnostic: any signed-in user may call these. */
const ANY_ROLE = new Set([
  'POST /api/auth/logout',
  'POST /api/auth/change-password',
  'GET /api/me',
  'PATCH /api/me',
]);

describe('TC-031: default-deny router audit', () => {
  const routes = listRoutes();

  it('mounts every documented endpoint', () => {
    expect(routes.length).toBeGreaterThanOrEqual(90);
  });

  it('every route is either public by allow-list or declares authenticate', () => {
    const unguarded = routes
      .filter((r) => !PUBLIC_ALLOWLIST.has(r.key))
      .filter((r) => !r.middleware.includes('authenticate'))
      .map((r) => r.key);
    expect(unguarded).toEqual([]);
  });

  it('every authenticated route declares a role guard, except the enumerated any-role routes', () => {
    const roleless = routes
      .filter((r) => r.middleware.includes('authenticate'))
      .filter((r) => !r.middleware.includes('authorize'))
      .map((r) => r.key)
      .filter((key) => !ANY_ROLE.has(key));
    expect(roleless).toEqual([]);
  });
});

describe('TC-029: every protected endpoint rejects anonymous callers', () => {
  const protectedRoutes = listRoutes().filter((r) => !PUBLIC_ALLOWLIST.has(r.key));

  it('returns 401 TOKEN_MISSING with no Authorization header', async () => {
    const failures = [];
    for (const route of protectedRoutes) {
      const path = route.path
        .replace(/:orderId/g, '11111111-1111-1111-1111-111111111111')
        .replace(/:itemId/g, '11111111-1111-1111-1111-111111111111')
        .replace(/:id/g, '11111111-1111-1111-1111-111111111111');
      const res = await request(app)[route.method.toLowerCase()](path).send({});
      if (res.status !== 401 || res.body?.error?.code !== 'TOKEN_MISSING') {
        failures.push(`${route.key} -> ${res.status} ${res.body?.error?.code}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('TC-030: role isolation across every endpoint group', () => {
  const groups = [
    { prefix: '/api/admin', allowed: 'ADMIN' },
    { prefix: '/api/restaurant/', allowed: 'RESTAURANT' },
    { prefix: '/api/driver', allowed: 'DRIVER' },
    { prefix: '/api/cart', allowed: 'CUSTOMER' },
    { prefix: '/api/orders', allowed: 'CUSTOMER' },
    { prefix: '/api/addresses', allowed: 'CUSTOMER' },
  ];

  it('rejects every role that does not own the group with 403 FORBIDDEN_ROLE', async () => {
    const users = {
      CUSTOMER: await makeUser({ role: 'CUSTOMER' }),
      RESTAURANT: await makeUser({ role: 'RESTAURANT' }),
      DRIVER: await makeUser({ role: 'DRIVER' }),
      ADMIN: await makeUser({ role: 'ADMIN' }),
    };
    const routes = listRoutes();
    const failures = [];

    for (const group of groups) {
      const groupRoutes = routes.filter((r) => r.path.startsWith(group.prefix));
      expect(groupRoutes.length, `no routes found for ${group.prefix}`).toBeGreaterThan(0);

      for (const route of groupRoutes) {
        for (const [role, user] of Object.entries(users)) {
          if (role === group.allowed) continue;
          const path = route.path
            .replace(/:orderId/g, '11111111-1111-1111-1111-111111111111')
            .replace(/:itemId/g, '11111111-1111-1111-1111-111111111111')
            .replace(/:id/g, '11111111-1111-1111-1111-111111111111');
          const res = await request(app)[route.method.toLowerCase()](path)
            .set(authHeader(user)).send({});
          if (res.status !== 403 || res.body?.error?.code !== 'FORBIDDEN_ROLE') {
            failures.push(`${role} -> ${route.key} = ${res.status} ${res.body?.error?.code}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('TC-032..TC-052: named cross-role probes', () => {
  it('TC-032/TC-044/TC-050: no non-admin reaches the admin surface', async () => {
    for (const role of ['CUSTOMER', 'RESTAURANT', 'DRIVER']) {
      const user = await makeUser({ role });
      for (const path of ['/api/admin/users', '/api/admin/stats', '/api/admin/drivers']) {
        const res = await request(app).get(path).set(authHeader(user));
        expect(res.status, `${role} ${path}`).toBe(403);
      }
    }
  });

  it('TC-044: a restaurant cannot approve itself', async () => {
    const { owner, restaurant } = await makeStockedRestaurant({ status: 'PENDING_APPROVAL' });
    const res = await request(app)
      .post(`/api/admin/restaurants/${restaurant.id}/approve`).set(authHeader(owner)).send({});

    expect(res.status).toBe(403);
    expect((await knex('restaurants').where({ id: restaurant.id }).first()).status)
      .toBe('PENDING_APPROVAL');
  });

  it('TC-050: a driver cannot provision another driver', async () => {
    const { user: driver } = await makeDriver();
    const res = await request(app).post('/api/admin/drivers').set(authHeader(driver))
      .send({ email: 'new@example.com', fullName: 'New Driver', phone: '+201000000123', vehiclePlate: 'AA 1' });
    expect(res.status).toBe(403);
  });

  it('TC-045: an owner cannot write their own status or rating', async () => {
    const { owner, restaurant } = await makeStockedRestaurant();
    const res = await request(app).patch('/api/restaurant/profile').set(authHeader(owner))
      .send({ name: 'Renamed', status: 'ACTIVE', ratingAverage: '5.00', ratingCount: 999 });

    expect(res.status).toBe(200);
    const row = await knex('restaurants').where({ id: restaurant.id }).first();
    expect(row.name).toBe('Renamed');
    expect(row.rating_average).toBe('0.00');
    expect(row.rating_count).toBe(0);
  });

  it('TC-046: a pending restaurant may edit its profile but not operate', async () => {
    const { owner } = await makeStockedRestaurant({ status: 'PENDING_APPROVAL' });

    expect((await request(app).get('/api/restaurant/profile').set(authHeader(owner))).status).toBe(200);
    expect((await request(app).patch('/api/restaurant/profile').set(authHeader(owner))
      .send({ name: 'Still Setting Up' })).status).toBe(200);
    expect((await request(app).get('/api/restaurant/hours').set(authHeader(owner))).status).toBe(200);

    const blocked = await request(app).get('/api/restaurant/orders').set(authHeader(owner));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('RESTAURANT_NOT_APPROVED');
  });

  it('TC-036..TC-039: cross-tenant resources are 404, never 403', async () => {
    const a = await makeUser({ role: 'CUSTOMER' });
    const b = await makeUser({ role: 'CUSTOMER' });
    const addressB = await makeAddress(b);
    const r = await makeStockedRestaurant();
    const orderB = await makeOrder({ customer: b, restaurant: r.restaurant, address: addressB });

    const probes = [
      ['get', `/api/orders/${orderB.id}`],
      ['post', `/api/orders/${orderB.id}/cancel`],
      ['get', `/api/orders/${orderB.id}/status`],
      ['patch', `/api/addresses/${addressB.id}`, { city: 'Jeddah' }],
      ['delete', `/api/addresses/${addressB.id}`],
    ];

    for (const [method, path, body] of probes) {
      const res = await request(app)[method](path).set(authHeader(a)).send(body ?? {});
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    }
  });

  it('TC-339: a cross-tenant miss is indistinguishable from a nonexistent id', async () => {
    const a = await makeUser({ role: 'CUSTOMER' });
    const b = await makeUser({ role: 'CUSTOMER' });
    const addressB = await makeAddress(b);

    const foreign = await request(app).patch(`/api/addresses/${addressB.id}`)
      .set(authHeader(a)).send({ city: 'Jeddah' });
    const missing = await request(app).patch('/api/addresses/11111111-1111-1111-1111-111111111111')
      .set(authHeader(a)).send({ city: 'Jeddah' });

    expect(foreign.status).toBe(missing.status);
    expect(foreign.body.error).toEqual(missing.body.error);
  });

  it('TC-052: a driver cannot set availability to ON_DELIVERY', async () => {
    const { user } = await makeDriver();
    const res = await request(app).patch('/api/driver/availability')
      .set(authHeader(user)).send({ availability: 'ON_DELIVERY' });

    expect(res.status).toBe(422);
    const profile = await knex('driver_profiles').where({ user_id: user.id }).first();
    expect(profile.availability).toBe('AVAILABLE');
  });

  it('TC-051: an unapproved driver is inert', async () => {
    const { user } = await makeDriver({ status: 'PENDING_APPROVAL', availability: 'OFFLINE' });

    expect((await request(app).get('/api/driver/profile').set(authHeader(user))).status).toBe(200);

    const offers = await request(app).get('/api/driver/offers').set(authHeader(user));
    expect(offers.status).toBe(403);
    expect(offers.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('TC-054: an admin cannot suspend their own account', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const res = await request(app).post(`/api/admin/users/${admin.id}/suspend`)
      .set(authHeader(admin)).send({ reason: 'testing self suspension' });

    expect(res.status).toBe(422);
    expect((await knex('users').where({ id: admin.id }).first()).status).toBe('ACTIVE');
  });
});
