# Spec 04 — Menu Management

**Status:** Approved · **Owner:** Restaurants · **Covers:** FR-3.1 – FR-3.6

## Objective

Give restaurants a menu model that is easy to maintain day to day — especially
"we're out of this" — while guaranteeing that editing a menu can never alter a
historical order or silently change what a customer is about to pay.

## Scope

**In scope**
- `menu_categories` and `food_items` tables.
- Owner CRUD for categories and items, including display ordering.
- The availability toggle as a first-class, one-click operation.
- Soft deletion and the rules governing it.
- The public menu projection consumed by spec-05 and validated against by spec-06.
- Menu management screens.

**Out of scope** — customer browsing UI (spec-05), cart validation behaviour
(spec-06), order snapshots (spec-07), image uploads (future enhancement; URLs
today).

## Actors

- **RESTAURANT** — owns and edits their menu.
- **CUSTOMER / public** — reads the public projection.
- **ADMIN** — read-only visibility through spec-10.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-3.1 | Categories with `name`, `description`, `displayOrder`, `isActive` |
| FR-3.2 | Items with `name`, `description`, `price`, `imageUrl`, `isAvailable`, `categoryId`, `displayOrder` |
| FR-3.3 | Category names unique per restaurant; item names unique per category |
| FR-3.4 | `PATCH /items/:id/availability` toggles availability without touching anything else |
| FR-3.5 | Deleting a category holding non-deleted items returns 409 |
| FR-3.6 | Categories and items are soft-deleted |
| FR-3.7 | The public projection returns active categories in `displayOrder`, each with its non-deleted items, unavailable ones included and flagged |
| FR-3.8 | The owner's projection returns everything, including inactive categories and soft-delete-free item lists, with filters by category and availability |

## Business Rules

BR-R3 (names), BR-R5 (price), BR-R6 (category ownership), BR-R7 (inactive
category), BR-R8 (non-empty delete) from
[master-sdd §7.2](../master-sdd.md#72-restaurant--menu-rules).

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-R5 | `0 < price ≤ 9999.99`, exactly 2 decimals | Zod + `chk_food_items_price` |
| BR-R6 | An item's category must belong to the same restaurant | Service check → 422; plus a database trigger keeping the denormalized `restaurant_id` consistent |
| BR-R7 | An inactive category hides itself and its items from public responses without changing item `isAvailable` flags | Public projection filters `is_active`; the toggle never cascades to items |
| BR-R8 | Deleting a non-empty category → `409 CATEGORY_NOT_EMPTY` | Service check + `ON DELETE RESTRICT` as the backstop |
| BR-M1 | Soft-deleted items remain referenced by `order_items.food_item_id` until the row is hard-deleted; the order's snapshot is unaffected either way | `ON DELETE SET NULL` (BR-O2) |
| BR-M2 | Deleting an item removes it from **live carts** (carts are ephemeral) but never from orders | `cart_items.food_item_id ON DELETE CASCADE`; spec-06 surfaces `ITEM_REMOVED` on the next cart read |
| BR-M3 | A price change takes effect immediately for carts and future orders, and never for existing orders | ADR-008 + BR-O1 |
| BR-M4 | Reordering is a bulk operation on `displayOrder`, applied in one transaction | Prevents a half-reordered menu |

## Data Requirements

`menu_categories` and `food_items` per
[database-design §4](../architecture/database-design.md#4-table-detail).

Load-bearing:
- `uq_categories_restaurant_name UNIQUE (restaurant_id, lower(name)) WHERE deleted_at IS NULL`.
- `uq_food_items_category_name UNIQUE (category_id, lower(name)) WHERE deleted_at IS NULL`.
- `idx_food_items_restaurant_available (restaurant_id, is_available) WHERE deleted_at IS NULL` — the menu and cart-validation hot path.
- `idx_food_items_name_trgm` — spec-05's search.
- `food_items.restaurant_id` denormalized with a consistency trigger (rationale in [database-design](../architecture/database-design.md#food_items)).

## API Requirements

| Method | Route | Auth | Role | Notes |
|--------|-------|------|------|-------|
| GET | `/api/restaurant/categories` | 🔓 | R +own | Includes inactive |
| POST | `/api/restaurant/categories` | 🔓 | R +own | 409 on a duplicate name |
| PATCH | `/api/restaurant/categories/:id` | 🔓 | R +own | Name, description, order, `isActive` |
| DELETE | `/api/restaurant/categories/:id` | 🔓 | R +own | 409 `CATEGORY_NOT_EMPTY` |
| PUT | `/api/restaurant/categories/order` | 🔓 | R +own | `[{ id, displayOrder }]`, atomic |
| GET | `/api/restaurant/items` | 🔓 | R +own | `?categoryId=&isAvailable=&q=` |
| POST | `/api/restaurant/items` | 🔓 | R +own | |
| PATCH | `/api/restaurant/items/:id` | 🔓 | R +own | |
| PATCH | `/api/restaurant/items/:id/availability` | 🔓 | R +own | `{ isAvailable }` |
| DELETE | `/api/restaurant/items/:id` | 🔓 | R +own | Soft delete |
| GET | `/api/restaurants/:id/menu` | — | public | The public projection (spec-05 consumes it) |

All owner routes additionally require `requireApprovedRestaurant` — a pending
restaurant builds its profile first (spec-03 FR-2.7).

```jsonc
// POST /api/restaurant/items
{ "categoryId": "…", "name": "Mixed Grill",
  "description": "Lamb, chicken and kofta over rice",
  "price": "58.00", "imageUrl": "https://…/grill.jpg",
  "isAvailable": true, "displayOrder": 3 }
```

`price` is accepted as a string or a number and normalized to a 2-decimal
string. Accepting a float and storing it as `NUMERIC` is safe; doing arithmetic
on it in JS is not, which is why nothing downstream of the schema treats it as a
number (BR-F3).

## Frontend Requirements

- `restaurant/CategoriesView` — the list in display order, an active switch on every row, an Edit link per row, and a delete that explains the non-empty rule before the API has to. It no longer edits inline: "New category" and Edit open `restaurant/CategoryFormView`.
- `restaurant/CategoryFormView` — "New category" (`/restaurant/categories/new`) and "Edit category" (`/restaurant/categories/:id/edit`) on a page of their own: name, description and display order (a new category defaults to the end of the menu). Saving returns to the Categories page. There is no single-category endpoint, so an edit finds its category in the list.
- `restaurant/MenuItemsView` — table grouped by category, filters by category and availability, search by name, and a **prominent availability switch on every row**: "we ran out of this" is the single most frequent menu action, and it must never require opening a form.
- `MenuItemForm` — modal with image URL and preview; price input constrained to 2 decimals; category select limited to the owner's own categories.
- Optimistic availability toggle with rollback and a toast on failure.
- Empty states that lead somewhere: no categories → "Create your first category"; a category with no items → "Add an item".

## Backend Requirements

Module `modules/menu/` with `categories.service.js`, `items.service.js`,
`menu.repository.js`, `menu.mapper.js`.

Public interface:
- `getMenuForRestaurant(restaurantId, { publicOnly })` — one query for categories and one for items, assembled in memory (NFR-6: two queries, never one per category).
- `getItemsByIds(ids, { trx })` — used by cart and checkout.
- `assertItemOrderable(itemId, { trx })` — throws `422 ITEM_UNAVAILABLE` or `404`; the single authority spec-06 and spec-07 both call.

Ownership is applied in SQL: every owner query carries
`restaurant_id = req.restaurant.id`, so another restaurant's item ID returns 404
rather than being fetched and then rejected.

## Validation

Per [master-sdd §15](../master-sdd.md#15-validation) for category and food item,
plus:
- `categoryId` must resolve to a non-deleted category **of the caller's restaurant** → otherwise 422 with `details[].field = "categoryId"` (BR-R6). This is a business check, not a schema check, because it needs the database.
- `price`: string or number, `>0`, `≤9999.99`, at most 2 decimal places; `"0"`, `"-5"`, `"12.345"` all rejected.
- `imageUrl`: optional, `http`/`https` only, ≤500 chars. A `javascript:` or `data:` URL is rejected — it would be rendered in an `<img src>` and is an XSS vector.

## Authorization

`authorize('RESTAURANT')` + `requireApprovedRestaurant` + ownership on every
write. The public menu endpoint is unauthenticated but only serves restaurants
with `status = ACTIVE` (BR-R2) — a pending restaurant's menu is not browsable,
even by direct ID.

## Error Handling

| Condition | Response |
|-----------|----------|
| Duplicate category name in one restaurant | `409` (from `23505` translated by constraint name) |
| Duplicate item name in one category | `409` |
| Deleting a category with items | `409 CATEGORY_NOT_EMPTY` with the item count in `details` |
| `categoryId` belonging to another restaurant | `422` — deliberately not 404: the caller owns the *item* operation, and naming the real problem is more useful than hiding a category ID the caller already guessed |
| Another restaurant's item ID | `404 RESOURCE_NOT_FOUND` |
| Price with 3 decimals | `422` |
| Public menu of a pending restaurant | `404` |

## Testing Requirements

Unit — item and category schemas at every boundary; the price rule including
`"12.345"`, `"0"`, `"-1"` and `"10000.00"`; `imageUrl` rejecting `javascript:`;
the public-projection assembler ordering categories and items by `displayOrder`.

Integration — CRUD happy paths; duplicate names in the same restaurant conflict
while the same name in a *different* restaurant succeeds; a soft-deleted name
can be reused (the partial index proves it); non-empty category delete 409;
cross-restaurant `categoryId` 422; cross-restaurant item access 404; the
availability toggle changes only `is_available`; deactivating a category hides
its items from the public projection **without** changing their availability
flags (BR-R7); bulk reorder is atomic; the public projection excludes
soft-deleted items and includes unavailable ones flagged (FR-3.7); a query-count
assertion proving no N+1 on a menu with 8 categories and 60 items.

Frontend — the availability switch fires the dedicated endpoint and not a full
update; the form blocks a 3-decimal price before submitting; the delete dialog
warns about the non-empty rule; drag-reorder persists and rolls back on failure.

## Edge Cases

| Case | Expected |
|------|----------|
| Item deleted while in a customer's cart | The cart's next read reports `ITEM_REMOVED` for that line; checkout is blocked until resolved (BR-M2, BR-C8/C9) |
| Price changed while in a cart | The cart shows the new price and flags `PRICE_CHANGED` — the customer is never charged a price they did not see (BR-C8) |
| Price changed after checkout | The order is untouched (BR-O1) — the defining test for G2 |
| Category deactivated with items in carts | Items become non-orderable; carts flag them; checkout blocked |
| Item marked unavailable mid-checkout | Checkout re-validates and fails with `422 CART_HAS_ISSUES` |
| Two owners create the same item name | Both succeed — uniqueness is scoped per category, not global |
| Reordering with a duplicate `displayOrder` | Allowed; ties break by `created_at` so ordering stays deterministic |

## Related Stories

- [story-03 — Restaurant Onboarding, Profile & Menu Management](../stories/story-03-restaurant-onboarding-menu-management.md) (primary)
- [story-04 — Restaurant Discovery, Search & Menu Browsing](../stories/story-04-restaurant-discovery-menu-browsing.md) (the public projection)
- [story-05 — Cart Management](../stories/story-05-cart-management.md) (item orderability checks)

## Dependencies

**Depends on:** [spec-01](spec-01-platform-foundation-api-contract.md), [spec-02](spec-02-identity-authentication-authorization.md), [spec-03](spec-03-restaurant-profile-operations.md).
**Depended on by:** [spec-05](spec-05-restaurant-discovery-search.md), [spec-06](spec-06-cart-management.md), [spec-07](spec-07-order-placement-lifecycle.md).
