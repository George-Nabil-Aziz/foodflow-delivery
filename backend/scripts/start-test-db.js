/**
 * Starts a real PostgreSQL instance, for development and for the test suites.
 *
 * The design deliberately pushes correctness into partial unique indexes, check
 * constraints and SELECT ... FOR UPDATE. A mocked database would return
 * whatever the test author expected and would pass while the real invariant was
 * broken, so everything runs against genuine PostgreSQL.
 *
 * Preferred path is `docker compose up -d`. This script is the fallback for
 * machines without Docker: `embedded-postgres` ships the real PostgreSQL
 * binaries, and this runs them from a local data directory.
 *
 * The server is started through `pg_ctl`, which daemonises it, rather than
 * through the library's own `start()`. The library keeps the server as a child
 * of this process, so the `process.exit(0)` below would take the database down
 * with it the moment the script reported success — leaving you with a cheerful
 * "PostgreSQL running on port 5433" and nothing listening on it.
 *
 *   node scripts/start-test-db.js start
 *   node scripts/start-test-db.js status
 *   node scripts/start-test-db.js stop
 */
/* eslint-disable no-console */
import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../.pgdata');
const logFile = path.join(dataDir, 'postgres.log');
const PORT = Number(process.env.TEST_PG_PORT ?? 5433);
const USER = 'foodflow';
const PASSWORD = 'foodflow';

/**
 * Resolves the pg_ctl that ships with embedded-postgres for this platform.
 *
 * The platform packages do not export `./package.json`, so `require.resolve`
 * on it fails. Walking up from this file to each candidate `node_modules`
 * works in a workspace, where the dependency is hoisted to the repo root
 * rather than installed under `backend/`.
 */
function binary(name) {
  const pkg = `@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${
    process.arch === 'arm64' ? 'arm64v8' : 'x64'
  }`;
  const exe = process.platform === 'win32' ? `${name}.exe` : name;

  let dir = here;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', pkg, 'native', 'bin', exe);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `could not find ${exe} from ${pkg}. Run \`npm install\` at the repository root.`,
  );
}

/*
 * stdio is ignored rather than piped: the daemonised server inherits the
 * handles, so a pipe would never see EOF and execFileSync would block forever
 * on a database that had in fact started. Server output goes to the log file
 * passed with -l instead.
 */
const pgCtl = (...args) =>
  execFileSync(binary('pg_ctl'), ['-D', dataDir, ...args], { stdio: 'ignore' });

/*
 * Starts the server outside this terminal, with no window of its own.
 *
 * On Windows, Ctrl+C is delivered to every process attached to the console.
 * A server started with a plain pg_ctl call stays attached, so pressing
 * Ctrl+C to stop `npm run dev` in the same terminal killed the database too
 * (it exits with 0xC000013A, STATUS_CONTROL_C_EXIT) and the next start of the
 * backend found nothing to connect to.
 *
 * The obvious fix, a `detached` spawn, gives pg_ctl no console at all - and
 * Windows then opens a fresh, visible console window for the server pg_ctl
 * launches. So on Windows pg_ctl is started through Start-Process with a
 * hidden window instead: the server gets a console of its own that nobody
 * can see or type Ctrl+C into, and only `npm run db:local:stop` stops it.
 * Elsewhere a detached spawn already does exactly that.
 */
const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);

const startDetached = (...args) =>
  new Promise((resolve, reject) => {
    const pgArgs = ['-D', dataDir, ...args];
    const child = process.platform === 'win32'
      ? spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        // Paths travel in environment variables, so nothing in them is ever
        // parsed as PowerShell.
        // WaitForExit(), not -Wait: in Windows PowerShell -Wait also waits for
        // every process pg_ctl starts, and the server never exits.
        '$p = Start-Process -FilePath $env:FF_PG_CTL -ArgumentList $env:FF_PG_ARGS'
          + ' -WindowStyle Hidden -PassThru; $p.WaitForExit(); exit $p.ExitCode',
      ], {
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, FF_PG_CTL: binary('pg_ctl'), FF_PG_ARGS: pgArgs.map(quote).join(' ') },
      })
      : spawn(binary('pg_ctl'), pgArgs, { detached: true, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pg_ctl exited with ${code}. See ${logFile}`))));
  });

const listening = () =>
  new Promise((resolve) => {
    const socket = net.connect(PORT, '127.0.0.1');
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
  });

async function waitUntilListening(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await listening()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const DATABASES = ['foodflow', 'foodflow_test', 'foodflow_e2e'];

// Always UTF-8: the app takes Arabic names, addresses and reviews. template0
// is required to choose an encoding other than template1's.
const createDatabase = (client, db) =>
  client.query(`CREATE DATABASE ${db} OWNER ${USER} ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);

/**
 * Creates any missing database, and reports - never silently drops - one that
 * is not UTF-8. Clusters made before this script fixed the encoding are
 * WIN1252 on Windows; `recreate` rebuilds them.
 */
async function ensureDatabases(client) {
  for (const db of DATABASES) {
    const { rows } = await client.query(
      'SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = $1', [db],
    );
    if (rows.length === 0) {
      await createDatabase(client, db);
      console.log(`  created database ${db} (UTF8)`);
    } else if (rows[0].encoding !== 'UTF8') {
      console.warn(`  WARNING: database ${db} is ${rows[0].encoding}, so it cannot store Arabic text.`);
      console.warn('  Rebuild the local databases with: npm run db:local:recreate  (this deletes their data)');
    }
  }
}

const command = process.argv[2] ?? 'start';

if (command === 'status') {
  const up = await listening();
  console.log(up ? `PostgreSQL is listening on port ${PORT}` : `Nothing is listening on port ${PORT}`);
  process.exit(up ? 0 : 1);
}

if (command === 'start') {
  if (await listening()) {
    console.log(`PostgreSQL is already listening on port ${PORT}; nothing to start.`);
    const running = new pg.Client({
      host: '127.0.0.1', port: PORT, user: USER, password: PASSWORD, database: 'postgres',
    });
    await running.connect();
    await ensureDatabases(running);
    await running.end();
    process.exit(0);
  }

  // First run only: lay down the cluster. The library does this well, and it
  // exits on its own rather than leaving a server behind.
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('Initialising the PostgreSQL cluster (first run only)...');
    await new EmbeddedPostgres({
      databaseDir: dataDir, user: USER, password: PASSWORD, port: PORT, persistent: true,
      // UTF-8 regardless of the machine's locale. On Windows initdb otherwise
      // picks WIN1252, which cannot store a single Arabic character.
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
    }).initialise();
  }

  console.log(`Starting PostgreSQL on port ${PORT}...`);
  // -w waits for readiness; -o passes the port through to the server itself.
  await startDetached('-l', logFile, '-o', `-p ${PORT}`, '-w', 'start');

  if (!(await waitUntilListening())) {
    console.error(`PostgreSQL did not start. See ${logFile}`);
    process.exit(1);
  }

  const client = new pg.Client({
    host: '127.0.0.1', port: PORT, user: USER, password: PASSWORD, database: 'postgres',
  });
  await client.connect();
  await ensureDatabases(client);
  await client.end();

  console.log(`PostgreSQL is running on port ${PORT} and will stay up after this script exits.`);
  console.log(`  DATABASE_URL=postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/foodflow`);
  console.log(`  TEST_DATABASE_URL=postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/foodflow_test`);
  console.log(`  stop it with: npm run db:local:stop`);
  process.exit(0);
}

if (command === 'stop') {
  if (!(await listening())) {
    console.log(`Nothing is listening on port ${PORT}.`);
    process.exit(0);
  }
  pgCtl('-w', '-m', 'fast', 'stop');
  console.log('PostgreSQL stopped.');
  process.exit(0);
}

if (command === 'recreate') {
  if (!(await listening())) {
    console.error(`Nothing is listening on port ${PORT}. Run npm run db:local first.`);
    process.exit(1);
  }
  const client = new pg.Client({
    host: '127.0.0.1', port: PORT, user: USER, password: PASSWORD, database: 'postgres',
  });
  await client.connect();
  for (const db of DATABASES) {
    // FORCE closes the connections a running backend still holds.
    await client.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await createDatabase(client, db);
    console.log(`  recreated database ${db} (UTF8)`);
  }
  await client.end();
  console.log('Done. The databases are empty: run npm run migrate, then npm run seed.');
  process.exit(0);
}

console.error(`Unknown command "${command}". Use start, status, stop or recreate.`);
process.exit(1);
