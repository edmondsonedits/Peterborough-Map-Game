import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createFootageFacade, frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {FOOTAGE_PROFILES} from '../city-explorer/sherbrooke-footage-profiles.js';
import {addRouteLandmarkAppearances} from '../city-explorer/route-landmark-appearances.js';
import {applyRecordingAppearance, recordingReferencesEnabled} from '../city-explorer/recording-appearance.js';
import {addCricketRecordingProfiles} from '../city-explorer/cricket-recording-appearances.js';
import {createBusinessSignLayer} from '../city-explorer/business-signs.js';
import {createGeneratedRegistry} from '../city-explorer/editor/generated-registry.js';

// Literal source-edge fixtures came from the ordered-photo/municipal-footprint
// audit. They catch a valid but wrong adjacent edge, especially at the corners.
const fixtures = {
  'way/1015118634': [[1, 2, 'south']],
  'way/755554027': [[2, 3, 'west'], [4, 5, 'west']],
  'way/755554019': [[0, 3, 'north']],
  'way/1015118609': [[7, 8, 'north'], [6, 7, 'west']],
  'way/1015118646': [[2, 1, 'south']],
  'way/1015118647': [[3, 2, 'south']],
  'way/1015118648': [[2, 1, 'south']],
  'way/1015118656': [[1, 2, 'north']],
  'way/1015118657': [[10, 11, 'north']],
  'way/1015118659': [[2, 3, 'north']],
  'way/1015118660': [[3, 0, 'north']],
  'way/1015118662': [[3, 0, 'north']],
};
const project = (lat, lon) => ({x: (lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), z: -(lat - 44.3091) * 110540});
const data = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url), 'utf8'));
const ways = new Map(data.elements.filter(row => row.type === 'way').map(row => ['way/' + row.id, row]));
const app = await readFile(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
const dimensionBody = app.match(/function buildingDimensions\([^]*?\n}\n/)[0];
const directory = JSON.parse(await readFile(new URL('../city-explorer/data/business-directory.json', import.meta.url), 'utf8'));
// Use the same production appearance chain as app.js. In particular, existing
// Cricket profiles reach the route composer before this new registry is added.
function reviewedBase() {
  return addCricketRecordingProfiles(Object.fromEntries(Object.entries(FOOTAGE_PROFILES).map(([id, profile]) => [id, applyRecordingAppearance(profile)])));
}
const activeProfiles = addRouteLandmarkAppearances(reviewedBase());

async function records() {
  const module = await import('../city-explorer/route-east-city-appearances.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  });
  assert.ok(module, 'the twelve verified East City facade records are available');
  return module.ROUTE_EAST_CITY_APPEARANCES;
}
function profileFor(id) {
  assert.ok(activeProfiles[id], `${id} is available through the production route composer`);
  return activeProfiles[id];
}
function faces(profile) {
  const {additionalFrontages, ...primary} = profile;
  return [primary, ...(additionalFrontages || []).map(face => ({...primary, ...face, additionalFrontages: undefined}))];
}
function render(id, profile, lite = false) {
  const dimensionsFor = new Function('FOOTAGE_PROFILES', 'REVIEWED_BUILDING_STYLES', 'mappedBuildingDimensions', 'LANDMARK_BUILDING_HEIGHT_OVERRIDES', dimensionBody + ';return buildingDimensions;')({[id]: profile}, {}, mappedBuildingDimensions, {});
  const dimensions = dimensionsFor(ways.get(id).tags, id);
  const ring = ways.get(id).geometry.slice(0, -1).map(point => project(point.lat, point.lon));
  const frame = frontageFrame({profile, ring, project});
  return {dimensions, frame, group: createFootageFacade({THREE, profile, ring, base: 100, top: 100 + dimensions.height, project, lite})};
}
function boxes(group, frame, name) {
  const result = [], matrix = new THREE.Matrix4();
  group.traverse(mesh => {
    if (!mesh.isInstancedMesh || name && mesh.name !== name) return;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      const p = new THREE.Vector3(), s = new THREE.Vector3();
      matrix.decompose(p, new THREE.Quaternion(), s);
      const along = (p.x - frame.start.x) * frame.tangent.x + (p.z - frame.start.z) * frame.tangent.z;
      result.push({name: mesh.name, t: along / frame.length, width: s.x, height: s.y,
        left: along - s.x / 2, right: along + s.x / 2, bottom: p.y - 100 - s.y / 2, top: p.y - 100 + s.y / 2});
    }
  });
  return result;
}
function separate(a, b) {
  return a.right <= b.left + .01 || b.right <= a.left + .01 || a.top <= b.bottom + .01 || b.top <= a.bottom + .01;
}

test('production composition installs all twelve East City records and fourteen faces while preserving existing source massing', async () => {
  await records();
  const base = reviewedBase(), snapshot = structuredClone(base), active = addRouteLandmarkAppearances(base);
  assert.deepEqual(base, snapshot, 'route composition does not mutate its input profiles');
  let frontageCount = 0;
  for (const [id, expectedFaces] of Object.entries(fixtures)) {
    const profile = active[id];
    assert.ok(profile, `${id} is composed into the active registry`);
    assert.equal(profile.id, id);
    assert.equal(profile.appearanceOnly, true);
    assert.equal(profile.preserveMappedMassing, true);
    assert.equal(profile.reviewedWallMaterial, true);
    assert.equal(faces(profile).length, expectedFaces.length);
    frontageCount += faces(profile).length;
  }
  assert.equal(frontageCount, 14);
  for (const [id, original] of Object.entries(base)) {
    for (const field of ['id', 'height', 'eaveHeight', 'roof', 'roofRise', 'frontLatLon', 'massing', 'preserveMappedMassing']) {
      assert.deepEqual(active[id][field], original[field], `${id} retains existing ${field}`);
    }
  }
  for (const id of ['way/1015118649', 'way/1015118651', 'way/1009651229']) {
    assert.deepEqual(active[id], base[id], `${id} bespoke Cricket/station record stays unchanged`);
  }
});

test('the shared recording-reference opt-out omits the East City batch and returns the original registry', () => {
  const base = reviewedBase();
  assert.equal(recordingReferencesEnabled(''), true);
  for (const search of ['?visuals=legacy', '?recordingReferences=off']) {
    const enabled = recordingReferencesEnabled(search);
    assert.equal(enabled, false);
    const result = addRouteLandmarkAppearances(base, enabled);
    assert.equal(result, base);
    for (const id of Object.keys(fixtures)) assert.equal(result[id], undefined, `${search} omits ${id}`);
  }
  assert.equal(addRouteLandmarkAppearances(base, false), base, 'the expansion gate retains the same opt-out contract');
});

test('East City records exclude the bespoke Cricket conflict and cannot replace source massing', async () => {
  const registry = await records();
  assert.deepEqual(Object.keys(registry).sort(), Object.keys(fixtures).sort());
  assert.equal(registry['way/1015118649'], undefined, '22 Cricket is reviewed separately');
  assert.equal(registry['way/1015118651'], undefined, '24 Cricket is reviewed separately');
  for (const [id, record] of Object.entries(registry)) {
    assert.equal(record.sourceId, id);
    assert.ok(record.photoIds.length && record.sourcePhotoCameras.length && record.observation && record.estimated);
    for (const source of record.sourcePhotoCameras) {
      assert.ok(record.photoIds.includes(source.photoId));
      assert.ok([0, 1].includes(source.lens) && source.timestamp && source.source && source.viewDirection);
    }
    for (const part of [record.profile, record.appearance]) for (const field of ['height', 'eaveHeight', 'roof', 'roofRise', 'massing', 'recordedRoof', 'frontGarden']) {
      assert.equal(part[field], undefined, `${id} does not author ${field}`);
    }
    const candidate = profileFor(id);
    const resolved = render(id, candidate).dimensions;
    assert.deepEqual(resolved, mappedBuildingDimensions(ways.get(id).tags, id), `${id} retains actual source dimensions`);
    assert.equal(FOOTAGE_PROFILES[id], undefined, `${id} does not displace an existing bespoke source profile`);
  }
});

test('all fourteen East City frontages use the photographed adjacent edge and road-facing side', async () => {
  const registry = await records();
  for (const [id, expected] of Object.entries(fixtures)) {
    const profile = profileFor(id), coords = ways.get(id).geometry.slice(0, -1);
    const actual = faces(profile);
    assert.equal(actual.length, expected.length);
    for (const [index, face] of actual.entries()) {
      const [a, b, direction] = expected[index];
      assert.deepEqual(face.frontLatLon, [coords[a], coords[b]], `${id}/${index} observed source edge`);
      const frame = render(id, face).frame;
      assert.ok(direction === 'west' ? frame.outward.x < -.9 : direction === 'south' ? frame.outward.z > .9 : frame.outward.z < -.9, `${id}/${index} faces ${direction}`);
    }
    for (const camera of [registry[id].camera, ...(registry[id].additionalCameras || [])]) {
      const road = ways.get(camera.roadId), p = project(camera.lat, camera.lon);
      assert.ok(road?.tags.highway, `${id} review road exists`);
      const distances = road.geometry.slice(1).map((point, i) => {
        const a = project(road.geometry[i].lat, road.geometry[i].lon), b = project(point.lat, point.lon), dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
      });
      assert.ok(Math.min(...distances) < .08, `${id} review camera lies on mapped pavement centerline`);
    }
  }
});

test('East City decoration fits real mapped wall heights in full and Lite rendering without clipped panels or overlapping glass', async () => {
  for (const [id, record] of Object.entries(await records())) for (const face of faces(profileFor(id))) for (const lite of [false, true]) {
    const {group, dimensions, frame} = render(id, face, lite);
    assert.equal(group.userData.collision, false);
    group.traverse(node => {
      if (node.isInstancedMesh) assert.ok([...node.instanceMatrix.array].every(Number.isFinite), `${id} finite transforms`);
      if (node.geometry) assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite), `${id} finite geometry`);
    });
    const rendered = boxes(group, frame), glass = rendered.filter(box => box.name === 'frontage-glass');
    assert.ok(rendered.every(box => box.bottom >= -.01 && box.top <= dimensions.height + .01), `${id} fits actual ${dimensions.height.toFixed(3)} m wall`);
    for (const panel of face.facadePanels || []) {
      assert.ok(rendered.some(box => box.name === `frontage-${panel.color}` && Math.abs(box.bottom - panel.bottomMetres) < .01 && Math.abs(box.height - panel.heightMetres) < .01), `${id} panel does not rely on height clipping`);
    }
    for (let i = 0; i < glass.length; i++) {
      assert.ok(glass[i].left >= -.01 && glass[i].right <= frame.length + .01, `${id} opening stays within edge`);
      for (let j = i + 1; j < glass.length; j++) assert.ok(separate(glass[i], glass[j]), `${id} glass ${i}/${j} remains distinct`);
    }
    if (face.signText) {
      const sign = {left: face.signFraction * frame.length - face.signWidthMetres / 2, right: face.signFraction * frame.length + face.signWidthMetres / 2, bottom: face.signHeightMetres - face.signBoardHeightMetres / 2, top: face.signHeightMetres + face.signBoardHeightMetres / 2};
      assert.ok(sign.top <= dimensions.height);
      for (const pane of glass) assert.ok(separate(sign, pane), `${id} sign does not cover storefront glazing`);
    }
  }
});

test('Kawartha keeps six tall slots and one distinct east glazed end without a guessed doorway', async () => {
  const id = 'way/1015118634', profile = profileFor(id), {group, frame} = render(id, profile);
  const panes = boxes(group, frame, 'frontage-glass');
  assert.equal(panes.filter(pane => pane.width < 1 && pane.height > 4).length, 6);
  const broad = panes.filter(pane => pane.width > 3);
  assert.equal(broad.length, 1); assert.ok(broad[0].t > .8, 'broad glazing is at the east end');
  assert.equal(profile.entryDoor, null); assert.equal(profile.signText, null);
});

test('Driscoll keeps the high window and navy door solely on the projecting north block', async () => {
  const id = 'way/755554027', profile = profileFor(id);
  const [wing, block] = faces(profile), main = render(id, wing), north = render(id, block);
  assert.equal(boxes(main.group, main.frame).filter(box => box.name === 'frontage-#2e4057').length, 0);
  const door = boxes(north.group, north.frame, 'frontage-#2e4057');
  assert.equal(door.length, 1); assert.ok(door[0].t > .65 && door[0].height >= 2);
  const high = boxes(north.group, north.frame, 'frontage-glass');
  assert.equal(high.length, 1); assert.ok(high[0].bottom > 3 && high[0].width > 3);
  const wingGlass = boxes(main.group, main.frame, 'frontage-glass');
  assert.ok(wingGlass.filter(pane => pane.width > 2).every(pane => pane.t > .4), 'south wing does not get an end-to-end ribbon');
  assert.ok(wingGlass.every(pane => pane.top < 3), 'high block opening is not copied to lower wing');
});

test('Cricket corner windows stay on their correct faces and the blank red side wall gains no entry', async () => {
  const registry = await records(), paleId = 'way/1015118609', pale = profileFor(paleId);
  const [front, side] = faces(pale), a = render(paleId, front), b = render(paleId, side);
  assert.equal(boxes(a.group, a.frame, 'frontage-glass').filter(pane => pane.bottom > 3).length, 4);
  const sidePanes = boxes(b.group, b.frame, 'frontage-glass');
  assert.equal(sidePanes.length, 2); assert.ok(sidePanes.every(pane => pane.t < .3), 'west return pair stays near its south end');
  assert.equal(side.porch, false);
  const redId = 'way/1015118646', red = profileFor(redId), c = render(redId, red);
  const redPanes = boxes(c.group, c.frame, 'frontage-glass');
  assert.equal(redPanes.length, 2); assert.ok(redPanes.every(pane => pane.t > .65), 'one aligned pair at east end');
  assert.equal(red.entryDoor, null); assert.equal(red.porch, false);
  assert.equal(boxes(c.group, c.frame, 'frontage-door').length, 0);
});

test('porch projection and occluded Cricket ground floors do not acquire invented upper planes or centered entries', async () => {
  const registry = await records();
  const id = 'way/1015118657', porch = profileFor(id), rendered = render(id, porch);
  assert.equal(boxes(rendered.group, rendered.frame, 'frontage-glass').length, 0, '13 Cricket upper wall is not pushed to the outer porch edge');
  for (const sourceId of ['way/1015118647', 'way/1015118648', 'way/1015118656', 'way/1015118657', 'way/1015118662']) {
    const profile = profileFor(sourceId), {group, frame} = render(sourceId, profile);
    assert.equal(boxes(group, frame, 'frontage-door').length, 0, `${sourceId} has no guessed default door`);
  }
  const greenId = 'way/1015118660', green = profileFor(greenId), g = render(greenId, green);
  assert.equal(green.porch, false); assert.ok(green.entryDoor.fraction > .65, 'small green-trimmed entry is east');
  const low = boxes(g.group, g.frame, 'frontage-glass').filter(pane => pane.top < 3);
  assert.equal(low.length, 2); assert.ok(low.some(pane => pane.t < .35), 'separate ground window stays west');
});

test('the upper balcony privacy panel stays on the west side without a duplicate generic balcony', async () => {
  const id = 'way/1015118659', profile = profileFor(id), {group, frame} = render(id, profile);
  const screen = boxes(group, frame, 'frontage-#927052');
  assert.equal(screen.length, 1); assert.ok(screen[0].t < .35 && screen[0].bottom > 3);
  assert.deepEqual(profile.balconyLevels, []); assert.ok(!profile.features.some(value => /balcony/i.test(value)));
});

// The only substitute is the browser canvas surface needed by Three.js in Node.
// Facade meshes, rendered-sign metadata, directory row, source footprint,
// generated registry and deduplication all use their real production code/data.
const canvasFactory = () => ({width: 0, height: 0, getContext: () => ({
  fillRect() {}, strokeRect() {}, fillText() {},
  measureText(text) {
    const size = Number(this.font?.match(/([\d.]+)px/)?.[1] || 16), width = text.length * size * .55;
    return {width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width,
      actualBoundingBoxAscent: size * .75, actualBoundingBoxDescent: size * .05};
  },
})});

for (const lite of [false, true]) test(`Circle K's actual ${lite ? 'Lite' : 'full'} facade sign replaces its approved directory label on the real source wall`, () => {
  const id = 'way/755554019', profile = profileFor(id), source = ways.get(id);
  const businesses = directory.businesses.filter(row => row.buildingSourceId === id);
  assert.equal(businesses.length, 1);
  assert.equal(businesses[0].name, 'Circle K');
  assert.equal(businesses[0].placementStatus, 'approved');
  const previousDocument = globalThis.document;
  let detail;
  try {
    globalThis.document = {createElement: canvasFactory};
    detail = render(id, profile, lite);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
  const {group, frame, dimensions} = detail;
  assert.equal(dimensions.height, 2.6, 'fixture uses the current mapped wall, not an arbitrary tall shell');
  const sign = group.getObjectByName('frontage-business-sign');
  assert.ok(sign?.isMesh && sign.material.map, 'the textured sign plane actually exists');
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(sign);
  assert.ok(bounds.min.y >= 100 && bounds.max.y <= 102.6, 'rendered lettering fits below the actual roof line');
  const t = ((sign.position.x - frame.start.x) * frame.tangent.x + (sign.position.z - frame.start.z) * frame.tangent.z) / frame.length;
  assert.ok(t > .55 && t < .85, 'sign stays on the west-half pale entry portal');
  assert.equal(group.userData.renderedSigns.length, 1);
  const {textFit, ...identity} = group.userData.renderedSigns[0];
  assert.deepEqual(identity, {
    sourceId: id, frontageIndex: 0, name: 'Circle K', text: 'CIRCLE K',
    frontage: [{lat: 44.3058945, lon: -78.3113204}, {lat: 44.3058593, lon: -78.3114784}],
  });
  assert.equal(textFit.metrics, 'measured');
  assert.ok(textFit.canvasWidth > 0 && textFit.canvasWidth <= 1024 && textFit.canvasHeight > 0 && textFit.canvasHeight <= 256);
  assert.ok(textFit.inkWidthMetres > 0 && textFit.inkWidthMetres <= textFit.planeWidthMetres && textFit.planeWidthMetres <= 1.6);
  assert.ok(textFit.inkHeightMetres >= .21 && textFit.inkHeightMetres <= textFit.planeHeightMetres && textFit.planeHeightMetres <= .3);
  assert.equal(textFit.panelWidthMetres, 1.6); assert.equal(textFit.panelHeightMetres, .3);
  assert.equal(sign.geometry.parameters.width, textFit.planeWidthMetres);
  assert.equal(sign.geometry.parameters.height, textFit.planeHeightMetres);

  const parent = new THREE.Group(), generatedRegistry = createGeneratedRegistry(THREE);
  const sourceObject = new THREE.Group();
  parent.add(sourceObject, group);
  const generatedId = generatedRegistry.registerEditableObject(sourceObject, {sourceType: 'building', sourceId: id});
  const feature = {
    sourceId: id, generatedId, properties: source.tags,
    sourceGeometry: [[source.geometry.map(({lat, lon}) => [lon, lat])]],
    partHeights: [{base: 100, wallTop: 100 + dimensions.height}], minY: 100, maxY: 100 + dimensions.height,
  };
  const options = {THREE, parent, features: [feature], directory: {...directory, businesses}, project,
    generatedRegistry, canvasFactory, profiles: activeProfiles, lowPower: lite};
  const layer = createBusinessSignLayer({...options, renderedSignsBySourceId: new Map([[id, group.userData.renderedSigns]])});
  try {
    assert.equal(layer.stats().existingProfileSigns, 1);
    assert.equal(layer.stats().renderedNames, 1);
    assert.equal(layer.stats().newSignPanels, 0, 'no second Circle K directory board is created');
    assert.equal(layer.stats().rejected, 0);
    assert.deepEqual(layer.samples(), [{id: businesses[0].id, name: 'Circle K', buildingSourceId: id, frontageIndex: 0, existingProfileSign: true}]);
  } finally { layer.dispose(); }

  // A profile's sign intention cannot suppress the fallback when no replacement
  // was actually rendered (for example, a missing browser canvas).
  const fallback = createBusinessSignLayer({...options, renderedSignsBySourceId: new Map([[id, []]])});
  try {
    assert.equal(fallback.stats().existingProfileSigns, 0);
    assert.equal(fallback.stats().newSignPanels, 1);
    assert.equal(fallback.stats().rejected, 0);
    const label = fallback.samples()[0];
    assert.equal(label.name, 'Circle K');
    assert.ok(label.center.y + label.height / 2 <= 102.6, 'fallback also stays on the actual low source wall');
  } finally { fallback.dispose(); }
});
