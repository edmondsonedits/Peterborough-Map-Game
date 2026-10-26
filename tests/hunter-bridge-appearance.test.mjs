import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createHunterBridgeAppearance } from '../city-explorer/hunter-bridge-appearance.js';

const ring = [
  { x: 0, y: -9 }, { x: 100, y: -9 },
  { x: 100, y: 9 }, { x: 0, y: 9 }, { x: 0, y: -9 },
];
const segments = [
  { a: { x: -5, y: 0 }, b: { x: 105, y: 0 }, aY: 3, bY: 8, width: 7.15, lineId: 'way/33954231' },
  { a: { x: 0, y: 0.5 }, b: { x: 100, y: 0.5 }, aY: 3, bY: 8, width: 7.15, lineId: 'way/177049271' },
  { a: { x: 0, y: 1 }, b: { x: 100, y: 1 }, aY: 3, bY: 8, width: 7.15, lineId: 'way/99999999' },
];

function create(lowPower = false) {
  return createHunterBridgeAppearance({ THREE, segments, bridgeRing: ring, lowPower });
}

function attributes(group, key = 'position') {
  const result = [];
  group.traverse(object => {
    if (object.isMesh && object.geometry?.attributes?.[key]) result.push(object.geometry.attributes[key].array);
  });
  return result.flatMap(array => Array.from(array));
}

test('builds a deterministic, finite, lite-aware appearance in a small number of batches', () => {
  const group = create();
  const repeated = create();
  assert.equal(group.isGroup, true);
  assert.equal(group.userData.collision, false);
  assert.ok(group.children.length <= 8, `got ${group.children.length} draw batches`);
  assert.ok(group.children.every(child => child.isMesh));
  assert.ok(attributes(group).length > 0);
  assert.ok(attributes(group).every(Number.isFinite));
  assert.ok(attributes(group, 'normal').every(Number.isFinite));
  assert.ok(attributes(group, 'normal').every(value => Math.abs(value) <= 1));
  assert.deepEqual(attributes(group), attributes(repeated));
  assert.ok(group.userData.bridgeStations.length > 0);
  assert.ok(group.userData.lampMarks.length > 0);
  assert.ok(create(true).children.length <= group.children.length);
});

test('locates stations from both approved source ways and keeps every station inside the official outline', () => {
  const group = create();
  const stations = group.userData.bridgeStations;
  assert.ok(stations.some(station => station.lineId === 'way/33954231'));
  assert.ok(stations.some(station => station.lineId === 'way/177049271'));
  assert.ok(stations.every(station => station.insideRing));
  assert.ok(stations.every(station => station.edgeLeft > 0 && station.edgeRight > 0));
  assert.ok(stations.every(station => {
    const expected = station.lineId === 'way/33954231' ? 3 + (station.x + 5) / 110 * 5 : 3 + station.x / 100 * 5;
    return Math.abs(station.y - expected) < 1e-8;
  }), 'each station follows linearly interpolated source grade');
});

test('keeps generated sidewalks and railings beyond the OSM traffic width and within polygon edges', () => {
  const group = create();
  for (const station of group.userData.bridgeStations) {
    for (const side of [station.left, station.right]) {
      assert.ok(side.trafficHalfWidth >= 7.15 / 2 - 1e-6);
      assert.ok(side.sidewalkInner >= side.trafficHalfWidth + side.curbWidth - 1e-6);
      assert.ok(side.sidewalkOuter <= side.edgeDistance - 0.05 + 1e-6);
      assert.ok(side.railingCenter + 0.19 <= side.edgeDistance - 0.05 + 1e-6);
      assert.ok(side.railingCenter > side.trafficHalfWidth);
    }
  }
});

test('builds a continuous sloped walkway against the parapet and keeps medallions on the vertical panel face', () => {
  const group = create();
  const sidewalk = group.children.find(child => child.name === 'HunterBridgeSidewalk');
  const curb = group.children.find(child => child.name === 'HunterBridgeCurb');
  const medallions = group.children.find(child => child.name === 'HunterBridgeGreenMedallions');
  assert.ok(sidewalk && curb && medallions);
  assert.equal(medallions.material.side, THREE.DoubleSide);
  const sidewalkY = Array.from(sidewalk.geometry.attributes.position.array).filter((_, index) => index % 3 === 1);
  assert.ok(new Set(sidewalkY).size > 10, 'sidewalk mesh follows changing road grade instead of flat sample tiles');
  assert.ok(group.userData.sidewalkSpans.length > 10);
  assert.ok(group.userData.sidewalkSpans.every(span => span.toY > span.fromY));
  assert.ok(group.userData.bridgeStations.every(station => [station.left, station.right].every(side => {
    return side.sidewalkOuter <= side.railingCenter - 0.19 + 1e-6
      && side.sidewalkWidth > 1.5
      && side.sidewalkInner >= side.trafficHalfWidth + side.curbWidth - 1e-6;
  })));

  const greenPositions = medallions.geometry.attributes.position.array;
  for (let i = 0; i < greenPositions.length; i += 3) {
    const x = greenPositions[i], y = greenPositions[i + 1];
    const grades = [3 + (x + 5) / 110 * 5, 3 + x / 100 * 5];
    assert.ok(Math.min(...grades.map(grade => Math.abs(y - (grade + 0.715)))) < 0.28,
      'medallion vertices stay near the inset panel height, not below the deck');
  }

  const inward = group.userData.medallionMarks.filter(mark => mark.face === 'inward');
  const outward = group.userData.medallionMarks.filter(mark => mark.face === 'outward');
  assert.ok(inward.length > 0 && outward.length > 0, 'decorative medallions are authored on both parapet faces');
  assert.ok(inward.every(mark => mark.normalOffset < -0.19 && mark.greenRadius <= 0.135 && mark.ringOuter <= 0.185));
  assert.ok(outward.every(mark => mark.normalOffset > 0.19 && mark.greenRadius <= 0.135 && mark.ringOuter <= 0.185));
  const greenCenters = [];
  for (let i = 0; i < greenPositions.length; i += 9) greenCenters.push([greenPositions[i], greenPositions[i + 1], greenPositions[i + 2]]);
  for (const mark of inward) {
    const center = greenCenters.find(([x, , z]) => Math.hypot(x - (mark.x + mark.normalX * mark.normalOffset), z - (mark.z + mark.normalZ * mark.normalOffset)) < 1e-5);
    assert.ok(center, 'each green inset has an inward-face center vertex outside the wall thickness');
    assert.ok((center[0] - mark.x) * mark.normalX + (center[2] - mark.z) * mark.normalZ < -0.19,
      'the roadway-facing motif lies on the interior normal side of the parapet');
  }
});

test('spaces lamp piers along connected physical ways and does not restart at segment joints', () => {
  const pairedNorthSideMarks = create().userData.lampMarks.filter(mark => mark.z > 0).sort((a, b) => a.x - b.x);
  assert.ok(pairedNorthSideMarks.length >= 2);
  assert.equal(new Set(pairedNorthSideMarks.map(mark => mark.x.toFixed(3))).size, pairedNorthSideMarks.length,
    'parallel approved ways share physical pier locations rather than doubling posts');
  for (let i = 1; i < pairedNorthSideMarks.length; i++) {
    assert.ok(Math.abs(pairedNorthSideMarks[i].x - pairedNorthSideMarks[i - 1].x - 33) < 1e-5);
  }

  const splitSegments = [
    { a: { x: 30, y: 0 }, b: { x: 60, y: 0 }, aY: 4.5, bY: 6, width: 7.15, lineId: 'way/33954231' },
    { a: { x: 60, y: 0 }, b: { x: 100, y: 0 }, aY: 6, bY: 8, width: 7.15, lineId: 'way/33954231' },
    { a: { x: 0, y: 0 }, b: { x: 30, y: 0 }, aY: 3, bY: 4.5, width: 7.15, lineId: 'way/33954231' },
  ];
  const group = createHunterBridgeAppearance({ THREE, segments: splitSegments, bridgeRing: ring });
  const northSideMarks = group.userData.lampMarks.filter(mark => mark.z > 0).sort((a, b) => a.x - b.x);
  assert.ok(northSideMarks.length >= 2);
  for (let i = 1; i < northSideMarks.length; i++) {
    assert.ok(Math.abs(northSideMarks[i].x - northSideMarks[i - 1].x - 33) < 1e-5,
      'lamp spacing is cumulative across source-segment joints');
  }
});








test('both concrete parapets expose their near faces to a viewer on the roadway',()=>{
 const span=[{a:{x:0,y:0},b:{x:100,y:0},aY:3,bY:3,width:7.15,lineId:'way/33954231:0'}];
 const group=createHunterBridgeAppearance({THREE,segments:span,bridgeRing:ring});group.updateMatrixWorld(true);
 const station=group.userData.bridgeStations.find(s=>s.x>10&&s.x<20);
 for(const [sign,side] of [[1,station.left],[-1,station.right]]){
   const ray=new THREE.Raycaster(new THREE.Vector3(station.x,station.y+.85,station.z),new THREE.Vector3(0,0,sign));
   const hits=ray.intersectObject(group.getObjectByName('HunterBridgeConcrete'));
   assert.ok(hits.length>0,'visible concrete on both sides');
   assert.ok(Math.abs(hits[0].distance-(side.railingCenter-.19))<.001,'ray must hit the near post face rather than its inverted back face');
 }
});

test('both raised walkways face upward and render above the asphalt',()=>{
 const group=createHunterBridgeAppearance({THREE,segments:[{a:{x:0,y:0},b:{x:100,y:0},aY:3,bY:3,width:7.15,lineId:'way/33954231:0'}],bridgeRing:ring});
 group.updateMatrixWorld(true);
 for(const sign of [1,-1]){
   const ray=new THREE.Raycaster(new THREE.Vector3(30,10,sign*5),new THREE.Vector3(0,-1,0));
   const hits=ray.intersectObject(group.getObjectByName('HunterBridgeSidewalk'));
   assert.ok(hits.length>0,'walkway must be visible from above on each side');
   assert.ok(Math.abs(hits[0].point.y-3.132)<.001);
 }
});
