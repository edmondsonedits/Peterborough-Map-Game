import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  HydroSurfaceIndex,
  createWaterStageSampler,
  relativeWaterElevation,
  robustFallbackWaterHeight,
  subdivideWaterTriangle,
  triangleMaximumPlanarEdge,
  watercourseWidth,
} from '../../city-explorer/water-system.js';

assert.ok(Math.abs(relativeWaterElevation(192.46, 200, 0.06) + 7.48) < 1e-9);
assert.ok(Number.isNaN(relativeWaterElevation(undefined, 200)));
assert.equal(robustFallbackWaterHeight([10, 10, 10, 30], 0.05), 10.05);
assert.equal(watercourseWidth({ official_name_label: 'Jackson Creek', permanency: 'Permanent' }), 3.2);
assert.equal(watercourseWidth({ permanency: 'Intermittent' }), 0.9);

const index = new HydroSurfaceIndex(10);
index.addTriangle({ x: 0, y: 10, z: 0 }, { x: 10, y: 20, z: 0 }, { x: 0, y: 10, z: 10 });
assert.equal(index.heightAt(2, 2), 12);
assert.ok(Number.isNaN(index.heightAt(9, 9)));
assert.ok(Number.isNaN(index.heightAt(30, 30)));

const stagedRings = [[
  { x: 0, y: 10, z: 0 }, { x: 1000, y: 20, z: 0 },
  { x: 1000, y: 20, z: 50 }, { x: 0, y: 10, z: 50 },
]];
const stagedSampler = createWaterStageSampler(stagedRings, { sampleSpacing: 25, cellSize: 75, fallbackHeight: 10 });
const split = subdivideWaterTriangle(stagedRings[0][0], stagedRings[0][1], stagedRings[0][2], stagedSampler, { maximumEdge: 72 });
assert.ok(split.length > 1);
assert.ok(Math.max(...split.map(triangleMaximumPlanarEdge)) <= 72.001);
assert.ok(split.flat().every((vertex) => [vertex.x, vertex.y, vertex.z].every(Number.isFinite)));

// Guard the packaged multi-stage Otonabee/Lift Lock topology that exposed the
// original kilometre-long Earcut interpolation defect.
const hydro = JSON.parse(await readFile(new URL('../../city-explorer/data/peterborough-hydrography.geojson', import.meta.url), 'utf8'));
const complexStages = hydro.features.filter((feature) => ['lidar/61', 'lidar/62'].includes(String(feature.id)));
assert.equal(complexStages.length, 2);
for (const feature of complexStages) {
  const elevations = feature.geometry.coordinates.flat().map((coordinate) => Number(coordinate[2])).filter(Number.isFinite);
  assert.ok(elevations.length > 100);
  assert.ok(Math.max(...elevations) - Math.min(...elevations) > 9);
  assert.equal(feature.properties.surface_model, 'polygonz-breakline-stage');
}

console.log(JSON.stringify({ status: 'pass', indexedTriangles: index.triangleCount, subdividedTriangles: split.length, packagedStageFeatures: complexStages.length }));
