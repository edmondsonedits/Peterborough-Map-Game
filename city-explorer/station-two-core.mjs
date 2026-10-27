const radians = degrees => Number(degrees) * Math.PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function stationLocalToWorld(point, anchor, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: anchor.x + point.x * c + point.z * s, z: anchor.z - point.x * s + point.z * c };
}

export function stationWorldToLocal(point, anchor, yaw) {
  const dx = point.x - anchor.x, dz = point.z - anchor.z;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

export function stationTruckSpawn(layout, project) {
  const yaw = radians(layout.site.rotationYDegrees);
  const projected = project(layout.site.anchorLat, layout.site.anchorLon);
  const anchor = { x: projected.x, z: Number.isFinite(projected.z) ? projected.z : projected.y };
  const position = stationLocalToWorld(layout.truckSpawn, anchor, yaw);
  return { ...position, heading: yaw, anchor, yaw };
}

export function stationPlayerSpawn(layout, anchor, yaw) {
  return stationLocalToWorld(layout.playerSpawn, anchor, yaw);
}

export function createDoorState(count = 3, rearCount = 2) {
  const closed = size => Array.from({ length: size }, () => ({ fraction: 0, target: 0 }));
  return { front: closed(count), rear: closed(rearCount) };
}

export function stationTwoReplacementSourceMatches(sourceId, candidate = 'way/1022083769') {
  const normalize = value => String(value ?? '').replace(/^(?:(?:city-building|way|relation)\/)+/, '');
  return Boolean(normalize(candidate)) && normalize(sourceId) === normalize(candidate);
}

export function hideStationTwoReplacementRecords(records, candidate, hideRecord) {
  let matched = 0, hidden = 0;
  const sourceIds = [];
  for (const record of records || []) {
    if (record.sourceType !== 'building' || !stationTwoReplacementSourceMatches(record.sourceId, candidate)) continue;
    matched += 1;
    sourceIds.push(record.sourceId);
    if (hideRecord(record.id)) hidden += 1;
  }
  return { candidate, matched, hidden, sourceIds };
}

export function toggleDoor(state, index, side = 'front') {
  if (!state?.[side]?.[index]) return state;
  return { ...state, [side]: state[side].map((door, i) => i === index ? { ...door, target: door.target > 0.5 ? 0 : 1 } : door) };
}

export function stepDoorState(state, delta, isObstructed = () => false, speed = 0.55) {
  const step = clamp(Number(delta) || 0, 0, 0.1) * speed;
  const advance = (collection, side) => collection.map((door, index) => {
    if (door.target < door.fraction && isObstructed(index, side)) return { ...door, target: 1 };
    const diff = door.target - door.fraction;
    return { ...door, fraction: Math.abs(diff) <= step ? door.target : door.fraction + Math.sign(diff) * step };
  });
  return { ...state, front: advance(state.front || [], 'front'), rear: advance(state.rear || [], 'rear') };
}
export function nearestFrontDoor(localPoint, layout, maxDistance = 5.5) {
  const centers = layout.frontDoorCenters || [];
  let best = -1, distance = Infinity;
  centers.forEach((x, index) => {
    const dx = localPoint.x - x;
    const dz = localPoint.z;
    const candidate = Math.hypot(dx, Math.max(0, Math.abs(dz) - 1.5));
    if (candidate < distance) { best = index; distance = candidate; }
  });
  return distance <= maxDistance ? best : -1;
}

export function frontDoorForTruck(localTruck, layout, maxDistance = 18) {
  return nearestFrontDoor(localTruck, layout, maxDistance);
}

export function stationCameraOffsetScale(target, camera, volume, clearance = 0.65) {
  if (!(target.z < volume.frontZ)) return 1;
  const dx = camera.x - target.x, dz = camera.z - target.z;
  let enter = 0, exit = 1;
  for (const [start, delta, min, max] of [[target.x, dx, volume.minX, volume.maxX], [target.z, dz, volume.frontZ, volume.rearZ]]) {
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return 1;
      continue;
    }
    let first = (min - start) / delta, last = (max - start) / delta;
    if (first > last) [first, last] = [last, first];
    enter = Math.max(enter, first);
    exit = Math.min(exit, last);
    if (enter > exit) return 1;
  }
  const length = Math.hypot(dx, dz);
  if (exit < 0 || enter > 1 || length < 1e-9) return 1;
  return Math.max(0, Math.min(1, enter - clearance / length));
}

export function nearestStationDoor(localPoint, layout, maxDistance = 12) {
  const candidates = [];
  for (const [index, center] of (layout.frontDoorCenters || []).entries()) {
    const distance = Math.hypot(localPoint.x - center, Math.max(0, Math.abs(localPoint.z) - 1.5));
    if (distance <= maxDistance) candidates.push({ side: 'front', index, distance });
  }
  for (const [index, center] of (layout.rearDoorCenters || []).entries()) {
    const distance = Math.hypot(localPoint.x - center, Math.max(0, Math.abs(localPoint.z - layout.bay.rearZ) - 1.5));
    if (distance <= maxDistance) candidates.push({ side: 'rear', index, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0] || null;
}

export function sampleStationFloor(layout, local, datum, baseHeight) {
  const { bay, apron } = layout;
  const rearExitEnd = bay.rearZ + 8;
  if (local.z > bay.rearZ && local.z <= rearExitEnd && layout.rearDoorCenters.some(center => Math.abs(local.x - center) <= layout.doorWidth / 2 + 0.8)) {
    const underlying = Number(baseHeight());
    if (!Number.isFinite(underlying)) return null;
    const t = smoothstep(bay.rearZ, rearExitEnd, local.z);
    return { height: datum + (underlying - datum) * t, heightSource: 'station2-rear-exit-blend', onRoad: t > 0.95, name: 'Fire Station 2 rear apron' };
  }  if (local.z >= bay.frontZ && local.z <= bay.rearZ && local.x >= bay.minX && local.x <= bay.maxX) {
    return { height: datum, heightSource: 'station2-slab', onRoad: false, name: 'Fire Station 2 bay' };
  }
  if (local.z < Math.max(-20, Math.min(apron.frontZ, apron.rearZ)) || local.z > Math.min(0, Math.max(apron.frontZ, apron.rearZ))) return null;
  let halfWidth;
  if (local.z >= -20) halfWidth = Math.max(Math.abs(apron.minX), Math.abs(apron.maxX));
  else halfWidth = 4.5 + (Math.max(Math.abs(apron.minX), Math.abs(apron.maxX)) - 4.5) * smoothstep(apron.frontZ, -20, local.z);
  if (Math.abs(local.x) > halfWidth) return null;
  const underlying = Number(baseHeight());
  if (!Number.isFinite(underlying)) return null;
  // The connection changes smoothly only on the near-building apron. Farther
  // down the bounded driveway/road alignment, GIS terrain and pavement remain authoritative.
  const t = smoothstep(-14, 0, local.z);
  return { height: underlying + (datum - underlying) * t, heightSource: t > 0.001 ? 'station2-apron-blend' : 'station2-driveway-base', onRoad: t < 0.05, name: 'Fire Station 2 apron' };
}

function rectPolygon(x1, z1, x2, z2) {
  return [{ x: x1, z: z1 }, { x: x2, z: z1 }, { x: x2, z: z2 }, { x: x1, z: z2 }];
}
function polygonsOverlap(a, b) {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i += 1) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const ax = -(q.z - p.z), az = q.x - p.x;
      const project = points => points.map(point => point.x * ax + point.z * az);
      const aa = project(a), bb = project(b);
      if (Math.max(...aa) < Math.min(...bb) || Math.max(...bb) < Math.min(...aa)) return false;
    }
  }
  return true;
}
function truckPolygon(position, dimensions) {
  const h = Number(position.heading) || 0;
  const forward = { x: -Math.sin(h), z: -Math.cos(h) };
  const right = { x: Math.cos(h), z: -Math.sin(h) };
  const halfL = dimensions.length / 2, halfW = dimensions.width / 2;
  return [
    { x: position.x + forward.x * halfL + right.x * halfW, z: position.z + forward.z * halfL + right.z * halfW },
    { x: position.x + forward.x * halfL - right.x * halfW, z: position.z + forward.z * halfL - right.z * halfW },
    { x: position.x - forward.x * halfL - right.x * halfW, z: position.z - forward.z * halfL - right.z * halfW },
    { x: position.x - forward.x * halfL + right.x * halfW, z: position.z - forward.z * halfL + right.z * halfW },
  ];
}
function hitsRect(polygon, rect) { return polygonsOverlap(polygon, rectPolygon(...rect)); }
function orientedLeafPolygon(start, side, angle, length, thickness = 0.2) {
  const direction = side === 'L' ? 1 : -1;
  const end = { x: start.x + direction * length * Math.cos(angle), z: start.z - direction * length * Math.sin(angle) };
  const half = thickness / 2;
  const normal = { x: -(end.z - start.z) / length * half, z: (end.x - start.x) / length * half };
  return [
    { x: start.x + normal.x, z: start.z + normal.z },
    { x: end.x + normal.x, z: end.z + normal.z },
    { x: end.x - normal.x, z: end.z - normal.z },
    { x: start.x - normal.x, z: start.z - normal.z },
  ];
}

function frontDoorLeafPolygons(center, fraction, width) {
  const length = width / 4;
  const polygons = [];
  for (const side of ['L', 'R']) {
    const outerStart = { x: center + (side === 'L' ? -width / 2 : width / 2), z: 0 };
    const outerAngle = (side === 'L' ? 1 : -1) * fraction * Math.PI / 2;
    polygons.push(orientedLeafPolygon(outerStart, side, outerAngle, length));
    const innerBase = { x: center + (side === 'L' ? -width / 4 : width / 4), y: 0, z: 0 };
    const inner = foldedInnerPivot(innerBase, side, fraction, width);
    polygons.push(orientedLeafPolygon({ x: inner.x, z: inner.z }, side, inner.rotationY, length));
  }
  return polygons;
}

export function stationCollision(position, layout, doors, dimensions = { length: 10.4, width: 3.2 }, options = {}) {
  const { x, z, heading = 0 } = position;
  const halfL = options.player ? 0.35 : dimensions.length / 2;
  const halfW = options.player ? 0.35 : dimensions.width / 2;
  const footprint = options.player ? rectPolygon(x - halfW, z - halfL, x + halfW, z + halfL) : truckPolygon(position, dimensions);
  const { bay } = layout;
  const thick = (bay.wallThickness || 0.3) / 2;
  const sideWalls = [
    [bay.minX - thick * 2, bay.frontZ, bay.minX, bay.rearZ],
    [bay.maxX, bay.frontZ, bay.maxX + thick * 2, bay.rearZ],
  ];
  if (sideWalls.some(rect => hitsRect(footprint, rect))) return true;
  const wallRect = (left, right, zCenter) => [left, zCenter - thick, right, zCenter + thick];
  const openingHalf = layout.doorWidth / 2;
  const frontWalls = [];
  let cursor = bay.minX;
  layout.frontDoorCenters.forEach((center, index) => {
    const left = center - openingHalf, right = center + openingHalf;
    frontWalls.push(wallRect(cursor, left, bay.frontZ));
    const door = doors?.front?.[index];
    if (!door || door.fraction < 0.94) frontWalls.push(wallRect(left, right, bay.frontZ));
    cursor = right;
  });
  frontWalls.push(wallRect(cursor, bay.maxX, bay.frontZ));
  if (frontWalls.some(rect => hitsRect(footprint, rect))) return true;
  for (let index = 0; index < layout.frontDoorCenters.length; index += 1) {
    const fraction = clamp(doors?.front?.[index]?.fraction || 0, 0, 1);
    if (frontDoorLeafPolygons(layout.frontDoorCenters[index], fraction, layout.doorWidth).some(leaf => polygonsOverlap(footprint, leaf))) return true;
  }
  const rearDoors = layout.rearDoorCenters || [];
  const rearWalls = [];
  cursor = bay.minX;
  rearDoors.forEach((center, index) => {
    const left = center - openingHalf, right = center + openingHalf;
    rearWalls.push([cursor, bay.rearZ - thick, left, bay.rearZ + thick]);

    if ((doors?.rear?.[index]?.fraction || 0) < 0.94) rearWalls.push([left, bay.rearZ - thick, right, bay.rearZ + thick]);
    cursor = right;
  });
  rearWalls.push([cursor, bay.rearZ - thick, bay.maxX, bay.rearZ + thick]);
  if (rearWalls.some(rect => hitsRect(footprint, rect))) return true;
  // The estimated wing and tower are fixed collision masses and remain bounded by their layout.
  const wing = layout.wing, tower = layout.tower;
  if (hitsRect(footprint, [wing.minX, wing.frontZ, wing.maxX, wing.rearZ])) return true;
  if (hitsRect(footprint, [tower.minX, tower.frontZ, tower.maxX, tower.rearZ])) return true;
  const annex = layout.sideAnnex;
  if (annex && hitsRect(footprint, [annex.minX, annex.frontZ, annex.maxX, annex.rearZ])) return true;
  const service = layout.rearService;
  if (hitsRect(footprint, [service.minX, service.frontZ, service.maxX, service.rearZ])) return true;
  return false;
}

export function sweepStationTruck(previous, next, layout, doors, dimensions) {
  const distance = Math.hypot(next.x - previous.x, next.z - previous.z);
  const headingDelta = Math.atan2(Math.sin(next.heading - previous.heading), Math.cos(next.heading - previous.heading));
  const steps = Math.max(1, Math.ceil(distance / 0.45), Math.ceil(Math.abs(headingDelta) / (Math.PI / 90)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const pose = { x: previous.x + (next.x - previous.x) * t, z: previous.z + (next.z - previous.z) * t, heading: previous.heading + headingDelta * t };
    if (stationCollision(pose, layout, doors, dimensions)) return true;
  }
  return false;
}

export function stationDoorObstructed(layout, doorIndex, truckPosition, playerPosition, dimensions) {
  const centerX = layout.frontDoorCenters[doorIndex];
  const blocked = position => position && Math.abs(position.x - centerX) < layout.doorWidth / 2 + 1.5 && Math.abs(position.z) < (dimensions.length / 2 + 1);
  return blocked(truckPosition) || blocked(playerPosition);
}


export function stationRearDoorObstructed(layout, doorIndex, truckPosition, playerPosition, dimensions) {
  const centerX = layout.rearDoorCenters[doorIndex];
  const blocked = position => position && Math.abs(position.x - centerX) < layout.doorWidth / 2 + 1.5 && Math.abs(position.z - layout.bay.rearZ) < (dimensions.length / 2 + 1);
  return blocked(truckPosition) || blocked(playerPosition);
}







export function foldedInnerPivot(base, side, fraction, doorWidth) {
  const outerAngle = (side === 'L' ? 1 : -1) * clamp(fraction, 0, 1) * Math.PI / 2;
  const reachSign = side === 'L' ? 1 : -1;
  const reach = doorWidth / 4;
  return {
    x: base.x + reachSign * reach * (Math.cos(outerAngle) - 1),
    y: base.y,
    z: base.z - Math.sin(outerAngle) * reachSign * reach,
    rotationY: (side === 'L' ? -1 : 1) * clamp(fraction, 0, 1) * Math.PI / 2,
  };
}

export function sectionalPanelPose(base, panelIndex, fraction, layout) {
  const amount = clamp(fraction, 0, 1);
  const panel = clamp(panelIndex, 0, 6);
  return {
    x: base.x,
    y: base.y + (layout.doorHeight + 0.32 + panel * 0.025 - base.y) * amount,
    z: base.z + (0.35 + panel * layout.doorHeight / 7) * amount,
    rotationX: -amount * Math.PI / 2,
  };
}





export function stationDoorObstructedForSide(layout, doorIndex, side, truckPosition, playerPosition, dimensions) {
  return side === 'rear'
    ? stationRearDoorObstructed(layout, doorIndex, truckPosition, playerPosition, dimensions)
    : stationDoorObstructed(layout, doorIndex, truckPosition, playerPosition, dimensions);
}
