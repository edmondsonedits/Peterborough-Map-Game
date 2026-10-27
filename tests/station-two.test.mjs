import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  stationLocalToWorld, stationWorldToLocal, stationTruckSpawn, foldedInnerPivot, sectionalPanelPose,
  createDoorState, createStationTwoPresentationDoorState, stationTwoReplacementSourceMatches, hideStationTwoReplacementRecords, toggleDoor, stepDoorState, sampleStationFloor,
  stationCollision, stationDoorObstructed, stationRearDoorObstructed, stationDoorObstructedForSide, sweepStationTruck, nearestStationDoor,
} from '../city-explorer/station-two-core.mjs';

const layout = JSON.parse(await readFile(new URL('../city-explorer/assets/station2/layout.json', import.meta.url)));
const glb = await readFile(new URL('../city-explorer/assets/station2/station2.glb', import.meta.url));
const jsonChunkLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonChunkLength).toString('utf8'));
const glbNodes = new Map(gltf.nodes.map(node => [node.name, node]));
assert.ok(glbNodes.has('Station2_Static'));
for (let index = 0; index < 3; index += 1) {
  const center = layout.frontDoorCenters[index];
  const expected = {
    [`Door_F${index + 1}_L_Outer`]: center - layout.doorWidth / 2,
    [`Door_F${index + 1}_L_Inner`]: center - layout.doorWidth / 4,
    [`Door_F${index + 1}_R_Outer`]: center + layout.doorWidth / 2,
    [`Door_F${index + 1}_R_Inner`]: center + layout.doorWidth / 4,
  };
  for (const [name, x] of Object.entries(expected)) {
    const pivot = glbNodes.get(name);
    assert.ok(pivot, `GLB has independent pivot ${name}`);
    assert.ok(Math.abs(pivot.translation[0] - x) < 0.02 && Math.abs(pivot.translation[1]) < 0.02 && Math.abs(pivot.translation[2]) < 0.02, `${name} matches the shared door jamb/seam layout`);
  }
}
for (let door = 0; door < layout.rearDoorCenters.length; door += 1) {
  for (let panel = 0; panel < 7; panel += 1) {
    const pivot = glbNodes.get(`Door_R${door + 1}_Panel${panel}`);
    assert.ok(pivot, `GLB has rear section panel ${door + 1}/${panel}`);
    assert.ok(Math.abs(pivot.translation[0] - layout.rearDoorCenters[door]) < 0.02, 'rear panels align to their layout door center');
    assert.ok(Math.abs(pivot.translation[1] - (panel + 0.5) * layout.doorHeight / 7) < 0.02, 'rear panels are centered on the seven-section vertical stack');
    assert.ok(Math.abs(pivot.translation[2] - layout.bay.rearZ) < 0.02, 'rear panels sit in the layout rear plane');
  }
}
const yaw = layout.site.rotationYDegrees * Math.PI / 180;
const anchor = { x: 0, z: 0 };

const presentationDoors = createStationTwoPresentationDoorState(layout);
assert.deepEqual(presentationDoors.front.map(door => door.fraction), [0, 1, 0], 'presentation leaves the center front door open for straight driveout');
assert.deepEqual(presentationDoors.rear.map(door => door.fraction), [0, 0], 'rear doors remain closed in the static presentation');
assert.equal(stationTwoReplacementSourceMatches('way/1022083769', 'way/1022083769'), true);
assert.equal(stationTwoReplacementSourceMatches('1022083769', 'way/1022083769'), true, 'source matcher accepts OSM converters that expose a bare numeric id');
assert.equal(stationTwoReplacementSourceMatches('way/1022084255', 'way/1022083769'), false, 'source matcher does not hide adjacent buildings');
const lateBuildingRecords = new Map();
const hiddenRecordIds = [];
lateBuildingRecords.set('neighbor', { id: 'neighbor', sourceType: 'building', sourceId: 'way/1022084255' });
lateBuildingRecords.set('arena', { id: 'arena', sourceType: 'building', sourceId: 'way/1022083769' });
const replacementHide = hideStationTwoReplacementRecords(lateBuildingRecords.values(), 'way/1022083769', id => (hiddenRecordIds.push(id), true));
assert.deepEqual(replacementHide, { candidate: 'way/1022083769', matched: 1, hidden: 1, sourceIds: ['way/1022083769'] }, 'late batched registration hides only the confirmed replacement source');
assert.deepEqual(hiddenRecordIds, ['arena']);

assert.deepEqual(nearestStationDoor({ x: 0, z: 9 }, layout), { side: 'front', index: 1, distance: 7.5 }, 'truck spawn selects a reachable front door');
assert.deepEqual(nearestStationDoor({ x: 0, z: 18 }, layout), { side: 'rear', index: 0, distance: layout.bay.rearZ - 18 - 1.5 }, 'truck near the rear threshold selects its closest rear door');
assert.equal(nearestStationDoor({ x: 100, z: 100 }, layout), null, 'door controls stay out of reach outside the station');

assert.deepEqual(stationLocalToWorld({ x: 0, z: 0 }, anchor, yaw), { x: 0, z: 0 });
const world = stationLocalToWorld({ x: 2, z: 9 }, anchor, yaw);
const local = stationWorldToLocal(world, anchor, yaw);
assert.ok(Math.abs(local.x - 2) < 1e-9 && Math.abs(local.z - 9) < 1e-9, 'station transform round trips');

const spawn = stationTruckSpawn(layout, (lat, lon) => ({ x: (lon + 78.3162262) * 79000, z: -(lat - 44.3357121) * 111320 }));
assert.ok(Math.hypot(spawn.x - 3.95, spawn.z + 8.12) < 0.5, 'local (0,9) spawn preserves reviewed truck geographic position');
assert.ok(Math.abs(spawn.heading - yaw) < 1e-9);
const vector2Spawn = stationTruckSpawn(layout, (lat, lon) => ({ x: (lon + 78.3162262) * 79000, y: -(lat - 44.3357121) * 111320 }));
assert.ok(Number.isFinite(vector2Spawn.z) && Math.hypot(vector2Spawn.x - spawn.x, vector2Spawn.z - spawn.z) < 1e-9, 'Three.js Vector2 projection anchors use y as world z');

let doors = createDoorState(3);
assert.equal(stationCollision({ x: 0, z: -4, heading: 0 }, layout, doors, { length: 10.4, width: 3.2 }), true, 'closed front door blocks truck body');
assert.equal(stationCollision({ x: 0, z: 0.1, heading: 0 }, layout, doors, { length: 10.4, width: 3.2 }, { player: true }), true);
const centerDoorOpen = { ...doors, front: doors.front.map((door, index) => index === 1 ? { fraction: 1, target: 1 } : door) };
assert.equal(stationCollision({ x: 0, z: -4, heading: 0 }, layout, centerDoorOpen, { length: 10.5, width: 3.2 }), false, 'open centered doorway clears the truck envelope');
assert.equal(stationCollision({ x: 0.5, z: -4, heading: 0 }, layout, centerDoorOpen, { length: 10.5, width: 3.2 }), true, 'folded front leaves still block a truck shifted into their stack');
assert.equal(stationCollision({ x: 0, z: -4, heading: 0 }, layout, { ...doors, front: doors.front.map(door => ({ ...door, fraction: 1, target: 1 })) }, { length: 10.4, width: 3.2 }), false, 'all open doors clear the conservative truck envelope');
assert.equal(stationCollision({ x: 9.2, z: 8, heading: 0 }, layout, doors, { length: 10.4, width: 3.2 }), true, 'side wall blocks truck side');
assert.equal(stationCollision({ x: -5, z: 18, heading: 0 }, layout, doors, { length: 10.4, width: 3.2 }), true, 'rear service block is a collision boundary');
const rearOpen = { ...doors, rear: doors.rear.map(() => ({ fraction: 1, target: 1 })) };
assert.equal(stationCollision({ x: 0, z: 27, heading: 0 }, layout, rearOpen, { length: 10.4, width: 3.2 }), false, 'fully open rear sectional door clears the exit lane');
assert.equal(sweepStationTruck({ x: 4.5, z: -10, heading: 0 }, { x: 4.5, z: -1, heading: 0 }, layout, doors, { length: 10.4, width: 3.2 }), true, 'swept truck movement cannot skip a closed door');
const allFrontOpen = { ...doors, front: doors.front.map(() => ({ fraction: 1, target: 1 })) };
assert.equal(sweepStationTruck({ x: 4, z: 9, heading: Math.PI - 0.01 }, { x: 4, z: 9, heading: -Math.PI + 0.01 }, layout, allFrontOpen, { length: 10.5, width: 3.2 }), false, 'swept truck heading interpolates across the angle wrap by the short turn');

doors = toggleDoor(doors, 0);
assert.equal(doors.front[0].target, 1);
doors = stepDoorState(doors, 1, () => false, 20);
assert.equal(doors.front[0].fraction, 1);
doors = toggleDoor(doors, 0);
doors = stepDoorState(doors, 0.1, () => true, 20);
assert.equal(doors.front[0].fraction, 1, 'door cannot close while obstructed');
assert.equal(stationDoorObstructed(layout, 1, { x: 0, z: 4, heading: 0 }, null, { length: 10.5, width: 3.2 }), true, 'truck envelope obstructs the front door leaf');
assert.equal(stationRearDoorObstructed(layout, 0, { x: 0, z: 20, heading: 0 }, null, { length: 10.5, width: 3.2 }), true, 'truck envelope obstructs the rear sectional door');
const adapterObstruction = (index, side, truck, player) => stationDoorObstructedForSide(layout, index, side, truck, player, { length: 10.5, width: 3.2 });
for (const occupant of [{ truck: { x: 0, z: 20, heading: 0 } }, { player: { x: 0, z: 22 } }]) {
  let rear = createDoorState(3, 2);
  rear = toggleDoor(rear, 0, 'rear');
  rear = stepDoorState(rear, 1, () => false, 20);
  rear = toggleDoor(rear, 0, 'rear');
  rear = stepDoorState(rear, 0.1, (index, side) => adapterObstruction(index, side, occupant.truck || null, occupant.player || null), 20);
  assert.equal(rear.rear[0].fraction, 1, 'adapter resolver reopens a rear door for a truck or player in its threshold');
}
let rearDoors = createDoorState(3, 2);
rearDoors = toggleDoor(rearDoors, 0, 'rear');
rearDoors = stepDoorState(rearDoors, 1, () => false, 20);
rearDoors = toggleDoor(rearDoors, 0, 'rear');
rearDoors = stepDoorState(rearDoors, 0.1, (index, side) => side === 'rear', 20);
assert.equal(rearDoors.rear[0].fraction, 1, 'rear sectional door stays open while the truck occupies its threshold');

const surface = sampleStationFloor(layout, { x: 0, z: 8 }, 100, () => 90);
assert.equal(surface.height, 100);
assert.equal(sampleStationFloor(layout, { x: 100, z: 8 }, 100, () => 90), null, 'floor is bounded to station footprint');
const apronBlend = sampleStationFloor(layout, { x: 0, z: -10 }, 100, () => 90);
assert.ok(apronBlend.height > 90 && apronBlend.height < 100, 'near apron smoothly blends terrain into the slab');
assert.equal(sampleStationFloor(layout, { x: 0, z: layout.apron.frontZ + 5 }, 100, () => 90), null, 'apron sampler leaves the surveyed approach road untouched');
const rearBlend = sampleStationFloor(layout, { x: 0, z: layout.bay.rearZ + 4 }, 100, () => 90);
assert.ok(rearBlend.height > 90 && rearBlend.height < 100, 'rear exit lane blends to the base surface over a short bounded distance');
const leftFold = foldedInnerPivot({ x: -1, y: 0, z: 0 }, 'L', 1, layout.doorWidth);
const rightFold = foldedInnerPivot({ x: 1, y: 0, z: 0 }, 'R', 1, layout.doorWidth);
assert.ok(leftFold.x < -1 && rightFold.x > 1 && leftFold.z < 0 && rightFold.z < 0, 'inner leaves follow their outer leaves into the paired fold');
const upperPanel = sectionalPanelPose({ x: 0, y: 3.95, z: layout.bay.rearZ }, 6, 1, layout);
assert.ok(upperPanel.y >= layout.doorHeight && Math.abs(upperPanel.rotationX + Math.PI / 2) < 1e-9, 'rear panels clear the opening and lie on the overhead track');

assert.equal(stationCollision({ x: 10.5, z: 4, heading: 0 }, layout, createStationTwoPresentationDoorState(layout), { length: 0.7, width: 0.7 }, { player: true }), true, 'photo-based timber annex blocks entry');
assert.equal(stationCollision({ x: 10.5, z: 18, heading: 0 }, layout, createStationTwoPresentationDoorState(layout), { length: 0.7, width: 0.7 }, { player: true }), true, 'rear-positioned tower blocks entry');

console.log('Station Two core: shared transform, reviewed spawn, bounded slab/apron, door obstruction and swept truck collision passed.');
