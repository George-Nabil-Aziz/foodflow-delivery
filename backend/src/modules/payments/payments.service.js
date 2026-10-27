import { config } from '../../config/index.js';
import { withTransaction } from '../../shared/db/transaction.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { logger } from '../../shared/logger.js';
import { money } from '../../shared/money.js';
import * as repo from './payments.repository.js';
import { getProvider, ProviderError, fakeControls } from './providers/index.js';
import { toCustomerPaymentDto } from './payments.mapper.js';

/** Statuses from which a payment has been taken: the order may be worked on. */
export const SETTLED_STATUSES = ['PAID', 'REFUNDING', 'REFUNDED', 'REFUND_FAILED'];

/* ------------------------------------------------------------------ config */

export const isCardEnabled = () => config.payments.cardEnabled;

/** What the checkout page needs to decide whether to offer a card. */
export function getPublicConfig() {
  return {
    cardEnabled: config.payments.cardEnabled,
    provider: config.payments.provider,
    currency: config.payments.currency,
  };
}

export function assertCardEnabled() {
  if (!config.payments.cardEnabled) throw new ValidationError('CARD_PAYMENTS_UNAVAILABLE');
}

/* --------------------------------------------------------------- initiation */

/**
 * Records the intent to pay for an order, in the checkout transaction. The
 * amount is the order's total as the server computed it (BR-O5, BR-P2); the
 * caller passes that figure, there is no other source for it.
 */
export function initiate({ orderId, customerUserId, amount }, trx) {
  return repo.insert(
    {
      order_id: orderId,
      customer_user_id: customerUserId,
      provider: getProvider().name,
      amount,
      currency: config.payments.currency,
      status: 'INITIATED',
    },
    trx,
  );
}

export const getForOrder = (orderId, trx) => repo.findByOrderId(orderId, trx);

export const getById = (id, trx) => repo.findById(id, trx);

/** The payment of an order the customer owns; anyone else's is a plain 404. */
export async function getForCustomerOrder(orderId, customerUserId) {
  const payment = await repo.findByOrderId(orderId);
  if (!payment || payment.customer_user_id !== customerUserId) {
    throw new NotFoundError('RESOURCE_NOT_FOUND');
  }
  return payment;
}

/** True once the money has been taken (or has been and was returned). */
export async function isSettled(orderId, trx) {
  const payment = await repo.findByOrderId(orderId, trx);
  return Boolean(payment && SETTLED_STATUSES.includes(payment.status));
}

/** Customer-facing DTO, with the publishable key the hosted form needs. */
export const toCustomerDto = (row) =>
  toCustomerPaymentDto(row, { publishableKey: getProvider().publishableKey });

/* --------------------------------------------------------------- verification */

const paidListeners = [];

/**
 * Registers a function called, after commit, once per payment that becomes
 * PAID. The orders module uses it to announce the order to the restaurant and
 * to refund a payment that arrived for an order already cancelled - which lets
 * this module stay ignorant of orders.
 */
export function onPaid(listener) {
  paidListeners.push(listener);
}

async function emitPaid(payment) {
  for (const listener of paidListeners) {
    try {
      await listener(payment);
    } catch (err) {
      // The payment is recorded; a listener failing must not undo or hide that.
      logger.error({ err, paymentId: payment.id }, 'payment listener failed');
    }
  }
}

async function fetchRemote(providerPaymentId) {
  try {
    return await getProvider().fetchPayment(providerPaymentId);
  } catch (err) {
    if (err instanceof ProviderError) {
      logger.error({ err, providerPaymentId }, 'payment lookup failed');
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', { cause: err });
    }
    throw err;
  }
}

function notVerified(issue, extra = {}) {
  return new ValidationError('PAYMENT_NOT_VERIFIED', {
    details: [{ field: 'providerPaymentId', issue, ...extra }],
  });
}

/**
 * Decides, from the gateway's own record, whether `payment` is paid.
 *
 * Nothing the browser says is believed: the gateway is asked for the payment
 * with the secret key and its answer is checked against what the SERVER
 * recorded at checkout - the reference, the amount and the currency
 * (BR-P2, BR-P3). A mismatch is rejected and leaves the payment as it was.
 */
async function settle(payment, providerPaymentId, prefetched) {
  if (SETTLED_STATUSES.includes(payment.status)) return payment;

  const remote = prefetched ?? (await fetchRemote(providerPaymentId));
  if (!remote) throw notVerified('The payment gateway has no such payment.');

  // Amounts are 2-decimal strings on both sides; the adapter did the minor-unit conversion.
  if (
    remote.reference !== payment.id
    || money.compare(remote.amount, payment.amount) !== 0
    || remote.currency !== payment.currency
  ) {
    logger.warn(
      { paymentId: payment.id, providerPaymentId, remoteAmount: remote.amount, expected: payment.amount },
      'payment did not match the order',
    );
    throw notVerified('This payment does not match the order.');
  }

  if (remote.status === 'failed') {
    const failed = await repo.markFailed(
      payment.id,
      remote.message ?? 'The payment was declined.',
      { lastAttempt: { providerPaymentId, status: 'failed' } },
    );
    return failed ?? (await repo.findById(payment.id));
  }
  // Still in progress (3-D Secure not finished): not paid yet, not failed.
  if (remote.status !== 'paid') return payment;

  let paid;
  try {
    paid = await repo.markPaid(payment.id, providerPaymentId, {
      verifiedAt: new Date().toISOString(),
      gateway: { status: remote.status, amount: remote.amount, currency: remote.currency },
    });
  } catch (err) {
    // uq_payments_provider_payment: this gateway payment already settled another order.
    if (err?.code === '23505') throw notVerified('This payment has already been used.');
    throw err;
  }
  if (!paid) return repo.findById(payment.id); // A concurrent confirm won.

  await emitPaid(paid);
  return paid;
}

/**
 * The customer's browser reports a gateway payment id after paying. The id is
 * only a pointer: whether it is paid, and for how much, is read from the gateway.
 */
export function confirm(payment, providerPaymentId) {
  return settle(payment, providerPaymentId);
}

/**
 * Moyasar webhook. Authenticated by the shared secret token Moyasar echoes
 * in the body; the payload is then used only as a pointer to a payment,
 * which is fetched and verified exactly like a browser confirmation.
 * Returns whether anything was recognised, so the route can always answer 200.
 */
export async function handleWebhook(body) {
  const provider = getProvider();
  // Disabled (404) until a webhook secret is configured.
  if (!config.payments.webhookSecret) throw new NotFoundError('RESOURCE_NOT_FOUND');
  if (!provider.verifyWebhook(body)) throw new UnauthorizedError('TOKEN_INVALID');

  const providerPaymentId = provider.webhookPaymentId(body);
  if (!providerPaymentId) return { recognised: false };

  const remote = await fetchRemote(providerPaymentId);
  const ref = remote?.reference;
  const payment = ref && /^[0-9a-f-]{36}$/i.test(ref)
    ? await repo.findById(ref)
    : await repo.findByProviderPaymentId(getProvider().name, providerPaymentId);
  if (!remote || !payment) return { recognised: false };

  try {
    await settle(payment, providerPaymentId, remote);
  } catch (err) {
    // A payment that fails verification is logged and acknowledged, not retried.
    if (err instanceof ValidationError) return { recognised: false };
    throw err;
  }
  return { recognised: true };
}

/**
 * Stand-in for "the customer paid on the gateway" when running against the
 * fake provider. Refused outright for any real provider and in production.
 */
export async function simulatePayment(payment) {
  if (getProvider().name !== 'fake' || config.isProduction) throw new NotFoundError('RESOURCE_NOT_FOUND');
  const providerPaymentId = fakeControls.seedPayment({
    id: `fake_${payment.id}`,
    amount: payment.amount,
    currency: payment.currency,
    status: 'paid',
    reference: payment.id,
  });
  return { providerPaymentId };
}

/* ------------------------------------------------------------------- refunds */

/**
 * Refunds the full amount. Claim -> gateway call -> record, each its own
 * short step, so the gateway call never holds a transaction or a row lock.
 *
 * Never throws for a gateway failure: that is recorded as REFUND_FAILED and
 * handed back for an admin to see and retry. Returns null when the payment is
 * not in a refundable state (already refunded, or another worker has it).
 *
 * `onRecorded(trx, payment, outcome)` runs inside the transaction that records
 * the result, which is how the admin retry commits its audit row together with it.
 */
async function runRefund(paymentId, { from, onRecorded } = {}) {
  const claimed = await repo.claimForRefund(paymentId, from);
  if (!claimed) return null;

  const provider = getProvider();
  let refunded = false;
  let error = null;
  try {
    // Idempotency: a previous attempt may have succeeded and died before recording.
    const existing = await provider.fetchPayment(claimed.provider_payment_id);
    if (existing?.status === 'refunded') {
      refunded = true;
    } else {
      await provider.refund(claimed.provider_payment_id, claimed.amount);
      refunded = true;
    }
  } catch (err) {
    error = err instanceof ProviderError ? err.message : 'Unexpected error while refunding.';
    if (!(err instanceof ProviderError)) logger.error({ err, paymentId }, 'refund crashed');
    else logger.warn({ paymentId, error }, 'refund failed');
  }

  return withTransaction(async (trx) => {
    const payment = await repo.recordRefund(
      paymentId,
      {
        refunded,
        error,
        metadataPatch: { lastRefundAttemptAt: new Date().toISOString() },
      },
      trx,
    );
    const outcome = refunded ? 'REFUNDED' : 'REFUND_FAILED';
    if (onRecorded) await onRecorded(trx, payment, outcome);
    return { payment, outcome };
  });
}

/**
 * Called after an order is cancelled. Refunds the order's payment if, and only
 * if, it was PAID; anything else (cash, unpaid, already refunded) is a no-op.
 */
export async function refundForOrder(orderId) {
  const payment = await repo.findByOrderId(orderId);
  if (!payment || payment.status !== 'PAID') return null;
  return runRefund(payment.id, { from: ['PAID'] });
}

/**
 * Admin retry of a refund that failed (BR-P6). Only REFUND_FAILED (or an
 * abandoned attempt) can be retried; `onRecorded` carries the audit row.
 */
export async function retryRefund(paymentId, { onRecorded } = {}) {
  const payment = await repo.findById(paymentId);
  if (!payment) throw new NotFoundError('RESOURCE_NOT_FOUND');
  const result = await runRefund(paymentId, { from: ['REFUND_FAILED'], onRecorded });
  if (!result) {
    throw new ConflictError('PAYMENT_NOT_REFUNDABLE', {
      details: [{ field: 'status', issue: `Payment is ${payment.status}; only a failed refund can be retried.` }],
    });
  }
  return result;
}

/** Refund for a payment the sweep found, by id. */
export const refundPaymentById = (paymentId) => runRefund(paymentId, { from: ['PAID'] });
