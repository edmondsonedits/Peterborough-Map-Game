/** Pure endpoint analysis for clipping road paint before connected junctions.
 * Input segments use the city-explorer sampled-road shape. This module never
 * changes source geometry, road widths, topology, or driving surfaces.
 */

const DEFAULTS = Object.freeze({ nodeSnapMetres: 0.12, heightTolerance: 0.35,
  directionToleranceRadians: 0.16, minimumTrimMetres: 2.4,
  maximumTrimMetres: 9, angularClearance: 0.82 });

function finite(value) { return Number.isFinite(Number(value)); }
function endpointPoint(segment, endpoint) { return endpoint === 'a' ? segment.a : segment.b; }
function endpointHeight(segment, endpoint) { return Number(endpoint === 'a' ? segment.aY : segment.bY); }
function endpointSourceVertex(segment, endpoint) { return endpoint === 'a' ? segment.aSourceVertex : segment.bSourceVertex; }
function lengthOf(segment) {
  const dx = Number(segment.b?.x) - Number(segment.a?.x);
  const dz = Number(segment.b?.y) - Number(segment.a?.y);
  return Math.hypot(dx, dz);
}
function endpointDirection(segment, endpoint) {
  const sign = endpoint === 'a' ? 1 : -1;
  const dx = (Number(segment.b?.x) - Number(segment.a?.x)) * sign;
  const dz = (Number(segment.b?.y) - Number(segment.a?.y)) * sign;
  const length = Math.hypot(dx, dz);
  return length > 1e-5 ? { x: dx / length, z: dz / length } : null;
}
function layerOf(segment) {
  const value = Number.parseFloat(segment.tags?.layer);
  return Number.isFinite(value) ? value : 0;
}
function isPaintJoinEligible(segment) {
  const profile = segment.profile || {};
  return !profile.tunnel && !profile.unpaved && !profile.parkingAisle
    && !segment.tunnel && segment.tags?.tunnel !== 'yes';
}
function nodeKey(point, height, layer, snap) {
  return `${Math.round(Number(point.x) / snap)}:${Math.round(Number(point.y) / snap)}:${Math.round(height / 0.25)}:${layer}`;
}
function chainCoordinate(segment, endpoint) {
  const start = Number(segment.chainStart || 0);
  return start + (endpoint === 'b' ? lengthOf(segment) : 0);
}

/** Build same-grade shared-node context and line-chain paint cut ranges. */
export function createRoadMarkingContext(segments = [], options = {}) {
  const config = { ...DEFAULTS, ...options };
  if (![config.nodeSnapMetres, config.heightTolerance, config.directionToleranceRadians,
    config.minimumTrimMetres, config.maximumTrimMetres, config.angularClearance]
    .every(Number.isFinite) || config.nodeSnapMetres <= 0 || config.heightTolerance <= 0
    || config.directionToleranceRadians <= 0 || config.minimumTrimMetres < 0
    || config.maximumTrimMetres < config.minimumTrimMetres || config.angularClearance <= 0) {
    throw new TypeError('Invalid road marking context options');
  }
  const nodes = new Map();
  const segmentLengths = new Map();
  for (const segment of segments) {
    const length = lengthOf(segment);
    segmentLengths.set(segment, length);
    if (!isPaintJoinEligible(segment) || !segment.lineId || length < 0.2
      || !finite(segment.width) || Number(segment.width) <= 0) continue;
    for (const endpoint of ['a', 'b']) {
      const point = endpointPoint(segment, endpoint), height = endpointHeight(segment, endpoint);
      if (!endpointSourceVertex(segment, endpoint) || !point || !finite(point.x) || !finite(point.y) || !finite(height)) continue;
      const direction = endpointDirection(segment, endpoint);
      if (!direction) continue;
      const layer = layerOf(segment), key = nodeKey(point, height, layer, config.nodeSnapMetres);
      if (!nodes.has(key)) nodes.set(key, { key, x: Number(point.x), z: Number(point.y), height, layer, arms: [] });
      const node = nodes.get(key);
      // Quantization locates candidates; these checks prevent nearby or
      // vertically separated roads from becoming a fabricated connection.
      if (Math.hypot(node.x - Number(point.x), node.z - Number(point.y)) > config.nodeSnapMetres * 1.5
        || Math.abs(node.height - height) > config.heightTolerance) continue;
      node.arms.push({ segment, endpoint, direction, width: Number(segment.width),
        lineId: String(segment.lineId), chain: chainCoordinate(segment, endpoint),
        chainSign: endpoint === 'a' ? 1 : -1 });
    }
  }

  const cutsByLine = new Map();
  const curbCutsByLineSide = new Map();
  const junctions = [];
  for (const node of nodes.values()) {
    // Merge duplicate arms from the same physical way direction, but retain
    // distinct near-parallel ways so they cannot turn a continuation into a fork.
    const arms = [];
    for (const arm of node.arms) {
      const duplicate = arms.find(candidate => Math.acos(Math.max(-1, Math.min(1, candidate.direction.x * arm.direction.x
          + candidate.direction.z * arm.direction.z))) < config.directionToleranceRadians);
      if (duplicate) {
        if (arm.width > duplicate.width) Object.assign(duplicate, arm);
      } else arms.push(arm);
    }
    // A T or four-way branch has three or more distinct arms for curb access.
    // Public-road paint requires three public arms: a service driveway may
    // open a curb but must not erase the public road's centerline or cycle lane.
    if (arms.length < 3) continue;
    const sorted = [...arms].sort((a, b) => Math.atan2(a.direction.z, a.direction.x) - Math.atan2(b.direction.z, b.direction.x));
    const publicArms = sorted.filter(arm => arm.segment.profile?.renderClass !== 'service');
    const trimDistances = [];
    const trimFor = (arm, group, index) => {
      const before = group[(index - 1 + group.length) % group.length];
      const after = group[(index + 1) % group.length];
      const angleTo = other => Math.acos(Math.max(-1, Math.min(1,
        arm.direction.x * other.direction.x + arm.direction.z * other.direction.z)));
      const halfMouth = Math.max(before.width, after.width) / 2;
      const halfArm = arm.width / 2;
      const acuteFactor = Math.max(0.45, Math.min(1.8,
        1 / Math.max(0.55, Math.sin(Math.min(angleTo(before), angleTo(after)) / 2))));
      return Math.min(config.maximumTrimMetres, Math.max(config.minimumTrimMetres,
        (halfArm + halfMouth) * config.angularClearance * acuteFactor));
    };
    for (let index = 0; index < sorted.length; index += 1) {
      const arm = sorted[index];
      const trim = trimFor(arm, sorted, index);
      trimDistances.push({ lineId: arm.lineId, endpoint: arm.endpoint, distance: trim });
      const start = arm.chain + Math.min(0, arm.chainSign * trim);
      const end = arm.chain + Math.max(0, arm.chainSign * trim);
      const publicIndex = publicArms.indexOf(arm);
      if (publicArms.length >= 3 && publicIndex >= 0) {
        const paintTrim = trimFor(arm, publicArms, publicIndex);
        const paintStart = arm.chain + Math.min(0, arm.chainSign * paintTrim);
        const paintEnd = arm.chain + Math.max(0, arm.chainSign * paintTrim);
        if (!cutsByLine.has(arm.lineId)) cutsByLine.set(arm.lineId, []);
        cutsByLine.get(arm.lineId).push({ start: paintStart, end: paintEnd, nodeKey: node.key });
      }

      // Curbs occupy one side of the way. Open only the side facing a
      // connected cross arm; a collinear continuation must not remove the
      // far-side curb of a T junction.
      const length = lengthOf(arm.segment);
      const dx = (Number(arm.segment.b?.x) - Number(arm.segment.a?.x)) / length;
      const dz = (Number(arm.segment.b?.y) - Number(arm.segment.a?.y)) / length;
      const rightNormal = { x: dz, z: -dx };
      const sideSet = new Set();
      for (const other of arms) {
        if (other === arm) continue;
        const dot = other.direction.x * rightNormal.x + other.direction.z * rightNormal.z;
        if (dot > Math.sin(config.directionToleranceRadians)) sideSet.add(1);
        else if (dot < -Math.sin(config.directionToleranceRadians)) sideSet.add(-1);
      }
      for (const side of sideSet) {
        if (!curbCutsByLineSide.has(arm.lineId)) curbCutsByLineSide.set(arm.lineId, new Map());
        const cutsBySide = curbCutsByLineSide.get(arm.lineId);
        if (!cutsBySide.has(side)) cutsBySide.set(side, []);
        cutsBySide.get(side).push({ start, end, nodeKey: node.key, side });
      }
    }
    junctions.push({ key: node.key, x: node.x, z: node.z, height: node.height,
      armCount: arms.length, trimDistances });
  }
  for (const cuts of cutsByLine.values()) cuts.sort((a, b) => a.start - b.start || a.end - b.end);
  for (const sides of curbCutsByLineSide.values()) {
    for (const cuts of sides.values()) cuts.sort((a, b) => a.start - b.start || a.end - b.end);
  }
  return Object.freeze({ segments, segmentLengths, cutsByLine, curbCutsByLineSide, junctions, options: config });
}

/** Return local [start,end] paint distances for one sampled segment. */
export function roadMarkingIntervals(context, segment) {
  const length = context?.segmentLengths?.get(segment) ?? lengthOf(segment);
  if (!Number.isFinite(length) || length <= 0) return [];
  const chainStart = Number(segment.chainStart || 0), chainEnd = chainStart + length;
  let intervals = [[0, length]];
  for (const cut of context?.cutsByLine?.get(String(segment.lineId)) || []) {
    const localStart = Math.max(0, cut.start - chainStart);
    const localEnd = Math.min(length, cut.end - chainStart);
    if (localEnd <= localStart) continue;
    const next = [];
    for (const [start, end] of intervals) {
      if (localEnd <= start || localStart >= end) next.push([start, end]);
      else {
        if (localStart - start > 1e-5) next.push([start, localStart]);
        if (end - localEnd > 1e-5) next.push([localEnd, end]);
      }
    }
    intervals = next;
  }
  return intervals.map(([start, end]) => [Math.max(0, start), Math.min(length, end)])
    .filter(([start, end]) => end - start > 0.05);
}

/** Return local [start,end] curb distances, clipped only on the requested side. */
export function roadCurbIntervals(context, segment, side) {
  if (side !== -1 && side !== 1) throw new TypeError('Curb side must be -1 or 1');
  const length = context?.segmentLengths?.get(segment) ?? lengthOf(segment);
  if (!Number.isFinite(length) || length <= 0) return [];
  const chainStart = Number(segment.chainStart || 0), chainEnd = chainStart + length;
  let intervals = [[0, length]];
  const cuts = context?.curbCutsByLineSide?.get(String(segment.lineId))?.get(side) || [];
  for (const cut of cuts) {
    const localStart = Math.max(0, cut.start - chainStart);
    const localEnd = Math.min(length, cut.end - chainStart);
    if (localEnd <= localStart) continue;
    const next = [];
    for (const [start, end] of intervals) {
      if (localEnd <= start || localStart >= end) next.push([start, end]);
      else {
        if (localStart - start > 1e-5) next.push([start, localStart]);
        if (end - localEnd > 1e-5) next.push([localEnd, end]);
      }
    }
    intervals = next;
  }
  return intervals.map(([start, end]) => [Math.max(0, start), Math.min(length, end)])
    .filter(([start, end]) => end - start > 0.05);
}
