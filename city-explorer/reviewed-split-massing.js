// One audited display-only split. No scene objects, terrain edits, collision
// data or source-height changes are made here. Unknown source revisions fail
// closed so the caller can keep its ordinary source shell.
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const DRISCOLL_SPLIT_MASSING = freeze({
  id: 'driscoll-755554027-stepped-flat-v1', sourceId: 'way/755554027',
  sourceRing: [
    {lat: 44.3066001, lon: -78.3113302}, {lat: 44.3062276, lon: -78.3111625},
    {lat: 44.3061924, lon: -78.3113152}, {lat: 44.3064962, lon: -78.3114520},
    {lat: 44.3064837, lon: -78.3115063}, {lat: 44.3065729, lon: -78.3115464},
    {lat: 44.3065892, lon: -78.3114759}, {lat: 44.3065686, lon: -78.3114666},
  ],
  sourceDimensions: {height: 5.16891, minHeight: 0, roofHeight: 1.80253, roofShape: 'gabled'},
  low: {sourceIndices: [0, 1, 2, 3, 7], wallHeightMetres: 3.2, roofCapMetres: .12},
  high: {sourceIndices: [3, 4, 5, 6, 7], wallHeightMetres: 5.16891, roofCapMetres: .12},
  splitIndices: [3, 7],
});

const finite = Number.isFinite;
const point = p => ({x: p?.x, z: p?.z ?? p?.y});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const same = (a, b) => distance(a, b) <= 1e-4;
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function signedArea(polygon) {
  // Local coordinates avoid cancellation when the caller uses a large origin.
  const origin = polygon[0];
  return polygon.reduce((sum, p, i) => sum + cross(origin, p, polygon[(i + 1) % polygon.length]), 0) / 2;
}
function convex(polygon) {
  const direction = Math.sign(signedArea(polygon));
  return direction && polygon.every((b, i) => direction * cross(polygon[(i + polygon.length - 1) % polygon.length], b, polygon[(i + 1) % polygon.length]) > 1e-7);
}
const vertex = (p, height) => [p.x, height, p.z];
function wall(out, a, b, bottomA, bottomB, top, direction = 1) {
  if (direction < 0) { [a, b] = [b, a]; [bottomA, bottomB] = [bottomB, bottomA]; }
  out.push(...vertex(a, bottomA), ...vertex(a, top), ...vertex(b, top),
    ...vertex(a, bottomA), ...vertex(b, top), ...vertex(b, bottomB));
}
function flatRoof(out, polygon, height) {
  for (let i = 1; i < polygon.length - 1; i++) {
    const a = polygon[0], b = polygon[i], c = polygon[i + 1];
    out.push(...vertex(a, height), ...vertex(cross(a, b, c) > 0 ? c : b, height), ...vertex(cross(a, b, c) > 0 ? b : c, height));
  }
}

/**
 * Build the exact reviewed 755554027 low wing / high north block.
 * `ring` uses world X/Z (Vector2 X/Y also accepted); groundHeights has one
 * original terrain sample per vertex. Cyclic/reversed order and one matching
 * closing vertex are accepted. Eaves exclude the explicitly reported cap.
 * On failure, both arrays are empty; callers must retain the source fallback.
 */
export function buildReviewedSplitMassing({sourceId, ring, groundHeights, dimensions, tags, project, holes = []} = {}) {
  const spec = DRISCOLL_SPLIT_MASSING;
  const fail = reason => ({valid: false, reason, sourceId, correctionId: spec.id, wallTriangles: [], roofTriangles: []});
  if (sourceId !== spec.sourceId) return fail('unreviewed-source');
  if (!tags || Array.isArray(tags) || tags.building !== 'yes' || Object.keys(tags).length !== 1) return fail('changed-source-tags');
  if (!dimensions || ['height', 'minHeight', 'roofHeight'].some(key => !finite(dimensions[key]) || Math.abs(dimensions[key] - spec.sourceDimensions[key]) > 1e-8)
    || dimensions.roofShape !== spec.sourceDimensions.roofShape) return fail('changed-source-dimensions');
  if (!Array.isArray(holes) || holes.length) return fail('unreviewed-holes');
  if (!Array.isArray(ring) || !Array.isArray(groundHeights) || ring.length !== groundHeights.length
    || ![8, 9].includes(ring.length) || typeof project !== 'function') return fail('invalid-source-ring');
  let vertices = ring.map(point), grounds = groundHeights.slice(), expected;
  if (vertices.some(p => !finite(p.x) || !finite(p.z) || Math.max(Math.abs(p.x), Math.abs(p.z)) > 1e7)
    || grounds.some(y => !finite(y) || Math.abs(y) > 10000)) return fail('invalid-terrain-or-coordinates');
  if (vertices.length === 9) {
    if (!same(vertices[0], vertices[8]) || Math.abs(grounds[0] - grounds[8]) > 1e-8) return fail('invalid-ring-closure');
    vertices = vertices.slice(0, -1); grounds = grounds.slice(0, -1);
  }
  try { expected = spec.sourceRing.map(p => point(project(p.lat, p.lon))); }
  catch { return fail('invalid-projection'); }
  if (expected.some(p => !finite(p.x) || !finite(p.z))) return fail('invalid-projection');
  const canonicalIndices = vertices.map(p => expected.findIndex(q => same(p, q)));
  if (canonicalIndices.some(i => i < 0) || new Set(canonicalIndices).size !== 8) return fail('changed-source-ring');
  const step = (canonicalIndices[1] - canonicalIndices[0] + 8) % 8;
  if (![1, 7].includes(step) || canonicalIndices.some((index, i) => index !== (canonicalIndices[0] + step * i) % 8)) return fail('changed-source-ring-order');
  const outer = Array(8), ground = Array(8);
  canonicalIndices.forEach((index, i) => { outer[index] = vertices[i]; ground[index] = grounds[i]; });
  const polygons = {low: spec.low.sourceIndices.map(i => outer[i]), high: spec.high.sourceIndices.map(i => outer[i])};
  const footprintArea = Math.abs(signedArea(outer)), direction = Math.sign(signedArea(outer));
  const areas = Object.fromEntries(Object.entries(polygons).map(([name, polygon]) => [name, Math.abs(signedArea(polygon))]));
  const highSide = [4, 5, 6].map(i => Math.sign(cross(outer[3], outer[7], outer[i])));
  const lowSide = [0, 1, 2].map(i => Math.sign(cross(outer[3], outer[7], outer[i])));
  if (!(footprintArea > 1 && footprintArea < 10000) || !Object.values(polygons).every(convex)
    || Math.abs(areas.low + areas.high - footprintArea) > 1e-5
    || highSide.some(value => value !== highSide[0] || !value) || lowSide.some(value => value !== -highSide[0])) return fail('invalid-split-partition');
  const foundationTop = Math.max(...ground), groundRange = foundationTop - Math.min(...ground);
  const maxEdgeGrade = Math.max(...outer.map((p, i) => Math.abs(ground[i] - ground[(i + 1) % 8]) / distance(p, outer[(i + 1) % 8])));
  if (groundRange > 3 || !finite(maxEdgeGrade) || maxEdgeGrade > .4) return fail('unsafe-terrain');
  const zones = Object.fromEntries(['low', 'high'].map(name => {
    const zone = spec[name], wallTop = foundationTop + zone.wallHeightMetres;
    return [name, {...zone, sourceIndices: zone.sourceIndices.slice(), wallTop, roofTop: wallTop + zone.roofCapMetres, footprintArea: areas[name]}];
  }));
  const wallTriangles = [], roofTriangles = [];
  for (const name of ['low', 'high']) flatRoof(roofTriangles, polygons[name], zones[name].roofTop);
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8, zone = i >= 3 && i <= 6 ? zones.high : zones.low;
    wall(wallTriangles, outer[i], outer[j], ground[i], ground[j], zone.wallTop, direction);
    wall(roofTriangles, outer[i], outer[j], zone.wallTop, zone.wallTop, zone.roofTop, direction);
  }
  // 7→3 is the high polygon's closing edge, facing the low wing. There is no
  // wall below the low cap, so the two zones remain one continuous building.
  wall(wallTriangles, outer[7], outer[3], zones.low.roofTop, zones.low.roofTop, zones.high.wallTop, direction);
  wall(roofTriangles, outer[7], outer[3], zones.high.wallTop, zones.high.wallTop, zones.high.roofTop, direction);
  if (![...wallTriangles, ...roofTriangles].every(finite)) return fail('nonfinite-output');
  return {valid: true, reason: 'reviewed-source-split', sourceId, correctionId: spec.id, wallTriangles, roofTriangles,
    foundationTop, maxWallTop: zones.high.wallTop, maxRoofTop: zones.high.roofTop,
    zones, split: {sourceIndices: spec.splitIndices.slice(), wallBottom: zones.low.roofTop, wallTop: zones.high.wallTop, capTop: zones.high.roofTop},
    footprintArea, groundRange, maxEdgeGrade};
}
