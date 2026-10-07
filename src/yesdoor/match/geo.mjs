// src/yesdoor/match/geo.mjs — straight-line distance, for ranking backups.
// Pure: no database, no network. Spec §4 ranks backups by rent fit, then payer
// score, then distance; this is the distance.

const EARTH_MILES = 3958.8;
const rad = (deg) => (deg * Math.PI) / 180;

const coord = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A point is { lat, lng } with real numbers (pg returns numeric as text). */
export function toPoint(p) {
  const lat = coord(p?.lat);
  const lng = coord(p?.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Great-circle miles between two points, or null when either has no coordinates. */
export function milesBetween(a, b) {
  const p = toPoint(a);
  const q = toPoint(b);
  if (!p || !q) return null;
  const dLat = rad(q.lat - p.lat);
  const dLng = rad(q.lng - p.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The middle of a set of points (a plain average: fine at city scale), or null. */
export function centroid(points) {
  const good = (points || []).map(toPoint).filter(Boolean);
  if (!good.length) return null;
  return {
    lat: good.reduce((s, p) => s + p.lat, 0) / good.length,
    lng: good.reduce((s, p) => s + p.lng, 0) / good.length
  };
}
