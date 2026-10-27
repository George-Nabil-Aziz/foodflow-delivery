import { describe, it, expect } from 'vitest';
import { haversineKm } from '../../src/shared/geo.js';
import { checkDeliveryZone, distanceToRestaurantKm } from '../../src/modules/restaurants/deliveryZone.js';

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(30.05, 31.23, 30.05, 31.23)).toBe(0);
  });

  it('matches known distances', () => {
    // One degree of latitude is about 111.2 km.
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1);
    // Zamalek to Maadi is roughly 10 km as the crow flies.
    const d = haversineKm(30.0459, 31.2243, 29.9602, 31.2569);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(11);
  });

  it('is symmetric', () => {
    const ab = haversineKm(30.0, 31.0, 30.1, 31.3);
    const ba = haversineKm(30.1, 31.3, 30.0, 31.0);
    expect(ab).toBeCloseTo(ba, 9);
  });

  it('accepts the strings PostgreSQL returns for NUMERIC', () => {
    expect(haversineKm('0.000000', '0.000000', '1.000000', '0.000000')).toBeCloseTo(111.19, 1);
  });

  it('is null, not zero, when a coordinate is missing', () => {
    expect(haversineKm(null, 31, 30, 31)).toBeNull();
    expect(haversineKm(30, undefined, 30, 31)).toBeNull();
    expect(haversineKm(30, 31, '', 31)).toBeNull();
    expect(haversineKm(30, 31, 30, 'abc')).toBeNull();
  });
});

const restaurant = { latitude: '30.000000', longitude: '31.000000', delivery_radius_km: '8.0' };

describe('checkDeliveryZone', () => {
  it('delivers to a point inside the radius and reports the distance to 1 decimal', () => {
    const zone = checkDeliveryZone(restaurant, { latitude: 30.045, longitude: 31 }); // ~5.0 km
    expect(zone).toEqual({ checked: true, deliversToAddress: true, distanceKm: 5, radiusKm: 8 });
  });

  it('refuses a point outside the radius', () => {
    const zone = checkDeliveryZone(restaurant, { latitude: 30.1, longitude: 31 }); // ~11.1 km
    expect(zone.deliversToAddress).toBe(false);
    expect(zone.distanceKm).toBe(11.1);
  });

  it('judges on the exact distance, not the rounded one', () => {
    // 8.04 km rounds to 8.0 but is still outside an 8 km zone.
    const zone = checkDeliveryZone(restaurant, { latitude: 30 + 8.04 / 111.195, longitude: 31 });
    expect(zone.distanceKm).toBe(8);
    expect(zone.deliversToAddress).toBe(false);
  });

  it('allows a point exactly on the boundary', () => {
    const point = { latitude: 30.01, longitude: 31 };
    const onEdge = distanceToRestaurantKm(restaurant, point);
    const wide = { ...restaurant, delivery_radius_km: String(onEdge) };
    expect(checkDeliveryZone(wide, point).deliversToAddress).toBe(true);
  });

  it('cannot check a point without coordinates, and allows it (BR-DZ4)', () => {
    const zone = checkDeliveryZone(restaurant, { latitude: null, longitude: null });
    expect(zone).toEqual({ checked: false, deliversToAddress: true, distanceKm: null, radiusKm: 8 });
  });

  it('cannot check a restaurant without coordinates, and allows it', () => {
    const zone = checkDeliveryZone({ ...restaurant, latitude: null }, { latitude: 30, longitude: 31 });
    expect(zone.checked).toBe(false);
    expect(zone.deliversToAddress).toBe(true);
  });
});
