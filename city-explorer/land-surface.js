/*
  Terrain-conforming polygon tessellation for Peterborough Explorer.

  OSM land-cover polygons can span several city blocks. Triangulating only the
  source outline produces long planar chords that cut through Peterborough's
  hills even when every outline vertex is sampled from the correct terrain.
  This dependency-free helper bisects the longest plan-view edge until every
  render triangle is small enough to follow the terrain mesh closely.
*/

function planarEdgeLengthSquared(a, b) {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return dx * dx + dz * dz;
}

function midpoint(a, b) {
  return [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ];
}

function appendVertex(target, vertex) {
  target.push(vertex[0], vertex[1], vertex[2]);
}

function triangleFromPositions(positions, offset) {
  return {
    a: [positions[offset], positions[offset + 1], positions[offset + 2]],
    b: [positions[offset + 3], positions[offset + 4], positions[offset + 5]],
    c: [positions[offset + 6], positions[offset + 7], positions[offset + 8]],
    depth: 0,
  };
}

/** Return the longest plan-view edge in an unindexed triangle buffer. */
export function maximumPlanarTriangleEdge(positions) {
  if (!positions?.length || positions.length % 9 !== 0) return 0;
  let maximumSquared = 0;
  for (let offset = 0; offset < positions.length; offset += 9) {
    const triangle = triangleFromPositions(positions, offset);
    maximumSquared = Math.max(
      maximumSquared,
      planarEdgeLengthSquared(triangle.a, triangle.b),
      planarEdgeLengthSquared(triangle.b, triangle.c),
      planarEdgeLengthSquared(triangle.c, triangle.a),
    );
  }
  return Math.sqrt(maximumSquared);
}

/** Return the summed horizontal area of an unindexed triangle buffer. */
export function planarTriangleArea(positions) {
  if (!positions?.length || positions.length % 9 !== 0) return 0;
  let area = 0;
  for (let offset = 0; offset < positions.length; offset += 9) {
    const ax = positions[offset];
    const az = positions[offset + 2];
    const bx = positions[offset + 3];
    const bz = positions[offset + 5];
    const cx = positions[offset + 6];
    const cz = positions[offset + 8];
    area += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
  }
  return area;
}

/**
 * Subdivide unindexed triangles without changing their plan-view footprint.
 *
 * `maximumTriangles` is a defensive ceiling for malformed source geometry.
 * Normal Peterborough land polygons remain well below it. Winding is retained
 * so material culling and vertex normals remain stable.
 */
export function subdivideTerrainTriangles(
  positions,
  maximumEdgeLength,
  { maximumDepth = 14, maximumTriangles = 240000 } = {},
) {
  if (!positions?.length || positions.length % 9 !== 0) return [];
  if (!Number.isFinite(maximumEdgeLength) || maximumEdgeLength <= 0) return Array.from(positions);

  const edgeLimitSquared = maximumEdgeLength * maximumEdgeLength;
  const pending = [];
  for (let offset = positions.length - 9; offset >= 0; offset -= 9) {
    pending.push(triangleFromPositions(positions, offset));
  }

  const output = [];
  let emittedTriangles = 0;
  while (pending.length) {
    let { a, b, c, depth } = pending.pop();
    const ab = planarEdgeLengthSquared(a, b);
    const bc = planarEdgeLengthSquared(b, c);
    const ca = planarEdgeLengthSquared(c, a);
    const longest = Math.max(ab, bc, ca);
    const maySplit = longest > edgeLimitSquared
      && depth < maximumDepth
      && emittedTriangles + pending.length + 2 <= maximumTriangles;

    if (!maySplit) {
      appendVertex(output, a);
      appendVertex(output, b);
      appendVertex(output, c);
      emittedTriangles += 1;
      continue;
    }

    // Rotate cyclically so the longest edge is always A-B. Cyclic rotation
    // preserves the original winding order.
    if (bc >= ab && bc >= ca) {
      [a, b, c] = [b, c, a];
    } else if (ca >= ab && ca >= bc) {
      [a, b, c] = [c, a, b];
    }
    const middle = midpoint(a, b);
    const nextDepth = depth + 1;
    // Push in reverse display order because the stack is LIFO.
    pending.push({ a: middle, b, c, depth: nextDepth });
    pending.push({ a, b: middle, c, depth: nextDepth });
  }

  return output;
}
