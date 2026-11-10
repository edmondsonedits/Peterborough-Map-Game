import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, mkdir, readdir, symlink, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planBusinessWallSigns } from '../city-explorer/business-sign-layout.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const overrides = await read('city-explorer/data/business-current-overrides.json');
const directory = await read('city-explorer/data/business-directory.json');
const coverage = await read('city-explorer/data/business-directory.coverage.json');
const oldId = 'osm:node/462351260';
const newId = 'reviewed:ultramar-852-chemong';
const canopyId = 'way/446339023';

test('Ultramar replaces the stale Husky placement without treating the former brand as an alias', () => {
  const suppressed = overrides.suppressed.find(row => row.id === oldId);
  assert.ok(suppressed, 'the generator must suppress the historical Husky source');
  assert.equal(suppressed.originalRecord.name, 'Husky');
  assert.equal(suppressed.originalRecord.sourceUrl, 'https://www.openstreetmap.org/node/462351260');
  assert.equal(suppressed.originalRecord.observedAt, '2026-10-25T00:46:44.147576+00:00');
  assert.equal(suppressed.originalRecord.buildingSourceId, canopyId);
  assert.equal(suppressed.photoEvidence.recordedOn, '2026-10-18');
  assert.ok(suppressed.photoEvidence.photoIds.includes('R041'));
  const addition = overrides.additions.find(row => row.id === newId);
  assert.equal(addition?.name, 'Ultramar');
  assert.equal(addition.address, '852 Chemong Road');
  assert.equal(addition.buildingSourceId, canopyId);
  assert.equal(addition.openingTopMetres, 4.7);
  assert.equal(addition.aliases, undefined);
  assert.equal(overrides.overrides.some(row => row.matchId === oldId), false, 'use the dated addition path, not the legacy backdated rename path');
});

test('the shipped canopy has exactly one reviewed Ultramar candidate and no active Husky name', () => {
  const rows = directory.businesses.filter(row => row.buildingSourceId === canopyId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, newId);
  assert.equal(rows[0].name, 'Ultramar');
  assert.equal(rows[0].placementStatus, 'approved');
  assert.equal(rows[0].observedAt, '2026-11-10');
  assert.ok(rows[0].sourceIds.includes(newId));
  assert.equal(rows[0].sourceIds.includes(oldId), false, 'historical source identity stays in the suppression evidence');
  assert.equal(directory.businesses.some(row => row.id === oldId), false);
});

test('the paired coverage reports retain matching counts and invalidate the old runtime receipt', () => {
  assert.deepEqual(directory.coverage, coverage.coverage);
  assert.equal(directory.coverage.supersededSourceRecords, overrides.suppressed.length);
  assert.equal(directory.coverage.reviewedAdditions, overrides.additions.length);
  const receipt = directory.coverage.runtimeVerification;
  if (receipt?.build === '1.6.129') {
    assert.equal(directory.coverage.runtimeVerified, false, 'the old receipt cannot verify the corrected station');
    assert.match(directory.coverage.runtimeVerificationInvalidated.reason, /Ultramar/);
  } else if (directory.coverage.runtimeVerified) {
    assert.ok(Date.parse(receipt?.checkedAt) >= Date.parse('2026-11-10'), 'a future verified state needs a newer receipt');
  }
});

test('isolated regeneration keeps the suppression and dated Ultramar addition', async () => {
  const suppressed = overrides.suppressed.find(row => row.id === oldId);
  assert.ok(suppressed?.originalRecord);
  const work = await mkdtemp(path.join(tmpdir(), 'ultramar-business-'));
  try {
    const input = path.join(work, 'source.json'), output = path.join(work, 'directory.json');
    await writeFile(input, JSON.stringify([suppressed.originalRecord]));
    execFileSync(process.execPath, ['tools/build-business-directory.mjs', '--input', input, '--output', output], {
      cwd: root, timeout: 60_000, encoding: 'utf8', stdio: 'pipe',
    });
    const generated = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(generated.businesses.some(row => row.id === oldId), false);
    const row = generated.businesses.find(item => item.id === newId);
    assert.ok(row);
    assert.equal(row.observedAt, '2026-11-10', 'regeneration must not backdate this review to October 24');
    assert.equal(row.name, 'Ultramar');
    assert.equal(row.buildingSourceId, canopyId);
    assert.equal(row.placementStatus, 'approved');
    for (const key of ['openingTopMetres', 'heightAboveBaseMetres', 'heightMetres', 'widthMetres', 'fraction']) {
      assert.equal(row[key], overrides.additions.find(item => item.id === newId)[key], `${key} survives regeneration`);
    }
    assert.deepEqual(row, directory.businesses.find(item => item.id === newId), 'only the isolated generated candidate is copied to the shipped catalogue');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('reviewed override placement preserves ordinary defaults and cannot lower inferred clearance or bypass rejection', async () => {
  const work = await mkdtemp(path.join(tmpdir(), 'business-placement-'));
  try {
    await mkdir(path.join(work, 'tools'));
    await mkdir(path.join(work, 'city-explorer/data'), { recursive: true });
    await copyFile(path.join(root, 'tools/build-business-directory.mjs'), path.join(work, 'tools/build-business-directory.mjs'));
    await symlink(path.join(root, 'tools/business-building-match.mjs'), path.join(work, 'tools/business-building-match.mjs'));
    for (const name of await readdir(path.join(root, 'city-explorer'))) {
      if (name !== 'data') await symlink(path.join(root, 'city-explorer', name), path.join(work, 'city-explorer', name));
    }
    for (const name of await readdir(path.join(root, 'city-explorer/data'))) {
      if (name !== 'business-current-overrides.json') await symlink(path.join(root, 'city-explorer/data', name), path.join(work, 'city-explorer/data', name));
    }
    const candidates = directory.businesses.filter(row => row.placementStatus === 'approved' && row.buildingSourceId !== canopyId && row.sourceKind === 'osm');
    const chosen = [];
    for (const row of candidates) {
      if (chosen.some(old => old.buildingSourceId === row.buildingSourceId)) continue;
      chosen.push({ ...row, id: `fixture:${chosen.length}` });
      if (chosen.length === 3) break;
    }
    assert.equal(chosen.length, 3);
    const [ordinary, reviewed, impossible] = chosen;
    ordinary.openingTopMetres = 999;
    ordinary.widthMetres = 999;
    const fixtureOverrides = { overrides: [
      { matchId: reviewed.id, name: reviewed.name, address: reviewed.parcelAddress || reviewed.address, sourceUrl: reviewed.sourceUrl,
        openingTopMetres: .1, heightAboveBaseMetres: 3.1, heightMetres: .35, widthMetres: 2.8, fraction: .4 },
      { matchId: impossible.id, name: impossible.name, address: impossible.parcelAddress || impossible.address, sourceUrl: impossible.sourceUrl,
        openingTopMetres: 999, heightAboveBaseMetres: 1000, heightMetres: .35, widthMetres: 2.8, fraction: .5 },
    ], additions: [], suppressed: [] };
    await writeFile(path.join(work, 'city-explorer/data/business-current-overrides.json'), JSON.stringify(fixtureOverrides));
    await writeFile(path.join(work, 'input.json'), JSON.stringify(chosen));
    execFileSync(process.execPath, ['tools/build-business-directory.mjs', '--input', path.join(work, 'input.json'), '--output', path.join(work, 'output.json')], {
      cwd: work, timeout: 60_000, encoding: 'utf8', stdio: 'pipe',
    });
    const result = JSON.parse(await readFile(path.join(work, 'output.json'), 'utf8')).businesses;
    const plain = result.find(row => row.id === ordinary.id), kept = result.find(row => row.id === reviewed.id), rejected = result.find(row => row.id === impossible.id);
    assert.equal(plain.widthMetres, undefined, 'unreviewed source fields do not become placement overrides');
    assert.ok(plain.openingTopMetres < 999);
    assert.ok(kept.openingTopMetres >= 2.2, 'reviewed clearance cannot lower the inferred opening band');
    for (const key of ['heightAboveBaseMetres', 'heightMetres', 'widthMetres', 'fraction']) assert.equal(kept[key], fixtureOverrides.overrides[0][key]);
    assert.equal(rejected.placementStatus, 'needs-review');
    assert.equal(rejected.reason, 'insufficient-height-above-opening');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('a directory fallback fits the actual canopy fascia and rejects a wall ending below it', () => {
  const row = directory.businesses.find(item => item.id === newId);
  assert.ok(row);
  const origin = row.frontage[0];
  const project = (lat, lon) => ({ x: (lon - origin.lon) * 79_720, z: -(lat - origin.lat) * 110_540 });
  const sourceRing = [
    [44.3189701, -78.3312310], [44.3190320, -78.3311098],
    [44.3189790, -78.3310571], [44.3189170, -78.3311783],
  ].map(([lat, lon]) => project(lat, lon));
  const building = { sourceId: canopyId, polygons: [{ rings: [sourceRing], base: 100, wallTop: 105.25 }] };
  const fitting = planBusinessWallSigns({ building, businesses: [row], project });
  assert.equal(fitting.signs.length, 1);
  assert.ok(fitting.signs[0].bottom >= 104.7);
  assert.ok(fitting.signs[0].top <= 105.25);
  assert.equal(fitting.signs[0].width, 4.1);
  const low = { ...building, polygons: [{ ...building.polygons[0], wallTop: 104.7 }] };
  assert.equal(planBusinessWallSigns({ building: low, businesses: [row], project }).signs.length, 0);
});
