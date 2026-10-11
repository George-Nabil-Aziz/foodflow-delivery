import { knex } from '../shared/db/knex.js';
import { config } from '../config/index.js';
import { logger } from '../shared/logger.js';

/**
 * Flags orders that have been waiting for a driver too long, so they surface in
 * the admin backlog. Deliberately does NOT change the order's status: with no
 * driver available the order is left intact and a human is told (FR-7.4).
 */
export async function unassignedEscalationJob() {
  const { rows } = await knex.raw(
    `
    UPDATE orders SET escalated_at = now()
    WHERE dispatch_state = 'UNASSIGNED'
      AND status IN ('CONFIRMED','PREPARING','READY_FOR_PICKUP')
      AND escalated_at IS NULL
      AND confirmed_at < now() - (? || ' minutes')::interval
    RETURNING id
    `,
    [config.unassignedEscalationMinutes],
  );
  if (rows.length) logger.warn({ escalated: rows.length }, 'orders awaiting a driver');
  return { escalated: rows.length };
}
