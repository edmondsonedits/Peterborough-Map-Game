import assert from 'node:assert/strict';
import {
  maximumPlanarTriangleEdge,
  planarTriangleArea,
  subdivideTerrainTriangles,
} from '../city-explorer/land-surface.js';

const largeTriangle = [
  0, 0, 0,
  160, 0, 0,
  0, 0, 120,
];
const sourceArea = planarTriangleArea(largeTriangle);
const tessellated = subdivideTerrainTriangles(largeTriangle, 28);

assert.ok(tessellated.length > largeTriangle.length, 'a block-scale polygon triangle must be subdivided');
assert.ok(
  maximumPlanarTriangleEdge(tessellated) <= 28.000001,
  'every tessellated edge must respect the terrain-conformance limit',
);
assert.ok(
  Math.abs(planarTriangleArea(tessellated) - sourceArea) < 1e-7,
  'tessellation must preserve the exact horizontal footprint area',
);

const winding = [];
for (let offset = 0; offset < tessellated.length; offset += 9) {
  const ax = tessellated[offset];
  const az = tessellated[offset + 2];
  const bx = tessellated[offset + 3];
  const bz = tessellated[offset + 5];
  const cx = tessellated[offset + 6];
  const cz = tessellated[offset + 8];
  winding.push((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
}
assert.ok(winding.every((value) => value > 0), 'subdivision must preserve triangle winding');

const unchanged = subdivideTerrainTriangles(largeTriangle, 500);
assert.deepEqual(unchanged, largeTriangle, 'already-small triangles must remain byte-for-byte stable');
assert.deepEqual(subdivideTerrainTriangles([0, 1, 2], 10), [], 'malformed buffers must be rejected safely');

const capped = subdivideTerrainTriangles(largeTriangle, 0.01, { maximumTriangles: 12 });
assert.ok(capped.length / 9 <= 12, 'the defensive triangle ceiling must be honored');

console.log(JSON.stringify({
  status: 'pass',
  sourceArea,
  triangles: tessellated.length / 9,
  maximumEdge: Number(maximumPlanarTriangleEdge(tessellated).toFixed(3)),
  footprintPreserved: true,
  windingPreserved: true,
}, null, 2));
