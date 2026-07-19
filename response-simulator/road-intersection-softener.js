(() => {
  'use strict';

  if (window.PTBO_ROAD_INTERSECTION_SOFTENER) return;

  const CONFIG = Object.freeze({
    laneAssistDefault: 0.60,
    gridSize: 80,
    endpointPrecisionMeters: 0.25,
    minimumJunctionAngleDegrees: 18,
    maximumJunctionAngleDegrees: 162,
    minimumRadiusMeters: 7.5,
    maximumRadiusMeters: 18,
    radiusWidthMultiplier: 1.45,
    radiusPaddingMeters: 2.25,
    markerLengthMeters: 0.6,
  });

  const state = {
    installed: false,
    junctionCount: 0,
    originalSegmentCount: 0,
  };

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function endpointKey(x, y) {
    const scale = 1 / CONFIG.endpointPrecisionMeters;
    return `${Math.round(x * scale)},${Math.round(y * scale)}`;
  }

  function angularDifference(a, b) {
    return Math.abs(((a - b + 540) % 360) - 180);
  }

  function directionFor(dx, dy) {
    return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  }

  function registerEndpoint(nodes, x, y, segment, segmentIndex, outwardDx, outwardDy) {
    const key = endpointKey(x, y);
    let node = nodes.get(key);
    if (!node) {
      node = { xTotal: 0, yTotal: 0, samples: 0, incidents: [] };
      nodes.set(key, node);
    }
    const length = Math.hypot(outwardDx, outwardDy);
    if (length <= 0) return;
    node.xTotal += x;
    node.yTotal += y;
    node.samples += 1;
    node.incidents.push({
      segment,
      segmentIndex,
      direction: directionFor(outwardDx, outwardDy),
      unitX: outwardDx / length,
      unitY: outwardDy / length,
    });
  }

  function uniqueDirections(incidents) {
    const directions = [];
    incidents.forEach(incident => {
      if (!directions.some(direction => angularDifference(direction, incident.direction) < 12)) {
        directions.push(incident.direction);
      }
    });
    return directions;
  }

  function isRoadJunction(node) {
    if (node.incidents.length < 2) return false;
    const directions = uniqueDirections(node.incidents);
    if (directions.length >= 3) return true;
    if (directions.length < 2) return false;

    const separation = angularDifference(directions[0], directions[1]);
    if (
      separation < CONFIG.minimumJunctionAngleDegrees
      || separation > CONFIG.maximumJunctionAngleDegrees
    ) return false;

    const featureIds = new Set(node.incidents.map(item => item.segment.featureIndex));
    const roadNames = new Set(node.incidents.map(item => item.segment.name).filter(Boolean));
    return featureIds.size >= 2 || roadNames.size >= 2;
  }

  function junctionRadius(node) {
    const widestAllowance = Math.max(...node.incidents.map(item => Number(item.segment.allowed) || 0));
    const directionBonus = Math.min(1.12, 1 + Math.max(0, uniqueDirections(node.incidents).length - 2) * 0.04);
    return clamp(
      (widestAllowance * CONFIG.radiusWidthMultiplier + CONFIG.radiusPaddingMeters) * directionBonus,
      CONFIG.minimumRadiusMeters,
      CONFIG.maximumRadiusMeters
    );
  }

  function dominantIncident(node) {
    return node.incidents.reduce((best, item) => {
      if (!best) return item;
      const itemScore = (Number(item.segment.allowed) || 0) * 1000 + (Number(item.segment.length) || 0);
      const bestScore = (Number(best.segment.allowed) || 0) * 1000 + (Number(best.segment.length) || 0);
      return itemScore > bestScore ? item : best;
    }, null);
  }

  function registerSyntheticSegment(roadState, segment, segmentIndex) {
    const padding = segment.allowed + 3;
    const minCellX = Math.floor((Math.min(segment.ax, segment.bx) - padding) / CONFIG.gridSize);
    const maxCellX = Math.floor((Math.max(segment.ax, segment.bx) + padding) / CONFIG.gridSize);
    const minCellY = Math.floor((Math.min(segment.ay, segment.by) - padding) / CONFIG.gridSize);
    const maxCellY = Math.floor((Math.max(segment.ay, segment.by) + padding) / CONFIG.gridSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const key = `${cellX},${cellY}`;
        const bucket = roadState.grid.get(key);
        if (bucket) bucket.push(segmentIndex);
        else roadState.grid.set(key, [segmentIndex]);
      }
    }
  }

  function addRoundedJunction(roadState, node, junctionIndex) {
    const centerX = node.xTotal / node.samples;
    const centerY = node.yTotal / node.samples;
    const radius = junctionRadius(node);
    const dominant = dominantIncident(node);
    const halfLength = CONFIG.markerLengthMeters / 2;
    const unitX = dominant?.unitX || 1;
    const unitY = dominant?.unitY || 0;
    const ax = centerX - unitX * halfLength;
    const ay = centerY - unitY * halfLength;
    const bx = centerX + unitX * halfLength;
    const by = centerY + unitY * halfLength;
    const dx = bx - ax;
    const dy = by - ay;

    const segment = {
      ax,
      ay,
      bx,
      by,
      dx,
      dy,
      lengthSq: dx * dx + dy * dy,
      length: CONFIG.markerLengthMeters,
      allowed: radius,
      width: radius * 2,
      featureIndex: -1000000 - junctionIndex,
      highway: 'intersection',
      name: 'Rounded intersection',
      syntheticIntersection: true,
      incidentCount: node.incidents.length,
    };

    const segmentIndex = roadState.segments.push(segment) - 1;
    registerSyntheticSegment(roadState, segment, segmentIndex);
  }

  function applyLaneAssistDefault(roadState) {
    roadState.laneAssist = CONFIG.laneAssistDefault;
    const assistInput = document.getElementById('road-assist');
    const assistValue = document.getElementById('road-assist-value');
    if (assistInput) assistInput.value = String(Math.round(CONFIG.laneAssistDefault * 100));
    if (assistValue) assistValue.textContent = `${Math.round(CONFIG.laneAssistDefault * 100)}%`;
  }

  function softenIntersections(roadState) {
    if (state.installed || !Array.isArray(roadState.segments) || !roadState.grid) return;
    if (roadState.segments.some(segment => segment.syntheticIntersection)) {
      state.installed = true;
      applyLaneAssistDefault(roadState);
      return;
    }

    const originalSegments = roadState.segments.slice();
    const nodes = new Map();
    originalSegments.forEach((segment, segmentIndex) => {
      registerEndpoint(nodes, segment.ax, segment.ay, segment, segmentIndex, segment.dx, segment.dy);
      registerEndpoint(nodes, segment.bx, segment.by, segment, segmentIndex, -segment.dx, -segment.dy);
    });

    state.originalSegmentCount = originalSegments.length;
    let junctionIndex = 0;
    nodes.forEach(node => {
      if (!isRoadJunction(node)) return;
      addRoundedJunction(roadState, node, junctionIndex);
      junctionIndex += 1;
    });

    state.junctionCount = junctionIndex;
    state.installed = true;
    applyLaneAssistDefault(roadState);

    window.dispatchEvent(new CustomEvent('ptbo-road-intersections-softened', {
      detail: { junctionCount: state.junctionCount },
    }));
  }

  function install() {
    const roadSystem = window.PTBO_ROAD_COLLISION;
    if (!roadSystem) {
      setTimeout(install, 60);
      return;
    }

    applyLaneAssistDefault(roadSystem.state);
    roadSystem.ready
      .then(() => softenIntersections(roadSystem.state))
      .catch(() => {});
  }

  window.PTBO_ROAD_INTERSECTION_SOFTENER = Object.freeze({
    state,
    config: CONFIG,
  });

  install();
})();