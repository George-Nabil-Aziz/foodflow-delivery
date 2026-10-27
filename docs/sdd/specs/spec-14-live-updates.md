# Spec 14 — Live Updates (Server-Sent Events)

**Status:** Approved · **Owner:** Platform · **Covers:** FR-14.1 – FR-14.10

## Objective

Make order status, incoming orders and delivery offers appear the moment they
change, instead of up to 10 s (orders) or 5 s (offers) later, without giving up
the property that made polling attractive: every byte of business data still
reaches a client through an ordinary, authorised REST endpoint. The stream
carries *"something changed"*, not data. Polling stays as an automatic fallback,
so a dead stream degrades the app to what it was before rather than breaking it.

## Scope

**In scope**
- One authenticated SSE endpoint and the ticket endpoint that authenticates it.
- An in-process event bus with a documented seam for a broker.
- Publishing from the central write paths in `orders` and `delivery`, after commit only.
- A per-tab client stream, a `useLiveUpdates` composable, and the three views that used polling.

**Out of scope** — browser push notifications, email/SMS (separate work), live
GPS tracking, replaying missed events (the client resyncs by refetching),
multi-process fan-out (documented seam only), admin-facing streams, and any
change to the REST contracts.

## Actors

- **CUSTOMER** — receives events about their own orders.
- **RESTAURANT** — receives events about their own restaurant's orders.
- **DRIVER** — receives events about their own offers, and about orders they are assigned.
- **ADMIN** — no stream in v1 (`403 FORBIDDEN_ROLE` on the ticket request).
- **SYSTEM** — jobs (dispatch, offer expiry, order timeout) publish through the same hooks.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-14.1 | `POST /api/events/ticket` exchanges a valid access token for a single-use stream ticket |
| FR-14.2 | `GET /api/events?ticket=…` opens a `text/event-stream` for that user; no other credential is accepted |
| FR-14.3 | An order's creation and every status change is pushed to its customer, its restaurant and (once assigned) its driver |
| FR-14.4 | Driver assignment on an order is pushed to its customer and restaurant as `order.updated` |
| FR-14.5 | Offer creation, expiry, acceptance and withdrawal are pushed to the one driver the offer belongs to |
| FR-14.6 | The server sends a heartbeat comment about every 25 s and a `retry:` hint on connect |
| FR-14.7 | A user whose account is suspended or deleted has every open stream closed, and cannot open another |
| FR-14.8 | A user may hold at most 5 streams; opening a sixth closes the oldest |
| FR-14.9 | The client keeps one stream per tab, reconnects with backoff and a fresh ticket, pauses while the tab is hidden, and refetches on (re)connect |
| FR-14.10 | When the stream is not open the three views poll exactly as before, and hand back to the stream when it recovers |

## Business Rules

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-L1 | Events are published **after commit only**; a rolled-back transaction publishes nothing | `publishAfterCommit(trx, event)` waits on the root transaction's `executionPromise` |
| BR-L2 | Events carry ids and a new status, never names, addresses, phones or totals | Payload built in one place per producer; asserted by a test on the exact key set |
| BR-L3 | A client receives an event only if it is in the event's audience; audience is resolved from the database at connect time, never from a client parameter | `isAudience` in the hub; the stream URL accepts no filter |
| BR-L4 | Authorization for the data stays in the REST endpoints: an event never widens what a client can read | Clients refetch through existing endpoints |
| BR-L5 | The access token never appears in a URL | Ticket exchange (below) |
| BR-L6 | A ticket is single-use, expires in 30 s, and is stored only as a SHA-256 hash | `events.tickets.js` |
| BR-L7 | Producers publish from the central paths (`insertOrder`, `transition`, `adminForceCancel`, dispatch, accept, decline, expiry, `closeAssignmentsForOrder`), never from controllers | Code structure; controllers have no event code |
| BR-L8 | A failing subscriber or a dropped client never affects the operation that produced the event | `deliverLocal` catches; publishing is fire-and-forget |
| BR-L9 | The stream is optional: every screen works with it blocked | Polling fallback (FR-14.10) |

## Authentication: why a ticket

`EventSource` cannot set request headers. The three ways round that, and why the
third was rejected:

1. **Access token in the query string** — rejected. URLs are written to proxy
   and access logs and browser history; a 15-minute bearer token there is a
   credential in a log file.
2. **`fetch` + `ReadableStream` with an Authorization header** — safe, but gives
   up `EventSource`'s parsing and dev tooling and means writing an SSE parser.
3. **Short-lived single-use ticket (chosen)** — the client sends its access
   token the normal way (header, over `POST`), receives an opaque 256-bit
   ticket valid for 30 s and usable once, and opens `EventSource` with only that
   in the URL. A ticket found in a log is already spent. The POST goes through
   the existing axios client, so expired-token refresh and suspension handling
   come for free, and every reconnect naturally gets a fresh ticket.

Costs accepted: one extra round trip per connection, and tickets live in process
memory (see *Scaling seam*). The ticket is bound to a user id, but the account
is re-read from the database when the ticket is redeemed, so a user suspended
between the two calls is refused.

## API Requirements

| Method | Route | Auth | Role | Notes |
|--------|-------|------|------|-------|
| POST | `/api/events/ticket` | 🔓 | C / R / D | Bearer token; `Cache-Control: no-store` |
| GET | `/api/events` | ticket | C / R / D | `?ticket=…`; streams until closed |

```jsonc
// POST /api/events/ticket  →  200
{ "success": true, "data": { "ticket": "o3X…(43 chars)", "expiresInSeconds": 30 } }
```

Errors before the stream starts are the normal envelope: `401 TOKEN_MISSING` /
`TOKEN_INVALID` (missing, forged, used or expired ticket — deliberately
indistinguishable), `403 ACCOUNT_SUSPENDED`, `403 FORBIDDEN_ROLE`.

### Stream format

```text
retry: 3000

event: ready
data: {"type":"ready","at":"2026-09-22T18:12:41.000Z"}

event: order.status
data: {"type":"order.status","orderId":"…","status":"CONFIRMED","at":"…"}

: ping
```

| Event | Audience | Data (besides `type`, `at`) |
|-------|----------|-----------------------------|
| `ready` | the connection | — (sent once, after connect) |
| `order.created` | customer, restaurant | `orderId`, `status` |
| `order.status` | customer, restaurant, assigned driver | `orderId`, `status` |
| `order.updated` | customer, restaurant, driver | `orderId`, `status` (driver assigned) |
| `offer.created` | the offered driver | `orderId` |
| `offer.expired` | that driver | `orderId` |
| `offer.taken` | that driver (their own acceptance, for their other tabs) | `orderId` |
| `offer.withdrawn` | that driver | `orderId` (declined, or the order was cancelled while offered) |

Response headers: `Content-Type: text/event-stream; charset=utf-8`,
`Cache-Control: no-cache, no-transform`, `Connection: keep-alive`,
`X-Accel-Buffering: no`. The API has no compression middleware; if one is ever
added it must skip this route (SSE and gzip buffering do not mix). Lines
beginning `:` are heartbeats and are ignored by `EventSource`.

## Frontend Requirements

- `services/liveStream.js` — the per-tab singleton. `subscribeStream(types, handler)` opens the connection for the first subscriber and closes it 2 s after the last leaves (the grace period lets a route change swap views without reconnecting). `streamStatus` is `idle | connecting | open | paused | failed`.
- Reconnect: close, wait `min(30 s, 1 s × 2ⁿ)` with jitter, fetch a **new** ticket, reopen. The browser's built-in auto-reconnect is not used because it would replay a spent ticket. After 3 consecutive failures the status is `failed`; retries continue in the background. A `401`/`403` is final until the next subscription.
- Visibility: the stream closes when the tab is hidden and reopens when it is shown, matching `usePolling`.
- `{ type: 'resync' }` is delivered to listeners on every (re)connect, because events during a gap are not replayed.
- `composables/useLiveUpdates.js` — same return shape as `usePolling` plus `live`. While `streamStatus === 'open'` the poll timer is suspended and each matching event triggers a debounced (250 ms) refetch; otherwise it polls at the existing intervals. Options `events` and `filter` select what it reacts to.
- `usePolling` gained `suspend()` / `resume()`; nothing else about its behaviour changed.
- Views: `customer/OrderDetailView` (`order.status`, `order.updated` for its own order id; stops at a terminal status), `restaurant/IncomingOrdersView` (`order.*`), `driver/OffersView` (`offer.*`; the 5 s fallback interval is kept). The restaurant's new-order cue now runs on every refresh, whatever triggered it, and no longer needs a non-empty queue to fire.

## Backend Requirements

Module `modules/events/` (`events.routes.js`, `events.hub.js`, `events.tickets.js`)
plus `shared/events/` (`eventBus.js`, `eventTypes.js`).

### Publishing

```text
orders.insertOrder        → order.created     (checkout and admin placement)
orders.transition         → order.status      (the only status-changing path)
orders.adminForceCancel   → order.status      (the one other writer of orders.status)
delivery.dispatchOrder    → offer.created
delivery.acceptOffer      → offer.taken + order.updated
delivery.declineOffer     → offer.withdrawn
delivery.expireOffer      → offer.expired
delivery.closeAssignmentsForOrder (cancel) → offer.withdrawn for each open offer
```

Each call is `publishAfterCommit(trx, event)`. It returns immediately and attaches
to the root transaction: on commit the event is published, on rollback it is
dropped. Helpers that join a caller's transaction (`withTransaction(fn, trx)`)
therefore publish when the *outermost* owner commits. Outside a transaction it
publishes at once.

### Hub

Keeps `Map<userId, Set<connection>>`; a connection is `{ userId, role,
restaurantId, res }`. `restaurantId` is looked up from `restaurants.owner_user_id`
at connect. On each event the hub writes the frame to every connection for which
`isAudience(connection, event.audience)` holds. It additionally:

- writes `: ping` to all connections every 25 s, and in the same tick re-reads the status of all connected users in one query, closing the streams of any who are `SUSPENDED` or deleted (FR-14.7; worst-case lag is one heartbeat period);
- on exceeding 5 streams for a user, ends the oldest (FR-14.8);
- drops a connection whose write buffer exceeds 1 MB (a client that is not reading);
- removes a connection on `close`/`error` of the request or response;
- disables the socket idle timeout for the stream and sets `X-Accel-Buffering: no`;
- is stopped by `server.js` on shutdown, because open streams would otherwise hold `server.close()` open until the 10 s hard exit.

### Scaling seam

Two pieces of state are per-process, and both are behind a two-function interface:

| Piece | Interface | Multi-process replacement |
|-------|-----------|---------------------------|
| Event fan-out | `publish(event)` / `subscribe(handler)` / `deliverLocal(event)` in `eventBus.js` | `publish` writes to `NOTIFY foodflow_events, <json>` (Postgres) or `PUBLISH` (Redis); a listener on every process calls `deliverLocal` for each message. Producers and the hub are untouched. Mind Postgres' 8 kB NOTIFY payload limit: events are ~150 bytes. |
| Tickets | `issueTicket` / `redeemTicket` in `events.tickets.js` | A Redis key with 30 s TTL and `GETDEL`, or a short-lived table row deleted on redeem |

Connection caps and the heartbeat account check are per process and remain
correct (each process re-checks its own connections; the cap becomes per process
× N, which is acceptable).

## Authorization

- Stream access requires a valid ticket **and** a currently active, non-deleted user with role CUSTOMER, RESTAURANT or DRIVER.
- Scoping (BR-L3): a customer matches `customer_user_id`; a restaurant owner matches `restaurant_id`; a driver matches the offer's driver or the order's `driver_user_id`. Admins have no stream.
- No event contains a field a client could not already read about that order, and the client always refetches via the role-checked endpoint, so a routing mistake would leak at worst *that something changed* — never data. (BR-L2 and BR-L4.)
- `GET /api/events` is on the router-audit allow-list in `authorization.test.js` because its credential is the ticket rather than a header; `events.test.js` proves it refuses a missing, forged, reused and access-token-as-ticket request.

## Error Handling

| Situation | Behaviour |
|-----------|-----------|
| Missing / forged / used / expired ticket | `401 TOKEN_INVALID`, JSON envelope |
| Suspended user at connect | `403 ACCOUNT_SUSPENDED` |
| Suspended or deleted while connected | Stream ended at the next heartbeat (≤ 25 s); client's reconnect then gets 403, the HTTP layer signs the user out |
| Subscriber throws | Logged at `warn`, other subscribers and the producer unaffected |
| Account re-check query fails | Logged; streams kept for that tick |
| Client cannot reach the stream (blocked proxy, no `EventSource`) | Status `failed`; views poll as before |
| Server restart | Streams drop; clients back off, reconnect with a new ticket and resync |

## Testing

`backend/tests/integration/events.test.js` (real PostgreSQL, real HTTP server):
ticket requires a token and refuses admins; stream refuses no / forged / reused /
access-token tickets and a ticket whose user was suspended after minting; SSE
headers, `retry:` and `ready`; a transition reaches the customer and restaurant
but not another customer, another restaurant or a driver; payload key set is
exactly `type, orderId, status, at`; `order.created` via admin placement;
`offer.created` reaches only the offered driver; accept reaches customer and
driver; a refused transition publishes nothing; `publishAfterCommit` holds until
commit and drops on rollback; suspension closes the stream on heartbeat;
heartbeat comment; cleanup on client disconnect; per-user cap evicts the oldest.

`frontend/tests/unit/liveUpdates.test.js` (fake `EventSource`, fake timers):
only the ticket is in the URL; one connection shared and closed after the last
unsubscribe; event routing by type; reconnect with new ticket and backoff;
`failed` after repeated failures while retrying continues; auth refusal is
final; hide/show; polling until open then suspended; filter; burst coalescing;
fallback to polling on drop; no stream for a view that never starts; stop at a
terminal result.

## Edge Cases

- **Missed events.** A gap (reconnect, hidden tab, server restart) loses events. Every (re)connect emits `resync`, and listeners refetch. There is no `Last-Event-ID` replay; state is always recoverable from REST.
- **Event before the view's first load.** The view loads, then starts the composable; events in between are covered by the `ready` resync.
- **Two tabs, one user.** Two streams, both delivered. Up to 5; more evicts the oldest.
- **Tab hidden for hours.** Stream closed, poll paused, nothing held server-side; one refetch on return.
- **Token expires while connected.** The stream is already authorised, so it keeps running; the next ticket request refreshes the token through the normal interceptor.
- **Order cancelled while offered.** The offered driver gets `offer.withdrawn`; their list refetches and the card disappears.
- **Bursts.** A transition that triggers several events (status plus driver assignment) is coalesced client-side into one refetch by the 250 ms debounce.
- **Restaurant without a restaurant row** (deleted). Connects, receives nothing.
- **Rolled-back accept** (lost race). No event; the loser's `409` is the only signal, as before.
