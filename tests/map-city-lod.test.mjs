import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'city-explorer', 'app.js'), 'utf8');
const start = app.indexOf('const FAR_BUILDING_DETAIL_MATERIALS = new Set(');
const end = app.indexOf('\nfunction freezeStaticCityTransforms()', start);
assert.ok(start >= 0 && end > start, 'city visual LOD source range must be found');

function makeGroup(children = []) { return { visible: true, children }; }

function harness() {
  const stationThreeAuthored = { visible: true, userData: { type: 'station-three-authored-model' } };
  const deliberatelyHiddenReplacement = { visible: false, userData: { type: 'station-replacement' } };
  const authoredRoad = { visible: true, userData: { type: 'nontiled-road-detail' } };
  const camera = { position: { x: 0, y: 100, z: 0 } };
  const c = vm.createContext({
    state: { mode: 'map', mapLayer: 'osm' }, camera,
    CITY: { worldBounds: { minX: -10000, minZ: -10000 } },
    terrainHeightAtWorld: () => 0,
    buildingGroup: makeGroup([stationThreeAuthored, deliberatelyHiddenReplacement]),
    roadGroup: makeGroup([authoredRoad]),
    streetscapeGroup: makeGroup(), authoredDetailGroup: makeGroup(),
    streetLabelGroup: makeGroup(), vegetationGroup: makeGroup(),
    gameplayGroup: makeGroup(), landmarkGroup: makeGroup(), mapRoadGroup: makeGroup(),
    mapBasemapGroup: makeGroup(), semanticSurveyGroup: makeGroup(),
    semanticSurveyActive: false, innerWidth: 1280, lowPowerProfile: true,
    graphicsQuality: { buildingRadius: 4200, roadRadius: 5000, roadRetainRadius: 9000, streetDetailRadius: 2000 },
    sun: { castShadow: true }, document: { documentElement: { dataset: {} } },
  });
  vm.runInContext(app.slice(start, end), c, { filename: 'app.js:updateCityVisualLod' });
  return { c, camera, stationThreeAuthored, deliberatelyHiddenReplacement, authoredRoad };
}

test('imagery, close 3D, overview, and driving preserve authored and explicitly hidden child visibility', () => {
  const h = harness();
  const assertSourceVisibility = () => {
    assert.equal(h.stationThreeAuthored.visible, true, 'untiled Station 3 authored model stays visible');
    assert.equal(h.deliberatelyHiddenReplacement.visible, false, 'registry-hidden replacement stays hidden');
    assert.equal(h.authoredRoad.visible, true, 'untiled authored road detail stays visible');
  };

  h.c.updateCityVisualLod(h.camera); // imagery overlay
  assertSourceVisibility();

  h.c.state.mapLayer = '3d';
  h.camera.position.y = 500;
  h.c.updateCityVisualLod(h.camera); // close 3D
  assertSourceVisibility();

  h.camera.position.y = 5600;
  h.c.updateCityVisualLod(h.camera); // 3D overview
  assertSourceVisibility();

  h.c.state.mode = 'driving';
  h.camera.position.y = 100;
  h.c.updateCityVisualLod(h.camera); // return to driving
  assertSourceVisibility();
});
