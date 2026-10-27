import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeOrder, makeDriver, authHeader,
} from '../helpers/factories.js';
import { transition } from '../../src/modules/orders/index.js';
import { dispatchJob } from '../../src/jobs/dispatch.job.js';
import { offerExpiryJob } from '../../src/jobs/offerExpiry.job.js';
import { publishAfterCommit, subscribe } from '../../src/shared/events/index.js';
import { stop as stopStreams, heartbeat, connectionCount, MAX_CONNECTIONS_PER_USER } from '../../src/modules/events/events.hub.js';

let server;
let port;
const open = [];

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
afterAll(async () => {
  stopStreams();
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(async () => { await resetDatabase(); });
afterEach(() => {
  for (const s of open.splice(0)) s.req.destroy();
});

/** Opens a real stream the way the browser does: ticket first, then GET. */
async function openStream(user) {
  const ticketRes = await request(app).post('/api/events/ticket').set(authHeader(user));
  expect(ticketRes.status).toBe(200);
  return openWithTicket(ticketRes.body.data.ticket);
}

function openWithTicket(ticket) {
  return new Promise((resolve, reject) => {
    const stream = { chunks: '', status: null, headers: null, ended: false, req: null };
    stream.req = http.get({ host: '127.0.0.1', port, path: `/api/events?ticket=${ticket}` }, (res) => {
      stream.status = res.statusCode;
      stream.headers = res.headers;
      res.setEncoding('utf8');
      res.on('data', (d) => { stream.chunks += d; });
      res.on('end', () => { stream.ended = true; });
      res.on('close', () => { stream.ended = true; });
      open.push(stream);
      resolve(stream);
    });
    stream.req.on('error', reject);
  });
}

const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const eventsOf = (stream, type) =>
  [...stream.chunks.matchAll(/event: (.+)\ndata: (.+)\n\n/g)]
    .filter((m) => m[1] === type).map((m) => JSON.parse(m[2]));

async function pendingOrder() {
  const customer = await makeUser({ role: 'CUSTOMER' });
  const address = await makeAddress(customer);
  const r = await makeStockedRestaurant();
  const order = await makeOrder({ customer, restaurant: r.restaurant, address, status: 'PENDING' });
  return { customer, order, ...r };
}

describe('stream authentication', () => {
  it('refuses a ticket request without a token', async () => {
    const res = await request(app).post('/api/events/ticket');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_MISSING');
  });

  it('refuses a ticket request from an admin (no stream for that role)', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const res = await request(app).post('/api/events/ticket').set(authHeader(admin));
    expect(res.status).toBe(403);
  });

  it('refuses the stream with no ticket, a forged ticket, and a reused ticket', async () => {
    expect((await openWithTicket('')).status).toBe(401);
    expect((await openWithTicket('x'.repeat(43))).status).toBe(401);

    const customer = await makeUser();
    const t = await request(app).post('/api/events/ticket').set(authHeader(customer));
    const first = await openWithTicket(t.body.data.ticket);
    expect(first.status).toBe(200);
    expect((await openWithTicket(t.body.data.ticket)).status).toBe(401);
  });

  it('does not accept the access token itself as a ticket', async () => {
    const customer = await makeUser();
    const token = authHeader(customer).Authorization.slice(7);
    expect((await openWithTicket(token)).status).toBe(401);
  });

  it('refuses a ticket whose owner was suspended after it was minted', async () => {
    const customer = await makeUser();
    const t = await request(app).post('/api/events/ticket').set(authHeader(customer));
    await knex('users').where({ id: customer.id }).update({ status: 'SUSPENDED' });
    expect((await openWithTicket(t.body.data.ticket)).status).toBe(403);
  });

  it('sends SSE headers, a retry hint and a ready event', async () => {
    const customer = await makeUser();
    const stream = await openStream(customer);
    await tick();
    expect(stream.status).toBe(200);
    expect(stream.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(stream.headers['cache-control']).toContain('no-cache');
    expect(stream.headers['content-encoding']).toBeUndefined();
    expect(stream.chunks).toContain('retry: 3000');
    expect(eventsOf(stream, 'ready')).toHaveLength(1);
  });
});

describe('event delivery and scoping', () => {
  it('delivers an order status change to its customer and restaurant only', async () => {
    const { customer, order, owner } = await pendingOrder();
    const otherCustomer = await makeUser({ role: 'CUSTOMER' });
    const other = await makeStockedRestaurant();
    const { user: driverUser } = await makeDriver();

    const mine = await openStream(customer);
    const theirs = await openStream(otherCustomer);
    const kitchen = await openStream(owner);
    const rival = await openStream(other.owner);
    const driver = await openStream(driverUser);

    const res = await request(app).post(`/api/restaurant/orders/${order.id}/accept`).set(authHeader(owner)).send({});
    expect(res.status).toBe(200);
    await tick();

    expect(eventsOf(mine, 'order.status')).toEqual([
      expect.objectContaining({ orderId: order.id, status: 'CONFIRMED' }),
    ]);
    expect(eventsOf(kitchen, 'order.status')).toHaveLength(1);
    expect(eventsOf(theirs, 'order.status')).toHaveLength(0);
    expect(eventsOf(rival, 'order.status')).toHaveLength(0);
    expect(eventsOf(driver, 'order.status')).toHaveLength(0);
  });

  it('carries ids and status only, never customer or address data', async () => {
    const { customer, order, owner } = await pendingOrder();
    const mine = await openStream(customer);
    await transition(order.id, 'CONFIRMED', { id: owner.id, role: 'RESTAURANT' }, { scope: { restaurantId: order.restaurant_id } });
    await tick();
    const [event] = eventsOf(mine, 'order.status');
    expect(Object.keys(event).sort()).toEqual(['at', 'orderId', 'status', 'type']);
  });

  it('tells a restaurant about a newly created order', async () => {
    const owner = await makeUser({ role: 'RESTAURANT' });
    const { restaurant } = await makeStockedRestaurant({ owner });
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const kitchen = await openStream(owner);

    // insertOrder is private to the orders module; the admin path exercises it.
    const admin = await makeUser({ role: 'ADMIN' });
    const item = await knex('food_items').where({ restaurant_id: restaurant.id }).first();
    const res = await request(app).post('/api/admin/orders').set(authHeader(admin)).send({
      customerUserId: customer.id, restaurantId: restaurant.id, addressId: address.id,
      items: [{ foodItemId: item.id, quantity: 2 }],
    });
    expect(res.status).toBe(201);
    await tick();
    expect(eventsOf(kitchen, 'order.created')).toEqual([
      expect.objectContaining({ orderId: res.body.data.id, status: 'PENDING' }),
    ]);
  });

  it('sends an offer only to the driver it was made to', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant();
    await makeOrder({ customer, restaurant: r.restaurant, address, status: 'CONFIRMED', dispatchState: 'UNASSIGNED' });
    const near = await makeDriver();
    const far = await makeDriver({ latitude: 24.9, longitude: 46.9 });

    const nearStream = await openStream(near.user);
    const farStream = await openStream(far.user);
    await dispatchJob();
    await tick();

    expect(eventsOf(nearStream, 'offer.created')).toHaveLength(1);
    expect(eventsOf(farStream, 'offer.created')).toHaveLength(0);
  });

  it('tells customer and driver when the driver accepts', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant: r.restaurant, address, status: 'CONFIRMED', dispatchState: 'UNASSIGNED' });
    const { user: driverUser } = await makeDriver();
    await dispatchJob();
    const offer = await knex('delivery_assignments').where({ order_id: order.id }).first();

    const cust = await openStream(customer);
    const drv = await openStream(driverUser);
    const res = await request(app).post(`/api/driver/offers/${offer.id}/accept`).set(authHeader(driverUser)).send({});
    expect(res.status).toBe(200);
    await tick();

    expect(eventsOf(drv, 'offer.taken')).toHaveLength(1);
    expect(eventsOf(cust, 'order.updated')).toEqual([
      expect.objectContaining({ orderId: order.id }),
    ]);
  });

  it('tells only the offered driver when their offer expires', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant: r.restaurant, address, status: 'CONFIRMED', dispatchState: 'UNASSIGNED' });
    const near = await makeDriver();
    const far = await makeDriver({ latitude: 24.9, longitude: 46.9 });
    await dispatchJob();
    await knex('delivery_assignments').where({ order_id: order.id }).update({ expires_at: new Date(Date.now() - 1000) });

    const nearStream = await openStream(near.user);
    const farStream = await openStream(far.user);
    const cust = await openStream(customer);
    const kitchen = await openStream(r.owner);
    await offerExpiryJob();
    await tick();

    expect(eventsOf(nearStream, 'offer.expired')).toEqual([
      expect.objectContaining({ orderId: order.id }),
    ]);
    expect(eventsOf(farStream, 'offer.expired')).toHaveLength(0);
    expect(eventsOf(cust, 'offer.expired')).toHaveLength(0);
    expect(eventsOf(kitchen, 'offer.expired')).toHaveLength(0);
  });

  it('withdraws an open offer from its driver when the order is cancelled', async () => {
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const r = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant: r.restaurant, address, status: 'CONFIRMED', dispatchState: 'UNASSIGNED' });
    const near = await makeDriver();
    const far = await makeDriver({ latitude: 24.9, longitude: 46.9 });
    await dispatchJob();

    const nearStream = await openStream(near.user);
    const farStream = await openStream(far.user);
    const res = await request(app).post(`/api/orders/${order.id}/cancel`).set(authHeader(customer)).send({});
    expect(res.status).toBe(200);
    await tick();

    expect(eventsOf(nearStream, 'offer.withdrawn')).toEqual([
      expect.objectContaining({ orderId: order.id }),
    ]);
    expect(eventsOf(farStream, 'offer.withdrawn')).toHaveLength(0);
  });

  it('connects a restaurant owner whose restaurant is soft-deleted but sends them no restaurant events', async () => {
    const owner = await makeUser({ role: 'RESTAURANT' });
    const { restaurant } = await makeStockedRestaurant({ owner });
    const customer = await makeUser();
    const address = await makeAddress(customer);
    const order = await makeOrder({ customer, restaurant, address, status: 'PENDING' });
    await knex('restaurants').where({ id: restaurant.id }).update({ deleted_at: knex.fn.now() });

    const kitchen = await openStream(owner);
    expect(kitchen.status).toBe(200);
    const mine = await openStream(customer);
    await transition(order.id, 'CONFIRMED', { id: owner.id, role: 'RESTAURANT' }, { scope: { restaurantId: restaurant.id } });
    await tick();

    expect(eventsOf(mine, 'order.status')).toHaveLength(1);
    expect(eventsOf(kitchen, 'order.status')).toHaveLength(0);
  });
});

describe('after-commit publishing', () => {
  it('does not publish when the transition is refused and rolled back', async () => {
    const { customer, order } = await pendingOrder();
    const mine = await openStream(customer);
    // PENDING -> DELIVERED is illegal: the transaction throws and rolls back.
    await expect(transition(order.id, 'DELIVERED', { id: customer.id, role: 'CUSTOMER' })).rejects.toThrow();
    await tick();
    expect(eventsOf(mine, 'order.status')).toHaveLength(0);
  });

  it('holds an event until commit, and drops it on rollback', async () => {
    const seen = [];
    const off = subscribe((e) => seen.push(e.type));

    await knex.transaction(async (trx) => {
      publishAfterCommit(trx, { type: 'a', audience: {}, data: {} });
      expect(seen).toEqual([]);
    });
    await tick(20);
    expect(seen).toEqual(['a']);

    await knex.transaction(async (trx) => {
      publishAfterCommit(trx, { type: 'b', audience: {}, data: {} });
      throw new Error('boom');
    }).catch(() => {});
    await tick(20);
    expect(seen).toEqual(['a']);
    off();
  });
});

describe('connection lifecycle', () => {
  it('closes the stream of a user who is suspended (heartbeat re-check)', async () => {
    const customer = await makeUser();
    const stream = await openStream(customer);
    await tick();
    expect(connectionCount(customer.id)).toBe(1);

    await knex('users').where({ id: customer.id }).update({ status: 'SUSPENDED' });
    await heartbeat();
    await tick();
    expect(stream.ended).toBe(true);
    expect(connectionCount(customer.id)).toBe(0);
  });

  it('writes a comment-line heartbeat', async () => {
    const customer = await makeUser();
    const stream = await openStream(customer);
    await heartbeat();
    await tick();
    expect(stream.chunks).toContain(': ping');
  });

  it('removes the connection when the client disconnects', async () => {
    const customer = await makeUser();
    const stream = await openStream(customer);
    await tick();
    expect(connectionCount(customer.id)).toBe(1);
    stream.req.destroy();
    await tick();
    expect(connectionCount(customer.id)).toBe(0);
  });

  it('caps connections per user by closing the oldest', async () => {
    const customer = await makeUser();
    const streams = [];
    for (let i = 0; i <= MAX_CONNECTIONS_PER_USER; i += 1) streams.push(await openStream(customer));
    await tick();
    expect(connectionCount(customer.id)).toBe(MAX_CONNECTIONS_PER_USER);
    expect(streams[0].ended).toBe(true);
    expect(streams.at(-1).ended).toBe(false);
  });
});
