import { FIRE_STATION_THREE } from '../gameplay-systems-1.6.69.js';
import { FLEET_DEFINITIONS, CAR_ONE_BAY, RESCUE_ONE_BAY } from '../vehicle-fleet.mjs?v=1.6.195';

export const MULTIPLAYER_VEHICLE_SLOTS = Object.freeze([
  { id: 'car-1', templateId: 'medi', name: 'Car 1', ...CAR_ONE_BAY },
  { id: 'pump-1', templateId: 'pump-1', name: 'Pump 1', x: -4.64, z: 9 },
  { id: 'pump-2', templateId: 'pump-2', name: 'Pump 2', station: 2 },
  { id: 'aerial', templateId: 'aerial', name: 'Aerial', x: 0, z: 9 },
  { id: 'medi', templateId: 'medi', name: 'Medi', x: 4.64, z: 9 },
  { id: 'rescue-1', templateId: 'rescue-1', name: 'Rescue 1', ...RESCUE_ONE_BAY },
  { id: 'pump-3', templateId: 'pump-3', name: 'Pump 3', station: 3 },
]);

export function stationLocalPoint(station, x, z) {
  const c = Math.cos(station.yaw), s = Math.sin(station.yaw);
  return { x: station.anchor.x + x * c + z * s, z: station.anchor.z - x * s + z * c };
}

export function createMultiplayerVehicleInstances(world, metadataByType = {}) {
  return MULTIPLAYER_VEHICLE_SLOTS.map(slot => {
    const number = slot.station ?? 1;
    const station = world.stations.find(value => value.number === number);
    if (!station) throw new Error(`Station ${number} is absent from the multiplayer world`);
    const definition = FLEET_DEFINITIONS.find(value => value.id === slot.templateId);
    const metadata = metadataByType[definition.type] ?? {};
    const tuning = { ...definition.tuning, ...metadata.dimensions, wheelbase: metadata.wheelbase ?? definition.tuning.wheelbase };
    const bay = number === 2 ? station.layout.truckSpawn : slot;
    const point = number === 3 ? {
      x: station.anchor.x + FIRE_STATION_THREE.interiorTruckEast,
      z: station.anchor.z + FIRE_STATION_THREE.interiorTruckSouth,
    } : stationLocalPoint(station, bay.x, bay.z);
    const heading = number === 3 ? FIRE_STATION_THREE.interiorTruckHeading : station.yaw;
    if (!world.readyAt(point.x, point.z, tuning.length / 2)) throw new Error(`Vehicle ${slot.id} spawn roads are unready`);
    const surface = world.sampleSurface(point.x, point.z);
    const pose = { ...point, y: surface.height + 0.035, heading, vx: 0, vz: 0, speed: 0, steering: 0 };
    if (!Number.isFinite(pose.y) || world.blocks(pose, pose, { kind: 'vehicle', dimensions: tuning })) throw new Error(`Vehicle ${slot.id} spawn is blocked`);
    return { id: slot.id, templateId: slot.templateId, name: slot.name, tuning, dimensions: tuning, pose };
  });
}

export function createMultiplayerPlayerSpawn(world, seat) {
  const station = world.stations.find(value => value.number === 1);
  const x = [-6.7, -3, 3, 6.7][(seat - 1) % 4], z = seat <= 4 ? -2.3 : -4.3;
  const point = stationLocalPoint(station, x, z);
  if (!world.readyAt(point.x, point.z, 2)) throw new Error(`Player ${seat} spawn roads are unready`);
  const surface = world.sampleSurface(point.x, point.z);
  const pose = { ...point, y: surface.height + 0.025, heading: station.yaw, vx: 0, vz: 0, speed: 0, steering: 0 };
  if (!Number.isFinite(pose.y) || world.blocks(pose, pose, { kind: 'onFoot', dimensions: { length: .7, width: .7, height: 1.8 } })) throw new Error(`Player ${seat} spawn is blocked`);
  return pose;
}
