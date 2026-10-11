import { knex } from '../shared/db/knex.js';
import { logger } from '../shared/logger.js';

/**
 * Runs `fn` only if this process wins a PostgreSQL advisory lock.
 *
 * In-process jobs are a documented trade (ADR-003): no queue, no Redis. The
 * lock is what makes the design still correct with multiple replicas - a second
 * replica skips the tick rather than duplicating it.
 */
export async function runLocked(jobName, fn) {
  const lockId = hashName(jobName);
  const conn = await knex.client.acquireConnection();
  try {
    const { rows } = await conn.query('SELECT pg_try_advisory_lock($1) AS locked', [lockId]);
    if (!rows[0].locked) return { skipped: true };
    try {
      const result = await fn();
      return { skipped: false, result };
    } finally {
      await conn.query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
  } catch (err) {
    logger.error({ err, jobName }, 'job failed');
    return { skipped: false, error: err };
  } finally {
    await knex.client.releaseConnection(conn);
  }
}

function hashName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return hash;
}
