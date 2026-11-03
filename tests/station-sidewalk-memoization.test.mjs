import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';

const source = fs.readFileSync(new URL('../city-explorer/app.js', import.meta.url), 'utf8');

function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`unterminated ${name}`);
}

function createBuilder({ memoize = true, index }) {
  const samples = { pavement: 0, terrain: 0 };
  const state = { renderedPavementIndex: { sample(...args) { samples.pavement += 1; return index(...args); } } };
  const roadGroup = new THREE.Group();
  const context = vm.createContext({
    THREE, state, roadGroup, materials: { sidewalk: new THREE.MeshBasicMaterial() }, lowPowerProfile: true,
    CURB_REVEAL: 0.16,
    stationRoadDetailWeight: () => 1,
    terrainHeightAtWorld(x, z) { samples.terrain += 1; return x * 0.01 + z * 0.02; },
    pavementSupportBottom: (top, terrain) => Math.min(top - 0.12, terrain - 0.05),
    recordSherbrookeSidewalk() {},
    stateObjectCount: 0,
  });
  vm.runInContext(`${declaration('stationAdjacentPavementHeight')}\n${declaration('createExactCoordinateMemo')}\n${declaration('buildStationSidewalkRibbons')}`, context);
  if (!memoize) vm.runInContext('createExactCoordinateMemo = sample => sample', context);
  else context.state = state;
  return {
    samples,
    positions() { return Array.from(roadGroup.children.at(-1).geometry.attributes.position.array); },
    build(segments) { vm.runInContext('buildStationSidewalkRibbons', context)(segments); },
  };
}

function segments() {
  return [
    { a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, width: 2, name: 'other' },
    { a: { x: 3, y: 4 }, b: { x: 5, y: 6 }, width: 2, name: 'other' },
  ];
}

test('memoization preserves ribbon geometry and reduces exact repeated pavement and terrain samples', () => {
  const index = (x, z) => ({ height: 7 + x * 0.1 + z * 0.01, layer: 'roads' });
  const legacy = createBuilder({ memoize: false, index });
  legacy.build(segments());
  const optimized = createBuilder({ memoize: true, index });
  optimized.build(segments());
  assert.deepEqual(optimized.positions(), legacy.positions());
  assert.ok(optimized.samples.pavement < legacy.samples.pavement);
  assert.ok(optimized.samples.terrain < legacy.samples.terrain);
});

test('memoization is pass-local, caches null results, and keeps the bridge exclusion and nearby pavement search', () => {
  let height = 8;
  let calls = 0;
  const index = (x, z) => {
    calls += 1;
    if (x === 10 && z === 20) return { height: 90, layer: 'bridges' };
    return { height, layer: 'roads' };
  };
  const builder = createBuilder({ index });
  const sharedEndpoint = [
    { a: { x: 10, y: 20 }, b: { x: 10, y: 21 }, width: 1, name: 'other' },
    { a: { x: 10, y: 20 }, b: { x: 10, y: 22 }, width: 1, name: 'other' },
  ];
  builder.build(sharedEndpoint);
  const firstPassCalls = calls;
  assert.equal(firstPassCalls, 19, 'bridge hit is excluded, then all nearest-radius samples are used once and the shared endpoint is cached');
  assert.ok(builder.positions().some((value, i) => i % 3 === 1 && Math.abs(value - 8.16) < 1e-5));
  height = 12;
  builder.build(sharedEndpoint);
  assert.equal(calls, firstPassCalls * 2, 'the next build must observe changed pavement data');
  assert.ok(builder.positions().some((value, i) => i % 3 === 1 && Math.abs(value - 12.16) < 1e-5));

  let nullCalls = 0;
  const empty = createBuilder({ index: () => { nullCalls += 1; return null; } });
  empty.build(sharedEndpoint);
  const firstNullPassCalls = nullCalls;
  assert.equal(firstNullPassCalls, 291, 'null results for the three unique endpoints are cached within the build');
  empty.build(sharedEndpoint);
  assert.equal(nullCalls, firstNullPassCalls * 2, 'null result cache is discarded after each build');
});
