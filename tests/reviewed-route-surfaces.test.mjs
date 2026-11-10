import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { applyReviewedRouteSurfaceCorrections, ULTRAMAR_PAVEMENT_CORRECTION } from '../city-explorer/reviewed-route-surfaces.js';
import { OfficialDrivableSurfaceIndex, RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
import { officialRoadMeshEdgeLength } from '../city-explorer/citywide-road-quality.js';
import { finishRoadSurfaces } from '../city-explorer/road-surface-finish.js';
import { exportRoadScene } from '../city-explorer/road-pack-export.js';
import { partitionRoadGeometry } from '../city-explorer/road-pack-build.js';
import { optimizeRoadGeometry } from '../city-explorer/road-pack-optimize.js';
import { encodeRoadTile, decodeRoadTile, PackedRoadSurfaceIndex } from '../city-explorer/road-tile-pack.js';
import { loadWorldCollision } from '../city-explorer/multiplayer/world-collision.mjs';

const roadData = JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-road-surfaces.geojson', import.meta.url)));
const source = roadData.features.find(feature => feature.id === '10/99');
const sha = value => createHash('sha256').update(value).digest('hex');
const jsonSha = value => sha(JSON.stringify(value));
const makeCollection = (feature = structuredClone(source)) => ({ type: 'FeatureCollection', features: [feature] });
const center = { lat: 44.3091, lon: -78.3197 };
const project = (lat, lon) => new THREE.Vector2((lon - center.lon) * 111320 * Math.cos(center.lat * Math.PI / 180), -(lat - center.lat) * 110540);
const canopy = project(44.318974525, -78.331144050);
const garage = project(44.319037, -78.330966);
const probes = [
  canopy,
  ...[[44.318972922, -78.331197274], [44.319010062, -78.331124554],
    [44.318938938, -78.331163546], [44.318976078, -78.331090826]].map(([lat, lon]) => project(lat, lon)),
];
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

test('only the exact audited canopy hole is removed from the real municipal collection', () => {
  const before = JSON.stringify(source), result = applyReviewedRouteSurfaceCorrections(roadData);
  assert.equal(result.diagnostics.applied, true);
  assert.equal(result.diagnostics.correctionId, ULTRAMAR_PAVEMENT_CORRECTION.id);
  assert.equal(result.diagnostics.removedHoleIndex, 2);
  assert.equal(result.diagnostics.ringsBefore, 3);
  assert.equal(result.diagnostics.ringsAfter, 2);
  assert.notEqual(result.collection, roadData);
  const fixed = result.collection.features.find(feature => feature.id === source.id);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(fixed.geometry.coordinates, source.geometry.coordinates.slice(0, 2));
  assert.equal(fixed.geometry.coordinates[0], source.geometry.coordinates[0], 'exterior vertices are untouched');
  assert.equal(fixed.geometry.coordinates[1], source.geometry.coordinates[1], 'garage exclusion is untouched');
  assert.equal(fixed.properties, source.properties);
  assert.equal(fixed.id, source.id);
  assert.equal(result.collection.features.length, roadData.features.length);
  for (let index = 0; index < roadData.features.length; index++) {
    if (roadData.features[index].id !== source.id) assert.equal(result.collection.features[index], roadData.features[index]);
  }
});

test('proof hashes identify the exact audited source, removed ring and corrected geometry', () => {
  const result = applyReviewedRouteSurfaceCorrections(makeCollection());
  assert.match(ULTRAMAR_PAVEMENT_CORRECTION.id, /-v1$/);
  assert.equal(result.diagnostics.sourceGeometrySha256, jsonSha(source.geometry));
  assert.equal(result.diagnostics.removedRingSha256, jsonSha(source.geometry.coordinates[2]));
  assert.equal(result.diagnostics.correctedGeometrySha256, jsonSha(result.collection.features[0].geometry));
  assert.equal(result.diagnostics.canopySourceId, 'way/446339023');
  assert.equal(result.diagnostics.geometryHashFormat, 'sha256-json-type-coordinates-v1');
});

test('deep-frozen input is supported and applying the correction again cannot remove the garage', () => {
  const input = freeze(makeCollection()), result = applyReviewedRouteSurfaceCorrections(input);
  assert.equal(result.diagnostics.applied, true);
  assert.equal(input.features[0].geometry.coordinates.length, 3);
  const repeated = applyReviewedRouteSurfaceCorrections(result.collection);
  assert.equal(repeated.collection, result.collection);
  assert.equal(repeated.diagnostics.applied, false);
  assert.equal(repeated.collection.features[0].geometry.coordinates.length, 2);
});

test('identity, ring order, any coordinate change or additional holes fail unchanged', () => {
  const cases = [
    feature => { feature.id = '10/100'; },
    feature => { feature.type = 'Other'; },
    feature => { feature.properties.ptbo_layer = 'road_surfaces'; },
    feature => { feature.geometry.type = 'MultiPolygon'; feature.geometry.coordinates = [feature.geometry.coordinates]; },
    feature => { feature.geometry.coordinates.reverse(); },
    feature => { feature.geometry.coordinates[2].reverse(); },
    feature => { feature.geometry.coordinates[2][1][0] += 1e-10; },
    feature => { feature.geometry.coordinates[0][1][0] += .00001; },
    feature => { feature.geometry.coordinates[1][1][0] += .00001; },
    feature => { feature.geometry.coordinates.push(structuredClone(feature.geometry.coordinates[1])); },
    feature => { feature.geometry.coordinates[2][0][1] = NaN; },
    feature => { feature.geometry.coordinates[2][0].push(150); },
  ];
  for (const modify of cases) {
    const input = makeCollection(); modify(input.features[0]); freeze(input);
    const result = applyReviewedRouteSurfaceCorrections(input);
    assert.equal(result.collection, input, modify.toString());
    assert.equal(result.diagnostics.applied, false);
    assert.equal(result.diagnostics.correctedGeometrySha256, undefined, 'no successful correction proof on a mismatch');
  }
});

test('missing, duplicate or malformed source collections are unchanged and report why', () => {
  for (const [input, reason] of [
    [null, 'invalid-collection'], [{ features: [] }, 'invalid-collection'],
    [{ type: 'FeatureCollection', features: [] }, 'feature-not-found'],
    [{ type: 'FeatureCollection', features: [source, structuredClone(source)] }, 'ambiguous-feature-identity'],
  ]) {
    const result = applyReviewedRouteSurfaceCorrections(input);
    assert.equal(result.collection, input);
    assert.equal(result.diagnostics.applied, false);
    assert.equal(result.diagnostics.reason, reason);
  }
});

const app = readFileSync(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
const sourceFunctions = ['polygonCentroid', 'coordinatesToLandRing', 'cleanRing', 'roadRenderTileCoordinates',
  'roadBatchPositions', 'appendRoadTriangle', 'cachedOfficialRoadHeightAt', 'appendDrapedOfficialRoadTriangle', 'appendOfficialRoadPolygon']
  .map(name => {
    const body = app.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'))?.[0];
    assert.ok(body, `production renderer function ${name} exists`);
    return body;
  }).join('\n');
const terrainHeight = (x, z) => 12 + .018 * (x - canopy.x) - .027 * (z - canopy.y);
function emittedSource(feature, lowPowerProfile = false) {
  const state = { renderedPavementIndex: new RenderedPavementIndex() }, batches = new Map();
  const append = runInNewContext(`${sourceFunctions}\nappendOfficialRoadPolygon`, {
    THREE, project, state, lowPowerProfile, hunterBridgeSurface: null, pavementQA: null,
    CITY_ROAD_MESH_LEGACY: false, officialRoadMeshEdgeLength,
    CITY: { worldBounds: { minX: -10000, minZ: -10000 } }, ROAD_RENDER_TILE_SIZE: 420,
    officialRoadHeightAt: (x, z) => terrainHeight(x, z) + .144,
    console,
  });
  const count = append(feature.geometry.coordinates, 'parking_surfaces', batches, new Map(),
    { id: source.id, layer: 'parking_surfaces', parking: true, drivable: false, properties: feature.properties });
  const roadGroup = new THREE.Group();
  for (const batch of batches.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry);
    mesh.userData = { type: 'road-official-parking_surfaces-batch', material: 'parking' };
    roadGroup.add(mesh);
  }
  assert.equal(state.renderedPavementIndex.triangleCount, count);
  return { roadGroup, index: state.renderedPavementIndex };
}
function semanticIndex(feature) {
  const index = new OfficialDrivableSurfaceIndex();
  index.add(feature.geometry.coordinates.map(ring => ring.slice(0, -1).map(([lon, lat]) => project(lat, lon))),
    { id: feature.id, layer: 'parking_surfaces' });
  return index;
}
function triangleArea(group) {
  let area = 0;
  for (const mesh of group.children) {
    const p = mesh.geometry.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) area += Math.abs((p[i + 3] - p[i]) * (p[i + 8] - p[i + 2])
      - (p[i + 6] - p[i]) * (p[i + 5] - p[i + 2])) / 2;
  }
  return area;
}

test('real source tessellation restores sloped pavement under the canopy in both qualities and retains the garage hole', () => {
  const fixed = applyReviewedRouteSurfaceCorrections(makeCollection()).collection.features[0];
  for (const lowPower of [false, true]) {
    const before = emittedSource(source, lowPower), after = emittedSource(fixed, lowPower);
    const semantic = semanticIndex(fixed);
    assert.equal(before.index.sample(canopy.x, canopy.y), null, 'unrepaired source has the audited contact hole');
    for (const point of probes) {
      const hit = after.index.sample(point.x, point.y);
      assert.ok(hit, 'canopy center and all proposed support probes have real pavement');
      assert.equal(hit.layer, 'parking_surfaces');
      assert.equal(hit.id, '10/99');
      assert.ok(Math.abs(hit.height - (terrainHeight(point.x, point.y) + .144)) < 1e-5);
      assert.equal(semantic.query(point.x, point.y)?.parking, true);
      assert.equal(semantic.query(point.x, point.y, { includeParking: false }), null);
    }
    assert.equal(after.index.sample(garage.x, garage.y), null);
    assert.equal(semantic.query(garage.x, garage.y), null);
    assert.equal(after.index.sample(canopy.x - 70, canopy.y), null, 'no pavement is added outside the surveyed lot');
    const hole = source.geometry.coordinates[2].map(([lon, lat]) => project(lat, lon));
    const removedArea = Math.abs(hole.slice(1).reduce((sum, point, i) => sum + hole[i].x * point.y - point.x * hole[i].y, 0)) / 2;
    assert.ok(Math.abs(triangleArea(after.roadGroup) - triangleArea(before.roadGroup) - removedArea) < .01,
      'emitted pavement area increases by only the audited 85.45 square metre hole');
    for (let i = 1; i < hole.length; i++) {
      const a = hole[i - 1], b = hole[i], midpoint = a.clone().lerp(b, .5), normal = new THREE.Vector2(b.y - a.y, a.x - b.x).normalize();
      const sides = [-.03, .03].map(offset => after.index.sample(midpoint.x + normal.x * offset, midpoint.y + normal.y * offset));
      assert.ok(sides.every(Boolean), 'both sides of the former hole boundary have continuous contact');
      assert.ok(Math.abs(sides[0].height - sides[1].height) < .003, 'the supplied grade crosses the removed cutout without a vertical seam');
    }
    for (const mesh of after.roadGroup.children) assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
    assert.ok(Math.abs(after.index.sample(probes[1].x, probes[1].y).height - after.index.sample(probes[4].x, probes[4].y).height) > .1,
      'restoration follows the supplied grade rather than adding a flat decorative pad');
  }
});

async function memoryWorld(tiles) {
  const files = new Map(), version = 'reviewed-route-surfaces-test-v1';
  const metadata = { worldVersion: version, terrain: { minX: -2000, minZ: -2000, size: 2000, segments: 1 }, stations: [] };
  const json = Buffer.from(JSON.stringify(metadata)), offset = (16 + json.length + 3) & ~3;
  const data = Buffer.alloc(offset + 16); data.write('PTMW'); data.writeUInt16LE(1, 4);
  data.writeUInt32LE(json.length, 8); data.writeUInt32LE(16, 12); json.copy(data, 16);
  files.set('world-data.bin', data);
  const descriptors = tiles.map(tile => {
    const raw = Buffer.from(encodeRoadTile(tile)), zipped = gzipSync(raw), url = `${tile.id.replace(':', '_')}.bin.gz`;
    files.set(url, zipped);
    return { id: tile.id, bounds: tile.bounds, url, rawBytes: raw.length, bytes: zipped.length, sha256: sha(raw), transportSha256: sha(zipped) };
  });
  return loadWorldCollision({ manifest: { worldVersion: version, dataFile: 'world-data.bin', dataBytes: data.length, dataSha256: sha(data),
    bounds: { minX: -2000, maxX: 0, minZ: -2000, maxZ: 0 }, roadPack: { tileCount: descriptors.length, tiles: descriptors } },
    baseUrl: 'https://surfaces.test/', read: async url => {
      const file = files.get(new URL(url).pathname.slice(1)); assert.ok(file, `known in-memory asset ${url}`); return new Uint8Array(file);
    } });
}

test('finished source faces export through the actual pack codec and give browser/server matching contact after readiness', async () => {
  const fixed = applyReviewedRouteSurfaceCorrections(makeCollection()).collection.features[0];
  const sourceScene = emittedSource(fixed), semantic = semanticIndex(fixed);
  const finished = finishRoadSurfaces({ THREE, roadGroup: sourceScene.roadGroup,
    roadIndex: { sampleAll: () => [] }, officialIndex: semantic, terrainHeight, Index: RenderedPavementIndex,
    renderedOfficialIndex: sourceScene.index });
  const exported = exportRoadScene({ THREE, roadGroup: sourceScene.roadGroup, streetscapeGroup: new THREE.Group() });
  const actualFaces = sourceScene.roadGroup.children[0].geometry.attributes.position.array;
  assert.deepEqual(exported[0].positions, [...actualFaces], 'the pack starts with the exact Float32 faces sent to WebGL');
  const tiles = partitionRoadGeometry(exported).map(tile => ({ ...tile,
    groups: optimizeRoadGeometry(tile.groups, { heightAt: finished.heightAt }).groups }));
  const packed = new PackedRoadSurfaceIndex();
  for (const tile of tiles) {
    const decoded = decodeRoadTile(encodeRoadTile(tile));
    assert.deepEqual(decoded.groups.map(group => [...group.positions]), tile.groups.map(group => [...group.positions]), 'codec retains final emitted triangles exactly');
    packed.addTile(tile.id, decoded.groups);
  }
  const world = await memoryWorld(tiles);
  assert.equal(world.sampleSurface(canopy.x, canopy.y).ready, false);
  assert.equal(world.blocks({ x: canopy.x, z: canopy.y }, { x: canopy.x, z: canopy.y }, { kind: 'vehicle' }), true);
  await world.prefetch(canopy.x, canopy.y, 35);
  for (const point of probes) {
    const sourceHit = finished.officialIndex.sample(point.x, point.y), browserHit = packed.sample(point.x, point.y), serverHit = world.sampleSurface(point.x, point.y);
    assert.ok(sourceHit && browserHit);
    assert.equal(browserHit.layer, 'parking_surfaces');
    assert.equal(serverHit.surfaceLayer, 'parking_surfaces');
    assert.equal(serverHit.onRoad, true);
    assert.equal(serverHit.ready, true);
    assert.equal(serverHit.height, browserHit.height, 'multiplayer loads the exact same encoded triangles as the browser index');
    assert.ok(Math.abs(sourceHit.height - browserHit.height) < 1e-5, 'canonical pack optimization retains source-rendered grade');
  }
  assert.equal(packed.sample(garage.x, garage.y), null);
  assert.equal(world.sampleSurface(garage.x, garage.y).onRoad, false);
  for (const tile of tiles) packed.removeTile(tile.id);
  assert.equal(packed.sample(canopy.x, canopy.y), null, 'unloaded pavement cannot leave stale contact');
});
