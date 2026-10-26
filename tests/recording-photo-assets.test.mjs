import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RECORDING_PHOTO_PROFILES} from '../city-explorer/recording-photo-profiles.js';

const manifestUrl = new URL('../city-explorer/assets/recording-frontages/manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));

test('recording photo profiles match the reviewed, budgeted assets', async () => {
  const ids = manifest.records.map(record => record.id).sort();
  assert.deepEqual(ids, Object.keys(RECORDING_PHOTO_PROFILES).sort());
  assert.equal(new Set(ids).size, ids.length);

  let totalBytes = 0;
  let totalMipBytes = 0;
  for (const record of manifest.records) {
    const overlay = RECORDING_PHOTO_PROFILES[record.id];
    const photo = overlay.facadePhoto;
    assert.ok(photo, `${record.id} has a photo overlay`);
    assert.equal(photo.file, `./assets/recording-frontages/${record.file}`);
    assert.equal(photo.sha256, record.sha256);
    assert.equal(photo.sourceSha256, record.sourceSha256);
    assert.equal(photo.keepProceduralDetails, true);
    assert.ok(record.sourcePath.startsWith('H:/ChatGPT/Peterborough-Building-References-20261024/'));
    assert.ok(record.sourceSha256 && record.sha256);
    assert.ok(Math.max(...record.dimensions) <= manifest.limits.longestSide);
    assert.ok(record.bytes <= 1024 * 1024);
    assert.ok(record.mipEstimateBytes > 0);

    const file = new URL(photo.file, new URL('../city-explorer/', import.meta.url));
    const bytes = await readFile(file);
    assert.equal(bytes.length, record.bytes, `${record.id} byte count`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, `${record.id} SHA-256`);
    const fileStat = await stat(file);
    assert.equal(fileStat.size, record.bytes);

    totalBytes += record.bytes;
    totalMipBytes += record.mipEstimateBytes;
    assert.ok(!('frontLatLon' in overlay) && !('eaveHeight' in overlay) && !('roofRise' in overlay),
      `${record.id} overlay does not replace building geometry`);
  }

  assert.equal(totalBytes, manifest.totalBytes);
  assert.equal(totalMipBytes, manifest.decodedTextureBytesWithMipmaps);
  assert.ok(totalBytes <= manifest.limits.encodedBytes);
  assert.ok(totalMipBytes <= manifest.limits.decodedTextureBytesWithMipmaps);
});

test('Commerce sign patch is explicitly attached to its Water wing', () => {
  assert.equal(RECORDING_PHOTO_PROFILES['way/1006243562'].frontageIndex, 1);
  assert.ok(RECORDING_PHOTO_PROFILES['way/1006243562'].facadePhoto.widthFraction < 0.05,
    'narrow permanent sign uses a small partial patch');
});
