import { knex } from '../../shared/db/knex.js';

const db = (trx) => trx ?? knex;

export async function insert(data, trx) {
  const [row] = await db(trx)('payments').insert(data).returning('*');
  return row;
}

export const findById = (id, trx) => db(trx)('payments').where({ id }).first();

export const findByOrderId = (orderId, trx) => db(trx)('payments').where({ order_id: orderId }).first();

export const findByProviderPaymentId = (provider, providerPaymentId, trx) =>
  db(trx)('payments').where({ provider, provider_payment_id: providerPaymentId }).first();

/**
 * Moves INITIATED/FAILED -> PAID. The status predicate makes it a
 * compare-and-set: when the confirm call and the webhook race, exactly one
 * gets a row back and the other sees a payment that is already settled.
 */
export async function markPaid(id, providerPaymentId, metadataPatch, trx) {
  const [row] = await db(trx)('payments')
    .where({ id })
    .whereIn('status', ['INITIATED', 'FAILED'])
    .update({
      status: 'PAID',
      provider_payment_id: providerPaymentId,
      paid_at: knex.fn.now(),
      failure_message: null,
      metadata: knex.raw('metadata || ?::jsonb', [JSON.stringify(metadataPatch)]),
    })
    .returning('*');
  return row;
}

export async function markFailed(id, message, metadataPatch, trx) {
  const [row] = await db(trx)('payments')
    .where({ id, status: 'INITIATED' })
    .update({
      status: 'FAILED',
      failure_message: message,
      metadata: knex.raw('metadata || ?::jsonb', [JSON.stringify(metadataPatch)]),
    })
    .returning('*');
  return row;
}

const STALE_REFUNDING = "refund_started_at < now() - interval '5 minutes'";

/**
 * Claims a payment for refunding: PAID (or a given set of statuses) ->
 * REFUNDING. A REFUNDING row whose attempt started over five minutes ago is
 * treated as abandoned by a crashed process and may be claimed again; the
 * refund itself re-checks the gateway before spending money twice.
 */
export async function claimForRefund(id, from, trx) {
  const [row] = await db(trx)('payments')
    .where({ id })
    .where((b) => b.whereIn('status', from).orWhere((s) => s.where('status', 'REFUNDING').whereRaw(STALE_REFUNDING)))
    .update({
      status: 'REFUNDING',
      refund_started_at: knex.fn.now(),
      refund_attempts: knex.raw('refund_attempts + 1'),
    })
    .returning('*');
  return row;
}

export async function recordRefund(id, { refunded, error, metadataPatch }, trx) {
  const [row] = await db(trx)('payments')
    .where({ id })
    .update(
      refunded
        ? {
          status: 'REFUNDED',
          refunded_amount: knex.raw('amount'),
          refunded_at: knex.fn.now(),
          refund_error: null,
          metadata: knex.raw('metadata || ?::jsonb', [JSON.stringify(metadataPatch ?? {})]),
        }
        : {
          status: 'REFUND_FAILED',
          refund_error: String(error ?? 'Refund failed.').slice(0, 300),
          metadata: knex.raw('metadata || ?::jsonb', [JSON.stringify(metadataPatch ?? {})]),
        },
    )
    .returning('*');
  return row;
}
