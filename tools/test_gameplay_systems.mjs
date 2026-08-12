import assert from 'node:assert/strict';
import {
  FIRE_STATION_ONE,
  PLAYER_TUNING,
  TRUCK_TUNING,
  dampAngle,
  directionFromHeading,
  exponentialStep,
  gameplayAxesFromKeys,
  headingFromDirection,
  stepFireTruckKinematics,
  wrapAngle,
} from '../city-explorer/gameplay-systems.js';

assert.equal(FIRE_STATION_ONE.address, '210 Sherbrooke Street');
assert.ok(Math.abs(FIRE_STATION_ONE.lat - 44.301) < 0.001);
assert.ok(Math.abs(FIRE_STATION_ONE.lon + 78.322) < 0.001);
assert.ok(TRUCK_TUNING.length >= 10 && TRUCK_TUNING.wheelbase > 5);
assert.ok(TRUCK_TUNING.maximumForwardSpeed * 3.6 < 105, 'City pumper top speed must remain believable');
assert.ok(PLAYER_TUNING.sprintSpeed > PLAYER_TUNING.walkSpeed);

assert.equal(exponentialStep(0, 10, 8, 0), 0);
assert.ok(exponentialStep(0, 10, 8, 0.1) > 5);
assert.ok(Math.abs(wrapAngle(Math.PI * 3) + Math.PI) < 1e-9);
assert.ok(Math.abs(dampAngle(Math.PI - 0.05, -Math.PI + 0.05, 10, 0.1)) > 3);

const north = directionFromHeading(0);
assert.ok(Math.abs(north.x) < 1e-9 && Math.abs(north.z + 1) < 1e-9);
assert.ok(Math.abs(headingFromDirection(north.x, north.z)) < 1e-9);

const keys = new Set(['KeyW', 'KeyA', 'ShiftLeft']);
assert.deepEqual(gameplayAxesFromKeys(keys), { forward: 1, strafe: -1, steering: 1, sprinting: true });

let truck = { x: 0, z: 0, heading: 0, speed: 0, steering: 0 };
for (let frame = 0; frame < 200; frame += 1) {
  truck = stepFireTruckKinematics(truck, { throttle: 1, steering: 0 }, 1 / 60, true);
}
assert.ok(truck.speed > 11 && truck.speed < 15, `Unexpected 0–3.3 s acceleration: ${truck.speed}`);
assert.ok(truck.z < -18 && Math.abs(truck.x) < 0.001, 'Straight throttle should move along local forward');

const straightHeading = truck.heading;
for (let frame = 0; frame < 90; frame += 1) {
  truck = stepFireTruckKinematics(truck, { throttle: 0.55, steering: 1 }, 1 / 60, true);
}
assert.ok(truck.heading > straightHeading, 'Left steering should increase heading in the stable bicycle model');
assert.ok(Math.abs(truck.steering) <= TRUCK_TUNING.steeringLowSpeed);

const roadSpeed = truck.speed;
let offRoad = { ...truck };
for (let frame = 0; frame < 600; frame += 1) {
  offRoad = stepFireTruckKinematics(offRoad, { throttle: 1, steering: 0 }, 1 / 60, false);
}
assert.ok(offRoad.speed <= TRUCK_TUNING.offRoadSpeed + 1e-6);
assert.ok(roadSpeed > 0);

for (let frame = 0; frame < 240; frame += 1) {
  truck = stepFireTruckKinematics(truck, { throttle: -1, steering: 0 }, 1 / 60, true);
}
assert.ok(truck.speed < 0, 'Holding brake after stopping should engage reverse');
assert.ok(truck.speed >= -TRUCK_TUNING.maximumReverseSpeed - 1e-6);

console.log('Gameplay systems: Station 1 georeference, character inputs, heavy-truck acceleration, braking, steering, and off-road limits passed.');
