# Spec 18 — Delivery Zones

**Status:** Approved · **Owner:** Restaurants / Ordering · **Covers:** FR-18.1 – FR-18.11

## Objective

Until now any restaurant took an order to any address. A kitchen in Maadi
cannot realistically serve an address in 6th of October, and the customer found
out only when the order was late or cancelled. Each restaurant now delivers
inside a zone, the customer is told before they fill a cart, and the order path
refuses what the restaurant cannot serve.

The zone is deliberately simple: a **circle** around the restaurant's own
coordinates, with a radius the owner chooses. No polygons, no geocoding service,
no road distance — straight-line (great-circle) distance is what a restaurant
owner can reason about and what the platform already has coordinates for.

## Scope

**In scope**
- `restaurants.delivery_radius_km`, editable by the owner (1–30 km, default 8).
- A reusable distance function and zone check (`shared/geo.js`, `restaurants/deliveryZone.js`), exported through `restaurants/index.js` for later features (delivery ETA).
- Discovery annotations for a signed-in customer: `deliversToAddress`, `distanceKm`, `zoneChecked` on the restaurant list, a restaurant page and search.
- The authoritative check inside `insertOrder`, shared by checkout and the admin "Make an order" form: `422 OUTSIDE_DELIVERY_ZONE`.
- The owner's radius (and coordinates) on the restaurant profile screen; the radius in the admin restaurant details.
- Seed data with sensible zones, and some customer addresses deliberately outside a zone.

**Out of scope** — polygon or district zones, a radius per time of day, a
delivery fee that grows with distance, road or traffic distance, geocoding a
typed address into coordinates, driver-side distance limits, and the delivery
ETA itself (a later feature, which reuses the distance function).

## Actors

| Actor | Can |
|-------|-----|
| **CUSTOMER** | See whether each restaurant delivers to their address; is refused at checkout when it does not |
| **RESTAURANT** | Read and set its own delivery radius and coordinates (profile screen) |
| **ADMIN** | See a restaurant's radius in its details; placing an order for a customer follows the same rule |
| **DRIVER** | None |

## What location data exists

| Data | Latitude / longitude | Notes |
|------|----------------------|-------|
| `restaurants` | `latitude`, `longitude` `NUMERIC(9,6)`, **nullable** | Settable by the owner (`PATCH /api/restaurant/profile`); the seed fills them |
| `customer_addresses` | `latitude`, `longitude` `NUMERIC(9,6)`, **nullable** | Accepted by the address API but optional, so many addresses have none |
| `delivery_assignments`, `driver_profiles` | `current_latitude`, `current_longitude` | Dispatch sorts candidate drivers by a SQL haversine (`delivery.repository.findCandidates`); that SQL is left as it is |

Either side can therefore be missing. There is no geocoding service (out of
scope), so the rule for a missing coordinate is an explicit decision, **BR-DZ4**.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-18.1 | Each restaurant has a `delivery_radius_km`, default 8, between 1 and 30 inclusive, at one decimal |
| FR-18.2 | A restaurant owner reads and changes the radius from `GET/PATCH /api/restaurant/profile` (`deliveryRadiusKm`), and can set the restaurant's `latitude` and `longitude` the zone is measured from |
| FR-18.3 | For a signed-in **customer** with a delivery address, `GET /api/restaurants`, `GET /api/restaurants/:id` and `GET /api/search` add `deliversToAddress`, `distanceKm` and `zoneChecked` to each restaurant. The address is `?addressId=` when given and the customer's own, otherwise their default address |
| FR-18.4 | Anonymous requests, non-customers and customers with no address get exactly the response they got before |
| FR-18.5 | `insertOrder` refuses an address outside the zone with `422 OUTSIDE_DELIVERY_ZONE` and `details[0] = { field: 'addressId', distanceKm, radiusKm }`. Nothing is written: no order, no payment, no redemption, and the cart stays `ACTIVE` |
| FR-18.6 | The refusal applies to cash and card orders, with or without a discount code, from checkout and from admin placement alike |
| FR-18.7 | The restaurant page and card show "Doesn't deliver to your address"; add-to-cart on such a restaurant is disabled with that reason |
| FR-18.8 | The checkout page shows a specific, translated message with the distance and the radius for `OUTSIDE_DELIVERY_ZONE` |
| FR-18.9 | The admin restaurant details show the delivery radius |
| FR-18.10 | `distanceToRestaurantKm(restaurant, point)` and `checkDeliveryZone(restaurant, point)` are exported from `restaurants/index.js`, and `haversineKm` from `shared/geo.js`, for reuse |
| FR-18.11 | The development seed gives every restaurant a radius, most customers' addresses fall inside them, and at least one address lies outside a restaurant's zone |

## Business Rules

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-DZ1 | A restaurant delivers to a point when the great-circle distance from the restaurant's coordinates to the point is **at most** `delivery_radius_km` | `checkDeliveryZone` uses the exact distance; a point exactly on the edge is inside |
| BR-DZ2 | The radius is between 1 and 30 km at one decimal. Existing and new restaurants default to 8 | `chk_restaurants_delivery_radius`; `updateRestaurantSchema` rounds to one decimal and bounds it |
| BR-DZ3 | **Checkout is authoritative.** The customer-facing annotations are a convenience; the order is refused in `insertOrder` regardless of what the UI showed, so checkout and admin placement cannot disagree | `orders.service.insertOrder` |
| BR-DZ4 | **A point that cannot be measured is allowed.** If the restaurant or the address has no coordinates there is no distance, and the order is not refused over data the platform never required. Discovery reports it as `deliversToAddress: true`, `distanceKm: null`, `zoneChecked: false`, so a client can tell "inside" from "unchecked" | `checkDeliveryZone` returns `checked: false`; haversine returns `null`, never `0`, for a missing coordinate |
| BR-DZ5 | `distanceKm` is shown to one decimal. The decision uses the unrounded distance, so 8.04 km (shown as 8.0) is outside an 8 km zone | `checkDeliveryZone` |
| BR-DZ6 | Annotations come from the customer's **own** address only. An `addressId` that is unknown, deleted or another customer's is ignored (no annotation) rather than refused, and never reveals that the address exists | `users.getBrowsingAddress` |
| BR-DZ7 | A stale or invalid token on a public discovery page is treated as anonymous, not as an error | `authenticateOptional` drops authentication failures |
| BR-DZ8 | The delivery zone is judged against the address as it is when the order is placed; the order keeps its own address snapshot and is not re-checked later | order address snapshot (BR-O6) |

### Assumption A-DZ1 — straight-line distance

Road distance can be well over the straight-line figure. The radius is read as
"this far as the crow flies", and owners pick it accordingly. Swapping in a
routing service later changes `distanceToRestaurantKm` only.

### Assumption A-DZ2 — the cart does not report the zone

The cart (`GET /api/cart`, `issues`, `canCheckout`) knows no delivery address:
the address is chosen at checkout and sent with the order. Adding an address to
the cart would make `canCheckout` depend on a choice the cart does not hold, so
the zone is **not** part of cart `issues`. A customer learns about the zone
earlier, from the restaurant listing and page (FR-18.3, FR-18.7), and finally
from the checkout refusal (FR-18.5). The cart is unchanged.

## Data Requirements

```sql
ALTER TABLE restaurants
  ADD COLUMN delivery_radius_km numeric(4,1) NOT NULL DEFAULT 8,
  ADD CONSTRAINT chk_restaurants_delivery_radius
    CHECK (delivery_radius_km BETWEEN 1 AND 30);
```

Migration `016_delivery_zones.js`. Existing rows take the default, so nothing
that worked before stops working. No index: the distance is computed in the
application for the few rows a page returns, never used to filter a query.

## API Requirements

| Method | Route | Change |
|--------|-------|--------|
| GET | `/api/restaurants` | Optional sign-in. New optional query `addressId`. Each restaurant gains `deliveryRadiusKm`, and for a customer with an address `deliversToAddress`, `distanceKm`, `zoneChecked` |
| GET | `/api/restaurants/:id` | Same, plus the optional `addressId` query |
| GET | `/api/search` | Same, on `restaurants[]` |
| GET / PATCH | `/api/restaurant/profile` | `deliveryRadiusKm` (1–30), `latitude`, `longitude` |
| GET | `/api/admin/restaurants` | Each row gains `deliveryRadiusKm`, `latitude`, `longitude` |
| POST | `/api/orders`, `/api/admin/orders` | New error `422 OUTSIDE_DELIVERY_ZONE` |

```jsonc
// 422 from checkout
{ "success": false,
  "error": { "code": "OUTSIDE_DELIVERY_ZONE",
             "message": "This restaurant does not deliver to this address.",
             "details": [{ "field": "addressId", "issue": "This restaurant delivers within 8 km and this address is 14.2 km away.",
                           "distanceKm": 14.2, "radiusKm": 8 }] } }
```

## Frontend Requirements

- `RestaurantCard`: a "Doesn't deliver to your address" badge when `deliversToAddress === false`; the distance when known. Nothing for anonymous visitors, where the field is absent.
- `RestaurantDetailView`: an alert stating the distance and the radius, "Delivers within N km", and `FoodItemCard` gets `deliverable=false`, which disables Add with the reason as text.
- The listing and page send no address id: the server uses the customer's default address. (There is no global "selected address" in the app today; the `addressId` query is there for one.)
- `CheckoutView`: a specific message for `OUTSIDE_DELIVERY_ZONE` with the distance and radius.
- Owner `ProfileView`: **Delivery radius (km)**, **Latitude**, **Longitude**.
- Admin `RestaurantsView` details dialog: **Delivery radius**.
- Arabic strings, including the API message, in `i18n/ar/zones.js`.

## Backend Requirements

- `shared/geo.js` — `haversineKm(lat1, lon1, lat2, lon2)`; strings from NUMERIC columns are accepted; a missing coordinate gives `null`.
- `modules/restaurants/deliveryZone.js` — `distanceToRestaurantKm`, `checkDeliveryZone`; exported through `restaurants/index.js`, with `deliveryZoneFields` used by discovery.
- `modules/users` — `getBrowsingAddress(userId, addressId?)` (selected, else default; never throws), exported through `users/index.js`.
- `modules/discovery` — only a `CUSTOMER` token is used; the routes use `authenticateOptional`.
- `orders.service.insertOrder` — after the minimum-order check and before the discount code is validated, the address is loaded and checked.
- `OUTSIDE_DELIVERY_ZONE` (422) registered in `shared/errors/codes.js`.
- `authenticateOptional` no longer lets an authentication failure through as an error.

## Validation

| Field | Rule |
|-------|------|
| `deliveryRadiusKm` | number, 1–30, rounded to one decimal |
| `latitude` | −90 to 90 |
| `longitude` | −180 to 180 |
| `addressId` (discovery query) | UUID |

## Authorization

The radius is part of the owner's own profile; no route accepts a restaurant id.
Discovery stays public. An `addressId` only ever resolves among the signed-in
customer's own addresses (BR-DZ6).

## Error Handling

| Condition | Response |
|-----------|----------|
| Address outside the zone at checkout or admin placement | `422 OUTSIDE_DELIVERY_ZONE`; no order, no payment, cart intact |
| Radius outside 1–30 | `422 VALIDATION_ERROR` |
| `addressId` not a UUID on discovery | `422 VALIDATION_ERROR` |
| Unknown or foreign `addressId` on discovery | `200`, no annotation |
| Address or restaurant without coordinates | Allowed (BR-DZ4) |

## Testing Requirements

Unit — haversine (zero, known distance, symmetry, NUMERIC strings, missing
coordinates give `null`); `checkDeliveryZone` (inside, outside, the rounding
case, the boundary, a missing coordinate on either side).

Integration (`deliveryZones.test.js`, real PostgreSQL) — the default radius, the
owner reading and changing it, rejected values, the database constraint, the
admin list; discovery annotating list, page and search from the default and from
a chosen address; anonymous, stale-token, no-address and foreign-address
requests getting no annotation; an address without coordinates reported as
unchecked; checkout inside, outside (with `details`, nothing written, cart
intact), widened by the owner, by card (no payment row), with an address or a
restaurant lacking coordinates; admin placement refused.

Frontend — the card and the food card, anonymous and translated; the checkout
message.

## Edge Cases

| Case | Expected |
|------|----------|
| Owner shrinks the radius while a customer has a cart | The cart is unaffected; checkout is refused with the new radius |
| Address exactly on the radius | Inside |
| Restaurant has no coordinates | Every address is allowed and discovery reports `zoneChecked: false`; the owner is nudged to set them on the profile screen |
| Customer edits an address after the order | The order keeps its snapshot; no re-check (BR-DZ8) |
| Card order outside the zone | Refused before the payment is created |
| Discount code and an outside address | The zone is checked first; the code is not locked or redeemed |

## Related Stories

[Story 18 — Delivery Zones](../stories/story-18-delivery-zones.md) implements
this spec. It builds on [story-03 — Restaurant Onboarding & Menu Management](../stories/story-03-restaurant-onboarding-menu-management.md),
[story-04 — Restaurant Discovery & Menu Browsing](../stories/story-04-restaurant-discovery-menu-browsing.md)
and [story-06 — Order Placement & Customer Order Tracking](../stories/story-06-order-placement-customer-tracking.md).

## Dependencies

**Depends on:** [spec-03](spec-03-restaurant-profile-operations.md) (restaurant profile), [spec-05](spec-05-restaurant-discovery-search.md) (discovery), [spec-07](spec-07-order-placement-lifecycle.md) (`insertOrder`).
**Depended on by:** none yet; the delivery ETA feature will reuse `distanceToRestaurantKm`.
