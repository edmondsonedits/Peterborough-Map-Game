/*
  Exact height queries for the rendered Peterborough terrain mesh.

  THREE.PlaneGeometry draws every grid cell as two triangles. Bilinear
  interpolation is a different surface (especially across saddles), so using it
  for roads and buildings can place otherwise-correct geometry below or above
  the pixels the player actually sees. This module mirrors PlaneGeometry's
  diagonal and barycentric interpolation without depending on Three.js or the
  DOM, which also makes the datum contract straightforward to test.
*/

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function validGrid(grid) {
  const segments = Number(grid?.segments);
  const size = Number(grid?.size);
  return Number.isInteger(segments)
    && segments > 0
    && Number.isFinite(size)
    && size > 0
    && Number.isFinite(Number(grid?.minX))
    && Number.isFinite(Number(grid?.minZ))
    && grid?.heights?.length >= (segments + 1) * (segments + 1);
}

/**
 * Return the height of the actual triangle rendered at a world-space point.
 * Coordinates outside the mesh clamp to its nearest edge, matching the former
 * terrain query contract and keeping callers safe during camera-boundary QA.
 */
export function sampleTriangulatedTerrainHeight(grid, x, z) {
  if (!validGrid(grid)) return 0;

  const segments = grid.segments;
  const stride = segments + 1;
  const coordinateX = clamp((x - grid.minX) / grid.size * segments, 0, segments);
  const coordinateZ = clamp((z - grid.minZ) / grid.size * segments, 0, segments);
  const x0 = Math.floor(coordinateX);
  const z0 = Math.floor(coordinateZ);
  const x1 = Math.min(segments, x0 + 1);
  const z1 = Math.min(segments, z0 + 1);
  const tx = coordinateX - x0;
  const tz = coordinateZ - z0;

  const h00 = grid.heights[z0 * stride + x0];
  const h10 = grid.heights[z0 * stride + x1];
  const h01 = grid.heights[z1 * stride + x0];
  const h11 = grid.heights[z1 * stride + x1];

  // PlaneGeometry indices each cell as (h00, h01, h10) and
  // (h01, h11, h10), with the diagonal running from h01 to h10.
  if (tx + tz <= 1) {
    return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  }
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}
