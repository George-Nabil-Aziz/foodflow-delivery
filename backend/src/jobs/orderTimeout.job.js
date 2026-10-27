import { knex } from '../shared/db/knex.js';
import { config } from '../config/index.js';
import { logger } from '../shared/logger.js';
import * as orders from '../modules/orders/index.js';

/**
 * Cancels PENDING orders the restaurant never answered (T2, SYSTEM actor).
 *
 * This is the only automatic cancellation in the system. Note the contrast with
 * dispatch: a missing driver never cancels an order, because the food is cooked
 * and the customer cannot influence driver supply. An unanswered order is
 * different - nothing has been made yet.
 */
export async function orderTimeoutJob({ limit = 50 } = {}) {
  // A card order's clock starts when it is paid, not when it was placed, and
  // an unpaid one is not the restaurant's to answer at all (paymentTimeoutJob
  // deals with it).
  const { rows } = await knex.raw(
    `
    SELECT o.id FROM orders o
    LEFT JOIN payments p ON p.order_id = o.id
    WHERE o.status = 'PENDING'
      AND CASE
            WHEN o.payment_method = 'CARD'
              THEN p.status = 'PAID' AND p.paid_at < now() - (? || ' minutes')::interval
            ELSE o.placed_at < now() - (? || ' minutes')::interval
          END
    ORDER BY o.placed_at ASC LIMIT ?
    `,
    [config.orderAcceptTimeoutMinutes, config.orderAcceptTimeoutMinutes, limit],
  );

  let cancelled = 0;
  for (const row of rows) {
    if (await orders.systemCancelStale(row.id)) cancelled += 1;
  }
  if (cancelled) logger.info({ cancelled }, 'order timeout job');
  return { considered: rows.length, cancelled };
}
