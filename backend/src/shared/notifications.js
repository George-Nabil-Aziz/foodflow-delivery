import { knex } from './db/knex.js';
import { logger } from './logger.js';

/**
 * Notification transport stub (documented non-goal).
 *
 * The interface is the real one; only the transport is a stub. Swapping in a
 * provider means replacing the body of this function, not changing callers.
 */
export async function notify({ userId = null, channel = 'IN_APP', template, payload = {} }) {
  try {
    await knex('notifications').insert({
      user_id: userId,
      channel,
      template,
      payload: JSON.stringify(payload),
    });
    logger.info({ template, userId, payload }, 'notification');
  } catch (err) {
    // A notification failure must never break the operation that triggered it.
    logger.warn({ err, template }, 'notification failed');
  }
}
