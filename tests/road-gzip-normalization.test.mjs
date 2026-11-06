import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { normalizeRoadPack } from '../tools/normalize-road-gzip.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function makeFixture({ osByte = 3, corruptRawSha = false, flags = 0, url = 'tile-a.bin.gz', secondTile = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'road-gzip-normalization-'));
  const raw = Buffer.from('same packed road geometry, byte-for-byte\n');
  let gzip = zlib.gzipSync(raw);
  gzip[3] = flags;
  gzip[9] = osByte;
  const rawSha = sha256(raw);
  const entries = [{
    id: '0:0', url, bytes: gzip.length, rawBytes: raw.length, compression: 'gzip', triangles: 1,
    sha256: corruptRawSha ? '0'.repeat(64) : rawSha, transportSha256: sha256(gzip),
  }];
  fs.writeFileSync(path.join(directory, path.basename(url)), gzip);
  if (secondTile) {
    const secondGzip = zlib.gzipSync(raw);
    secondGzip[9] = 10;
    fs.writeFileSync(path.join(directory, 'tile-b.bin.gz'), secondGzip);
    entries.push({ id: '1:0', url: 'tile-b.bin.gz', bytes: secondGzip.length, rawBytes: raw.length, compression: 'gzip', triangles: 1, sha256: '0'.repeat(64), transportSha256: sha256(secondGzip) });
  }
  const manifest = { schemaVersion: 1, buildId: 'a'.repeat(20), sourceGeneratedAt: 'fixture', sources: { 'fixture.js': 'b'.repeat(64) }, tiles: entries, totalBytes: entries.reduce((sum, tile) => sum + tile.bytes, 0), totalRawBytes: entries.reduce((sum, tile) => sum + tile.rawBytes, 0), totalTriangles: entries.length };
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  return { directory, raw, dispose: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('OS 3 and OS 10 gzip headers normalize to identical canonical files and manifests', (t) => {
  const linux = makeFixture({ osByte: 3 });
  const windows = makeFixture({ osByte: 10 });
  t.after(linux.dispose); t.after(windows.dispose);
  const linuxResult = normalizeRoadPack(linux.directory);
  const windowsResult = normalizeRoadPack(windows.directory);
  assert.equal(linuxResult.changedTiles, 0);
  assert.equal(windowsResult.changedTiles, 1);
  assert.deepEqual(fs.readFileSync(path.join(linux.directory, 'tile-a.bin.gz')), fs.readFileSync(path.join(windows.directory, 'tile-a.bin.gz')));
  assert.deepEqual(fs.readFileSync(path.join(linux.directory, 'manifest.json')), fs.readFileSync(path.join(windows.directory, 'manifest.json')));
  assert.deepEqual(zlib.gunzipSync(fs.readFileSync(path.join(windows.directory, 'tile-a.bin.gz'))), linux.raw);
});

test('rejects raw-hash mismatch before changing any tile or manifest', (t) => {
  const fixture = makeFixture({ osByte: 10, secondTile: true, corruptRawSha: false });
  t.after(fixture.dispose);
  const manifestPath = path.join(fixture.directory, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.tiles[1].sha256 = '0'.repeat(64);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const before = fs.readFileSync(path.join(fixture.directory, 'tile-a.bin.gz'));
  const beforeManifest = fs.readFileSync(manifestPath);
  assert.throws(() => normalizeRoadPack(fixture.directory), /raw.*(hash|sha)|sha.*raw/i);
  assert.deepEqual(fs.readFileSync(path.join(fixture.directory, 'tile-a.bin.gz')), before);
  assert.deepEqual(fs.readFileSync(manifestPath), beforeManifest);
});

test('is idempotent and updates only road-pack transport metadata without changing raw identity', (t) => {
  const fixture = makeFixture({ osByte: 10 });
  t.after(fixture.dispose);
  const originalManifest = JSON.parse(fs.readFileSync(path.join(fixture.directory, 'manifest.json'), 'utf8'));
  const first = normalizeRoadPack(fixture.directory);
  const canonicalTile = fs.readFileSync(path.join(fixture.directory, 'tile-a.bin.gz'));
  const canonicalManifest = fs.readFileSync(path.join(fixture.directory, 'manifest.json'));
  const second = normalizeRoadPack(fixture.directory);
  assert.equal(first.changedTiles, 1);
  assert.equal(second.changedTiles, 0);
  assert.deepEqual(fs.readFileSync(path.join(fixture.directory, 'tile-a.bin.gz')), canonicalTile);
  assert.deepEqual(fs.readFileSync(path.join(fixture.directory, 'manifest.json')), canonicalManifest);
  const manifest = JSON.parse(canonicalManifest);
  assert.equal(manifest.buildId, originalManifest.buildId);
  assert.deepEqual(manifest.sources, originalManifest.sources);
  assert.deepEqual(manifest.tiles[0], { ...originalManifest.tiles[0], bytes: canonicalTile.length, transportSha256: sha256(canonicalTile) });
  assert.equal(manifest.tiles[0].sha256, sha256(fixture.raw));
});

test('rejects FHCRC and tile paths escaping the pack directory', (t) => {
  const crcHeader = makeFixture({ osByte: 10, flags: 2 });
  t.after(crcHeader.dispose);
  assert.throws(() => normalizeRoadPack(crcHeader.directory), /FHCRC/i);

  const traversal = makeFixture({ osByte: 10, url: '../outside.bin.gz' });
  t.after(traversal.dispose);
  assert.throws(() => normalizeRoadPack(traversal.directory), /outside|escape|within/i);
});
