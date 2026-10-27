# Story 18 — Delivery Zones

**Phase:** 8 · **Depends on:** story-03, story-04, story-06 · **Blocks:** nothing

## Goal

Make each restaurant deliver only within a zone it chooses, tell the customer
before they build a cart whether a restaurant reaches their address, and refuse
an out-of-zone order on the server whatever the screen showed — using the
coordinates the platform already stores, with no geocoding service.

## User Story

> As a **customer**
> I want to see which restaurants deliver to my address, and be told plainly when one does not
> So that I do not fill a cart for a restaurant that cannot serve me.
>
> As a **restaurant owner**
> I want to set how far I deliver
> So that I only receive orders I can actually fulfil.
>
> As a **platform administrator**
> I want to see each restaurant's delivery radius, and orders I place for a customer to follow the same rule
> So that support does not create orders the restaurant cannot deliver.

## Scope

**In:** `restaurants.delivery_radius_km` (1–30 km, default 8); a reusable
haversine and zone check; discovery annotations (`deliversToAddress`,
`distanceKm`, `zoneChecked`) for a signed-in customer on the list, the
restaurant page and search; the authoritative check in `insertOrder` (checkout
and admin placement) with `422 OUTSIDE_DELIVERY_ZONE`; the owner's radius and
coordinates on the profile screen; the radius in the admin restaurant details;
seed zones; Arabic strings.

**Out:** polygon or district zones; a distance-based delivery fee; road
distance; geocoding; driver-side limits; the delivery ETA (it will reuse the
distance function); a delivery address on the cart.

## Actors

**CUSTOMER** (sees and is bound by the zone), **RESTAURANT** (sets its radius),
**ADMIN** (sees the radius; placed orders follow the rule). DRIVER has no part
in it.

## Preconditions

- Story-03 for the owner's profile screen and restaurant coordinates.
- Story-04 for the discovery list, page and search the annotations ride on.
- Story-06 for checkout and `insertOrder`.

## Functional Requirements

Implements spec-18: FR-18.1 – FR-18.11.

1. Each restaurant has a `delivery_radius_km`, default 8, between 1 and 30.
2. The owner reads and changes it, and sets the restaurant's coordinates, on the profile screen.
3. A signed-in customer's list, restaurant page and search report `deliversToAddress`, `distanceKm` (one decimal) and `zoneChecked`, for the selected (`?addressId=`) or default address.
4. Anonymous visitors, non-customers and customers without an address see no change.
5. `insertOrder` refuses an out-of-zone address with `422 OUTSIDE_DELIVERY_ZONE` (`distanceKm`, `radiusKm`); nothing is written.
6. The refusal covers cash, card, discount codes, and admin placement.
7. The card and page say "Doesn't deliver to your address"; add-to-cart is disabled with that reason.
8. Checkout shows a specific, translated message with the distance and radius.
9. The admin restaurant details show the radius.
10. The distance function and zone check are exported for reuse.
11. The seed gives every restaurant a radius, most addresses inside, and some outside.

## Business Rules

BR-DZ1 – BR-DZ8 from [spec-18](../specs/spec-18-delivery-zones.md#business-rules).

The ones that shape behaviour most: inside means at most the radius, judged on
the unrounded distance (BR-DZ1, BR-DZ5); checkout is authoritative and the
annotations are a convenience (BR-DZ3); **a point that cannot be measured is
allowed** — a missing coordinate on the restaurant or the address means no
refusal, and discovery says `zoneChecked: false` (BR-DZ4); annotations use only
the customer's own address and ignore an unknown one (BR-DZ6); and a stale token
on a public page is anonymous, not an error (BR-DZ7).

## Acceptance Criteria

```gherkin
Given a restaurant with the default radius
Then delivery_radius_km is 8.0

Given I am a restaurant owner
When I set my delivery radius to 12.5
Then GET /api/restaurant/profile returns deliveryRadiusKm 12.5

Given I am a restaurant owner
When I send a radius of 0, 0.5, 31, -3 or "abc"
Then I receive 422 VALIDATION_ERROR and nothing changes

Given I am an admin
When I list restaurants
Then each row shows its deliveryRadiusKm and coordinates

Given I am a customer whose default address is 0.6 km from a restaurant
When I list restaurants
Then that restaurant has deliversToAddress true and distanceKm 0.6

Given my default address is 20 km from a restaurant with an 8 km radius
When I list restaurants or open its page or search for it
Then it has deliversToAddress false and its distanceKm

Given I have a default address and another address
When I list restaurants with ?addressId= the other one
Then the annotations use the other address

Given I am anonymous, or send a stale token, or have no address, or name an address that is not mine
When I list restaurants or open a restaurant
Then the response has no deliversToAddress or distanceKm and the page does not fail

Given my address has no coordinates
When I open a restaurant
Then deliversToAddress is true, distanceKm is null and zoneChecked is false

Given an address inside the zone
When I check out
Then the order is placed

Given an address outside the zone
When I check out
Then I receive 422 OUTSIDE_DELIVERY_ZONE with distanceKm and radiusKm, no order
  or payment exists and my cart is still ACTIVE

Given the owner then widens the radius to cover the address
When I check out again
Then the order is placed

Given an address outside the zone and a card payment
When I check out
Then I receive 422 OUTSIDE_DELIVERY_ZONE and no payment row exists

Given an address, or a restaurant, without coordinates
When I check out
Then the order is placed (the zone cannot be checked)

Given I am an admin placing an order for a customer
When the customer's address is outside the restaurant's zone
Then I receive 422 OUTSIDE_DELIVERY_ZONE and no order is written

Given the restaurant does not deliver to my address
When I view its card or page
Then it says "Doesn't deliver to your address", the page states the distance and
  the radius, and Add is disabled with that reason

Given checkout returns OUTSIDE_DELIVERY_ZONE
Then the page shows a message with the radius and the distance, in English and Arabic
```

## API Impact

`GET /api/restaurants`, `GET /api/restaurants/:id` and `GET /api/search` use
optional sign-in, accept `?addressId=` and add `deliveryRadiusKm` and, for a
customer with an address, `deliversToAddress`, `distanceKm`, `zoneChecked`.
`GET/PATCH /api/restaurant/profile` gain `deliveryRadiusKm`, `latitude`,
`longitude`; `GET /api/admin/restaurants` rows gain the same.
`POST /api/orders` and `POST /api/admin/orders` can return
`422 OUTSIDE_DELIVERY_ZONE`. The cart API is unchanged (spec-18 A-DZ2).

## Database Impact

Migration `016_delivery_zones`: `restaurants.delivery_radius_km numeric(4,1)
NOT NULL DEFAULT 8` with `chk_restaurants_delivery_radius CHECK (… BETWEEN 1 AND
30)`. No index. The development seed gives every restaurant a radius.

## Frontend Impact

`RestaurantCard`, `RestaurantDetailView` and `FoodItemCard` show and enforce the
"Doesn't deliver to your address" state; `CheckoutView` maps
`OUTSIDE_DELIVERY_ZONE` to its own message; the owner `ProfileView` gains
**Delivery radius (km)**, **Latitude** and **Longitude**; the admin restaurant
details gain **Delivery radius**. Arabic strings in `i18n/ar/zones.js`.

## Backend Impact

`shared/geo.js` (`haversineKm`), `restaurants/deliveryZone.js`
(`distanceToRestaurantKm`, `checkDeliveryZone`, exported through
`restaurants/index.js`), `users.getBrowsingAddress`, discovery routes with
`authenticateOptional`, and the zone check in `orders.service.insertOrder`. The
SQL haversine used for driver dispatch is left as it is.
`authenticateOptional` now drops an authentication failure instead of passing it
on.

## Validation

`deliveryRadiusKm` 1–30 rounded to one decimal; `latitude` −90…90; `longitude`
−180…180; discovery `addressId` a UUID. The database repeats the radius bounds.

## Error Cases

| Case | Expected |
|------|----------|
| Address outside the zone at checkout or admin placement | `422 OUTSIDE_DELIVERY_ZONE` (`distanceKm`, `radiusKm`); no order, no payment, cart `ACTIVE` |
| Radius outside 1–30 | `422 VALIDATION_ERROR` |
| Unknown or foreign `addressId` on discovery | `200` without annotations |
| Address or restaurant without coordinates | Allowed; `zoneChecked: false` in discovery |

## Security Considerations

- **The server decides:** the screen can be bypassed, so the zone is enforced in `insertOrder` (BR-DZ3).
- **No address enumeration:** discovery resolves `addressId` only among the caller's own addresses and says nothing about one that is not theirs (BR-DZ6).
- **Public stays public:** a bad token on a discovery page degrades to anonymous (BR-DZ7).
- **No new secrets or third-party calls:** the distance is computed locally.

## Related Specs

- [spec-18 — Delivery Zones](../specs/spec-18-delivery-zones.md) (primary)
- [spec-03 — Restaurant Profile & Operations](../specs/spec-03-restaurant-profile-operations.md)
- [spec-05 — Restaurant Discovery & Search](../specs/spec-05-restaurant-discovery-search.md)
- [spec-07 — Order Placement & Lifecycle](../specs/spec-07-order-placement-lifecycle.md) (`insertOrder`)

## Dependencies

**Depends on:** story-03 for the profile screen and restaurant coordinates; story-04 for discovery; story-06 for checkout and `insertOrder`.
**Must happen before:** nothing (a later delivery-ETA feature will reuse the distance function).
**Can happen in parallel with:** nothing — it extends code those stories own.

## Testing Requirements

- Unit: `backend/tests/unit/deliveryZone.test.js` — haversine (zero, known distances, symmetry, NUMERIC strings, `null` for a missing coordinate); `checkDeliveryZone` (inside, outside, the rounded-versus-exact case, the boundary, a missing coordinate on either side).
- Integration: `backend/tests/integration/deliveryZones.test.js` (real PostgreSQL) — default and edited radius, rejected values, the database constraint, the admin list; discovery annotations from the default and a chosen address, on list, page and search; no annotation for anonymous, stale-token, no-address and foreign-address requests; an address without coordinates; checkout inside and outside (details, nothing written, cart intact), widened radius, card, missing coordinates on either side; admin placement refused.
- Frontend: `tests/component/deliveryZones.test.js` — the card and food card states, anonymous and Arabic; the checkout message. `node scripts/i18n-check.mjs` reports 0 missing.
- The router audit test (`authorization.test.js`) stays green.
