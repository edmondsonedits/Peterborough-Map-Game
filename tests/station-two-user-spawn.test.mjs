import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FIRE_STATION_TWO, directionFromHeading, PLAYER_TUNING} from '../city-explorer/gameplay-systems-1.6.69.js';

test('Station 2 spawn matches the reviewed stationary truck and remains enterable', () => {
  const station = FIRE_STATION_TWO;
  const radians = Math.PI / 180;
  const north = (station.truckLat - 44.335785) * 110540;
  const east = (station.truckLon + 78.316176) * 111320 * Math.cos(44.3091 * radians);
  assert.ok(Math.hypot(east, north) < 0.2, 'truck should start at the observed location');
  const direction = directionFromHeading(station.truckHeading);
  const bearing = ((Math.atan2(direction.x, -direction.z) / radians) + 360) % 360;
  assert.ok(Math.abs(bearing - 206.36) < 2, `expected southwest departure, got ${bearing}`);
  const playerNorth = (station.playerLat - station.truckLat) * 110540;
  const playerEast = (station.playerLon - station.truckLon) * 111320 * Math.cos(44.3091 * radians);
  assert.ok(Math.hypot(playerEast, playerNorth) < PLAYER_TUNING.enterDistance, 'player must be able to enter the truck');
});
