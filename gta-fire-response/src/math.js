export const METERS_PER_LAT = 110540;

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function approach(current, target, amount) {
  if (current < target) return Math.min(target, current + amount);
  if (current > target) return Math.max(target, current - amount);
  return current;
}
export function normalizeHeading(heading) { return (heading % 360 + 360) % 360; }
export function angleDifference(from, to) { return ((to - from + 540) % 360) - 180; }
export function damp(current, target, lambda, dt) { return lerp(current, target, 1 - Math.exp(-lambda * dt)); }
export function dampHeading(current, target, lambda, dt, maxRate = Infinity) {
  const difference = angleDifference(current, target);
  const damped = difference * (1 - Math.exp(-lambda * dt));
  const limited = clamp(damped, -maxRate * dt, maxRate * dt);
  return normalizeHeading(current + limited);
}
export function normalizeVector(x, y) {
  const magnitude = Math.hypot(x, y);
  if (magnitude < 1e-6) return { x: 0, y: 0, magnitude: 0 };
  return { x: x / Math.max(1, magnitude), y: y / Math.max(1, magnitude), magnitude: Math.min(1, magnitude) };
}
export function headingFromVector(x, y) { return normalizeHeading(Math.atan2(x, -y) * 180 / Math.PI); }
export function pointFrom(origin, heading, distanceMeters) {
  const radians = heading * Math.PI / 180;
  const metersPerLng = 111320 * Math.cos(origin.lat * Math.PI / 180);
  return {
    lat: origin.lat + Math.cos(radians) * distanceMeters / 111320,
    lng: origin.lng + Math.sin(radians) * distanceMeters / metersPerLng
  };
}
export function meters(a, b) {
  const R = 6371000;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function bearing(a, b) {
  const y = Math.sin((b.lng - a.lng) * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180);
  const x = Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180)
    - Math.sin(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.cos((b.lng - a.lng) * Math.PI / 180);
  return normalizeHeading(Math.atan2(y, x) * 180 / Math.PI);
}
export function toXY(lat, lng, centerLat, centerLng) {
  const metersPerLng = 111320 * Math.cos(centerLat * Math.PI / 180);
  return { x: (lng - centerLng) * metersPerLng, y: (lat - centerLat) * METERS_PER_LAT };
}
export function toLatLng(x, y, centerLat, centerLng) {
  const metersPerLng = 111320 * Math.cos(centerLat * Math.PI / 180);
  return { lat: centerLat + y / METERS_PER_LAT, lng: centerLng + x / metersPerLng };
}
export function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
