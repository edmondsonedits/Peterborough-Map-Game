import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_STATES, STATION } from '../../gta-fire-response/src/config.js';
import { angleDifference, approach, dampHeading, headingFromVector, normalizeHeading, pointFrom } from '../../gta-fire-response/src/math.js';
import { GameStateMachine } from '../../gta-fire-response/src/state.js';
import { projectPointToSegment, roadWidth, RoadSystem } from '../../gta-fire-response/src/road.js';

test('heading normalization and angle difference remain stable', () => {
  assert.equal(normalizeHeading(-90), 270);
  assert.equal(normalizeHeading(450), 90);
  assert.equal(angleDifference(350, 10), 20);
  assert.equal(angleDifference(10, 350), -20);
  assert.equal(headingFromVector(1, 0), 90);
  assert.equal(headingFromVector(0, -1), 0);
});

test('steering damping approaches without overshooting', () => {
  const next = dampHeading(350, 10, 12, 1 / 60, 300);
  assert.ok(next > 350 || next < 10);
  assert.ok(Math.abs(angleDifference(next, 10)) < 20);
  const bounded = dampHeading(0, 180, 20, 1 / 60, 60);
  assert.ok(Math.abs(angleDifference(0, bounded)) <= 1.001);
});

test('speed interpolation is frame-rate independent in direction', () => {
  let speed60 = 0;
  for (let i = 0; i < 60; i += 1) speed60 = approach(speed60, 20, 10 / 60);
  let speed120 = 0;
  for (let i = 0; i < 120; i += 1) speed120 = approach(speed120, 20, 10 / 120);
  assert.ok(Math.abs(speed60 - speed120) < 1e-9);
  assert.ok(Math.abs(speed60 - 10) < 1e-9);
});

test('state transitions are named and constrained', () => {
  const machine = new GameStateMachine();
  machine.transition(GAME_STATES.AVAILABLE, 'test-start');
  machine.transition(GAME_STATES.DISPATCHED, 'test-dispatch');
  machine.transition(GAME_STATES.ENROUTE, 'test-drive');
  assert.equal(machine.current, GAME_STATES.ENROUTE);
  assert.throws(() => machine.transition(GAME_STATES.START_SCREEN, 'invalid'));
  machine.transition(GAME_STATES.PAUSED, 'pause');
  machine.resume('resume');
  assert.equal(machine.current, GAME_STATES.ENROUTE);
});

test('road width reflects class and lane count', () => {
  assert.ok(roadWidth({ highway: 'primary' }) > roadWidth({ highway: 'service' }));
  assert.ok(roadWidth({ highway: 'residential', lanes: 4 }) > roadWidth({ highway: 'residential', lanes: 2 }));
});

test('road projection returns nearest point and distance', () => {
  const segment = { ax: 0, ay: 0, bx: 10, by: 0, dx: 10, dy: 0, lengthSq: 100 };
  const projection = projectPointToSegment(5, 4, segment);
  assert.equal(projection.x, 5);
  assert.equal(projection.y, 0);
  assert.equal(projection.distance, 4);
});

test('swept truck footprint stays on a road and rejects a lawn crossing', async () => {
  const roads = new RoadSystem({ testMode: true });
  assert.equal(await roads.load(), true);
  const start = { lat: STATION.lat, lng: STATION.lng, heading: 90 };
  const onRoad = { ...pointFrom(start, 90, 18), heading: 90 };
  const offRoad = { ...pointFrom(start, 45, 35), heading: 45 };
  assert.equal(roads.sweepDrivable(start, onRoad), true);
  assert.equal(roads.sweepDrivable(start, offRoad), false);
  const resolved = roads.resolveMovement(start, offRoad, 18, .08);
  assert.equal(resolved.blocked, true);
});
