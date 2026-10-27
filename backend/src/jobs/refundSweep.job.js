import { knex } from '../shared/db/knex.js';
import { logger } from '../shared/logger.js';
import * as payments from '../modules/payments/index.js';

/**
 * Safety net for the post-commit refund (spec-11 BR-P5). The refund runs right
 * after a cancellation commits; if the process died in between, or a payment
 * landed on an already-cancelled order, this finds the PAID payment of a
 * CANCELLED order - and any refund abandoned mid-flight - and finishes it.
 *
 * FAILED refunds are deliberately not retried here: they wait for an admin,
 * who can see why and decide (BR-P6).
 */
export async function refundSweepJob({ limit = 25 } = {}) {
  const { rows } = await knex.raw(
    `
    SELECT p.id FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE o.status = 'CANCELLED'
      AND (p.status = 'PAID'
           OR (p.status = 'REFUNDING' AND p.refund_started_at < now() - interval '5 minutes'))
    ORDER BY p.updated_at ASC LIMIT ?
    `,
    [limit],
  );

  let refunded = 0;
  for (const row of rows) {
    try {
      const result = await payments.refundPaymentById(row.id);
      if (result?.outcome === 'REFUNDED') refunded += 1;
    } catch (err) {
      logger.error({ err, paymentId: row.id }, 'refund sweep failed');
    }
  }
  if (rows.length) logger.info({ considered: rows.length, refunded }, 'refund sweep job');
  return { considered: rows.length, refunded };
}
