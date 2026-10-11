import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../backend');
const knexCli = path.resolve(here, '../../node_modules/knex/bin/cli.js');

/**
 * Resets the end-to-end database to the seeded baseline before the run.
 *
 * The scenarios assert on things like a restaurant's rating average and the
 * contents of an admin queue, which drift as earlier scenarios write to them.
 * Re-seeding once per run makes the suite repeatable without making each test
 * responsible for undoing itself.
 */
export default async function globalSetup() {
  const run = (args) =>
    execFileSync(process.execPath, ['--env-file=.env.e2e', knexCli, ...args], {
      cwd: backendDir,
      stdio: 'pipe',
      encoding: 'utf8',
    });

  run(['migrate:latest']);
  run(['seed:run']);

  // Seeded drivers start AVAILABLE, and dispatch is global: a seeded driver
  // would claim the offer a scenario is waiting for. Each scenario brings its
  // own driver online instead.
  execFileSync(process.execPath, ['--env-file=.env.e2e', 'scripts/e2e-quiesce.js'], {
    cwd: backendDir,
    stdio: 'pipe',
    encoding: 'utf8',
  });
}
