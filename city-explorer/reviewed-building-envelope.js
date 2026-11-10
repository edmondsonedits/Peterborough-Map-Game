// Opt-in display bounds for a matched photo frontage. Source dimensions,
// footprint coordinates, terrain samples and physics remain caller-owned.
const finite = Number.isFinite;
const point = value => ({x: value?.x, z: value?.z ?? value?.y});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const samePoint = (a, b) => distance(a, b) <= .0001;
const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) <= 1e-7
  && p.x >= Math.min(a.x, b.x) - 1e-7 && p.x <= Math.max(a.x, b.x) + 1e-7
  && p.z >= Math.min(a.z, b.z) - 1e-7 && p.z <= Math.max(a.z, b.z) + 1e-7;
function intersects(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0)
    || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}
function simpleRing(ring) {
  if (ring.length < 3 || ring.length > 128 || ring.some(p => !finite(p.x) || !finite(p.z))) return false;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (distance(a, b) < .01) return false;
    area += a.x * b.z - b.x * a.z;
    for (let j = i + 1; j < ring.length; j++) {
      if (j === i + 1 || i === 0 && j === ring.length - 1) continue;
      if (intersects(a, b, ring[j], ring[(j + 1) % ring.length])) return false;
    }
  }
  return Math.abs(area) > 2;
}

/**
 * `ring` is the original clean outer ring (no repeated closure); groundHeights
 * has one finite sample per vertex. Extra hole samples therefore fail closed.
 * `reviewedEnvelope` accepts a source/frontage datum and optional estimated
 * wallHeightMetres + roofRiseMetres + flat/hipped/gabled roofShape.
 * Call only in visual mesh assembly. Never feed this result into source-height,
 * collision, terrain, gameplay or geographic-feature mutation paths.
 */
export function resolveReviewedBuildingEnvelope({profile, sourceId, ring, groundHeights, dimensions, project, tags = {}} = {}) {
  const sourceBase = Array.isArray(groundHeights) && groundHeights.length && groundHeights.every(finite) ? Math.max(...groundHeights) : null;
  const sourceWall = sourceBase != null && finite(dimensions?.height) ? sourceBase + dimensions.height : null;
  const sourceRoof = sourceWall != null && finite(dimensions?.roofHeight) ? sourceWall + dimensions.roofHeight : null;
  const unchanged = reason => ({foundationTop: sourceBase, wallTop: sourceWall, roofTop: sourceRoof, dimensions, applied: false, reason});
  const spec = profile?.reviewedEnvelope;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return unchanged('no-reviewed-envelope');
  if (!sourceId || profile.id !== sourceId || profile.confidence !== 'observed' || profile.appearanceOnly !== true
    || profile.preserveMappedMassing !== true || profile.reviewedWallMaterial !== true) return unchanged('unreviewed-profile');
  if (profile.massing || profile.recordedRoof) return unchanged('conflicting-reviewed-massing');
  if (['height', 'roof:height', 'roof:shape', 'building:roof:shape', 'roof:levels', 'min_height', 'building:min_level']
    .some(key => tags[key] != null && tags[key] !== '')) return unchanged('explicit-source-dimensions');
  // A mapped storey count remains authoritative for the wall and base. It does
  // not establish an otherwise untagged inferred roof: permit only a reviewed
  // roof replacement that leaves the resolved source wall and datum unchanged.
  if (tags['building:levels'] != null && tags['building:levels'] !== ''
    && !(spec.wallHeightMetres === dimensions?.height && (spec.datum == null || spec.datum === 'source')))
    return unchanged('explicit-source-dimensions');
  if (!dimensions || ![dimensions.height, dimensions.roofHeight, dimensions.minHeight].every(finite)
    || dimensions.height < 2.6 || dimensions.roofHeight < 0 || dimensions.minHeight < 0) return unchanged('invalid-source-dimensions');
  if (!Array.isArray(ring) || !Array.isArray(groundHeights) || ring.length !== groundHeights.length || sourceBase == null) return unchanged('invalid-terrain-samples');
  const vertices = ring.map(point);
  if (!simpleRing(vertices)) return unchanged('invalid-source-ring');
  if (typeof project !== 'function' || !Array.isArray(profile.frontLatLon) || profile.frontLatLon.length !== 2) return unchanged('unmatched-frontage');
  let front;
  try { front = profile.frontLatLon.map(p => point(project(p.lat, p.lon))); }
  catch { return unchanged('unmatched-frontage'); }
  if (front.some(p => !finite(p.x) || !finite(p.z))) return unchanged('unmatched-frontage');
  const indices = front.map(p => vertices.findIndex(v => samePoint(p, v)));
  const difference = Math.abs(indices[0] - indices[1]);
  if (indices.some(index => index < 0) || !(difference === 1 || difference === vertices.length - 1)
    || distance(front[0], front[1]) < 1) return unchanged('unmatched-frontage');
  for (let i = 0; i < vertices.length; i++) {
    const next = (i + 1) % vertices.length;
    if (Math.abs(groundHeights[next] - groundHeights[i]) / distance(vertices[i], vertices[next]) > .4) return unchanged('excessive-terrain-slope');
  }
  if (spec.datum != null && !['source', 'frontage'].includes(spec.datum)) return unchanged('invalid-datum');
  const foundationTop = spec.datum === 'frontage' ? Math.max(...indices.map(index => groundHeights[index])) : sourceBase;
  if (sourceBase - foundationTop > 3) return unchanged('excessive-foundation-drop');

  const requestedHeight = spec.wallHeightMetres != null || spec.roofRiseMetres != null || spec.roofShape != null;
  let resolved = dimensions;
  if (requestedHeight) {
    const {wallHeightMetres: height, roofRiseMetres: roofHeight, roofShape} = spec;
    if (![height, roofHeight].every(finite) || !['flat', 'hipped', 'gabled'].includes(roofShape)
      || height < 2.6 || height > dimensions.height || roofHeight < 0 || roofHeight > 3
      || roofShape !== 'flat' && roofHeight < .25 || roofShape === 'flat' && roofHeight > .3
      || height + roofHeight > dimensions.height + dimensions.roofHeight) return unchanged('invalid-height-estimate');
    resolved = {...dimensions, height, roofHeight, roofShape};
  } else if (spec.datum !== 'frontage') return unchanged('empty-envelope');
  const wallTop = foundationTop + resolved.height, roofTop = wallTop + resolved.roofHeight;
  if (Math.max(...groundHeights) > wallTop - .5 || roofTop > sourceRoof + 1e-7) return unchanged('terrain-reaches-eave');
  return {foundationTop, wallTop, roofTop, dimensions: resolved, applied: true, reason: 'reviewed-visual-envelope'};
}
