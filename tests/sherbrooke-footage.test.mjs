import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as THREE from "../city-explorer/vendor/three-r180/build/three.module.min.js";
import { createFootageFacade, frontageFrame, mapPhotoPatchUV, PHOTO_LOAD_TIMEOUT_MS } from "../city-explorer/sherbrooke-footage.js";
import { FOOTAGE_PROFILES } from "../city-explorer/sherbrooke-footage-profiles.js";
import { SHERBROOKE_SOURCE } from "../city-explorer/sherbrooke-source.js";

const CENTER = { lat: 44.3091, lon: -78.3197 };
const project = (lat, lon) => new THREE.Vector2((lon - CENTER.lon) * 111320 * Math.cos(THREE.MathUtils.degToRad(CENTER.lat)), -(lat - CENTER.lat) * 110540);
const osm = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url)));
const sourceRing = id => {
 const reviewed = SHERBROOKE_SOURCE.buildings.find(b => b.id === id);
 const coords = reviewed ? reviewed.ring : osm.elements.find(e => e.type === 'way' && `way/${e.id}` === id).geometry.map(p => [p.lon,p.lat]);
 return coords.slice(0,-1).map(([lon,lat]) => { const p = project(lat,lon);return {x:p.x,z:p.y}; });
};
const finite = values => [...values].every(Number.isFinite);
const segmentDistance = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };

assert.equal(Object.keys(FOOTAGE_PROFILES).length, 22, "all 22 reviewed profile records remain available by OSM way id");
for (const [id, profile] of Object.entries(FOOTAGE_PROFILES)) {
  const ring = sourceRing(id), frame = frontageFrame({ profile, ring, project });
  assert.ok(frame.length > 2 && finite([frame.start.x, frame.start.z, frame.end.x, frame.end.z]), `${profile.label} has a finite projected frontage`);
  assert.ok(Math.min(...ring.map((p, i) => segmentDistance(frame.start, p, ring[(i + 1) % ring.length]))) < .05, `${profile.label} first frontage endpoint lies on the existing source outline`);
  assert.ok(Math.min(...ring.map((p, i) => segmentDistance(frame.end, p, ring[(i + 1) % ring.length]))) < .05, `${profile.label} second frontage endpoint lies on the existing source outline`);
  const cx = ring.reduce((sum, p) => sum + p.x / ring.length, 0), cz = ring.reduce((sum, p) => sum + p.z / ring.length, 0);
  assert.ok((frame.midpoint.x - cx) * frame.outward.x + (frame.midpoint.z - cz) * frame.outward.z > 0, `${profile.label} frontage faces away from its footprint`);
  const group = createFootageFacade({ THREE, profile, ring, base: 100, top: 100 + profile.height, project });
  assert.ok(group.isGroup, `${profile.label} returns a group`);
  group.updateMatrixWorld(true);
  group.traverse(object => {
    if (object.isInstancedMesh) assert.ok(finite(object.instanceMatrix.array), `${profile.label} instance transforms are finite`);
    if (object.isMesh && object.geometry.attributes.position) assert.ok(finite(object.geometry.attributes.position.array), `${profile.label} mesh vertices are finite`);
  });
  if (id === "way/1009651229") assert.equal(group.children.length, 0, "the station keeps the gameplay scene's reviewed facade without duplicate detail");
  if (profile.confidence === "inferred") assert.equal(group.children.length, 0, `${profile.label} inferred mass gets no invented openings`);
}

const mural = FOOTAGE_PROFILES["way/846927296"], quad = mural.texturePatch.quad;
for (const [point, expected] of [[[0, 0], quad[0]], [[1, 0], quad[1]], [[1, 1], quad[2]], [[0, 1], quad[3]]]) {
  const uv = mapPhotoPatchUV(quad, ...point);
  assert.ok(Math.abs(uv[0] - expected[0]) < 1e-8 && Math.abs(uv[1] - expected[1]) < 1e-8, `mural patch corner ${point} maps to its reviewed source-image corner`);
}
assert.equal(mural.reference.sourceSequence, 200, "original reference sequence metadata is preserved");
assert.equal(mural.texturePatch.sourceFile, "references/0200_LEFT_SIDE.jpg", "mural crop provenance remains tied to the original still");
assert.match(mural.texturePatch.file, /village-thai-mural-source\.jpg$/);
const muralBytes = await readFile(new URL("../city-explorer/data/sherbrooke-footage/village-thai-mural-source.jpg", import.meta.url));
assert.equal(createHash("sha256").update(muralBytes).digest("hex"), mural.reference.sha256, "the local mural asset matches the original still's recorded hash");
assert.ok(FOOTAGE_PROFILES["way/1009651229"].reference.sha256, "station reference metadata remains available despite the deliberate empty facade group");

const pendingLoads = [];
class DeferredTextureLoader { load(url, onLoad, _progress, onError) { pendingLoads.push({ url, onLoad, onError }); return {}; } }
const mockedThree = { ...THREE, TextureLoader: DeferredTextureLoader }, n07 = FOOTAGE_PROFILES["way/846927296"], n07Ring = sourceRing(n07.id), disposeOriginal = THREE.BufferGeometry.prototype.dispose;
let disposedPhotoGeometry = 0;
THREE.BufferGeometry.prototype.dispose = function () { disposedPhotoGeometry++; return disposeOriginal.call(this); };
try {
  const successful = createFootageFacade({ THREE: mockedThree, profile: n07, ring: n07Ring, base: 100, top: 110, project });
  assert.equal(successful.userData.photoStatus, "loading", "photo status reports pending texture load");
  const successLoad = pendingLoads.at(-1); assert.match(successLoad.url, /village-thai-mural-source\.jpg$/);
  successLoad.onLoad({ dispose() {}, anisotropy: 1 });
  assert.equal(await successful.userData.photoReady, "loaded", "successful deferred load settles ready");
  assert.equal(successful.userData.photoStatus, "loaded");
  assert.ok(successful.children.some(child => child.name === "reviewed-boro-mural-photo-patch"), "successful photo patch is attached to the group");

  const failed = createFootageFacade({ THREE: mockedThree, profile: n07, ring: n07Ring, base: 100, top: 110, project });
  pendingLoads.at(-1).onError(new Error("fixture failure"));
  assert.equal(await failed.userData.photoReady, "failed", "loader failure settles ready");
  assert.equal(failed.userData.photoStatus, "failed");
  assert.ok(!failed.children.some(child => child.name === "reviewed-boro-mural-photo-patch"));

  const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
  let triggerTimeout, cleared = false;
  try {
    globalThis.setTimeout = (fn, delay) => { assert.equal(delay, PHOTO_LOAD_TIMEOUT_MS); triggerTimeout = fn; return 42; };
    globalThis.clearTimeout = id => { if (id === 42) cleared = true; };
    const timed = createFootageFacade({ THREE: mockedThree, profile: n07, ring: n07Ring, base: 100, top: 110, project }), lateTexture = { disposeCount: 0, dispose() { this.disposeCount++; }, anisotropy: 1 };
    assert.equal(timed.userData.photoStatus, "loading"); assert.equal(typeof triggerTimeout, "function"); triggerTimeout();
    assert.equal(await timed.userData.photoReady, "failed", "timeout resolves rather than blocking editor startup");
    assert.equal(timed.userData.photoStatus, "failed"); assert.ok(cleared, "settled timeout is cleared");
    pendingLoads.at(-1).onLoad(lateTexture);
    assert.equal(lateTexture.disposeCount, 1, "late texture is disposed after timeout");
    assert.ok(!timed.children.some(child => child.name === "reviewed-boro-mural-photo-patch"), "late success cannot mutate the failed group");
    assert.equal(disposedPhotoGeometry, 2, "failure and timeout both dispose their unused patch geometry");
  } finally { globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout; }
} finally { THREE.BufferGeometry.prototype.dispose = disposeOriginal; }
console.log("Sherbrooke frontage checks passed: 22 OSM profiles, source alignment, finite geometry, conservative openings, mural UVs and bounded photo loading.");
