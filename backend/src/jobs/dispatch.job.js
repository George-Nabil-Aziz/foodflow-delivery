import { withTransaction } from '../shared/db/transaction.js';
import { logger } from '../shared/logger.js';
import * as delivery from '../modules/delivery/index.js';

/**
 * Offers waiting orders to the nearest available driver.
 *
 * Idempotent and stateless: it re-derives everything from the database, so a
 * missed tick is caught up by the next one and a restart loses nothing.
 */
export async function dispatchJob({ limit = 20 } = {}) {
  const orders = await delivery.findOrdersNeedingDispatch(limit);
  let offered = 0;
  for (const order of orders) {
    const made = await withTransaction((trx) => delivery.dispatchOrder(order, trx));
    if (made) offered += 1;
  }
  if (offered) logger.info({ offered, considered: orders.length }, 'dispatch job');
  return { considered: orders.length, offered };
}
