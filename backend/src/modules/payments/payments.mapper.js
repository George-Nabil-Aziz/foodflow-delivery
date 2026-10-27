/** The customer pays while INITIATED or after a FAILED attempt; only then do they need the key. */
const PAYABLE = ['INITIATED', 'FAILED'];

/**
 * Customer view. Amount and `publishableKey` are what the gateway form needs;
 * the amount is the server's, never an input. Converting to the gateway's
 * minor unit is the payment-form component's job (provider-specific).
 */
export function toCustomerPaymentDto(row, { publishableKey } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    refundedAmount: row.refunded_amount,
    failureMessage: row.failure_message,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
    publishableKey: PAYABLE.includes(row.status) ? publishableKey ?? null : null,
  };
}

/** Admin view: adds the gateway reference and the refund failure to act on. */
export function toAdminPaymentDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    refundedAmount: row.refunded_amount,
    failureMessage: row.failure_message,
    refundError: row.refund_error,
    refundAttempts: row.refund_attempts,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
    createdAt: row.created_at,
  };
}
