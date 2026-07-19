(() => {
  'use strict';

  if (window.PTBO_ROAD_COLLISION) return;

  const CONFIG = Object.freeze({
    dataUrl: '../city-explorer/data/osm-public-roads.geojson',
    centerLat: 44.3091,
    centerLng: -78.3197,
    gridSize: 80,
    sweepStep: 1.35,
    shoulderTolerance: 1.35,
    spawnSnapDistance: 120,
    defaultLaneAssist: 0.25,
    collisionVelocityRetention: 0.42,
  });

  const METERS_PER_LAT = 110540;
  const METERS_PER_LNG = 111320 * Math.cos(CONFIG.centerLat * Math.PI / 180);
  const ROAD_WIDTHS = Object.freeze({
    motorway: 16,
    motorway_link: 10,
    trunk: 15,
    trunk_link: 9,
    primary: 13,
    primary_link: 8.5,
    secondary: 11,
    secondary_link: 8,
    tertiary: 9,
    tertiary_link: 7.5,
    residential: 7,
    living_street: 6.5,
    unclassified: 6.5,
    service: 6,
    road: 6,
  });

  const state = {
    status: 'loading',
    enabled: true,
    laneAssist: CONFIG.defaultLaneAssist,
    segments: [],
    grid: new Map(),
    geojson: null,
    debugLayer: null,
    collisions: 0,
    lastCollisionAt: 0,
    originalLoop: null,
    originalEvaluateDistance: null,
    insidePhysicsStep: false,
  };

  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  function toXY(lat, lng) {
    return {
      x: (lng - CONFIG.centerLng) * METERS_PER_LNG,
      y: (lat - CONFIG.centerLat) * METERS_PER_LAT,
    };
  }

  function toLatLng(x, y) {
    return {
      lat: CONFIG.centerLat + y / METERS_PER_LAT,
      lng: CONFIG.centerLng + x / METERS_PER_LNG,
    };
  }

  function roadWidth(properties = {}) {
    const type = String(properties.highway || 'road').toLowerCase();
    let width = ROAD_WIDTHS[type] || 6;
    const lanes = Number.parseFloat(properties.lanes);
    if (Number.isFinite(lanes)) width = Math.max(width, lanes * 3.15);
    return Math.min(20, Math.max(5.5, width));
  }

  function addSegment(aCoordinate, bCoordinate, properties, featureIndex) {
    if (!Array.isArray(aCoordinate) || !Array.isArray(bCoordinate)) return;
    const a = toXY(Number(aCoordinate[1]), Number(aCoordinate[0]));
    const b = toXY(Number(bCoordinate[1]), Number(bCoordinate[0]));
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 0.25) return;

    const width = roadWidth(properties);
    const allowed = width / 2 + CONFIG.shoulderTolerance;
    const segment = {
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      dx,
      dy,
      lengthSq,
      length: Math.sqrt(lengthSq),
      allowed,
      width,
      featureIndex,
      highway: properties.highway || 'road',
      name: properties.name || properties.ref || 'Unnamed road',
    };
    const segmentIndex = state.segments.push(segment) - 1;

    const minX = Math.min(a.x, b.x) - allowed - 3;
    const maxX = Math.max(a.x, b.x) + allowed + 3;
    const minY = Math.min(a.y, b.y) - allowed - 3;
    const maxY = Math.max(a.y, b.y) + allowed + 3;
    const minCellX = Math.floor(minX / CONFIG.gridSize);
    const maxCellX = Math.floor(maxX / CONFIG.gridSize);
    const minCellY = Math.floor(minY / CONFIG.gridSize);
    const maxCellY = Math.floor(maxY / CONFIG.gridSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const key = `${cellX},${cellY}`;
        const bucket = state.grid.get(key);
        if (bucket) bucket.push(segmentIndex);
        else state.grid.set(key, [segmentIndex]);
      }
    }
  }

  function addLine(coordinates, properties, featureIndex) {
    if (!Array.isArray(coordinates)) return;
    for (let index = 1; index < coordinates.length; index += 1) {
      addSegment(coordinates[index - 1], coordinates[index], properties, featureIndex);
    }
  }

  function buildRoadIndex(geojson) {
    state.segments = [];
    state.grid = new Map();
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    features.forEach((feature, featureIndex) => {
      const geometry = feature?.geometry;
      const properties = feature?.properties || {};
      if (geometry?.type === 'LineString') addLine(geometry.coordinates, properties, featureIndex);
      if (geometry?.type === 'MultiLineString') {
        geometry.coordinates.forEach(line => addLine(line, properties, featureIndex));
      }
    });
    if (!state.segments.length) throw new Error('No drivable road segments were found.');
  }

  function projectPointToSegment(x, y, segment) {
    const t = Math.max(0, Math.min(1, ((x - segment.ax) * segment.dx + (y - segment.ay) * segment.dy) / segment.lengthSq));
    const px = segment.ax + segment.dx * t;
    const py = segment.ay + segment.dy * t;
    const offsetX = x - px;
    const offsetY = y - py;
    return {
      x: px,
      y: py,
      t,
      distance: Math.hypot(offsetX, offsetY),
      offsetX,
      offsetY,
      segment,
    };
  }

  function nearbySegmentIndexes(x, y, searchRadius = 45) {
    const radiusCells = Math.max(1, Math.ceil(searchRadius / CONFIG.gridSize));
    const centerX = Math.floor(x / CONFIG.gridSize);
    const centerY = Math.floor(y / CONFIG.gridSize);
    const indexes = new Set();
    for (let offsetX = -radiusCells; offsetX <= radiusCells; offsetX += 1) {
      for (let offsetY = -radiusCells; offsetY <= radiusCells; offsetY += 1) {
        const bucket = state.grid.get(`${centerX + offsetX},${centerY + offsetY}`);
        if (bucket) bucket.forEach(index => indexes.add(index));
      }
    }
    return indexes;
  }

  function nearestRoadXY(x, y, searchRadius = 45) {
    let best = null;
    for (const index of nearbySegmentIndexes(x, y, searchRadius)) {
      const projection = projectPointToSegment(x, y, state.segments[index]);
      if (!best || projection.distance < best.distance) best = projection;
    }
    return best;
  }

  function roadInfoAtXY(x, y, searchRadius = 45) {
    const nearest = nearestRoadXY(x, y, searchRadius);
    if (!nearest) return { drivable: false, nearest: null, clearance: Infinity };
    return {
      drivable: nearest.distance <= nearest.segment.allowed,
      nearest,
      clearance: nearest.distance - nearest.segment.allowed,
    };
  }

  function isPointDrivable(lat, lng) {
    if (state.status !== 'ready') return false;
    const point = toXY(lat, lng);
    return roadInfoAtXY(point.x, point.y).drivable;
  }

  function isSweepDrivable(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / CONFIG.sweepStep));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const info = roadInfoAtXY(from.x + dx * t, from.y + dy * t);
      if (!info.drivable) return false;
    }
    return true;
  }

  function headingForSegment(segment, currentHeading = 0) {
    const forward = (Math.atan2(segment.dx, segment.dy) * 180 / Math.PI + 360) % 360;
    const reverse = (forward + 180) % 360;
    const angularDifference = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    return angularDifference(currentHeading, forward) <= angularDifference(currentHeading, reverse) ? forward : reverse;
  }

  function applyLaneAssist(point, speed) {
    if (state.laneAssist <= 0 || Math.abs(speed) < 0.00000003) return point;
    const info = roadInfoAtXY(point.x, point.y);
    if (!info.drivable || !info.nearest) return point;
    const normalizedOffset = Math.min(1, info.nearest.distance / Math.max(1, info.nearest.segment.allowed));
    const correction = state.laneAssist * 0.035 * normalizedOffset;
    return {
      x: point.x + (info.nearest.x - point.x) * correction,
      y: point.y + (info.nearest.y - point.y) * correction,
    };
  }

  function resolveMovement(previousLat, previousLng, candidateLat, candidateLng, speed) {
    const previous = toXY(previousLat, previousLng);
    const candidate = toXY(candidateLat, candidateLng);
    const previousInfo = roadInfoAtXY(previous.x, previous.y, CONFIG.spawnSnapDistance);

    if (!previousInfo.drivable && previousInfo.nearest && previousInfo.nearest.distance <= CONFIG.spawnSnapDistance) {
      const snapped = applyLaneAssist({ x: previousInfo.nearest.x, y: previousInfo.nearest.y }, speed);
      return { ...toLatLng(snapped.x, snapped.y), blocked: false, snapped: true, segment: previousInfo.nearest.segment };
    }

    if (isSweepDrivable(previous, candidate)) {
      const assisted = applyLaneAssist(candidate, speed);
      if (isSweepDrivable(previous, assisted)) {
        return { ...toLatLng(assisted.x, assisted.y), blocked: false, snapped: false };
      }
      return { ...toLatLng(candidate.x, candidate.y), blocked: false, snapped: false };
    }

    const movementX = candidate.x - previous.x;
    const movementY = candidate.y - previous.y;
    const reference = previousInfo.nearest || nearestRoadXY(candidate.x, candidate.y, 55);
    if (reference?.segment) {
      const tangentX = reference.segment.dx / reference.segment.length;
      const tangentY = reference.segment.dy / reference.segment.length;
      const along = movementX * tangentX + movementY * tangentY;
      const slide = {
        x: previous.x + tangentX * along * 0.92,
        y: previous.y + tangentY * along * 0.92,
      };
      const centeredSlide = applyLaneAssist(slide, speed);
      if (isSweepDrivable(previous, centeredSlide)) {
        return { ...toLatLng(centeredSlide.x, centeredSlide.y), blocked: true, slid: true, segment: reference.segment };
      }
    }

    const half = { x: previous.x + movementX * 0.35, y: previous.y + movementY * 0.35 };
    if (isSweepDrivable(previous, half)) {
      return { ...toLatLng(half.x, half.y), blocked: true, slid: false };
    }

    return { lat: previousLat, lng: previousLng, blocked: true, slid: false };
  }

  function updateVehiclePosition(lat, lng, recenter = false) {
    simLat = lat;
    simLng = lng;
    if (vehicleMarker) vehicleMarker.setLatLng([simLat, simLng]);
    const latNode = document.getElementById('tel-lat');
    const lngNode = document.getElementById('tel-lng');
    if (latNode) latNode.textContent = simLat.toFixed(6);
    if (lngNode) lngNode.textContent = simLng.toFixed(6);
    if (recenter && mapInstance && document.getElementById('chk-camera')?.checked) {
      mapInstance.setView([simLat, simLng], mapInstance.getZoom(), { animate: false });
    }
  }

  function noteCollision() {
    state.collisions += 1;
    state.lastCollisionAt = performance.now();
    const statusNode = document.getElementById('road-lock-status');
    if (statusNode) {
      statusNode.textContent = 'Boundary contact — sliding along road edge';
      statusNode.dataset.state = 'blocked';
      clearTimeout(noteCollision.timer);
      noteCollision.timer = setTimeout(updateStatusText, 700);
    }
  }

  function updateStatusText() {
    const statusNode = document.getElementById('road-lock-status');
    if (!statusNode) return;
    const text = state.status === 'ready'
      ? state.enabled ? `Active · ${state.segments.length.toLocaleString()} road segments` : 'Disabled'
      : state.status === 'failed' ? 'Unavailable — free driving mode' : 'Loading road boundaries…';
    statusNode.textContent = text;
    statusNode.dataset.state = state.status;
  }

  function installControls() {
    const panel = document.querySelector('.panel-scroll');
    if (!panel || document.getElementById('road-lock-enabled')) return;
    const firstTitle = panel.querySelector('.section-title');
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Road Boundaries';

    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'checkbox-row';
    enabledLabel.innerHTML = '<input type="checkbox" id="road-lock-enabled" checked> Keep truck on drivable roads';

    const assistRow = document.createElement('div');
    assistRow.className = 'control-row';
    assistRow.innerHTML = '<label><span>Lane Centering Assist</span><span id="road-assist-value">25%</span></label><input type="range" id="road-assist" min="0" max="60" value="25">';

    const debugLabel = document.createElement('label');
    debugLabel.className = 'checkbox-row';
    debugLabel.innerHTML = '<input type="checkbox" id="road-debug-visible"> Show collision road network';

    const statusNode = document.createElement('div');
    statusNode.id = 'road-lock-status';
    statusNode.style.cssText = 'margin:8px 0 14px;padding:9px 10px;border-radius:4px;background:#eef7fa;color:#155e75;font-size:11px;font-weight:700;line-height:1.35;';

    [title, enabledLabel, assistRow, debugLabel, statusNode].forEach(node => panel.insertBefore(node, firstTitle));

    const enabledInput = document.getElementById('road-lock-enabled');
    const assistInput = document.getElementById('road-assist');
    const debugInput = document.getElementById('road-debug-visible');
    enabledInput.addEventListener('change', () => {
      state.enabled = enabledInput.checked;
      if (state.enabled) snapVehicleToRoad(CONFIG.spawnSnapDistance);
      updateStatusText();
    });
    assistInput.addEventListener('input', () => {
      state.laneAssist = Number(assistInput.value) / 100;
      document.getElementById('road-assist-value').textContent = `${assistInput.value}%`;
    });
    debugInput.addEventListener('change', () => toggleDebugLayer(debugInput.checked));
    updateStatusText();
  }

  function toggleDebugLayer(visible) {
    if (!mapInstance || !state.geojson) return;
    if (!visible) {
      if (state.debugLayer) mapInstance.removeLayer(state.debugLayer);
      state.debugLayer = null;
      return;
    }
    if (state.debugLayer) return;
    state.debugLayer = L.geoJSON(state.geojson, {
      interactive: false,
      style: feature => ({
        color: '#00bcd4',
        opacity: 0.5,
        weight: Math.max(2, roadWidth(feature?.properties) / 3.2),
      }),
    }).addTo(mapInstance);
    state.debugLayer.bringToBack?.();
  }

  function snapVehicleToRoad(maxDistance = CONFIG.spawnSnapDistance) {
    if (state.status !== 'ready') return false;
    const point = toXY(simLat, simLng);
    const nearest = nearestRoadXY(point.x, point.y, maxDistance);
    if (!nearest || nearest.distance > maxDistance) return false;
    const latLng = toLatLng(nearest.x, nearest.y);
    updateVehiclePosition(latLng.lat, latLng.lng, true);
    currentHeading = headingForSegment(nearest.segment, currentHeading);
    if (vehicleMarker) vehicleMarker.setRotationAngle(currentHeading - 90);
    velocity = 0;
    return true;
  }

  function installDistanceGuard() {
    if (state.originalEvaluateDistance || typeof evaluateDistanceToTarget !== 'function') return;
    state.originalEvaluateDistance = evaluateDistanceToTarget;
    evaluateDistanceToTarget = function roadSafeEvaluateDistance(...args) {
      if (state.insidePhysicsStep) return;
      return state.originalEvaluateDistance.apply(this, args);
    };
    window.evaluateDistanceToTarget = evaluateDistanceToTarget;
  }

  function installLoopGuard() {
    if (state.originalLoop || typeof simulationLoop !== 'function') return;
    state.originalLoop = simulationLoop;
    simulationLoop = function roadBoundSimulationLoop(timestamp) {
      const previousLat = simLat;
      const previousLng = simLng;
      const previousVelocity = velocity;
      state.insidePhysicsStep = true;
      state.originalLoop(timestamp);
      state.insidePhysicsStep = false;

      if (!state.enabled) return;
      if (state.status === 'loading') {
        velocity = 0;
        updateVehiclePosition(previousLat, previousLng, false);
        return;
      }
      if (state.status !== 'ready') return;

      const result = resolveMovement(previousLat, previousLng, simLat, simLng, previousVelocity);
      const positionChanged = Math.abs(result.lat - simLat) > 1e-11 || Math.abs(result.lng - simLng) > 1e-11;
      if (positionChanged || result.blocked || result.snapped) {
        updateVehiclePosition(result.lat, result.lng, true);
      }
      if (result.snapped && result.segment) {
        currentHeading = headingForSegment(result.segment, currentHeading);
        vehicleMarker?.setRotationAngle(currentHeading - 90);
      }
      if (result.blocked) {
        velocity *= CONFIG.collisionVelocityRetention;
        noteCollision();
      }
      if (simulationState === STATES.ENROUTE && velocity !== 0 && state.originalEvaluateDistance) {
        state.originalEvaluateDistance();
      }
    };
    window.simulationLoop = simulationLoop;
  }

  function installTeleportGuard() {
    if (typeof teleportToStation !== 'function' || teleportToStation._roadCollisionWrapped) return;
    const originalTeleport = teleportToStation;
    teleportToStation = function roadSafeTeleport(...args) {
      const result = originalTeleport.apply(this, args);
      if (state.status === 'ready') setTimeout(() => snapVehicleToRoad(CONFIG.spawnSnapDistance), 0);
      else ready.then(() => snapVehicleToRoad(CONFIG.spawnSnapDistance)).catch(() => {});
      return result;
    };
    teleportToStation._roadCollisionWrapped = true;
    window.teleportToStation = teleportToStation;
  }

  function installRuntimeGuards() {
    installControls();
    installDistanceGuard();
    installLoopGuard();
    installTeleportGuard();
  }

  async function initialize() {
    installRuntimeGuards();
    try {
      const response = await fetch(CONFIG.dataUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Road data request failed: ${response.status}`);
      state.geojson = await response.json();
      buildRoadIndex(state.geojson);
      state.status = 'ready';
      updateStatusText();
      snapVehicleToRoad(CONFIG.spawnSnapDistance);
      readyResolve({ segmentCount: state.segments.length });
      window.dispatchEvent(new CustomEvent('ptbo-road-collision-ready', { detail: { segmentCount: state.segments.length } }));
    } catch (error) {
      console.error('Road boundary system could not start.', error);
      state.status = 'failed';
      state.enabled = false;
      updateStatusText();
      readyReject(error);
    }
  }

  window.PTBO_ROAD_COLLISION = Object.freeze({
    ready,
    state,
    isPointDrivable,
    resolveMovement,
    snapVehicleToRoad,
    nearestRoad(lat, lng, searchRadius = 45) {
      const point = toXY(lat, lng);
      const nearest = nearestRoadXY(point.x, point.y, searchRadius);
      if (!nearest) return null;
      const latLng = toLatLng(nearest.x, nearest.y);
      return { ...latLng, distance: nearest.distance, road: nearest.segment.name, highway: nearest.segment.highway };
    },
  });

  initialize();
})();
