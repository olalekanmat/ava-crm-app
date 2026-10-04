import type { Account, Call } from './types';

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function hasLocation(a: Account | undefined): a is Account & { lat: number; lng: number } {
  return !!a && typeof a.lat === 'number' && typeof a.lng === 'number';
}

/**
 * Verified: checked in within the geofence. Off-site: checked in, but too far away.
 * Unverified: checked in at an account with no location. Missing: in-person call without a check-in.
 * Remote calls (phone, video, email) need no check-in.
 */
export type GeoStatus = 'Verified' | 'Off-site' | 'Unverified' | 'Missing' | 'Remote';

export function geoStatus(call: Call, geofenceM: number): GeoStatus {
  if (call.channel !== 'In person') return 'Remote';
  if (!call.checkIn) return 'Missing';
  if (call.checkIn.distanceM === undefined) return 'Unverified';
  return call.checkIn.distanceM <= geofenceM ? 'Verified' : 'Off-site';
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
