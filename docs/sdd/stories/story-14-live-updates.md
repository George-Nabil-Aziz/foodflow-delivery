# Story 14 — Live Updates

**Phase:** 7 (after v1) · **Depends on:** story-06, story-07, story-08 · **Blocks:** nothing

## Goal

Make order status, incoming restaurant orders and driver delivery offers appear
the moment they change instead of on the next poll, without letting the stream
carry business data and without making the app depend on it.

## User Story

> As a **customer, restaurant owner or driver**
> I want my order status, new orders and delivery offers to update the instant they change
> So that I never stare at a stale screen, miss a new order or lose an offer to a poll that ran a few seconds late.

## Scope

**In:** one authenticated Server-Sent Events endpoint and the ticket endpoint
that authenticates it; an in-process event bus; publishing from the central
write paths in `orders` and `delivery`, after commit only; the per-tab client
stream, the `useLiveUpdates` composable and the three views that polled
(customer order detail, restaurant incoming orders, driver offers); polling kept
as the automatic fallback.

**Out:** browser push, email and SMS; live GPS tracking; replaying missed events
(the client resyncs by refetching); multi-process fan-out (a documented seam
only); admin-facing streams; any change to the REST contracts.

## Actors

**CUSTOMER**, **RESTAURANT** and **DRIVER** receive events. **ADMIN** has no
stream. **SYSTEM** jobs (dispatch, offer expiry, order timeout) publish through
the same hooks as user actions.

## Preconditions

- Story-06 for orders and their creation path, story-07 for the status transitions and the restaurant's incoming-orders screen, story-08 for dispatch, offers and the driver's offers screen.
- Story-02 for the access token and account status the ticket exchange relies on.

## Functional Requirements

Implements spec-14: FR-14.1 – FR-14.10.

1. `POST /api/events/ticket` exchanges a valid access token for a single-use stream ticket.
2. `GET /api/events?ticket=…` opens a `text/event-stream` for that user; no other credential is accepted.
3. An order's creation and every status change is pushed to its customer, its restaurant and, once assigned, its driver.
4. Driver assignment is pushed to the order's customer and restaurant as `order.updated`.
5. Offer creation, expiry, acceptance and withdrawal are pushed to the one driver the offer belongs to.
6. A heartbeat comment about every 25 s and a `retry:` hint on connect.
7. A user who is suspended or deleted has every open stream closed.
8. At most 5 streams per user; opening a sixth closes the oldest.
9. One stream per tab, reconnecting with backoff and a fresh ticket, paused while the tab is hidden, with a refetch on every (re)connect.
10. While the stream is not open, the three views poll exactly as before and hand back to the stream when it recovers.

## Business Rules

BR-L1 – BR-L9 from [spec-14](../specs/spec-14-live-updates.md#business-rules).

The ones that shape behaviour most: events are published after commit only, so a
rolled-back transaction announces nothing (BR-L1); an event carries ids and a
status and never a name, address, phone or total (BR-L2); who receives an event
is decided on the server from the database, never from a parameter the client
sends (BR-L3); and the stream is optional, because every screen must keep
working with it blocked (BR-L9).

## Acceptance Criteria

```gherkin
Given I am a customer, restaurant owner or driver
When I POST /api/events/ticket with my access token
Then I receive 200 with an opaque ticket and expiresInSeconds 30

Given I am an admin, or I send no token
When I POST /api/events/ticket
Then I am refused — no stream exists for an admin

Given I open GET /api/events with no ticket, a forged ticket or a ticket already used
Then I receive 401 and no stream starts

Given I pass my access token as the ticket
Then I receive 401 — an access token is not a ticket

Given I was suspended after my ticket was issued
When I open the stream with it
Then I am refused — the account is re-read when the ticket is redeemed

Given I hold a valid ticket
When I open the stream
Then the response is text/event-stream with a retry hint, followed by one ready
  event

Given an order of customer A at restaurant R
When its status changes
Then A and R's owner receive order.status with the new status
And another customer, another restaurant and an unrelated driver receive nothing

Given an order status event is sent
Then its data holds exactly type, orderId, status and at — no customer, address
  or price data

Given a customer places a cash-on-delivery order at restaurant R
Then R's owner receives order.created for it

Given a customer checks out by card
Then no order.created is sent while the payment is unpaid
When the payment becomes PAID
Then R's owner receives order.created, so a screen that is not polling learns
  that the order has arrived

Given a driver is offered an order
Then only that driver receives offer.created, and no other driver does

Given a driver accepts an offer
Then the order's customer and that driver both receive the update

Given a status change is refused and its transaction rolls back
Then no event is published

Given a user is suspended while a stream is open
When the next heartbeat runs
Then the stream is closed, and reconnecting is refused

Given a user already holds five streams
When they open a sixth
Then the oldest is closed

Given the client disconnects
Then the server removes the connection and holds nothing for it

Given the stream is open on the order detail, incoming orders or offers screen
When a matching event arrives
Then the screen refetches through its normal endpoint and polling is suspended

Given the stream drops or is blocked
Then the screen polls at its usual interval, and hands back to the stream when
  it reconnects with a new ticket
```

## API Impact

New: `POST /api/events/ticket` (Bearer token, `Cache-Control: no-store`) and
`GET /api/events?ticket=…` (ticket as the credential). Event types:
`ready`, `order.created`, `order.status`, `order.updated`, `offer.created`,
`offer.expired`, `offer.taken`, `offer.withdrawn`. No existing REST contract
changes. Details in [spec-14](../specs/spec-14-live-updates.md#api-requirements).

## Database Impact

None. The audience of an event is resolved from existing tables
(`orders.customer_user_id`, `orders.driver_user_id`, `restaurants.owner_user_id`,
`users.status`). Tickets and open connections live in process memory.

## Frontend Impact

`services/liveStream.js` (the per-tab singleton: one connection opened for the
first subscriber and closed shortly after the last leaves, backoff reconnect with
a new ticket each time, closed while the tab is hidden, a `resync` delivered on
every connect), `composables/useLiveUpdates.js` (same shape as `usePolling` plus
`live`; polling suspended while the stream is open, debounced refetch on each
matching event) and `usePolling` gaining `suspend()` and `resume()`. Views:
`customer/OrderDetailView`, `restaurant/IncomingOrdersView` and
`driver/OffersView`.

## Backend Impact

`modules/events/` (`events.routes.js`, `events.hub.js`, `events.tickets.js`) and
`shared/events/` (`eventBus.js`, `eventTypes.js`). Producers publish from the
central paths only: `insertOrder`, `transition` (which `adminForceCancel` goes
through), the card-payment listener, and in `delivery` dispatch, accept, decline,
expiry and `closeAssignmentsForOrder`. Controllers contain no event code. Each
call is `publishAfterCommit(trx, event)`, which attaches to the root
transaction. The hub is stopped on shutdown so open streams do not hold the
server open.

## Validation

`ticket` must be a string of plausible length, otherwise it is treated as
unknown; the stream URL accepts no other parameter and in particular no audience
or filter. Event payloads are built in one place per producer.

## Error Cases

| Case | Expected |
|------|----------|
| Ticket request without a token | `401` |
| Ticket request from an admin | `403 FORBIDDEN_ROLE` |
| Missing, forged, used, expired or access-token ticket | `401 TOKEN_INVALID`, indistinguishable |
| Ticket redeemed by a suspended user | `403 ACCOUNT_SUSPENDED` |
| User suspended while connected | stream closed at the next heartbeat |
| A subscriber throws, or a client stops reading | logged or dropped; the producing operation is unaffected |
| Stream unreachable | status `failed`; the views poll as before |

## Security Considerations

- **The access token never appears in a URL.** `EventSource` cannot send headers; the ticket is opaque, 256-bit, single-use, valid for 30 seconds and stored only as a SHA-256 hash, so one found in a log is already spent.
- **The stream says "something changed", never what.** Clients refetch through the existing role-checked endpoints, so a routing mistake could leak at worst that an order changed, not its data (BR-L2, BR-L4).
- **Audience is server-side.** A customer is matched by `customer_user_id`, a restaurant owner by the restaurant they own, a driver by the offer or assignment; none of it comes from the client (BR-L3).
- **A suspended account stops receiving.** The account is re-read at redemption and on every heartbeat, which is the payoff of suspension revoking access (story-10).
- `GET /api/events` is the one route on the router-audit allow-list that does not use `authenticate`, because its credential is the ticket; the test proves it refuses everything else.

## Related Specs

- [spec-14 — Live Updates](../specs/spec-14-live-updates.md) (primary)
- [spec-07 — Order Placement & Lifecycle](../specs/spec-07-order-placement-lifecycle.md) (the transition path events hang off)
- [spec-08 — Driver Onboarding & Delivery Execution](../specs/spec-08-delivery-assignment-driver-operations.md) (dispatch and offers)
- [spec-02 — Identity, Authentication & Authorization](../specs/spec-02-identity-authentication-authorization.md) (access token, suspension)

## Dependencies

**Depends on:** story-06 for order creation, story-07 for transitions and the incoming-orders screen, story-08 for offers and the driver screen.
**Must happen before:** nothing.
**Can happen in parallel with:** nothing it needs — every screen works without the stream, which is why it could ship last.

## Testing Requirements

- Integration: `backend/tests/integration/events.test.js` against real PostgreSQL and a real HTTP server. Required: the ticket refused without a token and for an admin; the stream refused with no, forged, reused and access-token tickets and a ticket whose user was suspended after issue; SSE headers, `retry:` and `ready`; a transition reaching the customer and restaurant but not another customer, another restaurant or a driver; the payload key set being exactly `type, orderId, status, at`; `order.created` through admin placement; `offer.created` reaching only the offered driver; accept reaching customer and driver; a refused transition publishing nothing; `publishAfterCommit` holding until commit and dropping on rollback; suspension closing the stream on heartbeat; the heartbeat comment; cleanup on disconnect; the per-user cap evicting the oldest. `backend/tests/integration/cardPayments.test.js`: `order.created` withheld at card checkout and pushed to the restaurant when the card order becomes paid. `authorization.test.js`: the route-audit allow-list entry.
- Frontend: `frontend/tests/unit/liveUpdates.test.js` with a fake `EventSource` and fake timers: only the ticket in the URL; one shared connection closed after the last unsubscribe; routing by event type; reconnect with a new ticket and backoff; `failed` after repeated failures while retrying continues; an auth refusal being final; hide and show; polling until the stream opens then suspended; the filter; burst coalescing; fallback to polling on drop; a terminal result stopping the view.
