/* Peterborough 3D Simulator driving refinement — v1.6.76
   Keeps the existing gameplay asset/building code, adds selectable starts at
   Peterborough Fire Stations 1, 2, and 3, and preserves the refined fire-truck
   kinematics with smoother analog throttle and progressive steering response. */

export * from './gameplay-systems.js?base=1.6.69';

import {
  FIRE_STATION_ONE as BASE_FIRE_STATION_ONE,
  TRUCK_TUNING,
  directionFromHeading,
  exponentialStep,
  wrapAngle,
} from './gameplay-systems.js?base=1.6.69';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const degreesToRadians = degrees => Number(degrees) * Math.PI / 180;

// Stations 2 and 3 come from the Peterborough city package's authoritative
// Fire Services base configuration. Player positions are intentionally derived
// a few metres beside the documented truck spawn so the firefighter starts
// close enough to enter the apparatus without overlapping it.
function playerBesideTruck(lat, lon, headingDegrees, lateralMetres = -4.5, rearMetres = 2) {
  const heading = degreesToRadians(headingDegrees);
  const forwardNorth = Math.cos(heading);
  const forwardEast = Math.sin(heading);
  const rightNorth = -Math.sin(heading);
  const rightEast = Math.cos(heading);
  const northMetres = -rearMetres * forwardNorth + lateralMetres * rightNorth;
  const eastMetres = -rearMetres * forwardEast + lateralMetres * rightEast;
  const metresPerDegree = 111320;
  const latitude = lat + northMetres / metresPerDegree;
  const longitude = lon + eastMetres / (metresPerDegree * Math.cos(degreesToRadians(lat)));
  return Object.freeze({ lat: latitude, lon: longitude });
}

const stationOne = Object.freeze({
  ...BASE_FIRE_STATION_ONE,
  number: 1,
  shortName: 'Station 1',
  spawnSource: 'reviewed-station-1-gameplay',
});

const stationTwoPlayer = playerBesideTruck(44.335928, -78.316016, 202);
export const FIRE_STATION_TWO = Object.freeze({
  id: 'peterborough-fire-station-2',
  number: 2,
  name: 'Peterborough Fire Station 2',
  shortName: 'Station 2',
  address: '100 Marina Blvd',
  lat: 44.335719,
  lon: -78.316209,
  buildingLat: 44.335719,
  buildingLon: -78.316209,
  playerLat: stationTwoPlayer.lat,
  playerLon: stationTwoPlayer.lon,
  truckLat: 44.335928,
  truckLon: -78.316016,
  truckHeading: degreesToRadians(202),
  spawnSource: 'cities/peterborough/package.js',
});

const stationThreePlayer = playerBesideTruck(44.284959, -78.350694, 127);
export const FIRE_STATION_THREE = Object.freeze({
  id: 'peterborough-fire-station-3',
  number: 3,
  name: 'Peterborough Fire Station 3',
  shortName: 'Station 3',
  address: '839 Clonsilla Ave',
  lat: 44.284779,
  lon: -78.351068,
  buildingLat: 44.284779,
  buildingLon: -78.351068,
  playerLat: stationThreePlayer.lat,
  playerLon: stationThreePlayer.lon,
  truckLat: 44.284959,
  truckLon: -78.350694,
  truckHeading: degreesToRadians(127),
  spawnSource: 'cities/peterborough/package.js',
});

export const FIRE_STATIONS = Object.freeze([stationOne, FIRE_STATION_TWO, FIRE_STATION_THREE]);

const requestedStationNumber = (() => {
  try {
    const value = new URLSearchParams(globalThis.location?.search || '').get('station');
    const number = Number(value);
    return [1, 2, 3].includes(number) ? number : 1;
  } catch {
    return 1;
  }
})();

export const ACTIVE_FIRE_STATION = FIRE_STATIONS.find(station => station.number === requestedStationNumber) || stationOne;

// Compatibility export: app.js historically imports FIRE_STATION_ONE as the
// active gameplay base. Keeping the name avoids a risky app.js rewrite while
// allowing ?station=1|2|3 to choose the starting fire hall.
export const FIRE_STATION_ONE = ACTIVE_FIRE_STATION;

/**
 * Advance the fire apparatus with progressive analog throttle and steering.
 * Small joystick movement produces a small steering angle instead of full lock,
 * while acceleration and braking ramp rather than stepping instantly.
 */
export function stepFireTruckKinematics(current, input, delta, onRoad = true) {
  const dt = Math.min(0.04, Math.max(0, Number(delta) || 0));
  const throttle = clamp(input?.throttle, -1, 1);
  const steeringInput = clamp(input?.steering, -1, 1);
  const throttleMagnitude = Math.abs(throttle);
  const previousSpeed = Number(current.speed) || 0;
  let speed = previousSpeed;

  // A low joystick deflection gives light acceleration; full deflection keeps
  // the existing maximum response. The sub-linear curve keeps the vehicle
  // responsive without making the first few millimetres feel dead.
  const throttleResponse = Math.pow(throttleMagnitude, 0.82);
  let targetAcceleration = 0;
  if (throttle > 0.001) {
    targetAcceleration = speed < -0.2
      ? TRUCK_TUNING.serviceBrake * Math.max(0.35, throttleResponse)
      : TRUCK_TUNING.forwardAcceleration * throttleResponse;
  } else if (throttle < -0.001) {
    targetAcceleration = speed > 0.2
      ? -TRUCK_TUNING.serviceBrake * Math.max(0.35, throttleResponse)
      : -TRUCK_TUNING.reverseAcceleration * throttleResponse;
  } else if (Math.abs(speed) > 0.001) {
    targetAcceleration = -Math.sign(speed)
      * (TRUCK_TUNING.rollingDrag + TRUCK_TUNING.aerodynamicDrag * speed * speed);
  }

  if (!onRoad && throttleMagnitude > 0.001 && Math.sign(targetAcceleration) === Math.sign(throttle)) {
    targetAcceleration *= TRUCK_TUNING.offRoadAccelerationScale;
  }

  const currentAcceleration = Number(current.acceleration) || 0;
  const changingDirection = throttleMagnitude > 0.001 && speed * throttle < -0.02;
  const accelerationResponse = changingDirection ? 10.5 : throttleMagnitude > 0.001 ? 6.2 : 7.8;
  let acceleration = exponentialStep(currentAcceleration, targetAcceleration, accelerationResponse, dt);
  speed += acceleration * dt;

  if (throttleMagnitude <= 0.001 && previousSpeed !== 0 && Math.sign(speed) !== Math.sign(previousSpeed)) {
    speed = 0;
    acceleration = 0;
  }

  const forwardLimit = onRoad ? TRUCK_TUNING.maximumForwardSpeed : TRUCK_TUNING.offRoadSpeed;
  const reverseLimit = onRoad ? TRUCK_TUNING.maximumReverseSpeed : TRUCK_TUNING.maximumReverseSpeed * 0.65;
  speed = clamp(speed, -reverseLimit, forwardLimit);

  // Preserve the truck's speed-sensitive steering limit, but make the response
  // progressive. Near-centre input stays gentle; larger input reaches full lock.
  const speedRatio = Math.min(1, Math.abs(speed) / TRUCK_TUNING.maximumForwardSpeed);
  const maximumSteer = TRUCK_TUNING.steeringLowSpeed
    + (TRUCK_TUNING.steeringHighSpeed - TRUCK_TUNING.steeringLowSpeed) * speedRatio;
  const steeringMagnitude = Math.pow(Math.abs(steeringInput), 1.08);
  const shapedSteeringInput = Math.sign(steeringInput) * steeringMagnitude;
  const targetSteering = shapedSteeringInput * maximumSteer;

  // Small corrections come in softly, while stronger turns remain responsive.
  const steeringResponse = steeringMagnitude > 0.0005
    ? 5.15 + 2.15 * steeringMagnitude
    : 8.8;
  const steering = exponentialStep(Number(current.steering) || 0, targetSteering, steeringResponse, dt);

  const heading = wrapAngle(
    (Number(current.heading) || 0)
    + speed / TRUCK_TUNING.wheelbase * Math.tan(steering) * dt,
  );
  const direction = directionFromHeading(heading);

  return {
    x: (Number(current.x) || 0) + direction.x * speed * dt,
    z: (Number(current.z) || 0) + direction.z * speed * dt,
    heading,
    speed,
    steering,
    acceleration,
  };
}
