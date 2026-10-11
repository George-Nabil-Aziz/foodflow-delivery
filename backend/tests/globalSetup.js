import knexFactory from 'knex';
import { config } from '../src/config/index.js';

/**
 * Runs once for the whole suite, in its own connection.
 *
 * Migrations must not run per file: with a shared worker the second file would
 * race the first. Likewise the application's connection pool is never destroyed
 * by an individual test file - doing so killed the worker mid-run, which is the
 * kind of intermittent failure that trains people to ignore red.
 */
export async function setup() {
  const db = knexFactory({ client: 'pg', connection: config.databaseUrl, pool: { min: 1, max: 2 } });
  try {
    await db.migrate.latest();
  } finally {
    await db.destroy();
  }
}

export async function teardown() {
  // Nothing to do: the worker process owns the application pool and releases
  // its sockets on exit.
}
