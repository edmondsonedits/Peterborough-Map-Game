import polygonClipping from './vendor/polygon-clipping-0.15.7.js';
import * as THREE from './vendor/three-r180/build/three.module.min.js';

// Float32 coordinates near city-scale offsets can shift clipped diagonal points
// by a few 1e-5 normalized units; keep those boundary faces in their source half.
const EPS = 1e-4;
const FLOAT32 = Math.fround;

function hasSourceRanges(group) {
  return Array.isArray(group?.sourceRanges) && group.sourceRanges.length > 0;
}

function eligibleGroup(group) {
  return group?.contact === 'official' && ['road_surfaces', 'parking_surfaces'].includes(group.layer)
    && !hasSourceRanges(group);
}

function positionsOf(group) {
  const positions = group?.positions;
  if (!(positions instanceof Float32Array || Array.isArray(positions)) || positions.length % 9 !== 0) {
    throw new TypeError('Road optimizer expected triangle positions');
  }
  return positions;
}

function gridTriangle(points, spacing) {
  const centerX = (points[0][0] + points[1][0] + points[2][0]) / 3;
  const centerZ = (points[0][1] + points[1][1] + points[2][1]) / 3;
  const cellX = Math.floor(centerX / spacing), cellZ = Math.floor(centerZ / spacing);
  const unit = points.map(([x, z]) => [(x - cellX * spacing) / spacing, (z - cellZ * spacing) / spacing]);
  if (unit.some(([u, v]) => u < -EPS || u > 1 + EPS || v < -EPS || v > 1 + EPS)) return null;
  const sums = unit.map(([u, v]) => u + v);
  const lower = sums.every((sum) => sum <= 1 + EPS);
  const upper = sums.every((sum) => sum >= 1 - EPS);
  if (!lower && !upper) return null;
  const twiceArea = Math.abs((points[1][0] - points[0][0]) * (points[2][1] - points[0][1])
    - (points[1][1] - points[0][1]) * (points[2][0] - points[0][0]));
  if (twiceArea < 1e-10) return null;
  return { cellX, cellZ, half: lower ? 0 : 1, unit };
}

function gridNodeCoordinates(cellX, cellZ, half, spacing) {
  const x = cellX * spacing, z = cellZ * spacing;
  return half === 0
    ? [{ x, z }, { x: x + spacing, z }, { x, z: z + spacing }]
    : [{ x: x + spacing, z: z + spacing }, { x, z: z + spacing }, { x: x + spacing, z }];
}

function candidateAt(positions, offset, spacing) {
  const points = [[positions[offset], positions[offset + 2]], [positions[offset + 3], positions[offset + 5]],
    [positions[offset + 6], positions[offset + 8]]];
  if (!points.flat().every(Number.isFinite)) return null;
  const triangle = gridTriangle(points, spacing);
  return triangle ? { offset, points, ...triangle } : null;
}

/** Return unique world-space lattice corners required by geometrically eligible faces. */
export function collectRoadGridNodes(groups, { spacing = 8 } = {}) {
  if (!Array.isArray(groups) || !Number.isFinite(spacing) || spacing <= 0) throw new TypeError('Invalid grid-node inputs');
  const nodes = new Map();
  for (const group of groups) {
    if (!eligibleGroup(group)) continue;
    const positions = positionsOf(group);
    for (let offset = 0; offset < positions.length; offset += 9) {
      const triangle = candidateAt(positions, offset, spacing);
      if (!triangle) continue;
      for (const node of gridNodeCoordinates(triangle.cellX, triangle.cellZ, triangle.half, spacing)) {
        const key = `${node.x}:${node.z}`;
        if (!nodes.has(key)) nodes.set(key, node);
      }
    }
  }
  return [...nodes.values()].sort((a, b) => a.z - b.z || a.x - b.x);
}

function nodeHeights(cellX, cellZ, half, spacing, heightAt, cache) {
  const nodes = gridNodeCoordinates(cellX, cellZ, half, spacing);
  return nodes.map(({ x, z }) => {
    const key = `${x}:${z}`;
    if (!cache.has(key)) {
      const value = heightAt(x, z);
      if (!Number.isFinite(value)) throw new RangeError('Non-finite canonical road height');
      cache.set(key, FLOAT32(value));
    }
    return cache.get(key);
  });
}

function planeHeight(x, z, cellX, cellZ, half, spacing, heights) {
  const u = (x - cellX * spacing) / spacing, v = (z - cellZ * spacing) / spacing;
  if (half === 0) return heights[0] * (1 - u - v) + heights[1] * u + heights[2] * v;
  return heights[0] * (u + v - 1) + heights[1] * (1 - u) + heights[2] * (1 - v);
}

function trianglePolygon(points) {
  return [[points.map(([x, z]) => [x, z]).concat([[points[0][0], points[0][1]]])]];
}

function signedRingArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function addTriangleWithNormal(outputPositions, outputNormals, a, b, c) {
  const cross = (p, q, r) => {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  let normal = cross(a, b, c);
  if (normal[1] < 0) { [b, c] = [c, b]; normal = cross(a, b, c); }
  const length = Math.hypot(...normal) || 1;
  for (const point of [a, b, c]) outputPositions.push(FLOAT32(point[0]), FLOAT32(point[1]), FLOAT32(point[2]));
  for (let i = 0; i < 3; i += 1) outputNormals.push(normal[0] / length, normal[1] / length, normal[2] / length);
}

function appendSourceTriangleNormals(target, triangle) {
  const ux = triangle[3] - triangle[0], uy = triangle[4] - triangle[1], uz = triangle[5] - triangle[2];
  const vx = triangle[6] - triangle[0], vy = triangle[7] - triangle[1], vz = triangle[8] - triangle[2];
  const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const length = Math.hypot(...normal) || 1;
  for (let vertex = 0; vertex < 3; vertex += 1) target.push(normal[0] / length, normal[1] / length, normal[2] / length);
}

function sliceValues(source, start, end) {
  return source.subarray ? source.subarray(start, end) : source.slice(start, end);
}

function appendTriangleChunks(positionChunks, normalChunks, source, sourceNormals, offset) {
  positionChunks.push(sliceValues(source, offset, offset + 9));
  if (sourceNormals) normalChunks.push(sliceValues(sourceNormals, offset, offset + 9));
  else {
    const generated = [];
    appendSourceTriangleNormals(generated, sliceValues(source, offset, offset + 9));
    normalChunks.push(new Float32Array(generated));
  }
}

function concatenateFloat32(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function triangulateUnion(union, triangle, heights, spacing, positions, normals) {
  let emitted = 0;
  for (const polygon of union) {
    if (!Array.isArray(polygon) || !polygon.length) continue;
    const rings = polygon.map((raw) => raw.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z)));
    if (rings.some((ring) => ring.length < 3)) throw new Error('Invalid union ring');
    if (!THREE.ShapeUtils.isClockWise(rings[0])) rings[0].reverse();
    for (const hole of rings.slice(1)) if (THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
    const vertices = rings.flat();
    const faces = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1));
    for (const face of faces) {
      if (face.length !== 3 || face.some((index) => !vertices[index])) throw new Error('Invalid triangulated union');
      const points = face.map((index) => {
        const vertex = vertices[index];
        return [vertex.x, planeHeight(vertex.x, vertex.y, triangle.cellX, triangle.cellZ,
          triangle.half, spacing, heights), vertex.y];
      });
      const area = Math.abs((points[1][0] - points[0][0]) * (points[2][2] - points[0][2])
        - (points[1][2] - points[0][2]) * (points[2][0] - points[0][0]));
      if (area < 1e-10) continue;
      addTriangleWithNormal(positions, normals, ...points);
      emitted += 1;
    }
  }
  return emitted;
}

/** Union only source-free, same-grade municipal contact faces that match the shared height lattice. */
export function optimizeRoadGeometry(groups, { heightAt, spacing = 8, maxHeightError = 0.002 } = {}) {
  if (!Array.isArray(groups) || typeof heightAt !== 'function' || !Number.isFinite(spacing) || spacing <= 0
    || !Number.isFinite(maxHeightError) || maxHeightError < 0) throw new TypeError('Invalid road optimizer inputs');
  const stats = { groupsBefore: groups.length, groupsAfter: 0, trianglesBefore: 0, trianglesAfter: 0,
    eligibleTriangles: 0, optimizedBuckets: 0, preservedCustomDecks: 0, preservedSourceGroups: 0,
    fallbackBuckets: 0 };
  const heightCache = new Map();
  const result = groups.map((group) => {
    const input = positionsOf(group);
    stats.trianglesBefore += input.length / 9;
    if (!eligibleGroup(group)) {
      if (hasSourceRanges(group)) stats.preservedSourceGroups += 1;
      if (group?.layer === 'bridges' || group?.kind === 'bridge') stats.preservedCustomDecks += input.length / 9;
      stats.trianglesAfter += input.length / 9;
      return group;
    }

    const buckets = new Map();
    const positionChunks = [];
    const inputNormals = group.normals?.length === input.length ? group.normals : null;
    const normalChunks = [];
    for (let offset = 0; offset < input.length; offset += 9) {
      const candidate = candidateAt(input, offset, spacing);
      if (!candidate) {
        appendTriangleChunks(positionChunks, normalChunks, input, inputNormals, offset);
        continue;
      }
      try {
        const heights = nodeHeights(candidate.cellX, candidate.cellZ, candidate.half, spacing, heightAt, heightCache);
        const matches = candidate.points.every(([x, z], point) => {
          const y = input[offset + point * 3 + 1];
          return Number.isFinite(y) && Math.abs(y - planeHeight(x, z, candidate.cellX,
            candidate.cellZ, candidate.half, spacing, heights)) <= maxHeightError;
        });
        if (!matches) {
          appendTriangleChunks(positionChunks, normalChunks, input, inputNormals, offset);
          stats.preservedCustomDecks += 1;
          continue;
        }
        const key = `${candidate.cellX}:${candidate.cellZ}:${candidate.half}`;
        if (!buckets.has(key)) buckets.set(key, { ...candidate, heights, triangles: [] });
        buckets.get(key).triangles.push(offset);
        stats.eligibleTriangles += 1;
      } catch {
        appendTriangleChunks(positionChunks, normalChunks, input, inputNormals, offset);
        const key = `${candidate.cellX}:${candidate.cellZ}:${candidate.half}:height-error`;
        buckets.set(key, { fallback: true });
      }
    }

    for (const bucket of buckets.values()) {
      if (bucket.fallback) { stats.fallbackBuckets += 1; continue; }
      const original = bucket.triangles;
      try {
        const pointsFor = (offset) => [[input[offset], input[offset + 2]], [input[offset + 3], input[offset + 5]],
          [input[offset + 6], input[offset + 8]]];
        const union = polygonClipping.union(...original.map((offset) => trianglePolygon(pointsFor(offset))));
        const originalArea = original.reduce((sum, offset) => {
          const points = pointsFor(offset);
          return sum + Math.abs((points[1][0] - points[0][0]) * (points[2][1] - points[0][1])
            - (points[1][1] - points[0][1]) * (points[2][0] - points[0][0])) / 2;
        }, 0);
        const unionArea = (polygons) => polygons.reduce((sum, polygon) => sum + polygon.reduce((polyArea, ring, index) => {
          const ringArea = Math.abs(signedRingArea(ring.slice(0, -1).map(([x, z]) => ({ x, y: z }))));
          return polyArea + (index === 0 ? ringArea : -ringArea);
        }, 0), 0);
        const areaTolerance = Math.max(1e-5, originalArea * 1e-7);
        if (!Array.isArray(union) || unionArea(union) <= 0 || unionArea(union) > originalArea + areaTolerance) {
          throw new Error('Polygon union changed source area');
        }
        const bucketPositions = [], bucketNormals = [];
        const emitted = triangulateUnion(union, bucket, bucket.heights, spacing, bucketPositions, bucketNormals);
        if (!emitted) throw new Error('Polygon union produced no faces');
        positionChunks.push(new Float32Array(bucketPositions));
        normalChunks.push(new Float32Array(bucketNormals));
        stats.optimizedBuckets += 1;
      } catch {
        stats.fallbackBuckets += 1;
        for (const offset of original) {
          appendTriangleChunks(positionChunks, normalChunks, input, inputNormals, offset);
        }
      }
    }
    const positions = concatenateFloat32(positionChunks);
    const normals = concatenateFloat32(normalChunks);
    const optimized = { ...group, positions };
    if (normals.length === positions.length) optimized.normals = normals;
    else if (group.normals) delete optimized.normals;
    stats.trianglesAfter += positions.length / 9;
    return optimized;
  });
  stats.groupsAfter = result.length;
  stats.triangleReduction = stats.trianglesBefore - stats.trianglesAfter;
  return { groups: result, stats };
}
