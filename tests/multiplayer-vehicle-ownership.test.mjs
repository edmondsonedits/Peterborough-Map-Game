import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleOwnership } from '../city-explorer/multiplayer/server/src/vehicle-ownership.mjs';

test('a vehicle can have at most one driver even when two players race to claim it', () => {
  const ownership = createVehicleOwnership([{ id: 'truck_1' }]);
  const first = ownership.claim('p1', 'truck_1');
  const second = ownership.claim('p2', 'truck_1');
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(ownership.driverOf('truck_1'), 'p1');
  assert.equal(ownership.vehicleOf('p2'), null);
});

test('release only succeeds for the current driver', () => {
  const ownership = createVehicleOwnership([{ id: 'truck_1' }]);
  ownership.claim('p1', 'truck_1');
  assert.equal(ownership.release('p2', 'truck_1'), false);
  assert.equal(ownership.release('p1', 'truck_1'), true);
  assert.equal(ownership.driverOf('truck_1'), null);
});

test('switch transfers ownership atomically and rejects an already claimed target', () => {
  const ownership = createVehicleOwnership([{ id: 'truck_1' }, { id: 'truck_2' }]);
  ownership.claim('p1', 'truck_1');
  ownership.claim('p2', 'truck_2');
  assert.equal(ownership.switch('p1', 'truck_1', 'truck_2').ok, false);
  assert.equal(ownership.vehicleOf('p1'), 'truck_1');
  ownership.release('p2', 'truck_2');
  assert.equal(ownership.switch('p1', 'truck_1', 'truck_2').ok, true);
  assert.equal(ownership.driverOf('truck_1'), null);
  assert.equal(ownership.driverOf('truck_2'), 'p1');
});
