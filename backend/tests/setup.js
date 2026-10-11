import { config } from '../src/config/index.js';

/**
 * The single most important safeguard in the suite.
 *
 * Integration tests TRUNCATE every table between cases. This check stands
 * between a misconfigured .env and real data: the run aborts unless the target
 * database name ends in _test.
 */
if (config.env !== 'test') {
  throw new Error(`Tests must run with NODE_ENV=test (got "${config.env}")`);
}

const dbName = (() => {
  try {
    return new URL(config.databaseUrl).pathname.replace(/^\//, '');
  } catch {
    return config.databaseUrl;
  }
})();

if (!dbName.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests against "${dbName}": the database name must end in _test. ` +
      'Set TEST_DATABASE_URL in backend/.env.',
  );
}
