import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { config } from '../../src/config/index.js';
import { knex, resetDatabase } from '../helpers/db.js';
import { notify, settled } from '../../src/shared/notifications.js';
import { setTransport, resetTransports } from '../../src/shared/messaging/transports.js';
import { resolveRecipient } from '../../src/shared/messaging/recipients.js';
import { notificationRetryJob } from '../../src/jobs/index.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeOrder, makeDriver, makeAssignment, authHeader,
} from '../helpers/factories.js';

let sent;
const okTransport = (name) => ({ name, send: vi.fn(async (m) => { sent.push({ name, ...m }); }) });

beforeEach(async () => {
  await resetDatabase();
  sent = [];
  // Real transports are never built in tests: both channels are injected.
  setTransport('EMAIL', okTransport('smtp'));
  setTransport('SMS', okTransport('twilio'));
});
afterEach(() => resetTransports());

async function placeOrder() {
  const customer = await makeUser({ role: 'CUSTOMER', email: 'sara@example.com', phone: '01012345678' });
  const address = await makeAddress(customer);
  const r = await makeStockedRestaurant();
  await knex('users').where({ id: r.owner.id }).update({ email: 'owner@example.com', phone: '01199887766' });
  await request(app).post('/api/cart/items').set(authHeader(customer))
    .send({ foodItemId: r.main.id, quantity: 2 });
  const res = await request(app).post('/api/orders').set(authHeader(customer))
    .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
  await settled();
  return { customer, res, ...r };
}

const rows = (where = {}) => knex('notifications').where(where).orderBy('created_at');

describe('recipient resolution', () => {
  it('finds the restaurant owner and the customer of an order', async () => {
    const customer = await makeUser();
    const { restaurant, owner } = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant });
    expect((await resolveRecipient({ kind: 'ORDER_RESTAURANT_OWNER', orderId: order.id })).userId).toBe(owner.id);
    expect((await resolveRecipient({ kind: 'ORDER_CUSTOMER', orderId: order.id })).userId).toBe(customer.id);
  });

  it('does not contact suspended or deleted users, or unknown orders', async () => {
    const suspended = await makeUser({ status: 'SUSPENDED' });
    const deleted = await makeUser({ deletedAt: new Date() });
    expect(await resolveRecipient({ userId: suspended.id })).toBeNull();
    expect(await resolveRecipient({ userId: deleted.id })).toBeNull();
    expect(await resolveRecipient({ kind: 'ORDER_CUSTOMER', orderId: '00000000-0000-4000-8000-000000000000' })).toBeNull();
  });
});

describe('a placed order', () => {
  it('records and sends SMS + email to the restaurant owner and email to the customer', async () => {
    const { res, owner, customer } = await placeOrder();
    expect(res.status).toBe(201);

    const toOwner = await rows({ user_id: owner.id, template: 'NEW_ORDER' });
    expect(toOwner.map((n) => [n.channel, n.status, n.recipient]).sort()).toEqual([
      ['EMAIL', 'SENT', 'owner@example.com'],
      ['SMS', 'SENT', '+201199887766'],
    ]);
    expect(toOwner.every((n) => n.sent_at && n.attempts === 1)).toBe(true);

    const toCustomer = await rows({ user_id: customer.id, template: 'ORDER_PLACED' });
    expect(toCustomer.map((n) => [n.channel, n.status])).toEqual([['EMAIL', 'SENT']]);

    // The SMS went to the E.164 number; the email carries a subject, text and HTML.
    expect(sent.find((m) => m.name === 'twilio').to).toBe('+201199887766');
    const mail = sent.find((m) => m.to === 'owner@example.com');
    expect(mail).toMatchObject({ subject: expect.stringContaining(res.body.data.orderNumber) });
    expect(mail.html).toContain('<p>');
  });

  it('is recorded only once even if the notification is triggered twice', async () => {
    const { res, owner } = await placeOrder();
    const orders = await import('../../src/modules/orders/index.js');
    await orders.notifyNewOrder(await orders.getOrderById(res.body.data.id));
    await settled();
    expect(await rows({ user_id: owner.id, template: 'NEW_ORDER' })).toHaveLength(2);
  });

  it('is only logged (SKIPPED) with the default log transport', async () => {
    resetTransports();
    const { owner } = await placeOrder();
    const all = await rows({ user_id: owner.id, template: 'NEW_ORDER' });
    expect(all.map((n) => n.status)).toEqual(['SKIPPED', 'SKIPPED']);
    expect(all.every((n) => n.sent_at === null)).toBe(true);
  });

  it('is marked FAILED by a failing transport without failing the order', async () => {
    setTransport('SMS', { name: 'twilio', send: async () => { throw new Error('Twilio 503: down'); } });
    const { res, owner } = await placeOrder();

    expect(res.status).toBe(201);
    expect(await knex('orders').where({ id: res.body.data.id })).toHaveLength(1);
    const [sms] = await rows({ user_id: owner.id, template: 'NEW_ORDER', channel: 'SMS' });
    expect(sms).toMatchObject({ status: 'FAILED', attempts: 1, last_error: 'Twilio 503: down' });
    expect(sms.next_attempt_at).not.toBeNull();
    // The email channel is unaffected.
    const [mail] = await rows({ user_id: owner.id, template: 'NEW_ORDER', channel: 'EMAIL' });
    expect(mail.status).toBe('SENT');
  });

  it('skips a channel when the recipient has no usable address', async () => {
    const customer = await makeUser();
    const { restaurant, owner } = await makeStockedRestaurant();
    await knex('users').where({ id: owner.id }).update({ phone: '12345' });
    const order = await makeOrder({ customer, restaurant });
    await notify({ template: 'NEW_ORDER', payload: { orderId: order.id, orderNumber: order.order_number } });
    await settled();
    const [sms] = await rows({ user_id: owner.id, channel: 'SMS' });
    expect(sms.status).toBe('SKIPPED');
    expect(sms.last_error).toMatch(/no address/);
  });
});

describe('retry job', () => {
  const failOnce = () => {
    let calls = 0;
    return { name: 'twilio', send: vi.fn(async (m) => { calls += 1; if (calls === 1) throw new Error('boom'); sent.push(m); }) };
  };

  it('resends a due FAILED row and leaves one that is not yet due', async () => {
    setTransport('SMS', failOnce());
    const { owner } = await placeOrder();
    const [failed] = await rows({ user_id: owner.id, channel: 'SMS' });
    expect(failed.status).toBe('FAILED');

    // Backoff has not elapsed: nothing is resent.
    expect((await notificationRetryJob()).considered).toBe(0);

    await knex('notifications').where({ id: failed.id }).update({ next_attempt_at: knex.raw("now() - interval '1 second'") });
    expect(await notificationRetryJob()).toMatchObject({ considered: 1, sent: 1 });

    const [after] = await rows({ id: failed.id });
    expect(after).toMatchObject({ status: 'SENT', attempts: 2, last_error: null });
    expect(after.sent_at).not.toBeNull();
    // And it is not sent a third time.
    expect((await notificationRetryJob()).considered).toBe(0);
  });

  it('backs off exponentially and stops at the attempt cap', async () => {
    setTransport('SMS', { name: 'twilio', send: async () => { throw new Error('still down'); } });
    const { owner } = await placeOrder();
    const [row] = await rows({ user_id: owner.id, channel: 'SMS' });
    const base = config.notifications.retryBaseSeconds;

    const delayOf = async () => {
      const { rows: r } = await knex.raw(
        'SELECT extract(epoch FROM next_attempt_at - now()) AS s FROM notifications WHERE id = ?', [row.id],
      );
      return Math.round(Number(r[0].s));
    };
    expect(Math.abs((await delayOf()) - base)).toBeLessThanOrEqual(2); // after attempt 1

    for (let attempt = 2; attempt <= config.notifications.maxAttempts; attempt += 1) {
      await knex('notifications').where({ id: row.id }).update({ next_attempt_at: knex.raw("now() - interval '1 second'") });
      await notificationRetryJob();
      if (attempt < config.notifications.maxAttempts) {
        expect(Math.abs((await delayOf()) - base * 2 ** (attempt - 1))).toBeLessThanOrEqual(2);
      }
    }
    const [done] = await rows({ id: row.id });
    expect(done).toMatchObject({ status: 'FAILED', attempts: config.notifications.maxAttempts });

    // Capped: even when due, it is not picked up again.
    await knex('notifications').where({ id: row.id }).update({ next_attempt_at: knex.raw("now() - interval '1 second'") });
    expect((await notificationRetryJob()).considered).toBe(0);
  });

  it('caps external messages per recipient per hour', async () => {
    const customer = await makeUser();
    const { restaurant, owner } = await makeStockedRestaurant();
    const limit = config.notifications.recipientHourlyLimit;
    await knex('notifications').insert(Array.from({ length: limit }, (_, i) => ({
      user_id: owner.id, channel: 'SMS', template: 'NEW_ORDER', status: 'SENT',
      recipient: '+201000000000', sent_at: knex.fn.now(), attempts: 1, dedupe_key: `x${i}`,
    })));
    const order = await makeOrder({ customer, restaurant });
    await notify({ template: 'NEW_ORDER', channel: 'SMS', payload: { orderId: order.id, orderNumber: order.order_number } });
    await settled();
    const [row] = await rows({ user_id: owner.id, status: 'SKIPPED' });
    expect(row.last_error).toMatch(/rate limit/);
    expect(sent).toHaveLength(0);
  });

  it('delivers a row that was recorded but never sent (process died)', async () => {
    const user = await makeUser({ phone: '01012345678' });
    await knex('notifications').insert({
      user_id: user.id, channel: 'SMS', template: 'ORDER_PLACED', status: 'QUEUED',
      recipient: '+201012345678', payload: JSON.stringify({ orderNumber: 'FF-1' }),
      created_at: knex.raw("now() - interval '10 minutes'"),
    });
    expect(await notificationRetryJob()).toMatchObject({ considered: 1, sent: 1 });
  });
});

describe('other templates', () => {
  it('texts the customer when the order goes out for delivery', async () => {
    const customer = await makeUser({ phone: '01012345678' });
    const { restaurant } = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant, status: 'READY_FOR_PICKUP' });
    const { user: driver } = await makeDriver();
    await knex('orders').where({ id: order.id }).update({ driver_user_id: driver.id, dispatch_state: 'ASSIGNED' });
    await makeAssignment(order, driver, { status: 'ACCEPTED' });

    await request(app).post(`/api/driver/deliveries/${order.id}/pick-up`).set(authHeader(driver)).send({}).expect(200);
    await settled();

    const [sms] = await rows({ user_id: customer.id, template: 'ORDER_OUT_FOR_DELIVERY' });
    expect(sms).toMatchObject({ channel: 'SMS', status: 'SENT', recipient: '+201012345678' });
    expect(sent.find((m) => m.name === 'twilio').text).toContain(order.order_number);
  });

  it('emails the customer when an admin force-cancels, with the reason', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const customer = await makeUser({ email: 'sara@example.com' });
    const { restaurant } = await makeStockedRestaurant();
    const order = await makeOrder({ customer, restaurant, status: 'PREPARING' });
    await request(app).post(`/api/admin/orders/${order.id}/force-cancel`).set(authHeader(admin))
      .send({ reason: 'CUSTOMER_CHANGED_MIND' });
    await settled();
    const [mail] = await rows({ user_id: customer.id, template: 'ORDER_CANCELLED' });
    expect(mail).toMatchObject({ channel: 'EMAIL', status: 'SENT', recipient: 'sara@example.com' });
  });

  it('sends a welcome email for a new driver and never includes the password', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const res = await request(app).post('/api/admin/drivers').set(authHeader(admin))
      .send({ email: 'omar@example.com', fullName: 'Omar Nasser', phone: '+201001110000', vehicleType: 'MOTORCYCLE', vehiclePlate: 'ABC 1234' });
    expect(res.status).toBe(201);
    await settled();

    const mail = sent.find((m) => m.to === 'omar@example.com');
    expect(mail.subject).toMatch(/Welcome/);
    const everything = JSON.stringify([mail, await rows()]);
    expect(everything).not.toContain(res.body.data.initialPassword);
  });

  it('keeps an in-app notification as a row with no transport call', async () => {
    const driver = await makeUser({ role: 'DRIVER' });
    await notify({ userId: driver.id, template: 'NEW_OFFER', payload: { orderNumber: 'FF-1' } });
    await settled();
    const [row] = await rows({ user_id: driver.id });
    expect(row).toMatchObject({ channel: 'IN_APP', status: 'SENT' });
    expect(sent).toHaveLength(0);
  });
});
