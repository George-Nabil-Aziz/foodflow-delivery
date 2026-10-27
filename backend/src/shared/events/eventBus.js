import { EventEmitter } from 'node:events';
import { logger } from '../logger.js';

/**
 * In-process event bus for live updates (spec-14).
 *
 * THE SEAM. Producers (orders, delivery) call `publish` / `publishAfterCommit`
 * and know nothing about who is listening; the stream hub in modules/events
 * calls `subscribe` and knows nothing about who produced. Today delivery is a
 * synchronous in-memory fan-out, which is correct for one Node process.
 *
 * Going multi-process means replacing the body of `publish` with a broker
 * write (Postgres `NOTIFY foodflow_events, <json>` or a Redis PUBLISH) and
 * feeding what each process receives back through `deliverLocal`. Nothing that
 * calls `publish` or `subscribe` changes. The ticket store in modules/events
 * has to move to a shared store at the same time (see its header).
 *
 * Event shape:
 *   { type: 'order.status', audience: { userIds: [...], restaurantIds: [...] },
 *     data: { orderId, status } }
 * `audience` is routing metadata and is stripped before anything is written to
 * a client. `data` is deliberately minimal: ids and a new status, never PII.
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const CHANNEL = 'event';

/** Fan an event out to this process's subscribers. A broker adapter calls this
 *  for every message it receives, including the ones this process published. */
export function deliverLocal(event) {
  try {
    emitter.emit(CHANNEL, event);
  } catch (err) {
    // A broken subscriber must never reach the code that produced the event.
    logger.warn({ err, type: event?.type }, 'event subscriber failed');
  }
}

/** Publishes immediately. Only for callers that are not inside a transaction;
 *  inside one, use `publishAfterCommit`. */
export function publish(event) {
  deliverLocal(event);
}

/**
 * Publishes once `trx` has committed, and never if it rolls back.
 *
 * Without a transaction it publishes at once. `executionPromise` settles when
 * the root transaction ends: resolved on commit, rejected on rollback. Nested
 * helpers that join their caller's transaction therefore publish when the
 * OUTERMOST owner commits, which is the only moment the state is real.
 */
export function publishAfterCommit(trx, event) {
  if (!trx?.executionPromise) return publish(event);
  trx.executionPromise.then(
    () => publish(event),
    () => {}, // Rolled back: the event describes something that did not happen.
  );
}

/** Subscribes to every event. Returns an unsubscribe function. */
export function subscribe(handler) {
  emitter.on(CHANNEL, handler);
  return () => emitter.off(CHANNEL, handler);
}

/** Number of live subscribers (tests). */
export const subscriberCount = () => emitter.listenerCount(CHANNEL);
