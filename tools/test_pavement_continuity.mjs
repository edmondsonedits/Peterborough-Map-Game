/** Independent geometry QA. Import in a browser against the real rendered index,
 * or run: node tools/test_pavement_continuity.mjs [triangle-snapshot.json]
 * Snapshot: {triangles:[{vertices:[ax,ay,az,bx,by,bz,cx,cy,cz],metadata}], options}.
 * Horizontal near-gap candidates are diagnostic, not proof of missing pavement.
 */
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const dot = (a, b) => a.x * b.x + a.z * b.z;
const extent = (v) => ({ minX: Math.min(...v.map(p => p.x)), maxX: Math.max(...v.map(p => p.x)),
  minZ: Math.min(...v.map(p => p.z)), maxZ: Math.max(...v.map(p => p.z)) });
const touches = (a, b, epsilon = 0) => a.minX <= b.maxX + epsilon && a.maxX >= b.minX - epsilon
  && a.minZ <= b.maxZ + epsilon && a.maxZ >= b.minZ - epsilon;

function normalize(source, bounds) {
  const raw = source.cells instanceof Map ? [...new Set([...source.cells.values()].flat())]
    : (source.triangles ?? source);
  return raw.map((face, id) => {
    const n = face.vertices ?? [face.ax, face.ay, face.az,
      face.ax + face.ux, face.ay + face.dyB, face.az + face.uz,
      face.ax + face.vx, face.ay + face.dyC, face.az + face.vz];
    const v = [0, 3, 6].map(i => ({ x: n[i], y: n[i + 1], z: n[i + 2] }));
    if (n.length !== 9 || !n.every(Number.isFinite)) throw new Error(`Invalid triangle ${id}`);
    return { id, v, metadata: face.metadata ?? {}, box: extent(v) };
  }).filter(t => Math.abs(cross(...t.v)) > 1e-10 && t.metadata.layer !== 'bridges'
    && (!bounds || touches(t.box, bounds)));
}

function height(t, p) {
  const [a, b, c] = t.v;
  const det = cross(a, b, c);
  return a.y + cross(a, p, c) / det * (b.y - a.y) + cross(a, b, p) / det * (c.y - a.y);
}

// Sutherland-Hodgman intersection, independent of the runtime barycentric index.
function intersection(a, b) {
  let polygon = a.v.slice();
  const sign = Math.sign(cross(...b.v));
  for (let e = 0; e < 3 && polygon.length; e++) {
    const first = b.v[e], last = b.v[(e + 1) % 3], next = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const dp = cross(first, last, p) * sign, dq = cross(first, last, q) * sign;
      if (dp >= 0) next.push(p);
      if ((dp >= 0) !== (dq >= 0)) next.push(mix(p, q, dp / (dp - dq)));
    }
    polygon = next;
  }
  return polygon;
}

function area(polygon) {
  if (polygon.length < 3) return 0;
  return Math.abs(polygon.slice(1, -1).reduce((sum, p, i) => sum + cross(polygon[0], p, polygon[i + 2]), 0)) / 2;
}

function matchingEdges(a, ai, b, bi, gapTolerance) {
  const p = a.v[ai], q = a.v[(ai + 1) % 3];
  const r = b.v[bi], s = b.v[(bi + 1) % 3];
  const length = Math.hypot(q.x - p.x, q.z - p.z);
  const otherLength = Math.hypot(s.x - r.x, s.z - r.z);
  if (length < 1e-7 || otherLength < 1e-7) return null;
  const direction = { x: (q.x - p.x) / length, z: (q.z - p.z) / length };
  const parallel = Math.abs(direction.x * (s.z - r.z) - direction.z * (s.x - r.x)) / otherLength;
  if (parallel > 1e-5) return null;
  const offset = cross(p, q, r) / length;
  if (Math.abs(offset) > gapTolerance) return null;
  const project = point => dot({ x: point.x - p.x, z: point.z - p.z }, direction);
  const rAt = project(r), sAt = project(s);
  const start = Math.max(0, Math.min(rAt, sAt)), end = Math.min(length, Math.max(rAt, sAt));
  if (end - start < 1e-5) return null;
  // Only facing boundaries: same-side duplicate triangles are overlap cases.
  if (cross(p, q, a.v[(ai + 2) % 3]) * cross(p, q, b.v[(bi + 2) % 3]) >= 0) return null;
  const mismatch = Math.max(...[start, end].map(at => Math.abs(
    mix(p, q, at / length).y - mix(r, s, (at - rAt) / (sAt - rAt)).y)));
  return { length: end - start, gap: Math.abs(offset), mismatch };
}

export function analyzePavementContinuity(source, {
  bounds = null, heightTolerance = 0.025, gapTolerance = 0.02, cellSize = 12,
  maxTriangles = 12000, maxCandidatePairs = 2000000,
} = {}) {
  if (!(heightTolerance >= 0 && gapTolerance > 0 && cellSize > 0)) throw new Error('Invalid metric tolerances');
  const triangles = normalize(source, bounds);
  if (triangles.length > maxTriangles) throw new Error('Continuity QA requires a smaller local triangle snapshot or bounds');
  const cells = new Map(), pairs = new Set();
  for (let i = 0; i < triangles.length; i++) {
    const box = triangles[i].box;
    for (let x = Math.floor((box.minX - gapTolerance) / cellSize); x <= Math.floor((box.maxX + gapTolerance) / cellSize); x++) {
      for (let z = Math.floor((box.minZ - gapTolerance) / cellSize); z <= Math.floor((box.maxZ + gapTolerance) / cellSize); z++) {
        const key = `${x}:${z}`, previous = cells.get(key) ?? [];
        for (const j of previous) pairs.add(`${j}:${i}`);
        if (pairs.size > maxCandidatePairs) throw new Error('Continuity QA candidate budget exceeded; reduce local bounds');
        previous.push(i); cells.set(key, previous);
      }
    }
  }
  const report = { triangleCount: triangles.length, candidatePairCount: pairs.size,
    bridgeTrianglesExcluded: true, heightTolerance, gapTolerance,
    sharedEdgePairs: 0, sharedEdgeLengthMetres: 0, maximumSharedEdgeHeightDeltaMetres: 0,
    overlappingTrianglePairs: 0, overlappingAreaSumSquareMetres: 0, maximumOverlapHeightDeltaMetres: 0,
    heightViolationCount: 0, nearGapCandidateCount: 0, maximumNearGapMetres: 0, layerPairs: {}, worst: [] };
  const connected = new Set(), nearEdges = [];
  const record = (kind, a, b, metres) => {
    report.worst.push({ kind, metres, triangleIds: [a.id, b.id],
      featureIds: [a.metadata.id ?? null, b.metadata.id ?? null],
      layers: [a.metadata.layer ?? 'unknown', b.metadata.layer ?? 'unknown'],
      location: { x: (a.v[0].x + b.v[0].x) / 2, z: (a.v[0].z + b.v[0].z) / 2 } });
    report.worst.sort((a, b) => b.metres - a.metres); report.worst.length = Math.min(8, report.worst.length);
  };
  for (const key of pairs) {
    const [ia, ib] = key.split(':').map(Number), a = triangles[ia], b = triangles[ib];
    if (!touches(a.box, b.box, gapTolerance)) continue;
    const layerKey = [a.metadata.layer ?? 'unknown', b.metadata.layer ?? 'unknown'].sort().join(' / ');
    const layerMetric = () => report.layerPairs[layerKey] ??= {
      sharedEdgePairs: 0, overlappingTrianglePairs: 0, maximumSharedEdgeHeightDeltaMetres: 0,
      maximumOverlapHeightDeltaMetres: 0,
    };
    const polygon = intersection(a, b), overlap = area(polygon);
    if (overlap > 1e-6) {
      const mismatch = Math.max(...polygon.map(p => Math.abs(height(a, p) - height(b, p))));
      report.overlappingTrianglePairs++;
      report.overlappingAreaSumSquareMetres += overlap;
      report.maximumOverlapHeightDeltaMetres = Math.max(report.maximumOverlapHeightDeltaMetres, mismatch);
      const byLayer = layerMetric(); byLayer.overlappingTrianglePairs++;
      byLayer.maximumOverlapHeightDeltaMetres = Math.max(byLayer.maximumOverlapHeightDeltaMetres, mismatch);
      if (mismatch > heightTolerance) { report.heightViolationCount++; record('overlap', a, b, mismatch); }
    }
    for (let ai = 0; ai < 3; ai++) for (let bi = 0; bi < 3; bi++) {
      const match = matchingEdges(a, ai, b, bi, gapTolerance);
      if (!match) continue;
      const edgeA = `${ia}:${ai}`, edgeB = `${ib}:${bi}`;
      if (match.gap <= 1e-5) {
        connected.add(edgeA); connected.add(edgeB);
        report.sharedEdgePairs++;
        report.sharedEdgeLengthMetres += match.length;
        report.maximumSharedEdgeHeightDeltaMetres = Math.max(report.maximumSharedEdgeHeightDeltaMetres, match.mismatch);
        const byLayer = layerMetric(); byLayer.sharedEdgePairs++;
        byLayer.maximumSharedEdgeHeightDeltaMetres = Math.max(byLayer.maximumSharedEdgeHeightDeltaMetres, match.mismatch);
        if (match.mismatch > heightTolerance) { report.heightViolationCount++; record('shared-edge', a, b, match.mismatch); }
      } else if (overlap < 1e-6) nearEdges.push({ edgeA, edgeB, match, a, b });
    }
  }
  for (const { edgeA, edgeB, match, a, b } of nearEdges) {
    if (connected.has(edgeA) || connected.has(edgeB)) continue;
    report.nearGapCandidateCount++;
    report.maximumNearGapMetres = Math.max(report.maximumNearGapMetres, match.gap);
    record('near-boundary-gap-candidate', a, b, match.gap);
  }
  report.status = !triangles.length ? 'empty' : report.heightViolationCount ? 'fail' : 'pass';
  report.scope = 'Projected triangle geometry only; near-gap candidates need source-boundary review. Overlap area is pairwise, not union area. No visual or citywide claim.';
  return report;
}

async function main() {
  const { default: assert } = await import('node:assert/strict');
  const tri = (vertices, id = 'fixture') => ({ vertices, metadata: { id, layer: 'road_surfaces' } });
  const left = tri([0, 0, 0, 10, 1, 0, 10, 2, 10], 'left');
  const right = tri([0, 0, 0, 10, 2, 10, 0, 1, 10], 'right');
  let report = analyzePavementContinuity([left, right]);
  assert.equal(report.status, 'pass'); assert.equal(report.sharedEdgePairs, 1);
  assert.ok(report.sharedEdgeLengthMetres > 14);
  const raised = { ...right, vertices: right.vertices.map((v, i) => i % 3 === 1 ? v + 0.12 : v) };
  report = analyzePavementContinuity([left, raised]);
  assert.equal(report.status, 'fail'); assert.ok(Math.abs(report.maximumSharedEdgeHeightDeltaMetres - 0.12) < 1e-8);
  // A partial edge/T-junction must compare interpolated edge heights, not endpoint identity.
  report = analyzePavementContinuity([left, tri([2, 0.44, 2, 7, 1.54, 7, 1, 1, 8])]);
  assert.equal(report.sharedEdgePairs, 1); assert.equal(report.status, 'fail');
  const overlay = tri([2, 0.9, 1, 8, 1.5, 1, 8, 2.1, 7], 'overlay');
  report = analyzePavementContinuity([left, overlay]);
  assert.ok(report.overlappingAreaSumSquareMetres > 1); assert.equal(report.status, 'fail');
  assert.ok(Math.abs(report.maximumOverlapHeightDeltaMetres - 0.6) < 1e-8);
  report = analyzePavementContinuity([
    tri([0, 0, 0, 5, 0, 0, 5, 0, 5]), tri([5.01, 0, 0, 10, 0, 0, 5.01, 0, 5]),
  ]);
  assert.equal(report.nearGapCandidateCount, 1); assert.ok(Math.abs(report.maximumNearGapMetres - 0.01) < 1e-8);
  assert.equal(report.status, 'pass', 'Gap candidates require boundary review, not automatic failure');
  report = analyzePavementContinuity([left, { ...raised, metadata: { layer: 'bridges' } }]);
  assert.equal(report.triangleCount, 1); assert.equal(report.status, 'pass');
  assert.equal(analyzePavementContinuity([]).status, 'empty');
  const { RenderedPavementIndex } = await import('../city-explorer/official-road-surfaces.js');
  const index = new RenderedPavementIndex(2);
  index.addTriangle(...left.vertices, left.metadata); index.addTriangle(...right.vertices, right.metadata);
  report = analyzePavementContinuity(index);
  assert.equal(report.triangleCount, 2, 'Grid duplication does not inflate metrics');
  assert.equal(report.sharedEdgePairs, 1);
  console.log(JSON.stringify({ fixtures: 'pass', checked: ['slope', 'vertical-seam', 'T-junction',
    'overlapping-area', 'horizontal-gap-candidate', 'bridge-exclusion', 'empty-input', 'actual-index-input'] }));
  if (process.argv[2]) {
    const { readFileSync } = await import('node:fs');
    const snapshot = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const result = analyzePavementContinuity(snapshot, snapshot.options ?? {});
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'pass') process.exitCode = 1;
  }
}

if (typeof process !== 'undefined' && process.argv?.[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
}
