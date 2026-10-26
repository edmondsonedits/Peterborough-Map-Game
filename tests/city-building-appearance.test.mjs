import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBuildingAppearance } from '../city-explorer/building-appearance.js';
import { facadeComponentPlan } from '../city-explorer/facade-components.js';
import { buildingFacadePlan } from '../city-explorer/building-archetypes.js';
import { createFootageFacade, createPhotoSilhouetteGeometry } from '../city-explorer/sherbrooke-footage.js';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';

test('appearance resolution is deterministic, immutable, and leaves source tags alone', () => {
  const tags = Object.freeze({building: 'house', 'building:levels': '2', colour: '#cc0000'});
  const first = resolveBuildingAppearance({tags, featureId: 'way/42', wallHeight: 6.2, footprintArea: 85});
  const second = resolveBuildingAppearance({tags, featureId: 'way/42', wallHeight: 6.2, footprintArea: 85});
  assert.deepEqual(first, second);
  assert.equal(tags.colour, '#cc0000');
  assert.equal(first.archetype, 'residential');
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.components));
  assert.ok(first.components.window.frameWidthMetres > 0);
});

test('unknown or overridden styles stay conservative and ignore identity and massing fields', () => {
  const fallback = resolveBuildingAppearance({tags: {building: 'mystery-use'}, featureId: 'unknown:1', wallHeight: 8, footprintArea: 120});
  const overridden = resolveBuildingAppearance({
    tags: {building: 'house'}, featureId: 'unknown:1', wallHeight: 8, footprintArea: 120,
    override: {components: {window: {widthMetres: 1.1}}, name: 'ignored', height: 99, style: 'house'}
  });
  assert.equal(fallback.confidence, 'conservative');
  assert.equal(overridden.components.window.widthMetres, 1.1);
  assert.equal(overridden.name, undefined);
  assert.equal(overridden.height, undefined);
  assert.equal(overridden.archetype, 'residential');
});

test('component plans are bounded edge-local panels with paired frames and glazing', () => {
  const appearance = resolveBuildingAppearance({tags: {building: 'house', 'building:levels': '2'}, featureId: 'way/house'});
  const plan = facadeComponentPlan({appearance, edgeLength: 12, wallHeight: 6.4, front: true});
  assert.ok(plan.length > 0 && plan.length <= 80);
  for (const panel of plan) {
    assert.ok(Number.isFinite(panel.t) && panel.t >= 0 && panel.t <= 1);
    assert.ok(panel.width > 0 && panel.width <= 12);
    assert.ok(panel.lowerY >= 0 && panel.upperY <= 6.4 && panel.upperY > panel.lowerY);
    assert.ok(panel.offset >= 0 && panel.offset <= 0.25);
  }
  const frames = plan.filter(panel => panel.kind === 'window-frame');
  const windows = plan.filter(panel => panel.kind === 'window');
  assert.ok(frames.length > 0);
  assert.equal(frames.length, windows.length);
  assert.ok(frames.every((frame, i) => frame.offset < windows[i].offset && frame.width > windows[i].width), 'glass sits ahead of a wider frame so the border stays visible');
  assert.ok(plan.some(panel => panel.kind === 'sill'));
  assert.ok(plan.some(panel => panel.kind === 'cornice'));
});

test('lite component plans stay deterministic and use a smaller bounded detail budget', () => {
  const appearance = resolveBuildingAppearance({tags: {building: 'retail'}, featureId: 'way/shop'});
  const full = facadeComponentPlan({appearance, edgeLength: 30, wallHeight: 12, front: true});
  const lite = facadeComponentPlan({appearance, edgeLength: 30, wallHeight: 12, front: true, lite: true});
  assert.ok(lite.length <= full.length);
  assert.ok(lite.length <= 24);
  assert.deepEqual(lite, facadeComponentPlan({appearance, edgeLength: 30, wallHeight: 12, front: true, lite: true}));
});

test('legacy archetype path stays explicit while improved mode accepts resolved appearance', () => {
  const args = {tags: {building: 'house'}, featureId: 'way/legacy', edgeLength: 12, wallHeight: 6.2, footprintArea: 85, front: true};
  const legacyDefault = buildingFacadePlan({...args, visuals: 'legacy'});
  const legacyFlagged = buildingFacadePlan({...args, visuals: 'legacy'});
  assert.deepEqual(legacyFlagged, legacyDefault);
  const appearance = resolveBuildingAppearance({tags: args.tags, featureId: args.featureId, wallHeight: args.wallHeight, footprintArea: args.footprintArea});
  const improved = buildingFacadePlan({...args, appearance});
  assert.ok(improved.panels.some(panel => panel.kind === 'sill'));
  assert.ok(improved.panels.every(panel => panel.offset <= 0.25));
});

test('explicit photo silhouettes keep normalized UV and world coordinates aligned', () => {
  const silhouette = [[0, 0], [1, 0], [1, 0.72], [0.5, 1], [0, 0.72]];
  const geometry = createPhotoSilhouetteGeometry(THREE, silhouette, (u, v) => ({x: u * 8, y: 2 + v * 6, z: 4}));
  assert.ok(geometry);
  const uv = geometry.getAttribute('uv'), position = geometry.getAttribute('position');
  assert.equal(uv.count, position.count);
  for (let i = 0; i < uv.count; i++) {
    assert.ok(Math.abs(position.getX(i) - uv.getX(i) * 8) < 1e-5);
    assert.ok(Math.abs(position.getY(i) - (2 + uv.getY(i) * 6)) < 1e-5);
    assert.equal(position.getZ(i), 4);
  }
  assert.ok(Array.from({length: position.count}, (_, i) => position.getY(i)).some(y => Math.abs(y - 8) < 1e-5));
  geometry.dispose();
});


test('photo loading keeps supported porch depth visible and tags only glazing for environment light', async () => {
  const project = (lat, lon) => new THREE.Vector2(lon * 111320, lat * 111320);
  const ring = [{x: -1, z: -5}, {x: 12, z: -5}, {x: 12, z: -10}, {x: -1, z: -10}];
  const profile = {
    id: 'fixture:house', label: 'FIXTURE', confidence: 'observed', style: 'house',
    frontLatLon: [{lat: 0, lon: 0}, {lat: 0, lon: 0.0001}], height: 6, eaveHeight: 6,
    detailHeightMetres: 3.6, levels: 1, windowColumns: 1, porchWidthFraction: 0.6,
    porchDepthMetres: 1, porchHeightMetres: 2.4,
    facadePhoto: {file: './fixture.jpg', widthFraction: 1, bottomMetres: 0, heightMetres: 3.6, gableHeightMetres: 1,
      silhouette: [[0, 0], [1, 0], [1, 0.78], [0.5, 1], [0, 0.78]]}
  };
  const pending = [];
  class DeferredTextureLoader { load(url, onLoad, _progress, onError) { pending.push({url, onLoad, onError}); return {}; } }
  const mockedThree = {...THREE, TextureLoader: DeferredTextureLoader};
  const env = new THREE.Texture();
  const facade = createFootageFacade({THREE: mockedThree, profile, ring, base: 5, top: 11, project, glassEnvironment: env});
  const photo = pending.at(-1);
  assert.match(photo.url, /fixture\.jpg$/);
  photo.onLoad({dispose() {}, anisotropy: 1});
  assert.equal(await facade.userData.photoReady, 'loaded');
  let procedural, supportedDepth, glazing, trim;
  facade.traverse(object => {
    if (object.name === 'frontage-procedural-details') procedural = object;
    if (object.name === 'frontage-supported-depth-details') supportedDepth = object;
    if (object.name === 'frontage-glass') glazing = object.material;
    if (object.name === 'frontage-trim') trim = object.material;
  });
  assert.equal(procedural.visible, false);
  assert.equal(supportedDepth.visible, true);
  assert.ok(supportedDepth.children.some(child => child.name === 'frontage-depth-trim' && child.count === 4));
  assert.equal(glazing.userData.cityGlazing, true);
  assert.equal(glazing.envMap, env);
  assert.ok(glazing.envMapIntensity > 0 && glazing.envMapIntensity <= .25, 'reflections stay restrained');
  assert.ok(Math.max(glazing.color.r,glazing.color.g,glazing.color.b) < .2, 'glass must not become a pale opaque panel');
  assert.equal(glazing.metalness, 0);
  assert.equal(trim.userData.cityGlazing, undefined);
  assert.equal(trim.envMap, null);
  const legacy = createFootageFacade({THREE, profile: {...profile, facadePhoto: undefined}, ring, base: 5, top: 11, project, visuals: 'legacy', glassEnvironment: env});
  let legacyGlazing;
  legacy.traverse(object => { if (object.name === 'frontage-glass') legacyGlazing = object.material; });
  assert.equal(legacyGlazing.userData.cityGlazing, undefined);
  assert.equal(legacyGlazing.envMap, null);
  assert.equal(legacyGlazing.roughness, 0.34);
  assert.equal(legacyGlazing.metalness, 0.12);
  assert.equal(legacyGlazing.transparent, true);
  const unmeasured = createFootageFacade({THREE:mockedThree,profile:{...profile,porchWidthFraction:undefined},ring,base:5,top:11,project});
  pending.at(-1).onLoad({dispose(){},anisotropy:1});
  await unmeasured.userData.photoReady;
  assert.equal(unmeasured.getObjectByName('frontage-supported-depth-details'), undefined, 'unmeasured porch defaults must not cover the photographed frontage');
  env.dispose();
});
