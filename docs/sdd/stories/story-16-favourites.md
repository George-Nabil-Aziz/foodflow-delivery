# Story 16 — Favourites

**Phase:** 8 · **Depends on:** story-02, story-03, story-04 · **Blocks:** nothing

## Goal

Let a customer keep a shortlist of restaurants and dishes with a heart toggle,
see it on a Favourites page, and see their hearts already filled when they
browse — without ever hiding a favourite that cannot be ordered right now.

## User Story

> As a **customer**
> I want to heart the restaurants and dishes I like and find them again in one place
> So that I can order from my favourites quickly, and I can see when one is not available instead of wondering where it went.

## Scope

**In:** `favourite_restaurants` and `favourite_items`; idempotent add and remove
for both kinds; the list; the `isFavourite` flag on discovery and menu responses
for a signed-in customer; the heart on the restaurant card, the restaurant page
and menu item cards; the Favourites page and its sidebar link; Arabic strings;
a few seeded favourites for the demo customer.

**Out:** collections, sharing, notifications about favourites, reorder shortcuts,
favourites for guests.

## Actors

**CUSTOMER** only. Restaurant owners, drivers and admins are refused with 403;
anonymous visitors browse as before and see no hearts.

## Preconditions

- Story-02 for accounts, roles and the optional-authentication middleware.
- Story-03 for food items, categories and availability.
- Story-04 for the public restaurant list, detail, menu and search the flag rides on.

## Functional Requirements

Implements spec-16: FR-16.1 – FR-16.9.

1. Favourite and unfavourite a restaurant (`PUT` / `DELETE /api/favourites/restaurants/:id`).
2. Favourite and unfavourite a food item (`PUT` / `DELETE /api/favourites/items/:id`).
3. `GET /api/favourites` returns both lists, newest first.
4. A heart toggle on the restaurant card, restaurant page and menu item cards, for customers only, optimistic with rollback.
5. A Favourites page in the customer sidebar with restaurants, dishes and an empty state.
6. `isFavourite` on the restaurant list, detail, menu and search responses for a signed-in customer.
7. Unavailable restaurants and items are shown as unavailable, not hidden; an available item links to its restaurant's menu.
8. Unfavouriting on the page removes the entry.
9. Arabic strings.

## Business Rules

BR-FV1 – BR-FV8 from [spec-16](../specs/spec-16-favourites.md#business-rules).

The ones that shape behaviour most: a favourite belongs to the caller and no
route names a user (BR-FV1); add and remove are idempotent (BR-FV2); only
something visible to customers can be favourited, but an unavailable item can
(BR-FV3); nothing is hidden on the list (BR-FV5); and anonymous responses keep
their old shape, with a bad token treated as anonymous (BR-FV6).

## Acceptance Criteria

```gherkin
Given I am a customer
When I favourite a restaurant twice
Then both calls succeed and I have one favourite

Given I have favourited a restaurant
When I unfavourite it twice, or unfavourite something I never favourited
Then every call returns 204 and the list no longer has it

Given a restaurant that is suspended, pending, deleted or unknown
When I try to favourite it
Then I receive 404 RESOURCE_NOT_FOUND

Given a food item that is unavailable
When I favourite it
Then it is saved; a deleted item, or one of a suspended restaurant, is 404

Given I have favourited a closed restaurant, an unavailable dish and a retired dish
When I open the Favourites page
Then all three are listed, each marked as unavailable in text, and an available
  dish links to its restaurant's menu

Given another customer has favourites
When I list mine, or remove the same restaurant myself
Then I see none of theirs and theirs are untouched

Given I am signed in as a customer
When I browse the restaurants, a restaurant's menu, or search
Then my favourites come back with isFavourite true and the rest false, and the hearts render filled

Given I am anonymous, have an expired token, or am a restaurant owner
When I browse
Then the responses carry no isFavourite field and nothing is refused

Given I am a restaurant owner, driver or admin
When I call /api/favourites
Then I receive 403 FORBIDDEN_ROLE; with no token, 401

Given the server refuses a heart toggle
When I tap the heart
Then it goes back to its previous state and I see the error message
```

## API Impact

New `/api/favourites` routes (five); `isFavourite` added to four public GETs for
customers. See [api-design §4a](../architecture/api-design.md).

## Database Impact

Migration `015_favourites.js`: `favourite_restaurants` and `favourite_items`, each
with a composite primary key `(user_id, target_id)` and an index on
`(user_id, created_at DESC)`. See [database-design](../architecture/database-design.md).

## Frontend Impact

`FavouriteButton`, heart on `RestaurantCard`, `FoodItemCard` and
`RestaurantDetailView`, `FavouritesView` at `/account/favourites`, a sidebar
link, `favouriteApi`, `i18n/ar/favourites.js`.

## Backend Impact

New module `modules/favourites/`; discovery marks results through
`favourites/index.js`; `authenticateOptional` now treats a failed authentication
as anonymous; router mounted at `/api/favourites`; seed adds favourites for
`sara.idris@gmail.com`.

## Validation

`:id` must be a valid identifier (422 otherwise). No request body.

## Error Cases

| Case | Result |
|------|--------|
| Add an unknown, deleted or non-`ACTIVE` target | 404 `RESOURCE_NOT_FOUND` |
| Malformed id | 422 `VALIDATION_ERROR` |
| Wrong role / no token | 403 `FORBIDDEN_ROLE` / 401 `TOKEN_MISSING` |

## Security Considerations

The user id is taken from the token, never from the request, so there is no
IDOR surface. Hidden restaurants and deleted items answer 404 exactly like
missing ones, so favouriting cannot be used to probe for them. A bad token on a
public route is treated as anonymous and never reveals why it was rejected.

## Related Specs

- [spec-16 — Favourites](../specs/spec-16-favourites.md) (primary)
- [spec-05 — Restaurant Discovery & Search](../specs/spec-05-restaurant-discovery-search.md)
- [spec-04 — Menu Management](../specs/spec-04-menu-management.md)

## Dependencies

**Depends on:** story-02, story-03, story-04.
**Must happen before:** nothing.
**Can happen in parallel with:** story-17.

## Testing Requirements

- Integration: `backend/tests/integration/favourites.test.js` (real PostgreSQL) — idempotency, 404 and 422 cases, the unavailable states on the list, cross-customer isolation, role and anonymous refusals, and the flag on list, detail, menu and search (present for a customer, absent for anonymous, a bad token and an owner). The router audit in `authorization.test.js` covers the new routes.
- Frontend: `frontend/tests/component/favouritesAndAnalytics.test.js` — the heart, the cards, and the Favourites page.
