import {projectMarkingTriangles} from './road-marking-projection.js?v=1.6.155';
const DEFAULT_SPACING = 1.5;
const DEFAULT_MAX_TRIANGLES = 4096;
const DEFAULT_MAX_DEPTH = 12;

function finite(...values) {
  return values.every(Number.isFinite);
}

function surfaceHeight(sampleHeight, x, z, referenceHeight) {
  let sample;
  try {
    sample = sampleHeight(x, z, referenceHeight);
  } catch {
    return null;
  }
  const height = typeof sample === 'number' ? sample : sample?.height;
  return Number.isFinite(height) ? height : null;
}

function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.z - next.x * current.z;
  }
  return area / 2;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function pointInTriangle(point, a, b, c, orientation) {
  const epsilon = 1e-10;
  return cross(a, b, point) * orientation >= -epsilon
    && cross(b, c, point) * orientation >= -epsilon
    && cross(c, a, point) * orientation >= -epsilon;
}

function triangulate(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const clean = [];
  for (const point of points) {
    if (!finite(point?.x, point?.z)) return [];
    if (!clean.length || Math.hypot(point.x - clean.at(-1).x, point.z - clean.at(-1).z) > 1e-8) {
      clean.push({ x: point.x, z: point.z });
    }
  }
  if (clean.length > 3 && Math.hypot(clean[0].x - clean.at(-1).x, clean[0].z - clean.at(-1).z) <= 1e-8) clean.pop();
  if (clean.length < 3 || Math.abs(signedArea(clean)) < 1e-9) return [];
  const orientation = Math.sign(signedArea(clean));
  const remaining = clean.map((_, index) => index);
  const triangles = [];
  let guard = remaining.length * remaining.length;
  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i += 1) {
      const previous = remaining[(i + remaining.length - 1) % remaining.length];
      const current = remaining[i];
      const next = remaining[(i + 1) % remaining.length];
      const a = clean[previous], b = clean[current], c = clean[next];
      if (cross(a, b, c) * orientation <= 1e-10) continue;
      let containsVertex = false;
      for (const candidate of remaining) {
        if (candidate === previous || candidate === current || candidate === next) continue;
        if (pointInTriangle(clean[candidate], a, b, c, orientation)) {
          containsVertex = true;
          break;
        }
      }
      if (containsVertex) continue;
      triangles.push([a, b, c]);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return [];
  }
  if (remaining.length === 3) triangles.push(remaining.map((index) => clean[index]));
  return triangles;
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

function longestEdge(a, b, c) {
  return Math.max(Math.hypot(a.x - b.x, a.z - b.z),
    Math.hypot(b.x - c.x, b.z - c.z), Math.hypot(c.x - a.x, c.z - a.z));
}

function makeBatch(sourceId, positions) {
  return { sourceId: sourceId ?? null, positions: new Float32Array(positions) };
}

/** Triangulate and drape one simple polygon onto the final rendered pavement.
 * Unsupported pieces are omitted; no terrain or neighbouring deck is inferred.
 */
export function drapePaintPolygon(pointsXZ, sampleHeight, options = {}) {
  const { sourceId = null, referenceHeight = null, spacing = DEFAULT_SPACING, lift = 0.012,
    maxTriangles = DEFAULT_MAX_TRIANGLES, maxDepth = DEFAULT_MAX_DEPTH, maxHeightJump = Infinity } = options;
  if (typeof sampleHeight !== 'function' || !finite(spacing, lift, maxTriangles, maxDepth)
    || spacing <= 0 || maxTriangles < 1 || maxDepth < 0
    || (referenceHeight !== null && !Number.isFinite(referenceHeight))
    || (!(maxHeightJump === Infinity) && (!Number.isFinite(maxHeightJump) || maxHeightJump < 0))) {
    throw new TypeError('Invalid paint projection options');
  }
  if(options.pavementIndices)return makeBatch(sourceId,projectMarkingTriangles(triangulate(pointsXZ),options.pavementIndices,{lift,referenceHeight}));
  const positions = [];
  let emitted = 0;
  const emit = (a, b, c) => {
    const area = cross(a, b, c);
    if (Math.abs(area) < 1e-10 || emitted >= maxTriangles) return;
    const ordered = area > 0 ? [a, c, b] : [a, b, c];
    const probes = [
      ...ordered,
      midpoint(ordered[0], ordered[1]), midpoint(ordered[1], ordered[2]), midpoint(ordered[2], ordered[0]),
      { x: (ordered[0].x + ordered[1].x + ordered[2].x) / 3,
        z: (ordered[0].z + ordered[1].z + ordered[2].z) / 3 },
    ];
    const heights = probes.map((point) => surfaceHeight(sampleHeight, point.x, point.z, referenceHeight));
    if (heights.some((height) => height === null)) return;
    if (Number.isFinite(maxHeightJump) && Math.max(...heights) - Math.min(...heights) > maxHeightJump) return;
    for (let i = 0; i < 3; i += 1) positions.push(ordered[i].x, heights[i] + lift, ordered[i].z);
    emitted += 1;
  };
  const visit = (a, b, c, depth) => {
    if (emitted >= maxTriangles) return;
    if (longestEdge(a, b, c) > spacing && depth < maxDepth) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      visit(a, ab, ca, depth + 1);
      visit(ab, b, bc, depth + 1);
      visit(ca, bc, c, depth + 1);
      visit(ab, bc, ca, depth + 1);
      return;
    }
    emit(a, b, c);
  };
  for (const triangle of triangulate(pointsXZ)) {
    visit(triangle[0], triangle[1], triangle[2], 0);
    if (emitted >= maxTriangles) break;
  }
  return makeBatch(sourceId, positions);
}

function transformLocal(x, z, cx, cz, heading) {
  const cosine = Math.cos(heading), sine = Math.sin(heading);
  return { x: cx + x * cosine + z * sine, z: cz - x * sine + z * cosine };
}

function localPolygon(points, x, z, heading) {
  return points.map(([px, pz]) => transformLocal(px, pz, x, z, heading));
}

function arrowParts(kind, length, width) {
  const half = length / 2;
  const shaft = width * 0.14;
  const branchBase = length * 0.12;
  const parts = [[[-shaft, -half], [shaft, -half], [shaft, branchBase], [-shaft, branchBase]]];
  if (kind === 'through') {
    parts.push([[-width * 0.42, branchBase], [width * 0.42, branchBase], [0, half]]);
    return parts;
  }
  const side = kind === 'left' ? -1 : 1;
  const shoulder = length * 0.32;
  const tip = length * 0.47;
  parts.push([[Math.min(0, side * shoulder), branchBase - shaft],
    [Math.max(0, side * shoulder), branchBase - shaft],
    [Math.max(0, side * shoulder), branchBase + shaft],
    [Math.min(0, side * shoulder), branchBase + shaft]]);
  const headBaseX = side * shoulder;
  parts.push([[side * tip, branchBase], [headBaseX, branchBase - length * 0.18],
    [headBaseX, branchBase + length * 0.18]]);
  return parts;
}

/** Build mapped turn-arrow paint in the local +Z-forward convention. */
export function paintArrowTriangles({ x, z, heading = 0, symbol = 'through', length = 3.6, width = 1.2 } = {}, sampleHeight, options = {}) {
  if (!finite(x, z, heading, length, width) || length <= 0 || width <= 0) throw new TypeError('Invalid paint arrow');
  const tokens = (Array.isArray(symbol) ? symbol : String(symbol).split(/[;,|]/))
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
  const kinds = [...new Set(tokens.map((token) => /left|reverse/.test(token) ? 'left'
    : /right/.test(token) ? 'right' : /through|straight/.test(token) ? 'through' : null).filter(Boolean))];
  const parts = [];
  if (kinds.length) {
    const primary = kinds[0];
    const primaryParts = arrowParts(primary, length, width);
    parts.push(...primaryParts);
    for (const kind of kinds.slice(1)) parts.push(...arrowParts(kind, length, width).slice(1));
  }
  const positions = [];
  const maxTriangles = options.maxTriangles ?? DEFAULT_MAX_TRIANGLES;
  for (const part of parts) {
    const batch = drapePaintPolygon(localPolygon(part, x, z, heading), sampleHeight,
      { ...options, maxTriangles: Math.max(1, maxTriangles - positions.length / 9) });
    positions.push(...batch.positions);
    if (positions.length / 9 >= maxTriangles) break;
  }
  return makeBatch(options.sourceId, positions);
}

function segmentFrame(a, b) {
  const dx = b.x - a.x, dz = (b.z ?? b.y) - (a.z ?? a.y);
  const length = Math.hypot(dx, dz);
  return length > 1e-5 ? { dx, dz, length, ux: dx / length, uz: dz / length } : null;
}

function orientedRect(centerX, centerZ, heading, length, width) {
  return localPolygon([[-width / 2, -length / 2], [width / 2, -length / 2],
    [width / 2, length / 2], [-width / 2, length / 2]], centerX, centerZ, heading);
}

function appendPolygon(positions, points, sampleHeight, options) {
  const remaining = (options.maxTriangles ?? DEFAULT_MAX_TRIANGLES) - positions.length / 9;
  if (remaining <= 0) return;
  const batch = drapePaintPolygon(points, sampleHeight, { ...options, maxTriangles: remaining });
  positions.push(...batch.positions);
}

/** Drizzle mapped crossing paint styles: bars, edge rails or paired dots. */
export function paintCrossingTriangles({ a, b, width = 2.8, style = 'zebra' } = {}, sampleHeight, options = {}) {
  const frame = segmentFrame(a, b);
  if (!frame || !Number.isFinite(width) || width <= 0) throw new TypeError('Invalid mapped crossing');
  const { dx, dz, length, ux, uz } = frame;
  const cx = (a.x + b.x) / 2, cz = ((a.z ?? a.y) + (b.z ?? b.y)) / 2;
  const heading = Math.atan2(dx, dz);
  const positions = [];
  const normalized = String(style || '').toLowerCase();
  const addRails = normalized === 'lines' || normalized === 'ladder';
  if (addRails) {
    const offset = Math.max(0.45, width / 2 - 0.1);
    for (const side of [-1, 1]) appendPolygon(positions,
      orientedRect(cx + (-uz) * offset * side, cz + ux * offset * side, heading, length, 0.16),
      sampleHeight, options);
  }
  if (normalized === 'dots') {
    const offset = Math.max(0.45, width / 2 - 0.12);
    for (let distance = 0.3; distance < length; distance += 0.72) {
      const centerX = a.x + ux * distance, centerZ = (a.z ?? a.y) + uz * distance;
      for (const side of [-1, 1]) appendPolygon(positions,
        orientedRect(centerX + (-uz) * offset * side, centerZ + ux * offset * side, 0, 0.28, 0.28),
        sampleHeight, options);
    }
  } else if (normalized !== 'lines') {
    for (let distance = 0.35; distance < length; distance += 0.92) {
      const centerX = a.x + ux * distance, centerZ = (a.z ?? a.y) + uz * distance;
      appendPolygon(positions, orientedRect(centerX, centerZ, heading, 0.5, width), sampleHeight, options);
      if (positions.length / 9 >= (options.maxTriangles ?? DEFAULT_MAX_TRIANGLES)) break;
    }
  }
  return makeBatch(options.sourceId, positions);
}

/** Make a single surveyed stop bar rectangle; no location inference occurs here. */
export function paintStopBarTriangles({ x, z, heading = 0, width, depth = 0.32 } = {}, sampleHeight, options = {}) {
  if (!finite(x, z, heading, width, depth) || width <= 0 || depth <= 0) throw new TypeError('Invalid stop bar');
  return drapePaintPolygon(orientedRect(x, z, heading, depth, width), sampleHeight, options);
}

/** Project repeated source-backed longitudinal dash rectangles onto pavement. */
export function paintDashTriangles({ a, b, width = 0.15, dashLength = 3, gapLength = 3, phase = 0 } = {}, sampleHeight, options = {}) {
  const frame = segmentFrame(a, b);
  if (!frame || !finite(width, dashLength, gapLength, phase) || width <= 0 || dashLength <= 0 || gapLength < 0) {
    throw new TypeError('Invalid dashed paint');
  }
  const { length, ux, uz } = frame;
  const heading = Math.atan2(frame.dx, frame.dz);
  const period = dashLength + gapLength;
  const positions = [];
  const maximum = options.maxTriangles ?? DEFAULT_MAX_TRIANGLES;
  let distance = ((phase % period) + period) % period;
  for (let marks = 0; distance < length && marks < maximum / 2; marks += 1, distance += period) {
    const start = distance, end = Math.min(length, distance + dashLength);
    if (end - start > 1e-5) {
      const centerDistance = (start + end) / 2;
      appendPolygon(positions, orientedRect(a.x + ux * centerDistance,
        (a.z ?? a.y) + uz * centerDistance, heading, end - start, width), sampleHeight, options);
    }
    if (positions.length / 9 >= maximum) break;
  }
  return makeBatch(options.sourceId, positions);
}
