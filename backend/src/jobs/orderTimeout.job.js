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
  const { rows } = await knex.raw(
    `
    SELECT id FROM orders
    WHERE status = 'PENDING' AND placed_at < now() - (? || ' minutes')::interval
    ORDER BY placed_at ASC LIMIT ?
    `,
    [config.orderAcceptTimeoutMinutes, limit],
  );

  let cancelled = 0;
  for (const row of rows) {
    if (await orders.systemCancelStale(row.id)) cancelled += 1;
  }
  if (cancelled) logger.info({ cancelled }, 'order timeout job');
  return { considered: rows.length, cancelled };
}
