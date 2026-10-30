import polygonClipping from './vendor/polygon-clipping-0.15.7.js';

const EPSILON = 1e-7;
const FLOAT32 = Math.fround;

function smoothStep01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function finiteSample(sample) {
  return sample && [sample.x, sample.y, sample.height].every((value) => Number.isFinite(Number(value)));
}

function gradeFor(line) {
  const tags = line.tags || {};
  const profile = line.profile || {};
  const flag = (value) => Boolean(value && value !== 'no' && value !== 'false' && value !== '0');
  const bridge = flag(profile.bridge) || flag(tags.bridge);
  const tunnel = flag(profile.tunnel) || flag(tags.tunnel);
  const rawLayer = Number.parseFloat(tags.layer);
  const layer = Number.isFinite(rawLayer) ? rawLayer : 0;
  return { bridge, tunnel, layer, key: `${bridge ? 1 : 0}:${tunnel ? 1 : 0}:${layer}` };
}

function stableCoordinate(value) {
  return Math.round(value * 100);
}

function cross(ax, az, bx, bz) { return ax * bz - az * bx; }
function area2(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area;
}
function pointInTriangle(point, a, b, c, sign) {
  return cross(b.x - a.x, b.z - a.z, point.x - a.x, point.z - a.z) * sign >= -EPSILON
    && cross(c.x - b.x, c.z - b.z, point.x - b.x, point.z - b.z) * sign >= -EPSILON
    && cross(a.x - c.x, a.z - c.z, point.x - c.x, point.z - c.z) * sign >= -EPSILON;
}
function triangulate(points) {
  if (points.length < 3) return [];
  const sign = Math.sign(area2(points));
  if (!sign) return [];
  const remaining = points.map((_point, index) => index);
  const triangles = [];
  for (let guard = 0; remaining.length > 3 && guard < points.length * points.length; guard += 1) {
    let clipped = false;
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      const ia = remaining[(cursor - 1 + remaining.length) % remaining.length];
      const ib = remaining[cursor];
      const ic = remaining[(cursor + 1) % remaining.length];
      const a = points[ia], b = points[ib], c = points[ic];
      if (cross(b.x - a.x, b.z - a.z, c.x - b.x, c.z - b.z) * sign <= EPSILON) continue;
      if (remaining.some((index) => index !== ia && index !== ib && index !== ic && pointInTriangle(points[index], a, b, c, sign))) continue;
      triangles.push([ia, ib, ic]);
      remaining.splice(cursor, 1);
      clipped = true;
      break;
    }
    if (!clipped) return [];
  }
  if (remaining.length === 3) triangles.push(remaining);
  return triangles;
}

function pointAtDistance(line, distance) {
  const samples = line.samples;
  const clamped = Math.max(0, Math.min(line.length, distance));
  if (clamped <= 0) return { ...samples[0], distance: 0 };
  if (clamped >= line.length) return { ...samples.at(-1), distance: line.length };
  let right = 1;
  while (right < samples.length && samples[right].distance < clamped) right += 1;
  const a = samples[right - 1], b = samples[right];
  const span = b.distance - a.distance;
  const t = span > EPSILON ? (clamped - a.distance) / span : 0;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    height: a.height + (b.height - a.height) * t,
    distance: clamped,
  };
}

function sectionAt(line, distance, width) {
  const center = pointAtDistance(line, distance);
  const delta = Math.max(0.001, Math.min(0.15, line.length / 1000));
  const before = pointAtDistance(line, Math.max(0, distance - delta));
  const after = pointAtDistance(line, Math.min(line.length, distance + delta));
  let dx = after.x - before.x;
  let dz = after.y - before.y;
  let length = Math.hypot(dx, dz);
  if (length < EPSILON) { dx = 1; dz = 0; length = 1; }
  dx /= length; dz /= length;
  const half = width / 2;
  const left = { x: center.x - dz * half, y: center.height, z: center.y + dx * half };
  const right = { x: center.x + dz * half, y: center.height, z: center.y - dx * half };
  return { center, left, right, tangent: { x: dx, z: dz } };
}

function f32point(point, height = point.y) {
  return { x: FLOAT32(point.x), y: FLOAT32(height), z: FLOAT32(point.z) };
}
function appendTriangle(out, a, b, c) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function makeSection(line, distance, width, boundary = null, endpoint = null) {
  if (boundary && endpoint) {
    const center = pointAtDistance(line, distance);
    const pair = boundary[endpoint];
    return { center, left: pair.ribbonLeft || pair.left, right: pair.ribbonRight || pair.right };
  }
  const computed = sectionAt(line, distance, width);
  return { center: computed.center, left: f32point(computed.left), right: f32point(computed.right) };
}

function intervalSamples(line, start, end, startBoundary, endBoundary, width) {
  const rows = [makeSection(line, start, width, startBoundary, 'end')];
  for (const sample of line.samples) {
    if (sample.distance > start + EPSILON && sample.distance < end - EPSILON) {
      const section = sectionAt(line, sample.distance, width);
      rows.push({ center: section.center, left: f32point(section.left), right: f32point(section.right) });
    }
  }
  rows.push(makeSection(line, end, width, endBoundary, 'start'));
  return rows;
}

function appendRibbon(out, line, start, end, startBoundary, endBoundary, width, verticalOffset = 0) {
  if (!(end - start > 0.001)) return 0;
  const rows = intervalSamples(line, start, end, startBoundary, endBoundary, width);
  let triangles = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const a = rows[index - 1], b = rows[index];
    const al = verticalOffset ? { ...a.left, y: FLOAT32(a.left.y + verticalOffset) } : a.left;
    const ar = verticalOffset ? { ...a.right, y: FLOAT32(a.right.y + verticalOffset) } : a.right;
    const bl = verticalOffset ? { ...b.left, y: FLOAT32(b.left.y + verticalOffset) } : b.left;
    const br = verticalOffset ? { ...b.right, y: FLOAT32(b.right.y + verticalOffset) } : b.right;
    appendTriangle(out, al, ar, br);
    appendTriangle(out, al, br, bl);
    triangles += 2;
  }
  return triangles;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i], b = polygon[j];
    const crosses = (a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z || EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function sourceVertexKey(sample, grade) {
  const hasNodeId = sample.nodeId !== undefined && sample.nodeId !== null && sample.nodeId !== "";
  const identity = hasNodeId ? `node:${String(sample.nodeId)}`
    : `xy:${stableCoordinate(sample.x)}:${stableCoordinate(sample.y)}`;
  return `${identity}:${grade.key}`;
}

function ringArea(ring) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index], b = ring[(index + 1) % ring.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twiceArea) / 2;
}

function surfaceHeightAt(junctions, x, z) {
  let nearest = { distance: Infinity, height: 0 };
  let containingHeight = -Infinity;
  for (const junction of junctions) {
    for (let offset = 0; offset < junction.positions.length; offset += 9) {
      const p = junction.positions;
      const ax = p[offset], ay = p[offset + 1], az = p[offset + 2];
      const bx = p[offset + 3], by = p[offset + 4], bz = p[offset + 5];
      const cx = p[offset + 6], cy = p[offset + 7], cz = p[offset + 8];
      const denominator = cross(bx - ax, bz - az, cx - ax, cz - az);
      if (Math.abs(denominator) > EPSILON) {
        const u = cross(x - ax, z - az, cx - ax, cz - az) / denominator;
        const v = cross(bx - ax, bz - az, x - ax, z - az) / denominator;
        const w = 1 - u - v;
        if (u >= -1e-5 && v >= -1e-5 && w >= -1e-5) {
          containingHeight = Math.max(containingHeight, w * ay + u * by + v * cy);
        }
      }
      for (const [sx, sz, ex, ez, sh, eh] of [
        [ax, az, bx, bz, ay, by], [bx, bz, cx, cz, by, cy], [cx, cz, ax, az, cy, ay],
      ]) {
        const dx = ex - sx, dz = ez - sz;
        const lengthSquared = dx * dx + dz * dz;
        const t = lengthSquared > EPSILON ? Math.max(0, Math.min(1, ((x - sx) * dx + (z - sz) * dz) / lengthSquared)) : 0;
        const px = sx + dx * t, pz = sz + dz * t;
        const distance = Math.hypot(x - px, z - pz);
        if (distance < nearest.distance) nearest = { distance, height: sh + (eh - sh) * t };
      }
    }
  }
  return Number.isFinite(containingHeight) ? containingHeight : nearest.height;
}

function junctionBounds(junction) {
  const points = junction.boundary;
  return {
    minX: Math.min(...points.map((point) => point.x)), maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)), maxZ: Math.max(...points.map((point) => point.z)),
  };
}

function mergeOverlappingJunctions(junctions, linesById, cellSize = 64) {
  if (junctions.length < 2) return { junctions, mergedClusterCount: 0, rejectedClusterCount: 0 };
  const parents = junctions.map((_junction, index) => index);
  const find = (index) => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const join = (a, b) => { const rootA = find(a), rootB = find(b); if (rootA !== rootB) parents[rootB] = rootA; };
  const bounds = junctions.map(junctionBounds);
  const cells = new Map();
  const candidatePairs = new Set();
  for (let index = 0; index < junctions.length; index += 1) {
    const box = bounds[index];
    const minCellX = Math.floor(box.minX / cellSize), maxCellX = Math.floor(box.maxX / cellSize);
    const minCellZ = Math.floor(box.minZ / cellSize), maxCellZ = Math.floor(box.maxZ / cellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const cellKey = `${junctions[index].gradeKey}:${cellX}:${cellZ}`;
        const bucket = cells.get(cellKey) || [];
        for (const otherIndex of bucket) {
          const a = bounds[index], b = bounds[otherIndex];
          if (a.minX > b.maxX || b.minX > a.maxX || a.minZ > b.maxZ || b.minZ > a.maxZ) continue;
          if (!junctions[index].lineIds.some((lineId) => junctions[otherIndex].lineIds.includes(lineId))) continue;
          const pair = `${otherIndex}:${index}`;
          if (candidatePairs.has(pair)) continue;
          candidatePairs.add(pair);
          join(index, otherIndex);
        }
        bucket.push(index);
        cells.set(cellKey, bucket);
      }
    }
  }
  const groups = new Map();
  junctions.forEach((junction, index) => {
    const root = find(index);
    const group = groups.get(root) || [];
    group.push(junction);
    groups.set(root, group);
  });

  const output = [];
  let mergedClusterCount = 0;
  let rejectedClusterCount = 0;
  for (const group of groups.values()) {
    if (group.length < 2) { output.push(group[0]); continue; }
    let union;
    const gapSources = [];
    try {
      const trianglePolygons = [];
      const mouthsByLine = new Map();
      for (const junction of group) {
        for (const mouth of junction.mouths) {
          const mouths = mouthsByLine.get(mouth.lineId) || [];
          mouths.push(mouth);
          mouthsByLine.set(mouth.lineId, mouths);
        }
      }
      for (const [lineId, mouths] of mouthsByLine) {
        const nodes = new Map();
        for (const mouth of mouths) {
          const node = nodes.get(mouth.vertexDistance) || { distance: mouth.vertexDistance, mouths: [] };
          node.mouths.push(mouth);
          nodes.set(mouth.vertexDistance, node);
        }
        const orderedNodes = [...nodes.values()].sort((a, b) => a.distance - b.distance);
        const line = linesById.get(lineId);
        if (!line) continue;
        for (let index = 1; index < orderedNodes.length; index += 1) {
          const before = orderedNodes[index - 1], after = orderedNodes[index];
          const startMouth = before.mouths.find((mouth) => mouth.forward && mouth.distance > before.distance);
          const endMouth = after.mouths.find((mouth) => !mouth.forward && mouth.distance < after.distance);
          if (!startMouth || !endMouth || endMouth.distance <= startMouth.distance) continue;
          const positions = [];
          appendRibbon(positions, line, startMouth.distance, endMouth.distance,
            { end: startMouth }, { start: endMouth }, line.width, 0);
          if (!positions.length) continue;
          const source = { positions: new Float32Array(positions) };
          gapSources.push(source);
          for (let offset = 0; offset < source.positions.length; offset += 9) {
            const p = source.positions;
            const ring = [
              [p[offset], p[offset + 2]],
              [p[offset + 3], p[offset + 5]],
              [p[offset + 6], p[offset + 8]],
              [p[offset], p[offset + 2]],
            ];
            if (ringArea([ring[0], ring[1], ring[2]]) > 1e-5) trianglePolygons.push([ring]);
          }
        }
      }
      for (const junction of group) {
        for (let offset = 0; offset < junction.positions.length; offset += 9) {
          const p = junction.positions;
          const ring = [
            [p[offset], p[offset + 2]],
            [p[offset + 3], p[offset + 5]],
            [p[offset + 6], p[offset + 8]],
            [p[offset], p[offset + 2]],
          ];
          if (ringArea([ring[0], ring[1], ring[2]]) > 1e-5) trianglePolygons.push([ring]);
        }
      }
      union = polygonClipping.union(...trianglePolygons);
    } catch {
      rejectedClusterCount += 1;
      output.push(...group);
      continue;
    }
    if (!Array.isArray(union) || !union.length || union.some((polygon) => polygon.length !== 1)) {
      rejectedClusterCount += 1;
      output.push(...group);
      continue;
    }
    const unionArea = union.reduce((sum, polygon) => sum + ringArea(polygon[0]), 0);
    const originalArea = group.reduce((sum, junction) => sum + junction.area, 0);
    if (union.length >= group.length && unionArea >= originalArea - 1e-4) {
      output.push(...group);
      continue;
    }
    const positionsByPolygon = [];
    let valid = true;
    for (const polygon of union) {
      const rawRing = polygon[0].slice(0, -1);
      const ring = [];
      for (const [x, z] of rawRing) {
        const previous = ring.at(-1);
        if (previous && Math.hypot(previous.x - x, previous.z - z) < 0.005) continue;
        ring.push({ x: FLOAT32(x), y: FLOAT32(surfaceHeightAt(group.concat(gapSources), x, z)), z: FLOAT32(z) });
      }
      if (ring.length < 3) { valid = false; break; }
      const triangles = triangulate(ring);
      if (!triangles.length) { valid = false; break; }
      const positions = [];
      for (const [a, b, c] of triangles) appendTriangle(positions, ring[a], ring[b], ring[c]);
      if (!positions.length || !positions.every(Number.isFinite)) { valid = false; break; }
      positionsByPolygon.push({ ring, positions, area: ringArea(polygon[0]) });
    }
    if (!valid) {
      rejectedClusterCount += 1;
      output.push(...group);
      continue;
    }
    mergedClusterCount += 1;
    const lineIds = [...new Set(group.flatMap((junction) => junction.lineIds))].sort();
    const mouths = group.flatMap((junction) => junction.mouths);
    const dominant = group.slice().sort((a, b) => (b.dominantWidth || 0) - (a.dominantWidth || 0) || a.id.localeCompare(b.id))[0];
    positionsByPolygon.forEach((component, index) => output.push({
      id: `junction-union:${group.map((junction) => junction.id).sort().join('|')}:${index}`,
      key: group.map((junction) => junction.key).sort().join('|'), gradeKey: group[0].gradeKey,
      sourceNodeId: null,
      sourceNodeIds: [...new Set(group.map((junction) => junction.sourceNodeId).filter((id) => id !== undefined && id !== null))],
      connectivitySource: 'merged-cluster',
      sourceJunctionIds: group.map((junction) => junction.id).sort(),
      x: component.ring.reduce((sum, point) => sum + point.x, 0) / component.ring.length,
      z: component.ring.reduce((sum, point) => sum + point.z, 0) / component.ring.length,
      positions: new Float32Array(component.positions), boundary: component.ring,
      materialKey: dominant.materialKey, edgeKey: dominant.edgeKey,
      lineIds, mouths, area: component.area,
      approachBlendDistance: Math.max(...group.map((junction) => junction.approachBlendDistance)),
      dominantWidth: dominant.dominantWidth || 0,
    }));
  }
  return { junctions: output, mergedClusterCount, rejectedClusterCount };
}

/** Build clipped per-road ribbons and matching connected junction surfaces without scene dependencies. */
export function buildConnectedRoadSurface(roadLines, options = {}) {
  if (!Array.isArray(roadLines)) throw new TypeError('roadLines must be an array');
  const maxTrim = Number.isFinite(options.maxTrim) && options.maxTrim > 0 ? options.maxTrim : 14;
  const requestedApproachBlend = Number.isFinite(options.approachBlendDistance) && options.approachBlendDistance >= 0
    ? options.approachBlendDistance : 8;
  const lines = [];
  let rejectedSamples = 0;

  for (const source of roadLines) {
    if (!source || !Array.isArray(source.samples) || source.samples.length < 2) continue;
    const samples = [];
    let invalidLine = false;
    let distance = 0;
    for (const sample of source.samples) {
      if (!finiteSample(sample)) { rejectedSamples += 1; invalidLine = true; continue; }
      const normalized = { ...sample, x: Number(sample.x), y: Number(sample.y), height: Number(sample.height) };
      if (samples.length) {
        const previous = samples.at(-1);
        const span = Math.hypot(normalized.x - previous.x, normalized.y - previous.y);
        if (span < 0.001) {
          if (normalized.sourceVertex) previous.sourceVertex = true;
          continue;
        }
        distance += span;
      }
      normalized.distance = distance;
      samples.push(normalized);
    }
    if (invalidLine || samples.length < 2) continue;
    const rawWidth = Number(source.profile?.width);
    const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 5.5;
    const rawExtra = Number(source.profile?.edgeExtra);
    const edgeExtra = Number.isFinite(rawExtra) && rawExtra >= 0 ? rawExtra : 0;
    const line = { source, lineId: source.id, samples, length: distance, width, edgeExtra, grade: gradeFor(source) };
    lines.push(line);
  }

  const verticesByKey = new Map();
  for (const line of lines) {
    line.samples.forEach((sample, index) => {
      if (!sample.sourceVertex) return;
      const key = sourceVertexKey(sample, line.grade);
      const list = verticesByKey.get(key) || [];
      list.push({ line, sample, index, key, nodeId: sample.nodeId });
      verticesByKey.set(key, list);
    });
  }

  const rawNodes = [];
  for (const [key, vertices] of verticesByKey) {
    if (new Set(vertices.map((vertex) => vertex.line.lineId)).size < 2) continue;
    const first = vertices[0].sample;
    const sourceNodeId = vertices[0].nodeId;
    const hasSourceNodeId = sourceNodeId !== undefined && sourceNodeId !== null && sourceNodeId !== "";
    const arms = [];
    for (const vertex of vertices) {
      for (const neighborIndex of [vertex.index - 1, vertex.index + 1]) {
        if (neighborIndex < 0 || neighborIndex >= vertex.line.samples.length) continue;
        const neighbor = vertex.line.samples[neighborIndex];
        const dx = neighbor.x - vertex.sample.x;
        const dz = neighbor.y - vertex.sample.y;
        const length = Math.hypot(dx, dz);
        if (length < 0.001) continue;
        arms.push({
          line: vertex.line, lineId: vertex.line.lineId, vertexDistance: vertex.sample.distance, vertexIndex: vertex.index, forward: neighborIndex > vertex.index,
          direction: { x: dx / length, z: dz / length },
          angle: Math.atan2(dz, dx), width: vertex.line.width, edgeWidth: vertex.line.width + vertex.line.edgeExtra,
          vertexSample: vertex.sample,
        });
      }
    }
    arms.sort((a, b) => a.angle - b.angle || String(a.lineId).localeCompare(String(b.lineId)));
    if (arms.length < 2) continue;
    rawNodes.push({ key, gradeKey: vertices[0].line.grade.key, sourceNodeId, connectivitySource: hasSourceNodeId ? "nodeId" : "coordinate", x: first.x, z: first.y, sharedHeight: Math.max(...vertices.map((vertex) => vertex.sample.height)), arms });
  }

  // Blend each connected approach toward its grade-matched shared node height, fading back to the source profile.
  if (requestedApproachBlend > 0) {
    for (const line of lines) {
      for (const sample of line.samples) {
        let weightedHeight = 0;
        let weightTotal = 0;
        for (const node of rawNodes) {
          const arm = node.arms.find((candidate) => candidate.line === line);
          if (!arm) continue;
          const distance = Math.abs(sample.distance - arm.vertexDistance);
          if (distance >= requestedApproachBlend) continue;
          const weight = 1 - smoothStep01(distance / requestedApproachBlend);
          weightedHeight += node.sharedHeight * weight;
          weightTotal += weight;
        }
        if (weightTotal > 0) {
          const targetHeight = weightedHeight / weightTotal;
          sample.height += (targetHeight - sample.height) * Math.min(1, weightTotal);
        }
      }
    }
  }
  // Measure available trim along the complete source chain, including across short resampled spans.
  for (const node of rawNodes) {
    for (const arm of node.arms) {
      let available = arm.forward ? arm.line.length - arm.vertexDistance : arm.vertexDistance;
      for (const other of rawNodes) {
        if (other === node) continue;
        const otherArm = other.arms.find((candidate) => candidate.line === arm.line
          && Math.abs(candidate.vertexDistance - arm.vertexDistance) > 0.001
          && (arm.forward ? candidate.vertexDistance > arm.vertexDistance : candidate.vertexDistance < arm.vertexDistance));
        if (otherArm) available = Math.min(available, Math.abs(otherArm.vertexDistance - arm.vertexDistance));
      }
      arm.available = available;
      const naturalTrim = Math.min(maxTrim, Math.max(arm.width * 0.45, requestedApproachBlend * 0.45));
      arm.trimDistance = Math.max(0, Math.min(naturalTrim, available * 0.45));
      arm.mouthDistance = Math.max(0, Math.min(arm.line.length,
        arm.vertexDistance + (arm.forward ? 1 : -1) * arm.trimDistance));
    }
    for (let index = 0; index < node.arms.length; index += 1) {
      const a = node.arms[index];
      const b = node.arms[(index + 1) % node.arms.length];
      const aOrigin = { x: -a.direction.z * a.width / 2, z: a.direction.x * a.width / 2 };
      const bOrigin = { x: b.direction.z * b.width / 2, z: -b.direction.x * b.width / 2 };
      const denominator = cross(a.direction.x, a.direction.z, b.direction.x, b.direction.z);
      if (Math.abs(denominator) < 1e-6) continue;
      const rx = bOrigin.x - aOrigin.x, rz = bOrigin.z - aOrigin.z;
      const alongA = cross(rx, rz, b.direction.x, b.direction.z) / denominator;
      const alongB = cross(rx, rz, a.direction.x, a.direction.z) / denominator;
      if (alongA < 0 || alongB < 0) continue;
      a.trimDistance = Math.min(maxTrim, a.available * 0.45, Math.max(a.trimDistance, alongA + 0.05));
      b.trimDistance = Math.min(maxTrim, b.available * 0.45, Math.max(b.trimDistance, alongB + 0.05));
      a.mouthDistance = Math.max(0, Math.min(a.line.length,
        a.vertexDistance + (a.forward ? 1 : -1) * a.trimDistance));
      b.mouthDistance = Math.max(0, Math.min(b.line.length,
        b.vertexDistance + (b.forward ? 1 : -1) * b.trimDistance));
    }
  }

  const cutsByLine = new Map(lines.map((line) => [line, []]));
  const builtJunctions = [];
  let rejectedJunctionCount = 0;
  const boundarySlopes = [];
  for (const node of rawNodes) {
    const mouths = [];
    for (const arm of node.arms) {
      const mouthDistance = arm.mouthDistance;
      const center = pointAtDistance(arm.line, mouthDistance);
      const tangent = arm.direction;
      const ribbonTangent = arm.forward ? tangent : { x: -tangent.x, z: -tangent.z };
      const half = arm.width / 2;
      const halfEdge = arm.edgeWidth / 2;
      const mouth = {
        lineId: arm.lineId,
        distance: mouthDistance,
        vertexDistance: arm.vertexDistance,
        forward: arm.forward,
        trimDistance: Math.abs(mouthDistance - arm.vertexDistance),
        width: arm.width,
        edgeWidth: arm.edgeWidth,
        tangent,
        left: f32point({ x: center.x - tangent.z * half, y: center.height, z: center.y + tangent.x * half }),
        right: f32point({ x: center.x + tangent.z * half, y: center.height, z: center.y - tangent.x * half }),
        edgeLeft: f32point({ x: center.x - tangent.z * halfEdge, y: center.height, z: center.y + tangent.x * halfEdge }),
        edgeRight: f32point({ x: center.x + tangent.z * halfEdge, y: center.height, z: center.y - tangent.x * halfEdge }),
        ribbonLeft: f32point({ x: center.x - ribbonTangent.z * half, y: center.height, z: center.y + ribbonTangent.x * half }),
        ribbonRight: f32point({ x: center.x + ribbonTangent.z * half, y: center.height, z: center.y - ribbonTangent.x * half }),
        edgeRibbonLeft: f32point({ x: center.x - ribbonTangent.z * halfEdge, y: center.height, z: center.y + ribbonTangent.x * halfEdge }),
        edgeRibbonRight: f32point({ x: center.x + ribbonTangent.z * halfEdge, y: center.height, z: center.y - ribbonTangent.x * halfEdge }),
        arm,
      };
      mouths.push(mouth);

    }
    const ring = [];
    for (const mouth of mouths) {
      ring.push(mouth.right, mouth.left);
    }
    // Remove repeated vertices from coincident arms without moving any retained boundary point.
    const uniqueRing = [];
    for (const point of ring) {
      const previous = uniqueRing.at(-1);
      if (!previous || Math.hypot(previous.x - point.x, previous.z - point.z) > 0.01) uniqueRing.push(point);
    }
    if (uniqueRing.length > 2 && Math.hypot(uniqueRing[0].x - uniqueRing.at(-1).x, uniqueRing[0].z - uniqueRing.at(-1).z) <= 0.01) uniqueRing.pop();
    const triangles = triangulate(uniqueRing);
    const nodeHeight = node.sharedHeight;
    const positions = [];
    const center = f32point({ x: node.x, y: nodeHeight, z: node.z });
    // A center fan gives connected grade-matched arms one smooth height transition while preserving every mouth boundary height.
    const centerFan = uniqueRing.length >= 3 && Math.abs(area2(uniqueRing)) > 0.01 && pointInPolygon(center, uniqueRing);
    if (centerFan) {
      for (let index = 0; index < uniqueRing.length; index += 1) appendTriangle(positions, center, uniqueRing[index], uniqueRing[(index + 1) % uniqueRing.length]);
    } else {
      for (const [a, b, c] of triangles) appendTriangle(positions, uniqueRing[a], uniqueRing[b], uniqueRing[c]);
    }
    if (positions.length === 0 || !positions.every(Number.isFinite) || Math.abs(area2(uniqueRing)) < 0.02) {
      rejectedJunctionCount += 1;
      continue;
    }
    mouths.forEach((mouth) => {
      cutsByLine.get(mouth.arm.line).push({ distance: mouth.distance, node, mouth, vertexDistance: mouth.vertexDistance });
      boundarySlopes.push(Math.abs(mouth.left.y - node.sharedHeight) / Math.max(0.05, mouth.trimDistance));
    });
    const dominant = node.arms.slice().sort((a, b) => b.width - a.width || String(a.lineId).localeCompare(String(b.lineId)))[0];
    builtJunctions.push({
      id: `junction:${node.key}`, key: node.key, gradeKey: node.gradeKey, sourceNodeId: node.sourceNodeId, connectivitySource: node.connectivitySource, x: node.x, z: node.z,
      positions: new Float32Array(positions), boundary: uniqueRing, dominantWidth: dominant.width,
      materialKey: dominant.line.source.profile?.surfaceKey || 'roadLocal',
      edgeKey: dominant.line.source.profile?.edgeKey || 'roadEdge',
      lineIds: [...new Set(node.arms.map((arm) => arm.lineId))].sort(), mouths: mouths.map(({ arm, ...mouth }) => mouth),
      area: Math.abs(area2(uniqueRing)) / 2, approachBlendDistance: requestedApproachBlend,
    });
  }

  const mergedJunctionResult = mergeOverlappingJunctions(builtJunctions, new Map(lines.map((line) => [line.lineId, line])));
  const junctions = mergedJunctionResult.junctions;
  const mergedIntervalsByLine = new Map();
  const intervalKeys = new Set();
  for (const junction of junctions) {
    if (!junction.sourceJunctionIds || junction.sourceJunctionIds.length < 2) continue;
    const mouthsByLine = new Map();
    for (const mouth of junction.mouths) {
      const mouths = mouthsByLine.get(mouth.lineId) || [];
      mouths.push(mouth);
      mouthsByLine.set(mouth.lineId, mouths);
    }
    for (const [lineId, mouths] of mouthsByLine) {
      const nodes = new Map();
      for (const mouth of mouths) {
        const entry = nodes.get(mouth.vertexDistance) || { distance: mouth.vertexDistance, mouths: [] };
        entry.mouths.push(mouth);
        nodes.set(mouth.vertexDistance, entry);
      }
      const orderedNodes = [...nodes.values()].sort((a, b) => a.distance - b.distance);
      for (let index = 1; index < orderedNodes.length; index += 1) {
        const before = orderedNodes[index - 1], after = orderedNodes[index];
        const startMouth = before.mouths.find((mouth) => mouth.forward && mouth.distance > before.distance);
        const endMouth = after.mouths.find((mouth) => !mouth.forward && mouth.distance < after.distance);
        if (!startMouth || !endMouth || endMouth.distance <= startMouth.distance) continue;
        const key = `${lineId}:${before.distance}:${after.distance}`;
        if (intervalKeys.has(key)) continue;
        intervalKeys.add(key);
        const intervals = mergedIntervalsByLine.get(lineId) || [];
        intervals.push({ start: startMouth.distance, end: endMouth.distance, startMouth, endMouth });
        mergedIntervalsByLine.set(lineId, intervals);
      }
    }
  }
  const lineResults = [];
  for (const line of lines) {
    const cuts = (cutsByLine.get(line) || []).sort((a, b) => a.distance - b.distance || String(a.node.key).localeCompare(String(b.node.key)));
    // At one source vertex, a through-road contributes two arms but only one cut per side.
    const uniqueCuts = [];
    for (const cut of cuts) {
      if (uniqueCuts.some((item) => Math.abs(item.distance - cut.distance) < 0.01)) continue;
      uniqueCuts.push(cut);
    }
    // The source chain is emitted as consecutive retained intervals, with source-distance trims clipped from both sides.
    const cutIntervals = uniqueCuts.map((cut) => ({ start: Math.max(0, Math.min(cut.distance, cut.vertexDistance)), end: Math.min(line.length, Math.max(cut.distance, cut.vertexDistance)), cut }));
    for (const interval of mergedIntervalsByLine.get(line.lineId) || []) {
      cutIntervals.push({
        start: interval.start, end: interval.end,
        startCut: { mouth: interval.startMouth }, endCut: { mouth: interval.endMouth },
      });
    }
    const clipped = [];
    let start = 0;
    let startCut = null;
    for (const interval of cutIntervals.sort((a, b) => a.start - b.start)) {
      if (interval.start > start + 0.001) clipped.push({ start, end: interval.start, startCut, endCut: interval.startCut || interval.cut });
      start = Math.max(start, interval.end);
      startCut = interval.endCut || interval.cut;
    }
    if (start < line.length - 0.001) clipped.push({ start, end: line.length, startCut, endCut: null });
    const finalSurface = [];
    const finalFoundation = [];

    for (const interval of clipped) {
      const firstBoundary = interval.startCut ? { end: interval.startCut.mouth } : null;
      const lastBoundary = interval.endCut ? { start: interval.endCut.mouth } : null;
      appendRibbon(finalSurface, line, interval.start, interval.end, firstBoundary, lastBoundary, line.width, 0);
      appendRibbon(finalFoundation, line, interval.start, interval.end,
        firstBoundary ? { end: { ...interval.startCut.mouth, ribbonLeft: interval.startCut.mouth.edgeRibbonLeft, ribbonRight: interval.startCut.mouth.edgeRibbonRight } } : null,
        lastBoundary ? { start: { ...interval.endCut.mouth, ribbonLeft: interval.endCut.mouth.edgeRibbonLeft, ribbonRight: interval.endCut.mouth.edgeRibbonRight } } : null,
        line.width + line.edgeExtra, -0.055);
    }
    lineResults.push({
      lineId: line.lineId, sourceId: line.lineId, gradeKey: line.grade.key, samples: line.samples.map((sample) => ({ ...sample })), surfaceKey: line.source.profile?.surfaceKey || 'roadLocal',
      edgeKey: line.source.profile?.edgeKey || 'roadEdge', width: line.width, foundationWidth: line.width + line.edgeExtra,
      surfacePositions: new Float32Array(finalSurface), foundationPositions: new Float32Array(finalFoundation),
      mouthTrims: uniqueCuts.map((cut) => ({ junctionId: `junction:${cut.node.key}`, distance: Math.abs(cut.distance - cut.vertexDistance), at: cut.vertexDistance })),
    });
  }

  return {
    lines: lineResults,
    junctions,
    mouthTrims: lineResults.flatMap((line) => line.mouthTrims.map((trim) => ({ lineId: line.lineId, ...trim }))),
    stats: {
      lineCount: lineResults.length, junctionCount: junctions.length, rejectedSamples, rejectedJunctionCount,
      nodeIdJunctionCount: rawNodes.filter((node) => node.connectivitySource === "nodeId").length,
      coordinateFallbackJunctionCount: rawNodes.filter((node) => node.connectivitySource === "coordinate").length,
      mergedJunctionClusterCount: mergedJunctionResult.mergedClusterCount,
      rejectedUnionClusterCount: mergedJunctionResult.rejectedClusterCount,
      meanJunctionBoundarySlope: boundarySlopes.length ? boundarySlopes.reduce((sum, value) => sum + value, 0) / boundarySlopes.length : 0,
      maxJunctionBoundarySlope: boundarySlopes.length ? Math.max(...boundarySlopes) : 0,
      surfaceTriangleCount: lineResults.reduce((sum, line) => sum + line.surfacePositions.length / 9, 0)
        + junctions.reduce((sum, junction) => sum + junction.positions.length / 9, 0),
      foundationTriangleCount: lineResults.reduce((sum, line) => sum + line.foundationPositions.length / 9, 0),
      approachBlendDistance: requestedApproachBlend,
    },
  };
}
