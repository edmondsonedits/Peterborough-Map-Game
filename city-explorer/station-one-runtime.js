import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPromiseCache } from './asset-request-cache.js';
import {
  stationOneDoorState, stationOneTruckSpawn, stationOneLocalToWorld, stationOneWorldToLocal,
  stationOnePanelPose, stationOneCollision, sweepStationOneTruck, stationOneDoorObstructed,
  sampleStationOneFloor, stepStationOneDoors, toggleStationOneDoor,
  stationOneRequested as stationOneRequestedForSearch,
} from './station-one-core.mjs?v=1.6.198';

const STATION_MODEL = new URL('./assets/station1/station1.glb?v=1.6.198', import.meta.url);
const cacheAssetRequest = createPromiseCache();
export function preloadStationOneAsset() {
  return cacheAssetRequest(STATION_MODEL.href, async () => {
    const response = await fetch(STATION_MODEL);
    if (!response.ok) throw new Error(`Station 1 HTTP ${response.status}`);
    return response.arrayBuffer();
  });
}
const TRUCK_DIMENSIONS = Object.freeze({ length: 10.5, width: 3.2 });
const PANEL_NODE = /^Door_F([1-5])_Panel([0-7])$/;

export function stationOneRequested(search = globalThis.location?.search || '') {
  return stationOneRequestedForSearch(search);
}

function validateModel(model, THREE, layout) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const panels = new Map();
  const names = new Set();
  model.traverse(node => {
    names.add(node.name);
    if (PANEL_NODE.test(node.name)) panels.set(node.name, node);
  });
  const expected = layout.frontDoorCenters.length * layout.doorPanelCount;
  if (panels.size !== expected || !names.has('Station1_Static') || !names.has('Station1_TrainingTower')) {
    throw new Error(`Station 1 model node contract mismatch (panels ${panels.size}/${expected}, static ${names.has('Station1_Static')}, tower ${names.has('Station1_TrainingTower')})`);
  }
  const probe = new THREE.Vector3();
  for (const [name, node] of panels) {
    const [, doorText, panelText] = name.match(PANEL_NODE);
    const door = Number(doorText) - 1, panel = Number(panelText);
    const actual = model.worldToLocal(node.getWorldPosition(probe.clone()));
    const target = { x: layout.frontDoorCenters[door], y: (panel + 0.5) * layout.doorHeight / layout.doorPanelCount, z: layout.doorTrack.closedZ };
    if (Math.hypot(actual.x - target.x, actual.y - target.y, actual.z - target.z) > 0.12) {
      throw new Error(`Station 1 panel ${name} is misplaced (${actual.x.toFixed(2)},${actual.y.toFixed(2)},${actual.z.toFixed(2)})`);
    }
    if (Math.abs(node.rotation.x) + Math.abs(node.rotation.y) + Math.abs(node.rotation.z) > 0.01) {
      throw new Error(`Station 1 panel ${name} must start at identity rotation`);
    }
    for (let parent = node.parent; parent && parent !== model; parent = parent.parent) {
      if (PANEL_NODE.test(parent.name)) throw new Error(`Dynamic panel ${name} is nested under another panel`);
    }
  }
  if (size.x < 50 || size.x > 65 || size.y < 10 || size.y > 27 || size.z < 30 || size.z > 50) {
    throw new Error(`Station 1 model bounds are outside expected metre dimensions (${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)})`);
  }
  return { panels, bounds: { x: size.x, y: size.y, z: size.z } };
}

export function createStationOneRuntime({ THREE, scene, layout, project, baseSurface, stationHeight = null, onReady = () => {} }) {
  const root = new THREE.Group();
  root.name = 'Station1_Runtime';
  const spawn = stationOneTruckSpawn(layout, project);
  const yaw = spawn.yaw;
  const playerSpawn = stationOneLocalToWorld(layout.playerSpawn, spawn.anchor, yaw);
  const groundSamples = [];
  for (let x = layout.bay.minX; x <= layout.bay.maxX; x += 3) {
    for (let z = layout.bay.frontZ; z <= layout.bay.rearZ + 0.01; z += layout.bay.rearZ / 8) {
      const point = stationOneLocalToWorld({ x, z }, spawn.anchor, yaw);
      const height = baseSurface(point.x, point.z)?.height;
      if (Number.isFinite(height)) groundSamples.push(height);
    }
  }
  const anchorHeight = baseSurface(spawn.anchor.x, spawn.anchor.z)?.height;
  const sampledDatum = Math.max(Number.isFinite(anchorHeight) ? anchorHeight : 0, ...groundSamples) + 0.1;
  const datum = Number.isFinite(stationHeight?.datum) ? stationHeight.datum : sampledDatum;
  const state = {
    status: 'loading', error: null, doors: stationOneDoorState(layout),
    panels: new Map(), panelBases: new Map(), bounds: null,
  };
  let loaded = false;

  const worldPoint = local => {
    const point = stationOneLocalToWorld(local, spawn.anchor, yaw);
    return { x: point.x, z: point.z };
  };
  const localPoint = point => stationOneWorldToLocal(point, spawn.anchor, yaw);

  let loadPromise = null;
  function load() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const bytes = await preloadStationOneAsset();
        const gltf = await new GLTFLoader().parseAsync(bytes, new URL('.', STATION_MODEL).href);
        const contract = validateModel(gltf.scene, THREE, layout);
        state.panels = contract.panels;
        state.bounds = contract.bounds;
        for (const [name, node] of state.panels) state.panelBases.set(name, { position: node.position.clone(), rotation: node.rotation.clone() });
        root.position.set(spawn.anchor.x, datum, spawn.anchor.z);
        root.rotation.y = yaw;
        root.add(gltf.scene);
        const tower = gltf.scene.getObjectByName('Station1_TrainingTower');
        if (tower) {
          const x = (layout.trainingTower.minX + layout.trainingTower.maxX) / 2;
          const z = (layout.trainingTower.frontZ + layout.trainingTower.rearZ) / 2;
          const world = worldPoint({ x, z });
          const terrain = baseSurface(world.x, world.z)?.height;
          if (Number.isFinite(terrain)) tower.position.y += terrain - datum;
        }
        // Deferred station loads happen after the static scene transform freeze.
        // Recompute the station hierarchy after assigning its pinned world pose.
        root.updateMatrixWorld(true);
        scene.add(root);
        loaded = true;
        state.status = 'ready';
        onReady({ sourceIds: ['way/1009651229', 'city-building/6/3300'], root });
        return true;
      } catch (error) {
        root.removeFromParent();
        loaded = false;
        state.status = 'error'; state.error = String(error?.message || error);
        return false;
      }
    })();
    return loadPromise;
  }

  function surfaceAt(x, z) {
    if (!loaded) return null;
    return sampleStationOneFloor(layout, localPoint({ x, z }), datum, () => baseSurface(x, z)?.height);
  }
  function localPose(pose) { return { ...localPoint(pose), heading: (Number(pose.heading) || 0) - yaw }; }
  function collides(position, options = {}) {
    if (!loaded) return false;
    return stationOneCollision(localPose(position), layout, state.doors, options.player ? { length: 0.7, width: 0.7 } : (options.dimensions||TRUCK_DIMENSIONS), options);
  }
  function sweep(previous, next, dimensions=TRUCK_DIMENSIONS) {
    if (!loaded) return false;
    return sweepStationOneTruck(localPose(previous), localPose(next), layout, state.doors, dimensions);
  }
  function frontDoorForTruck(worldTruck) {
    if (!loaded || !worldTruck) return -1;
    const local = localPose(worldTruck);
    let nearest = -1, distance = Infinity;
    layout.frontDoorCenters.forEach((center, index) => {
      const candidate = Math.hypot(local.x - center, Math.max(0, Math.abs(local.z) - 1.5));
      if (candidate < distance) { nearest = index; distance = candidate; }
    });
    return distance <= 18 ? nearest : -1;
  }
  function toggleFrontDoorForTruck(worldTruck) {
    const index = frontDoorForTruck(worldTruck);
    if (index < 0) return null;
    state.doors = toggleStationOneDoor(state.doors, index);
    return { side: 'front', index };
  }
  function update(delta, truck, player) {
    if (!loaded) return;
    const trucks=(Array.isArray(truck)?truck:[truck]).filter(Boolean);
    const playerLocal = player ? localPoint(player) : null;
    state.doors = stepStationOneDoors(state.doors, delta, index => trucks.some(t=>stationOneDoorObstructed(layout,index,localPose(t),playerLocal,t.dimensions||TRUCK_DIMENSIONS)));
    for (const [name, node] of state.panels) {
      const [, door, panel] = name.match(PANEL_NODE);
      const base = state.panelBases.get(name);
      const pose = stationOnePanelPose(base.position, Number(panel), state.doors.front[Number(door) - 1]?.fraction || 0, layout);
      node.position.set(pose.x, pose.y, pose.z);
      node.rotation.copy(base.rotation);
      node.rotation.x += pose.rotationX;
    }
  }
  function resetDoors() { state.doors = stationOneDoorState(layout); }
  function captureDoors() { return structuredClone(state.doors); }
  function restoreDoors(saved) { state.doors = structuredClone(saved); update(0, null, null); }
  function openAllDoors() {
    for (const side of ['front', 'rear']) for (const door of state.doors[side] || []) { door.fraction = 1; door.target = 1; }
    update(0, null, null);
  }
  function containsBay(point) {
    if (!loaded) return false;
    const local = localPoint(point);
    return local.z >= layout.bay.frontZ && local.z <= layout.bay.rearZ && local.x >= layout.bay.minX && local.x <= layout.bay.maxX;
  }
  function nearestDoor(point) {
    if (!loaded) return null;
    const local = localPoint(point);
    let nearest = -1, distance = Infinity;
    layout.frontDoorCenters.forEach((center, index) => {
      const candidate = Math.hypot(local.x - center, Math.max(0, Math.abs(local.z) - 1.5));
      if (candidate < distance) { nearest = index; distance = candidate; }
    });
    return distance <= 12 ? { side: 'front', index: nearest } : null;
  }
  function getStatus() {
    return { status: state.status, error: state.error, datum, groundRange: groundSamples.length ? [Math.min(...groundSamples), Math.max(...groundSamples)] : null, bounds: state.bounds, doors: structuredClone(state.doors), loaded };
  }
  return {
    root, spawn, playerSpawn, yaw, datum, load, surfaceAt, collides, sweep, update,
    nearestDoor, frontDoorForTruck, toggleFrontDoorForTruck, getStatus, resetDoors, captureDoors, restoreDoors, openAllDoors,
    isReady: () => loaded, containsBay, localPoint, worldPoint,
  };
}
