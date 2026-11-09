export function createVehicleOwnership(vehicles = [], capacity = 1) {
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

  const crews = new Map([...vehicleIds].map(id => [id, []]));
  const vehicleByPlayer = new Map();
  const result = (ok, details) => Object.freeze({ ok, ...details });

  function claim(playerId, vehicleId) {
    const crew = crews.get(vehicleId);
    if (typeof playerId !== 'string' || !playerId || !crew) return result(false, { reason: 'unknown-player-or-vehicle' });
    if (vehicleByPlayer.has(playerId)) return result(false, { reason: 'already-driving' });
    if (crew.length >= capacity) return result(false, { reason: 'vehicle-occupied' });
    crew.push(playerId);
    vehicleByPlayer.set(playerId, vehicleId);
    return result(true, { vehicleId });
  }

  function release(playerId, vehicleId = vehicleByPlayer.get(playerId)) {
    if (!vehicleId || vehicleByPlayer.get(playerId) !== vehicleId) return false;
    const crew = crews.get(vehicleId);
    crew.splice(crew.indexOf(playerId), 1);
    vehicleByPlayer.delete(playerId);
    return true;
  }

  function switchVehicle(playerId, fromVehicleId, toVehicleId) {
    if (!fromVehicleId || vehicleByPlayer.get(playerId) !== fromVehicleId) return result(false, { reason: 'not-current-driver' });
    if (!crews.has(toVehicleId)) return result(false, { reason: 'unknown-vehicle' });
    if (toVehicleId === fromVehicleId) return result(false, { reason: 'same-vehicle' });
    if (crews.get(toVehicleId).length >= capacity) return result(false, { reason: 'vehicle-occupied' });
    release(playerId, fromVehicleId);
    return claim(playerId, toVehicleId);
  }

  return Object.freeze({
    claim, release, switch: switchVehicle,
    driverOf: vehicleId => crews.get(vehicleId)?.[0] ?? null,
    countOf: vehicleId => crews.get(vehicleId)?.length ?? 0,
    vehicleOf: playerId => vehicleByPlayer.get(playerId) ?? null,
    isVehicle: vehicleId => vehicleIds.has(vehicleId),
    vehicleIds: () => Object.freeze([...vehicleIds]),
  });
}
