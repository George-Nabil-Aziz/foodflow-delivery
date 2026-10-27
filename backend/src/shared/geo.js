const EARTH_RADIUS_KM = 6371;
const toRadians = (deg) => (deg * Math.PI) / 180;

/** A coordinate is usable only if it is a finite number. The database returns
 *  NUMERIC columns as strings, so strings are coerced. */
const toCoordinate = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/**
 * Great-circle distance in kilometres (haversine), or null when either point
 * is missing a coordinate. Null is "cannot be measured", never 0: callers
 * decide what an unmeasurable distance means (spec-18 BR-DZ4).
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const [a1, o1, a2, o2] = [lat1, lon1, lat2, lon2].map(toCoordinate);
  if ([a1, o1, a2, o2].some((n) => !Number.isFinite(n))) return null;
  const dLat = toRadians(a2 - a1);
  const dLon = toRadians(o2 - o1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(a1)) * Math.cos(toRadians(a2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
