import crypto from 'node:crypto';
import { config } from '../../../config/index.js';
import { ProviderError } from './providerError.js';

/**
 * Deterministic in-memory gateway for tests and key-less development. It
 * implements the same interface as the Moyasar adapter and never touches the
 * network.
 *
 * `fakeControls` is the test/dev side of it: it plays the part of the customer
 * paying on the gateway's page. It is deliberately not reachable from any
 * route except the guarded simulate endpoint (non-production only).
 */
const payments = new Map();
let refundFailure = null;
const refunds = [];

export const fakeControls = {
  /** Registers a payment as the gateway would report it. Amount is a decimal string. */
  seedPayment({ id = `fake_${crypto.randomUUID()}`, amount, currency = config.payments.currency, status = 'paid', reference = null, message = null }) {
    payments.set(id, { id, amount, currency, status, refundedAmount: '0.00', reference, metadata: {}, message });
    return id;
  },
  /** Makes the next refund call fail with `message`. */
  failNextRefund(message = 'Gateway refused the refund.') { refundFailure = message; },
  refundCalls: () => [...refunds],
  get: (id) => payments.get(id),
  reset() { payments.clear(); refunds.length = 0; refundFailure = null; },
};

export const fakeProvider = {
  name: 'fake',
  publishableKey: 'pk_fake_not_a_real_key',

  async fetchPayment(providerPaymentId) {
    const p = payments.get(providerPaymentId);
    return p ? { ...p, metadata: { ...p.metadata } } : null;
  },

  verifyWebhook(body) {
    const expected = config.payments.webhookSecret;
    return Boolean(expected) && body?.secret_token === expected;
  },

  webhookPaymentId(body) {
    return typeof body?.data?.id === 'string' ? body.data.id : null;
  },

  async refund(providerPaymentId, amount) {
    refunds.push({ providerPaymentId, amount });
    if (refundFailure) {
      const message = refundFailure;
      refundFailure = null;
      throw new ProviderError(message);
    }
    const p = payments.get(providerPaymentId);
    if (p) { p.status = 'refunded'; p.refundedAmount = amount; }
    return { id: providerPaymentId, status: 'refunded', refundedAmount: amount };
  },
};
