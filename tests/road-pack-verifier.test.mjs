import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { encodeRoadTile } from '../city-explorer/road-tile-pack.js';
import { verifyRoadPack } from '../tools/verify-road-pack.mjs';

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
