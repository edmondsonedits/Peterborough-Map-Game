import assert from "node:assert/strict";
import * as THREE from "../city-explorer/vendor/three-r180/build/three.module.min.js";
import { appendFootageRoof, FOOTAGE_ROOF_MAX_RISE } from "../city-explorer/sherbrooke-footage-roofs.js";
import { FOOTAGE_PROFILES } from "../city-explorer/sherbrooke-footage-profiles.js";
import { SHERBROOKE_SOURCE } from "../city-explorer/sherbrooke-source.js";

const CENTER = { lat: 44.3091, lon: -78.3197 };
const project = (lat, lon) => new THREE.Vector2((lon - CENTER.lon) * 111320 * Math.cos(THREE.MathUtils.degToRad(CENTER.lat)), -(lat - CENTER.lat) * 110540);
const labels = new Set(); let complexFootprints = 0;
function insideOrOn(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i], cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) < 1e-5 && point.x >= Math.min(a.x, b.x) - 1e-5 && point.x <= Math.max(a.x, b.x) + 1e-5 && point.y >= Math.min(a.y, b.y) - 1e-5 && point.y <= Math.max(a.y, b.y) + 1e-5) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function triangleAreaXZ(points, offset) {
  const a = { x: points[offset], y: points[offset + 2] }, b = { x: points[offset + 3], y: points[offset + 5] }, c = { x: points[offset + 6], y: points[offset + 8] };
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}

for (const [id, profile] of Object.entries(FOOTAGE_PROFILES)) {
  if (!/^(gable|hip|pyramid)$/i.test(profile.roof || "")) continue;
  const source = SHERBROOKE_SOURCE.buildings.find(b => b.id === id), outer = source.ring.slice(0, -1).map(([lon, lat]) => { const p = project(lat, lon); return new THREE.Vector2(p.x, p.y); });
  const roof = [], walls = [], wallTop = 50, requestedTop = wallTop + (Number(profile.roofRise) || 2.6);
  assert.equal(appendFootageRoof({ THREE, roofPositions: roof, wallPositions: walls, outer, wallTop, roofTop: requestedTop, profile, project }), true, `${profile.label} pitches with an irregular/complex outline`);
  if (outer.length > 4) complexFootprints++;
  assert.ok(roof.length > 0 && roof.length % 9 === 0, `${profile.label} emits complete roof triangles`);
  assert.equal(walls.length % 9, 0, `${profile.label} emits complete closure triangles`);
  assert.ok([...roof, ...walls].every(Number.isFinite), `${profile.label} emits finite roof and wall coordinates`);
  let area = 0, maxHeight = wallTop;
  for (let i = 0; i < roof.length; i += 9) {
    area += triangleAreaXZ(roof, i);
    for (const j of [i, i + 3, i + 6]) {
      const point = { x: roof[j], y: roof[j + 2] };
      assert.ok(insideOrOn(point, outer), `${profile.label} roof vertex stays within the original building outline`);
      assert.ok(roof[j + 1] >= wallTop - 1e-6 && roof[j + 1] <= wallTop + FOOTAGE_ROOF_MAX_RISE + 1e-6, `${profile.label} roof height stays within its capped rise`);
      maxHeight = Math.max(maxHeight, roof[j + 1]);
    }
  }
  const footprintArea = Math.abs(THREE.ShapeUtils.area(outer.map(p => new THREE.Vector2(p.x, p.y))));
  assert.ok(Math.abs(area - footprintArea) < Math.max(1e-4, footprintArea * 1e-7), `${profile.label} roof triangle area exactly covers its footprint without overhang`);
  assert.ok(maxHeight > wallTop + .25, `${profile.label} has a real ridge/peak rather than a flat plane`);
  assert.ok(walls.length > 0, `${profile.label} closes elevated roof boundary edges with wall-colored gable geometry`);
  labels.add(profile.label);
}
assert.ok(labels.has("S06") && labels.has("S08"), "both reviewed concave roof footprints are included");
assert.ok(complexFootprints >= 6, "greater-than-four-vertex homes do not fall back to flat roof masses");
assert.ok(labels.size >= 8, "all reviewed pitched house profiles receive a roof mesh");
assert.equal(appendFootageRoof({ THREE, roofPositions: [], wallPositions: [], outer: [], wallTop: 4, roofTop: 6, profile: {}, project }), false, "non-pitched/invalid input retains the caller's conservative fallback");
const boxProfile = { roof: "gable", frontLatLon: [{ lat: 0, lon: -5 }, { lat: 0, lon: 5 }] }, rectangle = [[-5, 0], [5, 0], [5, 8], [-5, 8]].map(([x, z]) => new THREE.Vector2(x, z)), gableRoof = [], gableWalls = [];
assert.equal(appendFootageRoof({ THREE, roofPositions: gableRoof, wallPositions: gableWalls, outer: rectangle, wallTop: 20, roofTop: 22, profile: boxProfile, project: (lat, lon) => new THREE.Vector2(lon, lat) }), true);
assert.ok(gableWalls.some((_, i) => i % 3 === 0 && Math.abs(gableWalls[i]) < 1e-8 && Math.abs(gableWalls[i + 2]) < 1e-8 && gableWalls[i + 1] > 20.5), "gable's perpendicular ridge closes at a peak on the front center");
const hipRoof = [], hipWalls = [];
assert.equal(appendFootageRoof({ THREE, roofPositions: hipRoof, wallPositions: hipWalls, outer: rectangle, wallTop: 20, roofTop: 22, profile: { ...boxProfile, roof: "hip" }, project: (lat, lon) => new THREE.Vector2(lon, lat) }), true);
assert.ok(hipRoof.some((_, i) => i % 3 === 0 && Math.abs(hipRoof[i]) < 1e-8 && Math.abs(hipRoof[i + 2] - 4) < 1e-8 && hipRoof[i + 1] > 21.9), "rectangular hip roof has a raised central intersection");
console.log(`Sherbrooke roof checks passed: ${labels.size} pitched footprints, exact projected-area coverage, contained triangles, and capped rise.`);
