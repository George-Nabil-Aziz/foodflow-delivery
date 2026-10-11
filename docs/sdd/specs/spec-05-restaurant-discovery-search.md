# Spec 05 — Restaurant Discovery & Search

**Status:** Approved · **Owner:** Discovery · **Covers:** FR-4.1 – FR-4.5

## Objective

Let a customer find somewhere to order from: browse active restaurants, filter
and sort them, search across restaurants and dishes, and open a menu — with
orderability always decided by the server so the UI never offers an order the
API will refuse.

## Scope

**In scope**
- Paginated public restaurant listing with filters and sorting.
- Restaurant detail and public menu projection.
- Combined restaurant + food-item search.
- The cuisine list feeding the filter UI.
- `isOpenNow` / `isOrderable` computation on every listed restaurant.
- Customer home, listing and detail screens.

**Out of scope** — menu authoring (spec-04), cart (spec-06), reviews content
(spec-09; this spec only surfaces the aggregate rating), geospatial "near me"
ranking (future enhancement).

## Actors

Anyone, authenticated or not. Discovery is public: requiring a login to see what
a platform offers loses customers before they exist.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-4.1 | `GET /api/restaurants` returns `ACTIVE` restaurants, paginated, default 20, max 100 |
| FR-4.2 | Filters: `cuisine`, `openNow`, `minRating`, `q`. Sorts: `rating`, `deliveryFee`, `name`, `newest`, each `asc`/`desc` |
| FR-4.3 | `GET /api/search?q=` returns matching restaurants and food items in one response |
| FR-4.4 | `GET /api/restaurants/:id` and `/menu` return the detail and the public menu projection |
| FR-4.5 | Unavailable items appear in the menu marked `isAvailable: false` rather than being hidden |
| FR-4.6 | Every restaurant payload carries `isOpenNow`, `isAcceptingOrders` and `isOrderable` |
| FR-4.7 | `GET /api/cuisines` returns the cuisines that currently have at least one active restaurant |

## Business Rules

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-R2 | Only `ACTIVE` restaurants are discoverable | Repository predicate; non-active by direct ID → 404 |
| BR-R3 | `isOrderable` comes from spec-03's single implementation | `restaurants/orderability.js` |
| BR-D5.1 | Search matches on partial, case-insensitive substrings of names, minimum 2 characters | `pg_trgm` + `ILIKE` with bound parameters |
| BR-D5.2 | Food-item results are excluded when their restaurant is not `ACTIVE` | Join predicate |
| BR-D5.3 | `openNow=true` filters on computed orderability, not merely on `status` | Filter applied over the same computation |
| BR-D5.4 | Sorting is only ever by an allow-listed column | Enum-validated `sort`/`order`; never interpolated |
| BR-D5.5 | Ratings shown are the maintained aggregates, never computed per request | `restaurants.rating_average` / `rating_count` |
| BR-D5.6 | Restaurants with no ratings sort last under `sort=rating`, rather than appearing as 0-star | `ORDER BY rating_count = 0, rating_average DESC` |

BR-D5.6 matters more than it looks: a new restaurant with no reviews is not a
bad restaurant, and ranking it below 1-star venues would be both unfair and
wrong.

## Data Requirements

No new tables. Reads `restaurants`, `restaurant_hours`, `menu_categories`,
`food_items` through the `restaurants` and `menu` module interfaces — `discovery`
owns no tables of its own, which is why it may compose the two.

Indexes this spec depends on (defined in spec-03/04):
`idx_restaurants_browse`, `idx_restaurants_cuisine`, `idx_restaurants_rating`,
`idx_restaurants_name_trgm`, `idx_food_items_name_trgm`,
`idx_food_items_restaurant_available`.

## API Requirements

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/restaurants` | — | `page, limit, cuisine, openNow, minRating, q, sort, order` |
| GET | `/api/restaurants/:id` | — | 404 for non-`ACTIVE` |
| GET | `/api/restaurants/:id/menu` | — | Public projection |
| GET | `/api/search` | — | `q` (2–60, required), `limit` ≤20 per group |
| GET | `/api/cuisines` | — | `[{ cuisineType, restaurantCount }]` |

Payload shapes in
[api-design §4](../architecture/api-design.md#4-discovery--apirestaurants-public-reads).

## Frontend Requirements

- `public/HomeView` — search bar, cuisine chips, a "top rated" strip.
- `customer/RestaurantListView` — filter sidebar (desktop) / filter sheet (mobile), sort dropdown, result grid, pagination, and distinct **empty** ("no restaurants match these filters" with a clear-filters action) and **error** (with retry) states.
- `RestaurantCard` — logo, name, cuisine, rating with count, delivery fee, minimum order, prep time, and an explicit closed/paused badge when `isOrderable` is false.
- `customer/RestaurantDetailView` — cover image, profile summary, today's hours, a sticky category navigation, and the menu grouped by category.
- `FoodItemCard` — unavailable items render greyed with a disabled add button whose `aria-disabled` and visible text both say "Unavailable", never just a color change (NFR-14).
- Filter state lives in the URL query string, so a filtered list is shareable and survives a refresh and the back button.
- Search is debounced at 300 ms, cancels in-flight requests, and requires 2 characters before firing.

## Backend Requirements

Module `modules/discovery/` — routes, controller, service, repository. It owns
no tables and composes `restaurants` and `menu`.

Query construction rules:
- Filters are applied in SQL, never by fetching and filtering in Node.
- `openNow` is expressed as a SQL condition on `restaurant_hours` for the current day plus the `status`/`is_accepting_orders` flags, matching `orderability.js` exactly. A unit test asserts the SQL filter and the JS function agree on a shared fixture set — this is the one place the orderability rule is expressed twice, so it is the one place that needs a consistency test.
- The count query for pagination runs alongside the page query in one round trip using a window function, not as a second full scan.
- Search runs one query per group (restaurants, items), never per result.

## Validation

| Field | Rule |
|-------|------|
| `page` | integer ≥1, default 1 |
| `limit` | integer 1–100, default 20 |
| `cuisine` | from the cuisine enum |
| `openNow` | boolean coerced from `"true"`/`"false"` |
| `minRating` | number 1–5 |
| `q` | 2–60 chars, trimmed; `%` and `_` escaped before reaching `ILIKE` |
| `sort` | ∈ `{rating, deliveryFee, name, newest}` |
| `order` | ∈ `{asc, desc}` |

Escaping `%` and `_` is not optional: unescaped, a search for `%` returns the
entire table and turns the search box into a full-table-scan button.

## Authorization

None — all routes are public and on the router audit test's allow-list. The
authorization question here is **what is exposed**: only `ACTIVE` restaurants,
and only public fields. The owner's email, the approval metadata and internal
status detail are not in the public mapper.

## Error Handling

| Condition | Response |
|-----------|----------|
| `q` shorter than 2 chars | `422` with a clear message; the UI does not fire the request at all |
| `limit=500` | `422` naming the 100 cap |
| `sort=passwordHash` | `422 VALIDATION_ERROR` — the allow-list rejects it before any SQL is built |
| Non-`ACTIVE` restaurant by ID | `404` |
| No results | `200` with `data: []` and `meta.pagination.total = 0` — an empty result is not an error |

## Testing Requirements

Unit — query-parameter schema boundaries; the `%`/`_` escaping helper; the
rating sort placing unrated restaurants last (BR-D5.6); the SQL-vs-JS
orderability consistency test.

Integration — pending, suspended and rejected restaurants absent from the
listing and 404 by direct ID; each filter applied in isolation and in
combination; each sort's ordering; pagination `total`/`totalPages` correctness
at a boundary (21 rows, limit 20); `openNow` correct against fixtures with
hours before, during and after the current time; search matching mid-word
("rill" finds "Mixed Grill"), matching case-insensitively, and excluding items
from inactive restaurants; the menu projection including unavailable items and
excluding inactive categories; a query-count assertion proving no N+1 on a
20-restaurant page.

Frontend — filters write to and read from the URL; back/forward restore filter
state; debounce fires once for rapid typing; the card's closed badge appears
exactly when `isOrderable` is false; the empty state offers a clear-filters
action; an axe pass on the list and detail views.

## Edge Cases

| Case | Expected |
|------|----------|
| Restaurant is suspended between the list render and the detail click | Detail returns 404; the UI shows "This restaurant is no longer available" and links back to the list |
| Restaurant closes between listing and add-to-cart | The add fails `422 RESTAURANT_UNAVAILABLE`; the customer sees why |
| Search term with SQL metacharacters (`'`, `;`, `--`) | Treated as literal text; parameterized bindings make it inert |
| Search term of only spaces | Trimmed to empty → `422` |
| A restaurant with an empty menu | Detail renders with an "menu coming soon" empty state, not an error |
| Every item in a category unavailable | The category still renders, with all items marked unavailable — hiding it would make the restaurant look smaller than it is |
| `page` beyond the last page | `200` with an empty array and accurate `meta`, not a 404 |

## Related Stories

- [story-04 — Restaurant Discovery, Search & Menu Browsing](../stories/story-04-restaurant-discovery-menu-browsing.md) (primary and sole)

## Dependencies

**Depends on:** [spec-01](spec-01-platform-foundation-api-contract.md), [spec-03](spec-03-restaurant-profile-operations.md) (orderability, `ACTIVE` restaurants), [spec-04](spec-04-menu-management.md) (the menu projection). Not dependent on spec-02 — these routes are public.
**Depended on by:** [spec-06](spec-06-cart-management.md) (the customer reaches the cart from here).
