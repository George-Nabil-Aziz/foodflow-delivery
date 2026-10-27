import crypto from 'node:crypto';
import { config } from '../../../config/index.js';
import { ProviderError } from './providerError.js';

/**
 * Moyasar adapter (https://docs.moyasar.com). Implements the provider
 * interface documented in `providers/index.js`.
 *
 * The browser creates the payment with the publishable key; this adapter only
 * ever READS a payment back and REFUNDS one, both with the secret key, which
 * never leaves the server. Moyasar counts in minor units (1/100 of the
 * currency); the conversion lives here, the rest of the app uses decimal strings.
 */
const TIMEOUT_MS = 10_000;

const STATUS_MAP = {
  paid: 'paid',
  captured: 'paid',
  failed: 'failed',
  voided: 'failed',
  refunded: 'refunded',
};

const toMinor = (amount) => Math.round(Number(amount) * 100);
const fromMinor = (minor) => (Number(minor) / 100).toFixed(2);

/** Moyasar answers every call with the payment object; reduce it to what we use. */
function normalize(body) {
  return {
    id: body.id,
    status: STATUS_MAP[body.status] ?? 'pending',
    amount: fromMinor(body.amount),
    currency: String(body.currency ?? '').toUpperCase(),
    refundedAmount: fromMinor(body.refunded ?? 0),
    // The payment reference the browser form was given as metadata.
    reference: body.metadata?.payment_ref ?? null,
    metadata: body.metadata ?? {},
    message: body.source?.message ?? null,
  };
}

async function call(method, path, body) {
  const { secretKey, apiUrl } = config.payments;
  let res;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        // Basic auth: the secret key is the username, the password is empty.
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ProviderError('Moyasar is unreachable.', { cause: err });
  }
  let json = null;
  try { json = await res.json(); } catch { /* an empty or non-JSON body */ }
  return { res, json };
}

export const moyasarProvider = {
  name: 'moyasar',

  get publishableKey() { return config.payments.publishableKey; },

  /** Returns the normalized payment, or null when Moyasar has no such payment. */
  async fetchPayment(providerPaymentId) {
    const { res, json } = await call('GET', `/payments/${encodeURIComponent(providerPaymentId)}`);
    if (res.status === 404) return null;
    if (!res.ok || !json) throw new ProviderError(`Moyasar answered ${res.status}.`, { status: res.status });
    return normalize(json);
  },

  /** Refund of `amount` (decimal string). Throws ProviderError unless Moyasar confirms it. */
  async refund(providerPaymentId, amount) {
    const { res, json } = await call(
      'POST', `/payments/${encodeURIComponent(providerPaymentId)}/refund`, { amount: toMinor(amount) },
    );
    if (!res.ok || !json) {
      throw new ProviderError(json?.message ?? `Moyasar answered ${res.status}.`, { status: res.status });
    }
    const payment = normalize(json);
    if (payment.status !== 'refunded') throw new ProviderError(`Payment is ${json.status}, not refunded.`);
    return payment;
  },
  /**
   * Webhook authentication. Moyasar echoes the secret token configured on the
   * webhook in the body; compared in constant time. False when no secret is set.
   */
  verifyWebhook(body) {
    const expected = config.payments.webhookSecret;
    if (!expected) return false;
    const digest = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
    return crypto.timingSafeEqual(digest(body?.secret_token), digest(expected));
  },

  /** The gateway payment id a webhook payload points at, or null. */
  webhookPaymentId(body) {
    return typeof body?.data?.id === 'string' ? body.data.id : null;
  },
};
