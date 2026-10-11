"""One-time guarded integration; run only on the isolated street-evidence branch.
Every replacement checks its source anchor before any file is written.
"""
from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
updates = {}
def replace(source, before, after, count=1):
    if source.count(before) != count:
        raise RuntimeError(f'Unexpected source: {before[:90]!r}; expected {count}, got {source.count(before)}')
    return source.replace(before, after)
def function(source, name, replacement):
    pattern = rf'^export function {name}\([^]*?^\}}'
    # Python has no JavaScript [^] expression.
    pattern = rf'^export function {name}\([\s\S]*?^\}}'
    out, count = re.subn(pattern, lambda _: replacement, source, flags=re.M)
    if count != 1: raise RuntimeError(f'Expected exactly one function {name}')
    return out
p = root/'city-explorer/road-network.js'
s = p.read_text()
s = function(s, 'mappedLaneCount', '''export function mappedLaneCount(tags = {}) {
  const count = value => value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0
    ? Number(value) : null;
  const total = count(tags.lanes);
  if (total > 0) return total;
  const forward = count(tags['lanes:forward']);
  const backward = count(tags['lanes:backward']);
  const shared = count(tags['lanes:both_ways']) || 0;
  if (forward !== null && backward !== null) return forward + backward + shared || null;
  // A partial directional tag is not a total. Preserve class-width fallback.
  if (isRoadOneWay(tags)) return forward || backward || null;
  return null;
}''')
updates[p] = s
p = root/'city-explorer/city-detail-rules.js'
s = p.read_text()
s = function(s, 'mappedCycleLaneSides', '''export function mappedCycleLaneSides(tags = {}) {
  const both = tags['cycleway:both'] ?? tags.cycleway;
  // Separate tracks, shoulders and shared bus lanes are not painted bike lanes.
  return ['left', 'right'].filter(side =>
    String(tags[`cycleway:${side}`] ?? both ?? '').toLowerCase() === 'lane');
}''')
s = replace(s, ''' * Ontario convention uses yellow to divide opposing traffic and white between
 * lanes moving in the same direction. Urban opposing-traffic boundaries are
 * continuous by default; OSM `overtaking=yes` is treated as explicit evidence
 * that a broken centre line is appropriate.''', ''' * Yellow separates opposing traffic and white separates same-direction lanes.
 * Defaults are inferred, not photographic confirmation. Passing permission is
 * not proof of dashed paint. Explicit dividers and shared-turn lanes win.''')
s = function(s, 'roadLaneMarkingBoundaries', '''export function roadLaneMarkingBoundaries(tags = {}, profile = {}) {
  if (profile.unpaved || profile.tunnel || profile.parkingAisle) return [];
  if (tags.junction === 'roundabout' || String(tags.lane_markings || '').toLowerCase() === 'no') return [];
  const highway = String(profile.highway || tags.highway || '').toLowerCase();
  const markable = /^(motorway|trunk|primary|secondary|tertiary)(?:_link)?$/.test(highway)
    || tags.lane_markings === 'yes' || Boolean(tags.divider);
  const lanes = Number(profile.lanes || tags.lanes);
  if (!markable || !Number.isInteger(lanes) || lanes < 2) return [];
  const twoWay = !profile.oneWay;
  const count = value => value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0
    ? Number(value) : null;
  const shared = count(tags['lanes:both_ways']) || 0;
  let backward = count(tags['lanes:backward']);
  const forward = count(tags['lanes:forward']);
  if (twoWay) {
    if (backward === null && forward !== null) backward = lanes - forward - shared;
    if (backward === null && (lanes - shared) % 2 === 0) backward = (lanes - shared) / 2;
    // An unallocated odd total may include a turn pocket; don't invent its side.
    if (backward === null || backward <= 0 || backward + shared >= lanes
      || (forward !== null && forward + backward + shared !== lanes)) return [];
  }
  const result = [];
  for (let boundary = 1; boundary < lanes; boundary++) {
    const opposing = twoWay && (boundary === backward || (shared > 0 && boundary === backward + shared));
    const materialKey = opposing ? 'roadPaintYellow' : 'roadPaintWhite';
    if (opposing && shared === 1) {
      // Solid outside the centre lane, dashed inside. Offset is positive left.
      const sign = boundary === backward ? 1 : -1;
      result.push({ boundary, materialKey, pattern: 'solid', offsetMetres: sign * 0.12 });
      result.push({ boundary, materialKey, pattern: 'dash', offsetMetres: -sign * 0.12 });
    } else if (opposing && tags.divider === 'no') {
      continue;
    } else if (opposing && tags.divider === 'double_solid_line') {
      for (const offsetMetres of [-0.12, 0.12]) result.push({ boundary, materialKey, pattern: 'solid', offsetMetres });
    } else {
      result.push({ boundary, materialKey, pattern: opposing && tags.divider !== 'dashed_line' ? 'solid' : 'dash' });
    }
  }
  return result;
}''')
updates[p] = s
p = root/'city-explorer/app.js'
s = p.read_text()
s = replace(s, "import { sampleTruckWheelContacts, truckIsOnRoad } from './road-wheel-contact.js';", "import { sampleTruckWheelContacts, truckIsOnRoad } from './road-wheel-contact.js';\nimport { reviewedPaintTags, drapePaintStrip } from './street-paint.js?v=street-evidence-1';")
s = replace(s, 'function finalizeRoadLines(roadLines, buckets, roadBatches) {', 'function finalizeRoadLines(roadLines, buckets, roadBatches) {\n  state.roadPaintRanges = new Map();')
s = replace(s, '    line.generatedBatchRanges = namespacedRanges(roadBatches, rangeStarts);', '    line.generatedBatchRanges = namespacedRanges(roadBatches, rangeStarts);\n    state.roadPaintRanges.set(String(line.id), line.generatedBatchRanges);')
s = replace(s, '  buildRoadMarkings(roadSegments);', '  state.roadMarkingSegments = roadSegments;', 3)
s = replace(s, '  // All OSM and municipal polygons are now available. Paint once in a fixed', '  // Drape paint only after the final municipal and station pavement exists.\n  buildRoadMarkings(state.roadMarkingSegments || []);\n  // All OSM and municipal polygons are now available. Paint once in a fixed')
start = s.index('function buildRoadMarkings(')
end = s.index('\nfunction turnArrowGeometry', start)
f = s[start:end]
f = replace(f, 'const nodeKey = (point) => `${Math.round(point.x * 20)}:${Math.round(point.y * 20)}`;', 'const nodeKey = (point, height) => `${Math.round(point.x * 20)}:${Math.round(point.y * 20)}:${Math.round(height * 4)}`;')
f = replace(f, 'nodeKey(point)', "nodeKey(point, endpoint === 'a' ? segment.aY : segment.bY)", 2)
f = replace(f, '    const tags = segment.tags || {};', '    const tags = reviewedPaintTags(segment.tags || {}, segment.lineId);')
f = replace(f, '''    // Only render cycle-lane separators where OSM explicitly maps a lane,
    // track, shoulder, or bus-shared lane. Untagged streets are never guessed.''', '''    // Only an explicit on-carriageway bike lane implies this separator.
    // A shoulder, separate track or shared bus lane is not a white stripe.''')
f = replace(f, '    if (!boundaries.length) continue;', '')
f = replace(f, 'const offset = -segment.width / 2 + segment.width * boundaryRule.boundary / lanes;', 'const offset = segment.width / 2 - segment.width * boundaryRule.boundary / lanes\n        + (boundaryRule.offsetMetres || 0);')
f = replace(f, "        }, 'roadPaintWhite', 'edge', segment.lineId);", "        }, profile.oneWay && side === (tags.oneway === '-1' ? -1 : 1)\n          ? 'roadPaintYellow' : 'roadPaintWhite', 'edge', segment.lineId);")
a = f.index('  const dashGeometry = ')
b = f.index('\n  state.objectCount += markingCount;', a)
f = f[:a] + '''  let markingCount = 0, vertexCount = 0;
  groups.forEach(({ kind, markings, materialKey, tile }, groupKey) => {
    const positions = [], ranges = [];
    for (const marking of markings) {
      const direction = marking.direction.clone().setY(0).normalize();
      const half = marking.length / 2;
      const a = { x: marking.x-direction.x*half, z: marking.z-direction.z*half };
      const b = { x: marking.x+direction.x*half, z: marking.z+direction.z*half };
      const startVertex = positions.length / 3;
      const vertices = drapePaintStrip(a, b, kind === 'dash' ? 0.15 : 0.13, (x,z) => {
        const hit = gameplaySurfaceAt(x,z,marking.y);
        return hit.onRoad ? hit.height : null;
      }, { spacing: lowPowerProfile ? 4 : 2 });
      for (const v of vertices) positions.push(v);
      if (vertices.length) ranges.push({ lineId: marking.lineId, startVertex, vertexCount: vertices.length/3 });
    }
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(1), 3));
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const material = materials[materialKey].clone();
    material.vertexColors = true;
    material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -1;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 6;
    mesh.userData = { type: kind === 'dash' ? 'road-lane-dashes' : kind === 'solid'
      ? 'road-centre-lines' : kind === 'cycle-edge' ? 'mapped-cycle-lane-edges' : 'road-edge-lines',
      material: materialKey, tile, tileSize: ROAD_RENDER_TILE_SIZE, count: ranges.length,
      paintSurface: 'final-pavement', paintLiftMetres: 0.008 };
    const key = `paint:${groupKey}`;
    generatedRoadMeshes.set(key, mesh);
    for (const range of ranges) {
      // Existing editor bindings retain these arrays by reference.
      state.roadPaintRanges?.get(String(range.lineId))?.push({key,
        startVertex:range.startVertex, vertexCount:range.vertexCount});
    }
    streetscapeGroup.add(mesh);
    markingCount += ranges.length; vertexCount += positions.length/3;
  });
  document.documentElement.dataset.roadPaintVertices = String(vertexCount);
  document.documentElement.dataset.roadPaintVersion = 'street-evidence-1';''' + f[b:]
s = s[:start] + f + s[end:]
s = replace(s, './city-detail-rules.js?v=1.5.5-streets3', './city-detail-rules.js?v=street-evidence-1')
s = replace(s, './road-network.js?v=1.5.5-r10', './road-network.js?v=street-evidence-1')
updates[p] = s
p = root/'city-explorer/road-orientation-fix.js'
updates[p] = replace(p.read_text(), 'app.js?v=citywide-road-20261009-r1', 'app.js?v=street-evidence-1')
p = root/'city-explorer/index.html'
updates[p] = replace(p.read_text(), 'road-orientation-fix.js?v=citywide-road-20261009-r2', 'road-orientation-fix.js?v=street-evidence-1')
p = root/'tools/test_city_detail_rules.mjs'
s = replace(p.read_text(), "assert.deepEqual(mappedCycleLaneSides({ 'cycleway:right': 'track' }), ['right']);", "assert.deepEqual(mappedCycleLaneSides({ 'cycleway:right': 'track' }), []); // Separate track is not an on-road stripe.")
s = replace(s, "{ highway: 'secondary', lanes: '2', overtaking: 'yes' },\n    { highway: 'secondary', lanes: 2, oneWay: false },\n  ),\n  [{ boundary: 1, materialKey: 'roadPaintYellow', pattern: 'dash' }],", "{ highway: 'secondary', lanes: '2', overtaking: 'yes' },\n    { highway: 'secondary', lanes: 2, oneWay: false },\n  ),\n  [{ boundary: 1, materialKey: 'roadPaintYellow', pattern: 'solid' }],")
updates[p] = s
for path, content in updates.items():
    path.write_text(content)
    print(path.relative_to(root))
