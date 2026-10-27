import { knex } from '../shared/db/knex.js';
import { config } from '../config/index.js';
import { logger } from '../shared/logger.js';
import * as orders from '../modules/orders/index.js';

/**
 * Cancels card orders whose payment never completed (SYSTEM actor, reason
 * PAYMENT_TIMEOUT). The restaurant never saw these orders, so nothing has been
 * promised to anyone. A payment that completes after this lands on a CANCELLED
 * order and is refunded (spec-11 BR-P7).
 */
export async function paymentTimeoutJob({ limit = 50 } = {}) {
  const { rows } = await knex.raw(
    `
    SELECT o.id FROM orders o
    JOIN payments p ON p.order_id = o.id
    WHERE o.status = 'PENDING' AND o.payment_method = 'CARD'
      AND p.status IN ('INITIATED','FAILED')
      AND p.created_at < now() - (? || ' minutes')::interval
    ORDER BY p.created_at ASC LIMIT ?
    `,
    [config.payments.timeoutMinutes, limit],
  );

  let cancelled = 0;
  for (const row of rows) {
    const done = await orders.systemCancelStale(row.id, {
      reason: 'PAYMENT_TIMEOUT',
      note: 'Automatically cancelled: the card payment was not completed in time.',
    });
    if (done) cancelled += 1;
  }
  if (cancelled) logger.info({ cancelled }, 'payment timeout job');
  return { considered: rows.length, cancelled };
}
