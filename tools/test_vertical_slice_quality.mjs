import assert from 'node:assert/strict';
import {
  coordinateInVerticalSlice,
  installWorldSurfaceDetail,
  projectedVerticalSliceBounds,
  worldPointInVerticalSlice,
} from '../city-explorer/vertical-slice-quality.js';

assert.equal(coordinateInVerticalSlice(44.3042, -78.3194), true, 'Peterborough Square must be in the hero slice');
assert.equal(coordinateInVerticalSlice(44.2954, -78.3180), true, 'Del Crary Park must be in the hero slice');
assert.equal(coordinateInVerticalSlice(44.2981, -78.3018), true, 'Canadian Canoe Museum must be in the hero slice');
assert.equal(coordinateInVerticalSlice(44.3572, -78.2907), false, 'Trent must remain outside this focused slice');

const project = (lat, lon) => ({ x: lon * 1000, y: -lat * 1000 });
const bounds = projectedVerticalSliceBounds(project, 50);
assert.ok(bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ);
assert.equal(worldPointInVerticalSlice((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, bounds), true);
assert.equal(worldPointInVerticalSlice(bounds.maxX + 1, bounds.maxZ + 1, bounds), false);

const material = { userData: {}, needsUpdate: false, onBeforeCompile: null };
assert.equal(installWorldSurfaceDetail(material, 'asphalt'), true);
assert.equal(installWorldSurfaceDetail(material, 'asphalt'), false, 'shader decoration must be idempotent');
const shader = {
  vertexShader: '#include <common>\n#include <begin_vertex>',
  fragmentShader: '#include <common>\nvec4 diffuseColor = vec4( diffuse, opacity );',
};
material.onBeforeCompile(shader, null);
assert.match(shader.vertexShader, /vAaaWorldPosition/);
assert.match(shader.fragmentShader, /aaaAggregate/);
assert.equal(material.customProgramCacheKey(), 'ptbo-world-surface-asphalt-v1');

for (const [kind, fragmentMarker] of [['grass', 'aaaGrassPatch'], ['water', 'aaaWaterLight']]) {
  const surfaceMaterial = { userData: {}, needsUpdate: false, onBeforeCompile: null };
  assert.equal(installWorldSurfaceDetail(surfaceMaterial, kind), true);
  const surfaceShader = {
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\nvec4 diffuseColor = vec4( diffuse, opacity );',
  };
  surfaceMaterial.onBeforeCompile(surfaceShader, null);
  assert.match(surfaceShader.fragmentShader, new RegExp(fragmentMarker));
}

console.log(JSON.stringify({
  status: 'pass',
  heroLocations: 3,
  deterministicSurfaceShaders: ['asphalt', 'grass', 'water'],
  boundedQualityLayer: true,
}, null, 2));
