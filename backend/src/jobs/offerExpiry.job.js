import { withTransaction } from '../shared/db/transaction.js';
import { logger } from '../shared/logger.js';
import * as delivery from '../modules/delivery/index.js';

/** Expires stale offers and frees their orders for the next dispatch tick. */
export async function offerExpiryJob({ limit = 50 } = {}) {
  const expired = await delivery.findExpiredOffers(limit);
  for (const assignment of expired) {
    await withTransaction((trx) => delivery.expireOffer(assignment, trx));
  }
  if (expired.length) logger.info({ expired: expired.length }, 'offer expiry job');
  return { expired: expired.length };
}
