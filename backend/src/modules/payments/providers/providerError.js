/**
 * A failure talking to a payment gateway (network, timeout, 5xx, rejected
 * request). Distinct from "the payment is not paid": that is a normal answer,
 * this is the absence of one.
 */
export class ProviderError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    if (cause) this.cause = cause;
  }
}
