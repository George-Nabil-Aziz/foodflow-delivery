# Story 04 — Restaurant Discovery, Search & Menu Browsing

**Phase:** 3 · **Depends on:** story-03 · **Blocks:** story-05

## Goal

Let a visitor find somewhere to order from: a filterable, sortable, paginated
list of open restaurants, a search that spans restaurants and dishes, and a
menu page that makes clear what can actually be ordered right now.

## User Story

> As a **customer**
> I want to browse, filter and search restaurants and their menus
> So that I can find food I want from a place that is open and can deliver to me.

## Scope

**In:** the public restaurant listing with filters and sorting; restaurant
detail and public menu; combined search; the cuisine list; `isOpenNow` /
`isOrderable` on every payload; the home, listing and detail screens; URL-driven
filter state.

**Out:** adding to cart (story-05), reviews content (story-09 — this story
renders the aggregate rating that spec-09 maintains), map or distance-based
ranking (non-goal).

## Actors

Anyone, authenticated or not. Discovery is public: requiring a login to see what
the platform offers loses customers before they exist.

## Preconditions

- Story-03 complete: approved restaurants with categories and items exist.
- Seed data includes at least one restaurant in each of `ACTIVE`, `PENDING_APPROVAL` and `SUSPENDED`, so the visibility rules are exercised from the first run.

## Functional Requirements

Implements spec-05 in full: FR-4.1 – FR-4.7.

1. `GET /api/restaurants` lists `ACTIVE` restaurants, paginated (default 20, max 100).
2. Filters: cuisine, open-now, minimum rating, name fragment. Sorts: rating, delivery fee, name, newest — each ascending or descending.
3. `GET /api/search?q=` returns matching restaurants and food items in one response.
4. `GET /api/restaurants/:id` and `/menu` serve detail and the public menu projection.
5. Unavailable items appear, flagged, rather than disappearing.
6. Every restaurant payload carries `isOpenNow`, `isAcceptingOrders` and `isOrderable`.
7. `GET /api/cuisines` lists cuisines that currently have at least one active restaurant.

## Business Rules

BR-R2, BR-R3 and BR-D5.1 – BR-D5.6 from
[spec-05](../specs/spec-05-restaurant-discovery-search.md#business-rules).

The one worth stating plainly: **restaurants with no ratings sort last under
`sort=rating`, not as zero stars.** A new restaurant is not a bad restaurant,
and ranking it below one-star venues would be both unfair and factually wrong.

## Acceptance Criteria

```gherkin
Given approved, pending and suspended restaurants exist
When I request the restaurant listing
Then only the ACTIVE ones are returned

Given a pending restaurant's ID
When I request it directly
Then I receive 404 RESOURCE_NOT_FOUND

Given 21 active restaurants exist
When I request page 2 with a limit of 20
Then I receive 1 restaurant and meta.pagination shows total 21 and totalPages 2

Given I request a limit of 500
When the request is processed
Then I receive 422 naming the maximum of 100

Given restaurants with and without ratings exist
When I sort by rating descending
Then rated restaurants appear first in descending order and unrated ones appear last

Given a restaurant is ACTIVE, accepting orders, and within today's hours
When I view the listing
Then its isOrderable is true

Given a restaurant is ACTIVE and accepting orders but outside today's hours
When I view the listing
Then isOrderable is false and the card shows a "Closed" badge with text, not colour alone

Given I filter by openNow=true
When the request is processed
Then only restaurants whose server-computed orderability is true are returned

Given a restaurant sells "Mixed Grill"
When I search for "rill"
Then both the restaurant and the item are returned — matching is partial and case-insensitive

Given a food item belongs to a suspended restaurant
When I search for its name
Then it does not appear in the results

Given I search for "%"
When the request is processed
Then the wildcard is escaped and treated as literal text, not as a match-everything pattern

Given I pass sort=passwordHash
When the request is processed
Then I receive 422 — sorting is restricted to an allow-list

Given a restaurant has an inactive category
When I view its public menu
Then neither the category nor its items appear

Given a restaurant has an unavailable item in an active category
When I view its public menu
Then the item appears with isAvailable false and its add button is disabled with
  a visible "Unavailable" label

Given I apply filters and then reload the page
When the page loads
Then my filters are restored from the URL

Given no restaurants match my filters
When the results render
Then I see an empty state offering to clear the filters, not an error
```

## API Impact

New: `GET /api/restaurants`, `GET /api/restaurants/:id`,
`GET /api/restaurants/:id/menu`, `GET /api/search`, `GET /api/cuisines`.
All public and on the router audit test's allow-list.

## Database Impact

No new tables. Depends on indexes created in story-03: `idx_restaurants_browse`,
`idx_restaurants_cuisine`, `idx_restaurants_rating`,
`idx_restaurants_name_trgm`, `idx_food_items_name_trgm`,
`idx_food_items_restaurant_available`.

## Frontend Impact

`public/HomeView`; `customer/RestaurantListView` with a filter sidebar on
desktop and a filter sheet on mobile; `customer/RestaurantDetailView` with
sticky category navigation; `RestaurantCard`, `RestaurantFilters`,
`MenuCategorySection`, `FoodItemCard`; `useRestaurants`, `useMenu`,
`usePagination`.

Filter state lives in the URL query string so a filtered list is shareable and
survives refresh and the back button. Search is debounced at 300 ms, cancels
in-flight requests and requires two characters.

## Backend Impact

`modules/discovery/` — owns no tables and composes the `restaurants` and `menu`
module interfaces. Filters and sorts are applied in SQL; the paginated count
uses a window function rather than a second scan; search runs one query per
result group.

## Validation

Query parameters per
[spec-05 §Validation](../specs/spec-05-restaurant-discovery-search.md#validation):
`page`, `limit` (1–100), `cuisine` enum, `openNow` boolean, `minRating` 1–5,
`q` 2–60 with `%` and `_` escaped, `sort`/`order` from allow-lists.

Escaping `%` and `_` is not cosmetic: unescaped, a search for `%` returns the
entire table and turns the search box into a full-table-scan button.

## Error Cases

| Case | Expected |
|------|----------|
| `q` under 2 chars or only whitespace | `422`; the client does not fire the request at all |
| `limit` over 100 | `422` naming the cap |
| `sort` outside the allow-list | `422` before any SQL is built |
| Non-`ACTIVE` restaurant by ID | `404` |
| Page beyond the last | `200` with an empty array and accurate `meta` |
| No results | `200` with `data: []` — an empty result is not an error |

## Security Considerations

- Public endpoints expose only public fields: no owner email, no approval metadata, no internal status detail.
- Search input is parameterized and wildcard-escaped; `sort`/`order` are allow-listed and never interpolated.
- The `limit` cap and the global rate limiter bound the cost of an anonymous request.
- Only `ACTIVE` restaurants are reachable, so an unapproved restaurant's menu is not browsable by direct ID.

## Related Specs

- [spec-05 — Restaurant Discovery & Search](../specs/spec-05-restaurant-discovery-search.md) (implements in full)
- [spec-04 — Menu Management](../specs/spec-04-menu-management.md) (consumes the public menu projection)

## Dependencies

**Depends on:** story-03.
**Must happen before:** story-05 — the customer reaches the cart from a menu.
**Can happen in parallel with:** story-10's admin screens.

## Testing Requirements

- Unit: query-parameter boundaries; the wildcard-escaping helper; the unrated-last sort ordering; **the SQL-vs-JS orderability consistency test**, since `openNow` is the one place the rule is expressed twice.
- Integration: non-`ACTIVE` restaurants absent from lists and 404 by ID; each filter alone and combined; each sort's ordering; pagination at the 21-row boundary; `openNow` against fixtures with hours before, during and after now; mid-word and case-insensitive search; items from inactive restaurants excluded; the menu projection including flagged unavailable items and excluding inactive categories; a query-count assertion proving no N+1 on a 20-restaurant page.
- Frontend: filters round-trip through the URL; back/forward restore state; debounce fires once for rapid typing; the closed badge appears exactly when `isOrderable` is false; the empty state offers to clear filters; axe passes on the list and detail views at 360, 768 and 1440 px.
- E2E: browse → filter by cuisine → search → open a restaurant → see the menu with one item marked unavailable.
