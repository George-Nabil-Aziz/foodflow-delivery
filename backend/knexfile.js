import { config } from './src/config/index.js';

const base = {
  client: 'pg',
  migrations: { directory: './migrations', extension: 'js', loadExtensions: ['.js'] },
  seeds: { directory: './seeds', loadExtensions: ['.js'] },
  pool: { min: 1, max: 10 },
};

export default {
  development: { ...base, connection: config.databaseUrl },
  test: { ...base, connection: config.databaseUrl, pool: { min: 1, max: 5 } },
  production: { ...base, connection: config.databaseUrl, pool: { min: 2, max: 20 } },
};
