import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { encodeRoadTile, decodeRoadTile, PackedRoadSurfaceIndex } from '../city-explorer/road-tile-pack.js';
import { verifyRoadPack } from '../tools/verify-road-pack.mjs';
import { RECORDED_CANOPIES, buildRecordedCanopy } from '../city-explorer/recorded-canopies.js';
import { applyReviewedRouteSurfaceCorrections } from '../city-explorer/reviewed-route-surfaces.js';
import { createReviewedCanopyGroundProof } from '../city-explorer/reviewed-canopy-ground.js';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'road-pack-verifier-'));
  const source = Buffer.from('fixture source\n');
  const sourcePath = 'city-explorer/source.js';
  const sources = { [sourcePath]: sha256(source) };
  const buildId = sha256(JSON.stringify(sources)).slice(0, 20);
  const tileId = '0:0';
  const raw = Buffer.from(encodeRoadTile({ id: tileId, groups: [{
    materialKey: 'officialRoad', kind: 'official-road_surfaces', layer: 'road_surfaces', contact: 'official',
    positions: new Float32Array([0, 2, 0, 0, 2, 10, 10, 2, 0]), sourceRanges: []
  }] }));
  const compressed = zlib.gzipSync(raw);
  const tileHash = sha256(raw);
  const url = `0_0-${tileHash.slice(0, 20)}.bin.gz`;
  fs.mkdirSync(path.join(root, 'city-explorer/data/road-pack'), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, sourcePath)), { recursive: true });
  fs.writeFileSync(path.join(root, sourcePath), source);
  fs.writeFileSync(path.join(root, 'city-explorer/data/manifest.json'), JSON.stringify({ generated_at: '2026-10-30T00:00:00Z' }));
  fs.writeFileSync(path.join(root, 'city-explorer/road-pack-version.js'), `export const ROAD_PACK_ID = '${buildId}';\n`);
  fs.writeFileSync(path.join(root, 'city-explorer/data/road-pack', url), compressed);
  const manifest = {
    schemaVersion: 1, buildId, sourceGeneratedAt: '2026-10-30T00:00:00Z', sources,
    tiles: [{ id: tileId, url, bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      bytes: compressed.byteLength, rawBytes: raw.byteLength, compression: 'gzip', triangles: 1,
      sha256: tileHash, transportSha256: sha256(compressed) }],
    totalBytes: compressed.byteLength, totalRawBytes: raw.byteLength, totalTriangles: 1
  };
  fs.writeFileSync(path.join(root, 'city-explorer/data/road-pack/manifest.json'), JSON.stringify(manifest));
  return { root, manifest, url, compressed };
}

test('accepts raw-packet-addressed tiles whose tile hash differs from global build ID', () => {
  const value = fixture();
  try {
    assert.notEqual(value.manifest.tiles[0].sha256.slice(0, 20), value.manifest.buildId);
    assert.equal(value.url, `0_0-${value.manifest.tiles[0].sha256.slice(0, 20)}.bin.gz`);
    assert.deepEqual(verifyRoadPack(value.root), {
      buildId: value.manifest.buildId, tiles: 1, totalBytes: value.manifest.totalBytes,
      totalRawBytes: value.manifest.totalRawBytes, totalTriangles: 1
    });
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
});

test('rejects a tile whose content-addressed filename does not match its raw packet hash', () => {
  const value = fixture();
  try {
    value.manifest.tiles[0].url = `0_0-${value.manifest.buildId}.bin.gz`;
    fs.writeFileSync(path.join(value.root, 'city-explorer/data/road-pack/manifest.json'), JSON.stringify(value.manifest));
    assert.throws(() => verifyRoadPack(value.root), /URL identity mismatch|content-addressed/i);
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
});

test('rejects stale source build identity', () => {
  const value = fixture();
  try {
    value.manifest.buildId = 'a'.repeat(20);
    fs.writeFileSync(path.join(value.root, 'city-explorer/data/road-pack/manifest.json'), JSON.stringify(value.manifest));
    assert.throws(() => verifyRoadPack(value.root), /ROAD_PACK_ID mismatch|build ID does not match/i);
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
});

test('accepts conservative bounds that contain all decoded geometry', () => {
  const value = fixture();
  try {
    value.manifest.tiles[0].bounds = { minX: -0.25, maxX: 10.25, minZ: -0.25, maxZ: 10.25 };
    fs.writeFileSync(path.join(value.root, 'city-explorer/data/road-pack/manifest.json'), JSON.stringify(value.manifest));
    assert.doesNotThrow(() => verifyRoadPack(value.root));
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
});


test('compiler fingerprint normalizes Windows line endings across deployments',()=>{
 const value=fixture();
 try{
  value.manifest.sources['tools/compiler.cjs']=sha256(Buffer.from('compile();\n'));
  fs.mkdirSync(path.join(value.root,'tools'),{recursive:true});
  fs.writeFileSync(path.join(value.root,'tools/compiler.cjs'),'compile();\r\n');
  value.manifest.buildId=sha256(JSON.stringify(value.manifest.sources)).slice(0,20);
  fs.writeFileSync(path.join(value.root,'city-explorer/road-pack-version.js'),`export const ROAD_PACK_ID = '${value.manifest.buildId}';\n`);
  fs.writeFileSync(path.join(value.root,'city-explorer/data/road-pack/manifest.json'),JSON.stringify(value.manifest));
  assert.doesNotThrow(()=>verifyRoadPack(value.root));
  fs.writeFileSync(path.join(value.root,'tools/compiler.cjs'),'changed();\r\n');
  assert.throws(()=>verifyRoadPack(value.root),/source hash mismatch: tools\/compiler.cjs/);
 }finally{fs.rmSync(value.root,{recursive:true,force:true});}
});

function reviewedFixture() {
  const value = fixture(), { root, manifest } = value;
  for (const file of ['reviewed-route-surfaces.js', 'recorded-canopies.js', 'reviewed-canopy-ground.js']) {
    const source = fs.readFileSync(new URL(`../city-explorer/${file}`, import.meta.url));
    fs.writeFileSync(path.join(root, 'city-explorer', file), source);
    manifest.sources[`city-explorer/${file}`] = sha256(Buffer.from(source.toString('utf8').replace(/\r\n/g, '\n').replace(/\?v=\d+\.\d+\.\d+/g, '?v=release')));
  }
  manifest.buildId = sha256(JSON.stringify(manifest.sources)).slice(0, 20);
  fs.writeFileSync(path.join(root, 'city-explorer/road-pack-version.js'), `export const ROAD_PACK_ID = '${manifest.buildId}';\n`);
  const raw = Buffer.from(encodeRoadTile({ id: '-2:-3', groups: [{ materialKey: 'parking', kind: 'official-parking_surfaces',
    layer: 'parking_surfaces', contact: 'official', sourceRanges: [{sourceId:'10/99',startVertex:0,vertexCount:6}], positions: new Float32Array([
      -930,13,-1110, -930,13,-1070, -890,13,-1110, -890,13,-1110, -930,13,-1070, -890,13,-1070,
    ]) }] }));
  const zipped = zlib.gzipSync(raw), hash = sha256(raw), url = `-2_-3-${hash.slice(0, 20)}.bin.gz`;
  fs.writeFileSync(path.join(root, 'city-explorer/data/road-pack', url), zipped);
  manifest.tiles = [{ id: '-2:-3', url, bounds: { minX: -930, maxX: -890, minZ: -1110, maxZ: -1070 },
    bytes: zipped.length, rawBytes: raw.length, compression: 'gzip', triangles: 2, sha256: hash, transportSha256: sha256(zipped) }];
  manifest.totalBytes = zipped.length; manifest.totalRawBytes = raw.length; manifest.totalTriangles = 2;
  const sourceData = JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-road-surfaces.geojson', import.meta.url)));
  manifest.reviewedRouteSurfaces = applyReviewedRouteSurfaceCorrections(sourceData).diagnostics;
  manifest.projection = { center: { lat: 44.3091, lon: -78.3197 } };
  const project = (lat, lon) => ({ x: (lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), y: -(lat - 44.3091) * 110540 });
  const definition = RECORDED_CANOPIES['way/446339023'];
  const canopy = buildRecordedCanopy({ ring: definition.sourceRingLonLat.map(([lon, lat]) => project(lat, lon)), project, groundHeightAt: () => 13 });
  const sourceProof = { schemaVersion: 1, valid: true, sourceId: definition.sourceId, parkingFeatureId: '10/99',
    correctionId: manifest.reviewedRouteSurfaces.correctionId, heightSource: 'rendered-pavement-triangle', samples: canopy.groundSamples };
  const packed = new PackedRoadSurfaceIndex(); packed.addTile('-2:-3', decodeRoadTile(raw).groups);
  manifest.reviewedCanopyGround = createReviewedCanopyGroundProof({ surfaceProof: manifest.reviewedRouteSurfaces, sourceProof, manifest,
    samplePacked: (x, z) => packed.sample(x, z, null, { contact: 'official' }) });
  const save = () => fs.writeFileSync(path.join(root, 'city-explorer/data/road-pack/manifest.json'), JSON.stringify(manifest));
  save(); return { ...value, save };
}

test('a pack compiled with the reviewed correction requires its final ground proof', () => {
  const value = reviewedFixture();
  try {
    assert.equal(verifyRoadPack(value.root).tiles, 1);
    delete value.manifest.reviewedCanopyGround; value.save();
    assert.throws(() => verifyRoadPack(value.root), /canopy ground/i);
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
});

test('the verifier resamples final packets rather than trusting internally consistent copied heights', () => {
  const value = reviewedFixture();
  try {
    for (const key of ['samples', 'sourceSamples']) for (const sample of value.manifest.reviewedCanopyGround[key]) sample.height += .001;
    value.save();
    assert.throws(() => verifyRoadPack(value.root), /pinned canopy ground differs/i);
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
});
