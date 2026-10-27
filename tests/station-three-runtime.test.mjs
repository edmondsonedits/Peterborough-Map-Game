import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIRE_STATION_THREE, PLAYER_TUNING, directionFromHeading } from '../city-explorer/gameplay-systems-1.6.69.js';
import {
  attachStationThreeModel,
  createStationThreeDoorController,
  inspectStationThreeModel,
  loadStationThreeAsset,
  selectStationThreeSpawn,
  stationGameplayLabels,
  stationThreeLocalPosition,
  stationThreeThrottleInput,
  STATION_THREE_INITIAL_CAMERA_DISTANCE_SCALE,
  STATION_THREE_BAY_EXIT_LOCAL_Z,
} from '../city-explorer/station-three-runtime.js';

function modelWithDoors() {
  const root = { name: 'Station3', children: [] };
  for (let doorNumber = 1; doorNumber <= 3; doorNumber += 1) {
    const suffix = String(doorNumber).padStart(2, '0');
    const door = { name: `Station3_Door_${suffix}`, position: { y: 0 }, children: [] };
    for (let slat = 0; slat < 10; slat += 1) {
      const index = slat;
      const position = { x: 0, y: 0.21 + 0.42 * index, z: 0 };
      position.set = (x, y, z) => Object.assign(position, { x, y, z });
      door.children.push({
        name: `Station3_Door_${suffix}_Slat_${String(index).padStart(2, '0')}`,
        position,
        rotation: { x: 0 },
        children: [],
      });
    }
    root.children.push(door);
  }
  const assignTraverse = object => {
    object.traverse = function traverse(visitor) {
      visitor(this);
      this.children?.forEach(child => child.traverse(visitor));
    };
    object.children?.forEach(assignTraverse);
  };
  assignTraverse(root);
  return root;
}

function readGlbDocument(path) {
  const bytes = readFileSync(path);
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) return JSON.parse(bytes.toString('utf8', offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  throw new Error('Station 3 GLB has no JSON chunk');
}

test('Station 3 model is accepted only when all three doors and ten named slats exist', () => {
  const root = modelWithDoors();
  assert.equal(inspectStationThreeModel(root).ready, true);
  root.children[1].children.pop();
  assert.equal(inspectStationThreeModel(root).ready, false);
  const badTransform = modelWithDoors();
  delete badTransform.children[0].children[0].position;
  assert.equal(inspectStationThreeModel(badTransform).ready, false);
});

test('door controller waits for reveal delay, lifts doors, and reset returns all doors down', () => {
  const inspection = inspectStationThreeModel(modelWithDoors());
  const controller = createStationThreeDoorController({
    doors: inspection.doors,
    doorNames: ['Station3_Door_01'],
    delayMs: 500,
    durationMs: 1000,
  });

  controller.start(1000);
  controller.update(1499);
  assert.equal(controller.phase, 'waiting');
  assert.equal(inspection.doors[0].slats[0].position.y, 0.21);
  controller.update(2000);
  assert.equal(controller.phase, 'opening');
  assert.ok(Math.abs(inspection.doors[0].slats[0].position.y - 2.31) < 1e-9);
  assert.ok(Math.abs(inspection.doors[0].slats[0].rotation.x) < 1e-9);
  const midAnimationPositions = inspection.doors[0].slats.map(slat => slat.position.y);
  assert.ok(Math.abs(midAnimationPositions[1] - midAnimationPositions[0] - 0.42) < 1e-9);
  assert.equal(inspection.doors[0].object.children.length, 10, 'slats remain children of their animated door group');
  assert.equal(inspection.doors[1].slats[0].position.y, 0.21, 'other station doors stay closed');
  assert.equal(inspection.doors[2].slats[0].position.y, 0.21, 'other station doors stay closed');
  controller.update(2500);
  assert.equal(controller.phase, 'open');
  assert.equal(inspection.doors[0].slats[0].position.y, 4.2);
  assert.ok(Math.abs(inspection.doors[0].slats[0].position.z + 0.21) < 1e-9);
  assert.ok(Math.abs(inspection.doors[0].slats[0].rotation.x + Math.PI / 2) < 1e-9);
  controller.reset();
  assert.equal(controller.phase, 'closed');
  assert.deepEqual(inspection.doors.map(door => door.slats[0].position.y), [0.21, 0.21, 0.21]);
  assert.equal(inspection.doors[0].slats[0].rotation.x, 0);
});

test('interior spawn is selected only for Station 3 with a ready model', () => {
  const fallback = { x: 10, z: 20, heading: 1 };
  const interior = { x: 2, z: 3, heading: 4 };
  assert.equal(selectStationThreeSpawn({ stationNumber: 1, assetReady: true, fallback, interior }), fallback);
  assert.equal(selectStationThreeSpawn({ stationNumber: 3, assetReady: false, fallback, interior }), fallback);
  assert.equal(selectStationThreeSpawn({ stationNumber: 3, assetReady: true, fallback, interior }), interior);
});

test('interior spawn agrees with transformed GLB Bay 01 marker and faces Door 01', () => {
  const document = readGlbDocument(new URL('../city-explorer/assets/stations/station-3.glb', import.meta.url));
  const root = document.nodes.find(node => node.name === 'Station3_Model');
  const spawn = document.nodes.find(node => node.name === 'Station3_TruckSpawn_Bay01');
  const door = document.nodes.find(node => node.name === 'Station3_Door_01');
  const doorCenters = [1,2,3].map(i => document.nodes.find(node => node.name === `Station3_Door_0${i}`)?.translation?.[0]);
  assert.ok(doorCenters.every(Number.isFinite), 'all door centers are present');
  assert.ok(Math.abs((doorCenters[1] - doorCenters[0]) - (doorCenters[2] - doorCenters[1])) < 0.001, 'bay spacing is even');
  assert.ok(Math.abs((14.1 - (doorCenters[2] + 2.3)) - (doorCenters[1] - doorCenters[0] - 4.6)) < 0.02, 'right end pier matches the interior piers');
  assert.ok(root?.rotation && spawn?.translation && door?.translation);

  const [, quaternionY, , quaternionW] = root.rotation;
  const yaw = 2 * Math.atan2(quaternionY, quaternionW);
  const transformRootLocal = ([x, , z]) => ({
    x: Math.cos(yaw) * x + Math.sin(yaw) * z,
    z: -Math.sin(yaw) * x + Math.cos(yaw) * z,
  });
  const actualSpawn = transformRootLocal(spawn.translation);
  const doorCenter = transformRootLocal(door.translation);
  assert.ok(Math.abs(actualSpawn.x - FIRE_STATION_THREE.interiorTruckEast) < 0.02);
  assert.ok(Math.abs(actualSpawn.z - FIRE_STATION_THREE.interiorTruckSouth) < 0.02);

  const expectedForward = directionFromHeading(FIRE_STATION_THREE.interiorTruckHeading);
  const toDoor = { x: doorCenter.x - actualSpawn.x, z: doorCenter.z - actualSpawn.z };
  const length = Math.hypot(toDoor.x, toDoor.z);
  const alignment = (toDoor.x * expectedForward.x + toDoor.z * expectedForward.z) / length;
  assert.ok(length > 5.4 && length < 5.8, 'truck starts 5.6 m inside the threshold');
  assert.ok(alignment > 0.999, 'truck forward heading points through the left bay');

  const cameraLocalZ = spawn.translation[2] + 0.6
    - Math.cos(-0.19) * PLAYER_TUNING.cameraDistance * STATION_THREE_INITIAL_CAMERA_DISTANCE_SCALE;
  assert.ok(cameraLocalZ > -12.5, 'initial camera stays clear of the mapped rear wall at z=-14m');
  const playerLocalX = spawn.translation[0] - FIRE_STATION_THREE.interiorPlayerRightOffset;
  const cameraToDoorAngle = Math.atan2(Math.abs(door.translation[0] - playerLocalX), Math.abs(cameraLocalZ));
  assert.ok(cameraToDoorAngle < Math.PI / 6,
    'Door 01 remains inside the initial camera horizontal field of view');

  const localSpawn = stationThreeLocalPosition({
    x: actualSpawn.x, z: actualSpawn.z, anchorX: 0, anchorZ: 0, modelYaw: yaw,
  });
  assert.ok(Math.abs(localSpawn.x + 0.7) < 0.02);
  assert.ok(Math.abs(localSpawn.z + 5.6) < 0.02);
  assert.ok(STATION_THREE_BAY_EXIT_LOCAL_Z > 5.2, 'interior camera stays active until the truck rear clears the bay');

  const floorNode = document.nodes.find(node => node.name === 'Station3_MappedFootprintFloor');
  const floorMesh = document.meshes[floorNode.mesh];
  const floorPositionAccessor = document.accessors[floorMesh.primitives[0].attributes.POSITION];
  assert.equal(floorPositionAccessor.max[1], 0, 'station floor top aligns with the model terrain anchor');
});

test('Station 3 HUD labels use the selected station and engine number', () => {
  assert.deepEqual(stationGameplayLabels(FIRE_STATION_THREE), {
    station: 'Fire Station 3',
    engine: 'Fire Rescue Engine 3',
  });
});

test('closed Station 3 door blocks forward exit throttle but keeps reverse available', () => {
  const closed = { stationNumber: 3, assetReady: true, doorPhase: 'opening' };
  assert.equal(stationThreeThrottleInput({ ...closed, throttle: 1 }), 0);
  assert.equal(stationThreeThrottleInput({ ...closed, throttle: -1 }), -1);
  assert.equal(stationThreeThrottleInput({ ...closed, throttle: 0.4 }), 0);
  assert.equal(stationThreeThrottleInput({ ...closed, doorPhase: 'open', throttle: 1 }), 1);
  assert.equal(stationThreeThrottleInput({ ...closed, stationNumber: 2, throttle: 1 }), 1);
  assert.equal(stationThreeThrottleInput({ ...closed, assetReady: false, throttle: 1 }), 1);
});

test('stalled Station 3 asset fetch is aborted and resolves to fallback at its deadline', async () => {
  let requestSignal;
  const result = await loadStationThreeAsset({
    url: '/station-3.glb',
    timeoutMs: 10,
    fetchAsset: (_url, { signal }) => {
      requestSignal = signal;
      return new Promise(() => {});
    },
    parseAsset: async () => modelWithDoors(),
  });
  assert.equal(result.reason, 'timeout');
  assert.equal(result.asset, null);
  assert.equal(requestSignal.aborted, true);
});

test('asset parsing that finishes after timeout is disposed and cannot replace fallback', async () => {
  let finishParsing;
  const disposed = [];
  const lateAsset = { id: 'late-glb' };
  const resultPromise = loadStationThreeAsset({
    url: '/station-3.glb',
    timeoutMs: 10,
    fetchAsset: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
    parseAsset: () => new Promise(resolve => { finishParsing = resolve; }),
    disposeAsset: asset => disposed.push(asset),
  });
  const result = await resultPromise;
  assert.equal(result.reason, 'timeout');
  finishParsing(lateAsset);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(disposed, [lateAsset]);
});

test('asset without the named door contract is disposed and reports fallback', async () => {
  const invalidAsset = modelWithDoors();
  invalidAsset.children.splice(1, 1);
  let disposed = null;
  const result = await loadStationThreeAsset({
    url: '/station-3.glb',
    fetchAsset: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
    parseAsset: async () => invalidAsset,
    validateAsset: inspectStationThreeModel,
    disposeAsset: asset => { disposed = asset; },
  });
  assert.equal(result.reason, 'invalid');
  assert.equal(result.asset, null);
  assert.equal(disposed, invalidAsset);
});

test('positioning failure leaves the mapped fallback attached and removes the partial model', () => {
  const fallback = { name: 'mapped-shell', parent: null };
  const parent = { children: [fallback], add(child) { child.parent = this; this.children.push(child); } };
  fallback.parent = parent;
  const root = { parent: null, removeFromParent() { this.parent = null; } };
  const group = {
    parent: null,
    position: { set() {} },
    add(child) { child.parent = this; },
    removeFromParent() { this.parent = null; },
  };
  const result = attachStationThreeModel({
    root,
    parent,
    createGroup: () => group,
    position: { x: 1, y: 2, z: 3 },
    configure: () => { throw new Error('terrain placement failed'); },
  });
  assert.equal(result.group, null);
  assert.equal(root.parent, null);
  assert.equal(fallback.parent, parent);
  assert.deepEqual(parent.children, [fallback]);
});
