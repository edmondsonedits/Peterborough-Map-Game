import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';

const close = (actual, expected, message) => {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8,
    `${message}: expected ${expected}, received ${actual}`);
};
const plane = (x, z) => 100 + 0.1 * x + 0.2 * z;
const index = new RenderedPavementIndex(5);
index.addTriangle(0, 100, 0, 20, 102, 0, 20, 106, 20,
  { id: 'south', layer: 'road_surfaces' });
index.addTriangle(0, 100, 0, 20, 106, 20, 0, 104, 20,
  { id: 'north', layer: 'road_surfaces' });
assert.equal(index.triangleCount, 2);

// Sample both triangle interiors, shared edges, vertices and hash-cell boundaries.
for (const [x, z] of [[15, 2], [2, 15], [5, 10], [10, 5], [10, 10],
  [0, 0], [20, 0], [20, 20], [0, 20], [0, 10], [20, 10]]) {
  const sample = index.sample(x, z);
  assert.ok(sample, `Pavement missing at ${x}, ${z}`);
  close(sample.height, plane(x, z), `Barycentric pavement height at ${x}, ${z}`);
  assert.equal(sample.layer, 'road_surfaces');
}
assert.equal(index.sample(15, 2).id, 'south');
assert.equal(index.sample(2, 15).id, 'north');
for (const [x, z] of [[-0.01, 10], [10, -0.01], [20.01, 10], [10, 20.01], [1000, 1000]]) {
  assert.equal(index.sample(x, z), null, `Off-pavement query ${x}, ${z}`);
}

// A single triangle must reject points inside its bounding box but outside its face.
// Reversed winding and negative cells must preserve the same geometric semantics.
const negative = new RenderedPavementIndex(5);
negative.addTriangle(-20, 98, -20, -20, 100, 0, 0, 102, 0,
  { id: 'negative', layer: 'road_surfaces' });
close(negative.sample(-15, -10).height, 99.5, 'Negative coordinates / reversed winding');
assert.equal(negative.sample(-1, -19), null);
assert.equal(negative.sample(-20, -20).id, 'negative');

// Degenerate projected geometry cannot support a road-level height, even if its
// vertices form a vertical 3D face. Invalid input must not enter the index.
const rejected = new RenderedPavementIndex();
for (const vertices of [
  [0, 1, 0, 0, 1, 0, 0, 1, 0],
  [0, 1, 0, 1, 5, 1, 2, 1, 2],
  [0, 1, 0, 0, 5, 0, 2, 1, 2],
  [NaN, 1, 0, 10, 1, 0, 0, 1, 10],
  [0, Infinity, 0, 10, 1, 0, 0, 1, 10],
  [0, 1, 0, 10, 1, 0, 0, 1, -Infinity],
]) rejected.addTriangle(...vertices);
assert.equal(rejected.triangleCount, 0);
assert.equal(rejected.sample(0, 0), null);

const decks = new RenderedPavementIndex(5);
// Insert in an order that distinguishes height selection from insertion order.
for (const [height, id, layer] of [[15, 'bridge', 'bridges'],
  [1, 'street', 'road_surfaces'], [20, 'parking', 'parking_surfaces']]) {
  decks.addTriangle(0, height, 0, 10, height, 0, 0, height, 10, { id, layer });
}
assert.equal(decks.sample(2, 2).id, 'parking');
assert.equal(decks.sample(2, 2, null).id, 'parking', 'null is no height hint, not zero');
assert.equal(decks.sample(2, 2, 0).id, 'street', 'Zero is a valid height hint');
assert.equal(decks.sample(2, 2, 14).id, 'bridge');
assert.equal(decks.sample(2, 2, 19).id, 'parking');
assert.equal(decks.sample(2, 2, null, { includeParking: false }).id, 'bridge');
assert.equal(decks.sample(2, 2, 19, { includeParking: false }).id, 'bridge');
const parkingOnly = new RenderedPavementIndex();
parkingOnly.addTriangle(0, 1, 0, 10, 1, 0, 0, 1, 10,
  { id: 'lot', layer: 'parking_surfaces' });
assert.equal(parkingOnly.sample(2, 2, null, { includeParking: false }), null);

// Drive across the shared diagonal: no holes or elevation jump between faces.
let previous = null;
let largestStep = 0;
for (let step = 0; step <= 200; step += 1) {
  const x = step / 10;
  const height = index.sample(x, 10)?.height;
  close(height, plane(x, 10), `Continuous crossing at x=${x}`);
  if (previous !== null) largestStep = Math.max(largestStep, Math.abs(height - previous));
  previous = height;
}
close(largestStep, 0.01, 'Shared seam has only the expected slope increment');

// Synthetic regression metric, not a claim of measured citywide improvement:
// applying one segment-midpoint height to this 20 m slope misses visible pavement.
const probeX = [0, 5, 10, 15, 20];
const midpointHeight = plane(10, 10);
const scalarErrors = probeX.map((x) => Math.abs(midpointHeight - plane(x, 10)));
const triangleErrors = probeX.map((x) => Math.abs(index.sample(x, 10).height - plane(x, 10)));
const scalarMax = Math.max(...scalarErrors);
const triangleMax = Math.max(...triangleErrors);
close(scalarMax, 1, 'Synthetic scalar maximum mismatch');
close(triangleMax, 0, 'Rendered-triangle maximum mismatch');

// Exercise the actual gameplay integration without creating a WebGL renderer.
// Keep this extraction tied to a top-level function boundary, not its internals.
const appSource = readFileSync(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
const gameplayFunction = appSource.match(/^function gameplaySurfaceAt\([^]*?^\}/m)?.[0];
assert.ok(gameplayFunction, 'Gameplay surface entry point exists');
let terrainHeight = 90;
let nearbyRoad = { height: 103, name: 'Test Street', onRoad: false };
let lastRoadQuery = null;
const gameplayState = {
  renderedPavementIndex: index,
  roadSurfaceIndex: { sample(...args) { lastRoadQuery = args; return nearbyRoad; } },
};
const gameplaySurfaceAt = runInNewContext(`${gameplayFunction}\ngameplaySurfaceAt`, {
  state: gameplayState,
  terrainHeightAtWorld: () => terrainHeight,
});
let surface = gameplaySurfaceAt(0, 10, 102);
close(surface.height, 102, 'Gameplay follows sloping pavement outside centreline width');
assert.equal(surface.name, 'Test Street', 'Nearby road naming survives mesh height lookup');
assert.equal(surface.onRoad, true, 'Measured apron remains traversable');
assert.equal(surface.heightSource, 'rendered-pavement-triangle');
assert.equal(lastRoadQuery[3], 102, 'Actor height reaches road deck selection');
nearbyRoad = { height: 99, name: 'Test Street', onRoad: true };
close(gameplaySurfaceAt(0, 10, 99).height, 102,
  'Ordinary steep pavement must not revert to a conflicting centreline');

// Empty or partially loaded mesh data must retain the existing road/terrain path.
gameplayState.renderedPavementIndex = new RenderedPavementIndex();
nearbyRoad = { height: 93, name: 'Fallback Street', onRoad: true };
surface = gameplaySurfaceAt(2, 2, 93);
close(surface.height, 93, 'Road fallback without municipal mesh');
assert.equal(surface.name, 'Fallback Street');
assert.equal(surface.onRoad, true);
assert.equal(surface.heightSource, 'road-ribbon');
nearbyRoad = { height: 120, name: 'Nearby bridge', onRoad: false };
surface = gameplaySurfaceAt(2, 2);
close(surface.height, 90, 'Off-road actor does not snap onto a nearby elevated road');
assert.equal(surface.onRoad, false);
assert.equal(surface.heightSource, 'terrain');
nearbyRoad = null;
assert.equal(gameplaySurfaceAt(2, 2).name, 'Off road');

// Only a bridge face may be packaged above an OSM underpass. A moving actor's
// previous height must retain the physical deck, while a hintless lookup uses
// the visible top face. Mere horizontal proximity cannot select the underpass.
const bridgeOnly = new RenderedPavementIndex();
bridgeOnly.addTriangle(0, 15, 0, 10, 15, 0, 0, 15, 10,
  { id: 'bridge', layer: 'bridges' });
gameplayState.renderedPavementIndex = bridgeOnly;
terrainHeight = 0;
nearbyRoad = { height: 1, name: 'Underpass', onRoad: true };
close(gameplaySurfaceAt(2, 2, 1).height, 1, 'Ground road retained beneath bridge');
close(gameplaySurfaceAt(2, 2, 15).height, 15, 'Bridge actor stays on bridge');
close(gameplaySurfaceAt(2, 2, null).height, 15, 'Hintless sample prefers visible bridge');
nearbyRoad = { height: 1, name: 'Underpass', onRoad: false };
close(gameplaySurfaceAt(2, 2, 1).height, 15, 'Nearby underpass outside its width is excluded');
nearbyRoad = { height: 14.75, name: 'Bridge road', onRoad: true };
close(gameplaySurfaceAt(2, 2, 14.75).height, 15, 'Small overlay differences retain exact mesh height');

console.log(JSON.stringify({ status: 'pass', slopeAndBoundaryQueries: true,
  negativeCoordinates: true, degenerateRejected: true, stackedDeckSelection: true,
  parkingFilter: true, seamCrossingSamples: 201, gameplayIntegration: true,
  missingMeshFallback: true, underpassDeckContinuity: true,
  syntheticSlopeMetric: { lengthMetres: 20, centrelineScalarMaxErrorMetres: scalarMax,
    renderedTriangleMaxErrorMetres: triangleMax, seamStepMetres: Number(largestStep.toFixed(8)) } }));
