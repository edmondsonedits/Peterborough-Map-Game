import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {addRouteLandmarkAppearances} from '../city-explorer/route-landmark-appearances.js';
import {ROUTE_REID_APPEARANCES} from '../city-explorer/route-reid-appearances.js';
import {simplifyRing} from '../city-explorer/feature-utils.js';
import {createFootageFacade, frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {buildStation2NeighborhoodGableRoof} from '../city-explorer/station2-neighborhood-roofs.mjs';

const project = (lat, lon) => new THREE.Vector2((lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), -(lat - 44.3091) * 110540);
const source = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url), 'utf8'));
const ways = new Map(source.elements.filter(row => row.type === 'way').map(row => ['way/' + row.id, row]));
// Production DTM + triangulated-grid heights reconstructed independently. Both
// cab ground reconstructions exactly match the stored v204 capture diagnostics.
const terrain = {
  'way/1002680782': [5.177321058992403, 5.277606446644187, 4.8488168014322754, 4.876549731377874, 4.611031519002803, 4.583298589057205, 4.475501008491713, 4.743868673349408],
  'way/1005415712': [8.914778586822338, 8.966797832829437, 9.705744020231073, 10.113809428050455, 10.284079960604254, 10.385548863168465, 9.977901478861803, 9.876014552755208, 9.137068365481037, 9.168543016746021, 8.770768084788873, 8.79256674940144, 8.833851550678125, 9.105172962411059, 8.24590090536293, 8.005992695981314, 7.819236860514001, 7.765178370569927, 7.515736731714015, 8.517483127261974],
};
async function resolver() {
  const module = await import('../city-explorer/reviewed-building-envelope.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  });
  assert.ok(module?.resolveReviewedBuildingEnvelope, 'the reviewed visual envelope resolver exists');
  return module.resolveReviewedBuildingEnvelope;
}
function input(id) {
  const way = ways.get(id);
  return {sourceId: id, profile: addRouteLandmarkAppearances({})[id], tags: way.tags,
    ring: way.geometry.slice(0, -1).map(({lat, lon}) => project(lat, lon)),
    groundHeights: terrain[id].slice(), dimensions: mappedBuildingDimensions(way.tags, id), project};
}
function baseline(args) {
  const foundationTop = Math.max(...args.groundHeights);
  return {foundationTop, wallTop: foundationTop + args.dimensions.height,
    roofTop: foundationTop + args.dimensions.height + args.dimensions.roofHeight};
}
function unchanged(result, args) {
  assert.equal(result.applied, false);
  for (const [key, value] of Object.entries(baseline(args))) assert.equal(result[key], value, key);
  assert.deepEqual(result.dimensions, args.dimensions);
}

test('the photographed R077 bungalow gets a low visual wall and shallow hip without changing source dimensions or footprint', async () => {
  const resolve = await resolver(), args = input('way/1002680782');
  const before = {ring: args.ring.map(point => point.toArray()), heights: args.groundHeights.slice(), dimensions: {...args.dimensions}};
  const result = resolve(args);
  assert.equal(result.applied, true);
  assert.equal(result.foundationTop, 5.277606446644187, 'front datum was already within 0.101 m of source maximum');
  assert.equal(result.dimensions.height, 3.2); assert.equal(result.dimensions.roofHeight, 1.1);
  assert.equal(result.dimensions.roofShape, 'hipped'); assert.equal(result.dimensions.minHeight, 0);
  assert.ok(Math.abs(result.roofTop - result.foundationTop - 4.3) < 1e-9);
  assert.equal(args.dimensions.height, 6.100530000000001, 'inferred source/physics height is untouched');
  assert.deepEqual({ring: args.ring.map(point => point.toArray()), heights: args.groundHeights, dimensions: args.dimensions}, before);
  const triangles = THREE.ShapeUtils.triangulateShape(args.ring, []).map(face => face.map(index => args.ring[index]));
  const roof = buildStation2NeighborhoodGableRoof({ring: args.ring, triangles, wallTop: result.wallTop, roofTop: result.roofTop, roofShape: result.dimensions.roofShape});
  assert.equal(roof.valid, true, roof.reason);
  assert.ok(roof.roofTriangles.length > 0);
  const heights = roof.roofTriangles.filter((_, index) => index % 3 === 1);
  assert.ok(Math.min(...heights) >= result.wallTop - 1e-6 && Math.max(...heights) <= result.roofTop + 1e-6, 'plain clipped hip uses the reviewed rise, not the old 8.18 m apex');
});

test('R078 porch details use the exact west-edge terrain datum rather than the remote high rear corner', async () => {
  const resolve = await resolver(), args = input('way/1005415712'), result = resolve(args);
  assert.equal(result.applied, true);
  assert.equal(result.foundationTop, 7.765178370569927);
  assert.ok(Math.abs(baseline(args).foundationTop - result.foundationTop - 2.6203704925985374) < 1e-9);
  assert.deepEqual(result.dimensions, args.dimensions, 'this correction changes the display datum only');
  assert.ok(Math.max(...args.groundHeights) < result.wallTop - .5, 'rear terrain remains below the eave');
  const ring = args.ring.map(point => ({x: point.x, z: point.y}));
  const group = createFootageFacade({THREE, profile: args.profile, ring, base: result.foundationTop, top: result.wallTop, project});
  const frame = frontageFrame({profile: args.profile, ring, project});
  assert.ok(frame.outward.x < -.9);
  const band = group.getObjectByName('frontage-#c9c6b4'), matrix = new THREE.Matrix4(), bottoms = [];
  for (let i = 0; i < band.count; i++) {
    band.getMatrixAt(i, matrix);
    const p = new THREE.Vector3(), scale = new THREE.Vector3(); matrix.decompose(p, new THREE.Quaternion(), scale);
    bottoms.push(p.y - scale.y / 2);
  }
  const localHeight = Math.min(...bottoms) - Math.max(terrain['way/1005415712'][17], terrain['way/1005415712'][18]);
  assert.ok(localHeight > .6 && localHeight < .8, 'lower porch band stays near the photographed raised base, not over 3 m above local terrain');
  assert.equal(group.userData.collision, false);
});

test('only explicitly reviewed matching appearance profiles can change a visual envelope', async () => {
  const resolve = await resolver(), valid = input('way/1002680782');
  for (const patch of [{reviewedEnvelope: undefined}, {id: 'way/elsewhere'}, {confidence: 'partial'}, {appearanceOnly: false}, {preserveMappedMassing: false}, {reviewedWallMaterial: false}]) {
    const args = {...valid, profile: {...valid.profile, ...patch}}; unchanged(resolve(args), args);
  }
  const profiles = addRouteLandmarkAppearances({});
  const optedIn = Object.keys(ROUTE_REID_APPEARANCES).filter(id => profiles[id].reviewedEnvelope);
  assert.deepEqual(optedIn.sort(), ['way/1002680782', 'way/1005415712']);
  assert.equal(addRouteLandmarkAppearances({}, false)['way/1002680782'], undefined);
});

test('explicit source height, storey, base or roof metadata wins over any photo estimate', async () => {
  const resolve = await resolver(), valid = input('way/1002680782');
  for (const [key, value] of [['height', '8'], ['building:levels', '2'], ['roof:height', '0'], ['roof:shape', 'flat'], ['building:roof:shape', 'hipped'], ['roof:levels', '1'], ['min_height', '1'], ['building:min_level', '1']]) {
    const args = {...valid, tags: {...valid.tags, [key]: value}}; unchanged(resolve(args), args);
  }
});

test('unmatched or nonadjacent frontages, self-crossing outlines and invalid geometry fail closed', async () => {
  const resolve = await resolver(), valid = input('way/1002680782');
  const ring = valid.ring;
  const invalid = [
    {...valid, profile: {...valid.profile, frontLatLon: [ways.get(valid.sourceId).geometry[0], ways.get(valid.sourceId).geometry[3]]}},
    {...valid, profile: {...valid.profile, frontLatLon: valid.profile.frontLatLon.map(point => ({...point, lon: point.lon + .00001}))}},
    {...valid, ring: [ring[0], ring[2], ring[1], ring[3]], groundHeights: valid.groundHeights.slice(0, 4)},
    {...valid, ring: [ring[0], ring[0], ...ring.slice(1)], groundHeights: [valid.groundHeights[0], ...valid.groundHeights]},
    {...valid, ring: ring.map((point, i) => i ? point : {x: NaN, y: point.y})},
    {...valid, groundHeights: valid.groundHeights.slice(1)},
  ];
  for (const args of invalid) assert.equal(resolve(args).applied, false);
});

test('unsafe slopes, an excessive foundation drop and ground reaching the new eave reject the opt-in', async () => {
  const resolve = await resolver(), valid = input('way/1005415712');
  const highRear = {...valid, groundHeights: valid.groundHeights.map((value, i) => i === 5 ? value + 5 : value)};
  unchanged(resolve(highRear), highRear);
  const synthetic = {
    sourceId: 'way/test', profile: {id: 'way/test', confidence: 'observed', appearanceOnly: true, preserveMappedMassing: true, reviewedWallMaterial: true,
      frontLatLon: [{lat: 0, lon: 0}, {lat: 0, lon: 10}], reviewedEnvelope: {datum: 'frontage', wallHeightMetres: 2.6, roofRiseMetres: .6, roofShape: 'hipped'}},
    tags: {}, dimensions: {height: 6, roofHeight: 2, minHeight: 0, roofShape: 'gabled'},
    ring: [{x: 0, z: 0}, {x: 10, z: 0}, {x: 10, z: 10}, {x: 0, z: 10}], groundHeights: [100, 100, 102.4, 102.4],
    project: (lat, lon) => ({x: lon, z: lat}),
  };
  unchanged(resolve(synthetic), synthetic);
  const steep = {...synthetic, groundHeights: [100, 105, 105, 100], profile: {...synthetic.profile, reviewedEnvelope: {...synthetic.profile.reviewedEnvelope, datum: 'source'}}};
  unchanged(resolve(steep), steep);
});

test('bounded roof estimates support plain flat, hip and gable shapes without expanding the inferred source envelope', async () => {
  const resolve = await resolver(), valid = input('way/1002680782');
  for (const [roofShape, roofRiseMetres] of [['flat', 0], ['hipped', 1.1], ['gabled', 1.1]]) {
    const args = {...valid, profile: {...valid.profile, reviewedEnvelope: {wallHeightMetres: 3.2, roofRiseMetres, roofShape}}};
    const result = resolve(args); assert.equal(result.applied, true); assert.equal(result.dimensions.roofShape, roofShape);
    assert.ok(result.roofTop <= baseline(args).roofTop);
    if (roofShape === 'flat') assert.equal(result.roofTop, result.wallTop);
  }
  for (const reviewedEnvelope of [{wallHeightMetres: 9, roofRiseMetres: 1, roofShape: 'hipped'}, {wallHeightMetres: 3.2, roofRiseMetres: -1, roofShape: 'gabled'}, {wallHeightMetres: NaN, roofRiseMetres: 1, roofShape: 'hipped'}, {wallHeightMetres: 3.2, roofRiseMetres: 1, roofShape: 'dome'}]) {
    const args = {...valid, profile: {...valid.profile, reviewedEnvelope}}; unchanged(resolve(args), args);
  }
});

test('production ring preparation retains every original reviewed envelope edge and area while ordinary profiles keep simplification', async () => {
  const app = await readFile(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
  const body = app.match(/function coordinatesToRing\([^]*?\n}\n/)[0];
  const profiles = addRouteLandmarkAppearances({});
  const prepare = new Function('FOOTAGE_PROFILES', 'project', 'simplifyRing', body + ';return coordinatesToRing;')(profiles, project, simplifyRing);
  for (const id of Object.keys(terrain)) {
    const coordinates = ways.get(id).geometry.map(({lat, lon}) => [lon, lat]);
    const original = coordinates.map(([lon, lat]) => project(lat, lon)), actual = prepare(coordinates, id);
    assert.deepEqual(actual.map(point => point.toArray()), original.map(point => point.toArray()), `${id} retains the original source ring, including the exact reviewed frontage endpoints`);
    assert.equal(THREE.ShapeUtils.area(actual), THREE.ShapeUtils.area(original));
    const ordinary = prepare(coordinates, 'way/unreviewed');
    assert.deepEqual(ordinary.map(point => point.toArray()), simplifyRing(original, .72, 110).map(point => point.toArray()));
  }
});
