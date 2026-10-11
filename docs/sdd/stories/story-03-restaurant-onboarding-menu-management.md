# Story 03 — Restaurant Onboarding, Profile & Menu Management

**Phase:** 2 · **Depends on:** story-02 · **Blocks:** story-04, story-05, story-07

## Goal

Give the platform real supply: a restaurant owner registers, completes their
profile and hours, gets approved by an admin, and builds a menu of categories
and items they can take on and off sale in one tap.

## User Story

> As a **restaurant owner**
> I want to set up my restaurant and manage my menu
> So that customers can see what I sell and order it, and I can take items off sale the moment I run out.

## Scope

**In:** `restaurants`, `restaurant_hours`, `menu_categories`, `food_items`;
owner profile and hours management; the accepting-orders toggle; orderability;
category and item CRUD with ordering and availability; the restaurant dashboard;
**and the admin approve/reject endpoints and approval queue**, because without
them no restaurant can ever trade and the rest of this story is untestable end
to end.

**Out:** customer-facing browsing (story-04), order processing (story-07), the
rest of the admin surface (story-10).

## Actors

- **RESTAURANT** — primary.
- **ADMIN** — approves, rejects.

## Preconditions

- Story-02 complete: registration can create a restaurant owner and the `PENDING_APPROVAL` shell.
- A seeded admin account exists.

## Functional Requirements

Implements spec-03 (FR-2.1 – FR-2.8), spec-04 (FR-3.1 – FR-3.8), and the
approval slice of spec-10 (FR-9.2 for restaurants, FR-9.6 auditing).

1. A registered owner sees their `PENDING_APPROVAL` restaurant and can edit its profile and hours immediately.
2. The owner sets the seven-day schedule in one submission.
3. An admin sees the pending queue and approves or rejects with a reason.
4. Approval requires at least one available food item (BR-AD10).
5. Once `ACTIVE`, the owner can toggle `is_accepting_orders`.
6. The owner manages categories: create, rename, reorder, activate/deactivate, delete when empty.
7. The owner manages food items: create, edit, set availability in one action, soft-delete.
8. `isOrderable` is computed server-side and shown on the dashboard as an unambiguous open/closed state.
9. The owner dashboard shows today's counts, revenue and rating.

## Business Rules

BR-R1 – BR-R12 from [spec-03](../specs/spec-03-restaurant-profile-operations.md#business-rules)
and [spec-04](../specs/spec-04-menu-management.md#business-rules); BR-AD1,
BR-AD5, BR-AD10 from [spec-10](../specs/spec-10-platform-administration-reporting.md#business-rules).

Highest-consequence: one restaurant per owner; a restaurant is orderable only
when `ACTIVE` **and** accepting **and** within hours; category names unique per
restaurant and item names unique per category; a non-empty category cannot be
deleted; an inactive category hides its items without changing their
availability flags.

## Acceptance Criteria

```gherkin
Given I registered as a restaurant owner
When I log in
Then I see my restaurant with status PENDING_APPROVAL and a banner explaining that
  customers cannot see it yet

Given my restaurant is PENDING_APPROVAL
When I update my profile and opening hours
Then both save successfully

Given my restaurant is PENDING_APPROVAL
When I open the menu or orders screens
Then they are visibly disabled with an explanation, and the API returns
  403 RESTAURANT_NOT_APPROVED

Given I am an admin and a restaurant is pending with at least one available item
When I approve it
Then its status becomes ACTIVE, an audit row is written, and it appears in the
  customer restaurant listing

Given a pending restaurant has no available food items
When I try to approve it
Then I receive 422 explaining that a restaurant needs at least one available item

Given I am an admin
When I reject a restaurant with the reason "Address could not be verified"
Then its status becomes REJECTED and the owner sees that exact reason on their profile

Given my restaurant is ACTIVE
When I submit opening hours missing Wednesday
Then I receive 422 naming the missing day, and my previously saved hours are unchanged

Given I submit hours where a day closes at 02:00 and opens at 22:00
When the request is processed
Then I receive 422 explaining that overnight hours are not supported in this version

Given my restaurant is ACTIVE and within opening hours
When I turn off "accepting orders"
Then isOrderable becomes false immediately and customers see the restaurant as paused

Given I have a category named "Starters"
When I create another category named "starters"
Then I receive 409 — names are unique per restaurant regardless of case

Given a category contains two items
When I delete the category
Then I receive 409 CATEGORY_NOT_EMPTY with the item count

Given a category contains items that are all available
When I deactivate the category
Then the category and its items disappear from the public menu,
  and every item's isAvailable flag is unchanged

Given an item is available
When I toggle its availability off
Then only is_available changes, and the item still appears on the public menu
  marked unavailable

Given I submit a food item priced "12.345"
When the request is processed
Then I receive 422 — prices carry exactly two decimals

Given I submit a food item with an imageUrl of "javascript:alert(1)"
When the request is processed
Then I receive 422

Given another restaurant's category ID
When I assign one of my items to it
Then I receive 422 naming categoryId

Given another restaurant's item ID
When I request or modify it
Then I receive 404 RESOURCE_NOT_FOUND
```

## API Impact

New: `GET/PATCH /api/restaurant/profile`; `GET/PUT /api/restaurant/hours`;
`PATCH /api/restaurant/accepting-orders`; `GET /api/restaurant/stats`;
category CRUD + `PUT /api/restaurant/categories/order`; item CRUD +
`PATCH /api/restaurant/items/:id/availability`;
`GET /api/restaurants/:id/menu` (public projection);
`GET /api/admin/restaurants`, `POST /api/admin/restaurants/:id/{approve,reject}`.

## Database Impact

Migrations 3–4: `restaurants`, `restaurant_hours`, `menu_categories`,
`food_items` with `uq_restaurants_owner`, `uq_restaurants_slug`,
`uq_hours_restaurant_day`, the two partial unique name indexes, the price and
hours check constraints, the trigram indexes, and the trigger keeping
`food_items.restaurant_id` consistent with its category.

## Frontend Impact

`restaurant/DashboardView`, `ProfileView`, `HoursView`, `CategoriesView`,
`MenuItemsView`; `HoursEditor`, `AcceptingOrdersToggle`, `CategoryForm`,
`MenuItemForm`, `MenuItemTable`; the `DashboardLayout` sidebar; and the admin
`RestaurantsView` approval queue with `RestaurantApprovalCard`.

The availability switch sits on every row of the item table, because "we ran out"
is the most frequent action of the restaurant's day and must never require
opening a form.

## Backend Impact

`modules/restaurants/` (including `orderability.js`), `modules/menu/`, the
`requireApprovedRestaurant` middleware, and the approval slice of
`modules/admin/` with `audit.service.js`.

## Validation

Restaurant, hours, category and food-item rules from
[master-sdd §15](../master-sdd.md#15-validation), plus the business-level checks
that need the database: `categoryId` must belong to the caller's restaurant, and
the hours payload must contain all seven days exactly once.

## Error Cases

| Case | Expected |
|------|----------|
| Menu action while pending | `403 RESTAURANT_NOT_APPROVED` |
| Duplicate category or item name | `409` |
| Delete a non-empty category | `409 CATEGORY_NOT_EMPTY` |
| Cross-restaurant `categoryId` | `422` |
| Another restaurant's item | `404` |
| Hours missing or duplicating a day | `422` |
| `closesAt ≤ opensAt` | `422` explaining the overnight limitation |
| Price with 3 decimals, ≤0, or >9999.99 | `422` |
| `javascript:`/`data:` image URL | `422` |
| Approve a restaurant with no items | `422` |

## Security Considerations

- Restaurant-scoped routes **never accept a restaurant ID** — it is derived from the token, so the IDOR surface does not exist.
- `status`, `ratingAverage` and `ratingCount` are absent from every owner-writable schema, so an owner cannot self-approve or inflate their rating.
- Image URLs are validated to `http(s)` because they land in an `<img src>`.
- Public menu reads serve only `ACTIVE` restaurants; a pending restaurant's menu is 404 even by direct ID.
- Admin approval and rejection are audited in the same transaction as the status change.

## Related Specs

- [spec-03 — Restaurant Profile & Operating Status](../specs/spec-03-restaurant-profile-operations.md)
- [spec-04 — Menu Management](../specs/spec-04-menu-management.md)
- [spec-02 — Identity, Authentication & Authorization](../specs/spec-02-identity-authentication-authorization.md) (owner role and guards)
- [spec-10 — Platform Administration & Reporting](../specs/spec-10-platform-administration-reporting.md) (approval slice only)

## Dependencies

**Depends on:** story-02.
**Must happen before:** story-04 (nothing to browse without menus), story-07 (no orders without restaurants).
**Can happen in parallel with:** the early scaffolding of story-10's non-approval admin screens, since they touch different endpoints.

## Testing Requirements

- Unit: the `orderability` truth table across `status × accepting × inHours`, including the boundary minutes; slug generation and collision suffixing; the seven-day hours schema; price and image-URL rules; the public-projection assembler's ordering.
- Integration: owner isolation (a second owner sees nothing of the first); atomic hours replacement; pending vs approved route access; approval making the restaurant appear in the listing within the same test; approval blocked with no items; rejection reason surfacing to the owner; duplicate names conflicting per scope and succeeding across restaurants; soft-deleted name reuse; non-empty category delete; cross-restaurant category assignment; category deactivation hiding items without changing their flags; a query-count assertion proving no N+1 on a menu of 8 categories and 60 items.
- Frontend: the pending banner and disabled navigation; the hours editor blocking an incomplete week; the availability switch calling the dedicated endpoint; drag-reorder persisting and rolling back on failure; the approval queue updating after an action.
- E2E: `restaurant-approval` — a pending restaurant is absent from the customer listing, is approved by an admin, and then appears and can be browsed.
