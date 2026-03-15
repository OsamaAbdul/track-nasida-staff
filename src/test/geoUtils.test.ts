import { describe, it, expect } from 'vitest';
import { calculateHaversineDistance } from '../lib/geoUtils';

describe('calculateHaversineDistance', () => {
  it('should return 0 for the same coordinates', () => {
    const lat = 6.5244;
    const lon = 3.3792;
    expect(calculateHaversineDistance(lat, lon, lat, lon)).toBe(0);
  });

  it('should calculate distance between two points correctly (Lagos to Abuja)', () => {
    // Lagos: 6.5244° N, 3.3792° E
    // Abuja: 9.0765° N, 7.3986° E
    // Distance matches ~510-520km
    const lagosLat = 6.5244;
    const lagosLon = 3.3792;
    const abujaLat = 9.0765;
    const abujaLon = 7.3986;

    const distance = calculateHaversineDistance(lagosLat, lagosLon, abujaLat, abujaLon);
    
    // Using an online calculator, the distance is ~512,100 meters
    expect(distance).toBeGreaterThan(510000);
    expect(distance).toBeLessThan(520000);
  });

  it('should be accurate for small distances (geofencing)', () => {
    const lat1 = 6.5244;
    const lon1 = 3.3792;
    // ~11 meters away (approx 0.0001 degrees)
    const lat2 = 6.5245; 
    const lon2 = 3.3792;

    const distance = calculateHaversineDistance(lat1, lon1, lat2, lon2);
    expect(distance).toBeGreaterThan(10);
    expect(distance).toBeLessThan(12);
  });
});
