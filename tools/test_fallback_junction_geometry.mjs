import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { solveFallbackJunctions, polygonArea } from '../city-explorer/fallback-junction-geometry.js';
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';

const segment = (a, b, lineId, width = 6, y = 10, profile = {}) => ({
  a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] },
  aY: y, bY: y, width, lineId,
  aSourceVertex: true, bSourceVertex: true,
  aLineEndpoint: true, bLineEndpoint: true,
  profile: { surfaceKey: 'roadLocal', edgeKey: 'roadEdge', ...profile },
});
const east = segment([0, 0], [24, 0], 'east');
const west = segment([0, 0], [-24, 0], 'west');
const north = segment([0, 0], [0, 24], 'north');
const south = segment([0, 0], [0, -24], 'south');

const verify = (name, roads, expected) => {
  const result = solveFallbackJunctions(roads);
  assert.equal(result.polygons.length, expected, name);
  for (const polygon of result.polygons) {
    assert.ok(polygon.points.every(p => [p.x, p.z, p.y].every(Number.isFinite)), name + ': nonfinite vertex');
    assert.equal(polygon.triangles.length, (polygon.points.length - 2) * 3, name + ': incomplete triangulation');
    assert.ok(Math.abs(polygonArea(polygon.points)) > 1, name + ': degenerate polygon');
    assert.ok(Math.max(...polygon.trimDistances) <= 14.000001, name + ': unsafe trim');
    for (const index of polygon.triangles) assert.ok(index >= 0 && index < polygon.points.length);
  }
  return result;
};

const cross = verify('four-way crossing', [east, west, north, south], 1);
assert.ok(cross.trimBySegment.get(east)?.a > 1);
const t = verify('T junction', [east, west, north], 1);
assert.ok(t.polygons[0].points.length >= 4);
verify('angled T junction', [
  segment([0, 0], [25, 3], 'east'), west, segment([0, 0], [9, 25], 'side'),
], 1);
const driveway = verify('service driveway joins public road', [
  east, west, segment([0, 0], [0, 14], 'driveway', 3.5, 10,
    { surfaceKey: 'roadService', edgeKey: 'roadEdge' }),
], 1);
assert.equal(driveway.polygons[0].lines.length, 3);
verify('curved road, no invented junction', [
  segment([-20, 0], [0, 0], 'same-way'),
  segment([0, 0], [0, 20], 'same-way'),
], 0);
verify('dead end retains legacy cap', [north], 0);
verify('divided carriageways do not connect', [
  segment([-5, 0], [-5, 25], 'northbound'),
  segment([5, 0], [5, 25], 'southbound'),
], 0);
verify('overpass and underpass do not connect by XZ only', [
  segment([0, 0], [25, 0], 'lower-e', 6, 10),
  segment([0, 0], [-25, 0], 'lower-w', 6, 10),
  segment([0, 0], [0, 25], 'upper-n', 6, 18, { bridge: true }),
  segment([0, 0], [0, -25], 'upper-s', 6, 18, { bridge: true }),
], 0);
verify('parking aisles cannot create road junctions', [
  east, west, segment([0, 0], [0, 14], 'parking', 6, 10,
    { parkingAisle: true }),
], 0);
verify('tunnels never form surface junctions', [
  east, west, segment([0, 0], [0, 14], 'tunnel', 6, 10, { tunnel: true }),
], 0);

// Reconstruct the exact Float32 triangles that the opt-in renderer registers.
// At the T centre the fallback shape must be a queryable road surface.
const junctionIndex = new RenderedPavementIndex();
for (const polygon of t.polygons) {
  for (let i = 0; i < polygon.triangles.length; i += 3) {
    const [a, b, c] = polygon.triangles.slice(i, i + 3).map(j => polygon.points[j]);
    junctionIndex.addTriangle(
      a.x, a.y + 0.018, a.z, b.x, b.y + 0.018, b.z, c.x, c.y + 0.018, c.z,
      { id: 'test-junction', layer: 'road_surfaces' },
    );
  }
}
assert.equal(junctionIndex.sample(0, 0)?.id, 'test-junction');
assert.equal(junctionIndex.sample(200, 200), null);

const appSource = readFileSync(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
const gameplayFunction = appSource.match(/^function gameplaySurfaceAt\([^]*?^\}/m)?.[0];
assert.ok(gameplayFunction, 'gameplay integration function exists');
assert.match(appSource, /junctionPrototype/);
assert.match(appSource, /!state\.officialRoadSurfacesAvailable/);
const official = new RenderedPavementIndex();
const state = {
  renderedPavementIndex: official,
  fallbackJunctionSurfaceIndex: junctionIndex,
  roadSurfaceIndex: { sample: () => ({ onRoad: false, height: 10, name: 'Main Street' }) },
};
const gameplaySurfaceAt = runInNewContext(gameplayFunction + '\ngameplaySurfaceAt', {
  state, terrainHeightAtWorld: () => 0,
});
let contact = gameplaySurfaceAt(0, 0, 10);
assert.equal(contact.heightSource, 'junction-polygon');
assert.equal(contact.onRoad, true);
assert.ok(Math.abs(contact.height - Math.fround(10.018)) < 0.0001);
official.addTriangle(-4, 12, -4, 4, 12, -4, 0, 12, 4, { id: 'official', layer: 'road_surfaces' });
contact = gameplaySurfaceAt(0, 0, 12);
assert.equal(contact.heightSource, 'rendered-pavement-triangle', 'surveyed pavement retains precedence');
assert.equal(contact.height, 12);
state.fallbackJunctionSurfaceIndex = null;
assert.notEqual(gameplaySurfaceAt(0, 0, 10).heightSource, 'junction-polygon',
  'legacy gameplay stays functional when prototype is disabled');

console.log('Fallback junction geometry: 10 intersection/bridge/driveway cases and surface-query priority passed.');
