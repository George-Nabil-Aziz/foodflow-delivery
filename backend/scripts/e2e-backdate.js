/* eslint-disable no-console */
/**
 * Back-dates an order's timestamps, so a scenario can reach a time-window rule
 * without waiting for real time to pass.
 *
 * Several rules key off elapsed time — the unassigned-escalation backlog at 15
 * minutes, the accept timeout at 10. A test cannot wait that long and must not
 * lower the thresholds to a few seconds, because then it is no longer testing
 * the configured rule. Moving the fixture's clock backwards is the same
 * technique the integration suite uses, and it leaves the rule itself alone.
 *
 *   node --env-file=.env.e2e scripts/e2e-backdate.js FF-20260927-ABC123 20
 */
import { knex } from '../src/shared/db/knex.js';

const [orderNumber, minutesArg] = process.argv.slice(2);
if (!orderNumber) throw new Error('usage: e2e-backdate.js <orderNumber> [minutes]');

const minutes = Number(minutesArg ?? 20);
const shift = knex.raw(`? - (? || ' minutes')::interval`, [knex.fn.now(), minutes]);

const updated = await knex('orders')
  .where({ order_number: orderNumber })
  .update({ placed_at: shift, confirmed_at: shift });

if (updated === 0) throw new Error(`no order named ${orderNumber}`);
console.log(`e2e backdate: ${orderNumber} moved back ${minutes} minute(s)`);
await knex.destroy();
