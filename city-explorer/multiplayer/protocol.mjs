export const PROTOCOL_VERSION = 1;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const bounded = (value, lo = -1, hi = 1) => finite(value) && value >= lo && value <= hi;
const safeId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 80 && /^[A-Za-z0-9_-]+$/.test(value);
const validName = (value) => typeof value === 'string' && /^Player [1-8]$/.test(value);
const poseKeys = ['x','y','z','heading','vx','vz','speed','steering'];
function validPose(pose) { return object(pose) && poseKeys.every((key) => finite(pose[key])); }
export function validateInput(input) {
  if (!object(input) || input.protocolVersion !== PROTOCOL_VERSION || !integer(input.epoch) || !integer(input.sequence)
      || !['onFoot','driving'].includes(input.mode) || !object(input.controls)) return false;
  const c=input.controls;
  return bounded(c.forward) && bounded(c.strafe) && typeof c.sprint==='boolean' && bounded(c.throttle) && bounded(c.steering)
    && finite(c.viewYaw) && c.viewYaw >= -Math.PI && c.viewYaw <= Math.PI;
}
const ACTIONS = new Set(['enterVehicle','exitVehicle','switchVehicle','toggleLights']);
export function validateAction(action) {
  if(!object(action)||action.protocolVersion!==PROTOCOL_VERSION||!integer(action.epoch)||!integer(action.sequence)||!ACTIONS.has(action.type))return false;
  if(['enterVehicle','exitVehicle','switchVehicle'].includes(action.type))return safeId(action.vehicleId);
  return action.vehicleId===undefined||safeId(action.vehicleId);
}
function validActor(actor) {
  return object(actor)&&safeId(actor.id)&&validName(actor.name)&&integer(actor.entityGeneration)
    &&['onFoot','driving'].includes(actor.mode)&&validPose(actor.pose)
    &&(actor.vehicleId===null||safeId(actor.vehicleId));
}
function validVehicle(vehicle) {
  return object(vehicle)&&safeId(vehicle.id)&&integer(vehicle.entityGeneration)&&validPose(vehicle.pose)
    &&(vehicle.driverPlayerId===null||safeId(vehicle.driverPlayerId));
}
export function validateSnapshot(snapshot) {
  return object(snapshot)&&snapshot.protocolVersion===PROTOCOL_VERSION&&typeof snapshot.worldVersion==='string'&&snapshot.worldVersion.length>0&&snapshot.worldVersion.length<=128
    &&integer(snapshot.tick)&&finite(snapshot.serverTime)&&integer(snapshot.epoch)&&integer(snapshot.ackInputSequence)
    &&validActor(snapshot.player)&&Array.isArray(snapshot.players)&&snapshot.players.length<=8&&snapshot.players.every(validActor)
    &&Array.isArray(snapshot.vehicles)&&snapshot.vehicles.length<=12&&snapshot.vehicles.every(validVehicle);
}
