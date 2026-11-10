import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createFootageFacade } from '../city-explorer/sherbrooke-footage.js';
import { FOOTAGE_PROFILES } from '../city-explorer/sherbrooke-footage-profiles.js';
import { SHERBROOKE_SOURCE } from '../city-explorer/sherbrooke-source.js';
import { createBusinessSignLayer } from '../city-explorer/business-signs.js';

const ring = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 0, z: 10 }];
const project = (lat, lon) => ({ x: lon, y: lat });
const primary = [{ lat: 0, lon: 0 }, { lat: 0, lon: 20 }];
const secondary = [{ lat: 0, lon: 20 }, { lat: 10, lon: 20 }];
const source = { id: 'way/fixture', label: 'N07', confidence: 'observed', style: 'retail',
  height: 8, levels: 2, windowColumns: 4, frontLatLon: primary,
  facadePanels: [{ fraction: .6, widthFraction: .2, bottomMetres: 3, heightMetres: .8, color: '#b52328' }],
  signText: 'PRIMARY', signBusinessName: 'Primary Tenant',
  facadePhoto: { file: 'test-facade.jpg' },
  texturePatch: { file: 'test-mural.jpg', quad: [[0, 1], [1, 1], [1, 0], [0, 0]], target: { widthFraction: 1, heightFraction: .5 } },
  frontGarden: { depthMetres: 3, pathWidthMetres: 1 },
};
function canvasDocument(contextFactory = () => ({ fillRect() {}, fillText() {} })) {
  return { createElement(name) {
    assert.equal(name, 'canvas');
    return { width: 0, height: 0, getContext: contextFactory };
  } };
}
function withDocument(documentValue, work) {
  const previous = globalThis.document;
  globalThis.document = documentValue;
  try { return work(); } finally {
    if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
  }
}
const make = (profile, options = {}) => createFootageFacade({ THREE, profile, ring, base: 10, top: 18, project, ...options });

test('Lite retains essential panels, openings and lettering while making no photo or garden requests', () => {
  const before = structuredClone(source), loads = [], drawn = [];
  class Loader { load(...args) { loads.push(args); args[3]?.(); } }
  const group = withDocument(canvasDocument(() => ({ fillRect() {}, fillText(text) { drawn.push(text); } })), () => make(source, {
    THREE: { ...THREE, TextureLoader: Loader }, lite: true,
    terrainHeightAtWorld: () => { throw new Error('Lite must not build front gardens'); },
    gardenClear: () => { throw new Error('Lite must not evaluate garden placement'); },
  }));
  assert.deepEqual(loads, []);
  assert.deepEqual(source, before, 'render mode does not mutate the reference profile');
  assert.ok(group.getObjectByName('frontage-#b52328'), 'recorded panel remains');
  assert.ok(group.getObjectByName('frontage-glass')?.count > 0, 'omitted mural does not suppress essential openings');
  assert.deepEqual(drawn, ['PRIMARY']);
  assert.equal(group.userData.photoStatus, 'not-needed');
  assert.equal(group.userData.renderedSigns.length, 1);
  assert.equal(group.userData.renderedSigns[0].name, 'Primary Tenant');
  assert.equal(group.userData.renderedSigns[0].sourceId, 'way/fixture');
  assert.equal(group.getObjectByName('front-garden-lawn'), undefined);
});

test('only successfully created lettering is advertised when DOM, canvas or text creation is unavailable', () => {
  const profile = { ...source, facadePhoto: undefined, texturePatch: undefined, frontGarden: undefined };
  for (const unavailable of [undefined, canvasDocument(() => null), canvasDocument(() => ({ fillRect() {}, fillText() { throw new Error('cannot draw'); } }))]) {
    const group = withDocument(unavailable, () => make(profile, { lite: true }));
    assert.deepEqual(group.userData.renderedSigns, []);
    assert.ok(group.getObjectByName('frontage-procedural-details'), 'essential geometry survives unavailable labels');
  }
});

test('additional-frontage lettering retains its actual index and does not inherit another tenant alias', () => {
  const profile = { ...source, signText: null,
    additionalFrontages: [{ frontLatLon: secondary, signText: 'SECOND TENANT', facadePhoto: { file: 'side.jpg' } }] };
  const group = withDocument(canvasDocument(), () => make(profile, { lite: true }));
  assert.equal(group.userData.frontageCount, 2);
  assert.deepEqual(group.userData.renderedSigns.map(({ sourceId, frontageIndex, name }) => ({ sourceId, frontageIndex, name })),
    [{ sourceId: 'way/fixture', frontageIndex: 1, name: 'SECOND TENANT' }]);
  assert.deepEqual(group.userData.renderedSigns[0].frontage, secondary);
});

test('a successful full-face photograph removes the hidden procedural sign from aggregate metadata', async () => {
  const loads = [];
  class Loader { load(url, onLoad, progress, onError) { loads.push({ url, onLoad, onError }); } }
  const profile = { ...source, texturePatch: undefined, frontGarden: undefined,
    additionalFrontages: [{ frontLatLon: secondary, signText: 'SIDE TENANT', facadePhoto: undefined }] };
  const group = withDocument(canvasDocument(), () => make(profile, { THREE: { ...THREE, TextureLoader: Loader } }));
  assert.equal(group.userData.renderedSigns.length, 2);
  loads[0].onLoad(new THREE.Texture());
  await group.userData.photoReady;
  assert.deepEqual(group.userData.renderedSigns.map(sign => sign.frontageIndex), [1]);
});

test('applied lettering has a transparent plane and no opaque backing or background fill', () => {
  let fills = 0;
  const profile = { id: 'way/applied', label: 'applied', confidence: 'observed', style: 'office',
    height: 8, levels: 1, frontLatLon: primary, blankFacade: true, entryDoor: null,
    signText: 'Scotiabank', signStyle: 'applied', signTextColor: '#f3f1e8' };
  const group = withDocument(canvasDocument(() => ({ fillRect() { fills++; }, fillText() {} })), () => make(profile));
  assert.equal(fills, 0);
  assert.equal(group.getObjectByName('frontage-trim'), undefined, 'no backing instance');
  const text = group.getObjectByName('frontage-applied-sign');
  assert.ok(text?.isMesh);
  assert.equal(text.material.transparent, true);
  assert.equal(group.userData.renderedSigns[0].name, 'Scotiabank');
});

test('reviewed enclosed-bay specifications are wired through the shared renderer in both qualities', () => {
  const profile = { ...source, facadePhoto: undefined, texturePatch: undefined, frontGarden: undefined, signText: null,
    enclosedBays: [{ fraction: .65, widthMetres: 2.2, bottomMetres: 3.1, heightMetres: 2.5, depthMetres: .55 }] };
  for (const lite of [false, true]) {
    const group = make(profile, { lite });
    const bays = group.getObjectByName('recorded-enclosed-bays');
    assert.ok(bays);
    assert.equal(bays.userData.enclosedBays.length, 1);
    assert.equal(bays.userData.rejectedCount, 0);
    assert.equal(bays.children.length, 3);
  }
});

test('an enclosed bay stays on its specified frontage rather than wrapping onto an unrecorded side', () => {
  const profile = { ...source, facadePhoto: undefined, texturePatch: undefined, frontGarden: undefined, signText: null,
    enclosedBays: [{ fraction: .65, widthMetres: 2.2, bottomMetres: 3.1, heightMetres: 2.5, depthMetres: .55 }],
    additionalFrontages: [{ frontLatLon: secondary, signText: null }] };
  const group = make(profile, { lite: true });
  assert.equal(group.children.length, 2);
  assert.equal(group.children[0].getObjectByName('recorded-enclosed-bays').userData.enclosedBays.length, 1);
  assert.equal(Boolean(group.children[1].getObjectByName('recorded-enclosed-bays')), false);
});

test('four reviewed adjacent faces retain sign indices while a fifth remains outside the bounded renderer', () => {
  const profile = { id: 'way/four-faces', label: 'four-faces', confidence: 'observed', style: 'office', height: 8,
    frontLatLon: primary, signText: 'NORTH', additionalFrontages: [
      { frontLatLon: secondary, signText: 'EAST' },
      { frontLatLon: [{ lat: 10, lon: 20 }, { lat: 10, lon: 0 }], signText: 'SOUTH' },
      { frontLatLon: [{ lat: 10, lon: 0 }, { lat: 0, lon: 0 }], signText: 'WEST' },
      { frontLatLon: primary, signText: 'UNREVIEWED FIFTH' },
    ] };
  const group = withDocument(canvasDocument(), () => make(profile, { lite: true }));
  assert.equal(group.userData.frontageCount, 4);
  assert.deepEqual(group.userData.renderedSigns.map(({ frontageIndex, text }) => [frontageIndex, text]),
    [[0, 'NORTH'], [1, 'EAST'], [2, 'SOUTH'], [3, 'WEST']]);
});

test('only the pixel-reviewed LCBO photograph has an explicit photo-sign annotation', () => {
  const annotated = Object.values(FOOTAGE_PROFILES).flatMap(profile => [profile, ...(profile.additionalFrontages || [])]
    .filter(face => face.facadePhoto?.verifiedSignTexts?.length)
    .map(face => ({ sourceId: profile.id, file: face.facadePhoto.file, texts: face.facadePhoto.verifiedSignTexts })));
  assert.deepEqual(annotated, [{ sourceId: 'way/194192530', file: './assets/sherbrooke-frontages/n03.jpg', texts: ['LCBO'] }]);
});

for (const scenario of [
  { name: 'successful photo', loaded: true, canvas: true, expectedKind: 'photo', expectedExisting: 1 },
  { name: 'failed photo with procedural text', loaded: false, canvas: true, expectedKind: undefined, expectedExisting: 1 },
  { name: 'failed photo without procedural text', loaded: false, canvas: false, expectedKind: undefined, expectedExisting: 0 },
  { name: 'Lite omitted photo', lite: true, canvas: true, expectedKind: undefined, expectedExisting: 1 },
]) test(`LCBO ${scenario.name} reports only its actual visible replacement`, async () => {
  const profile = FOOTAGE_PROFILES['way/194192530'], building = SHERBROOKE_SOURCE.buildings.find(item => item.id === profile.id);
  const projectReal = (lat, lon) => ({ x: (lon + 78.32) * 111320 * Math.cos(44.3 * Math.PI / 180), y: -(lat - 44.3) * 110540 });
  const sourceRing = building.ring.slice(0, -1).map(([lon, lat]) => { const p = projectReal(lat, lon); return { x: p.x, z: p.y }; });
  const loads = [];
  class Loader { load(url, onLoad, progress, onError) { loads.push({ url, onLoad, onError }); } }
  const group = withDocument(scenario.canvas ? canvasDocument() : undefined, () => createFootageFacade({
    THREE: { ...THREE, TextureLoader: Loader }, profile, ring: sourceRing, base: 100, top: 104.7, project: projectReal, lite: scenario.lite,
  }));
  assert.equal(group.userData.renderedSigns.some(sign => sign.kind === 'photo'), false, 'loading intent is not a rendered photo sign');
  if (scenario.lite) assert.equal(loads.length, 0);
  else {
    assert.equal(loads.length, 1);
    if (scenario.loaded) loads[0].onLoad(new THREE.Texture()); else loads[0].onError(new Error('photo unavailable'));
    await group.userData.photoReady;
  }
  const records = group.userData.renderedSigns;
  assert.equal(records.length, scenario.expectedExisting);
  if (records.length) {
    assert.equal(records[0].kind, scenario.expectedKind);
    assert.equal(records[0].sourceId, profile.id);
    assert.equal(records[0].frontageIndex, 0);
    assert.equal(records[0].name, 'LCBO');
    assert.equal(records[0].text, 'LCBO');
    assert.deepEqual(records[0].frontage, profile.frontLatLon);
  }
  assert.equal(Boolean(group.getObjectByName('reviewed-facade-photo')), Boolean(scenario.loaded));
  const parent = new THREE.Group(); parent.add(group);
  const layer = createBusinessSignLayer({ THREE, parent, project: projectReal,
    generatedRegistry: { attachEditableGroup() {} }, profiles: { [profile.id]: profile },
    features: [{ sourceId: profile.id, generatedId: 'LCBO', sourceGeometry: [[building.ring]], minY: 100, maxY: 104.7,
      partHeights: [{ base: 100, wallTop: 104.1 }] }],
    directory: { businesses: [{ id: 'lcbo', name: 'LCBO', buildingSourceId: profile.id, placementStatus: 'approved',
      placementMode: 'street-facing-wall', frontage: profile.frontLatLon, fraction: .5, openingTopMetres: 2.838 }] },
    renderedSignsBySourceId: new Map([[profile.id, records]]),
    canvasFactory: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {}, measureText: text => ({ width: text.length * 12 }) }) }),
  });
  assert.equal(layer.stats().existingProfileSigns, scenario.expectedExisting);
  assert.equal(layer.stats().newSignPanels, 1 - scenario.expectedExisting);
  layer.dispose();
});
