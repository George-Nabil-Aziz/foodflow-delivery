import { haversineKm } from '../../shared/geo.js';

/** One decimal, as the UI shows it. Rounding is for display only: the zone
 *  decision below uses the exact distance. */
const round1 = (km) => Math.round(km * 10) / 10;

/**
 * Distance from a restaurant to a point, in km, or null when either side has
 * no coordinates. Reusable by anything that needs it (delivery ETA, spec-18).
 */
export function distanceToRestaurantKm(restaurant, point) {
  if (!restaurant || !point) return null;
  return haversineKm(restaurant.latitude, restaurant.longitude, point.latitude, point.longitude);
}

/**
 * Whether a restaurant delivers to a point (spec-18 BR-DZ2..4).
 *
 *  - `checked: false` means a coordinate is missing on either side. The point
 *    cannot be measured, so it is allowed rather than blocked (BR-DZ4): a
 *    customer is not refused over data the platform never asked for.
 *  - `deliversToAddress` is true when inside (or exactly on) the radius.
 */
export function checkDeliveryZone(restaurant, point) {
  const exact = distanceToRestaurantKm(restaurant, point);
  const radiusKm = Number(restaurant?.delivery_radius_km);
  if (exact === null) {
    return { checked: false, deliversToAddress: true, distanceKm: null, radiusKm };
  }
  return {
    checked: true,
    deliversToAddress: exact <= radiusKm,
    distanceKm: round1(exact),
    radiusKm,
  };
}
