import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConnectedRoadSurface } from '../city-explorer/connected-road-surface.js';

const profile = (width = 8, overrides = {}) => ({
  width, edgeExtra: 1, surfaceKey: 'roadLocal', edgeKey: 'roadEdge',
  bridge: false, tunnel: false, renderClass: 'local', ...overrides,
});
const line = (id, coordinates, options = {}) => {
  const samples = coordinates.map(([x, z, height = 0], sourceIndex) => ({
    x, y: z, height, distance: sourceIndex ? undefined : 0,
    sourceVertex: true, sourceIndex,
  }));
  let distance = 0;
  samples.forEach((sample, index) => {
    if (index) distance += Math.hypot(sample.x - samples[index - 1].x, sample.y - samples[index - 1].y);
    sample.distance = distance;
  });
  return { id, tags: options.tags || { highway: 'residential', layer: '0' }, profile: profile(options.width || 8, options.profile), samples };
};
const flatT = () => [
  line('main', [[-30, 0], [0, 0], [30, 0]]),
  line('branch', [[0, 0], [0, 25]]),
];
const xyz = (positions) => Array.from(positions || []);
const finite = (values) => values.every(Number.isFinite);
const triangleCount = (values) => values.length / 9;
const near = (a, b, epsilon = 1e-4) => Math.abs(a - b) <= epsilon;

test('builds one connected T mouth from source-connected arms', () => {
  const result = buildConnectedRoadSurface(flatT());
  assert.equal(result.junctions.length, 1);
  assert.deepEqual(new Set(result.junctions[0].lineIds), new Set(['main', 'branch']));
  assert.ok(triangleCount(xyz(result.junctions[0].positions)) >= 1);
  for (const item of result.lines) assert.ok(triangleCount(xyz(item.surfacePositions)) > 0);
  assert.equal(result.stats.junctionCount, 1);
});

test('clips short resampled spans using full-chain distance and shares exact Float32 seams', () => {
  const roads = [
    line('west', [[-12, 0], [0, 0]]),
    line('east', [[0, 0], [0.15, 0], [8, 0]]),
    line('north', [[0, 0], [0, 10]]),
  ];
  const result = buildConnectedRoadSurface(roads, { maxTrim: 6 });
  assert.equal(result.junctions.length, 1);
  const node = result.junctions[0];
  assert.ok(node.mouths.length >= 3);
  for (const mouth of node.mouths) {
    const lineResult = result.lines.find((entry) => entry.lineId === mouth.lineId);
    const values = xyz(lineResult.surfacePositions);
    const point = [mouth.left.x, mouth.left.y, mouth.left.z];
    assert.ok(values.some((_v, index) => index % 3 === 0 && near(values[index], point[0]) && near(values[index + 1], point[1]) && near(values[index + 2], point[2])), `left seam for ${mouth.lineId}`);
  }
});

test('uses shared OSM node IDs and keeps distinct colocated nodes disconnected', () => {
  const connectedMain = line('connected-main', [[-20, 0], [0, 0], [20, 0]]);
  const connectedBranch = line('connected-branch', [[0, 0], [0, 20]]);
  connectedMain.samples[1].nodeId = 9001;
  connectedBranch.samples[0].nodeId = 9001;
  const connected = buildConnectedRoadSurface([connectedMain, connectedBranch]);
  assert.equal(connected.junctions.length, 1);
  assert.equal(connected.junctions[0].sourceNodeId, 9001);
  assert.equal(connected.junctions[0].connectivitySource, 'nodeId');

  const separateMain = line('separate-main', [[-20, 0], [0, 0], [20, 0]]);
  const separateBranch = line('separate-branch', [[0, 0], [0, 20]]);
  separateMain.samples[1].nodeId = 9001;
  separateBranch.samples[0].nodeId = 9002;
  const separate = buildConnectedRoadSurface([separateMain, separateBranch]);
  assert.equal(separate.junctions.length, 0);
});
test('does not union close junctions that have no shared source way', () => {
  const result = buildConnectedRoadSurface([
    line('west-a', [[-20, 0], [0, 0]]), line('north-a', [[0, 0], [0, 12]]),
    line('east-b', [[2, 0], [22, 0]]), line('north-b', [[2, 0], [2, 12]]),
  ]);
  assert.equal(result.junctions.length, 2);
  assert.equal(result.stats.mergedJunctionClusterCount, 0);
});
test('handles skew and four-way junctions with finite nonzero-area polygons', () => {
  const roads = [
    line('a', [[-20, 0], [0, 0]]), line('b', [[0, 0], [20, 8]]),
    line('c', [[0, 0], [0, 20]]), line('d', [[0, 0], [-9, -18]]),
  ];
  const result = buildConnectedRoadSurface(roads);
  assert.equal(result.junctions.length, 1);
  const junction = result.junctions[0];
  assert.equal(junction.lineIds.length, 4);
  assert.ok(finite(xyz(junction.positions)));
  assert.ok(triangleCount(xyz(junction.positions)) >= 2);
  assert.ok(junction.area > 0.01);
  const triangleArea = Array.from({ length: junction.positions.length / 9 }, (_unused, index) => {
    const offset = index * 9;
    const p = junction.positions;
    return Math.abs((p[offset + 3] - p[offset]) * (p[offset + 8] - p[offset + 2])
      - (p[offset + 6] - p[offset]) * (p[offset + 5] - p[offset + 2])) / 2;
  }).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(triangleArea - junction.area) < 0.1, 'junction triangles cover the mouth polygon without overlap');
});

test('connects a two-arm width transition without adding an endpoint cap', () => {
  const result = buildConnectedRoadSurface([
    line('wide', [[-20, 0], [0, 0]], { width: 12 }),
    line('narrow', [[0, 0], [0, 20]], { width: 4 }),
  ]);
  assert.equal(result.junctions.length, 1);
  assert.equal(result.junctions[0].lineIds.length, 2);
  assert.equal(result.junctions[0].mouths.length, 2);
  assert.ok(result.junctions[0].area > 0.1);
  assert.ok(result.lines.every((entry) => triangleCount(xyz(entry.surfacePositions)) > 0));
});
test('keeps bends continuous without treating an unshared bend as a cap junction', () => {
  const roads = [line('bend', [[0, 0], [10, 0], [10, 10]])];
  const result = buildConnectedRoadSurface(roads);
  assert.equal(result.junctions.length, 0);
  assert.ok(triangleCount(xyz(result.lines[0].surfacePositions)) >= 4);
});

test('does not join nearby unconnected or stacked grade-separated roads', () => {
  const roads = [
    line('surface-a', [[-20, 0], [20, 0]]),
    line('nearby', [[0, 0.12], [0, 20]]),
    line('bridge', [[0, 0], [0, 20]], { tags: { highway: 'residential', bridge: 'yes', layer: '1' }, profile: { bridge: true } }),
    line('tunnel', [[0, 0], [0, -20]], { tags: { highway: 'residential', tunnel: 'yes', layer: '-1' }, profile: { tunnel: true } }),
  ];
  const result = buildConnectedRoadSurface(roads);
  assert.equal(result.junctions.length, 0);
  assert.ok(result.lines.every((entry) => triangleCount(xyz(entry.surfacePositions)) > 0));
});

test('smooths connected approach heights while retaining hill profile and matching mouths', () => {
  const roads = [line('west', [[-30, 0, 2], [0, 0, 4]]), line('branch', [[0, 0, 4.2], [0, 30, 8]])];
  const result = buildConnectedRoadSurface(roads, { approachBlendDistance: 8 });
  assert.equal(result.junctions.length, 1);
  const ys = xyz(result.junctions[0].positions).filter((_v, index) => index % 3 === 1);
  assert.ok(ys.every(Number.isFinite));
  assert.ok(Math.min(...ys) > 2 && Math.max(...ys) < 8.1);
  assert.ok(result.lines.some((entry) => xyz(entry.surfacePositions).some((value, index) => index % 3 === 1 && value > 7.5)));
  const west = result.lines.find((entry) => entry.lineId === 'west');
  const branch = result.lines.find((entry) => entry.lineId === 'branch');
  assert.ok(near(west.samples.at(-1).height, branch.samples[0].height));
  assert.ok(result.stats.meanJunctionBoundarySlope >= 0);
  assert.ok(result.stats.maxJunctionBoundarySlope >= result.stats.meanJunctionBoundarySlope);
});

test('shared approach blending never lowers a terrain-cleared connected sample', () => {
  const result = buildConnectedRoadSurface([
    line('lower', [[-20, 0, 0], [0, 0, 0], [20, 0, 0]]),
    line('upper', [[0, 0, 2], [0, 20, 2]]),
  ]);
  const lower = result.lines.find((entry) => entry.lineId === 'lower');
  const upper = result.lines.find((entry) => entry.lineId === 'upper');
  assert.ok(lower.samples.every((sample) => sample.height >= 0));
  assert.ok(upper.samples.every((sample) => sample.height >= 2));
  assert.equal(lower.samples[1].height, 2);
  assert.equal(upper.samples[0].height, 2);
});
test('applies per-line width at shared mouths and returns foundations', () => {
  const roads = [line('wide', [[-20, 0], [0, 0]], { width: 12 }), line('narrow', [[0, 0], [0, 25]], { width: 4 }), line('cross', [[0, 0], [20, 10]], { width: 6 })];
  const result = buildConnectedRoadSurface(roads);
  assert.equal(result.junctions.length, 1);
  const mouths = result.junctions[0].mouths;
  assert.ok(Math.max(...mouths.map((mouth) => mouth.width)) > Math.min(...mouths.map((mouth) => mouth.width)));
  assert.ok(result.lines.every((entry) => triangleCount(xyz(entry.foundationPositions)) > 0));
});

test('bounds overlapping trims at close junctions and rejects nonfinite source points', () => {
  const roads = [
    line('spine', [[-15, 0], [0, 0], [2, 0], [15, 0]]),
    line('north-a', [[0, 0], [0, 10]]),
    line('north-b', [[2, 0], [2, 10]]),
    line('bad', [[NaN, 1], [Infinity, 4]]),
  ];
  const result = buildConnectedRoadSurface(roads, { maxTrim: 10 });
  assert.equal(result.junctions.length, 1);
  const triangleCoverageAt = (positions, x, z) => {
    const p = positions;
    let coverage = 0;
    for (let offset = 0; offset < p.length; offset += 9) {
      const ax = p[offset], az = p[offset + 2];
      const bx = p[offset + 3], bz = p[offset + 5];
      const cx = p[offset + 6], cz = p[offset + 8];
      const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(denominator) < 1e-8) continue;
      const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
      const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
      const c = 1 - a - b;
      if (a > 1e-4 && b > 1e-4 && c > 1e-4) coverage += 1;
    }
    return coverage;
  };
  const coveredBatches = result.junctions.map((junction) => junction.positions);
  const totalCoverageAt = (x, z) => coveredBatches.reduce((sum, positions) => sum + triangleCoverageAt(positions, x, z), 0);
  assert.equal(totalCoverageAt(1, 2), 1,
    'the merged junction face covers (1, 2) once');
  const spine = result.lines.find((entry) => entry.lineId === 'spine');
  assert.equal(triangleCoverageAt(spine.surfacePositions, 1, 2), 0,
    'the internal spine strip is removed where the cluster union owns the surface');
  let maximumMultiplicity = 0;
  for (let x = -6; x <= 8; x += 0.25) {
    for (let z = -6; z <= 8; z += 0.25) maximumMultiplicity = Math.max(maximumMultiplicity, totalCoverageAt(x, z));
  }
  assert.ok(maximumMultiplicity <= 1, `sampled pavement multiplicity is ${maximumMultiplicity}`);
  assert.equal(result.stats.mergedJunctionClusterCount, 1);
  const mergedJunction = result.junctions[0];
  for (const mouth of mergedJunction.mouths) {
    const boundaryPoints = [mouth.left, mouth.right].filter((point) => mergedJunction.boundary.some((boundary) =>
      near(boundary.x, point.x) && near(boundary.y, point.y) && near(boundary.z, point.z)));
    if (!boundaryPoints.length) continue;
    const lineSurface = result.lines.find((entry) => entry.lineId === mouth.lineId).surfacePositions;
    for (const point of boundaryPoints) {
      let found = false;
      for (let offset = 0; offset < lineSurface.length; offset += 3) {
        if (near(lineSurface[offset], point.x) && near(lineSurface[offset + 1], point.y) && near(lineSurface[offset + 2], point.z)) {
          found = true;
          break;
        }
      }
      assert.ok(found, `merged junction mouth seam matches ${mouth.lineId}`);
    }
  }
  assert.ok(result.lines.every((entry) => finite(xyz(entry.surfacePositions)) && finite(xyz(entry.foundationPositions))));
  assert.ok(result.stats.rejectedSamples >= 2);
  assert.ok(triangleCount(xyz(spine.surfacePositions)) > 0);
});
