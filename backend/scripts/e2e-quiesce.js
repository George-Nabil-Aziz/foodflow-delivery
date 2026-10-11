/* eslint-disable no-console */
/**
 * Puts the end-to-end database into a quiet starting state.
 *
 * Dispatch is a global background process: it offers a ready order to whichever
 * approved driver is AVAILABLE and nearest. The development seed leaves two
 * drivers online, so an offer a scenario is waiting for goes to a seeded driver
 * instead of the one the scenario created — the test then fails for a reason
 * that has nothing to do with the behaviour under test.
 *
 * Taking every driver offline makes driver availability something each scenario
 * turns on deliberately, which is also what the scenarios describe.
 *
 *   node --env-file=.env.e2e scripts/e2e-quiesce.js
 */
import { knex } from '../src/shared/db/knex.js';

const offline = await knex('driver_profiles')
  .whereNot({ availability: 'OFFLINE' })
  .update({ availability: 'OFFLINE' });

// Retire offers left open by the seed, so no scenario inherits one.
const expired = await knex('delivery_assignments')
  .whereIn('status', ['OFFERED'])
  .update({ status: 'EXPIRED' });

/*
 * Park the seeded in-flight orders so they stop competing for dispatch.
 *
 * They exist to give the admin and restaurant screens something to render, not
 * to be delivered. Left UNASSIGNED they are older than anything a scenario
 * creates, so dispatch offers them first and a scenario waiting for its own
 * order is handed someone else's.
 */
const parked = await knex('orders')
  .where('order_number', 'like', 'FF-%SEED%')
  .where({ dispatch_state: 'UNASSIGNED' })
  .update({ dispatch_state: 'NOT_REQUIRED' });

console.log(
  `e2e quiesce: ${offline} driver(s) offline, ${expired} stale offer(s) expired, ` +
  `${parked} seeded order(s) parked`,
);
await knex.destroy();
