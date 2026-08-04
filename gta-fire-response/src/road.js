import { ROAD_CONFIG, ROAD_WIDTHS, STATION } from './config.js';
import { angleDifference, clamp, lerp, normalizeHeading, toLatLng, toXY } from './math.js';

function testRoadGeoJSON() {
  const c = STATION;
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { highway: 'primary', name: 'Sherbrooke Test Road', lanes: 4 }, geometry: { type: 'LineString', coordinates: [[c.lng - .02, c.lat], [c.lng + .018, c.lat]] } },
      { type: 'Feature', properties: { highway: 'secondary', name: 'George Test Road', lanes: 2 }, geometry: { type: 'LineString', coordinates: [[c.lng, c.lat - .02], [c.lng, c.lat + .025]] } },
      { type: 'Feature', properties: { highway: 'residential', name: 'Wellington Test Road', lanes: 2 }, geometry: { type: 'LineString', coordinates: [[c.lng - .018, c.lat + .014], [c.lng + .006, c.lat + .014]] } },
      { type: 'Feature', properties: { highway: 'residential', name: 'Connector Test Road', lanes: 2 }, geometry: { type: 'LineString', coordinates: [[c.lng, c.lat], [c.lng - .014, c.lat + .014]] } }
    ]
  };
}

export function roadWidth(properties = {}) {
  const type = String(properties.highway || 'road').toLowerCase();
  let width = ROAD_WIDTHS[type] || ROAD_WIDTHS.road;
  const lanes = Number.parseFloat(properties.lanes);
  if (Number.isFinite(lanes)) width = Math.max(width, lanes * 4.15 + 2);
  return clamp(width, 10.5, 32);
}

export function projectPointToSegment(x, y, segment) {
  const t = clamp(((x - segment.ax) * segment.dx + (y - segment.ay) * segment.dy) / segment.lengthSq, 0, 1);
  const px = segment.ax + segment.dx * t;
  const py = segment.ay + segment.dy * t;
  return { x: px, y: py, t, distance: Math.hypot(x - px, y - py), segment };
}

export class RoadSystem {
  constructor({ testMode = false } = {}) {
    this.testMode = testMode;
    this.status = 'loading';
    this.error = null;
    this.segments = [];
    this.grid = new Map();
    this.adjacency = new Map();
    this.stationExit = null;
    this.lastCollision = null;
  }

  xy(lat, lng) { return toXY(lat, lng, ROAD_CONFIG.centerLat, ROAD_CONFIG.centerLng); }
  latLng(x, y) { return toLatLng(x, y, ROAD_CONFIG.centerLat, ROAD_CONFIG.centerLng); }

  async load() {
    this.status = 'loading';
    this.error = null;
    try {
      let geojson;
      if (this.testMode) geojson = testRoadGeoJSON();
      else {
        const response = await fetch(ROAD_CONFIG.dataUrl, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Road data request failed (${response.status})`);
        geojson = await response.json();
      }
      this.build(geojson);
      this.status = 'ready';
      return true;
    } catch (error) {
      this.status = 'failed';
      this.error = error;
      return false;
    }
  }

  build(geojson) {
    this.segments = [];
    this.grid = new Map();
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    features.forEach((feature, featureIndex) => {
      const geometry = feature?.geometry;
      const properties = feature?.properties || {};
      if (geometry?.type === 'LineString') this.addLine(geometry.coordinates, properties, featureIndex);
      if (geometry?.type === 'MultiLineString') geometry.coordinates.forEach(line => this.addLine(line, properties, featureIndex));
    });
    if (!this.segments.length) throw new Error('No drivable road segments found.');
    this.buildAdjacency();
  }

  addLine(coordinates, properties, featureIndex) {
    if (!Array.isArray(coordinates)) return;
    for (let index = 1; index < coordinates.length; index += 1) {
      const a = coordinates[index - 1];
      const b = coordinates[index];
      if (!Array.isArray(a) || !Array.isArray(b)) continue;
      const ap = this.xy(Number(a[1]), Number(a[0]));
      const bp = this.xy(Number(b[1]), Number(b[0]));
      const dx = bp.x - ap.x;
      const dy = bp.y - ap.y;
      const lengthSq = dx * dx + dy * dy;
      if (!Number.isFinite(lengthSq) || lengthSq < .25) continue;
      const width = roadWidth(properties);
      const allowed = width / 2 + ROAD_CONFIG.shoulderTolerance;
      const segment = {
        id: this.segments.length,
        featureIndex,
        ax: ap.x, ay: ap.y, bx: bp.x, by: bp.y, dx, dy, lengthSq,
        length: Math.sqrt(lengthSq), width, allowed,
        highway: properties.highway || 'road', name: properties.name || properties.ref || 'Unnamed road'
      };
      this.segments.push(segment);
      this.indexSegment(segment);
    }
  }

  indexSegment(segment) {
    const padding = segment.allowed + 5;
    const minX = Math.floor((Math.min(segment.ax, segment.bx) - padding) / ROAD_CONFIG.gridSize);
    const maxX = Math.floor((Math.max(segment.ax, segment.bx) + padding) / ROAD_CONFIG.gridSize);
    const minY = Math.floor((Math.min(segment.ay, segment.by) - padding) / ROAD_CONFIG.gridSize);
    const maxY = Math.floor((Math.max(segment.ay, segment.by) + padding) / ROAD_CONFIG.gridSize);
    for (let gx = minX; gx <= maxX; gx += 1) {
      for (let gy = minY; gy <= maxY; gy += 1) {
        const key = `${gx},${gy}`;
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key).push(segment.id);
      }
    }
  }

  buildAdjacency() {
    this.adjacency = new Map(this.segments.map(segment => [segment.id, []]));
    const endpointKey = (x, y) => `${Math.round(x / 4)},${Math.round(y / 4)}`;
    const endpoints = new Map();
    for (const segment of this.segments) {
      for (const endpoint of [{ x: segment.ax, y: segment.ay }, { x: segment.bx, y: segment.by }]) {
        const key = endpointKey(endpoint.x, endpoint.y);
        if (!endpoints.has(key)) endpoints.set(key, []);
        endpoints.get(key).push(segment.id);
      }
    }
    for (const ids of endpoints.values()) {
      for (const id of ids) {
        const list = this.adjacency.get(id);
        for (const other of ids) if (other !== id && !list.includes(other)) list.push(other);
      }
    }
  }

  nearbyIndexes(x, y, radius = ROAD_CONFIG.searchRadius) {
    const cells = Math.max(1, Math.ceil(radius / ROAD_CONFIG.gridSize));
    const cx = Math.floor(x / ROAD_CONFIG.gridSize);
    const cy = Math.floor(y / ROAD_CONFIG.gridSize);
    const indexes = new Set();
    for (let ox = -cells; ox <= cells; ox += 1) {
      for (let oy = -cells; oy <= cells; oy += 1) {
        const bucket = this.grid.get(`${cx + ox},${cy + oy}`);
        if (bucket) bucket.forEach(index => indexes.add(index));
      }
    }
    return indexes;
  }

  pointInfoXY(x, y, radius = ROAD_CONFIG.searchRadius) {
    let best = null;
    for (const index of this.nearbyIndexes(x, y, radius)) {
      const projection = projectPointToSegment(x, y, this.segments[index]);
      projection.clearance = projection.distance - projection.segment.allowed;
      if (!best || projection.clearance < best.clearance || (projection.clearance === best.clearance && projection.distance < best.distance)) best = projection;
    }
    return { drivable: Boolean(best && best.clearance <= .55), nearest: best, clearance: best?.clearance ?? Infinity };
  }

  footprintSamples(pose) {
    const halfLength = ROAD_CONFIG.truckLength / 2;
    const halfWidth = ROAD_CONFIG.truckWidth / 2;
    const radians = pose.heading * Math.PI / 180;
    const fx = Math.sin(radians);
    const fy = Math.cos(radians);
    const rx = Math.cos(radians);
    const ry = -Math.sin(radians);
    const center = this.xy(pose.lat, pose.lng);
    const offsets = [
      [0, 0], [halfLength, 0], [-halfLength, 0],
      [halfLength * .72, halfWidth], [halfLength * .72, -halfWidth],
      [-halfLength * .72, halfWidth], [-halfLength * .72, -halfWidth],
      [0, halfWidth], [0, -halfWidth]
    ];
    return offsets.map(([forward, right]) => ({
      x: center.x + fx * forward + rx * right,
      y: center.y + fy * forward + ry * right
    }));
  }

  footprintInfo(pose) {
    const samples = this.footprintSamples(pose);
    const details = samples.map(point => this.pointInfoXY(point.x, point.y));
    const invalid = details.filter(info => !info.drivable);
    const centerInfo = details[0];
    return { drivable: invalid.length === 0, invalidCount: invalid.length, centerInfo, details };
  }

  createStationExit(pose) {
    const start = this.xy(pose.lat, pose.lng);
    const info = this.pointInfoXY(start.x, start.y, ROAD_CONFIG.stationExitSearchDistance);
    if (!info.nearest || info.nearest.distance > ROAD_CONFIG.stationExitSearchDistance || info.drivable) {
      this.stationExit = null;
      return false;
    }
    const target = info.nearest;
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const lengthSq = dx * dx + dy * dy;
    this.stationExit = { ax: start.x, ay: start.y, bx: target.x, by: target.y, dx, dy, lengthSq, length: Math.sqrt(lengthSq) };
    return true;
  }

  insideStationExit(pose) {
    if (!this.stationExit) return false;
    const center = this.xy(pose.lat, pose.lng);
    const projection = projectPointToSegment(center.x, center.y, this.stationExit);
    if (this.pointInfoXY(center.x, center.y).drivable) {
      this.stationExit = null;
      return true;
    }
    return projection.distance <= ROAD_CONFIG.stationExitCorridorHalfWidth && projection.t >= -.02 && projection.t <= 1.08;
  }

  poseDrivable(pose) {
    if (this.stationExit && this.insideStationExit(pose)) return true;
    return this.footprintInfo(pose).drivable;
  }

  sweepDrivable(fromPose, toPose) {
    const a = this.xy(fromPose.lat, fromPose.lng);
    const b = this.xy(toPose.lat, toPose.lng);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const rotation = Math.abs(angleDifference(fromPose.heading, toPose.heading));
    const steps = Math.max(1, Math.ceil(distance / ROAD_CONFIG.sweepStep), Math.ceil(rotation / 8));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const pose = {
        ...this.latLng(lerp(a.x, b.x, t), lerp(a.y, b.y, t)),
        heading: normalizeHeading(fromPose.heading + angleDifference(fromPose.heading, toPose.heading) * t)
      };
      if (!this.poseDrivable(pose)) return false;
    }
    return true;
  }

  resolveMovement(fromPose, candidatePose, speed, laneAssistStrength = .08) {
    if (this.sweepDrivable(fromPose, candidatePose)) {
      const assisted = this.applyLaneAssist(candidatePose, speed, laneAssistStrength);
      return { pose: this.sweepDrivable(fromPose, assisted) ? assisted : candidatePose, blocked: false, collision: null };
    }

    const from = this.xy(fromPose.lat, fromPose.lng);
    const candidate = this.xy(candidatePose.lat, candidatePose.lng);
    const moveX = candidate.x - from.x;
    const moveY = candidate.y - from.y;
    let bestSlide = null;
    const indexes = new Set([...this.nearbyIndexes(from.x, from.y, 75), ...this.nearbyIndexes(candidate.x, candidate.y, 75)]);
    for (const index of indexes) {
      const segment = this.segments[index];
      const tx = segment.dx / segment.length;
      const ty = segment.dy / segment.length;
      const along = moveX * tx + moveY * ty;
      if (Math.abs(along) < .03) continue;
      const point = this.latLng(from.x + tx * along, from.y + ty * along);
      const slidePose = { ...point, heading: candidatePose.heading };
      if (!this.sweepDrivable(fromPose, slidePose)) continue;
      const progress = Math.abs(along);
      if (!bestSlide || progress > bestSlide.progress) bestSlide = { pose: slidePose, segment, progress };
    }
    if (bestSlide) {
      this.lastCollision = { type: 'slide', segment: bestSlide.segment };
      return { pose: bestSlide.pose, blocked: true, slid: true, collision: this.lastCollision };
    }

    let low = 0;
    let high = 1;
    let safe = 0;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const t = (low + high) / 2;
      const pose = {
        ...this.latLng(lerp(from.x, candidate.x, t), lerp(from.y, candidate.y, t)),
        heading: normalizeHeading(fromPose.heading + angleDifference(fromPose.heading, candidatePose.heading) * t)
      };
      if (this.sweepDrivable(fromPose, pose)) { safe = t; low = t; } else high = t;
    }
    const pose = safe > .04 ? {
      ...this.latLng(lerp(from.x, candidate.x, safe), lerp(from.y, candidate.y, safe)),
      heading: normalizeHeading(fromPose.heading + angleDifference(fromPose.heading, candidatePose.heading) * safe)
    } : { ...fromPose };
    const center = this.xy(pose.lat, pose.lng);
    const info = this.pointInfoXY(center.x, center.y);
    this.lastCollision = { type: 'edge', segment: info.nearest?.segment || null };
    return { pose, blocked: true, collision: this.lastCollision };
  }

  applyLaneAssist(pose, speed, strength) {
    if (Math.abs(speed) < 3 || strength <= 0) return pose;
    const center = this.xy(pose.lat, pose.lng);
    const candidates = [];
    for (const index of this.nearbyIndexes(center.x, center.y, 55)) {
      const projection = projectPointToSegment(center.x, center.y, this.segments[index]);
      projection.clearance = projection.distance - projection.segment.allowed;
      if (projection.clearance <= 1.2) candidates.push(projection);
    }
    if (!candidates.length || candidates.length >= 3) return pose;
    candidates.sort((a, b) => a.clearance - b.clearance);
    const nearest = candidates[0];
    const segmentHeading = normalizeHeading(Math.atan2(nearest.segment.dx, nearest.segment.dy) * 180 / Math.PI);
    const alignment = Math.min(Math.abs(angleDifference(pose.heading, segmentHeading)), Math.abs(angleDifference(pose.heading, segmentHeading + 180)));
    if (alignment > 34) return pose;
    const factor = clamp(strength * (Math.abs(speed) / 23) * .18, 0, .08);
    return { ...this.latLng(lerp(center.x, nearest.x, factor), lerp(center.y, nearest.y, factor)), heading: pose.heading };
  }

  nearestRoadPosition(lat, lng, radius = 100) {
    const point = this.xy(lat, lng);
    const info = this.pointInfoXY(point.x, point.y, radius);
    return info.nearest ? { ...this.latLng(info.nearest.x, info.nearest.y), segment: info.nearest.segment, distance: info.nearest.distance } : null;
  }

  debugInfo(pose) {
    const center = this.xy(pose.lat, pose.lng);
    const info = this.pointInfoXY(center.x, center.y);
    return {
      segment: info.nearest?.segment?.name || 'none',
      segmentId: info.nearest?.segment?.id ?? -1,
      distanceFromCenter: info.nearest?.distance ?? Infinity,
      clearance: info.clearance,
      footprintValid: this.footprintInfo(pose).drivable
    };
  }
}
