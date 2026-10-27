import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  stationOneTruckSpawn, stationOneDoorState, toggleStationOneDoor, stepStationOneDoors,
  stationOnePanelPose, stationOneCollision, sweepStationOneTruck, stationOneDoorObstructed,
  hideStationOneReplacementRecords, stationOneSourceMatches,
} from '../city-explorer/station-one-core.mjs';

const layout = JSON.parse(await readFile(new URL('../city-explorer/assets/station1/layout.json', import.meta.url)));
const glb = await readFile(new URL('../city-explorer/assets/station1/station1.glb', import.meta.url));
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const glbNodes = new Map(gltf.nodes.map(node => [node.name, node]));
assert.ok(glbNodes.has('Station1_Static') && glbNodes.has('Station1_TrainingTower'), 'GLB separates static station and terrain-adjustable tower');
for (let door = 0; door < 5; door += 1) for (let panel = 0; panel < 8; panel += 1) {
  const name = `Door_F${door + 1}_Panel${panel}`;
  const node = glbNodes.get(name);
  assert.ok(node, `GLB has independent sectional node ${name}`);
  assert.ok(Math.abs(node.translation[0] - layout.frontDoorCenters[door]) < 0.02, `${name} aligns with the surveyed facade bay center`);
  assert.ok(Math.abs(node.translation[1] - (panel + 0.5) * layout.doorHeight / 8) < 0.02, `${name} is centered in its eight-section door`);
  assert.ok(Math.abs(node.translation[2] - layout.doorTrack.closedZ) < 0.02, `${name} starts on the facade door plane`);
  assert.deepEqual(node.rotation || [0, 0, 0, 1], [0, 0, 0, 1], `${name} starts with the authored identity rotation`);
}
assert.equal(layout.frontDoorCenters.length, 5, 'layout preserves all five photo-confirmed apparatus bays');
assert.deepEqual(layout.rearDoorCenters, layout.frontDoorCenters, 'owner-confirmed five rear doors align to the five apparatus lanes');
assert.equal(layout.rearDoorsVisualOnly, true, 'rear scenery doors remain closed in this exterior revision');
assert.deepEqual(layout.truckSpawn, { x: -4.64, z: 9, heading: 0 }, 'truck starts in the second bay from viewer-right');
assert.deepEqual(layout.playerSpawn, { x: -2.01, z: 7.5 }, 'player follows the truck to the second bay');

const spawn = stationOneTruckSpawn(layout, () => ({ x: 100, y: 200 }));
assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.z));
assert.ok(Math.hypot(spawn.x - 100, spawn.z - 200) > 1, 'station-local spawn is transformed from its map anchor');
assert.equal(spawn.heading, layout.site.rotationYDegrees * Math.PI / 180);

let doors = stationOneDoorState(layout);
assert.deepEqual(doors.front.map(door => door.fraction), [0, 0, 0, 0, 0], 'all five sectional doors start closed');
assert.deepEqual(doors.rear, [], 'static closed rear doors do not create interactive door state');
doors = toggleStationOneDoor(doors, 1);
assert.deepEqual(doors.front.map(door => door.target), [0, 1, 0, 0, 0], 'only the second bay from viewer-right opens for the truck');
for (let frame = 0; frame < 20; frame += 1) doors = stepStationOneDoors(doors, 0.1);
assert.equal(doors.front[1].fraction, 1);
const panelBases = Array.from({ length: 8 }, (_, index) => ({ x: -4.64, y: (index + 0.5) * layout.doorHeight / 8, z: layout.doorTrack.closedZ }));
const closedPoses = panelBases.map((base, index) => stationOnePanelPose(base, index, 0, layout));
assert.ok(closedPoses.every((pose, index) => Math.abs(pose.y - panelBases[index].y) < 1e-9 && Math.abs(pose.z - layout.doorTrack.closedZ) < 1e-9), 'all sections start at their authored closed center');
const openPoses = panelBases.map((base, index) => stationOnePanelPose(base, index, 1, layout));
assert.ok(openPoses.every(pose => pose.y >= layout.doorHeight), 'fully raised sections clear the complete truck opening');
assert.ok(openPoses.every(pose => pose.z > layout.doorTrack.closedZ && Math.abs(pose.rotationX - Math.PI / 2) < 1e-9), 'open sectional panels lie horizontally on the overhead track');
for (let index = 1; index < openPoses.length; index += 1) {
  assert.ok(Math.abs((openPoses[index].z - openPoses[index - 1].z) - layout.doorHeight / 8) < 1e-9, 'fully open panels remain spaced along the overhead track');
}
const travelSamples = [0, 0.2, 0.4, 0.6, 0.8, 1].map(fraction => stationOnePanelPose(panelBases[0], 0, fraction, layout));
assert.ok(travelSamples.every((pose, index) => index === 0 || (pose.y >= travelSamples[index - 1].y && pose.z >= travelSamples[index - 1].z)), 'panel path rises and curves monotonically into the bay');

const closed = stationOneDoorState(layout);
const rotatedOccupant = { x: -5.6, z: 5, heading: -2.44 };
const allDoorsOpen = { ...closed, front: closed.front.map(() => ({ fraction: 1, target: 1 })) };
const rotatedTargetClosed = { ...allDoorsOpen, front: allDoorsOpen.front.map((door, index) => index === 0 ? { fraction: 0, target: 0 } : door) };
assert.equal(stationOneCollision(rotatedOccupant, layout, allDoorsOpen, { length: 10.5, width: 3.2 }), false, 'reviewed rotated truck pose clears the open bays');
assert.equal(stationOneCollision(rotatedOccupant, layout, rotatedTargetClosed, { length: 10.5, width: 3.2 }), true, 'same truck pose intersects the closed target bay');
assert.equal(stationOneDoorObstructed(layout, 0, rotatedOccupant, null, { length: 10.5, width: 3.2 }), true, 'oriented truck footprint reopens the door it physically obstructs');
assert.equal(stationOneDoorObstructed(layout, 1, rotatedOccupant, null, { length: 10.5, width: 3.2 }), false, 'rotated occupant does not obstruct the neighboring bay');
assert.equal(stationOneDoorObstructed(layout, 0, null, { x: -9.28, z: 0 }, { length: 10.5, width: 3.2 }), true, 'on-foot envelope blocks its own door');
assert.equal(stationOneDoorObstructed(layout, 1, null, { x: -9.28, z: 0 }, { length: 10.5, width: 3.2 }), false, 'on-foot envelope leaves neighboring doors clear');
assert.equal(stationOneCollision({ x: -4.64, z: -4.5, heading: 0 }, layout, closed, { length: 10.5, width: 3.2 }), true, 'closed second-from-right door blocks the truck envelope');
assert.equal(stationOneCollision({ x: -4.64, z: 9, heading: 0 }, layout, closed, { length: 10.5, width: 3.2 }), false, 'parked spawn clears the closed facade');
assert.equal(stationOneCollision({ x: -4.64, z: -4.5, heading: 0 }, layout, doors, { length: 10.5, width: 3.2 }), false, 'open aligned bay permits the truck through');
assert.equal(stationOneCollision({ x: 0, z: -4.5, heading: 0 }, layout, doors, { length: 10.5, width: 3.2 }), true, 'closed neighboring bays remain solid');
assert.equal(sweepStationOneTruck({ x: -4.64, z: 9, heading: 0 }, { x: -4.64, z: -4.5, heading: 0 }, layout, closed, { length: 10.5, width: 3.2 }), true, 'swept movement cannot skip the closed sectional door');
assert.equal(stationOneDoorObstructed(layout, 1, { x: -4.64, z: 4, heading: 0 }, null, { length: 10.5, width: 3.2 }), true, 'truck footprint keeps the target door from closing through it');
assert.equal(stationOneDoorObstructed(layout, 0, { x: -4.64, z: 4, heading: 0 }, null, { length: 10.5, width: 3.2 }), false, 'occupant does not obstruct an adjacent bay');
let closing = { ...doors, front: doors.front.map((door, index) => index === 1 ? { ...door, target: 0 } : door) };
closing = stepStationOneDoors(closing, 0.1, index => stationOneDoorObstructed(layout, index, { x: -4.64, z: 4, heading: 0 }, null, { length: 10.5, width: 3.2 }));
assert.equal(closing.front[1].target, 1, 'obstruction reverses only the occupied overhead door');

assert.equal(stationOneSourceMatches('way/1009651229'), true);
assert.equal(stationOneSourceMatches('city-building/6/3300'), true);
assert.equal(stationOneSourceMatches('way/1009651228'), false, 'neighboring records are not suppressed');
const hidden = [];
assert.deepEqual(hideStationOneReplacementRecords([
  { id: 'front', sourceType: 'building', sourceId: 'way/1009651229' },
  { id: 'tower', sourceType: 'building', sourceId: 'city-building/6/3300' },
  { id: 'neighbor', sourceType: 'building', sourceId: 'way/1009651228' },
], id => (hidden.push(id), true)), { matched: 2, hidden: 2, sourceIds: ['way/1009651229', 'city-building/6/3300'] });
assert.deepEqual(hidden, ['front', 'tower']);

console.log('Station One core: source transform, five-door state, overhead clearance, swept envelope, obstruction, and exact replacement records passed.');
