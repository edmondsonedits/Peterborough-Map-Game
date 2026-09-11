import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { CURB_REVEAL, curbIsRaised, stationRoadWeight, splitRoadDetailSegment, pavementSupportBottom } from '../city-explorer/station-road-detail.js';
assert.equal(pavementSupportBottom(2, 0), -0.03, 'Raised slab foundation reaches the terrain');
assert.equal(pavementSupportBottom(2, 2), 1.875, 'Slab keeps its minimum thickness');
assert.equal(pavementSupportBottom(-5, -7), -7.03, 'Negative local heights remain supported');
assert.throws(() => pavementSupportBottom(2, NaN));
assert.equal(CURB_REVEAL, 0.15);
for (const type of ['CURB', 'CURB GUTTER', 'CURBTEMPORARY', 'EDGE OF SIDEWALK RAISED']) assert.equal(curbIsRaised(type), true);
for (const type of ['EDGE OF PAVEMENT', 'EDGE OF SIDEWALK LEVEL', 'GRAVEL ROAD']) assert.equal(curbIsRaised(type), false);
for (const type of [undefined, '', 'UNKNOWN']) assert.equal(curbIsRaised(type), null);
const center = { x: 12, y: -30 };
assert.equal(stationRoadWeight(12, -30, center), 1);
assert.equal(stationRoadWeight(212, -30, center), 1);
assert.equal(stationRoadWeight(232, -30, center), 0.5);
assert.equal(stationRoadWeight(252, -30, center), 0);
class Point {
  constructor(x, y) { this.x = x; this.y = y; }
  clone() { return new Point(this.x, this.y); }
  distanceTo(p) { return Math.hypot(this.x - p.x, this.y - p.y); }
  distanceToSquared(p) { return (this.x - p.x) ** 2 + (this.y - p.y) ** 2; }
  lerp(p, t) { this.x += (p.x - this.x) * t; this.y += (p.y - this.y) * t; return this; }
}
const source = { a: new Point(0, 0), b: new Point(10, 7), aY: 100, bY: 101, width: 1.45 };
const pieces = splitRoadDetailSegment(source);
assert.deepEqual(pieces[0].a, source.a);
assert.deepEqual(pieces.at(-1).b, source.b);
assert.equal(pieces.at(-1).bY, 101);
for (let i = 0; i < pieces.length; i++) {
  assert.ok(pieces[i].a.distanceTo(pieces[i].b) <= 2);
  if (i) { assert.deepEqual(pieces[i - 1].b, pieces[i].a); assert.equal(pieces[i - 1].bY, pieces[i].aY); }
}
assert.throws(() => splitRoadDetailSegment(source, 0), RangeError);
assert.deepEqual(source.a, new Point(0, 0));
const app = readFileSync(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
const routine = app.match(/^function appendDrapedOfficialRoadTriangle\([^]*?^\}/m)?.[0];
assert.ok(routine);
const subdivide = runInNewContext(`${routine}\nappendDrapedOfficialRoadTriangle`, {
  project: () => ({ x: 0, y: 0 }), lowPowerProfile: false,
  cachedOfficialRoadHeightAt: (_cache, point) => 100 + point.x * 0.02 + point.y * 0.01,
  appendRoadTriangle: (out, ...vertices) => out.push(vertices),
});
const triangles = [];
subdivide(triangles, new Point(0, 0), new Point(80, 0), new Point(0, 80), 'road_surfaces', new Map());
assert.ok(triangles.length > 1);
for (const triangle of triangles) {
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    assert.ok(Math.hypot(triangle[i * 3] - triangle[j * 3], triangle[i * 3 + 2] - triangle[j * 3 + 2]) <= 8 + 1e-8);
    assert.ok(Math.abs(triangle[i * 3 + 1] - (100 + triangle[i * 3] * 0.02 + triangle[i * 3 + 2] * 0.01)) < 1e-8);
  }
}
console.log('PASS: curb classification, unknown provenance, 150 mm cross-section, feathering, continuous two-metre segments.');
console.log(`PASS: ${triangles.length} local pavement triangles, <=8 m edges, broad 2% / 1% grades preserved.`);
