# Story 08 — Driver Onboarding, Assignment & Delivery Execution

**Phase:** 5 · **Depends on:** story-07 · **Blocks:** story-09

## Goal

Close the loop: an admin provisions and approves a driver, dispatch offers them
a confirmed order, they accept, collect it and deliver it — and the order
reaches `DELIVERED`. After this story the end-to-end journey works.

## User Story

> As a **delivery driver**
> I want to receive nearby delivery offers and be told exactly what to do next
> So that I can pick up orders and deliver them without guessing or calling anyone.

> As a **platform operator**
> I want orders to find a driver automatically, and to know when they have not
> So that deliveries happen without manual dispatch and stuck orders are visible.

## Scope

**In:** `driver_profiles` and `delivery_assignments`; admin driver creation and
approval; driver login, profile, availability and location; the dispatch, offer
expiry and unassigned-escalation jobs; offer accept/decline; the driver's two
transitions (T7 pick-up, T9 deliver); delivery history; all driver screens.

**Out:** the state machine itself (story-06), restaurant actions (story-07),
live GPS tracking and route optimization (non-goals), driver payouts (not a
feature).

## Actors

- **DRIVER** — primary.
- **ADMIN** — creates and approves drivers.
- **SYSTEM** — the dispatch and expiry jobs.
- **CUSTOMER** — sees the driver's name and masked phone once `OUT_FOR_DELIVERY`.

## Preconditions

- Story-07 complete: restaurants can confirm orders, which is what triggers dispatch.
- A seeded admin exists to create drivers.

## Functional Requirements

Implements spec-08 in full (FR-7.1 – FR-7.9) plus the driver slice of spec-10
(FR-9.7, driver approval in FR-9.2).

1. An admin creates a driver account; the profile starts `PENDING_APPROVAL` and the initial password is returned exactly once.
2. An admin approves the driver, making them `ACTIVE`.
3. The driver logs in, edits vehicle details, and sets availability `OFFLINE`/`AVAILABLE`.
4. The driver's app reports its location for dispatch ranking.
5. Dispatch offers a `CONFIRMED` order to the nearest eligible driver, expiring after 90 seconds.
6. A driver accepts or declines; declining or expiring immediately triggers the next candidate, and never re-offers to someone who already refused that order.
7. A driver holds at most one accepted, undelivered assignment.
8. The accepted driver marks pick-up (T7) and delivery (T9), in that order.
9. Delivery returns the driver to `AVAILABLE`.
10. With no driver available, the order keeps its status, is flagged `UNASSIGNED`, retries, and escalates to admins after 15 minutes — **it is never auto-cancelled**.

## Business Rules

BR-D1 – BR-D12 from [spec-08](../specs/spec-08-delivery-assignment-driver-operations.md#business-rules)
and ADR-006 (drivers are admin-provisioned because a driver receives a
stranger's home address).

Two carry the most weight. **BR-D5** — one accepted assignment per driver — is
enforced by a partial unique index, not a service check, because the failure
mode is two drivers racing for one order. **FR-7.4** — no driver means no
cancellation — because cancelling a paid-for, cooked order due to a supply
problem the customer cannot influence is the wrong answer.

## Acceptance Criteria

```gherkin
Given I am an admin
When I create a driver account
Then the user is created with role DRIVER, the profile is PENDING_APPROVAL,
  and an initial password is returned exactly once in that response and never again

Given a driver profile is PENDING_APPROVAL
When that driver logs in and opens their dashboard
Then they receive 403 ACCOUNT_SUSPENDED on driver endpoints and see a
  "waiting for approval" state

Given an admin approves the driver
When the driver sets themselves AVAILABLE
Then they become eligible to receive offers

Given an order reaches CONFIRMED and one AVAILABLE driver exists
When the dispatch job runs
Then exactly one OFFERED assignment is created for that driver with a 90-second expiry

Given I am the offered driver
When I accept
Then the assignment becomes ACCEPTED, the order's driver is set, its dispatch state
  becomes ASSIGNED, and my availability becomes ON_DELIVERY

Given two drivers are offered the same order and both accept at the same moment
When both requests are processed
Then exactly one assignment becomes ACCEPTED and the other driver receives
  409 OFFER_NO_LONGER_AVAILABLE

Given an offer has expired
When I try to accept it
Then I receive 409 OFFER_NO_LONGER_AVAILABLE

Given I decline an offer
When the dispatch job runs again
Then the order is offered to a different driver and never again to me for that order

Given I already hold an accepted delivery
When I try to accept another offer
Then I receive 409 DRIVER_HAS_ACTIVE_DELIVERY

Given I am on an active delivery
When I try to go OFFLINE
Then I receive 409 DRIVER_HAS_ACTIVE_DELIVERY

Given I submit an availability of ON_DELIVERY
When the request is processed
Then I receive 422 — that state is set by the system, not by me

Given my accepted order is still PREPARING
When I try to mark it picked up
Then I receive 409 INVALID_ORDER_TRANSITION stating the current status

Given my accepted order is READY_FOR_PICKUP
When I mark it picked up
Then its status becomes OUT_FOR_DELIVERY and pickedUpAt is stamped

Given my order is OUT_FOR_DELIVERY
When I mark it delivered
Then its status becomes DELIVERED, deliveredAt is stamped, my assignment closes,
  and I become AVAILABLE again

Given an order assigned to a different driver
When I try to act on it
Then I receive 404 RESOURCE_NOT_FOUND

Given I am viewing an offer I have not yet accepted
When I inspect the payload
Then I see the distance and the drop-off district, but not the customer's street
  address, name, phone or email

Given I have accepted a delivery
When I view it
Then I see the full delivery address, the customer's first name and a masked phone —
  and never their email

Given no drivers are online
When an order is confirmed and prepared
Then it reaches READY_FOR_PICKUP and stays there with dispatch state UNASSIGNED,
  the customer sees "finding a driver", nothing is cancelled, and after 15 minutes
  the order appears in the admin unassigned backlog

Given an admin force-cancels an order I am delivering
When the cancellation is processed
Then my assignment is cancelled, I become AVAILABLE, and my screen shows the
  cancellation with its reason
```

## API Impact

New: `POST /api/admin/drivers`, `GET /api/admin/drivers`,
`POST /api/admin/drivers/:id/{approve,suspend}`;
`GET/PATCH /api/driver/profile`, `PATCH /api/driver/{availability,location}`,
`GET /api/driver/offers`, `POST /api/driver/offers/:id/{accept,decline}`,
`GET /api/driver/deliveries`, `GET /api/driver/deliveries/:orderId`,
`POST /api/driver/deliveries/:orderId/{pick-up,deliver}`.

## Database Impact

Migration 7: `driver_profiles` (created alongside `restaurants` in migration 3
and populated here) and `delivery_assignments`, with the three partial unique
indexes — `uq_assignments_driver_active`, `uq_assignments_order_accepted`,
`uq_assignments_order_open` — plus `idx_assignments_expiry` and
`idx_drivers_dispatch`.

Those indexes are the concurrency mechanism, not a safety net: the accept path
deliberately relies on the insert failing rather than on a prior existence
check, because check-then-insert is precisely the race being defended against.

## Frontend Impact

`driver/DashboardView`, `OffersView`, `ActiveDeliveryView`,
`DeliveryHistoryView`, `ProfileView`; `OfferCard` with a live expiry countdown,
`DeliveryStepper`, `DeliveryAddressPanel`, `AvailabilityToggle`;
`useDriverOffers` polling at 5 s while `AVAILABLE`; the admin `DriversView` with
the create form and the approval queue.

Driver screens are mobile-first: tap targets ≥44 px, one primary action at a
time, addresses selectable so they can be pasted into a maps app.

## Backend Impact

`modules/delivery/` with `dispatchService.js`, `offerService.js` and
`driver.service.js`; `jobs/dispatch.job.js`, `jobs/offerExpiry.job.js`,
`jobs/unassignedEscalation.job.js`, all wrapped in `runLocked`. Pick-up and
deliver are thin wrappers over `orders.transition(...)` preceded by an
assignment assertion, so the state machine remains the single authority.

## Validation

`availability ∈ {OFFLINE, AVAILABLE}` (`ON_DELIVERY` rejected from a client);
latitude/longitude ranges, required together; `vehicleType` enum;
`vehiclePlate` 2–20; `declineReason` ≤200; driver-creation fields per
spec-10; all IDs UUID and scoped to the caller.

## Error Cases

| Case | Expected |
|------|----------|
| Offer taken or expired | `409 OFFER_NO_LONGER_AVAILABLE` |
| Accepting with an active delivery | `409 DRIVER_HAS_ACTIVE_DELIVERY` |
| Going offline mid-delivery | `409 DRIVER_HAS_ACTIVE_DELIVERY` |
| Pick-up before `READY_FOR_PICKUP` | `409 INVALID_ORDER_TRANSITION` |
| Deliver before pick-up | `409 INVALID_ORDER_TRANSITION` |
| Another driver's assignment | `404` |
| Unapproved or suspended driver | `403 ACCOUNT_SUSPENDED` |
| `ON_DELIVERY` sent as an availability | `422` |
| Suspending a driver mid-delivery | `409 DRIVER_HAS_ACTIVE_DELIVERY` |

## Security Considerations

- **Drivers are admin-provisioned** (ADR-006): self-registration would put a stranger's home address one signup form away from anyone.
- **Progressive disclosure of PII:** an offer shows distance and district only; the full address, first name and masked phone appear only after acceptance. A driver never sees the customer's email or any other order.
- The masked phone is produced server-side; masking in the browser would be a picture of privacy rather than privacy.
- `driver_profiles.status = ACTIVE` is required in addition to the role, so a suspended driver receives no offers and can do nothing.
- Ownership is `driver_user_id = req.user.id` in SQL, so another driver's offer or delivery is a 404.
- `availability` cannot be set to `ON_DELIVERY` by a client, which would otherwise let a driver make themselves ineligible-but-idle or fake an assignment state.

## Related Specs

- [spec-08 — Delivery Assignment & Driver Operations](../specs/spec-08-delivery-assignment-driver-operations.md) (primary)
- [spec-07 — Order Placement & Lifecycle](../specs/spec-07-order-placement-lifecycle.md) (T7 and T9)
- [spec-02 — Identity, Authentication & Authorization](../specs/spec-02-identity-authentication-authorization.md) (driver accounts and guards)
- [spec-10 — Platform Administration & Reporting](../specs/spec-10-platform-administration-reporting.md) (driver provisioning slice)

## Dependencies

**Depends on:** story-07.
**Must happen before:** story-09 — reviews require delivered orders, and driver ratings require a driver.
**Can happen in parallel with:** the rest of story-10's admin surface.

## Testing Requirements

- Unit: Haversine distance; candidate ordering with null-location drivers last and the idle-time tie-break; offer expiry arithmetic; the `ON_DELIVERY` rejection.
- Integration: the `delivery.integration` suite. Required: dispatch creating exactly one offer on `CONFIRMED`; **two concurrent accepts producing exactly one `ACCEPTED`**; acceptance setting the order's driver, dispatch state and availability; expiry re-offering to a *different* driver (BR-D12); **the no-driver case leaving the order intact, uncancelled and escalated after 15 minutes**; pick-up before ready and deliver before pick-up both 409; another driver's order 404; delivery releasing the driver; admin force-cancel mid-delivery releasing the driver; a busy driver receiving no offers; suspension blocked mid-delivery; the offer payload containing no street address and the accepted payload containing one.
- Frontend: the countdown expires without a tap doing harm; the availability toggle surfaces its 409 readably; the stepper shows one primary action per state; the pending-approval driver sees an explanatory state rather than an error.
- E2E: `full-order-journey` completes through delivery; `no-driver-available`; `driver-single-delivery`.
