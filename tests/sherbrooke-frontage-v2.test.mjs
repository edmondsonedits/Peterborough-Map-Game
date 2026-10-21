import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../city-explorer/vendor/three-r180/build/three.module.min.js";
import { createFootageFacade, frontageFrame, PHOTO_LOAD_TIMEOUT_MS } from "../city-explorer/sherbrooke-footage.js";
import { FOOTAGE_PROFILES } from "../city-explorer/sherbrooke-footage-profiles.js";
import { SHERBROOKE_SOURCE } from "../city-explorer/sherbrooke-source.js";

const profileBase = {
  id: "way/test-frontage", label: "V2 fixture", confidence: "reviewed", style: "retail",
  height: 8, levels: 2, windowColumns: 3,
  frontLatLon: [{ lat: 0, lon: -5 }, { lat: 0, lon: 5 }],
};
const ring = [{x:-5,z:0},{x:5,z:0},{x:5,z:8},{x:-5,z:8}];
const project = (lat, lon) => ({ x: lon, y: lat });
const pending = [];
class StubTextureLoader { load(url, onLoad, _progress, onError) { pending.push({url,onLoad,onError}); return {}; } }
const mockedThree = { ...THREE, TextureLoader: StubTextureLoader };
const CENTER = { lat: 44.3091, lon: -78.3197 };
const projectReal = (lat, lon) => new THREE.Vector2((lon - CENTER.lon) * 111320 * Math.cos(THREE.MathUtils.degToRad(CENTER.lat)), -(lat - CENTER.lat) * 110540);
const sourceRing = id => SHERBROOKE_SOURCE.buildings.find(b => b.id === id).ring.slice(0, -1).map(([lon, lat]) => { const p = projectReal(lat, lon); return { x: p.x, z: p.y }; });

test("facade photo replaces only front details after load and preserves details after failure", async () => {
  const profile = { ...profileBase, facadePhoto: { file: "../data/fixture.jpg", widthFraction: .6, centerFraction: .5, bottomMetres: .2, heightMetres: 4, sha256: "fixture" } };
  const loaded = createFootageFacade({ THREE: mockedThree, profile, ring, base: 10, top: 18, project });
  const details = loaded.children.find(node => node.name === "frontage-procedural-details");
  assert.ok(details?.visible, "procedural facade is available while the photo loads");
  assert.equal(loaded.userData.facadePhotoStatus, "loading");
  const source = pending.at(-1); assert.match(source.url, /fixture\.jpg$/);
  const texture = { anisotropy: 1, dispose() {} };
  source.onLoad(texture);
  assert.equal(await loaded.userData.facadePhotoReady, "loaded");
  assert.equal(await loaded.userData.photoReady, "loaded", "existing scene startup readiness contract waits on the new photo too");
  assert.equal(details.visible, false, "successful photo hides only procedural facade openings and signage");
  assert.equal(loaded.children.find(node => node.name === "reviewed-facade-photo")?.isMesh, true);
  assert.equal(texture.anisotropy, 2);
  const photo = loaded.children.find(node => node.name === "reviewed-facade-photo");
  assert.equal(photo.material.transparent, false);
  assert.equal(photo.material.map.colorSpace, THREE.SRGBColorSpace);

  const failed = createFootageFacade({ THREE: mockedThree, profile, ring, base: 10, top: 18, project });
  const fallbackDetails = failed.children.find(node => node.name === "frontage-procedural-details");
  pending.at(-1).onError(new Error("fixture load failure"));
  assert.equal(await failed.userData.facadePhotoReady, "failed");
  assert.equal(fallbackDetails.visible, true, "photo failure keeps procedural fallback visible");
  assert.equal(failed.children.some(node => node.name === "reviewed-facade-photo"), false);
});

test("rectified photo UV direction follows the outward-facing view for either segment ordering", async () => {
  const photo = { file: "front.jpg", widthFraction: .8, centerFraction: .5, bottomMetres: 0, heightMetres: 5 };
  for (const frontLatLon of [profileBase.frontLatLon, [...profileBase.frontLatLon].reverse()]) {
    const profile = { ...profileBase, frontLatLon, facadePhoto: photo };
    const frame = frontageFrame({ profile, ring, project });
    const group = createFootageFacade({ THREE: mockedThree, profile, ring, base: 10, top: 18, project });
    const reverse = frame.outward.x * -frame.tangent.z + frame.outward.z * frame.tangent.x < 0;
    const uv = group.children.find(node => node.name === "frontage-procedural-details") && (() => {
      // Geometry is attached asynchronously; complete the deferred loader to inspect its normal top-left UVs.
      pending.at(-1).onLoad({ dispose() {}, anisotropy: 1 });
      return group.children.find(node => node.name === "reviewed-facade-photo").geometry.attributes.uv.array;
    })();
    await group.userData.facadePhotoReady;
    assert.equal(uv[0], reverse ? 1 : 0, "screen-left starts at the correct source-image edge");
    assert.equal(uv[2], reverse ? 0 : 1, "screen-right ends at the correct source-image edge");
  }
});

test("photo frontage follows a triangular gable without rectangular sky wings", async () => {
  const profile = { ...profileBase, style: "house", facadePhoto: { file: "gable.jpg", widthFraction: 1, centerFraction: .5, bottomMetres: 0, heightMetres: 4, gableHeightMetres: 2 } };
  const group = createFootageFacade({ THREE: mockedThree, profile, ring, base: 10, top: 18, project });
  pending.at(-1).onLoad({ dispose() {}, anisotropy: 1 });
  await group.userData.facadePhotoReady;
  const geometry = group.children.find(node => node.name === "reviewed-facade-photo").geometry;
  const positions = geometry.attributes.position.array, uv = geometry.attributes.uv.array, normals = geometry.attributes.normal.array;
  assert.equal(positions.length / 3, 5, "the gable adds one peak vertex, not two upper rectangle corners");
  assert.equal(geometry.index.array.length, 9, "wall uses two triangles and gable uses one triangle");
  assert.ok([...positions, ...normals].every(Number.isFinite), "photo vertices and triangle normals are finite");
  assert.equal(Math.max(positions[1],positions[4],positions[7],positions[10],positions[13]), 16, "gable peak rises by the requested height above the wall");
  assert.ok(Math.abs(uv[5] - 2 / 3) < 1e-6, "wall-to-gable UV seam follows the wall fraction of full image height");
  assert.ok(Math.abs(uv[7] - 2 / 3) < 1e-6);
  assert.equal(uv[9], 1, "the image top aligns with the gable peak");
  assert.equal(uv[8], .5, "the peak samples the center of the image top edge");
  let area = 0;
  const index = geometry.index.array;
  for (let i=0;i<index.length;i+=3) {
    const ids = [index[i],index[i+1],index[i+2]], p = ids.map(id => [positions[id*3],positions[id*3+1],positions[id*3+2]]);
    const ab = p[1].map((v,j)=>v-p[0][j]), ac = p[2].map((v,j)=>v-p[0][j]);
    const cross = [ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    area += Math.hypot(...cross) / 2;
  }
  assert.ok(Math.abs(area - 50) < 1e-6, "photo outline area equals rectangular wall plus triangular gable");
});

test("reviewed S03/S05/S10 photos retain their real gable peaks above the eaves", async () => {
  for (const label of ["S03", "S05", "S10"]) {
    const profile = Object.values(FOOTAGE_PROFILES).find(item => item.label === label);
    assert.ok(profile?.facadePhoto?.gableHeightMetres > 0, `${label} has reviewed wall and gable dimensions`);
    const base = 100, group = createFootageFacade({ THREE: mockedThree, profile, ring: sourceRing(profile.id), base, top: base + profile.height, project: projectReal });
    pending.at(-1).onLoad({ dispose() {}, anisotropy: 1 });
    await group.userData.facadePhotoReady;
    const geometry = group.children.find(node => node.name === "reviewed-facade-photo").geometry;
    const position = geometry.attributes.position.array;
    assert.equal(position.length / 3, 5, `${label} photo retains its four eave/wall vertices plus one gable peak`);
    assert.equal(geometry.index.array.length, 9, `${label} photo uses two wall triangles and one gable triangle`);
    const bottom = profile.facadePhoto.bottomMetres, wall = profile.facadePhoto.heightMetres, gable = profile.facadePhoto.gableHeightMetres;
    assert.ok(Math.abs(position[7] - (base + bottom + wall)) < 1e-5, `${label} wall reaches the reviewed eave`);
    assert.ok(Math.abs(position[10] - (base + bottom + wall)) < 1e-5, `${label} wall has matching left and right eave heights`);
    assert.ok(Math.abs(position[13] - (base + bottom + wall + gable)) < 1e-5, `${label} peak reaches the reviewed roof top`);
    assert.ok(Math.abs(position[13] - (base + profile.height)) < 1e-5, `${label} gable fits within the actual building top`);
  }
});

test("house porch settings retain the default cap and can suppress only the porch", () => {
  const create = profile => createFootageFacade({ THREE, profile: { ...profileBase, style: "house", ...profile }, ring, base: 10, top: 18, project });
  const defaultHouse = create({}), explicitDefaults = create({ porchWidthFraction: .56, porchDepthMetres: 1.05, porchHeightMetres: 2.72 });
  const trim = group => group.children.find(node => node.name === "frontage-procedural-details").children.find(node => node.name === "frontage-trim");
  const widest = mesh => { const matrix = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); let width = 0; for (let i=0;i<mesh.count;i++) { mesh.getMatrixAt(i,matrix); matrix.decompose(p,q,s); width=Math.max(width,s.x); } return width; };
  assert.ok(Math.abs(widest(trim(defaultHouse)) - 3.4) < 1e-5, "unset width keeps the old 3.2m porch plus roof eave cap");
  assert.ok(Math.abs(widest(trim(explicitDefaults)) - 5.8) < 1e-5, "an explicit width fraction is honored even when it exceeds the default cap");
  const noPorch = create({ porch: false });
  assert.ok(noPorch.children.find(node => node.name === "frontage-procedural-details").children.some(node => node.name === "frontage-door"), "door remains when porch is disabled");
  assert.ok(trim(noPorch).count < trim(defaultHouse).count, "porch platform, columns and roof are omitted");
});

test("reviewed S02 and S09 porch fractions are not clipped to the default width cap", () => {
  for (const label of ["S02", "S09"]) {
    const profile = Object.values(FOOTAGE_PROFILES).find(item => item.label === label), ring = sourceRing(profile.id);
    const group = createFootageFacade({ THREE, profile, ring, base: 10, top: 10 + profile.height, project: projectReal });
    const trim = group.children.find(node => node.name === "frontage-procedural-details").children.find(node => node.name === "frontage-trim");
    const frame = frontageFrame({ profile, ring, project: projectReal });
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    let widest = 0;
    for (let i=0;i<trim.count;i++) { trim.getMatrixAt(i, matrix); matrix.decompose(position, quaternion, scale); widest = Math.max(widest, scale.x); }
    assert.ok(profile.porchWidthFraction > 0.56, `${label} has a reviewed wide porch fraction`);
    assert.ok(widest > 3.4, `${label} porch roof exceeds the 3.2m default cap`);
    assert.ok(Math.abs(widest - (frame.length * profile.porchWidthFraction + .2)) < 1e-4, `${label} porch width follows the reviewed frontage fraction`);
  }
});

test("front garden stays within caller-cleared cells and uses at most three merged materials", () => {
  const garden = { depthMetres: 3.2, pathFraction: .5, pathWidthMetres: 1.1, lawnColor: "#65824f", hedge: true };
  let clearanceSamples = 0;
  const group = createFootageFacade({ THREE, profile: { ...profileBase, frontGarden: garden }, ring, base: 10, top: 18, project,
    terrainHeightAtWorld: (x,z) => 10 + x * .001 + z * .002,
    gardenClear: (x,z) => { clearanceSamples++; return x > -6 && x < 6 && z < -0.05; },
  });
  const gardenMeshes = group.children.filter(node => node.name.startsWith("front-garden-"));
  assert.ok(clearanceSamples > 0, "clearance is sampled before garden cells are added");
  assert.ok(gardenMeshes.length <= 3, "lawn, path and optional hedge each use one merged draw call");
  assert.ok(gardenMeshes.some(node => node.name === "front-garden-lawn"));
  assert.ok(gardenMeshes.some(node => node.name === "front-garden-path"));
  for (const mesh of gardenMeshes) {
    assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));
    assert.equal(mesh.castShadow, false, "garden patch does not add unnecessary shadows");
  }
  const skipped = createFootageFacade({ THREE, profile: { ...profileBase, frontGarden: garden }, ring, base: 10, top: 18, project, terrainHeightAtWorld: () => 10 });
  assert.equal(skipped.children.some(node => node.name.startsWith("front-garden-")), false, "garden fails closed without the safe-clear predicate");
});

test("optional driveway uses a fourth merged asphalt material only for cleared cells and fraction zero is honored", () => {
  const garden = { depthMetres: 3, drivewayFraction: 0, drivewayWidthMetres: 2, lawnColor: "#65824f", hedge: true };
  const clear = (x,z) => x >= -5 && x <= 5 && z < -.05;
  const group = createFootageFacade({ THREE, profile: { ...profileBase, frontGarden: garden }, ring, base: 10, top: 18, project,
    terrainHeightAtWorld: () => 10, gardenClear: clear });
  const meshes = group.children.filter(node => node.name.startsWith("front-garden-"));
  const driveway = meshes.find(node => node.name === "front-garden-driveway");
  assert.ok(driveway, "driveway cells have one asphalt mesh");
  assert.ok(meshes.length <= 4, "lawn, path, driveway and hedge remain merged per material");
  const points = driveway.geometry.attributes.position.array;
  for (let i=0;i<points.length;i+=3) assert.equal(clear(points[i],points[i+2]), true, "every emitted driveway vertex is inside caller-approved clearance");
  const pathOnly = createFootageFacade({ THREE, profile: { ...profileBase, frontGarden: { depthMetres: 2, pathFraction: 0, pathWidthMetres: 1 } }, ring, base: 10, top: 18, project,
    terrainHeightAtWorld: () => 10, gardenClear: () => true });
  assert.ok(pathOnly.children.some(node => node.name === "front-garden-path"), "explicit pathFraction zero is accepted");
});

test("station special facade still returns early before optional frontage extras", () => {
  const station = { ...profileBase, id: "way/1009651229", style: "station", facadePhoto: { file: "front.jpg" }, frontGarden: { depthMetres: 3 } };
  const group = createFootageFacade({ THREE, profile: station, ring, base: 10, top: 18, project, terrainHeightAtWorld: () => 10, gardenClear: () => true });
  assert.equal(group.children.length, 0);
  assert.equal(group.userData.stationFacadeSuppliedByGame, true);
  assert.equal(group.userData.facadePhotoReady, undefined);
});

test("photo timeout stays bounded", () => { assert.equal(PHOTO_LOAD_TIMEOUT_MS, 15000); });
