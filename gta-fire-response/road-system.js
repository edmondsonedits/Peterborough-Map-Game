function toXY(lat, lng) {
  return {
    x: (lng - ROAD_CONFIG.centerLng) * METERS_PER_LNG,
    y: (lat - ROAD_CONFIG.centerLat) * METERS_PER_LAT
  };
}
function toLatLng(x, y) {
  return {
    lat: ROAD_CONFIG.centerLat + y / METERS_PER_LAT,
    lng: ROAD_CONFIG.centerLng + x / METERS_PER_LNG
  };
}
function roadWidth(properties = {}) {
  const type = String(properties.highway || 'road').toLowerCase();
  let width = ROAD_WIDTHS[type] || 6;
  const lanes = Number.parseFloat(properties.lanes);
  if (Number.isFinite(lanes)) width = Math.max(width, lanes * 3.15);
  return Math.min(20, Math.max(5.5, width));
}
function addRoadSegment(aCoordinate, bCoordinate, properties, featureIndex) {
  if (!Array.isArray(aCoordinate) || !Array.isArray(bCoordinate)) return;
  const a = toXY(Number(aCoordinate[1]), Number(aCoordinate[0]));
  const b = toXY(Number(bCoordinate[1]), Number(bCoordinate[0]));
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < .25) return;
  const width = roadWidth(properties);
  const allowed = width / 2 + ROAD_CONFIG.shoulderTolerance;
  const segment = {
    ax: a.x, ay: a.y, bx: b.x, by: b.y, dx, dy, lengthSq,
    length: Math.sqrt(lengthSq), width, allowed, featureIndex,
    highway: properties.highway || 'road',
    name: properties.name || properties.ref || 'Unnamed road'
  };
  const segmentIndex = roads.segments.push(segment) - 1;
  const minX = Math.min(a.x, b.x) - allowed - 3;
  const maxX = Math.max(a.x, b.x) + allowed + 3;
  const minY = Math.min(a.y, b.y) - allowed - 3;
  const maxY = Math.max(a.y, b.y) + allowed + 3;
  const minCellX = Math.floor(minX / ROAD_CONFIG.gridSize);
  const maxCellX = Math.floor(maxX / ROAD_CONFIG.gridSize);
  const minCellY = Math.floor(minY / ROAD_CONFIG.gridSize);
  const maxCellY = Math.floor(maxY / ROAD_CONFIG.gridSize);
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      const key = `${cellX},${cellY}`;
      const bucket = roads.grid.get(key);
      if (bucket) bucket.push(segmentIndex);
      else roads.grid.set(key, [segmentIndex]);
    }
  }
}
function addRoadLine(coordinates, properties, featureIndex) {
  if (!Array.isArray(coordinates)) return;
  for (let index = 1; index < coordinates.length; index += 1) {
    addRoadSegment(coordinates[index - 1], coordinates[index], properties, featureIndex);
  }
}
function buildRoadIndex(geojson) {
  roads.segments = [];
  roads.grid = new Map();
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  features.forEach((feature, featureIndex) => {
    const geometry = feature?.geometry;
    const properties = feature?.properties || {};
    if (geometry?.type === 'LineString') addRoadLine(geometry.coordinates, properties, featureIndex);
    if (geometry?.type === 'MultiLineString') geometry.coordinates.forEach(line => addRoadLine(line, properties, featureIndex));
  });
  if (!roads.segments.length) throw new Error('No drivable road segments were found.');
}
function projectPointToSegment(x, y, segment) {
  const t = Math.max(0, Math.min(1, ((x - segment.ax) * segment.dx + (y - segment.ay) * segment.dy) / segment.lengthSq));
  const px = segment.ax + segment.dx * t;
  const py = segment.ay + segment.dy * t;
  const offsetX = x - px;
  const offsetY = y - py;
  return { x: px, y: py, t, distance: Math.hypot(offsetX, offsetY), offsetX, offsetY, segment };
}
function nearbySegmentIndexes(x, y, searchRadius = 45) {
  const radiusCells = Math.max(1, Math.ceil(searchRadius / ROAD_CONFIG.gridSize));
  const centerX = Math.floor(x / ROAD_CONFIG.gridSize);
  const centerY = Math.floor(y / ROAD_CONFIG.gridSize);
  const indexes = new Set();
  for (let offsetX = -radiusCells; offsetX <= radiusCells; offsetX += 1) {
    for (let offsetY = -radiusCells; offsetY <= radiusCells; offsetY += 1) {
      const bucket = roads.grid.get(`${centerX + offsetX},${centerY + offsetY}`);
      if (bucket) bucket.forEach(index => indexes.add(index));
    }
  }
  return indexes;
}
function nearestRoadXY(x, y, searchRadius = 45) {
  let best = null;
  for (const index of nearbySegmentIndexes(x, y, searchRadius)) {
    const projection = projectPointToSegment(x, y, roads.segments[index]);
    if (!best || projection.distance < best.distance) best = projection;
  }
  return best;
}
function roadInfoAtXY(x, y, searchRadius = 45) {
  const nearest = nearestRoadXY(x, y, searchRadius);
  if (!nearest) return { drivable: false, nearest: null };
  return { drivable: nearest.distance <= nearest.segment.allowed, nearest };
}
function isSweepDrivable(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distance / ROAD_CONFIG.sweepStep));
  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    if (!roadInfoAtXY(from.x + dx * ratio, from.y + dy * ratio).drivable) return false;
  }
  return true;
}
function headingForSegment(segment, currentHeading = 0) {
  const forward = normalizeHeading(Math.atan2(segment.dx, segment.dy) * 180 / Math.PI);
  const reverse = normalizeHeading(forward + 180);
  return Math.abs(angleDifference(currentHeading, forward)) <= Math.abs(angleDifference(currentHeading, reverse)) ? forward : reverse;
}
function applyLaneAssist(point, speed) {
  if (Math.abs(speed) < .15) return point;
  const info = roadInfoAtXY(point.x, point.y);
  if (!info.drivable || !info.nearest) return point;
  const normalizedOffset = Math.min(1, info.nearest.distance / Math.max(1, info.nearest.segment.allowed));
  const correction = ROAD_CONFIG.laneAssist * .035 * normalizedOffset;
  return {
    x: point.x + (info.nearest.x - point.x) * correction,
    y: point.y + (info.nearest.y - point.y) * correction
  };
}
function beginStationExit() {
  if (roads.status !== 'ready') return false;
  const start = toXY(truck.lat, truck.lng);
  const nearest = nearestRoadXY(start.x, start.y, ROAD_CONFIG.stationExitSearchDistance);
  if (!nearest || nearest.distance > ROAD_CONFIG.stationExitSearchDistance) return false;
  if (nearest.distance <= nearest.segment.allowed) {
    roads.stationExit = null;
    return false;
  }
  const dx = nearest.x - start.x;
  const dy = nearest.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1) return false;
  roads.stationExit = {
    ax: start.x, ay: start.y, bx: nearest.x, by: nearest.y,
    dx, dy, lengthSq, length: Math.sqrt(lengthSq), roadSegment: nearest.segment
  };
  truck.heading = normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);
  truck.speed = 0;
  refreshTruckMarker();
  return true;
}
function resolveStationExitMovement(previous, candidate) {
  const exit = roads.stationExit;
  if (!exit) return null;
  const roadInfo = roadInfoAtXY(candidate.x, candidate.y, ROAD_CONFIG.stationExitSearchDistance);
  if (roadInfo.drivable) {
    roads.stationExit = null;
    return { ...toLatLng(candidate.x, candidate.y), blocked: false, stationExitCompleted: true };
  }
  const projection = projectPointToSegment(candidate.x, candidate.y, exit);
  const distanceFromStart = Math.hypot(candidate.x - exit.ax, candidate.y - exit.ay);
  if (distanceFromStart <= ROAD_CONFIG.stationExitStartPadding || projection.distance <= ROAD_CONFIG.stationExitCorridorHalfWidth) {
    return { ...toLatLng(candidate.x, candidate.y), blocked: false, stationExitActive: true };
  }
  return { ...toLatLng(previous.x, previous.y), blocked: true, stationExitActive: true };
}
function resolveRoadMovement(previousLat, previousLng, candidateLat, candidateLng, speed) {
  const previous = toXY(previousLat, previousLng);
  const candidate = toXY(candidateLat, candidateLng);
  const exitResult = resolveStationExitMovement(previous, candidate);
  if (exitResult) return exitResult;
  const previousInfo = roadInfoAtXY(previous.x, previous.y, ROAD_CONFIG.spawnSnapDistance);

  if (!previousInfo.drivable && previousInfo.nearest && previousInfo.nearest.distance <= ROAD_CONFIG.spawnSnapDistance) {
    return { ...toLatLng(previousInfo.nearest.x, previousInfo.nearest.y), blocked: false, snapped: true, segment: previousInfo.nearest.segment };
  }
  if (isSweepDrivable(previous, candidate)) {
    const assisted = applyLaneAssist(candidate, speed);
    if (isSweepDrivable(previous, assisted)) return { ...toLatLng(assisted.x, assisted.y), blocked: false };
    return { ...toLatLng(candidate.x, candidate.y), blocked: false };
  }

  const movementX = candidate.x - previous.x;
  const movementY = candidate.y - previous.y;
  const reference = previousInfo.nearest || nearestRoadXY(candidate.x, candidate.y, 55);
  if (reference?.segment) {
    const tangentX = reference.segment.dx / reference.segment.length;
    const tangentY = reference.segment.dy / reference.segment.length;
    const along = movementX * tangentX + movementY * tangentY;
    const slide = { x: previous.x + tangentX * along * .92, y: previous.y + tangentY * along * .92 };
    const centeredSlide = applyLaneAssist(slide, speed);
    if (isSweepDrivable(previous, centeredSlide)) {
      return { ...toLatLng(centeredSlide.x, centeredSlide.y), blocked: true, slid: true, segment: reference.segment };
    }
  }

  const partial = { x: previous.x + movementX * .35, y: previous.y + movementY * .35 };
  if (isSweepDrivable(previous, partial)) return { ...toLatLng(partial.x, partial.y), blocked: true };
  return { lat: previousLat, lng: previousLng, blocked: true };
}

async function initRoads() {
  roads.status = 'loading';
  ui.roadLock.textContent = 'Loading road barriers';
  ui.roadLock.className = 'road-lock loading';
  ui.loadStatus.textContent = 'Loading Peterborough road barriers…';
  ui.loadStatus.className = 'load-status';
  ui.startButton.disabled = true;
  ui.startButton.textContent = 'Loading Roads…';
  try {
    const response = await fetch(ROAD_CONFIG.dataUrl, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Road data request failed: ${response.status}`);
    buildRoadIndex(await response.json());
    roads.status = 'ready';
    beginStationExit();
    ui.roadLock.textContent = `Road lock active · ${roads.segments.length.toLocaleString()}`;
    ui.roadLock.className = 'road-lock';
    ui.loadStatus.textContent = 'Road barriers ready · firefighter movement remains unrestricted';
    ui.loadStatus.className = 'load-status ready';
    ui.startButton.disabled = false;
    ui.startButton.textContent = 'Start Shift';
  } catch (error) {
    console.error('Road barriers failed to load.', error);
    roads.status = 'failed';
    ui.roadLock.textContent = 'Road barriers unavailable';
    ui.roadLock.className = 'road-lock failed';
    ui.loadStatus.textContent = 'Road network failed to load. Tap below to retry.';
    ui.loadStatus.className = 'load-status failed';
    ui.startButton.disabled = false;
    ui.startButton.textContent = 'Retry Road Data';
  }
}
