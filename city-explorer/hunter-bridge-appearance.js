const BRIDGE_LINE_IDS = new Set(['33954231', '177049271']);
const TRAFFIC_WIDTH_ESTIMATE = 7.15;
const SIDEWALK_WIDTH_ESTIMATE = 1.5;
const CURB_REVEAL_ESTIMATE = 0.12;
const CURB_WIDTH_ESTIMATE = 0.12;
const RAILING_HEIGHT_ESTIMATE = 1.12;
const PANEL_PITCH_ESTIMATE = 2.45;
const LAMP_SPACING_ESTIMATE = 33;
const BRIDGE_EDGE_MARGIN_ESTIMATE = 0.06;
const RAILING_HALF_WIDTH_ESTIMATE = 0.19;

function lineIdNumber(lineId) {
  const match = /(?:^|\/)(\d+)(?::\d+)?$/.exec(String(lineId ?? ''));
  return match?.[1] || '';
}

function ringPoints(input) {
  if (!Array.isArray(input)) return [];
  const ring = Array.isArray(input[0]) ? input[0] : input;
  return ring.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
}

function containsPoint(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function rayEdgeDistance(point, normal, ring, sign) {
  let nearest = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const denominator = normal.x * ey - normal.z * ex;
    if (Math.abs(denominator) < 1e-8) continue;
    const ax = a.x - point.x, ay = a.y - point.y;
    const rayT = (ax * ey - ay * ex) / denominator;
    const edgeT = (ax * normal.z - ay * normal.x) / denominator;
    if (rayT * sign > 1e-5 && edgeT >= -1e-6 && edgeT <= 1 + 1e-6) nearest = Math.min(nearest, Math.abs(rayT));
  }
  return nearest;
}

function addQuad(buckets, bucket, a, b, c, d) {
  const out = buckets[bucket];
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}

function addOrientedBox(buckets, bucket, center, tangent, normal, halfLength, halfWidth, bottomY, topY) {
  if (![center.x, center.y, center.z, tangent.x, tangent.z, normal.x, normal.z, halfLength, halfWidth, bottomY, topY].every(Number.isFinite)) return;
  // The opposite parapet reflects the normal. Retain outward face winding
  // (a reflected basis otherwise makes its concrete appear hollow).
  if (tangent.x * normal.z - tangent.z * normal.x < 0) tangent = { x: -tangent.x, z: -tangent.z };
  const corner = (along, across, y) => [center.x + tangent.x * along + normal.x * across, y, center.z + tangent.z * along + normal.z * across];
  const bottomNegativeLeft = corner(-halfLength, -halfWidth, bottomY);
  const bottomNegativeRight = corner(halfLength, -halfWidth, bottomY);
  const bottomPositiveRight = corner(halfLength, halfWidth, bottomY);
  const bottomPositiveLeft = corner(-halfLength, halfWidth, bottomY);
  const topNegativeLeft = corner(-halfLength, -halfWidth, topY);
  const topNegativeRight = corner(halfLength, -halfWidth, topY);
  const topPositiveRight = corner(halfLength, halfWidth, topY);
  const topPositiveLeft = corner(-halfLength, halfWidth, topY);
  addQuad(buckets, bucket, bottomNegativeLeft, topNegativeLeft, topNegativeRight, bottomNegativeRight);
  addQuad(buckets, bucket, bottomPositiveLeft, bottomPositiveRight, topPositiveRight, topPositiveLeft);
  addQuad(buckets, bucket, bottomNegativeRight, topNegativeRight, topPositiveRight, bottomPositiveRight);
  addQuad(buckets, bucket, bottomNegativeLeft, bottomPositiveLeft, topPositiveLeft, topNegativeLeft);
  addQuad(buckets, bucket, topNegativeLeft, topPositiveLeft, topPositiveRight, topNegativeRight);
  addQuad(buckets, bucket, bottomNegativeLeft, bottomNegativeRight, bottomPositiveRight, bottomPositiveLeft);
}
function addDisk(buckets, center, tangent, normal, radius, y, offset) {
  const verts = buckets.green;
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a = Math.PI * 2 * i / steps, b = Math.PI * 2 * (i + 1) / steps;
    const point = angle => [
      center.x + tangent.x * Math.cos(angle) * radius + normal.x * offset,
      y + Math.sin(angle) * radius,
      center.z + tangent.z * Math.cos(angle) * radius + normal.z * offset,
    ];
    verts.push(center.x + normal.x * offset, y, center.z + normal.z * offset,
      ...point(a), ...point(b));
  }
}

function addMedallionRing(buckets, center, tangent, normal, outerRadius, innerRadius, y, offset, facing) {
  const verts = buckets.concrete;
  const steps = 24;
  const at = (angle, radius) => [
    center.x + tangent.x * Math.cos(angle) * radius + normal.x * offset,
    y + Math.sin(angle) * radius,
    center.z + tangent.z * Math.cos(angle) * radius + normal.z * offset,
  ];
  for (let i = 0; i < steps; i++) {
    const a = Math.PI * 2 * i / steps, b = Math.PI * 2 * (i + 1) / steps;
    const innerA = at(a, innerRadius), outerA = at(a, outerRadius);
    const innerB = at(b, innerRadius), outerB = at(b, outerRadius);
    if (facing > 0) verts.push(...innerA, ...outerA, ...outerB, ...innerA, ...outerB, ...innerB);
    else verts.push(...innerA, ...outerB, ...outerA, ...innerA, ...innerB, ...outerB);
  }
}

function orientConnectedSegments(segments) {
  const remaining = segments.map(segment => ({ ...segment }));
  const ordered = [];
  while (remaining.length) {
    const hasNeighborAt = (segment, point) => remaining.some(candidate => candidate !== segment
      && (Math.hypot(candidate.a.x - point.x, candidate.a.y - point.z) < 1.25
        || Math.hypot(candidate.b.x - point.x, candidate.b.y - point.z) < 1.25));
    let startIndex = remaining.findIndex(segment => !hasNeighborAt(segment, { x: segment.a.x, z: segment.a.y }));
    let startAtEnd = false;
    if (startIndex < 0) {
      startIndex = remaining.findIndex(segment => !hasNeighborAt(segment, { x: segment.b.x, z: segment.b.y }));
      startAtEnd = startIndex >= 0;
    }
    if (startIndex < 0) startIndex = 0;
    let current = remaining.splice(startIndex, 1)[0];
    if (startAtEnd) current = { ...current, a: current.b, b: current.a, aY: current.bY, bY: current.aY };
    ordered.push(current);
    let end = { x: current.b.x, z: current.b.y };
    while (remaining.length) {
      let nearestIndex = -1, reverse = false, nearestDistance = 1.25;
      for (let index = 0; index < remaining.length; index++) {
        const segment = remaining[index];
        const startDistance = Math.hypot(segment.a.x - end.x, segment.a.y - end.z);
        const endDistance = Math.hypot(segment.b.x - end.x, segment.b.y - end.z);
        if (startDistance < nearestDistance) { nearestIndex = index; reverse = false; nearestDistance = startDistance; }
        if (endDistance < nearestDistance) { nearestIndex = index; reverse = true; nearestDistance = endDistance; }
      }
      if (nearestIndex < 0) break;
      current = remaining.splice(nearestIndex, 1)[0];
      if (reverse) current = { ...current, a: current.b, b: current.a, aY: current.bY, bY: current.aY };
      ordered.push(current);
      end = { x: current.b.x, z: current.b.y };
    }
  }
  return ordered;
}

function addSlopedCurb(buckets, before, after, normal, sideSign, innerDistance, width) {
  const n = { x: normal.x * sideSign, z: normal.z * sideSign };
  const corner = (sample, distance, rise = 0) => [sample.x + n.x * distance, sample.y + rise, sample.z + n.z * distance];
  const a = corner(before, innerDistance), b = corner(after, innerDistance);
  const c = corner(after, innerDistance + width), d = corner(before, innerDistance + width);
  const at = corner(before, innerDistance, CURB_REVEAL_ESTIMATE), bt = corner(after, innerDistance, CURB_REVEAL_ESTIMATE);
  const ct = corner(after, innerDistance + width, CURB_REVEAL_ESTIMATE), dt = corner(before, innerDistance + width, CURB_REVEAL_ESTIMATE);
  const quad = (a,b,c,d) => sideSign > 0 ? addQuad(buckets,'curb',a,b,c,d) : addQuad(buckets,'curb',d,c,b,a);
  quad(a, at, bt, b);
  quad(d, c, ct, dt);
  quad(at, dt, ct, bt);
  quad(a, b, c, d);
  quad(a, d, dt, at);
  quad(b, bt, ct, c);
}

function addSlopedSidewalk(buckets, before, after, normal, sideSign, innerBefore, innerAfter, outerBefore, outerAfter, lift) {
  const n = { x: normal.x * sideSign, z: normal.z * sideSign };
  const corner = (sample, distance) => [sample.x + n.x * distance, sample.y + lift, sample.z + n.z * distance];
  const a = corner(before, innerBefore), b = corner(after, innerAfter);
  const c = corner(after, outerAfter), d = corner(before, outerBefore);
  if (sideSign > 0) addQuad(buckets, 'sidewalk', a, d, c, b);
  else addQuad(buckets, 'sidewalk', b, c, d, a);
}

function interpolateSamples(samples, t) {
  if (!samples.length) return null;
  let before = samples[0], after = samples[samples.length - 1];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].t >= t) { before = samples[i - 1]; after = samples[i]; break; }
  }
  const span = after.t - before.t;
  const amount = span > 1e-8 ? Math.max(0, Math.min(1, (t - before.t) / span)) : 0;
  return {
    x: before.x + (after.x - before.x) * amount,
    z: before.z + (after.z - before.z) * amount,
    y: before.y + (after.y - before.y) * amount,
    t,
    edgeLeft: before.station.edgeLeft + (after.station.edgeLeft - before.station.edgeLeft) * amount,
    edgeRight: before.station.edgeRight + (after.station.edgeRight - before.station.edgeRight) * amount,
  };
}

function addGlobe(buckets, center, radius) {
  const verts = buckets.globe;
  const rows = 7, cols = 12;
  for (let row = 0; row < rows; row++) {
    const phi0 = Math.PI * row / rows, phi1 = Math.PI * (row + 1) / rows;
    for (let col = 0; col < cols; col++) {
      const theta0 = Math.PI * 2 * col / cols, theta1 = Math.PI * 2 * (col + 1) / cols;
      const at = (phi, theta) => [center.x + radius * Math.sin(phi) * Math.cos(theta), center.y + radius * Math.cos(phi), center.z + radius * Math.sin(phi) * Math.sin(theta)];
      addQuad(buckets, 'globe', at(phi0, theta0), at(phi1, theta0), at(phi1, theta1), at(phi0, theta1));
    }
  }
}

function pushSurface(buckets, points) {
  const [a, b, c, d] = points;
  addQuad(buckets, 'concrete', a, d, c, b);
}

function makeMesh(THREE, group, name, positions, color, options = {}) {
  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, side: options.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = true;
  mesh.userData = { collision: false, appearanceOnly: true };
  group.add(mesh);
}

/**
 * Builds low-cost, non-colliding bridge-top detailing from source road segments.
 * All sizes below are visual estimates: 7.15 m traffic width follows the supplied
 * OSM width; at least 1.5 m clear walk width, 0.12 m curb, 1.12 m parapet, 2.45 m panel pitch,
 * 33 m lamp spacing and the remaining concrete part sizes are appearance estimates.
 * The official footprint controls both lateral edges; no deck plane or arch is added.
 */
export function createHunterBridgeAppearance({ THREE, segments = [], bridgeRing, lowPower = false } = {}) {
  if (!THREE?.Group || !THREE?.BufferGeometry || !THREE?.Float32BufferAttribute || !THREE?.MeshStandardMaterial) throw new TypeError('THREE geometry constructors are required');
  const group = new THREE.Group();
  group.name = 'HunterBridgeAppearance';
  group.userData = { type: 'bridge-appearance', collision: false, appearanceOnly: true, bridgeStations: [], medallionMarks: [], estimates: { trafficWidth: TRAFFIC_WIDTH_ESTIMATE, sidewalkWidth: SIDEWALK_WIDTH_ESTIMATE, curbReveal: CURB_REVEAL_ESTIMATE, railingHeight: RAILING_HEIGHT_ESTIMATE, panelPitch: PANEL_PITCH_ESTIMATE, lampSpacing: LAMP_SPACING_ESTIMATE } };
  const ring = ringPoints(bridgeRing);
  if (ring.length < 3) return group;

  const buckets = { concrete: [], curb: [], sidewalk: [], recess: [], green: [], dark: [], globe: [] };
  const lampMarks = [];
  const postCenters = [];
  const roadHalfWidth = TRAFFIC_WIDTH_ESTIMATE / 2;
  const supportedInput = (Array.isArray(segments) ? segments : []).filter(segment => BRIDGE_LINE_IDS.has(lineIdNumber(segment?.lineId))
    && [segment?.a?.x, segment?.a?.y, segment?.b?.x, segment?.b?.y, segment?.aY, segment?.bY, segment?.width].every(Number.isFinite));
  const firstSegment = supportedInput[0];
  const firstLength = firstSegment ? Math.hypot(firstSegment.b.x - firstSegment.a.x, firstSegment.b.y - firstSegment.a.y) : 0;
  const lampAxis = firstLength > 0 ? { x: (firstSegment.b.x - firstSegment.a.x) / firstLength, z: (firstSegment.b.y - firstSegment.a.y) / firstLength } : { x: 1, z: 0 };
  const lampOrigin = firstSegment ? { x: firstSegment.a.x, z: firstSegment.a.y } : { x: 0, z: 0 };
  const projectLampAxis = point => (point.x - lampOrigin.x) * lampAxis.x + (point.y - lampOrigin.z) * lampAxis.z;
  const byWay = new Map();
  for (const segment of supportedInput) {
    const wayId = lineIdNumber(segment.lineId);
    if (!byWay.has(wayId)) byWay.set(wayId, []);
    byWay.get(wayId).push(segment);
  }
  const supported = [];
  for (const wayId of [...byWay.keys()].sort()) {
    let ordered = orientConnectedSegments(byWay.get(wayId));
    if (ordered.length && projectLampAxis(ordered[ordered.length - 1].b) < projectLampAxis(ordered[0].a)) {
      ordered = ordered.reverse().map(segment => ({ ...segment, a: segment.b, b: segment.a, aY: segment.bY, bY: segment.aY }));
    }
    let pathDistance = ordered.length ? projectLampAxis(ordered[0].a) : 0;
    for (const segment of ordered) {
      const length = Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
      supported.push({ ...segment, pathStart: pathDistance, pathLength: length, wayId });
      pathDistance += length;
    }
  }

  supported.forEach(segment => {
    const dx = segment.b.x - segment.a.x, dz = segment.b.y - segment.a.y;
    const planarLength = Math.hypot(dx, dz);
    if (planarLength < 0.2) return;
    const tangent = { x: dx / planarLength, z: dz / planarLength };
    const normal = { x: -tangent.z, z: tangent.x };
    const steps = Math.max(1, Math.ceil(planarLength / (lowPower ? 4.9 : PANEL_PITCH_ESTIMATE)));
    const get = t => ({ x: segment.a.x + dx * t, z: segment.a.y + dz * t, y: segment.aY + (segment.bY - segment.aY) * t });
    const samples = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, point = get(t), ringPoint = { x: point.x, y: point.z };
      if (!containsPoint(ringPoint, ring)) continue;
      const left = rayEdgeDistance(ringPoint, normal, ring, 1);
      const right = rayEdgeDistance(ringPoint, normal, ring, -1);
      if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
      const sideEdges = [left, right];
      const station = { lineId: String(segment.lineId), x: point.x, z: point.z, y: point.y, edgeLeft: left, edgeRight: right, insideRing: true, left: null, right: null };
      for (const [index, edgeDistance] of sideEdges.entries()) {
        const sign = index === 0 ? 1 : -1;
        const curbInner = roadHalfWidth;
        const sidewalkInner = curbInner + CURB_WIDTH_ESTIMATE;
        const railingCenter = edgeDistance - BRIDGE_EDGE_MARGIN_ESTIMATE - RAILING_HALF_WIDTH_ESTIMATE;
        const sidewalkOuter = railingCenter - RAILING_HALF_WIDTH_ESTIMATE;
        const sidewalkWidth = Math.max(0, sidewalkOuter - sidewalkInner);
        const sideData = { trafficHalfWidth: roadHalfWidth, curbWidth: CURB_WIDTH_ESTIMATE, sidewalkInner, sidewalkOuter, sidewalkWidth, edgeDistance, railingCenter };
        station[index === 0 ? 'left' : 'right'] = sideData;
        const center = { x: point.x + normal.x * sign * railingCenter, y: point.y, z: point.z + normal.z * sign * railingCenter };
        if (!postCenters.some(p => Math.hypot(p.x-center.x,p.z-center.z)<0.22)) {
          addOrientedBox(buckets, 'concrete', center, tangent, {x:normal.x*sign,z:normal.z*sign}, 0.135, 0.19,
            point.y + CURB_REVEAL_ESTIMATE, point.y + RAILING_HEIGHT_ESTIMATE);
          postCenters.push(center);
        }
      }
      group.userData.bridgeStations.push(station);
      samples.push({ t, ...point, station });
    }

    for (let i = 1; i < samples.length; i++) {
      const before = samples[i - 1], after = samples[i];
      if (Math.hypot(after.x - before.x, after.z - before.z) > planarLength / steps * 1.5) continue;
      for (const side of ['left', 'right']) {
        const sideBefore = before.station[side], sideAfter = after.station[side];
        const sign = side === 'left' ? 1 : -1;
        addSlopedCurb(buckets, before, after, normal, sign, roadHalfWidth, CURB_WIDTH_ESTIMATE);
        if (sideBefore.sidewalkWidth > 0.2 && sideAfter.sidewalkWidth > 0.2) {
          addSlopedSidewalk(buckets, before, after, normal, sign, sideBefore.sidewalkInner, sideAfter.sidewalkInner, sideBefore.sidewalkOuter, sideAfter.sidewalkOuter, CURB_REVEAL_ESTIMATE + 0.012);
          group.userData.sidewalkSpans ??= [];
          group.userData.sidewalkSpans.push({ lineId: String(segment.lineId), side, fromY: before.y + CURB_REVEAL_ESTIMATE + 0.012, toY: after.y + CURB_REVEAL_ESTIMATE + 0.012, inner: sideBefore.sidewalkInner, outer: sideBefore.sidewalkOuter });
        }
        const edgeBefore = side === 'left' ? before.station.edgeLeft : before.station.edgeRight;
        const edgeAfter = side === 'left' ? after.station.edgeLeft : after.station.edgeRight;
        const n = { x: normal.x * sign, z: normal.z * sign };
        const place = (sample, distance) => ({ x: sample.x + n.x * distance, z: sample.z + n.z * distance, y: sample.y });
        const railStart = place(before, edgeBefore - BRIDGE_EDGE_MARGIN_ESTIMATE - RAILING_HALF_WIDTH_ESTIMATE), railEnd = place(after, edgeAfter - BRIDGE_EDGE_MARGIN_ESTIMATE - RAILING_HALF_WIDTH_ESTIMATE);
        const railMid = { x: (railStart.x + railEnd.x) / 2, z: (railStart.z + railEnd.z) / 2, y: (before.y + after.y) / 2 };
        const span = Math.hypot(railEnd.x - railStart.x, railEnd.z - railStart.z);
        if (span > 0.1) {
          const wallBottom = railMid.y + CURB_REVEAL_ESTIMATE, wallTop = railMid.y + RAILING_HEIGHT_ESTIMATE;
          const panelHalf = Math.max(0.08, span / 2 - 0.135);
          const panelCenter = { x: railMid.x - n.x * 0.01, y: railMid.y, z: railMid.z - n.z * 0.01 };
          const panelBottom = wallBottom + 0.39, panelTop = wallTop - 0.2, frameWidth = 0.075;
          addOrientedBox(buckets, 'concrete', railMid, tangent, n, span / 2, 0.15, wallBottom, wallBottom + 0.32);
          addOrientedBox(buckets, 'concrete', railMid, tangent, n, span / 2, 0.19, wallTop - 0.16, wallTop);
          addOrientedBox(buckets, 'recess', panelCenter, tangent, n, panelHalf * 0.72, 0.012, panelBottom, panelTop);
          addOrientedBox(buckets, 'concrete', panelCenter, tangent, n, panelHalf * 0.82, 0.045, panelBottom, panelBottom + frameWidth);
          addOrientedBox(buckets, 'concrete', panelCenter, tangent, n, panelHalf * 0.82, 0.045, panelTop - frameWidth, panelTop);
          for (const panelSide of [-1, 1]) {
            const frameCenter = { x: panelCenter.x + tangent.x * panelSide * panelHalf * 0.82, y: railMid.y, z: panelCenter.z + tangent.z * panelSide * panelHalf * 0.82 };
            addOrientedBox(buckets, 'concrete', frameCenter, tangent, n, frameWidth / 2, 0.045, panelBottom, panelTop);
          }
          if (!lowPower || i % 2 === 1) {
            const discCenter = { x: railMid.x, z: railMid.z };
            const centerY = (panelBottom + panelTop) / 2;
            const greenRadius = Math.min(0.135, panelHalf * 0.32);
            const ringInner = greenRadius + 0.012;
            const ringOuter = Math.min(0.185, panelHalf * 0.45);
            for (const face of ['inward', 'outward']) {
              const direction = face === 'inward' ? -1 : 1;
              const offset = direction * 0.205;
              addMedallionRing(buckets, discCenter, tangent, n, ringOuter, ringInner, centerY, offset, direction);
              addDisk(buckets, discCenter, tangent, n, greenRadius, centerY, offset);
              group.userData.medallionMarks.push({ lineId: String(segment.lineId), x: discCenter.x, z: discCenter.z, y: centerY, normalX: n.x, normalZ: n.z, face, normalOffset: offset, greenRadius, ringOuter });
            }
          }
        }
      }
    }

    const firstLamp = Math.ceil((segment.pathStart - LAMP_SPACING_ESTIMATE / 2) / LAMP_SPACING_ESTIMATE) * LAMP_SPACING_ESTIMATE + LAMP_SPACING_ESTIMATE / 2;
    for (let pathMark = firstLamp; pathMark <= segment.pathStart + planarLength + 1e-6; pathMark += LAMP_SPACING_ESTIMATE) {
      const t = (pathMark - segment.pathStart) / planarLength;
      if (t < -1e-6 || t > 1 + 1e-6 || !containsPoint({ x: segment.a.x + dx * t, y: segment.a.y + dz * t }, ring)) continue;
      const point = interpolateSamples(samples, t);
      if (!point) continue;
      for (const side of ['left', 'right']) {
        const edgeDistance = side === 'left' ? point.edgeLeft : point.edgeRight;
        const sign = side === 'left' ? 1 : -1;
        const n = { x: normal.x * sign, z: normal.z * sign };
        const center = { x: point.x + n.x * (edgeDistance - BRIDGE_EDGE_MARGIN_ESTIMATE - RAILING_HALF_WIDTH_ESTIMATE), y: point.y, z: point.z + n.z * (edgeDistance - BRIDGE_EDGE_MARGIN_ESTIMATE - RAILING_HALF_WIDTH_ESTIMATE) };
        if (lampMarks.some(mark => Math.hypot(mark.x - center.x, mark.z - center.z) < 1.1)) continue;
        const pierBase = 0.72, shaftHeight = 1.62, capHeight = 0.18;
        addOrientedBox(buckets, 'concrete', center, tangent, n, pierBase / 2, 0.43, point.y + CURB_REVEAL_ESTIMATE, point.y + CURB_REVEAL_ESTIMATE + 0.28);
        addOrientedBox(buckets, 'concrete', center, tangent, n, 0.25, 0.27, point.y + 0.4, point.y + 0.4 + shaftHeight);
        addOrientedBox(buckets, 'concrete', center, tangent, n, 0.37, 0.38, point.y + 0.4 + shaftHeight, point.y + 0.4 + shaftHeight + capHeight);
        const lampTop = point.y + 0.4 + shaftHeight + capHeight;
        addOrientedBox(buckets, 'dark', { x: center.x, y: point.y, z: center.z }, tangent, n, 0.055, 0.055, lampTop, lampTop + 1.55);
        addOrientedBox(buckets, 'dark', { x: center.x, y: point.y, z: center.z }, tangent, n, 0.2, 0.06, lampTop + 1.35, lampTop + 1.46);
        addGlobe(buckets, { x: center.x, y: lampTop + 1.55, z: center.z }, 0.17);
        lampMarks.push({ x: center.x, z: center.z, y: lampTop });
      }
    }
  });

  makeMesh(THREE, group, 'HunterBridgeConcrete', buckets.concrete, '#aaa69c');
  makeMesh(THREE, group, 'HunterBridgeCurb', buckets.curb, '#938f86');
  makeMesh(THREE, group, 'HunterBridgeSidewalk', buckets.sidewalk, '#b7b2a7');
  makeMesh(THREE, group, 'HunterBridgeRecessedPanels', buckets.recess, '#88877f');
  makeMesh(THREE, group, 'HunterBridgeGreenMedallions', buckets.green, '#4d6e55', { doubleSide: true });
  makeMesh(THREE, group, 'HunterBridgeLampStems', buckets.dark, '#262622', { doubleSide: true });
  makeMesh(THREE, group, 'HunterBridgeLampGlobes', buckets.globe, '#ded5bd', { doubleSide: true });
  group.userData.lampMarks = lampMarks;
  group.userData.postCenters = postCenters;
  group.userData.drawBatchCount = group.children.length;
  return group;
}
