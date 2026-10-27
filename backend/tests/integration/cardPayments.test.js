import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeCart, authHeader,
} from '../helpers/factories.js';
import { fakeControls } from '../../src/modules/payments/providers/index.js';
import { paymentTimeoutJob } from '../../src/jobs/paymentTimeout.job.js';
import { refundSweepJob } from '../../src/jobs/refundSweep.job.js';
import { orderTimeoutJob } from '../../src/jobs/orderTimeout.job.js';

beforeEach(async () => {
  await resetDatabase();
  fakeControls.reset();
});

const TOTAL = '164.76';

/** A customer with an address and a cart worth 164.76 (2 mains + 1 soup). */
async function setup() {
  const customer = await makeUser({ role: 'CUSTOMER' });
  const address = await makeAddress(customer);
  const admin = await makeUser({ role: 'ADMIN' });
  const stocked = await makeStockedRestaurant();
  await makeCart(customer, stocked.restaurant, [
    { item: stocked.main, quantity: 2 }, { item: stocked.soup, quantity: 1 },
  ]);
  return { customer, address, admin, ...stocked };
}

const checkoutCard = (customer, address, body = {}) =>
  request(app).post('/api/orders').set(authHeader(customer))
    .send({ addressId: address.id, paymentMethod: 'CARD', ...body });

/** Plays the customer paying on the gateway, returns the gateway payment id. */
const payOnGateway = (payment, overrides = {}) => fakeControls.seedPayment({
  id: `pay_${payment.id}`,
  amount: TOTAL,
  currency: 'EGP',
  status: 'paid',
  reference: payment.id,
  ...overrides,
});

const confirm = (customer, orderId, providerPaymentId) =>
  request(app).post(`/api/orders/${orderId}/payment/confirm`).set(authHeader(customer))
    .send({ providerPaymentId });

/** Checks out by card and pays successfully; returns everything a test needs. */
async function paidCardOrder() {
  const ctx = await setup();
  const res = await checkoutCard(ctx.customer, ctx.address).expect(201);
  const orderId = res.body.data.id;
  const payment = await knex('payments').where({ order_id: orderId }).first();
  await confirm(ctx.customer, orderId, payOnGateway(payment)).expect(200);
  return { ...ctx, orderId, paymentId: payment.id };
}

describe('card checkout', () => {
  it('creates the order and an INITIATED payment for the server-computed total', async () => {
    const { customer, address } = await setup();
    // A client-sent amount is not part of the schema and never reaches the service (BR-O5).
    const res = await checkoutCard(customer, address, { amount: '1.00', totalAmount: '1.00' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'PENDING', paymentMethod: 'CARD', totalAmount: TOTAL });
    expect(res.body.data.payment).toMatchObject({
      status: 'INITIATED', amount: TOTAL, currency: 'EGP',
      provider: 'fake', publishableKey: expect.any(String),
    });

    const payment = await knex('payments').first();
    expect(payment).toMatchObject({ amount: TOTAL, status: 'INITIATED', provider_payment_id: null });
    expect(payment.order_id).toBe(res.body.data.id);
  });

  it('is not announced to the restaurant, and the restaurant cannot see or accept it', async () => {
    const { customer, address, owner } = await setup();
    const res = await checkoutCard(customer, address);
    const orderId = res.body.data.id;

    expect(await knex('notifications').where({ template: 'NEW_ORDER' })).toHaveLength(0);

    const list = await request(app).get('/api/restaurant/orders').set(authHeader(owner));
    expect(list.body.data).toHaveLength(0);
    expect((await request(app).get(`/api/restaurant/orders/${orderId}`).set(authHeader(owner))).status).toBe(404);
    expect((await request(app).post(`/api/restaurant/orders/${orderId}/accept`).set(authHeader(owner))).status).toBe(404);
    expect((await knex('orders').where({ id: orderId }).first()).status).toBe('PENDING');
  });

  it('refuses a card order when cart is empty without leaving a payment behind', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const address = await makeAddress(customer);
    const res = await checkoutCard(customer, address);
    expect(res.status).toBe(422);
    expect(await knex('payments')).toHaveLength(0);
  });
});

describe('verifying a payment', () => {
  it('marks it PAID from the gateway record, announces the order and shows it to the restaurant', async () => {
    const { customer, address, owner } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;
    const payment = await knex('payments').first();

    const res = await confirm(customer, orderId, payOnGateway(payment));
    expect(res.status).toBe(200);
    expect(res.body.data.payment).toMatchObject({ status: 'PAID', publishableKey: null });

    const row = await knex('payments').first();
    expect(row.status).toBe('PAID');
    expect(row.provider_payment_id).toBe(`pay_${payment.id}`);
    expect(row.paid_at).not.toBeNull();
    expect(await knex('notifications').where({ template: 'NEW_ORDER', channel: 'EMAIL' })).toHaveLength(1);

    const list = await request(app).get('/api/restaurant/orders').set(authHeader(owner));
    expect(list.body.data.map((o) => o.id)).toEqual([orderId]);
    await request(app).post(`/api/restaurant/orders/${orderId}/accept`).set(authHeader(owner)).expect(200);
  });

  it('is idempotent: confirming twice announces the order once', async () => {
    const { customer, address } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;
    const payment = await knex('payments').first();
    const gatewayId = payOnGateway(payment);

    await confirm(customer, orderId, gatewayId).expect(200);
    await confirm(customer, orderId, gatewayId).expect(200);
    expect(await knex('notifications').where({ template: 'NEW_ORDER', channel: 'EMAIL' })).toHaveLength(1);
  });

  it('rejects a payment for the wrong amount and leaves the order unpaid', async () => {
    const { customer, address } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;
    const payment = await knex('payments').first();

    const res = await confirm(customer, orderId, payOnGateway(payment, { amount: '100.00' }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PAYMENT_NOT_VERIFIED');
    expect((await knex('payments').first()).status).toBe('INITIATED');
  });

  it('rejects the wrong currency, an unknown gateway id and a payment made for another order', async () => {
    const { customer, address } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;
    const payment = await knex('payments').first();

    const wrongCurrency = await confirm(customer, orderId, payOnGateway(payment, { currency: 'USD' }));
    expect(wrongCurrency.body.error.code).toBe('PAYMENT_NOT_VERIFIED');

    const unknown = await confirm(customer, orderId, 'pay_does_not_exist');
    expect(unknown.body.error.code).toBe('PAYMENT_NOT_VERIFIED');

    const elsewhere = payOnGateway(payment, { id: 'pay_other', reference: crypto.randomUUID() });
    expect((await confirm(customer, orderId, elsewhere)).body.error.code).toBe('PAYMENT_NOT_VERIFIED');
    expect((await knex('payments').first()).status).toBe('INITIATED');
  });

  it('does not let one gateway payment settle two orders', async () => {
    const first = await setup();
    const orderA = (await checkoutCard(first.customer, first.address)).body.data.id;
    const paymentA = await knex('payments').where({ order_id: orderA }).first();
    await confirm(first.customer, orderA, payOnGateway(paymentA)).expect(200);

    // A second order by the same customer; the attacker replays order A's gateway id.
    await makeCart(first.customer, first.restaurant, [
      { item: first.main, quantity: 2 }, { item: first.soup, quantity: 1 },
    ]);
    const orderB = (await checkoutCard(first.customer, first.address)).body.data.id;
    const res = await confirm(first.customer, orderB, `pay_${paymentA.id}`);
    expect(res.status).toBe(422);
    expect((await knex('payments').where({ order_id: orderB }).first()).status).toBe('INITIATED');
  });

  it("is a 404 for another customer's order", async () => {
    const { customer, address } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;
    const payment = await knex('payments').first();
    const stranger = await makeUser({ role: 'CUSTOMER' });

    const res = await confirm(stranger, orderId, payOnGateway(payment));
    expect(res.status).toBe(404);
    expect((await knex('payments').first()).status).toBe('INITIATED');
  });

  it('records a declined payment as FAILED and accepts a later successful attempt', async () => {
    const { customer, address } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;
    const payment = await knex('payments').first();

    const declined = payOnGateway(payment, { id: 'pay_declined', status: 'failed', message: 'Insufficient funds' });
    const res = await confirm(customer, orderId, declined);
    expect(res.body.data.payment).toMatchObject({ status: 'FAILED', failureMessage: 'Insufficient funds' });
    expect(res.body.data.payment.publishableKey).toEqual(expect.any(String)); // may try again

    await confirm(customer, orderId, payOnGateway(payment, { id: 'pay_retry' })).expect(200);
    expect((await knex('payments').first()).status).toBe('PAID');
  });

  it('leaves a payment still in 3-D Secure as INITIATED', async () => {
    const { customer, address } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;
    const payment = await knex('payments').first();

    const res = await confirm(customer, orderId, payOnGateway(payment, { status: 'initiated' }));
    expect(res.status).toBe(200);
    expect(res.body.data.payment.status).toBe('INITIATED');
  });

  it('the simulate endpoint stands in for the gateway page in development', async () => {
    const { customer, address } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;

    const sim = await request(app).post(`/api/orders/${orderId}/payment/simulate`).set(authHeader(customer));
    expect(sim.status).toBe(200);
    const res = await confirm(customer, orderId, sim.body.data.providerPaymentId);
    expect(res.body.data.payment.status).toBe('PAID');
  });
});

describe('the Moyasar webhook', () => {
  const hook = (body) => request(app).post('/api/payments/webhooks/moyasar').send(body);

  it('rejects a wrong secret token', async () => {
    const res = await hook({ type: 'payment_paid', secret_token: 'nope', data: { id: 'pay_x' } });
    expect(res.status).toBe(401);
  });

  it('settles a payment the browser never reported, after re-fetching it', async () => {
    const { customer, address } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;
    const payment = await knex('payments').first();
    const gatewayId = payOnGateway(payment);

    const res = await hook({ type: 'payment_paid', secret_token: 'whsec_test_secret', data: { id: gatewayId } });
    expect(res.status).toBe(200);
    expect((await knex('payments').first()).status).toBe('PAID');
    expect(await knex('notifications').where({ template: 'NEW_ORDER', channel: 'EMAIL' })).toHaveLength(1);
    expect(orderId).toBeTruthy();
  });

  it('ignores a payload claiming a payment the gateway does not confirm', async () => {
    const { customer, address } = await setup();
    await checkoutCard(customer, address);
    const res = await hook({ type: 'payment_paid', secret_token: 'whsec_test_secret', data: { id: 'pay_forged' } });
    expect(res.status).toBe(200);
    expect((await knex('payments').first()).status).toBe('INITIATED');
  });
});

describe('cancelling a paid card order refunds it', () => {
  const expectRefunded = async (paymentId) => {
    const row = await knex('payments').where({ id: paymentId }).first();
    expect(row).toMatchObject({ status: 'REFUNDED', refunded_amount: TOTAL, refund_error: null });
    expect(row.refunded_at).not.toBeNull();
    expect(fakeControls.refundCalls()).toEqual([{ providerPaymentId: `pay_${paymentId}`, amount: TOTAL }]);
  };

  it('when the customer cancels', async () => {
    const { customer, orderId, paymentId } = await paidCardOrder();
    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set(authHeader(customer)).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.payment).toMatchObject({ status: 'REFUNDED', refundedAmount: TOTAL });
    await expectRefunded(paymentId);
  });

  it('when the restaurant rejects it', async () => {
    const { owner, orderId, paymentId } = await paidCardOrder();
    await request(app).post(`/api/restaurant/orders/${orderId}/reject`).set(authHeader(owner))
      .send({ reason: 'RESTAURANT_TOO_BUSY' }).expect(200);
    await expectRefunded(paymentId);
  });

  it('when an admin force-cancels it', async () => {
    const { admin, orderId, paymentId } = await paidCardOrder();
    await request(app).post(`/api/admin/orders/${orderId}/force-cancel`).set(authHeader(admin))
      .send({ reason: 'ADMIN_INTERVENTION' }).expect(200);
    await expectRefunded(paymentId);
  });

  it('when the restaurant lets it time out (SYSTEM)', async () => {
    const { orderId, paymentId } = await paidCardOrder();
    await knex('payments').where({ id: paymentId }).update({ paid_at: new Date(Date.now() - 3600_000) });
    const result = await orderTimeoutJob();
    expect(result.cancelled).toBe(1);
    expect((await knex('orders').where({ id: orderId }).first()).cancellation_reason).toBe('ACCEPT_TIMEOUT');
    await expectRefunded(paymentId);
  });

  it('does not refund an order that was never paid, or a cash order', async () => {
    const { customer, address } = await setup();
    const unpaid = (await checkoutCard(customer, address)).body.data.id;
    await request(app).post(`/api/orders/${unpaid}/cancel`).set(authHeader(customer)).send({}).expect(200);
    expect((await knex('payments').first()).status).toBe('INITIATED');

    expect(fakeControls.refundCalls()).toHaveLength(0);
  });

  it('refunds only once however many times cancellation follow-up runs', async () => {
    const { customer, orderId, paymentId } = await paidCardOrder();
    await request(app).post(`/api/orders/${orderId}/cancel`).set(authHeader(customer)).send({}).expect(200);
    await refundSweepJob();
    await refundSweepJob();
    await expectRefunded(paymentId);
  });
});

describe('a refund that fails', () => {
  async function failedRefund() {
    const ctx = await paidCardOrder();
    fakeControls.failNextRefund('Insufficient merchant balance');
    await request(app).post(`/api/orders/${ctx.orderId}/cancel`).set(authHeader(ctx.customer)).send({}).expect(200);
    return ctx;
  }

  it('is recorded on the payment and does not undo the cancellation', async () => {
    const { orderId, paymentId } = await failedRefund();
    expect((await knex('orders').where({ id: orderId }).first()).status).toBe('CANCELLED');
    expect(await knex('payments').where({ id: paymentId }).first()).toMatchObject({
      status: 'REFUND_FAILED', refund_error: 'Insufficient merchant balance', refund_attempts: 1,
    });
  });

  it('is visible to admins in the order detail and the needs-attention list', async () => {
    const { admin, orderId, paymentId } = await failedRefund();

    const detail = await request(app).get(`/api/admin/orders/${orderId}`).set(authHeader(admin));
    expect(detail.body.data.payment).toMatchObject({
      id: paymentId, status: 'REFUND_FAILED', refundError: 'Insufficient merchant balance',
    });

    const stuck = await request(app).get('/api/admin/orders/stuck').set(authHeader(admin));
    expect(stuck.body.data.map((o) => [o.id, o.stuckReason])).toContainEqual([orderId, 'REFUND_FAILED']);
  });

  it('is not retried by the sweep, only by an admin', async () => {
    const { paymentId } = await failedRefund();
    await refundSweepJob();
    expect((await knex('payments').where({ id: paymentId }).first()).status).toBe('REFUND_FAILED');
  });

  it('can be retried by an admin, and the retry is audited', async () => {
    const { admin, orderId, paymentId } = await failedRefund();

    const res = await request(app).post(`/api/admin/payments/${paymentId}/refund`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'REFUNDED', outcome: 'REFUNDED', refundedAmount: TOTAL });
    expect((await knex('payments').where({ id: paymentId }).first()).refund_attempts).toBe(2);

    const [log] = await knex('admin_audit_logs').where({ action: 'PAYMENT_REFUND_RETRIED', entity_id: paymentId });
    expect(log.admin_user_id).toBe(admin.id);
    expect(log.metadata).toMatchObject({ orderId, outcome: 'REFUNDED' });
  });

  it('audits a retry that fails again and leaves it retryable', async () => {
    const { admin, paymentId } = await failedRefund();
    fakeControls.failNextRefund('Still refused');

    const res = await request(app).post(`/api/admin/payments/${paymentId}/refund`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'REFUND_FAILED', outcome: 'REFUND_FAILED', refundError: 'Still refused' });
    const logs = await knex('admin_audit_logs').where({ action: 'PAYMENT_REFUND_RETRIED' });
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata.outcome).toBe('REFUND_FAILED');

    await request(app).post(`/api/admin/payments/${paymentId}/refund`).set(authHeader(admin)).expect(200);
    expect((await knex('payments').where({ id: paymentId }).first()).status).toBe('REFUNDED');
  });

  it('cannot be retried once refunded, for a missing payment, or by a non-admin', async () => {
    const { admin, customer, paymentId } = await failedRefund();
    await request(app).post(`/api/admin/payments/${paymentId}/refund`).set(authHeader(admin)).expect(200);

    const again = await request(app).post(`/api/admin/payments/${paymentId}/refund`).set(authHeader(admin));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PAYMENT_NOT_REFUNDABLE');
    expect(await knex('admin_audit_logs').where({ action: 'PAYMENT_REFUND_RETRIED' })).toHaveLength(1);

    const missing = await request(app).post(`/api/admin/payments/${crypto.randomUUID()}/refund`).set(authHeader(admin));
    expect(missing.status).toBe(404);
    expect((await request(app).post(`/api/admin/payments/${paymentId}/refund`).set(authHeader(customer))).status).toBe(403);
  });
});

describe('a card order whose payment never completes', () => {
  it('is cancelled by the SYSTEM after the timeout, and never reached the restaurant', async () => {
    const { customer, address, owner } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;

    // Fresh: left alone.
    expect((await paymentTimeoutJob()).cancelled).toBe(0);

    await knex('payments').update({ created_at: new Date(Date.now() - 3600_000) });
    // The restaurant-response timeout must not touch an unpaid card order.
    await knex('orders').update({ placed_at: new Date(Date.now() - 3600_000) });
    expect((await orderTimeoutJob()).cancelled).toBe(0);

    expect((await paymentTimeoutJob()).cancelled).toBe(1);
    expect(await knex('orders').where({ id: orderId }).first()).toMatchObject({
      status: 'CANCELLED', cancelled_by: 'SYSTEM', cancellation_reason: 'PAYMENT_TIMEOUT',
    });
    expect(fakeControls.refundCalls()).toHaveLength(0);
    expect((await request(app).get('/api/restaurant/orders').set(authHeader(owner))).body.data).toHaveLength(0);
  });

  it('is refunded if the customer pays after the order was cancelled', async () => {
    const { customer, address } = await setup();
    const orderId = (await checkoutCard(customer, address)).body.data.id;
    const payment = await knex('payments').first();
    await knex('payments').update({ created_at: new Date(Date.now() - 3600_000) });
    await paymentTimeoutJob();

    await confirm(customer, orderId, payOnGateway(payment)).expect(200);
    expect(await knex('payments').first()).toMatchObject({ status: 'REFUNDED', refunded_amount: TOTAL });
    // A cancelled order is not announced as new.
    expect(await knex('notifications').where({ template: 'NEW_ORDER' })).toHaveLength(0);
  });

  it('the refund sweep finishes a refund the cancellation never got to', async () => {
    const { orderId, paymentId } = await paidCardOrder();
    // Simulate a crash between commit and refund: cancelled, but still PAID.
    await knex('orders').where({ id: orderId }).update({
      status: 'CANCELLED', cancelled_at: knex.fn.now(), cancelled_by: 'ADMIN', cancellation_reason: 'ADMIN_INTERVENTION',
    });
    expect((await refundSweepJob()).refunded).toBe(1);
    expect((await knex('payments').where({ id: paymentId }).first()).status).toBe('REFUNDED');
  });
});

describe('cash on delivery is unchanged', () => {
  it('has no payment, is announced at once and is visible to the restaurant', async () => {
    const { customer, address, owner } = await setup();
    const res = await request(app).post('/api/orders').set(authHeader(customer))
      .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ paymentMethod: 'CASH_ON_DELIVERY', payment: null });
    expect(await knex('payments')).toHaveLength(0);
    expect(await knex('notifications').where({ template: 'NEW_ORDER', channel: 'EMAIL' })).toHaveLength(1);
    const list = await request(app).get('/api/restaurant/orders').set(authHeader(owner));
    expect(list.body.data).toHaveLength(1);
  });

  it('defaults to cash when no method is sent, and cancelling it touches no gateway', async () => {
    const { customer, address } = await setup();
    const res = await request(app).post('/api/orders').set(authHeader(customer)).send({ addressId: address.id });
    expect(res.body.data.paymentMethod).toBe('CASH_ON_DELIVERY');
    await request(app).post(`/api/orders/${res.body.data.id}/cancel`).set(authHeader(customer)).send({}).expect(200);
    expect(fakeControls.refundCalls()).toHaveLength(0);
  });

  it('keeps admin-placed orders cash on delivery', async () => {
    const { admin, customer, address, restaurant, main } = await setup();
    const res = await request(app).post('/api/admin/orders').set(authHeader(admin)).send({
      customerUserId: customer.id, restaurantId: restaurant.id, addressId: address.id,
      items: [{ foodItemId: main.id, quantity: 1 }], paymentMethod: 'CARD',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentMethod).toBe('CASH_ON_DELIVERY');
    expect(await knex('payments')).toHaveLength(0);
  });
});

describe('payment configuration', () => {
  it('tells the checkout page whether cards are on', async () => {
    const customer = await makeUser({ role: 'CUSTOMER' });
    const res = await request(app).get('/api/payments/config').set(authHeader(customer));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ cardEnabled: true, provider: 'fake', currency: 'EGP' });
  });
});

describe('with live updates and discount codes', () => {
  it('pushes order.created to the restaurant when a card order becomes paid', async () => {
    const { subscribe } = await import('../../src/shared/events/index.js');
    const ctx = await setup();
    const res = await checkoutCard(ctx.customer, ctx.address).expect(201);
    const orderId = res.body.data.id;
    const payment = await knex('payments').where({ order_id: orderId }).first();

    const seen = [];
    const unsubscribe = subscribe((event) => seen.push(event));
    try {
      await confirm(ctx.customer, orderId, payOnGateway(payment)).expect(200);
      // The paid listener runs after the confirm commits; let it finish.
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      unsubscribe();
    }

    // Its screen does not poll while the stream is open, so this is how it learns.
    const created = seen.find((e) => e.type === 'order.created' && e.data.orderId === orderId);
    expect(created).toBeDefined();
    expect(created.audience.restaurantIds).toContain(ctx.restaurant.id);
  });

  it('does not announce a card order at checkout, only once it is paid', async () => {
    const { subscribe } = await import('../../src/shared/events/index.js');
    const ctx = await setup();
    const seen = [];
    const unsubscribe = subscribe((event) => seen.push(event));
    let orderId;
    try {
      orderId = (await checkoutCard(ctx.customer, ctx.address).expect(201)).body.data.id;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      unsubscribe();
    }
    expect(seen.filter((e) => e.type === 'order.created' && e.data.orderId === orderId)).toHaveLength(0);
  });

  it('refuses card for an order a discount brings to zero, and leaves the cart as it was', async () => {
    const ctx = await setup();
    await knex('restaurants').where({ id: ctx.restaurant.id }).update({ delivery_fee: '0.00' });
    await request(app).post('/api/admin/discount-codes').set(authHeader(ctx.admin))
      .send({ code: 'ALLFREE', type: 'FIXED', value: '1000.00' }).expect(201);
    await request(app).post('/api/cart/discount').set(authHeader(ctx.customer))
      .send({ code: 'ALLFREE' }).expect(200);

    const res = await checkoutCard(ctx.customer, ctx.address);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE');
    expect(await knex('orders')).toHaveLength(0);
    expect(await knex('payments')).toHaveLength(0);
    expect((await knex('carts').where({ customer_user_id: ctx.customer.id }).first()).status).toBe('ACTIVE');
  });
});
