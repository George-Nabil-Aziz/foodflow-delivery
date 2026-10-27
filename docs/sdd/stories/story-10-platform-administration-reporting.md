# Story 10 — Platform Administration & Reporting

**Phase:** 6 · **Depends on:** story-02 (partially shipped earlier — see below) · **Blocks:** nothing

## Goal

Give administrators the controls the platform cannot operate without — account
management, intervention in stuck orders, review moderation and a dashboard that
shows what is actually happening — with every action recorded.

## User Story

> As a **platform administrator**
> I want to manage accounts, intervene when an order is stuck, moderate abusive reviews and see how the platform is performing
> So that the marketplace stays trustworthy and problems get fixed before customers give up on us.

## Scope

**In:** user listing, search, suspend and reactivate; the remaining restaurant
lifecycle actions (suspend, reactivate) and the driver roster; order oversight,
the stuck-order views and force-cancel; review moderation; platform statistics;
`admin_audit_logs` across every mutation; the full admin UI.

**Shipped earlier, deliberately:** restaurant approve/reject arrived in
story-03, and driver creation and approval in story-08. Both are prerequisites
of the stories they sit in — without approval no restaurant can trade, and
without driver provisioning nothing can be delivered. Holding them until Phase 6
would have made stories 03 and 08 untestable end to end. This story completes
the admin surface rather than introducing it.

**Out:** the business logic being administered (owned by specs 03, 07, 08, 09);
financial reporting and payouts (non-goals); tiered admin permissions
([assumptions.md](../assumptions.md) A-13).

## Actors

**ADMIN** only.

## Preconditions

- Story-02 for the identity model and guards.
- Story-03, story-07, story-08 and story-09 for the entities being administered. The story is scheduled in Phase 6 so that every one of them exists.

## Functional Requirements

Implements spec-10: FR-9.1 – FR-9.11.

1. List, filter and search users, restaurants and drivers.
2. Approve, reject, suspend and reactivate restaurants and drivers.
3. Suspension revokes refresh tokens immediately and blocks existing access tokens.
4. View any order; force-cancel an active one with a mandatory reason.
5. Platform statistics: orders by status, GMV, account counts, unassigned backlog, average delivery time; today's numbers and the 30-day average rating; 30-day leaderboards (restaurants, drivers, customers, items, top rated) and a recent-activity feed.
6. Every mutation writes an `admin_audit_logs` row in the same transaction.
7. Create driver accounts with a one-time initial password.
8. Hide and restore reviews, recomputing aggregates.
9. A stuck-order view: unassigned past 15 minutes, `PENDING` past the timeout, `OUT_FOR_DELIVERY` past 90 minutes.
10. Place an order on an active customer's behalf, to one of their saved addresses, paid cash on delivery.
11. Create customer, admin and restaurant-owner accounts with a one-time initial password; a customer may start with a default delivery address.

## Business Rules

BR-AD1 – BR-AD12 from [spec-10](../specs/spec-10-platform-administration-reporting.md#business-rules).

The ones that shape behaviour most: an admin cannot suspend their own account
(BR-AD7 — locking the last admin out is unrecoverable); a driver holding an
active delivery cannot be suspended (BR-AD4 — an order in someone's car is not
made safer by locking the driver out); suspending a restaurant does not cancel
its in-flight orders (BR-AD3/BR-R9); and GMV counts `DELIVERED` orders only
(BR-AD9), because counting cancelled orders as revenue would make the metric a
lie.

## Acceptance Criteria

```gherkin
Given I am an admin
When I suspend a user
Then their refresh tokens are revoked and their existing access token is rejected
  on their very next request

Given I am an admin
When I try to suspend my own account
Then I receive 422 — an admin cannot lock themselves out

Given a driver is currently on an accepted delivery
When I try to suspend them
Then I receive 409 DRIVER_HAS_ACTIVE_DELIVERY naming the order

Given a driver has an unaccepted offer
When I suspend them
Then the suspension succeeds and the offer expires and is re-dispatched

Given a restaurant has orders in PENDING, PREPARING and OUT_FOR_DELIVERY
When I suspend it
Then it disappears from customer listings, all three orders complete normally,
  and its owner can still log in and see what happened

Given an order is stuck OUT_FOR_DELIVERY
When I force-cancel it with a reason
Then it becomes CANCELLED with cancelledBy ADMIN, a status event is written,
  the assignment is cancelled and the driver becomes AVAILABLE

Given an order is DELIVERED
When I try to force-cancel it
Then I receive 409 INVALID_ORDER_TRANSITION — terminal states are terminal, even
  for an admin

Given I force-cancel an order without a reason
Then I receive 422

Given I perform any mutating admin action
When the transaction commits
Then exactly one admin_audit_logs row exists for it, naming me, the action,
  the entity and the reason

Given a review is abusive
When I hide it
Then it disappears from the public list and the restaurant's rating average is
  recomputed without it

Given I restore a hidden review
Then it reappears and the aggregate returns to its previous value

Given orders exist across every status
When I open the statistics endpoint
Then GMV counts only DELIVERED orders, and the status breakdown matches the
  actual counts

Given two orders have been unassigned for more than 15 minutes
When I open the dashboard
Then the unassigned backlog shows 2 and links to those orders

Given I am not an admin
When I call any /api/admin route
Then I receive 403 FORBIDDEN_ROLE

Given I am an admin performing a destructive action
When I open the confirmation dialog
Then it names the specific consequence and requires a reason before the confirm
  button is enabled

Given an active customer with a saved address and an item in their cart
When I place an order for them at an orderable restaurant with two dishes
Then I receive 201 with the order, PENDING and CASH_ON_DELIVERY, its totals
  computed by the server, its first status event attributed to me with actor
  role ADMIN, one ORDER_PLACED audit row, and their cart left as it was

Given I place an order for a customer with an item of another restaurant
Then I receive 404 and no order is written

Given I place an order whose subtotal is below the restaurant's minimum
Then I receive 422 BELOW_MINIMUM_ORDER

Given I place an order for a customer with another customer's address
Then I receive 404

Given a customer is suspended
When I try to place an order for them
Then I receive 422 — only an active customer can have an order placed for them

Given I am an admin
When I create a CUSTOMER account with a delivery address
Then I receive 201 with the account, ACTIVE, and an initial password shown only
  this once, the address is saved as their default in the same transaction,
  and one USER_CREATED audit row is written

Given I create an ADMIN or RESTAURANT account with an address
Then I receive 422 — an address is for a customer only

Given I create a RESTAURANT account
Then its restaurant is created PENDING_APPROVAL, and going live stays a separate
  approval
```

## API Impact

New (completing the group in
[api-design §10](../architecture/api-design.md#10-admin--apiadmin)):
`GET /api/admin/stats`; `GET /api/admin/users`, `POST /api/admin/users`,
`GET /api/admin/users/:id`, `GET /api/admin/users/:id/addresses`,
`POST /api/admin/users/:id/{suspend,reactivate}`;
`POST /api/admin/restaurants/:id/{suspend,reactivate}`;
`DELETE` and `POST …/restore` for users, drivers and restaurants;
`POST /api/admin/orders`, `GET /api/admin/orders`, `GET /api/admin/orders/:id`,
`GET /api/admin/orders/{unassigned,stuck}`,
`POST /api/admin/orders/:id/force-cancel`;
`GET /api/admin/reviews`, `POST /api/admin/reviews/:id/{hide,restore}`;
`GET /api/admin/audit-logs`.

## Database Impact

Migration 9: `admin_audit_logs` (append-only, with no update or delete path in
code) and `notifications`. Adds `idx_orders_delivered_at … WHERE status =
'DELIVERED'` for the GMV and average-delivery-time queries.

## Frontend Impact

`admin/DashboardView` with today's tiles, a live activity feed, orders by
status, the platform numbers and the 30-day leaderboards, and a "Needs
attention" link to `AttentionView`; `UserListView` (Customers, Admins),
`RestaurantsView`, `DriversView`, `OrdersView`, `ReviewsView`; the create pages
`AccountCreateView`, `DriverCreateView` and `OrderCreateView`; the shared
`FilterSelect`, `PageTitle`, `AccountStatusBadge`, `RatingStars`,
`DetailsDialog` and `OrderDetailsDialog`. Details in
[spec-10](../specs/spec-10-platform-administration-reporting.md#frontend-requirements).

Every destructive action uses `ConfirmDialog` with a required reason and a named
consequence — "This will cancel order FF-20260922-4K9P2M and release the
driver" — because an admin acting on the wrong row is the realistic failure
mode, not an admin acting maliciously.

## Backend Impact

`modules/admin/` completed: `admin.service.js`, `stats.service.js`,
`audit.service.js`, `admin.repository.js`. The module **owns only
`admin_audit_logs`**; everything else goes through the owning module's public
interface. An admin module writing directly to `orders` would create a second
status-changing code path and G3 would stop being true.

## Validation

`reason` required and 5–300 characters for suspend, reject, hide and
force-cancel; list filters from enums; `q` 1–60; `from`/`to` ISO dates with
`from ≤ to`; pagination; UUID path params. Placing an order: 1–50 items,
quantity 1–20, no item twice. Creating an account: `restaurantName` for a
RESTAURANT, `address` for a CUSTOMER only.

## Error Cases

| Case | Expected |
|------|----------|
| Suspending oneself | `422` |
| Suspending a driver mid-delivery | `409 DRIVER_HAS_ACTIVE_DELIVERY` |
| Force-cancelling a terminal order | `409 INVALID_ORDER_TRANSITION` |
| Missing reason | `422` |
| Approving an already-`ACTIVE` restaurant | `409` with the current status |
| Duplicate driver or account email | `409 EMAIL_ALREADY_REGISTERED` |
| Placing an order for a suspended customer | `422` |
| Placing an order with another restaurant's item or another customer's address | `404` |
| Placing an order below the minimum | `422 BELOW_MINIMUM_ORDER` |
| Non-admin on any admin route | `403 FORBIDDEN_ROLE` |

## Security Considerations

- **Audit everything:** the audit row and the change commit in the same transaction, so an unaudited mutation is not merely discouraged — it is impossible without deleting the code that writes it.
- **No password recovery path:** admins never see stored passwords; a created driver's initial password is returned exactly once, at creation, and is never retrievable afterwards (BR-AD8).
- **Self-protection:** BR-AD7 stops an admin from locking the platform out of its own administration.
- **Audit-log readability** is the only real check on the admin role in a single-tier model, so `GET /api/admin/audit-logs` exists specifically so admins can review each other.
- `authorize('ADMIN')` on every route; the other three roles get 403 on all of them, asserted route by route.
- Suspension revoking sessions is the payoff for the refresh-token design (ADR-004) and is tested by proving a pre-suspension access token stops working.

## Related Specs

- [spec-10 — Platform Administration & Reporting](../specs/spec-10-platform-administration-reporting.md) (primary)
- [spec-02 — Identity, Authentication & Authorization](../specs/spec-02-identity-authentication-authorization.md) (suspension and session revocation)
- [spec-07 — Order Placement & Lifecycle](../specs/spec-07-order-placement-lifecycle.md) (force-cancel through the state machine)
- [spec-09 — Reviews & Ratings](../specs/spec-09-reviews-ratings.md) (moderation and aggregate recomputation)

## Dependencies

**Depends on:** story-02 for the guards; story-03, story-07, story-08 and story-09 for the entities it administers.
**Must happen before:** nothing.
**Can happen in parallel with:** story-04 through story-09 for the screens that do not touch those stories' entities — the user list and the audit log could be built any time after story-02. The approval slices it needs earliest are already shipped in story-03 and story-08.

## Testing Requirements

- Unit: statistics arithmetic against a fixed fixture (GMV excluding cancelled orders; average delivery time from `picked_up_at` to `delivered_at`); the audit payload builder; the self-suspension guard.
- Integration: the `admin.integration` suite. Required: **a suspended user's existing access token rejected on the next request**; suspension blocked for a driver mid-delivery; a suspended restaurant's in-flight orders completing while it leaves the listings; force-cancel releasing the driver and writing an event; force-cancel of a terminal order returning 409; hide lowering the aggregate and restore returning it; **a table-driven test asserting every mutating admin endpoint writes exactly one audit row**, so a new endpoint without auditing fails; and every `/api/admin/*` route returning 403 for the other three roles.
- Frontend: the dashboard surfaces pending approvals and stuck orders; destructive dialogs require a reason before enabling confirm; queues update after an action without a reload; axe passes on the dashboard and tables.
- E2E: `admin-suspends-restaurant` and `review-moderation`.
