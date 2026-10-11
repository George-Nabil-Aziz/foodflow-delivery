import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import { makeUser, authHeader, TEST_PASSWORD } from '../helpers/factories.js';
import { hashRefreshToken } from '../../src/shared/jwt.js';

beforeEach(async () => { await resetDatabase(); });

const registration = (overrides = {}) => ({
  email: 'sara@example.com',
  password: 'Str0ngPass',
  fullName: 'Sara Idris',
  phone: '+201001234567',
  role: 'CUSTOMER',
  ...overrides,
});

describe('TC-001..TC-011: registration', () => {
  it('TC-001: registers a customer and returns a session', async () => {
    const res = await request(app).post('/api/auth/register').send(registration());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({
      email: 'sara@example.com', role: 'CUSTOMER', status: 'ACTIVE',
    });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.expiresIn).toBe(900);
    expect(res.body.meta.requestId).toEqual(expect.any(String));

    const stored = await knex('refresh_tokens').count().first();
    expect(Number(stored.count)).toBe(1);
  });

  it('TC-002: the response never contains a password field', async () => {
    const res = await request(app).post('/api/auth/register').send(registration());
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/"password"/);
    expect(body).not.toMatch(/passwordHash/);
    expect(body).not.toMatch(/password_hash/);
    expect(body).not.toMatch(/\$2[aby]\$/);
  });

  it('TC-003: stores a bcrypt hash, never the plaintext', async () => {
    await request(app).post('/api/auth/register').send(registration());
    const user = await knex('users').where({ email: 'sara@example.com' }).first();
    // A real bcrypt hash. The production cost of 12 is asserted separately in
    // tests/unit/platform.test.js; the suite runs at a lower cost for speed.
    expect(user.password_hash).toMatch(/^\$2[aby]\$\d\d\$/);
    expect(user.password_hash).not.toBe('Str0ngPass');
  });

  it('TC-004/TC-005: rejects a duplicate email, case-insensitively', async () => {
    await request(app).post('/api/auth/register').send(registration());

    const same = await request(app).post('/api/auth/register').send(registration());
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');

    const upper = await request(app)
      .post('/api/auth/register')
      .send(registration({ email: 'SARA@EXAMPLE.COM' }));
    expect(upper.status).toBe(409);

    const count = await knex('users').count().first();
    expect(Number(count.count)).toBe(1);
  });

  it('TC-006/TC-007: refuses ADMIN and DRIVER roles and creates nothing', async () => {
    for (const role of ['ADMIN', 'DRIVER']) {
      const res = await request(app).post('/api/auth/register').send(registration({ role }));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }
    // The post-condition is the substance: no silently-downgraded account.
    const count = await knex('users').count().first();
    expect(Number(count.count)).toBe(0);
  });

  it('TC-008: rejects an unknown role value at the schema', async () => {
    const res = await request(app).post('/api/auth/register').send(registration({ role: 'SUPERUSER' }));
    expect(res.status).toBe(422);
    expect(res.body.error.details.some((d) => d.field === 'role')).toBe(true);
  });

  it('accepts Egyptian mobiles only, in local or +20 form', async () => {
    for (const [phone, ok] of [
      ['01012345678', true], ['+201512345678', true],
      ['+966501234567', false], ['01312345678', false], ['0101234567', false],
    ]) {
      const res = await request(app).post('/api/auth/register')
        .send(registration({ email: `p${phone.replace(/\D/g, '')}@example.com`, phone }));
      expect(res.status, phone).toBe(ok ? 201 : 422);
      if (!ok) expect(res.body.error.details.some((d) => d.field === 'phone'), phone).toBe(true);
    }
  });

  it('TC-009: strips mass-assignment keys', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...registration(), status: 'SUSPENDED', id: '11111111-1111-1111-1111-111111111111', isAdmin: true });

    expect(res.status).toBe(201);
    expect(res.body.data.user.status).toBe('ACTIVE');
    expect(res.body.data.user.id).not.toBe('11111111-1111-1111-1111-111111111111');
  });

  it('TC-010: a restaurant registration creates a PENDING_APPROVAL shell', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(registration({ email: 'owner@example.com', role: 'RESTAURANT', restaurantName: 'Olive Grill' }));

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('RESTAURANT');
    expect(res.body.data.restaurant).toMatchObject({ name: 'Olive Grill', status: 'PENDING_APPROVAL' });
    expect(res.body.data.restaurant.slug).toBe('olive-grill');
  });

  it('refuses a restaurant registration with no restaurant name', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(registration({ email: 'owner2@example.com', role: 'RESTAURANT' }));
    expect(res.status).toBe(422);
  });

  it('TC-311: enforces the password rules including the 72-byte ceiling', async () => {
    const cases = [
      ['Ab1', 422], ['Passw0rd', 201], ['nodigitshere', 422], ['12345678', 422],
      [`${'a'.repeat(71)}1`, 201], [`${'a'.repeat(72)}1`, 422],
    ];
    let n = 0;
    for (const [password, expected] of cases) {
      n += 1;
      const res = await request(app)
        .post('/api/auth/register')
        .send(registration({ email: `pw${n}@example.com`, password }));
      expect(res.status, `password "${password.slice(0, 12)}..." (${password.length})`).toBe(expected);
    }
  });
});

describe('TC-012..TC-018: login', () => {
  it('TC-012: issues a token pair with the documented claims', async () => {
    await request(app).post('/api/auth/register').send(registration());
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sara@example.com', password: 'Str0ngPass' });

    expect(res.status).toBe(200);
    const [, payloadB64] = res.body.data.accessToken.split('.');
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    expect(claims).toMatchObject({ role: 'CUSTOMER', email: 'sara@example.com', iss: 'foodflow', aud: 'foodflow-app' });
    expect(claims.exp - claims.iat).toBe(900);
    expect(claims.jti).toEqual(expect.any(String));
  });

  it('TC-013/TC-014: wrong password and unknown email are indistinguishable', async () => {
    await request(app).post('/api/auth/register').send(registration());

    const wrongPassword = await request(app)
      .post('/api/auth/login').send({ email: 'sara@example.com', password: 'WrongPass1' });
    const unknownEmail = await request(app)
      .post('/api/auth/login').send({ email: 'nobody@example.com', password: 'WrongPass1' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
  });

  it('TC-016: a suspended user cannot log in', async () => {
    await makeUser({ email: 'susp@example.com', status: 'SUSPENDED' });
    const res = await request(app)
      .post('/api/auth/login').send({ email: 'susp@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('TC-017: a soft-deleted user is indistinguishable from a missing one', async () => {
    await makeUser({ email: 'gone@example.com', deletedAt: new Date() });
    const res = await request(app)
      .post('/api/auth/login').send({ email: 'gone@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('TC-019..TC-028: tokens and sessions', () => {
  const registerAndLogin = async () => {
    await request(app).post('/api/auth/register').send(registration());
    const res = await request(app)
      .post('/api/auth/login').send({ email: 'sara@example.com', password: 'Str0ngPass' });
    return res.body.data;
  };

  it('TC-019: a valid token authenticates', async () => {
    const session = await registerAndLogin();
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('sara@example.com');
  });

  it('TC-021: a missing token is TOKEN_MISSING', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_MISSING');
  });

  it('TC-022: refresh rotates and invalidates the old token', async () => {
    const session = await registerAndLogin();

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.data.refreshToken).not.toBe(session.refreshToken);

    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');
  });

  it('TC-023: reuse revokes the whole family', async () => {
    const session = await registerAndLogin();
    const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });

    // Replaying the original revokes every token in the family...
    await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });

    // ...so the legitimately rotated token dies too.
    const after = await request(app)
      .post('/api/auth/refresh').send({ refreshToken: rotated.body.data.refreshToken });
    expect(after.status).toBe(401);

    // Only the affected family dies. The separate session issued at
    // registration is a different family and must survive.
    const compromised = await knex('refresh_tokens')
      .where({ token_hash: hashRefreshToken(session.refreshToken) })
      .first('family_id');
    const liveInFamily = await knex('refresh_tokens')
      .where({ family_id: compromised.family_id })
      .whereNull('revoked_at')
      .count()
      .first();
    expect(Number(liveInFamily.count)).toBe(0);

    const liveElsewhere = await knex('refresh_tokens')
      .whereNot({ family_id: compromised.family_id })
      .whereNull('revoked_at')
      .count()
      .first();
    expect(Number(liveElsewhere.count)).toBe(1);
  });

  it('TC-024: refresh tokens are stored hashed', async () => {
    const session = await registerAndLogin();
    const rows = await knex('refresh_tokens').select('token_hash');
    expect(rows.every((r) => r.token_hash !== session.refreshToken)).toBe(true);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('TC-025: logout revokes only the presented token', async () => {
    await request(app).post('/api/auth/register').send(registration());
    const a = (await request(app).post('/api/auth/login').send({ email: 'sara@example.com', password: 'Str0ngPass' })).body.data;
    const b = (await request(app).post('/api/auth/login').send({ email: 'sara@example.com', password: 'Str0ngPass' })).body.data;

    await request(app).post('/api/auth/logout')
      .set('Authorization', `Bearer ${a.accessToken}`).send({ refreshToken: a.refreshToken });

    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken })).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: b.refreshToken })).status).toBe(200);
  });

  it('TC-026/TC-027: changing the password revokes every session', async () => {
    const session = await registerAndLogin();

    const wrong = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: 'NotMyPassword1', newPassword: 'BrandNew1' });
    expect(wrong.status).toBe(401);

    const ok = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: 'Str0ngPass', newPassword: 'BrandNew1' });
    expect(ok.status).toBe(204);

    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'sara@example.com', password: 'BrandNew1' })).status).toBe(200);
  });

  it('TC-028: a token minted before suspension stops working immediately', async () => {
    const session = await registerAndLogin();
    const user = await knex('users').where({ email: 'sara@example.com' }).first();

    // The token is still cryptographically valid and unexpired.
    await knex('users').where({ id: user.id }).update({ status: 'SUSPENDED' });

    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('a token for a soft-deleted user is rejected', async () => {
    const user = await makeUser();
    await knex('users').where({ id: user.id }).update({ deleted_at: new Date() });
    const res = await request(app).get('/api/me').set(authHeader(user));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });
});
