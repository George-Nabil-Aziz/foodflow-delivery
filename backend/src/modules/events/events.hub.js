import { knex } from '../../shared/db/knex.js';
import { logger } from '../../shared/logger.js';
import { subscribe } from '../../shared/events/index.js';

/**
 * The stream hub: the set of open SSE connections and the routing from bus
 * events to them.
 *
 * Scoping lives here and only here. An event names its audience (user ids
 * and/or restaurant ids); a connection receives it only when it IS one of
 * those users or owns one of those restaurants. Both facts about a connection
 * come from the database at connect time, never from anything the client
 * sends, so there is no parameter to tamper with.
 */
export const HEARTBEAT_MS = 25_000;
export const RETRY_MS = 3_000;
export const MAX_CONNECTIONS_PER_USER = 5;
/** A client this far behind is not reading; drop it rather than buffer forever. */
const MAX_BUFFERED_BYTES = 1_000_000;

let nextId = 1;
const byUser = new Map(); // userId -> Set<connection>
let unsubscribe = null;
let timer = null;

/** True when `connection` is one of the audience of `event`. */
export function isAudience(connection, audience = {}) {
  if (audience.userIds?.includes(connection.userId)) return true;
  return Boolean(connection.restaurantId && audience.restaurantIds?.includes(connection.restaurantId));
}

function write(connection, chunk) {
  const { res } = connection;
  if (res.writableEnded || res.destroyed) return false;
  if (res.writableLength > MAX_BUFFERED_BYTES) {
    close(connection);
    return false;
  }
  res.write(chunk);
  return true;
}

/** Wire format of one event. `audience` is routing metadata and never sent. */
export function frame(event) {
  const body = { type: event.type, ...event.data, at: new Date().toISOString() };
  return `event: ${event.type}\ndata: ${JSON.stringify(body)}\n\n`;
}

function dispatch(event) {
  const chunk = frame(event);
  for (const connections of byUser.values()) {
    for (const connection of connections) {
      if (isAudience(connection, event.audience)) write(connection, chunk);
    }
  }
}

/**
 * Registers an open response as a stream for `user` and writes the preamble.
 * Past the per-user cap the OLDEST connection is closed: a stale one left by a
 * crashed tab should not lock the user out of a fresh one.
 */
export function attach(req, res, { user, restaurantId = null }) {
  start();

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    // no-transform: keeps compressing proxies from buffering the stream.
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx and similar reverse proxies buffer responses unless told not to.
    'X-Accel-Buffering': 'no',
  });
  // Long-lived by design: never let the idle socket timeout cut the stream.
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  res.flushHeaders();

  const connection = { id: nextId++, userId: user.id, role: user.role, restaurantId, res };
  let set = byUser.get(user.id);
  if (!set) byUser.set(user.id, (set = new Set()));
  while (set.size >= MAX_CONNECTIONS_PER_USER) close(set.values().next().value);
  set.add(connection);

  res.write(`retry: ${RETRY_MS}\n\n`);
  write(connection, frame({ type: 'ready', data: {} }));

  const cleanup = () => remove(connection);
  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
  return connection;
}

function remove(connection) {
  const set = byUser.get(connection.userId);
  if (!set) return;
  set.delete(connection);
  if (set.size === 0) byUser.delete(connection.userId);
}

/** Ends a connection from the server side. */
export function close(connection) {
  remove(connection);
  if (!connection.res.writableEnded) connection.res.end();
}

/** Closes every stream a user has open (suspension, deletion). */
export function closeUser(userId) {
  for (const connection of [...(byUser.get(userId) ?? [])]) close(connection);
}

/**
 * Keeps idle proxies from timing the stream out, and re-checks accounts.
 *
 * The status re-check is what makes a suspension or deletion end the stream:
 * `authenticate` runs once, at connect, so without this a suspended user would
 * keep receiving events until they happened to disconnect. One query covers
 * every connected user; the cost does not grow with connection count.
 */
export async function heartbeat() {
  for (const set of byUser.values()) {
    for (const connection of set) write(connection, ': ping\n\n');
  }
  const ids = [...byUser.keys()];
  if (ids.length === 0) return;
  try {
    const rows = await knex('users').whereIn('id', ids).select('id', 'status', 'deleted_at');
    const live = new Set(rows.filter((r) => r.status !== 'SUSPENDED' && !r.deleted_at).map((r) => r.id));
    for (const id of ids) if (!live.has(id)) closeUser(id);
  } catch (err) {
    // Fail open for one tick: a database blip should not drop every stream.
    logger.warn({ err }, 'stream account re-check failed');
  }
}

/** Subscribes to the bus and starts the heartbeat. Idempotent. */
export function start() {
  if (unsubscribe) return;
  unsubscribe = subscribe(dispatch);
  timer = setInterval(() => { heartbeat(); }, HEARTBEAT_MS);
  timer.unref();
}

/** Closes every stream and stops timers (graceful shutdown, tests). */
export function stop() {
  for (const set of [...byUser.values()]) for (const connection of [...set]) close(connection);
  if (timer) clearInterval(timer);
  timer = null;
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
}

/** Open connection counts (tests, diagnostics). */
export const connectionCount = (userId) =>
  userId ? (byUser.get(userId)?.size ?? 0) : [...byUser.values()].reduce((n, s) => n + s.size, 0);
