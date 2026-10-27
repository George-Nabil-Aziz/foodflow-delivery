import { config } from '../../../config/index.js';
import { moyasarProvider } from './moyasar.provider.js';
import { fakeProvider } from './fake.provider.js';

/**
 * The provider interface. A gateway adapter exposes:
 *
 *   name: string                        stored on the payment row
 *   publishableKey: string              safe to send to the browser
 *   fetchPayment(id) -> Promise<{       what the gateway says about a payment,
 *     id, status: 'paid'|'failed'|'pending'|'refunded',   or null if unknown
 *     amount: string (decimal, e.g. "164.76"), currency: string,
 *     refundedAmount: string, message: string|null,
 *     reference: string|null } | null>   our payment id, as the form was told to attach it
 *   refund(id, amount: decimal string) -> Promise<{ id, status: 'refunded', refundedAmount }>
 *                                       throws ProviderError on any failure
 *   verifyWebhook(body) -> boolean      authenticates a webhook call
 *   webhookPaymentId(body) -> string|null
 *
 * Amounts cross this interface as decimal strings in the configured currency
 * (PAYMENT_CURRENCY); each adapter converts to its gateway's minor unit, so
 * adding another gateway (e.g. Paymob) means one new adapter and a branch here.
 *
 * Everything the app trusts about a payment comes from `fetchPayment`, never
 * from the browser.
 */
export function getProvider() {
  return config.payments.provider === 'moyasar' ? moyasarProvider : fakeProvider;
}

export { ProviderError } from './providerError.js';
export { fakeControls } from './fake.provider.js';
