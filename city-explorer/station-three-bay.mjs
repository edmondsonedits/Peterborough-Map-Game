export const STATION_THREE_BAY = Object.freeze({
  minX: -3.4,
  maxX: 14.1,
  minZ: -14,
  maxZ: 0,
  ceiling: 5.8,
});

const DOOR_CENTER_X = -0.7;
const DOOR_WIDTH = 4.6;
const DOOR_HALF_WIDTH = DOOR_WIDTH / 2;
const DOOR_HALF_THICKNESS = 0.15;
const TRUCK_HALF_LENGTH = 10.4 / 2;
const TRUCK_HALF_WIDTH = 2.55 / 2;
const PLAYER_RADIUS = 0.4;
const EPSILON = 1e-9;

const pointIsFinite = point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z));
const headingOf = point => Number.isFinite(Number(point?.heading)) ? Number(point.heading) : 0;
const dot = (a, b) => a.x * b.x + a.z * b.z;

function truckAxes(heading) {
  return {
    forward: { x: Math.sin(heading), z: Math.cos(heading) },
    right: { x: Math.cos(heading), z: -Math.sin(heading) },
  };
}

function truckHalfExtents(heading) {
  const { forward, right } = truckAxes(heading);
  return {
    x: Math.abs(forward.x) * TRUCK_HALF_LENGTH + Math.abs(right.x) * TRUCK_HALF_WIDTH,
    z: Math.abs(forward.z) * TRUCK_HALF_LENGTH + Math.abs(right.z) * TRUCK_HALF_WIDTH,
  };
}

function sweptTruckHalfExtents(fromHeading, toHeading) {
  const delta = Math.atan2(Math.sin(toHeading - fromHeading), Math.cos(toHeading - fromHeading));
  const low = Math.min(fromHeading, fromHeading + delta);
  const high = Math.max(fromHeading, fromHeading + delta);
  const candidates = [fromHeading, fromHeading + delta];
  const criticalX = Math.atan2(TRUCK_HALF_LENGTH, TRUCK_HALF_WIDTH);
  const criticalZ = Math.atan2(TRUCK_HALF_WIDTH, TRUCK_HALF_LENGTH);
  for (const critical of [criticalX, Math.PI - criticalX, criticalZ, Math.PI - criticalZ]) {
    const first = Math.floor((low - critical) / Math.PI) - 1;
    const last = Math.ceil((high - critical) / Math.PI) + 1;
    for (let turn = first; turn <= last; turn += 1) {
      const angle = critical + turn * Math.PI;
      if (angle >= low - EPSILON && angle <= high + EPSILON) candidates.push(angle);
    }
  }
  return candidates.reduce((bounds, heading) => {
    const half = truckHalfExtents(heading);
    return { x: Math.max(bounds.x, half.x), z: Math.max(bounds.z, half.z) };
  }, { x: 0, z: 0 });
}

function circleIntersectsDoor(point) {
  const closestX = Math.max(DOOR_CENTER_X - DOOR_HALF_WIDTH, Math.min(DOOR_CENTER_X + DOOR_HALF_WIDTH, Number(point.x)));
  const closestZ = Math.max(-DOOR_HALF_THICKNESS, Math.min(DOOR_HALF_THICKNESS, Number(point.z)));
  return Math.hypot(Number(point.x) - closestX, Number(point.z) - closestZ) <= PLAYER_RADIUS + EPSILON;
}

function truckIntersectsDoor(point) {
  const heading = headingOf(point);
  const axes = truckAxes(heading);
  const doorCenter = { x: DOOR_CENTER_X, z: 0 };
  const truckCenter = { x: Number(point.x), z: Number(point.z) };
  const testAxes = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    axes.forward,
    axes.right,
  ];
  return testAxes.every(axis => {
    const centerDistance = Math.abs(dot({ x: truckCenter.x - doorCenter.x, z: truckCenter.z - doorCenter.z }, axis));
    const truckRadius = Math.abs(dot(axis, axes.forward)) * TRUCK_HALF_LENGTH
      + Math.abs(dot(axis, axes.right)) * TRUCK_HALF_WIDTH;
    const doorRadius = DOOR_HALF_WIDTH * Math.abs(axis.x) + DOOR_HALF_THICKNESS * Math.abs(axis.z);
    return centerDistance <= truckRadius + doorRadius + EPSILON;
  });
}

/** True when a player or oriented truck occupies Door 01's aperture and threshold. */
export function stationThreeDoorObstructed(point, { player = false } = {}) {
  if (!pointIsFinite(point)) return true;
  return player ? circleIntersectsDoor(point) : truckIntersectsDoor(point);
}

/** True when a swept actor box hits Station 3's front facade during a move. */
export function stationThreeDoorSweep(from, to, { fraction = 0, player = false } = {}) {
  if (!pointIsFinite(from) || !pointIsFinite(to)) return true;
  const startZ = Number(from.z);
  const endZ = Number(to.z);
  const crossesPlane = (startZ < -EPSILON && endZ > EPSILON) || (startZ > EPSILON && endZ < -EPSILON);
  let halfX;
  let halfZ;
  let startHalfZ;
  if (player) {
    halfX = PLAYER_RADIUS;
    halfZ = PLAYER_RADIUS;
    startHalfZ = PLAYER_RADIUS;
  } else {
    startHalfZ = truckHalfExtents(headingOf(from)).z;
    const sweep = sweptTruckHalfExtents(headingOf(from), headingOf(to));
    halfX = sweep.x;
    halfZ = sweep.z;
  }
  const startClearance = Math.abs(startZ) - startHalfZ - DOOR_HALF_THICKNESS;
  const sweptClearance = Math.min(Math.abs(startZ), Math.abs(endZ)) - halfZ - DOOR_HALF_THICKNESS;
  const entersFacade = sweptClearance < startClearance - EPSILON;

  const startX = Number(from.x);
  const endX = Number(to.x);
  const minX = Math.min(Number(from.x), Number(to.x)) - halfX;
  const maxX = Math.max(Number(from.x), Number(to.x)) + halfX;
  const minZ = Math.min(startZ, endZ) - halfZ;
  const maxZ = Math.max(startZ, endZ) + halfZ;
  const hitsFacadeDepth = maxZ >= -DOOR_HALF_THICKNESS && minZ <= DOOR_HALF_THICKNESS;
  const overlapsFacadeWidth = maxX >= STATION_THREE_BAY.minX && minX <= STATION_THREE_BAY.maxX;
  if (!hitsFacadeDepth || !overlapsFacadeWidth) return false;

  const openingMinX = DOOR_CENTER_X - DOOR_HALF_WIDTH;
  const openingMaxX = DOOR_CENTER_X + DOOR_HALF_WIDTH;
  const fullyOpen = Number.isFinite(Number(fraction)) && Number(fraction) >= 0.98;
  const fitsDoor01 = minX >= openingMinX - EPSILON && maxX <= openingMaxX + EPSILON;
  if (!crossesPlane && !entersFacade) {
    if (Math.abs(endX - startX) <= EPSILON) return false;
    if (fullyOpen && fitsDoor01) return false;

    const startHalfX = player ? PLAYER_RADIUS : truckHalfExtents(headingOf(from)).x;
    const endHalfX = player ? PLAYER_RADIUS : truckHalfExtents(headingOf(to)).x;
    const overlapWidth = (center, half) => Math.max(0,
      Math.min(center + half, STATION_THREE_BAY.maxX) - Math.max(center - half, STATION_THREE_BAY.minX));
    const startOverlap = overlapWidth(startX, startHalfX);
    const endOverlap = overlapWidth(endX, endHalfX);
    const facadeCenterX = (STATION_THREE_BAY.minX + STATION_THREE_BAY.maxX) / 2;
    const movesOutward = startOverlap > EPSILON && endOverlap < startOverlap - EPSILON
      && ((startX <= facadeCenterX && endX < startX) || (startX > facadeCenterX && endX > startX));
    return !movesOutward;
  }
  return !(fullyOpen && fitsDoor01);
}
