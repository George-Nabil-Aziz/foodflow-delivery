import { knex } from './knex.js';

/**
 * Runs `fn` in a transaction. When an existing transaction is passed it is
 * reused rather than nested, so a cross-module call joins the caller's
 * transaction instead of deadlocking against its row locks.
 *
 * Rule: the module that starts the transaction owns the commit.
 */
export function withTransaction(fn, trx) {
  if (trx) return fn(trx);
  return knex.transaction(fn);
}
