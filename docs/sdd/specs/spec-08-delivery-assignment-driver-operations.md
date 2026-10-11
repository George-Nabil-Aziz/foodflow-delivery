# Spec 08 — Delivery Assignment & Driver Operations

**Status:** Approved · **Owner:** Delivery · **Covers:** FR-7.1 – FR-7.6

## Objective

Get a confirmed order to a driver, and give that driver a screen that tells them
exactly what to do next. Dispatch must be safe under concurrency (two drivers,
one order) and must never destroy an order just because nobody is available.

## Scope

**In scope**
- `driver_profiles` and `delivery_assignments` tables.
- Driver profile, availability and last-known-location.
- Dispatch: candidate selection, offer creation, expiry, retry, escalation.
- Offer accept/decline.
- The driver's two order transitions (T7 pick-up, T9 deliver) — routed here, adjudicated by spec-07's state machine.
- Delivery history.
- Driver screens.

**Out of scope** — driver account creation (spec-10, ADR-006), the state machine
itself (spec-07), live GPS tracking and route optimization (non-goals), driver
payouts (not a feature).

## Actors

- **DRIVER** — receives offers, delivers.
- **SYSTEM** — the dispatch and expiry jobs.
- **ADMIN** — approves/suspends drivers (spec-10), sees the unassigned backlog.
- **CUSTOMER** — sees the assigned driver's name and masked phone once `OUT_FOR_DELIVERY`.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-7.1 | Dispatch starts when an order reaches `CONFIRMED` |
| FR-7.2 | An offer goes to the nearest eligible driver and expires after `DELIVERY_OFFER_TTL_SECONDS` (90) |
| FR-7.3 | A driver has at most one accepted, undelivered assignment |
| FR-7.4 | With no driver available the order keeps its status, is flagged `UNASSIGNED`, retries, and escalates to admins after 15 minutes. **It is never auto-cancelled** |
| FR-7.5 | Only the accepted driver may perform T7 and T9, in that order |
| FR-7.6 | Delivery returns the driver to `AVAILABLE` |
| FR-7.7 | A driver sets availability `OFFLINE`/`AVAILABLE`; only `AVAILABLE` drivers get offers |
| FR-7.8 | A driver views active and historical deliveries with pickup and drop-off detail |
| FR-7.9 | Declining or letting an offer expire immediately triggers the next candidate |

## Business Rules

BR-D1 – BR-D10 from [master-sdd §7.6](../master-sdd.md#76-delivery-rules).

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-D1 | Dispatch at `CONFIRMED`, not at `READY_FOR_PICKUP` | `onTransition` hook; gives the driver travel lead time |
| BR-D2 | Only `status = ACTIVE` and `availability = AVAILABLE` drivers are candidates | `idx_drivers_dispatch` query predicate |
| BR-D3 | Nearest by straight-line distance; ties break on longest idle | Haversine over `current_latitude/longitude`; drivers with no location sort last |
| BR-D4 | 90-second offer TTL | `expires_at`; `offerExpiryJob` |
| BR-D5 | One accepted assignment per driver | `uq_assignments_driver_active` partial unique index |
| BR-D6 | Acceptance sets `orders.driver_user_id` and `availability = ON_DELIVERY` | Accept transaction |
| BR-D7 | No pick-up before `READY_FOR_PICKUP` | Spec-07's state machine → 409 |
| BR-D8 | Delivery or force-cancel releases the driver | `releaseDriver` in `onTransition` |
| BR-D9 | Going `OFFLINE` mid-delivery is refused | `409 DRIVER_HAS_ACTIVE_DELIVERY` |
| BR-D10 | Declines are recorded without penalty | `decline_reason` stored; unused in v1 ranking |
| BR-D11 | A driver never sees the customer's email; the phone is masked | Role-specific DTO |
| BR-D12 | Dispatch never offers to a driver who already declined or expired on that order | Candidate query excludes prior assignment rows for the order |

BR-D12 prevents the obvious infinite loop: without it, the nearest driver who
declines is also the nearest driver on the retry, forever.

## Data Requirements

`driver_profiles` and `delivery_assignments` per
[database-design §4](../architecture/database-design.md#4-table-detail), plus
`orders.dispatch_state` and `orders.driver_user_id` (owned by spec-07, written
here through the orders module interface).

The three partial unique indexes carrying the concurrency guarantees:

```sql
CREATE UNIQUE INDEX uq_assignments_driver_active
  ON delivery_assignments (driver_user_id) WHERE status = 'ACCEPTED';   -- BR-D5
CREATE UNIQUE INDEX uq_assignments_order_accepted
  ON delivery_assignments (order_id)       WHERE status = 'ACCEPTED';   -- one driver per order
CREATE UNIQUE INDEX uq_assignments_order_open
  ON delivery_assignments (order_id)       WHERE status = 'OFFERED';    -- one live offer at a time
```

These are the mechanism, not a safety net. The accept path deliberately relies on
the insert failing rather than on a prior existence check, because a check-then-
insert is exactly the race being defended against.

## API Requirements

| Method | Route | Auth | Role | Notes |
|--------|-------|------|------|-------|
| GET | `/api/driver/profile` | 🔓 | D +own | |
| PATCH | `/api/driver/profile` | 🔓 | D +own | Vehicle type and plate |
| PATCH | `/api/driver/availability` | 🔓 | D +own | 409 while on a delivery |
| PATCH | `/api/driver/location` | 🔓 | D +own | `{ latitude, longitude }` |
| GET | `/api/driver/offers` | 🔓 | D +own | Live offers (polled at 5 s) |
| POST | `/api/driver/offers/:id/accept` | 🔓 | D +own | 409 `OFFER_NO_LONGER_AVAILABLE` / `DRIVER_HAS_ACTIVE_DELIVERY` |
| POST | `/api/driver/offers/:id/decline` | 🔓 | D +own | |
| GET | `/api/driver/deliveries` | 🔓 | D +own | `?scope=active\|history` |
| GET | `/api/driver/deliveries/:orderId` | 🔓 | D +own | Pickup + drop-off detail |
| POST | `/api/driver/deliveries/:orderId/pick-up` | 🔓 | D +own | T7 |
| POST | `/api/driver/deliveries/:orderId/deliver` | 🔓 | D +own | T9 |

```jsonc
// GET /api/driver/offers
{ "success": true, "data": [{
  "id": "…", "expiresAt": "2026-09-22T18:12:41Z", "secondsRemaining": 63,
  "distanceKm": "2.40",
  "order": { "orderNumber": "FF-20260922-4K9P2M", "itemCount": 3, "totalAmount": "166.10",
             "status": "CONFIRMED",
             "restaurant": { "name": "Olive Grill", "addressLine1": "…", "phone": "+9661…" },
             "dropoff": { "district": "Al Olaya", "city": "Riyadh" } } }] }
```

The offer shows the drop-off **district only**. The full address appears after
acceptance — a driver deciding whether to take a job needs the distance, not a
stranger's street number.

## Frontend Requirements

- `driver/DashboardView` — the availability toggle, today's delivery count, current assignment or offer list.
- `AvailabilityToggle` — large and unambiguous; refuses to go offline mid-delivery with an explanation rather than a silent failure.
- `driver/OffersView` — offer cards with a live countdown to expiry, distance, restaurant, item count, payout-relevant total, and accept/decline. An expired card is replaced in place with "This offer expired" rather than vanishing mid-tap.
- `driver/ActiveDeliveryView` — a `DeliveryStepper` (Head to restaurant → Picked up → Delivered) with one primary action at a time, the restaurant's address and phone, the customer's address, first name and masked phone, and the item list for verification at pickup.
- `driver/DeliveryHistoryView` — completed deliveries with date, restaurant, district and rating received.
- `useDriverOffers` polls at 5 s while `AVAILABLE`, stops when `OFFLINE` or on an active delivery.
- Mobile-first: drivers use phones. Tap targets ≥44 px, primary action reachable by thumb, and the address text is selectable so it can be pasted into a maps app.

## Backend Requirements

Module `modules/delivery/` with `dispatchService.js`, `offerService.js`,
`driver.service.js`, `delivery.repository.js`.

### Dispatch

```text
requestDispatch(orderId, { trx }):
  set orders.dispatch_state = 'UNASSIGNED'          -- in the caller's transaction
  (the dispatch job picks it up on its next tick)

dispatchJob (every 20 s, advisory-locked):
  for each order where dispatch_state = 'UNASSIGNED'
      and status in (CONFIRMED, PREPARING, READY_FOR_PICKUP)
      and no OFFERED assignment exists:
    candidates = drivers where status = ACTIVE and availability = AVAILABLE
                 and no ACCEPTED assignment
                 and no prior assignment row for this order          -- BR-D12
                 order by haversine(driver, restaurant) asc nulls last,
                          last_assigned_at asc                       -- BR-D3
    if none: leave UNASSIGNED; if confirmed_at older than 15 min, flag for the admin backlog
    else: INSERT assignment (OFFERED, expires_at = now + 90s)
          set dispatch_state = 'OFFERED'
          notify(driver, 'NEW_OFFER')
```

### Accept (the concurrency-critical path)

```text
BEGIN
  assignment = SELECT ... FOR UPDATE where id = :id and driver_user_id = :me
  if not found                        → 404
  if status <> 'OFFERED'              → 409 OFFER_NO_LONGER_AVAILABLE
  if expires_at < now()               → 409 OFFER_NO_LONGER_AVAILABLE (and mark EXPIRED)
  UPDATE assignment SET status = 'ACCEPTED', responded_at = now()
      -- uq_assignments_order_accepted and uq_assignments_driver_active arbitrate here;
      -- a 23505 is translated to 409 OFFER_NO_LONGER_AVAILABLE / DRIVER_HAS_ACTIVE_DELIVERY
  orders.assignDriver(orderId, driverId, { trx })    -- sets driver_user_id, dispatch_state = ASSIGNED
  UPDATE driver_profiles SET availability = 'ON_DELIVERY', last_assigned_at = now()
COMMIT
```

Pick-up and deliver are thin wrappers over `orders.transition(...)` with
`actor = { role: 'DRIVER', id }`, preceded by an assertion that an `ACCEPTED`
assignment exists for this driver and this order — so an unassigned driver gets
404 and an assigned driver acting too early gets 409 from the state machine
(BR-D7).

Public interface: `requestDispatch`, `getActiveAssignment(driverId)`,
`releaseDriver(driverId, { trx })`, `cancelAssignmentsForOrder(orderId, { trx })`.

## Validation

| Field | Rule |
|-------|------|
| `availability` | ∈ `{OFFLINE, AVAILABLE}` — `ON_DELIVERY` is system-set and rejected from a client |
| `latitude` / `longitude` | −90..90 / −180..180, both required together |
| `vehicleType` | ∈ `{BICYCLE, MOTORCYCLE, CAR}` |
| `vehiclePlate` | 2–20 chars |
| `declineReason` | optional, ≤200 |
| `:id`, `:orderId` | UUID, scoped to the caller's assignments |

## Authorization

`authorize('DRIVER')` on every route, plus `driver_profiles.status = ACTIVE` —
a `PENDING_APPROVAL` or `SUSPENDED` driver gets `403 ACCOUNT_SUSPENDED` and
receives no offers. Ownership is `driver_user_id = req.user.id` in SQL, so
another driver's offer or delivery ID is a 404.

Data exposure per [security.md §9](../architecture/security.md#9-data-exposure-rules):
a driver sees the customer's first name, masked phone and address — never their
email, order history or other orders.

## Error Handling

| Condition | Response |
|-----------|----------|
| Offer already accepted by another driver | `409 OFFER_NO_LONGER_AVAILABLE` |
| Offer expired | `409 OFFER_NO_LONGER_AVAILABLE` |
| Accepting while already on a delivery | `409 DRIVER_HAS_ACTIVE_DELIVERY` |
| Going offline mid-delivery | `409 DRIVER_HAS_ACTIVE_DELIVERY` |
| Pick-up before `READY_FOR_PICKUP` | `409 INVALID_ORDER_TRANSITION` with the current status |
| Deliver before pick-up | `409 INVALID_ORDER_TRANSITION` |
| Acting on an unassigned order | `404` |
| Unapproved driver | `403 ACCOUNT_SUSPENDED` |

## Testing Requirements

Unit — Haversine distance; candidate ordering including null-location drivers
last and the idle-time tie-break; expiry arithmetic; the `ON_DELIVERY` rejection
in the availability schema.

Integration — the `delivery.integration` suite. Required:
- Dispatch fires on `CONFIRMED` and creates exactly one `OFFERED` assignment.
- **Two drivers accept the same offer concurrently → exactly one `ACCEPTED`, the other 409.**
- Acceptance sets `driver_user_id`, `dispatch_state = ASSIGNED` and `ON_DELIVERY`.
- Expiry marks `EXPIRED` and the next tick offers to a different driver, never the same one (BR-D12).
- **No eligible drivers: the order keeps its status, `dispatch_state` stays `UNASSIGNED`, nothing is cancelled, and after 15 minutes it appears in the admin backlog** (FR-7.4).
- Pick-up before ready → 409; deliver before pick-up → 409; another driver's order → 404.
- Delivery releases the driver to `AVAILABLE` and closes the assignment.
- Admin force-cancel mid-delivery releases the driver.
- A driver on a delivery receives no new offers.

Frontend — the countdown reaches zero and the card flips to expired without a
tap doing anything harmful; the availability toggle surfaces the 409 as a
readable message; the stepper shows exactly one primary action per state; the
drop-off street address is absent from the offer payload and present after
acceptance.

## Edge Cases

| Case | Expected |
|------|----------|
| No drivers online at all | Order proceeds to `READY_FOR_PICKUP` and waits; customer sees "finding a driver"; admin sees it in the backlog |
| Every driver declines | Same as above; dispatch stops offering once candidates are exhausted and resumes as drivers come online |
| Driver goes offline with a live offer | The offer expires normally; the next tick re-dispatches |
| Driver accepts at the same instant the offer expires | The `FOR UPDATE` read plus the `expires_at` check makes the outcome deterministic; a hair-late accept gets 409 |
| Order cancelled while a driver holds it | Assignment is `CANCELLED`, the driver is released, and their active-delivery screen shows the cancellation with the reason |
| Driver's app loses connectivity mid-delivery | Nothing changes server-side; the transitions are idempotent to re-attempt and the same actions are available on reconnect |
| Driver never marks delivered | The order stays `OUT_FOR_DELIVERY` and appears in the admin stuck-order view; only an admin can force-cancel (T10) |
| Two orders ready at the same restaurant | Two independent dispatches; one driver can hold only one (BR-D5) — batching is a non-goal |

## Related Stories

- [story-08 — Driver Onboarding, Assignment & Delivery Execution](../stories/story-08-driver-onboarding-delivery-execution.md) (primary)
- [story-07 — Restaurant Order Processing](../stories/story-07-restaurant-order-processing.md) (dispatch is triggered by the restaurant's accept)

## Dependencies

**Depends on:** [spec-01](spec-01-platform-foundation-api-contract.md), [spec-02](spec-02-identity-authentication-authorization.md), [spec-07](spec-07-order-placement-lifecycle.md) (the state machine and the `CONFIRMED` hook), [spec-10](spec-10-platform-administration-reporting.md) (driver accounts are admin-created).
**Depended on by:** [spec-09](spec-09-reviews-ratings.md) (driver ratings), [spec-10](spec-10-platform-administration-reporting.md) (the unassigned backlog).
