import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { vehicleExitCandidates, vehicleFootprint, polygonsOverlap } from '../city-explorer/apparatus-collision.mjs';
import { stationOneCollision, stationOneDoorState } from '../city-explorer/station-one-core.mjs';
import { stationLocalToWorld, stationWorldToLocal } from '../city-explorer/station-two-core.mjs';
import { DEFAULT_VEHICLE_TUNING } from '../city-explorer/multiplayer/movement-core.mjs';

const source = fs.readFileSync(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
const read = name => JSON.parse(fs.readFileSync(new URL(`../city-explorer/${name}`, import.meta.url)));
const layout = read('assets/station1/layout.json');
const dimensions = Object.fromEntries(['generic-pumper', 'medi-pickup', 'aerial-platform'].map(name => [name, read(`assets/vehicles/${name}.json`).dimensions ?? DEFAULT_VEHICLE_TUNING]));
const extract = name => {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? source.length : end);
};
const vector = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } });

function setup(yaw = layout.site.rotationYDegrees * Math.PI / 180) {
  const anchor = { x: 300, z: -120 };
  const parked = [
    ['pump-1', layout.truckSpawn, 'generic-pumper'],
    ['car-1', { x: layout.frontDoorCenters[0], z: layout.truckSpawn.z }, 'medi-pickup'],
    ['aerial', { x: layout.frontDoorCenters[2], z: layout.truckSpawn.z }, 'aerial-platform'],
    ['medi', { x: layout.frontDoorCenters[3], z: layout.truckSpawn.z }, 'medi-pickup'],
    ['rescue-1', { x: layout.frontDoorCenters[4], z: layout.truckSpawn.z }, 'generic-pumper'],
  ].map(([id, local, model]) => ({ id, dimensions: dimensions[model], ...stationLocalToWorld(local, anchor, yaw), y: 0, heading: yaw }));
  const home = { ...parked[0] }, truckState = parked[0];
  const blocked = (point, size, excludeId = 'pump-1') => parked.some(vehicle => vehicle.id !== excludeId
    && polygonsOverlap(vehicleFootprint(point, size), vehicleFootprint(vehicle, vehicle.dimensions)));
  let doors = stationOneDoorState(layout);
  const station = {
    collides: point => stationOneCollision({ ...stationWorldToLocal(point, anchor, yaw), heading: 0 }, layout, doors, null, { player: true }),
    resetDoors: () => { doors = stationOneDoorState(layout); }, update() {},
  };
  const context = vm.createContext({
    multiplayer: null, gameplayReady: true, stationSwitchBusy: () => false, aerialRuntime: null,
    fleetRuntime: { fleet: { active: { spawn: home, definition: { id: 'pump-1' } } }, blocked },
    activeVehicleTuning: () => dimensions['generic-pumper'], vehicleExitCandidates,
    gameplaySurfaceAt: () => ({ height: 0 }), citySceneryReadyAt: () => true, fleetHydroIndex: null,
    stationOneRuntime: station, stationTwoRuntime: null, stationThreeBlocksMove: () => false,
    selectedStationRuntime: () => station, stationThreeDoorController: null,
    playerActor: { position: vector(), rotation: {} }, playerVelocity: vector(), playerSpeed: 0, playerHeading: 0,
    truckState, fireTruckActor: { position: vector(), rotation: vector(), userData: { truck: { visual: { rotation: vector() } } } },
    state: {}, setMode: mode => { context.state.mode = mode; }, snapGameplayCamera() {}, showToast() {},
    STATION_ONE_SELECTED: true, STATION_TWO_SELECTED: false,
  });
  vm.runInContext(extract('findClearVehicleExit') + '\n' + extract('resetGameplay'), context);
  return { context, blocked, station, home, parked };
}

test('on-foot reset clears measured parked fleet bodies at the station transform', () => {
  const { context, blocked, station, home } = setup();
  assert.equal(blocked({ x: home.x + 3, z: home.z, heading: 0 }, { length: .65, width: .65 }, null), true,
    'the former world-X offset intersects the measured Car 1 body');
  assert.equal(context.resetGameplay(), true);
  const player = { ...context.playerActor.position, heading: 0 };
  assert.equal(blocked(player, { length: .7, width: .7 }, null), false, 'reset must not place the firefighter inside any fleet vehicle');
  assert.equal(station.collides(player), false);
  assert.equal(context.state.mode, 'onFoot');
});

test('reset clearance rotates with the bay and ignores the active truck at its previous location', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -1.3]) {
    const { context, blocked, station, home } = setup(yaw);
    Object.assign(context.truckState, { x: home.x + 2, z: home.z - 1 });
    assert.equal(context.resetGameplay({ mode: 'driving' }), true);
    const player = { ...context.playerActor.position, heading: 0 };
    assert.equal(blocked(player, { length: .7, width: .7 }, null), false, `fleet clearance at yaw ${yaw}`);
    assert.equal(station.collides(player), false);
    assert.equal(context.truckState.x, home.x);
    assert.equal(context.truckState.z, home.z);
    assert.equal(context.state.mode, 'driving');
  }
});

test('a blocked reset leaves the current actors and aerial state untouched', () => {
  const { context } = setup();
  Object.assign(context.truckState, { x: 70, z: 80, speed: 2 });
  context.playerActor.position.set(71, 3, 81);
  context.state.mode = 'driving';
  let dismissed = false;
  context.aerialRuntime = { dismiss: () => { dismissed = true; } };
  context.fleetRuntime.blocked = () => true;
  assert.equal(context.resetGameplay(), false);
  assert.equal(context.truckState.x, 70);
  assert.equal(context.truckState.z, 80);
  assert.equal(context.truckState.speed, 2);
  assert.equal(context.playerActor.position.x, 71);
  assert.equal(context.playerActor.position.y, 3);
  assert.equal(context.playerActor.position.z, 81);
  assert.equal(context.state.mode, 'driving');
  assert.equal(dismissed, false);
});
