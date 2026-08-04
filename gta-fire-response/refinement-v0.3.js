'use strict';

/* v0.3.0 refinement layer
   - Keeps Esri satellite imagery as the visible map.
   - Uses the OpenStreetMap road GeoJSON only as an invisible collision surface.
   - Makes the road surface tolerant of intersections, tiny geometry gaps, and
     neighbouring road segments without allowing the engine to cross buildings.
*/

const REFINED_ROAD_WIDTHS = Object.freeze({
  motorway: 27,
  motorway_link: 17,
  trunk: 24,
  trunk_link: 16,
  primary: 20,
  primary_link: 15,
  secondary: 18,
  secondary_link: 14,
  tertiary: 16,
  tertiary_link: 13,
  residential: 13.5,
  living_street: 12.5,
  unclassified: 12,
  service: 11.5,
  road: 12
});
const ROAD_EDGE_EPSILON = 0.75;
const ROAD_GAP_RECOVERY = 4.5;
const ROAD_SWEEP_STEP = 0.85;

// The firefighter now begins directly over the Station 1 map location.
player = { lat: STATION.lat, lng: STATION.lng, heading: 180, speed: 0 };

// Keep the original response-simulator fire-engine artwork, but render it much smaller.
truckSvg = function refinedTruckSvg() {
  return `
    <div class="truck-rotation-wrapper compact-engine" style="width:44px;height:13px;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(${truck.heading - 90}deg)">
      <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none" style="display:block">
        <rect x="2" y="3" width="96" height="24" rx="4" fill="#d9534f" stroke="#992222" stroke-width="1"/>
        <rect x="72" y="4" width="26" height="22" rx="2" fill="#c9302c"/>
        <rect x="89" y="5" width="4" height="20" rx="1" fill="#e0f7fa" opacity="0.9"/>
        <rect x="78" y="3.5" width="7" height="1.5" fill="#e0f7fa" opacity="0.9"/>
        <rect x="78" y="25" width="7" height="1.5" fill="#e0f7fa" opacity="0.9"/>
        <rect class="svg-light-blue" x="75" y="2" width="3" height="11" fill="#0022ff"/>
        <rect class="svg-light-red" x="75" y="17" width="3" height="11" fill="#ff0000"/>
        <rect x="30" y="5" width="38" height="20" fill="#666666" rx="1"/>
        <line x1="40" y1="5" x2="40" y2="25" stroke="#444" stroke-width="2"/>
        <line x1="50" y1="5" x2="50" y2="25" stroke="#444" stroke-width="2"/>
        <line x1="60" y1="5" x2="60" y2="25" stroke="#444" stroke-width="2"/>
        <rect x="4" y="4.5" width="22" height="6" fill="none" stroke="#dddddd" stroke-width="1.5"/>
        <line x1="9" y1="4.5" x2="9" y2="10.5" stroke="#dddddd"/>
        <line x1="14" y1="4.5" x2="14" y2="10.5" stroke="#dddddd"/>
        <line x1="19" y1="4.5" x2="19" y2="10.5" stroke="#dddddd"/>
        <rect x="4" y="19.5" width="22" height="6" fill="none" stroke="#dddddd" stroke-width="1.5"/>
        <line x1="9" y1="19.5" x2="9" y2="25.5" stroke="#dddddd"/>
        <line x1="14" y1="19.5" x2="14" y2="25.5" stroke="#dddddd"/>
        <line x1="19" y1="19.5" x2="19" y2="25.5" stroke="#dddddd"/>
      </svg>
    </div>`;
};

truckIcon = function refinedTruckIcon() {
  const active = mission === 'enroute' || mission === 'arrival' || mission === 'onscene';
  return L.divIcon({
    className: active ? 'truck-container siren-active' : 'truck-container',
    html: truckSvg(),
    iconSize: [48, 48],
    iconAnchor: [24, 24]
  });
};

// Wider, realistic center-line corridors are built from OSM geometry beneath the satellite layer.
roadWidth = function refinedRoadWidth(properties = {}) {
  const type = String(properties.highway || 'road').toLowerCase();
  let width = REFINED_ROAD_WIDTHS[type] || 12;
  const lanes = Number.parseFloat(properties.lanes);
  if (Number.isFinite(lanes)) width = Math.max(width, lanes * 4.25 + 2.5);
  return Math.min(32, Math.max(10.5, width));
};

function refinedRoadCandidates(x, y, searchRadius = 60) {
  const candidates = [];
  for (const index of nearbySegmentIndexes(x, y, searchRadius)) {
    const projection = projectPointToSegment(x, y, roads.segments[index]);
    projection.clearance = projection.distance - projection.segment.allowed;
    candidates.push(projection);
  }
  candidates.sort((a, b) => a.clearance - b.clearance || a.distance - b.distance);
  return candidates;
}

// Use the best corridor clearance, not merely the closest centre-line. This fixes
// false collisions where a narrow adjacent segment was closer than the road the truck occupied.
roadInfoAtXY = function refinedRoadInfoAtXY(x, y, searchRadius = 60) {
  const candidates = refinedRoadCandidates(x, y, searchRadius);
  const best = candidates[0] || null;
  return {
    drivable: Boolean(best && best.clearance <= ROAD_EDGE_EPSILON),
    nearest: best,
    clearance: best ? best.clearance : Infinity,
    candidates
  };
};

isSweepDrivable = function refinedSweepDrivable(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distance / ROAD_SWEEP_STEP));
  let recoverableSamples = 0;

  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    const info = roadInfoAtXY(from.x + dx * ratio, from.y + dy * ratio, 65);
    if (info.drivable) {
      recoverableSamples = 0;
      continue;
    }
    // Permit at most two tiny gaps in otherwise connected OSM geometry.
    if (info.clearance <= ROAD_GAP_RECOVERY && recoverableSamples < 2) {
      recoverableSamples += 1;
      continue;
    }
    return false;
  }
  return true;
};

applyLaneAssist = function refinedLaneAssist(point, speed) {
  if (Math.abs(speed) < 1) return point;
  const info = roadInfoAtXY(point.x, point.y, 60);
  if (!info.drivable || !info.nearest) return point;

  // At intersections several corridors overlap; do not pull toward an arbitrary branch.
  const overlapping = info.candidates.filter(candidate => candidate.clearance <= 1.5).length;
  if (overlapping >= 3) return point;

  const normalizedOffset = Math.min(1, info.nearest.distance / Math.max(1, info.nearest.segment.allowed));
  const correction = 0.012 * normalizedOffset;
  return {
    x: point.x + (info.nearest.x - point.x) * correction,
    y: point.y + (info.nearest.y - point.y) * correction
  };
};

function bestRoadSlide(previous, candidate, movementX, movementY, speed) {
  const indexes = new Set([
    ...nearbySegmentIndexes(previous.x, previous.y, 65),
    ...nearbySegmentIndexes(candidate.x, candidate.y, 65)
  ]);
  let best = null;

  for (const index of indexes) {
    const segment = roads.segments[index];
    if (!segment) continue;
    const tangentX = segment.dx / segment.length;
    const tangentY = segment.dy / segment.length;
    const along = movementX * tangentX + movementY * tangentY;
    if (Math.abs(along) < 0.02) continue;

    const slide = {
      x: previous.x + tangentX * along,
      y: previous.y + tangentY * along
    };
    const assisted = applyLaneAssist(slide, speed);
    if (!isSweepDrivable(previous, assisted)) continue;

    const progress = Math.hypot(assisted.x - previous.x, assisted.y - previous.y);
    const directionAgreement = Math.abs(along) / Math.max(0.001, Math.hypot(movementX, movementY));
    const score = progress + directionAgreement * 2;
    if (!best || score > best.score) best = { ...assisted, score, segment };
  }
  return best;
}

resolveRoadMovement = function refinedResolveRoadMovement(previousLat, previousLng, candidateLat, candidateLng, speed) {
  const previous = toXY(previousLat, previousLng);
  const candidate = toXY(candidateLat, candidateLng);
  const exitResult = resolveStationExitMovement(previous, candidate);
  if (exitResult) return exitResult;

  const previousInfo = roadInfoAtXY(previous.x, previous.y, ROAD_CONFIG.spawnSnapDistance);
  if (!previousInfo.drivable && previousInfo.nearest && previousInfo.nearest.distance <= ROAD_CONFIG.spawnSnapDistance) {
    return {
      ...toLatLng(previousInfo.nearest.x, previousInfo.nearest.y),
      blocked: false,
      snapped: true,
      segment: previousInfo.nearest.segment
    };
  }

  if (isSweepDrivable(previous, candidate)) {
    const assisted = applyLaneAssist(candidate, speed);
    return isSweepDrivable(previous, assisted)
      ? { ...toLatLng(assisted.x, assisted.y), blocked: false }
      : { ...toLatLng(candidate.x, candidate.y), blocked: false };
  }

  const candidateInfo = roadInfoAtXY(candidate.x, candidate.y, 70);
  if (candidateInfo.nearest && candidateInfo.clearance <= ROAD_GAP_RECOVERY) {
    // Blend toward the valid corridor rather than slamming the truck to a stop.
    const recovery = {
      x: candidate.x + (candidateInfo.nearest.x - candidate.x) * 0.48,
      y: candidate.y + (candidateInfo.nearest.y - candidate.y) * 0.48
    };
    if (isSweepDrivable(previous, recovery)) {
      return { ...toLatLng(recovery.x, recovery.y), blocked: false, corrected: true, segment: candidateInfo.nearest.segment };
    }
  }

  const movementX = candidate.x - previous.x;
  const movementY = candidate.y - previous.y;
  const slide = bestRoadSlide(previous, candidate, movementX, movementY, speed);
  if (slide) {
    return { ...toLatLng(slide.x, slide.y), blocked: false, slid: true, segment: slide.segment };
  }

  // Find the furthest safe point along this frame's movement. This avoids a full
  // stop when only the very end of a movement step touches the road edge.
  let low = 0;
  let high = 1;
  let safeRatio = 0;
  for (let iteration = 0; iteration < 7; iteration += 1) {
    const ratio = (low + high) / 2;
    const test = { x: previous.x + movementX * ratio, y: previous.y + movementY * ratio };
    if (isSweepDrivable(previous, test)) {
      safeRatio = ratio;
      low = ratio;
    } else {
      high = ratio;
    }
  }
  if (safeRatio >= 0.18) {
    const safe = { x: previous.x + movementX * safeRatio, y: previous.y + movementY * safeRatio };
    return { ...toLatLng(safe.x, safe.y), blocked: false, corrected: true };
  }

  return { lat: previousLat, lng: previousLng, blocked: true };
};

// Ensure every return-to-station cycle places the firefighter over the station.
const returnStationV020 = returnStation;
returnStation = function refinedReturnStation() {
  returnStationV020();
  player.lat = STATION.lat;
  player.lng = STATION.lng;
  player.heading = 180;
  playerMarker?.setLatLng([player.lat, player.lng]).setOpacity(1);
};
