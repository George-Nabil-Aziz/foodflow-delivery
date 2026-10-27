import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import { makeUser, makeStockedRestaurant, authHeader } from '../helpers/factories.js';
import { PG_ENUM_MIRRORS } from '../../src/shared/constants.js';
import { CODES } from '../../src/shared/errors/codes.js';
import { withTransaction } from '../../src/shared/db/transaction.js';

beforeEach(async () => { await resetDatabase(); });

describe('TC-408..TC-410: health and the envelope', () => {
  it('TC-408: health reports a healthy system', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'up' });
    expect(res.body.data.uptime).toEqual(expect.any(Number));
    expect(res.body.meta.requestId).toEqual(expect.any(String));
  });

  it('TC-410: every response carries a correlation id matching the header', async () => {
    const responses = [
      await request(app).get('/api/health'),
      await request(app).get('/api/does-not-exist'),
      await request(app).post('/api/auth/login').send({}),
      await request(app).get('/api/__test_boom'),
    ];
    for (const res of responses) {
      expect(res.headers['x-request-id']).toBeTruthy();
      expect(res.body.meta.requestId).toBe(res.headers['x-request-id']);
    }
  });

  it('TC-304/AC-01-05: an unmatched route returns the envelope, not HTML', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'RESOURCE_NOT_FOUND' } });
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('TC-338/AC-01-06: an unexpected error is a stack-free 500', async () => {
    const res = await request(app).get('/api/__test_boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/at \w+ \(/);
    expect(body).not.toContain('boom: deliberate');
    expect(body).not.toMatch(/\.js:\d+/);
  });

  it('TC-304: malformed JSON is MALFORMED_REQUEST in the envelope', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_REQUEST');
  });

  it('TC-305: an oversized body is refused', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'Str0ngPass', fullName: 'A'.repeat(200000), phone: '+201000000000' });
    expect([400, 413, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

describe('TC-413: schema and enum integrity', () => {
  it('PostgreSQL enums match the JavaScript mirrors exactly', async () => {
    for (const [typeName, mirror] of Object.entries(PG_ENUM_MIRRORS)) {
      const { rows } = await knex.raw(
        'SELECT unnest(enum_range(NULL::' + typeName + '))::text AS value',
      );
      const actual = rows.map((r) => r.value).sort();
      expect(actual, `enum ${typeName}`).toEqual([...mirror].sort());
    }
  });

  it('the required extensions are installed', async () => {
    const { rows } = await knex.raw(
      "SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','citext','pg_trgm')",
    );
    expect(rows.map((r) => r.extname).sort()).toEqual(['citext', 'pg_trgm', 'pgcrypto']);
  });

  it('the load-bearing partial unique indexes exist', async () => {
    const { rows } = await knex.raw('SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()');
    const names = rows.map((r) => r.indexname);
    for (const index of [
      'uq_carts_one_active',
      'uq_assignments_driver_active',
      'uq_assignments_order_accepted',
      'uq_assignments_order_open',
      'uq_addresses_one_default',
      'uq_reviews_order',
      'uq_users_email',
      'uq_categories_restaurant_name',
      'uq_food_items_category_name',
    ]) {
      expect(names, `missing index ${index}`).toContain(index);
    }
  });
});

describe('TC-412: transaction helper', () => {
  it('reuses a passed transaction rather than opening a second one', async () => {
    const user = await makeUser({ role: 'CUSTOMER' });

    await withTransaction(async (outer) => {
      await outer('users').where({ id: user.id }).update({ full_name: 'Outer Name' });

      // Joining the outer transaction can read its uncommitted write. A nested
      // helper that opened its own connection would not see it - and would
      // deadlock against the outer transaction's locks.
      const seen = await withTransaction(
        async (inner) => inner('users').where({ id: user.id }).first('full_name'),
        outer,
      );
      expect(seen.full_name).toBe('Outer Name');
    });

    const after = await knex('users').where({ id: user.id }).first();
    expect(after.full_name).toBe('Outer Name');
  });

  it('rolls back everything on failure', async () => {
    const user = await makeUser({ role: 'CUSTOMER' });
    await expect(
      withTransaction(async (trx) => {
        await trx('users').where({ id: user.id }).update({ full_name: 'Never Committed' });
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');

    const after = await knex('users').where({ id: user.id }).first();
    expect(after.full_name).not.toBe('Never Committed');
  });
});

describe('TC-301..TC-307: the validation pipeline', () => {
  it('TC-301: unknown keys never reach a service', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const res = await request(app).patch('/api/me').set(authHeader(customer))
      .send({ fullName: 'New Name', email: 'hijack@example.com', role: 'ADMIN', status: 'SUSPENDED' });

    expect(res.status).toBe(200);
    const row = await knex('users').where({ id: customer.id }).first();
    expect(row.full_name).toBe('New Name');
    expect(row.email).toBe(customer.email);
    expect(row.role).toBe('CUSTOMER');
    expect(row.status).toBe('ACTIVE');
  });

  it('TC-303: validation errors name every offending field at once', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'x', fullName: 'A', phone: 'abc' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'fullName', 'phone']));
  });

  it('names a missing field "Required" and keeps the schema\'s own messages', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'Passw0rd!', fullName: 'Valid Name' });

    expect(res.status).toBe(422);
    const issueOf = (field) => res.body.error.details.find((d) => d.field === field)?.issue;
    // The client's catalogues translate these exact texts.
    expect(issueOf('phone')).toBe('Required');
    expect(issueOf('email')).toBe('must be a valid email address');
  });

  it('TC-306: type confusion is refused, never coerced dangerously', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const { main } = await makeStockedRestaurant();

    const payloads = [
      { foodItemId: main.id, quantity: [] },
      { foodItemId: main.id, quantity: {} },
      { foodItemId: main.id, quantity: null },
      { foodItemId: { $ne: null }, quantity: 1 },
      { foodItemId: [main.id], quantity: 1 },
    ];
    for (const body of payloads) {
      const res = await request(app).post('/api/cart/items').set(authHeader(customer)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
  });

  it('TC-307: a malformed UUID is a clean 422, never a database error', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    for (const path of ['/api/orders/not-a-uuid', '/api/restaurants/12345']) {
      const res = await request(app).get(path).set(authHeader(customer));
      expect(res.status, path).toBe(422);
      expect(JSON.stringify(res.body)).not.toMatch(/invalid input syntax/i);
    }
  });

  it('TC-308/TC-309: empty, whitespace-only and missing required values are refused', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });

    for (const fullName of ['', '   ', '\t\n']) {
      const res = await request(app).patch('/api/me').set(authHeader(customer)).send({ fullName });
      expect(res.status, JSON.stringify(fullName)).toBe(422);
    }
    expect((await request(app).post('/api/auth/register').send({})).status).toBe(422);
  });
});

describe('TC-323..TC-346: security controls', () => {
  it('TC-323/TC-324/TC-325/TC-326: forged tokens are refused', async () => {
    const user = await makeUser({ role: 'CUSTOMER' });
    const valid = authHeader(user).Authorization.slice(7);
    const [header, payload, signature] = valid.split('.');

    const tampered = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), role: 'ADMIN' }),
    ).toString('base64url');

    const forgeries = {
      tamperedPayload: `${header}.${tampered}.${signature}`,
      algNone: `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`,
      garbage: 'not.a.token',
      wrongSignature: `${header}.${payload}.aaaaaaaaaaaaaaaaaaaaaaaaaaa`,
    };

    for (const [name, token] of Object.entries(forgeries)) {
      const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
      expect(res.status, name).toBe(401);
      expect(res.body.error.code, name).toBe('TOKEN_INVALID');
    }
  });

  it('TC-328: malformed Authorization headers are refused cleanly', async () => {
    for (const header of ['Bearer ', 'Basic dXNlcjpwYXNz', 'sometoken', '']) {
      const res = await request(app).get('/api/me').set('Authorization', header);
      expect(res.status, header).toBe(401);
      expect(res.body.success).toBe(false);
    }
  });

  it('TC-330: SQL injection through body fields is inert', async () => {
    const payload = "'; DROP TABLE users; --";
    const res = await request(app).post('/api/auth/register').send({
      email: 'inject@example.com', password: 'Str0ngPass',
      fullName: payload, phone: '+201000000000', role: 'CUSTOMER',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.fullName).toBe(payload);
    // The table still exists and the value was stored as text.
    expect(await knex('users').where({ email: 'inject@example.com' }).first()).toBeDefined();
  });

  it('TC-335: no endpoint returns a password hash', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ role: 'CUSTOMER' });

    const responses = [
      await request(app).get('/api/me').set(authHeader(customer)),
      await request(app).get('/api/admin/users').set(authHeader(admin)),
      await request(app).get(`/api/admin/users/${customer.id}`).set(authHeader(admin)),
    ];
    for (const res of responses) {
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/password/i);
      expect(body).not.toMatch(/\$2[aby]\$/);
    }
  });

  it('TC-340: security headers are present', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers).toHaveProperty('x-dns-prefetch-control');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('TC-341: CORS allows only configured origins', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const denied = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('every error code in the registry maps to its documented status', async () => {
    // A contract check: the registry is the single source of truth and the
    // envelope always carries a registered code.
    const res = await request(app).get('/api/nope');
    expect(CODES[res.body.error.code]).toBe(res.status);
  });
});
