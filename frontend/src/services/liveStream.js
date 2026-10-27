import { ref } from 'vue';
import { http } from './http.js';

/**
 * The one server-sent-events stream of this tab (spec-14).
 *
 * However many views listen, there is a single `EventSource`: views call
 * `subscribeStream`, and the connection opens with the first subscriber and
 * closes shortly after the last one leaves.
 *
 * Authentication: `EventSource` cannot send an Authorization header, so the
 * access token never goes near the URL. The tab asks for a single-use,
 * 30-second ticket with an ordinary authenticated POST (which also gives it the
 * normal expired-token refresh for free, through the shared axios client) and
 * puts only that ticket in the stream URL. A ticket that leaks into a log is
 * already dead. Because a ticket is single-use, the browser's own automatic
 * reconnect cannot work (it would replay a spent ticket), so reconnection is
 * done here: close, back off, fetch a fresh ticket, open again.
 *
 * Failure handling: `streamStatus` is 'open' only while events are flowing.
 * Anything else means the consumer (useLiveUpdates) should be polling instead.
 * After FAILURES_BEFORE_FALLBACK consecutive failures the status is 'failed'
 * (polling is then the sole source of truth), but reconnection keeps trying
 * with capped backoff, so polling hands back to the stream when it recovers.
 * An auth refusal (401/403) is final: retrying cannot fix it.
 */
export const streamStatus = ref('idle'); // idle | connecting | open | paused | failed

/** Event names the server can send; each needs its own listener on EventSource. */
export const STREAM_EVENT_TYPES = [
  'order.created', 'order.status', 'order.updated',
  'offer.created', 'offer.expired', 'offer.taken', 'offer.withdrawn',
];

export const FAILURES_BEFORE_FALLBACK = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
/** Lets a view swap for another (route change) without tearing the stream down. */
const CLOSE_GRACE_MS = 2000;

const apiBase = () => import.meta.env.VITE_API_URL ?? '/api';
const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

const subscribers = new Set(); // { types: Set | null, handler }
let source = null;
let retryTimer = null;
let closeTimer = null;
let failures = 0;
let generation = 0; // invalidates an in-flight ticket request after close/hide
let fatal = false;
let listeningVisibility = false;

function clearTimers() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function closeSource() {
  generation += 1;
  clearTimers();
  if (source) {
    source.close();
    source = null;
  }
}

function emit(event) {
  for (const sub of [...subscribers]) {
    if (event.type === 'resync' || !sub.types || sub.types.has(event.type)) {
      try {
        sub.handler(event);
      } catch {
        // One broken listener must not starve the others.
      }
    }
  }
}

function fail(err) {
  source = null;
  failures += 1;
  if (err && (err.status === 401 || err.status === 403)) fatal = true;
  streamStatus.value = fatal || failures >= FAILURES_BEFORE_FALLBACK ? 'failed' : 'connecting';
  if (fatal || subscribers.size === 0) return;
  const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (failures - 1));
  // Jitter, so a server restart does not bring every client back in the same instant.
  retryTimer = setTimeout(connect, delay * (0.5 + Math.random() / 2));
}

async function connect() {
  clearTimers();
  if (source || fatal || subscribers.size === 0 || isHidden()) return;
  if (typeof EventSource === 'undefined') {
    fatal = true;
    streamStatus.value = 'failed';
    return;
  }
  if (streamStatus.value !== 'failed') streamStatus.value = 'connecting';

  const mine = ++generation;
  let ticket;
  try {
    ticket = (await http.post('/events/ticket')).data.ticket;
  } catch (err) {
    if (mine === generation) fail(err);
    return;
  }
  if (mine !== generation) return; // hidden or unsubscribed while we waited

  const es = new EventSource(`${apiBase()}/events?ticket=${encodeURIComponent(ticket)}`);
  source = es;

  es.addEventListener('ready', () => {
    failures = 0;
    streamStatus.value = 'open';
    // Anything that happened while we were not connected was missed: have
    // listeners refetch once instead of trusting what they last saw.
    emit({ type: 'resync' });
  });
  for (const type of STREAM_EVENT_TYPES) {
    es.addEventListener(type, (message) => {
      try {
        emit(JSON.parse(message.data));
      } catch {
        // A malformed frame is dropped; the next event or resync repairs it.
      }
    });
  }
  es.onerror = () => {
    es.close();
    if (source === es) fail();
  };
}

function onVisibilityChange() {
  if (isHidden()) {
    // Same rule as polling: no work for a tab nobody is looking at.
    closeSource();
    if (!fatal) streamStatus.value = 'paused';
  } else {
    connect();
  }
}

function shutdown() {
  closeSource();
  if (listeningVisibility && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }
  listeningVisibility = false;
  streamStatus.value = 'idle';
}

/**
 * Listens for stream events. `types` is an array of event names, or null for
 * all. The handler also receives `{ type: 'resync' }` whenever the stream
 * (re)connects. Returns an unsubscribe function.
 */
export function subscribeStream(types, handler) {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;

  const entry = { types: types ? new Set(types) : null, handler };
  if (subscribers.size === 0) {
    // A fresh start forgives earlier failures, including a refused login.
    fatal = false;
    failures = 0;
  }
  subscribers.add(entry);

  if (!listeningVisibility && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
    listeningVisibility = true;
  }
  if (!source && !retryTimer) connect();

  return () => {
    subscribers.delete(entry);
    if (subscribers.size === 0) {
      closeTimer = setTimeout(() => {
        if (subscribers.size === 0) shutdown();
      }, CLOSE_GRACE_MS);
    }
  };
}

/** Tears everything down immediately (sign-out, tests). */
export function resetStream() {
  subscribers.clear();
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
  failures = 0;
  fatal = false;
  shutdown();
}
