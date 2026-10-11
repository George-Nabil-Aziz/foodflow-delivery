import knexFactory from 'knex';
import pg from 'pg';
import { config } from '../../config/index.js';

// ADR-009: NUMERIC must arrive as a string, never a JS float.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => v);
// BIGINT (window counts) also arrives as a string; convert deliberately.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => v);

export const knex = knexFactory({
  client: 'pg',
  connection: config.databaseUrl,
  pool: { min: 1, max: config.isTest ? 5 : 10 },
  acquireConnectionTimeout: 10000,
});

export async function checkDatabase() {
  try {
    await knex.raw('select 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase() {
  await knex.destroy();
}
