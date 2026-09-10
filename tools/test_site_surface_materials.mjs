import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STATION_APRON, STATION_REAR_PAVING, installStationApron } from '../city-explorer/site-surface-materials.js';
import { installWorldSurfaceDetail } from '../city-explorer/vertical-slice-quality.js';
import { STATION_VIEWS, installQualityCapture } from '../city-explorer/quality-capture.js';

const survey = JSON.parse(await readFile(new URL('../city-explorer/data/survey/station-one-survey.geojson', import.meta.url), 'utf8'));
const frontage = survey.features.find((feature) => feature.id === 'station1-apparatus-facade').geometry.coordinates;
assert.deepEqual(STATION_APRON.slice(0, 2), frontage, 'apron northern edge must equal surveyed apparatus frontage');
const project = (lat, lon) => ({ x: (lon + 78.32212) * 79500, y: -(lat - 44.301) * 110540 });
for (const polygon of [STATION_APRON, STATION_REAR_PAVING]) {
  assert.ok(polygon.length >= 3);
  const points = polygon.map(([lon, lat]) => {
    assert.ok(Number.isFinite(lon) && Number.isFinite(lat));
    assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90);
    return project(lat, lon);
  });
  const turns = points.map((a, i) => {
    const b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  });
  assert.ok(turns.every((turn) => turn > 0) || turns.every((turn) => turn < 0), 'shader half-plane mask requires a convex polygon');
}
assert.ok(STATION_APRON.slice(2).every((point) => point[1] < Math.min(...frontage.map((p) => p[1]))));

let called = 0, seenRenderer;
const sentinelRenderer = {};
const material = {
  userData: {}, needsUpdate: false,
  onBeforeCompile(shader, renderer) { called++; seenRenderer = renderer; shader.fragmentShader += '\n// previous decorator'; },
  customProgramCacheKey() { return 'base'; },
};
installWorldSurfaceDetail(material, 'asphalt');
const earlierKey = material.customProgramCacheKey();
const vertex = '#include <common>\n#include <begin_vertex>\n#include <project_vertex>';
const fragment = '#include <common>\nvoid main() { vec4 diffuseColor = vec4(1.0);\n#include <color_fragment>\n}';
const baseline = { vertexShader: vertex, fragmentShader: fragment };
material.onBeforeCompile(baseline, sentinelRenderer);
const geometry = Object.freeze({ positions: Object.freeze([0, 12, 0, 1, 13, 0]), height: 12 });
const mesh = Object.freeze({ geometry, position: Object.freeze({ x: 0, y: 12, z: 0 }), material });
const snapshot = JSON.stringify({ geometry: mesh.geometry, position: mesh.position, zones: [STATION_APRON, STATION_REAR_PAVING] });
installStationApron(material, project);
assert.equal(material.customProgramCacheKey(), `${earlierKey}-station-surfaces-2`);
assert.equal(material.needsUpdate, true);
const shader = { vertexShader: vertex, fragmentShader: fragment };
material.onBeforeCompile(shader, sentinelRenderer);
assert.equal(called, 2, 'existing decorator remains chained');
assert.equal(seenRenderer, sentinelRenderer);
assert.equal(shader.vertexShader, baseline.vertexShader, 'surface mask must not alter vertex or height shader');
assert.match(shader.fragmentShader, /previous decorator/);
assert.match(shader.fragmentShader, /vec2 p = vAaaWorldPosition\.xz/);
assert.match(shader.fragmentShader, /vec3\(0\.40, 0\.39, 0\.35\)/);
assert.match(shader.fragmentShader, /vec3\(0\.105, 0\.115, 0\.11\)/);
assert.equal((shader.fragmentShader.match(/diffuseColor\.rgb = vec3/g) || []).length, 2);
assert.equal(JSON.stringify({ geometry: mesh.geometry, position: mesh.position, zones: [STATION_APRON, STATION_REAR_PAVING] }), snapshot);
for (const view of Object.values(STATION_VIEWS)) {
  for (const key of ['lat', 'lon', 'altitude', 'distance', 'bearing', 'pitch', 'fov']) assert.ok(Number.isFinite(view[key]));
  assert.ok(view.fov > 0 && view.fov < 180);
}
// Capture is strictly opt-in and must not touch normal scene/camera state.
const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
try {
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '' } });
  assert.equal(installQualityCapture({}), null);
} finally {
  if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
  else delete globalThis.location;
}
console.log(JSON.stringify({ status: 'pass', convexZones: 2, surveyedApronFrontage: true, shaderComposition: true, heightUnchanged: true, captureOptIn: true }));
