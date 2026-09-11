// Municipal XY is retained. Heights below are a simulation cross-section,
// not surveyed curb elevations: Basedata layer 8 has no Z values.
export const CURB_REVEAL = 0.15;

// A raised walk is a slab on a foundation, not a sheet suspended above terrain.
// Extend its existing side faces to the ground; do not add overlapping top faces.
export function pavementSupportBottom(top, ground, minimumDepth = 0.125) {
  if (![top, ground, minimumDepth].every(Number.isFinite) || minimumDepth < 0)
    throw new TypeError('Invalid pavement support height');
  return Math.min(top - minimumDepth, ground - 0.03);
}

export function curbIsRaised(value) {
  const type = String(value || '').trim().toUpperCase().replaceAll(' ', '');
  if (!type) return null; // Missing source classification is not evidence of no curb.
  if (['CURB', 'CURBGUTTER', 'CURBTEMPORARY', 'EDGEOFSIDEWALKRAISED'].includes(type)) return true;
  if (['EDGEOFPAVEMENT', 'EDGEOFSIDEWALKLEVEL', 'GRAVELROAD'].includes(type)) return false;
  return null;
}

export function stationRoadWeight(x, z, center) {
  const t = Math.max(0, Math.min(1, (240 - Math.hypot(x - center.x, z - center.y)) / 40));
  return t * t * (3 - 2 * t);
}

export function splitRoadDetailSegment(segment, maximumLength = 2) {
  if (!(maximumLength > 0)) throw new RangeError('Expected positive segment length');
  const steps = Math.max(1, Math.ceil(segment.a.distanceTo(segment.b) / maximumLength));
  return Array.from({ length: steps }, (_, i) => ({ ...segment,
    a: segment.a.clone().lerp(segment.b, i / steps),
    b: segment.a.clone().lerp(segment.b, (i + 1) / steps),
    aY: Number.isFinite(segment.aY) && Number.isFinite(segment.bY)
      ? segment.aY + (segment.bY - segment.aY) * i / steps : null,
    bY: Number.isFinite(segment.aY) && Number.isFinite(segment.bY)
      ? segment.aY + (segment.bY - segment.aY) * (i + 1) / steps : null,
  }));
}
