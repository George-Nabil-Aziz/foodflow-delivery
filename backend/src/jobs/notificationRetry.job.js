import { logger } from '../shared/logger.js';
import { retryFailed } from '../shared/notifications.js';

/**
 * Resends notifications whose delivery failed, with exponential backoff and an
 * attempt cap (NOTIFY_MAX_ATTEMPTS). Each row is claimed atomically, so a
 * retry can never send the same message twice.
 */
export async function notificationRetryJob({ limit = 50 } = {}) {
  const result = await retryFailed({ limit });
  if (result.considered) logger.info(result, 'notification retry job');
  return result;
}
