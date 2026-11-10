import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {ROUTE_SHERBROOKE_APPEARANCES} from '../city-explorer/route-sherbrooke-appearances.js';
import {addRouteLandmarkAppearances} from '../city-explorer/route-landmark-appearances.js';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {resolveReviewedBuildingEnvelope} from '../city-explorer/reviewed-building-envelope.js';
import {appendFootageRoof} from '../city-explorer/sherbrooke-footage-roofs.js';
import {buildStation2NeighborhoodGableRoof} from '../city-explorer/station2-neighborhood-roofs.mjs';
import {createFootageFacade} from '../city-explorer/sherbrooke-footage.js';

const source = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url), 'utf8'));
const ways = new Map(source.elements.filter(value => value.type === 'way').map(value => [`way/${value.id}`, value]));
const profiles = addRouteLandmarkAppearances({});
const project = (lat, lon) => ({x: (lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), z: -(lat - 44.3091) * 110540});
const reviewed = {
  'way/1006575766': {front: [4, 5], wall: 4.24, rise: .12, shape: 'flat'},
  'way/1006594188': {front: [2, 1], wall: 4.10, rise: 2.50, shape: 'gabled'},
  'way/1006575767': {front: [2, 3], wall: 3.35, rise: 1.35, shape: 'hipped'},
  'way/1006594168': {front: [2, 1], wall: 4.20, rise: .10, shape: 'flat'},
  'way/1006575755': {front: [0, 1], wall: 6.40, rise: .10, shape: 'flat'},
};
// Reconstructed production DTM + Float32 triangulated-grid samples. All five
// nearby v204 cab ground values matched this reconstruction exactly; hydrography
// flattening is omitted by the sampler and does not affect these inland probes.
const terrain = {
  'way/1006575766': [-7.770578202517554, -7.743791466659111, -7.699034391434157, -7.725821127292599, -7.710265565501389, -7.778376638155336, -7.7939321999549085, -7.838689275184186],
  'way/1006594188': [-7.562853620969287, -7.642662451213794, -7.507260570721303, -7.42745174047678],
  'way/1006575767': [-7.83237819660045, -7.835334755252093, -7.771629337658009, -7.732580555236802, -7.796249078537977, -7.797834387148641, -7.798243982516424, -7.874694593541014],
  'way/1006594168': [-8.02644661504916, -8.14401842934, -7.927422274348036, -7.99784796843598, -7.862845327859542],
  'way/1006575755': [-8.538776640983453, -8.53836277623657, -8.398552136782467, -8.468396583919219],
};
function fixture(id, tags = ways.get(id).tags, sampledHeights) {
  const way = ways.get(id), ring = way.geometry.slice(0, -1).map(p => project(p.lat, p.lon));
  const dimensions = mappedBuildingDimensions(tags, id), groundHeights = sampledHeights?.slice() ?? ring.map(() => 100);
  const input = {profile: profiles[id], sourceId: id, ring, groundHeights, dimensions, project, tags};
  const snapshot = structuredClone({...input, project: undefined});
  return {input, snapshot, resolved: resolveReviewedBuildingEnvelope(input)};
}
function pitched(id) {
  const {input, resolved} = fixture(id), roofPositions = [], wallPositions = [];
  const outer = input.ring.map(p => new THREE.Vector2(p.x, p.z));
  const valid = appendFootageRoof({THREE, roofPositions, wallPositions, outer,
    wallTop: resolved.wallTop, roofTop: resolved.roofTop,
    profile: {...input.profile, roof: {gabled: 'gable', hipped: 'hip'}[resolved.dimensions.roofShape]}, project});
  return {input, resolved, roofPositions, wallPositions, outer, valid};
}
function points(positions) {
  return Array.from({length: positions.length / 3}, (_, i) => ({x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2]}));
}
function localFront(profile, p) {
  const [a, b] = profile.frontLatLon.map(p => project(p.lat, p.lon));
  const length = Math.hypot(b.x - a.x, b.z - a.z), tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
  return {u: (p.x - a.x) * tx + (p.z - a.z) * tz, v: -(p.x - a.x) * tz + (p.z - a.z) * tx, length};
}
function roofHeightAt(positions, x, z) {
  let height = null;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
    const area = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(area) < 1e-10) continue;
    const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / area;
    const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / area, c = 1 - a - b;
    if (Math.min(a, b, c) >= -1e-7) height = Math.max(height ?? -Infinity, a * ay + b * by + c * cy);
  }
  return height;
}
function projectedArea(positions) {
  let area = 0;
  const vertices = points(positions);
  for (let i = 0; i < vertices.length; i += 3) {
    const [a, b, c] = vertices.slice(i, i + 3);
    area += Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
  }
  return area;
}

test('only the five source-matched Sherbrooke silhouettes opt into bounded visual estimates', () => {
  const opted = Object.entries(ROUTE_SHERBROOKE_APPEARANCES).filter(([, record]) => record.appearance.reviewedEnvelope).map(([id]) => id);
  assert.deepEqual(opted.sort(), Object.keys(reviewed).sort());
  for (const [id, expected] of Object.entries(reviewed)) {
    const {input, snapshot, resolved} = fixture(id);
    assert.deepEqual(input.profile.frontLatLon, expected.front.map(index => ways.get(id).geometry[index]), `${id}: exact adjacent audited edge`);
    assert.deepEqual(input.tags, {building: id === 'way/1006575767' ? 'house' : 'yes'}, `${id}: no surveyed dimensional tags`);
    assert.equal(resolved.applied, true, `${id}: current source ring is eligible`);
    assert.equal(resolved.dimensions.height, expected.wall);
    assert.equal(resolved.dimensions.roofHeight, expected.rise);
    assert.equal(resolved.dimensions.roofShape, expected.shape);
    assert.equal(resolved.foundationTop, 100, `${id}: unchanged source datum`);
    assert.ok(resolved.roofTop < 100 + input.dimensions.height + input.dimensions.roofHeight, `${id}: inferred envelope is only reduced`);
    assert.deepEqual({...input, project: undefined}, snapshot, `${id}: no source, profile or physics input mutation`);
    assert.match(ROUTE_SHERBROOKE_APPEARANCES[id].estimated, /estimate/i);
  }
});

test('all five estimates pass the actual sloping terrain bounds while retaining their source datum', () => {
  for (const id of Object.keys(reviewed)) {
    const {input, resolved} = fixture(id, ways.get(id).tags, terrain[id]);
    assert.equal(resolved.applied, true, `${id}: safe on the current DTM grid`);
    assert.equal(resolved.foundationTop, Math.max(...terrain[id]), `${id}: retain the original highest-vertex datum`);
    assert.ok(Math.max(...terrain[id]) - Math.min(...terrain[id]) < .3);
    assert.ok(Math.max(...terrain[id]) < resolved.wallTop - .5);
    assert.ok(resolved.roofTop < resolved.foundationTop + input.dimensions.height + input.dimensions.roofHeight);
  }
});

test('Sherbrooke visual estimates cannot override new measured dimensions or source identity', () => {
  for (const id of Object.keys(reviewed)) {
    for (const [tag, value] of [['height', '9'], ['building:levels', '2'], ['roof:height', '1.2'], ['roof:shape', 'hipped'], ['min_height', '.3']]) {
      const {input, resolved} = fixture(id, {...ways.get(id).tags, [tag]: value});
      assert.equal(resolved.applied, false, `${id}: ${tag} remains authoritative`);
      assert.equal(resolved.reason, 'explicit-source-dimensions');
      assert.equal(resolved.dimensions, input.dimensions);
    }
    const {input} = fixture(id);
    const wrongSource = resolveReviewedBuildingEnvelope({...input, sourceId: 'way/unmatched'});
    assert.equal(wrongSource.applied, false);
    assert.equal(wrongSource.dimensions, input.dimensions);
  }
});

test('R142 gable rises on the audited south face and its ridge runs perpendicular to that face', () => {
  const {input, resolved, outer, roofPositions, wallPositions, valid} = pitched('way/1006594188');
  assert.equal(resolved.applied, true);
  assert.equal(valid, true);
  assert.ok([...roofPositions, ...wallPositions].every(Number.isFinite));
  assert.ok(Math.abs(projectedArea(roofPositions) - Math.abs(THREE.ShapeUtils.area(outer))) < 1e-5, 'gable preserves the exact roof footprint, without hidden projections');
  const ridge = points(roofPositions).filter(p => Math.abs(p.y - resolved.roofTop) < 1e-6).map(p => localFront(input.profile, p));
  assert.ok(ridge.length >= 2, 'clipped roof includes the requested ridge');
  assert.ok(Math.max(...ridge.map(p => p.u)) - Math.min(...ridge.map(p => p.u)) < 1e-6, 'ridge has no along-frontage displacement');
  assert.ok(Math.max(...ridge.map(p => p.v)) - Math.min(...ridge.map(p => p.v)) > 10, 'ridge runs into the actual mapped depth');
  const frontPeak = points(wallPositions).filter(p => Math.abs(localFront(input.profile, p).v) < 1e-6 && p.y > resolved.wallTop + 2.49);
  assert.ok(frontPeak.length, 'the photographed street face receives the triangular gable closure');
  assert.ok(frontPeak.every(p => Math.abs(localFront(input.profile, p).u / localFront(input.profile, p).length - .5) < .01));
});

test('R142 upper sash cross the lower eave and every raised frame corner stays inside the actual gable', () => {
  const {input, resolved, roofPositions} = pitched('way/1006594188');
  const [a, b] = input.profile.frontLatLon.map(p => project(p.lat, p.lon));
  const length = Math.hypot(b.x - a.x, b.z - a.z), tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
  for (const lite of [false, true]) {
    const group = createFootageFacade({THREE, profile: input.profile, ring: input.ring,
      base: resolved.foundationTop, top: resolved.roofTop, project, lite});
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
    let checkedCorners = 0, upperSash = 0;
    group.traverse(mesh => {
      if (!mesh.isInstancedMesh) return;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        matrix.decompose(position, new THREE.Quaternion(), scale);
        if (mesh.name === 'frontage-glass' && scale.x > .7 && position.y - scale.y / 2 < resolved.wallTop && position.y + scale.y / 2 > resolved.wallTop) upperSash++;
        for (const sx of [-.5, .5]) for (const sy of [-.5, .5]) for (const sz of [-.5, .5]) {
          const corner = new THREE.Vector3(sx, sy, sz).applyMatrix4(matrix);
          if (corner.y <= resolved.wallTop) continue;
          const {u} = localFront(input.profile, corner), roofY = roofHeightAt(roofPositions, a.x + tx * u, a.z + tz * u);
          assert.ok(Number.isFinite(roofY), 'projected frame corner lies on the original footprint edge');
          assert.ok(corner.y <= roofY + 1e-4, `${mesh.name} corner does not spill above the gable`);
          checkedCorners++;
        }
      }
    });
    assert.equal(upperSash, 2, 'both large upper sash cross into the photographed gable zone');
    assert.ok(checkedCorners > 20, 'check full trim/glass/sill/panel corners, not only window centers');
  }
});

test('R143 low hip covers the actual notched footprint without expanding its projected area', () => {
  const {input, resolved} = fixture('way/1006575767');
  const outer = input.ring.map(p => new THREE.Vector2(p.x, p.z));
  const roofResult = buildStation2NeighborhoodGableRoof({ring: outer, boundaryRings: [outer],
    wallTop: resolved.wallTop, roofTop: resolved.roofTop, roofShape: resolved.dimensions.roofShape,
    triangles: THREE.ShapeUtils.triangulateShape(outer, []).map(face => face.map(index => outer[index]))});
  const {valid, roofTriangles: roofPositions, gableTriangles: wallPositions} = roofResult;
  assert.equal(resolved.applied, true);
  assert.equal(valid, true);
  assert.equal(input.ring.length, 8, 'retain the existing rear notches');
  const roof = points(roofPositions);
  assert.ok([...roofPositions, ...wallPositions].every(Number.isFinite));
  assert.ok(roof.every(p => p.y >= resolved.wallTop - 1e-7 && p.y <= resolved.roofTop + 1e-7));
  assert.ok(Math.abs(projectedArea(roofPositions) - Math.abs(THREE.ShapeUtils.area(outer))) < 1e-5, 'roof exactly covers the existing source area');
  const streetEave = roof.filter(p => Math.abs(localFront(input.profile, p).v) < 1e-6);
  assert.ok(streetEave.length);
  assert.ok(streetEave.every(p => Math.abs(p.y - resolved.wallTop) < .01), 'source-edge skew leaves less than 1 cm eave variation, not a brick triangle');
  assert.ok(resolved.wallTop - resolved.foundationTop < 3.5, 'one principal wall storey replaces the tall inferred blank wall');
});

test('R141, Thrive and the Aylmer block use low flat caps instead of generated gable triangles', () => {
  for (const id of ['way/1006575766', 'way/1006594168', 'way/1006575755']) {
    const {resolved} = fixture(id);
    assert.equal(resolved.applied, true);
    assert.equal(resolved.dimensions.roofShape, 'flat');
    assert.ok(resolved.roofTop - resolved.wallTop <= .13);
    assert.equal(profiles[id].recordedRoof, undefined, 'no separate decorative replacement roof');
  }
});
