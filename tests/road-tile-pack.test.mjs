import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PackedRoadSurfaceIndex,
  decodeRoadTile,
  encodeRoadTile,
} from '../city-explorer/road-tile-pack.js';
import { RoadTileStream } from '../city-explorer/road-tile-stream.js';

function group(overrides = {}) {
  return {
    materialKey: 'asphalt', kind: 'road', layer: 'road_surfaces', contact: 'official',
    positions: new Float32Array([
      0, 1, 0, 10, 2, 0, 10, 3, 10,
      0, 1, 0, 10, 3, 10, 0, 2, 10,
    ]),
    normals: new Float32Array(18).fill(1),
    sourceRanges: [{ sourceId: 'way/17', startVertex: 0, vertexCount: 6 }],
    ...overrides,
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function manifest(ids, size = 100) {
  return { tiles: ids.map((id, index) => ({ id, url: `${id}.bin`, bounds: {
    minX: index * size, maxX: (index + 1) * size, minZ: 0, maxZ: size,
  } })) };
}

test('road tile codec roundtrips metadata and zero-copy typed arrays', () => {
  const source = { id: '0:0', groups: [group()] };
  const packet = encodeRoadTile(source);
  assert.ok(packet instanceof ArrayBuffer);
  const decoded = decodeRoadTile(packet);
  assert.equal(decoded.id, source.id);
  assert.equal(decoded.groups[0].materialKey, 'asphalt');
  assert.equal(decoded.groups[0].contact, 'official');
  assert.deepEqual([...decoded.groups[0].positions], [...source.groups[0].positions]);
  assert.deepEqual([...decoded.groups[0].normals], [...source.groups[0].normals]);
  assert.deepEqual(decoded.groups[0].sourceRanges, source.groups[0].sourceRanges);
  assert.equal(decoded.groups[0].positions.buffer, packet, 'decode views geometry directly from the packet');
  decoded.groups[0].positions[0] = 99;
  assert.equal(new Float32Array(packet, decoded.groups[0].positions.byteOffset, 1)[0], 99);
});

test('codec rejects malformed, nonfinite, oversized and out-of-bounds packets', () => {
  const packet = encodeRoadTile({ id: '0:0', groups: [group()] });
  const badMagic = packet.slice(0);
  new Uint8Array(badMagic)[0] ^= 0xff;
  assert.throws(() => decodeRoadTile(badMagic), /magic/i);
  assert.throws(() => decodeRoadTile(packet, { maxBytes: 8 }), /size/i);
  assert.throws(() => encodeRoadTile({ id: 'bad', groups: [group({ positions: new Float32Array([0, NaN, 0]) })] }), /finite/i);
  assert.throws(() => encodeRoadTile({ id: 'bad', groups: [group({ sourceRanges: [
    { sourceId: 'way/17', startVertex: 5, vertexCount: 2 },
  ] })] }), /source range/i);
  const corrupt = packet.slice(0);
  new DataView(corrupt).setUint32(12, 0xfffffff0, true);
  assert.throws(() => decodeRoadTile(corrupt), /length|bounds|metadata/i);
  const badOffset = packet.slice(0);
  const badBytes = new Uint8Array(badOffset);
  const metadataLength = new DataView(badOffset).getUint32(8, true);
  const metadataText = new TextDecoder().decode(badBytes.subarray(16, 16 + metadataLength));
  const mutated = metadataText.replace('"positionOffset":0', '"positionOffset":9');
  assert.notEqual(mutated, metadataText);
  badBytes.set(new TextEncoder().encode(mutated), 16);
  assert.throws(() => decodeRoadTile(badOffset), /bounds/i);
  const nonfinite = packet.slice(0);
  const bodyOffset = (16 + metadataLength + 3) & ~3;
  new Float32Array(nonfinite, bodyOffset, 1)[0] = Infinity;
  assert.throws(() => decodeRoadTile(nonfinite), /nonfinite/i);
});

test('packed contact index preserves triangle seams, Float32 grade, and stacked deck selection', () => {
  const index = new PackedRoadSurfaceIndex(5);
  const road = group({ id: undefined });
  index.addTile('tile-a', [road]);
  // Two coincident contact sources at different heights; same-grade official wins over fallback.
  const fallback = group({ contact: 'fallback', positions: new Float32Array([
    0, 1, 0, 10, 2, 0, 10, 3, 10, 0, 1, 0, 10, 3, 10, 0, 2, 10,
  ]) });
  const official = group({ layer: 'bridges', contact: 'official', positions: new Float32Array([
    0, 12, 0, 10, 13, 0, 10, 14, 10, 0, 12, 0, 10, 14, 10, 0, 13, 10,
  ]) });
  index.addTile('tile-b', [fallback]);
  index.addTile('tile-c', [official]);
  assert.equal(index.sample(10, 5, 1.75).height, Math.fround(2.5), 'seam sample uses exact indexed Float32 triangles');
  assert.equal(index.sample(5, 5, 12.5).height, Math.fround(13));
  assert.equal(index.sample(5, 5, 12.5).contact, 'official');
  assert.equal(index.sample(5, 5, 1.5, { contact: 'official' }).contact, 'official');
  assert.equal(index.sample(5, 5, 1.5, { contact: 'fallback' }).contact, 'fallback');
  index.removeTile('tile-c');
  assert.equal(index.sample(5, 5, 12.5).layer, 'road_surfaces', 'removed bridge contact no longer contributes');
  assert.equal(index.sample(5, 5, 1.5).contact, 'official', 'official road contact still wins fallback at same grade');
  assert.equal(index.sample(5, 5, 1.5).sourceId, 'way/17');
});

test('tile stream bounds concurrent loads and evicts only after desired tiles arrive', async () => {
  let active = 0, peak = 0;
  const released = [];
  const stream = new RoadTileStream({ manifest: manifest(['a', 'b', 'c', 'd']),
    concurrency: 2, radius: 30, retainRadius: 40,
    loadTile: async (tile) => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { groups: [group()], byteLength: 1024 };
    },
    commitTile: () => {}, releaseTile: (id) => released.push(id),
  });
  await stream.update(50, 50, { protectX: 150, protectZ: 50, protectRadius: 20 });
  assert.ok(peak <= 2);
  assert.equal(stream.stats().residentCount, 2);
  await stream.update(350, 50, { protectX: 50, protectZ: 50, protectRadius: 20 });
  assert.equal(stream.stats().residentCount, 2, 'only the new resident tile and player-protected tile remain');
  assert.equal(stream.stats().residentBytes, 2048);
  assert.ok(released.length >= 1);
  await stream.dispose();
  assert.equal(stream.stats().residentCount, 0);
});

test('stale async loads are released without committing after the center changes', async () => {
  const old = deferred();
  const commits = [], releases = [];
  const stream = new RoadTileStream({ manifest: manifest(['old', 'new'], 300), concurrency: 1,
    radius: 20, retainRadius: 40,
    loadTile: (tile) => tile.id === 'old' ? old.promise : Promise.resolve({ groups: [group()] }),
    commitTile: (id) => commits.push(id), releaseTile: (id) => releases.push(id),
  });
  const first = stream.update(50, 50, { protectX: 50, protectZ: 50, protectRadius: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = stream.update(350, 50, { protectX: 350, protectZ: 50, protectRadius: 0 });
  old.resolve({ groups: [group()] });
  await Promise.all([first, second]);
  assert.ok(!commits.includes('old'));
  assert.ok(releases.includes('old'));
  assert.ok(commits.includes('new'));
  await stream.dispose();
});

test('failed loads report explicitly and leave nearby resident fallback tiles intact', async () => {
  const errors = [];
  let fail = false;
  const stream = new RoadTileStream({ manifest: manifest(['near', 'next']), concurrency: 1,
    radius: 10, retainRadius: 200,
    loadTile: async (tile) => {
      if (fail && tile.id === 'next') throw new Error('offline');
      return { groups: [group()], byteLength: 256 };
    },
    commitTile: () => {}, releaseTile: () => {}, onError: (id, error) => errors.push([id, error.message]),
  });
  await stream.update(50, 50, { protectX: 50, protectZ: 50, protectRadius: 10 });
  fail = true;
  await stream.update(150, 50, { protectX: 50, protectZ: 50, protectRadius: 10 });
  assert.deepEqual(errors, [['next', 'offline']]);
  assert.ok(stream.stats().residentCount >= 1);
  assert.equal(stream.stats().failures, 1);
  await stream.dispose();
});




test('same-grade official pavement beats a slightly lower fallback while separated decks use the height hint', () => {
  const index = new PackedRoadSurfaceIndex(5);
  const flat = (height, contact, layer = 'road_surfaces') => ({
    materialKey: 'road', kind: 'surface', layer, contact,
    positions: new Float32Array([0,height,0, 10,height,0, 10,height,10, 0,height,0, 10,height,10, 0,height,10]),
  });
  index.addTile('fallback-ground', [flat(0, 'fallback')]);
  index.addTile('official-ground', [flat(0.008, 'official')]);
  index.addTile('bridge', [flat(8, 'official', 'bridges')]);
  assert.equal(index.sample(2, 2, 0).id, 'official-ground');
  assert.ok(Math.abs(index.sample(2, 2, 0).height - Math.fround(0.008)) < 1e-8);
  assert.equal(index.sample(2, 2, 0, { contact: 'fallback' }).id, 'fallback-ground');
  assert.equal(index.sample(2, 2, 0).layer, 'road_surfaces', 'the separated bridge does not win near ground level');
  assert.equal(index.sample(2, 2, 8).layer, 'bridges', 'the height hint selects the stacked deck');
});

test('camera movement within a desired tile reuses its in-flight load', async () => {
  const pending = deferred();
  let loads = 0, commits = 0;
  const stream = new RoadTileStream({ manifest: manifest(['only']), radius: 50, retainRadius: 60,
    loadTile: () => { loads += 1; return pending.promise; },
    commitTile: () => { commits += 1; },
  });
  const first = stream.update(50, 50, { protectX: 50, protectZ: 50, protectRadius: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = stream.update(51, 50, { protectX: 51, protectZ: 50, protectRadius: 0 });
  assert.equal(loads, 1);
  pending.resolve({ groups: [group()] });
  await Promise.all([first, second]);
  assert.equal(loads, 1);
  assert.equal(commits, 1);
  await stream.dispose();
});
test('a stale same-id load cannot release a newer resident tile', async () => {
  const old = deferred();
  let sameLoads = 0;
  const commits = [], releases = [];
  const stream = new RoadTileStream({ manifest: manifest(['same', 'away']), concurrency: 2,
    radius: 10, retainRadius: 10,
    loadTile: (tile) => {
      if (tile.id === 'same' && sameLoads++ === 0) return old.promise;
      return Promise.resolve({ label: `${tile.id}-${sameLoads}`, groups: [group()] });
    },
    commitTile: (id, tile) => commits.push([id, tile]),
    releaseTile: (id, tile) => releases.push([id, tile]),
  });
  const initial = stream.update(50, 50, { protectX: 50, protectZ: 50, protectRadius: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await stream.update(150, 50, { protectX: 150, protectZ: 50, protectRadius: 0 });
  await stream.update(50, 50, { protectX: 50, protectZ: 50, protectRadius: 0 });
  old.resolve({ label: 'stale-same', groups: [group()] });
  await initial;
  assert.ok(commits.some(([id, tile]) => id === 'same' && tile.label !== 'stale-same'));
  assert.ok(!releases.some(([id, tile]) => id === 'same' && tile.label === 'stale-same'));
  await stream.dispose();
});

test('contact samples retain the stable source identity of their triangle range', () => {
  const index = new PackedRoadSurfaceIndex(5);
  index.addTile('tile-way', [group()]);
  assert.equal(index.sample(5, 5, 1.5).sourceId, 'way/17');
});

test('failed tile commits release the unresident loaded asset and report the error', async () => {
  const released = [], errors = [];
  const stream = new RoadTileStream({ manifest: manifest(['broken']), radius: 20, retainRadius: 30,
    loadTile: async () => ({ label: 'uncommitted', groups: [group()] }),
    commitTile: () => { throw new Error('renderer rejected tile'); },
    releaseTile: (id, tile, reason) => released.push([id, tile.label, reason?.failed]),
    onError: (id, error) => errors.push([id, error.message]),
  });
  await stream.update(50, 50, { protectX: 50, protectZ: 50, protectRadius: 0 });
  assert.deepEqual(released, [['broken', 'uncommitted', true]]);
  assert.deepEqual(errors, [['broken', 'renderer rejected tile']]);
  assert.equal(stream.stats().residentCount, 0);
  await stream.dispose();
});
test('disposing prevents a late pending result from committing', async () => {
  const pending = deferred();
  const committed = [], released = [];
  const stream = new RoadTileStream({ manifest: manifest(['late']), radius: 20, retainRadius: 30,
    loadTile: () => pending.promise,
    commitTile: (id) => committed.push(id),
    releaseTile: (id) => released.push(id),
  });
  const update = stream.update(50, 50, { protectX: 50, protectZ: 50, protectRadius: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await stream.dispose();
  pending.resolve({ groups: [group()] });
  await update;
  assert.deepEqual(committed, []);
  assert.deepEqual(released, ['late']);
});

test('invalid tile replacement preserves the previously indexed surface', () => {
  const index = new PackedRoadSurfaceIndex(5);
  index.addTile('stable', [group()]);
  assert.throws(() => index.addTile('stable', [{ ...group(), positions: new Float32Array([0, NaN, 0]) }]), /nonfinite|invalid/i);
  assert.equal(index.sample(5, 5, 1.5).id, 'stable');
});

test('hidden or degenerated streamed triangles cannot yield nonfinite driving contact',()=>{const g=group(),index=new PackedRoadSurfaceIndex();index.addTile('tile',[g]);g.positions.fill(0);assert.equal(index.sample(1,1,1),null);});
