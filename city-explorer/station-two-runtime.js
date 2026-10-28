import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStationTwoApron } from './station-two-apron.js';
import {
  createDoorState, foldedInnerPivot, frontDoorForTruck as frontDoorForTruckCore, nearestStationDoor, sampleStationFloor, sectionalPanelPose, stationLocalToWorld,
  stationPlayerSpawn, stationTruckSpawn, stationWorldToLocal, stepDoorState, toggleDoor,
  stationCollision, stationDoorObstructed, sweepStationTruck,
} from './station-two-core.mjs';

const STATION_MODEL = './assets/station2/station2.glb?v=1.6.146';
const TRUCK_DIMENSIONS = Object.freeze({ length: 10.5, width: 3.2 });
const FRONT_NODE = /^Door_F([1-3])_([LR])_(Outer|Inner)$/;
const REAR_NODE = /^Door_R([1-2])_Panel([0-6])$/;

export function stationTwoRequested(search = globalThis.location?.search || '') {
  return new URLSearchParams(search).get('station') === '2';
}

function findNodes(root, pattern) {
  const result = new Map();
  root.traverse(node => { if (pattern.test(node.name)) result.set(node.name, node); });
  return result;
}

function validateModel(root, THREE, layout) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const front = findNodes(root, FRONT_NODE);
  const rear = findNodes(root, REAR_NODE);
  const names = new Set(); root.traverse(node => names.add(node.name));
  const expectedFront = 12, expectedRear = 14;
  if (!names.has('Station2_Static') || front.size !== expectedFront || rear.size !== expectedRear) {
    throw new Error(`Station 2 model node contract mismatch (front ${front.size}/${expectedFront}, rear ${rear.size}/${expectedRear}, static ${names.has('Station2_Static')})`);
  }
  const probe = new THREE.Vector3();
  const expectedPivot = (node, x, y, z, name) => {
    const actual = root.worldToLocal(node.getWorldPosition(probe.clone()));
    if (Math.hypot(actual.x - x, actual.y - y, actual.z - z) > 0.2) {
      throw new Error(`Station 2 pivot ${name} is misplaced (${actual.x.toFixed(2)},${actual.y.toFixed(2)},${actual.z.toFixed(2)}); expected (${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)})`);
    }
  };
  layout.frontDoorCenters.forEach((center, index) => {
    expectedPivot(front.get(`Door_F${index + 1}_L_Outer`), center - layout.doorWidth / 2, 0, 0, `Door_F${index + 1}_L_Outer`);
    expectedPivot(front.get(`Door_F${index + 1}_L_Inner`), center - layout.doorWidth / 4, 0, 0, `Door_F${index + 1}_L_Inner`);
    expectedPivot(front.get(`Door_F${index + 1}_R_Outer`), center + layout.doorWidth / 2, 0, 0, `Door_F${index + 1}_R_Outer`);
    expectedPivot(front.get(`Door_F${index + 1}_R_Inner`), center + layout.doorWidth / 4, 0, 0, `Door_F${index + 1}_R_Inner`);
  });
  layout.rearDoorCenters.forEach((center, doorIndex) => {
    for (let panel = 0; panel < 7; panel += 1) {
      expectedPivot(rear.get(`Door_R${doorIndex + 1}_Panel${panel}`), center, (panel + 0.5) * layout.doorHeight / 7, layout.bay.rearZ, `Door_R${doorIndex + 1}_Panel${panel}`);
    }
  });
  for (const node of [...front.values(), ...rear.values()]) {
    for (let parent = node.parent; parent && parent !== root; parent = parent.parent) {
      if (FRONT_NODE.test(parent.name) || REAR_NODE.test(parent.name)) throw new Error(`Dynamic door node ${node.name} is nested under another dynamic pivot`);
    }
  }
  if (size.x < 25 || size.x > 45 || size.y < 7 || size.y > 12 || size.z < 20 || size.z > 40) {
    throw new Error(`Station 2 model bounds are outside the expected metres range (${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)})`);
  }
  return { front, rear, bounds: { x: size.x, y: size.y, z: size.z } };
}

export function createStationTwoRuntime({ THREE, scene, layout, project, baseSurface, onReady = () => {} }) {
  const root = new THREE.Group();
  root.name = 'Station2_Runtime';
  const yaw = layout.site.rotationYDegrees * Math.PI / 180;
  const spawn = stationTruckSpawn(layout, project);
  const playerSpawn = stationPlayerSpawn(layout, spawn.anchor, yaw);
  const groundSamples = [];
  for (let x = layout.bay.minX; x <= layout.bay.maxX; x += 3) {
    for (let z = layout.bay.frontZ; z <= layout.bay.rearZ + 0.01; z += layout.bay.rearZ / 8) {
      const point = stationLocalToWorld({ x, z }, spawn.anchor, yaw);
      const height = baseSurface(point.x, point.z)?.height;
      if (Number.isFinite(height)) groundSamples.push(height);
    }
  }
  // A level floor must clear the terrain at every bay corner in both terrain LODs.
  const datum = Math.max(baseSurface(spawn.anchor.x, spawn.anchor.z)?.height ?? 0, ...groundSamples) + 0.1;
  const state = {
    status: 'loading', error: null, doors: createDoorState(layout.frontDoorCenters.length, layout.rearDoorCenters.length),
    frontNodes: new Map(), rearNodes: new Map(), frontBaseRotations: new Map(), frontBasePositions: new Map(), rearBases: new Map(), bounds: null,
  };
  let loaded = false;

  async function load() {
    return new Promise(resolve => {
      new GLTFLoader().load(STATION_MODEL, gltf => {
        try {
          const contract = validateModel(gltf.scene, THREE, layout);
          state.frontNodes = contract.front;
          state.rearNodes = contract.rear;
          state.bounds = contract.bounds;
          for (const node of state.frontNodes.values()) { state.frontBaseRotations.set(node, node.rotation.y); state.frontBasePositions.set(node, node.position.clone()); }
          for (const node of state.rearNodes.values()) state.rearBases.set(node, { position: node.position.clone(), rotation: node.rotation.clone() });
          root.position.set(spawn.anchor.x, datum, spawn.anchor.z);
          root.rotation.y = yaw;
          root.add(gltf.scene);
          const foundationMaterial = new THREE.MeshStandardMaterial({ color: 0x6d7068, roughness: 1 });
          const foundationDepth = Math.max(0.5, datum - Math.min(...groundSamples) + 0.35);
          for (const volume of [layout.bay, layout.wing, layout.tower, layout.sideAnnex].filter(Boolean)) {
            const base = new THREE.Mesh(new THREE.BoxGeometry(volume.maxX - volume.minX, foundationDepth, volume.rearZ - volume.frontZ), foundationMaterial);
            base.position.set((volume.minX + volume.maxX) / 2, -foundationDepth / 2 - 0.01, (volume.frontZ + volume.rearZ) / 2);
            base.name = 'Station2_foundation'; root.add(base);
          }
          scene.add(root);
          loaded = true;
          state.status = 'ready';
          root.add(createStationTwoApron({ THREE, layout, worldPoint, surfaceAt, baseSurface, datum }));
          for (const z of [6, 17]) {
            const light = new THREE.PointLight(0xffefd6, 68, 22, 2);
            light.position.set(0, 5.3, z);
            light.name = `Station2_bay_light_${z}`;
            root.add(light);
          }
          onReady({ sourceId: layout.site.candidateReplacementOsmId, root });
          resolve(true);
        } catch (error) {
          root.removeFromParent();
          loaded = false;
          state.status = 'error'; state.error = String(error?.message || error);
          resolve(false);
        }
      }, undefined, error => {
        state.status = 'error'; state.error = String(error?.message || 'Station 2 GLB could not be loaded');
        resolve(false);
      });
    });
  }

  function surfaceAt(x, z) {
    if (!loaded) return null;
    const local = stationWorldToLocal({ x, z }, spawn.anchor, yaw);
    return sampleStationFloor(layout, local, datum, () => baseSurface(x, z)?.height);
  }

  function worldPoseToLocal(pose) {
    const local = stationWorldToLocal(pose, spawn.anchor, yaw);
    return { ...local, heading: (Number(pose.heading) || 0) - yaw };
  }

  function collides(position, options = {}) {
    if (!loaded) return false;
    const local = worldPoseToLocal(position);
    const dimensions = options.player ? { length: 0.7, width: 0.7 } : TRUCK_DIMENSIONS;
    return stationCollision(local, layout, state.doors, dimensions, options);
  }

  function sweep(previous, next) {
    if (!loaded) return false;
    return sweepStationTruck(worldPoseToLocal(previous), worldPoseToLocal(next), layout, state.doors, TRUCK_DIMENSIONS);
  }

  function obstruction(index, side, truck, player) {
    if (side !== 'front') return false;
    const truckLocal = truck ? worldPoseToLocal(truck) : null;
    const playerLocal = player ? stationWorldToLocal(player, spawn.anchor, yaw) : null;
    return stationDoorObstructed(layout, index, truckLocal, playerLocal, TRUCK_DIMENSIONS);
  }

  function update(delta, truck, player) {
    if (!loaded) return;
    state.doors = stepDoorState(state.doors, delta, (index, side) => obstruction(index, side, truck, player));
    for (const [name, node] of state.frontNodes) {
      const [, doorNumber, side, leaf] = name.match(FRONT_NODE);
      const fraction = state.doors.front[Number(doorNumber) - 1]?.fraction || 0;
      const base = state.frontBasePositions.get(node);
      if (leaf === 'Outer') {
        node.position.copy(base);
        node.rotation.y = state.frontBaseRotations.get(node) + (side === 'L' ? 1 : -1) * fraction * Math.PI / 2;
      } else {
        const folded = foldedInnerPivot(base, side, fraction, layout.doorWidth);
        node.position.set(folded.x, folded.y, folded.z);
        node.rotation.y = state.frontBaseRotations.get(node) + folded.rotationY;
      }
    }
    for (const [name, node] of state.rearNodes) {
      const [, doorNumber, panelNumber] = name.match(REAR_NODE);
      const fraction = state.doors.rear[Number(doorNumber) - 1]?.fraction || 0;
      const panel = Number(panelNumber);
      const base = state.rearBases.get(node);
      const pose = sectionalPanelPose(base.position, panel, fraction, layout);
      node.position.set(pose.x, pose.y, pose.z);
      node.rotation.copy(base.rotation);
      node.rotation.x += pose.rotationX;
    }
  }

  function nearestDoor(worldPoint) {
    if (!loaded) return null;
    const local = stationWorldToLocal(worldPoint, spawn.anchor, yaw);
    const nearest = nearestStationDoor(local, layout, 12);
    return nearest && { side: nearest.side, index: nearest.index };
  }

  function frontDoorForTruck(worldTruck) {
    if (!loaded || !worldTruck) return -1;
    return frontDoorForTruckCore(worldPoseToLocal(worldTruck), layout, 18);
  }

  function toggleFrontDoorForTruck(worldTruck) {
    const index = frontDoorForTruck(worldTruck);
    if (index < 0) return null;
    state.doors = toggleDoor(state.doors, index, 'front');
    return { side: 'front', index };
  }

  function containsBay(worldPoint) {
    if (!loaded) return false;
    const local = stationWorldToLocal(worldPoint, spawn.anchor, yaw);
    return local.z >= layout.bay.frontZ && local.z <= layout.bay.rearZ && local.x >= layout.bay.minX && local.x <= layout.bay.maxX;
  }

  function localPoint(worldPoint) { return stationWorldToLocal(worldPoint, spawn.anchor, yaw); }
  function worldPoint(local) { const point = stationLocalToWorld(local, spawn.anchor, yaw); return { x: point.x, z: point.z }; }

  function resetDoors() { state.doors = createDoorState(layout.frontDoorCenters.length, layout.rearDoorCenters.length); }

  function getStatus() {
    return { status: state.status, error: state.error, datum, groundRange: [Math.min(...groundSamples), Math.max(...groundSamples)], bounds: state.bounds, doors: structuredClone(state.doors), loaded };
  }

  return { root, spawn, playerSpawn, yaw, load, surfaceAt, collides, sweep, update, nearestDoor, frontDoorForTruck, toggleFrontDoorForTruck, getStatus, resetDoors, isReady: () => loaded, containsBay, localPoint, worldPoint, datum };
}
