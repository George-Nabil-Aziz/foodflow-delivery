# Test Cases — Menu Management (TC-091 – TC-114)

> Covers [spec-04](../../sdd/specs/spec-04-menu-management.md) ·
> [story-03](../../sdd/stories/story-03-restaurant-onboarding-menu-management.md) ·
> FR-3.1 – FR-3.8 · BR-R3, BR-R5 – BR-R8, BR-M1 – BR-M4

**Priority rationale.** Mostly High: the menu is the input to cart pricing and
order snapshots, so a menu defect propagates into money. The availability
toggle is High because it is the restaurant's most frequent action of the day.

---

## Categories

### TC-091 — Owner creates a category
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** FR-3.1
**Type** API · **Priority** High
**Steps** 1. As `OWNER_A`, `POST /api/restaurant/categories` `{ name: "Desserts", displayOrder: 5 }`.
**Expected** 201 with the category scoped to `REST_A`.

### TC-092 — Duplicate category name in one restaurant is rejected case-insensitively
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-10 · **Rules** FR-3.3, BR-R3
**Type** API · **Priority** High
**Data** `CAT_NAME_DUP`
**Steps** 1. Create "Starters". 2. Create "starters".
**Expected** 409 on the second.
**Notes** Comes from `uq_categories_restaurant_name` on `lower(name)`, translated by constraint name — not from a service-level pre-check.

### TC-093 — The same category name is allowed in a different restaurant
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-10 · **Rules** BR-R3
**Type** API · **Priority** Medium
**Steps** 1. As `OWNER_A`, create "Starters". 2. As `OWNER_B`, create "Starters".
**Expected** Both 201 — uniqueness is scoped per restaurant, not global.

### TC-094 — A soft-deleted category name can be reused
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** BR-R3, ADR-013
**Type** Service · **Priority** Medium
**Steps** 1. Create "Seasonal". 2. Delete it. 3. Create "Seasonal" again.
**Expected** All succeed.
**Notes** Proves the partial predicate `WHERE deleted_at IS NULL` is on the unique index; without it, a deleted name would be permanently burned.

### TC-095 — Owner updates a category
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** FR-3.1
**Type** API · **Priority** Medium
**Steps** 1. `PATCH /api/restaurant/categories/{id}` with a new name, description and `displayOrder`.
**Expected** 200 with values persisted.

### TC-096 — Deleting a non-empty category is refused
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-11 · **Rules** FR-3.5, BR-R8
**Type** API · **Priority** High
**Pre** `CAT_A_MAINS` holds two non-deleted items.
**Steps** 1. `DELETE /api/restaurant/categories/{CAT_A_MAINS}`.
**Expected** 409 `CATEGORY_NOT_EMPTY` with the item count in `details`.
**Post** Category and items unchanged.

### TC-097 — Deleting an empty category succeeds as a soft delete
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** FR-3.6, ADR-013
**Type** Service · **Priority** Medium
**Data** `CAT_A_EMPTY`
**Steps** 1. Delete it. 2. Query the row.
**Expected** 204; `deleted_at` set; absent from both owner and public listings.

### TC-098 — Deactivating a category hides its items without changing their flags
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-12 · **Rules** BR-R7
**Type** Integration · **Priority** High
**Pre** `CAT_A_INACTIVE` contains `ITEM_IN_INACTIVE_CAT`, which is `is_available = true`.
**Steps** 1. Set the category `isActive: false`. 2. `GET /api/restaurants/{REST_A}/menu` anonymously. 3. Read the item row directly.
**Expected** Category and item absent from the public menu; the item's `is_available` is **still true**.
**Notes** The distinction matters: reactivating the category must restore the previous availability, not reset it.

### TC-099 — Bulk reorder is atomic
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** BR-M4
**Type** Service · **Priority** Medium
**Steps** 1. `PUT /api/restaurant/categories/order` with a payload where the last entry is invalid.
**Expected** 422; **no** category's `displayOrder` changed.
**Notes** This endpoint appears in spec-04 but is absent from the central API reference — see finding **D-01** in [coverage-analysis.md](../coverage-analysis.md).

### TC-100 — Duplicate displayOrder values still produce deterministic ordering
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** spec-04 edge cases
**Type** Service · **Priority** Low
**Steps** 1. Give two categories `displayOrder: 3`. 2. Fetch the menu twice.
**Expected** Both allowed; ties break on `created_at`, so the order is identical across requests.

---

## Food items

### TC-101 — Owner creates a food item
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** FR-3.2
**Type** API · **Priority** High
**Steps** 1. `POST /api/restaurant/items` with name, description, price `"58.00"`, image URL, `categoryId`, `isAvailable: true`.
**Expected** 201; `restaurant_id` set to `REST_A` by the server, not by the client.

### TC-102 — Duplicate item name within a category is rejected
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** FR-3.3
**Type** API · **Priority** Medium
**Steps** 1. Create "Mixed Grill" in `CAT_A_MAINS`. 2. Create "mixed grill" in the same category.
**Expected** 409 on the second.

### TC-103 — The same item name is allowed in a different category
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** FR-3.3
**Type** API · **Priority** Low
**Steps** 1. Create "Mixed Grill" in `CAT_A_MAINS` and in `CAT_A_SOUPS`.
**Expected** Both 201 — uniqueness is per category.

### TC-104 — Price boundary values
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-14 · **Rules** BR-R5
**Type** API · **Priority** High
**Data** `ITEM_PRICE_ZERO`, `ITEM_PRICE_NEG`, `ITEM_PRICE_3DP`, `ITEM_PRICE_MAX_OK`, `ITEM_PRICE_OVER`
**Steps** 1. Create items with `"0.00"`, `"-5.00"`, `"12.345"`, `"9999.99"`, `"10000.00"`.
**Expected** 422 · 422 · 422 · **201** · 422 respectively.
**Notes** `"9999.99"` must succeed — a test that only checks rejections would pass with an over-strict validator that blocks legitimate prices.

### TC-105 — Price is stored and returned as an exact decimal string
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** ADR-009, BR-F3
**Type** Service · **Priority** Critical
**Steps** 1. Create an item priced `"0.10"` and another at `"0.20"`. 2. Read both back.
**Expected** Returned as `"0.10"` and `"0.20"` strings, never as JS numbers; a sum through `money.add` gives exactly `"0.30"`.

### TC-106 — Item name and description length boundaries
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** validation §15
**Type** API · **Priority** Medium
**Data** `ITEM_NAME_SHORT`, `ITEM_NAME_LONG`, `ITEM_NAME_WS`
**Steps** 1. Create with a 1-char name, a 121-char name, a whitespace-only name, a 2-char name, a 120-char name, a 1001-char description.
**Expected** 422 · 422 · 422 · 201 · 201 · 422.

### TC-107 — Dangerous image URL schemes are rejected
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-15 · **Rules** validation §15, security
**Type** Security · **Priority** High
**Data** `ITEM_IMG_JS`, `ITEM_IMG_DATA`, `ITEM_IMG_LONG`
**Steps** 1. Create items with `javascript:alert(1)`, a `data:text/html` URL, and a 501-char URL.
**Expected** 422 each.
**Notes** The value lands in an `<img src>`, so this is an XSS control rather than a formatting rule.

### TC-108 — Cross-restaurant category assignment is refused
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-16 · **Rules** BR-R6
**Type** API · **Priority** High
**Data** `ITEM_CAT_FOREIGN`
**Steps** 1. As `OWNER_A`, create an item with `categoryId = CAT_B_PASTA`.
**Expected** 422 with `details[].field = "categoryId"`.

### TC-109 — Another restaurant's item is unreachable
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-17 · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `OWNER_A`, `GET`, `PATCH`, `DELETE` and toggle availability on an item of `REST_B`.
**Expected** 404 on all four; `REST_B`'s item unchanged.

### TC-110 — Availability toggle changes only availability
**Spec** spec-04 · **Story** story-03 · **AC** AC-03-13 · **Rules** FR-3.4
**Type** API · **Priority** High
**Steps** 1. Capture the full item row. 2. `PATCH /api/restaurant/items/{id}/availability` `{ isAvailable: false }`. 3. Re-read the row.
**Expected** 200; only `is_available` and `updated_at` differ — name, price, description, category and `display_order` are untouched.

### TC-111 — An unavailable item still appears on the public menu, flagged
**Spec** spec-04 · **Story** story-03, story-04 · **AC** AC-04-14 · **Rules** FR-3.7, FR-4.5
**Type** API · **Priority** High
**Data** `ITEM_UNAVAILABLE`
**Steps** 1. `GET /api/restaurants/{REST_A}/menu` anonymously.
**Expected** The item is present with `isAvailable: false`.
**Notes** Hiding it would make the restaurant look smaller than it is and would confuse a customer who saw it yesterday.

### TC-112 — Item deletion is a soft delete and removes it from the public menu
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** FR-3.6, BR-M1
**Type** Service · **Priority** High
**Steps** 1. `DELETE /api/restaurant/items/{id}`. 2. Read the row. 3. Fetch the public menu.
**Expected** 204; `deleted_at` set; absent from the public menu; the row still exists for order-history referential integrity.

### TC-113 — Owner listing includes inactive categories and unavailable items
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** FR-3.8
**Type** API · **Priority** Medium
**Steps** 1. As `OWNER_A`, `GET /api/restaurant/categories` and `GET /api/restaurant/items?isAvailable=false`.
**Expected** Inactive categories and unavailable items are returned — the owner must see what customers cannot, in order to fix it.

### TC-114 — Public menu fetch issues no N+1 queries
**Spec** spec-04 · **Story** story-03 · **AC** — · **Rules** NFR-6
**Type** Service · **Priority** Medium
**Pre** `REST_A` has 8 categories and 60 items.
**Steps** 1. Instrument the query count. 2. `GET /api/restaurants/{REST_A}/menu`.
**Expected** A constant number of queries (one for categories, one for items) regardless of category count — not 1 + N.
