import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import polygonClipping from '../city-explorer/vendor/polygon-clipping-0.15.7.js';
import { collectRoadGridNodes, optimizeRoadGeometry } from '../city-explorer/road-pack-optimize.js';

const group = (positions, extras = {}) => ({ materialKey: 'officialRoad', kind: 'official-road_surfaces',
  layer: 'road_surfaces', contact: 'official', positions: new Float32Array(positions), ...extras });
const tri = (a, b, c, y = 0) => [a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]];
const heightAt = () => 0;

function areaXZ(positions) {
  let area = 0;
  for (let i = 0; i < positions.length; i += 9) {
    area += Math.abs((positions[i + 3] - positions[i]) * (positions[i + 8] - positions[i + 2])
      - (positions[i + 5] - positions[i + 2]) * (positions[i + 6] - positions[i])) / 2;
  }
  return area;
}

function containsXZ(positions, x, z) {
  for (let i = 0; i < positions.length; i += 9) {
    const ax=positions[i], az=positions[i+2], bx=positions[i+3], bz=positions[i+5], cx=positions[i+6], cz=positions[i+8];
    const det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
    if (Math.abs(det)<1e-10) continue;
    const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det;
    const b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det;
    const c=1-a-b;
    if(a>=-1e-7&&b>=-1e-7&&c>=-1e-7)return true;
  }
  return false;
}

test('collectRoadGridNodes returns unique canonical corners for eligible official triangles', () => {
  const input = group([...tri([0,0],[8,0],[0,8]), ...tri([0,0],[4,0],[0,4])]);
  const nodes = collectRoadGridNodes([input]);
  assert.deepEqual(nodes, [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 0, z: 8 }]);
});

test('translated Float32 vertices quantized just across a lattice diagonal still optimize', () => {
  const input = group(tri([4000.1,7.9],[4001,6],[4000.5,7]));
  const result = optimizeRoadGeometry([input], { heightAt });
  assert.equal(result.stats.eligibleTriangles, 1);
  assert.equal(result.stats.optimizedBuckets, 1);
  assert.ok(collectRoadGridNodes([input]).some(node => node.x === 4000 && node.z === 0));
  assert.ok(result.groups[0].positions.every(Number.isFinite));
  for (let i = 0; i < input.positions.length; i += 3) {
    const found = Array.from(result.groups[0].positions).some((_, vertex) => vertex % 3 === 0
      && result.groups[0].positions[vertex] === input.positions[i]
      && result.groups[0].positions[vertex + 2] === input.positions[i + 2]);
    assert.ok(found, 'optimizer keeps each source Float32 XZ boundary without snapping');
  }
});

test('fragmented eligible planar faces union into fewer triangles without changing footprint', () => {
  const center = [8 / 3, 8 / 3];
  const input = group([
    ...tri([0,0],[8,0],center),
    ...tri([8,0],[0,8],center),
    ...tri([0,8],[0,0],center),
  ], { surveyLayer: 'municipal-original' });
  const result = optimizeRoadGeometry([input], { heightAt });
  assert.ok(result.groups[0].positions.length / 9 < input.positions.length / 9);
  assert.ok(result.stats.trianglesAfter < result.stats.trianglesBefore);
  assert.equal(result.stats.trianglesBefore, 3);
  assert.equal(result.stats.trianglesAfter, 1);
  assert.ok(Math.abs(areaXZ(result.groups[0].positions) - areaXZ(input.positions)) < 1e-5);
  assert.equal(result.groups[0].normals.length, result.groups[0].positions.length);
  assert.ok(Array.from(result.groups[0].normals).every(Number.isFinite));
  assert.equal(result.groups[0].surveyLayer, 'municipal-original');
  assert.ok(containsXZ(result.groups[0].positions, 1, 1));
});

test('union preserves a polygon hole and exact outer footprint area', () => {
  const band = (x0,z0,x1,z1) => [
    ...tri([x0,z0],[x1,z0],[x1,z1]), ...tri([x0,z0],[x1,z1],[x0,z1]),
  ];
  const input = group([
    ...band(0.5,0.5,3.5,1.5), ...band(0.5,2.5,3.5,3.5),
    ...band(0.5,1.5,1.5,2.5), ...band(2.5,1.5,3.5,2.5),
  ]);
  const result = optimizeRoadGeometry([input], { heightAt });
  assert.ok(Math.abs(areaXZ(result.groups[0].positions) - 8) < 1e-5);
  assert.equal(containsXZ(result.groups[0].positions, 2, 2), false);
  assert.equal(containsXZ(result.groups[0].positions, 1, 1), true);
});

test('overlapping fragments union to one footprint without duplicating municipal area', () => {
  const face = tri([0,0],[8,0],[0,8]);
  const input = group([...face, ...face]);
  const result = optimizeRoadGeometry([input], { heightAt });
  assert.equal(result.groups[0].positions.length / 9, 1);
  assert.equal(areaXZ(result.groups[0].positions), 32);
});

test('output triangles share canonical heights at neighboring grid-cell edges', () => {
  const input = group([
    0,0,0, 8,1,0, 0,0,8,
    8,1,0, 16,2,0, 8,1,8,
  ]);
  const result = optimizeRoadGeometry([input], { heightAt: (x) => x * 0.125 });
  const seamHeights = [];
  const p = result.groups[0].positions;
  for (let i=0;i<p.length;i+=3) if (p[i]===8&&p[i+2]===0) seamHeights.push(p[i+1]);
  assert.ok(seamHeights.length >= 2);
  assert.ok(seamHeights.every(y => y === 1));
});

test('custom stacked deck, source-bound groups and unrelated metadata remain unchanged', () => {
  const custom = group(tri([0,0],[8,0],[0,8],10), { kind: 'bridge', layer: 'bridges', custom: 'keep' });
  const sourced = group(tri([0,0],[8,0],[0,8]), { sourceRanges: [{ sourceId: 'way/1', startVertex: 0, vertexCount: 3 }] });
  const wrongGrade = group(tri([0,0],[8,0],[0,8],10), { custom: 'height-mismatch' });
  const result = optimizeRoadGeometry([custom, sourced, wrongGrade], { heightAt });
  assert.deepEqual(Array.from(result.groups[0].positions), Array.from(custom.positions));
  assert.deepEqual(result.groups[0].custom, 'keep');
  assert.deepEqual(Array.from(result.groups[1].positions), Array.from(sourced.positions));
  assert.deepEqual(result.groups[1].sourceRanges, sourced.sourceRanges);
  assert.deepEqual(Array.from(result.groups[2].positions), Array.from(wrongGrade.positions));
  assert.equal(result.groups[2].custom, 'height-mismatch');
  assert.equal(result.stats.preservedCustomDecks, 2);
  assert.equal(result.stats.preservedSourceGroups, 1);
});

test('unsupported height sampling conservatively preserves source geometry', () => {
  const input = group(tri([0,0],[8,0],[0,8]));
  const result = optimizeRoadGeometry([input], { heightAt: () => NaN });
  assert.deepEqual(Array.from(result.groups[0].positions), Array.from(input.positions));
  assert.equal(result.stats.fallbackBuckets, 1);
  assert.ok(THREE.ShapeUtils.triangulateShape);
});

test('polygon union errors fall back to every original Float32 face', () => {
  const input = group(tri([0,0],[8,0],[0,8]));
  const union = polygonClipping.union;
  try {
    polygonClipping.union = () => { throw new Error('synthetic clipping failure'); };
    const result = optimizeRoadGeometry([input], { heightAt });
    assert.deepEqual(Array.from(result.groups[0].positions), Array.from(input.positions));
    assert.equal(result.stats.fallbackBuckets, 1);
  } finally {
    polygonClipping.union = union;
  }
});
