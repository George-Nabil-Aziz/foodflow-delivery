# Spec 16 — Favourites

**Status:** Approved · **Owner:** Discovery · **Covers:** FR-16.1 – FR-16.9

## Objective

Let a customer keep a shortlist of restaurants and dishes they like, with a
heart on the cards and pages where they find them, and a Favourites page that
lists the shortlist and says plainly what cannot be ordered right now.

A shortlist is personal and low-stakes, so the rules are about three things only:
adding twice must not misbehave, one customer must never see or change another's
list, and a favourite must never silently vanish because a restaurant closed or a
dish was retired.

## Scope

**In scope**
- `favourite_restaurants` and `favourite_items`.
- Add and remove a favourite restaurant or food item (idempotent) and list both kinds.
- An `isFavourite` flag on discovery and menu responses for a signed-in customer.
- The heart toggle on the restaurant card, the restaurant page and menu item cards; the Favourites page and its sidebar link; English and Arabic.

**Out of scope** — collections or ordering of favourites, sharing a list,
notifications about a favourite (for example "your favourite is open"), a
"reorder from favourites" shortcut, favourites for guests (a guest has no account
to hold them).

## Actors

| Actor | Can |
|-------|-----|
| **CUSTOMER** | Add, remove and list their own favourites; see the flag on discovery and menu responses |
| **RESTAURANT / DRIVER / ADMIN** | None. `403 FORBIDDEN_ROLE` on `/api/favourites`; discovery responses carry no flag for them |
| **Anonymous** | Browse exactly as before; no flag, no hearts |

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-16.1 | A customer can favourite a restaurant (`PUT /api/favourites/restaurants/:id`) and unfavourite it (`DELETE`) |
| FR-16.2 | A customer can favourite a food item (`PUT /api/favourites/items/:id`) and unfavourite it (`DELETE`) |
| FR-16.3 | `GET /api/favourites` returns `{ restaurants, items }`, newest favourite first |
| FR-16.4 | The web app shows a heart toggle on the restaurant card, the restaurant page and every menu item card, for signed-in customers only; it fills at once and is put back with a message if the server refuses |
| FR-16.5 | The web app has a Favourites page for customers, linked from their sidebar, with a section for restaurants and one for dishes and an empty state |
| FR-16.6 | `GET /api/restaurants`, `GET /api/restaurants/:id`, `GET /api/restaurants/:id/menu` and `GET /api/search` add `isFavourite` to each restaurant and item for a signed-in customer, computed with one query per response |
| FR-16.7 | The Favourites page shows a restaurant that cannot take orders, and an item that is unavailable or deleted, marked as unavailable instead of hiding it; an available item links to its restaurant's menu |
| FR-16.8 | Unfavouriting on the Favourites page removes the entry from the page |
| FR-16.9 | Arabic strings in `i18n/ar/favourites.js` |

## Business Rules

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-FV1 | A favourite belongs to the caller. Every query is keyed by the user id from the token and no route carries a user id, so one customer never sees or changes another's list | `favourites.repository` (`WHERE user_id = ?`); isolation test |
| BR-FV2 | Add and remove are **idempotent**: favouriting twice leaves one row and the second call succeeds; removing something that is not a favourite (or does not exist) is `204` | Composite primary key `(user_id, target_id)` + `ON CONFLICT DO NOTHING`; `DELETE` of zero rows is not an error |
| BR-FV3 | Only something a customer can see can be favourited: the restaurant must be `ACTIVE` and not deleted; for an item, it must not be deleted and its restaurant must be `ACTIVE`. Anything else is `404 RESOURCE_NOT_FOUND`, the same as a missing id. An item that is merely **unavailable** can be favourited | `restaurants.getPublicRestaurant`, `menu.getItemsByIds` |
| BR-FV4 | Customers only | `authenticate` + `authorize('CUSTOMER')` on the router |
| BR-FV5 | Nothing is hidden on the list. A restaurant is returned with `isOrderable` and `isBrowsable`; an item with `isAvailable`, which is false when the item is switched off, deleted, in an inactive or deleted category, or its restaurant is not `ACTIVE`. The page renders the state as text | `favourites.service.listFavourites` |
| BR-FV6 | Anonymous responses are unchanged: the flag is **absent**, not `false`, for a visitor, an expired or invalid token, and any non-customer role. A bad token on a public route is treated as anonymous, never `401` | `authenticateOptional` ignores authentication failures; discovery marks only for `role = CUSTOMER` |
| BR-FV7 | The list returns at most the 200 most recent favourites of each kind | `LIST_LIMIT` |
| BR-FV8 | Favourites are removed with their user, restaurant or item (hard delete). Soft-deleted targets keep the row and show as unavailable | `ON DELETE CASCADE` |

## Data Requirements

```sql
favourite_restaurants (
  user_id       uuid NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, restaurant_id)
);
CREATE INDEX idx_favourite_restaurants_user ON favourite_restaurants (user_id, created_at DESC);

favourite_items (
  user_id      uuid NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  food_item_id uuid NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, food_item_id)
);
CREATE INDEX idx_favourite_items_user ON favourite_items (user_id, created_at DESC);
```

Migration `015_favourites.js`. Two tables rather than one polymorphic
`(kind, target_id)` table so each target is a real foreign key.

## API Requirements

All `CUSTOMER`:

| Method | Route | Purpose | Errors |
|--------|-------|---------|--------|
| GET | `/api/favourites` | `{ restaurants: [...], items: [...] }` | — |
| PUT | `/api/favourites/restaurants/:id` | Add; `200 { restaurantId, isFavourite: true }` | 404, 422 bad id |
| DELETE | `/api/favourites/restaurants/:id` | Remove; `204` | 422 bad id |
| PUT | `/api/favourites/items/:id` | Add; `200 { foodItemId, isFavourite: true }` | 404, 422 bad id |
| DELETE | `/api/favourites/items/:id` | Remove; `204` | 422 bad id |

Restaurant entries use the public restaurant fields plus `isFavourite: true`,
`favouritedAt` and `isBrowsable` (the restaurant is `ACTIVE` and not deleted, so
it has a page). Item entries carry `id, name, description, price, imageUrl,
isAvailable, isFavourite, favouritedAt` and `restaurant { id, name, isBrowsable }`.
Payloads in [api-design §4a](../architecture/api-design.md).

## Frontend Requirements

- `FavouriteButton` (`kind`, `id`, `name`, `favourite`): renders for `role = CUSTOMER` only, `aria-pressed`, an accessible name that says add or remove and for what, optimistic with rollback and an error toast. It stops the click so it does not follow a surrounding link.
- `RestaurantCard` and `FoodItemCard` show the heart only when the entry carries `isFavourite`. On the card the heart is a sibling of the link, never inside it. A restaurant with `isBrowsable: false` is not a link.
- `RestaurantDetailView` shows the heart beside the name.
- `FavouritesView` at `/account/favourites` (sidebar **Favourites**, after My orders): restaurants as cards, dishes as rows with price, restaurant link and **View menu**; unavailable ones say "Unavailable" in text; empty state with a link to the restaurants.
- Arabic strings in `i18n/ar/favourites.js`.

## Backend Requirements

Module `modules/favourites/` (`favourites.service.js`, `favourites.repository.js`,
`favourites.controller.js`, `favourites.routes.js`, `index.js`). Its public
interface is `restaurantIdsAmong` and `itemIdsAmong`, used by discovery, and the
router. It reads restaurants and the menu through their `index.js`; the list
queries join the tables for display.

Discovery gains an optional `viewerId`. `authenticateOptional` (in
`middleware/authenticate.js`) now ignores a failed authentication instead of
passing the error on, so a stale token cannot break a public page.

## Validation

| Field | Rule |
|-------|------|
| `:id` | valid identifier (`uuid` from `shared/validation/common.js`), else `422 VALIDATION_ERROR` |

There is no request body.

## Authorization

The router is `CUSTOMER`-only (`401 TOKEN_MISSING` without a token,
`403 FORBIDDEN_ROLE` for other roles). The caller's id comes from the token;
there is no way to name another user.

## Error Handling

| Condition | Response |
|-----------|----------|
| Unknown, soft-deleted or non-`ACTIVE` restaurant; deleted item or an item of a non-`ACTIVE` restaurant | `404 RESOURCE_NOT_FOUND` on add |
| Malformed id | `422 VALIDATION_ERROR` |
| Remove something that is not a favourite | `204` |

## Testing Requirements

Integration (`favourites.test.js`, real PostgreSQL) — add twice leaves one row;
remove twice and remove of an unknown id are `204`; 404 for missing, pending,
suspended and deleted restaurants and for deleted items and items of suspended
restaurants; an unavailable item can be favourited; the list returns both kinds
newest first without owner fields; closed, suspended, deleted-item, hidden-category
and soft-deleted-restaurant favourites are returned marked unavailable;
another customer's list is empty and their removal touches nothing; owner,
driver and admin get 403, anonymous 401; the flag appears on list, detail, menu
and search for a customer, and is absent for anonymous, a bad token and an owner.

Frontend (`favouritesAndAnalytics.test.js`) — the heart renders for customers
only, reflects and names its state, fills at once and calls the right API once,
rolls back with a toast on failure; cards show a heart only when marked and keep
it out of the link; a non-browsable restaurant is not a link; the page lists
unavailable entries as such, links an available item to its menu, drops an entry
on unfavourite and shows the empty state.

## Edge Cases

- Two taps in quick succession: the button ignores a second click while a call is in flight, and the API would absorb it anyway.
- A favourite whose restaurant later closes, is suspended or is deleted stays on the page as unavailable; if it comes back it is a favourite again with its original date.
- A customer is suspended and reactivated: their list is untouched.
- Pages carry the flag of the viewer who fetched them; the web app refetches on navigation.

## Related Stories

[Story 16](../stories/story-16-favourites.md).

## Dependencies

[Spec-05](spec-05-restaurant-discovery-search.md) (the public projection of
restaurants and the menu that carry the flag), [spec-04](spec-04-menu-management.md)
(items, categories and availability), [spec-02](spec-02-identity-authentication-authorization.md)
(accounts and roles).
