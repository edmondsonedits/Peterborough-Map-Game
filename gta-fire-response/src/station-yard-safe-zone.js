const DEFAULT_STATION_YARD = Object.freeze({
  radius: 42,
  drivewayHalfWidth: 14,
  roadSearchDistance: 160,
  corridorStartPadding: .12,
  corridorEndPadding: .22
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * The station exemption is intentionally local: a circular apparatus apron plus
 * a wide connector to the nearest mapped road. Once the truck leaves both shapes,
 * the normal road-footprint barrier takes over again.
 */
export function stationYardContainsXY(zone, x, y) {
  if (!zone?.stationYard || !Number.isFinite(x) || !Number.isFinite(y)) return false;

  const distanceFromHall = Math.hypot(x - zone.ax, y - zone.ay);
  if (distanceFromHall <= zone.yardRadius) return true;
  if (!zone.roadConnected || zone.lengthSq < .01) return false;

  const rawT = ((x - zone.ax) * zone.dx + (y - zone.ay) * zone.dy) / zone.lengthSq;
  if (rawT < -zone.corridorStartPadding || rawT > 1 + zone.corridorEndPadding) return false;
  const t = clamp(rawT, 0, 1);
  const nearestX = zone.ax + zone.dx * t;
  const nearestY = zone.ay + zone.dy * t;
  return Math.hypot(x - nearestX, y - nearestY) <= zone.corridorHalfWidth;
}

export function buildStationYardZone(roads, pose, stationId = 'station', settings = DEFAULT_STATION_YARD) {
  const start = roads.xy(pose.lat, pose.lng);
  const info = roads.pointInfoXY(start.x, start.y, settings.roadSearchDistance);
  const roadTarget = info.nearest && info.nearest.distance <= settings.roadSearchDistance ? info.nearest : null;
  const targetX = roadTarget?.x ?? start.x;
  const targetY = roadTarget?.y ?? start.y;
  const dx = targetX - start.x;
  const dy = targetY - start.y;
  const lengthSq = dx * dx + dy * dy;

  return {
    stationYard: true,
    stationId,
    ax: start.x,
    ay: start.y,
    bx: targetX,
    by: targetY,
    dx,
    dy,
    lengthSq,
    length: Math.sqrt(lengthSq),
    yardRadius: settings.radius,
    corridorHalfWidth: settings.drivewayHalfWidth,
    corridorStartPadding: settings.corridorStartPadding,
    corridorEndPadding: settings.corridorEndPadding,
    roadConnected: Boolean(roadTarget)
  };
}

export function installStationYardSafeZone(game) {
  const roads = game?.roads;
  if (!roads || roads.__stationYardSafeZoneInstalled) return false;

  const originalInsideStationExit = roads.insideStationExit.bind(roads);
  const originalResolveMovement = roads.resolveMovement.bind(roads);

  const activeStation = fallbackPose => {
    const station = game.phase4?.selectedStation?.();
    return {
      id: station?.id || 'station-1',
      pose: station?.truckSpawn || fallbackPose
    };
  };

  roads.createStationExit = pose => {
    const station = activeStation(pose);
    if (roads.stationExit?.stationYard && roads.stationExit.stationId === station.id) return true;
    roads.stationExit = buildStationYardZone(roads, station.pose, station.id);
    return true;
  };

  roads.insideStationExit = pose => {
    if (!roads.stationExit?.stationYard) return originalInsideStationExit(pose);
    const center = roads.xy(pose.lat, pose.lng);
    return stationYardContainsXY(roads.stationExit, center.x, center.y);
  };

  roads.resolveMovement = (fromPose, candidatePose, speed, laneAssistStrength = .08) => {
    const stationMovement = roads.insideStationExit(fromPose) || roads.insideStationExit(candidatePose);
    return originalResolveMovement(fromPose, candidatePose, speed, stationMovement ? 0 : laneAssistStrength);
  };

  roads.__stationYardSafeZoneInstalled = true;
  roads.stationExit = null;
  roads.createStationExit(game.truck);

  document.documentElement.dataset.stationYardSafeZone = 'active';
  const version = document.getElementById('version-text');
  if (version) version.textContent = 'Station-yard hotfix 1.1.1';
  return true;
}
