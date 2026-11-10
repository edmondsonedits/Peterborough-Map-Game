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

test('captured Lite McDonnel cab keeps nearby walls visible instead of measuring to a distant tile center',()=>{
  const h=harness();
  h.c.CITY.worldBounds={minX:-7314.875667272568,minZ:-8909.98599999969};
  h.c.graphicsQuality={buildingRadius:1050,roadRadius:380,roadRetainRadius:620,streetDetailRadius:420};
  h.c.state.mode='driving';h.c.state.mapLayer='3d';
  Object.assign(h.camera.position,{x:-107.30366215099876,y:3.097316663988466,z:-56.84715773365379});
  const wall={visible:true,userData:{type:'building-batch',material:'commercial',tile:{x:4,z:4},tileSize:1800}};
  const roof={visible:true,userData:{...wall.userData,material:'roofDark'}};
  h.c.buildingGroup.children.push(wall,roof);
  h.c.updateCityVisualLod(h.camera);
  assert.equal(wall.visible,true,'a source building 17 m from this real cab position must retain its walls');
  assert.equal(roof.visible,true);
  assert.equal(h.c.distanceToRenderTile(wall,h.camera),0,'the camera is inside the source render cell');
  h.camera.position.x=-4000;h.c.updateCityVisualLod(h.camera);
  assert.equal(wall.visible,false,'distant wall cells still obey Lite range limits');
});

test('street LOD revisits a nearby cell before a 600 m cache interval leaves its newly approached walls hidden',()=>{
  const h=harness();h.c.CITY.worldBounds={minX:0,minZ:0};
  h.c.graphicsQuality={buildingRadius:1050,roadRadius:380,roadRetainRadius:620,streetDetailRadius:420};
  h.c.state.mode='driving';h.c.state.mapLayer='3d';
  const wall={visible:true,userData:{type:'building-batch',material:'commercial',tile:{x:1,z:0},tileSize:1800}};
  h.c.buildingGroup.children.push(wall);
  Object.assign(h.camera.position,{x:700,y:3,z:900});h.c.updateCityVisualLod(h.camera);
  assert.equal(wall.visible,false);
  h.camera.position.x=900;h.c.updateCityVisualLod(h.camera);
  assert.equal(wall.visible,true,'approached cell is now 900 m away, within the 1050 m wall range');
});
