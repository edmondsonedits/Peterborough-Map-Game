export function createVehicleOwnership(vehicles = []) {
  if (!Array.isArray(vehicles) || vehicles.length > 12) {
    throw new RangeError('vehicles must be an array of at most 12 instances');
  }
  const vehicleIds = new Set();
  for (const vehicle of vehicles) {
    if (!vehicle || typeof vehicle.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(vehicle.id)) {
      throw new TypeError('each vehicle requires a safe unique instance id');
    }
    if (vehicleIds.has(vehicle.id)) throw new Error(`duplicate vehicle id: ${vehicle.id}`);
    vehicleIds.add(vehicle.id);
  }

  const driversByVehicle = new Map();
  const vehicleByDriver = new Map();

  function claim(playerId, vehicleId) {
    if (typeof playerId !== 'string' || !playerId || !vehicleIds.has(vehicleId)) {
      return Object.freeze({ ok: false, reason: 'unknown-player-or-vehicle' });
    }
    const currentVehicle = vehicleByDriver.get(playerId);
    if (currentVehicle) return Object.freeze({ ok: false, reason: 'already-driving' });
    if (driversByVehicle.has(vehicleId)) return Object.freeze({ ok: false, reason: 'vehicle-occupied' });
    driversByVehicle.set(vehicleId, playerId);
    vehicleByDriver.set(playerId, vehicleId);
    return Object.freeze({ ok: true, vehicleId });
  }

  function release(playerId, vehicleId = vehicleByDriver.get(playerId)) {
    if (!vehicleId || driversByVehicle.get(vehicleId) !== playerId) return false;
    driversByVehicle.delete(vehicleId);
    vehicleByDriver.delete(playerId);
    return true;
  }

  function switchVehicle(playerId, fromVehicleId, toVehicleId) {
    if (vehicleByDriver.get(playerId) !== fromVehicleId) {
      return Object.freeze({ ok: false, reason: 'not-current-driver' });
    }
    if (!vehicleIds.has(toVehicleId)) return Object.freeze({ ok: false, reason: 'unknown-vehicle' });
    if (toVehicleId === fromVehicleId) return Object.freeze({ ok: false, reason: 'same-vehicle' });
    if (driversByVehicle.has(toVehicleId)) return Object.freeze({ ok: false, reason: 'vehicle-occupied' });
    // Validate every precondition before mutating either index.
    driversByVehicle.delete(fromVehicleId);
    vehicleByDriver.set(playerId, toVehicleId);
    driversByVehicle.set(toVehicleId, playerId);
    return Object.freeze({ ok: true, vehicleId: toVehicleId });
  }

  return Object.freeze({
    claim,
    release,
    switch: switchVehicle,
    driverOf: (vehicleId) => driversByVehicle.get(vehicleId) ?? null,
    vehicleOf: (playerId) => vehicleByDriver.get(playerId) ?? null,
    isVehicle: (vehicleId) => vehicleIds.has(vehicleId),
    vehicleIds: () => Object.freeze([...vehicleIds]),
  });
}
