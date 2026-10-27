import crypto from 'node:crypto';

/**
 * Stream tickets: how an `EventSource` authenticates.
 *
 * `EventSource` cannot send an Authorization header, so the long-lived access
 * token would otherwise have to ride in the URL, where proxies and access logs
 * keep it. Instead the client trades its access token (sent normally, in a
 * header, on a POST) for a ticket that is:
 *   - opaque and random (256 bits), stored only as a SHA-256 hash;
 *   - single-use: redeeming it deletes it, so a copy lifted from a log is dead;
 *   - short-lived (30 s): enough to open one connection, no more;
 *   - bound to one user, whose status is re-checked when it is redeemed.
 * A ticket grants nothing but the right to open a read-only stream of that
 * user's own events.
 *
 * Storage is an in-process Map, correct for one Node process. Running several
 * processes means moving this to a shared store (a Redis key with a 30 s TTL
 * and GETDEL, or a short-lived table row); the two functions below are the
 * whole interface. This moves together with the event bus (see eventBus.js).
 */
export const TICKET_TTL_MS = 30_000;
const MAX_OUTSTANDING = 10_000;

const tickets = new Map(); // sha256(ticket) -> { userId, expiresAt }

const hash = (ticket) => crypto.createHash('sha256').update(ticket).digest('hex');

function sweep(now) {
  for (const [key, value] of tickets) {
    if (value.expiresAt <= now) tickets.delete(key);
  }
}

/** Mints a ticket for an already-authenticated user. */
export function issueTicket(userId, now = Date.now()) {
  sweep(now);
  // A flood of ticket requests must not grow memory without bound.
  if (tickets.size >= MAX_OUTSTANDING) tickets.delete(tickets.keys().next().value);

  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(hash(ticket), { userId, expiresAt: now + TICKET_TTL_MS });
  return { ticket, expiresInSeconds: TICKET_TTL_MS / 1000 };
}

/** Redeems a ticket exactly once. Returns the user id, or null when the ticket
 *  is unknown, already used or expired (the three are indistinguishable). */
export function redeemTicket(ticket, now = Date.now()) {
  if (typeof ticket !== 'string' || ticket.length < 20 || ticket.length > 100) return null;
  const key = hash(ticket);
  const entry = tickets.get(key);
  if (!entry) return null;
  tickets.delete(key);
  return entry.expiresAt > now ? entry.userId : null;
}

/** Number of unredeemed tickets (tests). */
export const outstandingTickets = () => tickets.size;
