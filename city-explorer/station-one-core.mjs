import {
  stationTruckSpawn, stationLocalToWorld, stationWorldToLocal,
  createDoorState, toggleDoor, stepDoorState,
} from './station-two-core.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function stationOneTruckSpawn(layout, project) { return stationTruckSpawn(layout, project); }
export function stationOneLocalToWorld(point, anchor, yaw) { return stationLocalToWorld(point, anchor, yaw); }
export function stationOneWorldToLocal(point, anchor, yaw) { return stationWorldToLocal(point, anchor, yaw); }
export function stationOneDoorState(layout) { return createDoorState(layout.frontDoorCenters.length, 0); }
export function toggleStationOneDoor(state, index) { return toggleDoor(state, index, 'front'); }
export function stepStationOneDoors(state, delta, obstruction = () => false) { return stepDoorState(state, delta, obstruction); }

export function stationOnePanelPose(base, panelIndex, fraction, layout) {
  const amount = clamp(Number(fraction) || 0, 0, 1);
  const panel = clamp(panelIndex, 0, layout.doorPanelCount - 1);
  const panelHeight = layout.doorHeight / layout.doorPanelCount;
  const s = (panel + 0.5) * panelHeight + amount * layout.doorTravel;
  const top = layout.doorTrack.verticalTop;
  const radius = layout.doorTrack.radius;
  const curveLength = Math.PI * radius / 2;
  let y, z, rotationX;
  if (s <= top) {
    y = s; z = layout.doorTrack.closedZ; rotationX = 0;
  } else if (s < top + curveLength) {
    rotationX = (s - top) / radius;
    y = top + radius * Math.sin(rotationX);
    z = layout.doorTrack.closedZ + radius * (1 - Math.cos(rotationX));
  } else {
    y = top + radius;
    z = layout.doorTrack.closedZ + radius + s - top - curveLength;
    rotationX = Math.PI / 2;
  }
  return {
    x: base.x,
    y,
    z,
    rotationX,
  };
}

export function stationOneSourceMatches(sourceId) {
  const normalized = String(sourceId ?? '').replace(/^(?:(?:city-building|way|relation)\/)+/, '');
  return normalized === '1009651229' || normalized === '6/3300';
}

export function hideStationOneReplacementRecords(records, hideRecord) {
  let matched = 0, hidden = 0;
  const sourceIds = [];
  for (const record of records || []) {
    if (record.sourceType !== 'building' || !stationOneSourceMatches(record.sourceId)) continue;
    matched += 1;
    sourceIds.push(record.sourceId);
    if (hideRecord(record.id)) hidden += 1;
  }
  return { matched, hidden, sourceIds };
}

function rectPolygon(x1, z1, x2, z2) {
  return [{ x: x1, z: z1 }, { x: x2, z: z1 }, { x: x2, z: z2 }, { x: x1, z: z2 }];
}
function footprint(position, dimensions, player) {
  if (player) return rectPolygon(position.x - 0.35, position.z - 0.35, position.x + 0.35, position.z + 0.35);
  const heading = Number(position.heading) || 0;
  const forward = { x: -Math.sin(heading), z: -Math.cos(heading) };
  const right = { x: Math.cos(heading), z: -Math.sin(heading) };
  const halfLength = dimensions.length / 2, halfWidth = dimensions.width / 2;
  return [
    { x: position.x + forward.x * halfLength + right.x * halfWidth, z: position.z + forward.z * halfLength + right.z * halfWidth },
    { x: position.x + forward.x * halfLength - right.x * halfWidth, z: position.z + forward.z * halfLength - right.z * halfWidth },
    { x: position.x - forward.x * halfLength - right.x * halfWidth, z: position.z - forward.z * halfLength - right.z * halfWidth },
    { x: position.x - forward.x * halfLength + right.x * halfWidth, z: position.z - forward.z * halfLength + right.z * halfWidth },
  ];
}
function overlaps(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i += 1) {
    const first = polygon[i], second = polygon[(i + 1) % polygon.length];
    const axis = { x: -(second.z - first.z), z: second.x - first.x };
    const project = points => points.map(point => point.x * axis.x + point.z * axis.z);
    const left = project(a), right = project(b);
    if (Math.max(...left) < Math.min(...right) || Math.max(...right) < Math.min(...left)) return false;
  }
  return true;
}
function hitsRect(poly, [minX, minZ, maxX, maxZ]) { return overlaps(poly, rectPolygon(minX, minZ, maxX, maxZ)); }

export function stationOneCollision(position, layout, doors, dimensions = { length: 10.5, width: 3.2 }, options = {}) {
  const poly = footprint(position, dimensions, Boolean(options.player));
  const { bay } = layout;
  const frontHalf = layout.doorWidth / 2;
  const wallThickness = (bay.wallThickness || 0.28) / 2;
  const fixed = [
    [bay.minX - wallThickness * 2, bay.frontZ, bay.minX, bay.rearZ],
    [bay.maxX, bay.frontZ, bay.maxX + wallThickness * 2, bay.rearZ],
    [bay.minX, bay.rearZ - wallThickness, bay.maxX, bay.rearZ + wallThickness],
  ];
  if (layout.wing) fixed.push([layout.wing.minX, layout.wing.frontZ, layout.wing.maxX, layout.wing.rearZ]);
  if (layout.trainingTower) fixed.push([layout.trainingTower.minX, layout.trainingTower.frontZ, layout.trainingTower.maxX, layout.trainingTower.rearZ]);
  if (fixed.some(rect => hitsRect(poly, rect))) return true;

  let cursor = bay.minX;
  const frontWalls = [];
  layout.frontDoorCenters.forEach((center, index) => {
    const left = center - frontHalf, right = center + frontHalf;
    frontWalls.push([cursor, bay.frontZ - wallThickness, left, bay.frontZ + wallThickness]);
    if ((doors?.front?.[index]?.fraction || 0) < 0.94) frontWalls.push([left, bay.frontZ - wallThickness, right, bay.frontZ + wallThickness]);
    cursor = right;
  });
  frontWalls.push([cursor, bay.frontZ - wallThickness, bay.maxX, bay.frontZ + wallThickness]);
  if (frontWalls.some(rect => hitsRect(poly, rect))) return true;

  const outline = layout.watchroom?.outline;
  if (outline?.length > 2 && overlaps(poly, outline.map(([x, z]) => ({ x, z })))) return true;
  return false;
}

export function sweepStationOneTruck(previous, next, layout, doors, dimensions) {
  const distance = Math.hypot(next.x - previous.x, next.z - previous.z);
  const delta = Math.atan2(Math.sin(next.heading - previous.heading), Math.cos(next.heading - previous.heading));
  const steps = Math.max(1, Math.ceil(distance / 0.45), Math.ceil(Math.abs(delta) / (Math.PI / 90)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const pose = { x: previous.x + (next.x - previous.x) * t, z: previous.z + (next.z - previous.z) * t, heading: previous.heading + delta * t };
    if (stationOneCollision(pose, layout, doors, dimensions)) return true;
  }
  return false;
}

export function stationOneDoorObstructed(layout, index, truckPosition, playerPosition, dimensions) {
  const center = layout.frontDoorCenters[index];
  const margin = 0.2 + (layout.bay.wallThickness || 0.28) / 2;
  const opening = rectPolygon(center - layout.doorWidth / 2 - margin, -margin, center + layout.doorWidth / 2 + margin, margin);
  const truckBlocks = truckPosition && overlaps(footprint(truckPosition, dimensions, false), opening);
  const playerBlocks = playerPosition && overlaps(footprint(playerPosition, { length: 0.7, width: 0.7 }, true), opening);
  return Boolean(truckBlocks || playerBlocks);
}

export function sampleStationOneFloor(layout, local, datum, baseHeight) {
  const { bay, apron } = layout;
  if (local.z >= bay.frontZ && local.z <= bay.rearZ && local.x >= bay.minX && local.x <= bay.maxX) {
    return { height: datum, heightSource: 'station1-slab', onRoad: false, name: 'Fire Station 1 apparatus bay' };
  }
  if (local.z < apron.frontZ || local.z > apron.rearZ || local.x < apron.minX || local.x > apron.maxX) return null;
  const ground = Number(baseHeight());
  if (!Number.isFinite(ground)) return null;
  const blend = smoothstep(apron.frontZ, apron.rearZ, local.z);
  return { height: ground + (datum - ground) * blend, heightSource: blend > 0.001 ? 'station1-apron-blend' : 'station1-apron-base', onRoad: false, name: 'Fire Station 1 apron' };
}
