import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
import { curbIsRaised } from '../city-explorer/station-road-detail.js';
import { officialRoadMeshEdgeLength, officialCurbDisplayMode, nearbyMunicipalRoadHeight, municipalCurbTop } from '../city-explorer/citywide-road-quality.js';
import { sampleTruckWheelContacts, truckIsOnRoad } from '../city-explorer/road-wheel-contact.js';

for (const layer of ['road_surfaces', 'parking_surfaces', 'bridges']) {
  const desktop = officialRoadMeshEdgeLength(layer);
  const mobile = officialRoadMeshEdgeLength(layer, { lowPower: true });
  const legacy = officialRoadMeshEdgeLength(layer, { legacy: true });
  assert.ok(desktop < legacy, layer + ' must have higher-resolution citywide mesh');
  assert.ok(mobile >= desktop && mobile <= 40, layer + ' mobile limit');
  assert.equal(officialRoadMeshEdgeLength(layer, { nearStation: true }), 8);
}
assert.equal(officialRoadMeshEdgeLength('road_surfaces'), 24);
assert.equal(officialRoadMeshEdgeLength('road_surfaces', { lowPower: true }), 34);
assert.equal(officialCurbDisplayMode(curbIsRaised('CURB GUTTER')), 'raised');
assert.equal(officialCurbDisplayMode(curbIsRaised('EDGE OF PAVEMENT')), 'edge-of-pavement');
assert.equal(officialCurbDisplayMode(curbIsRaised('GRAVEL ROAD')), 'edge-of-pavement');
assert.equal(officialCurbDisplayMode(curbIsRaised('unknown type')), 'unclassified');
assert.equal(municipalCurbTop(1.25, 99), 1.4);
assert.equal(municipalCurbTop(null, 7), 7);
assert.throws(() => municipalCurbTop(4, 4, { reveal: 1 }), RangeError);

const road = new RenderedPavementIndex(5);
road.addTriangle(-5, 10, -5, 5, 10.2, -5, -5, 10.4, 5, { layer: 'road_surfaces' });
assert.ok(Math.abs(nearbyMunicipalRoadHeight(road, -2, -2, 10) - 10.18) < 1e-4);
assert.equal(nearbyMunicipalRoadHeight(road, 20, 20, 10), null);
const deck = new RenderedPavementIndex(5);
deck.addTriangle(0, 3, 0, 10, 3, 0, 0, 3, 10, { layer: 'road_surfaces' });
deck.addTriangle(0, 15, 0, 10, 15, 0, 0, 15, 10, { layer: 'bridges' });
assert.equal(nearbyMunicipalRoadHeight(deck, 2, 2, 15), 3,
  'Curb matching must never snap to a higher bridge when sampling street pavement');

const pose = { x: 0, z: 0, y: 12, heading: 0 };
const dimensions = { wheelbase: 6, trackWidth: 2 };
const sampled = [];
const contact = sampleTruckWheelContacts(pose, dimensions, (x, z, hint) => {
  sampled.push([x, z, hint]);
  return { height: 12 + 0.02 * (-z) + 0.03 * x, onRoad: true };
});
assert.equal(sampled.length, 4);
assert.ok(Math.abs(contact.pitch - Math.atan(0.02)) < 1e-9);
assert.ok(Math.abs(contact.roll - Math.atan(0.03)) < 1e-9);
assert.equal(contact.roadWheelCount, 4);
assert.equal(contact.averageHeight, 12);
assert.deepEqual(sampled.map(p => p[2]), [12,12,12,12]);
assert.equal(truckIsOnRoad(false, 3), true);
assert.equal(truckIsOnRoad(false, 1), false);
assert.equal(truckIsOnRoad(true, 0), true);
assert.equal(truckIsOnRoad(false, undefined), false);
assert.throws(() => sampleTruckWheelContacts({ x:0,z:0,heading:0 }, {wheelbase:0,trackWidth:1}, () => ({height:0})));

const app = readFileSync(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
assert.match(app, /municipalRoads/);
assert.match(app, /citywide-municipal-mobile/);
assert.match(app, /!state\.officialRoadSurfacesAvailable/);
assert.match(app, /nearbyMunicipalRoadHeight\(state\.renderedPavementIndex/);
assert.match(app, /sampleTruckWheelContacts\(truckState, TRUCK_TUNING, gameplaySurfaceAt\)/);
assert.ok(!app.match(/function buildBufferedRoadBatches\([^]*?^\}/m)?.[0].includes("setAttribute('color'"),
  'Road pavement mesh must not allocate identical all-white colours');

const routine = app.match(/^function appendDrapedOfficialRoadTriangle\([^]*?^\}/m)?.[0];
assert.ok(routine, 'Exact production road triangulation function must exist');
class Point {
  constructor(x, y) { this.x = x; this.y = y; }
  distanceToSquared(p) { return (this.x-p.x)**2 + (this.y-p.y)**2; }
  clone() { return new Point(this.x, this.y); }
  lerp(p, t) { this.x += (p.x-this.x)*t; this.y += (p.y-this.y)*t; return this; }
}
function draped(quality, lowPower, centerX) {
  const triangles = [];
  const subdivide = runInNewContext(routine + '\nappendDrapedOfficialRoadTriangle', {
    project: () => new Point(centerX, 0), lowPowerProfile: lowPower,
    CITY_ROAD_MESH_LEGACY: quality === 'legacy', officialRoadMeshEdgeLength,
    cachedOfficialRoadHeightAt: (_cache, p) => 5 + p.x * 0.02 + p.y * 0.01,
    appendRoadTriangle: (target, ...vertices) => target.push(vertices),
  });
  subdivide(triangles, new Point(0,0), new Point(80,0), new Point(0,80), 'road_surfaces', new Map());
  let maxEdge = 0;
  for (const t of triangles) {
    for (let j=0;j<3;j++) {
      const k=(j+1)%3;
      maxEdge = Math.max(maxEdge, Math.hypot(t[j*3]-t[k*3], t[j*3+2]-t[k*3+2]));
    }
  }
  return { triangles: triangles.length, maxEdge };
}
const original = draped('legacy', false, 1000);
const desktop = draped('citywide', false, 1000);
const mobile = draped('citywide', true, 1000);
const station = draped('citywide', false, 0);
assert.ok(desktop.triangles > original.triangles);
assert.ok(mobile.triangles >= original.triangles && mobile.triangles <= desktop.triangles);
assert.ok(station.triangles > desktop.triangles);
assert.ok(desktop.maxEdge <= 24 + 1e-8);
assert.ok(mobile.maxEdge <= 34 + 1e-8);
assert.ok(station.maxEdge <= 8 + 1e-8);
// Exercise the real mobile municipal-data loader, not a mocked replacement
// implementation. These fixtures are in-memory and do not make network calls.
const loaderSource = app.match(/^async function loadOfficialRoadSurfaces\([^]*?^\}/m)?.[0]
  ?.replaceAll('import.meta.url', "'https://test.invalid/city-explorer/app.js'");
assert.ok(loaderSource, 'Actual municipal road loader exists');
const mockCollection = { type: 'FeatureCollection', features: [{ properties: { ptbo_layer: 'road_surfaces' } }] };
const runLoader = async (lowPowerProfile, search) => {
  const state = { manifest: { generated_at: 'fixture', city_road_surfaces: { file: 'peterborough-road-surfaces.geojson' } },
    officialRoadSurfacesAvailable: false };
  const document = { documentElement: { dataset: {} } };
  let requests = 0;
  const load = runInNewContext(loaderSource + '\nloadOfficialRoadSurfaces', {
    lowPowerProfile, state, document, location: { search }, URL, URLSearchParams,
    fetch: async () => { requests += 1; return { ok: true, json: async () => mockCollection }; },
  });
  const result = await load();
  return { requests, available: state.officialRoadSurfacesAvailable,
    mode: document.documentElement.dataset.officialRoadDetail, result };
};
const mobileRoads = await runLoader(true, '?municipalRoads=1');
assert.equal(mobileRoads.requests, 1);
assert.equal(mobileRoads.available, true);
assert.equal(mobileRoads.mode, 'citywide-municipal-mobile');
const mobileFallback = await runLoader(true, '');
assert.equal(mobileFallback.requests, 0);
assert.equal(mobileFallback.available, false);
assert.equal(mobileFallback.mode, 'osm-compatibility-fallback');
const desktopRoads = await runLoader(false, '');
assert.equal(desktopRoads.available, true);
assert.equal(desktopRoads.mode, 'citywide-municipal-desktop');

console.log(JSON.stringify({ status: 'pass', syntheticMesh: { original, desktop, mobile, station },
  note: 'Actual production triangulation executed in a synthetic test; not an FPS or surveyed-accuracy claim.' }, null, 2));
