import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupFeaturesByTile,
  isInInitialCityBuildCohort,
  runProgressiveCityBuild,
} from '../city-explorer/progressive-city-build.mjs';

test('groups features by tile in first-seen tile order without changing feature order', () => {
  const features = [
    { id: 'one', tile: 'north' },
    { id: 'two', tile: 'south' },
    { id: 'three', tile: 'north' },
  ];
  const groups = groupFeaturesByTile(features, feature => feature.tile);
  assert.deepEqual(groups, [
    { key: 'north', features: [features[0], features[2]] },
    { key: 'south', features: [features[1]] },
  ]);
});

test('initial cohort includes priorities and any nested multipart ring intersecting the spawn square', () => {
  const options = { spawnX: 10, spawnZ: 20, radius: 5, priorityIds: new Set(['urgent']) };
  const farPolygon = [[40, 40], [50, 40], [50, 50], [40, 50]];
  const edgePolygon = [[15, 24], [17, 24], [17, 26], [15, 26]];
  assert.equal(isInInitialCityBuildCohort({ id: 'urgent', rings: [farPolygon] }, options), true);
  assert.equal(isInInitialCityBuildCohort({ id: 'edge', rings: [[farPolygon], [edgePolygon]] }, options), true);
  assert.equal(isInInitialCityBuildCohort({ id: 'far', rings: [farPolygon] }, options), false);
  assert.equal(isInInitialCityBuildCohort({ id: 'xy', rings: [[[-1, -1], [0, -1], [0, 0], [-1, 0]]] }, {
    spawnX: 0, spawnZ: 0, radius: 1,
  }), true, 'numeric x/y coordinate pairs use the same axis-aligned bounds');
  assert.equal(isInInitialCityBuildCohort({ id: 'vector', rings: [[{ x: -1, z: -1 }, { x: 0, y: -1 }, { x: 0, z: 0 }]] }, {
    spawnX: 0, spawnZ: 0, radius: 1,
  }), true, 'Vector2-style x/y and x/z points are accepted');
});

test('builds each feature once, preserves feature order within a group, awaits commits, and yields after each commit', async () => {
  const groups = [
    { key: 'a', features: [{ id: 'a1' }, { id: 'a2' }] },
    { key: 'b', features: [{ id: 'b1' }] },
  ];
  const events = [];
  const metrics = await runProgressiveCityBuild({
    groups,
    buildFeature(feature) { events.push(`build:${feature.id}`); return `mesh:${feature.id}`; },
    async commitGroup(group) {
      events.push(`commit-start:${group.key}`);
      await Promise.resolve();
      events.push(`commit-end:${group.key}`);
    },
    onCommit(group, progress) { events.push(`progress:${group.key}:${progress.groupsCompleted}`); },
    now: () => 0,
    async yieldFrame() { events.push('yield'); },
  });
  assert.deepEqual(events, [
    'build:a1', 'build:a2', 'commit-start:a', 'commit-end:a', 'progress:a:1', 'yield',
    'build:b1', 'commit-start:b', 'commit-end:b', 'progress:b:2', 'yield',
  ]);
  assert.deepEqual(metrics, { featuresCompleted: 3, groupsCompleted: 2, maxSliceMs: 0, commitElapsedMs: 0 });
});

test('reselects deferred groups from the latest focus after each committed group', async () => {
  const groups = [
    { key: 'initial', initial: true, features: [{ id: 'i' }] },
    { key: 'west', features: [{ id: 'w' }] },
    { key: 'east', features: [{ id: 'e' }] },
  ];
  let focus = 'west';
  const order = [];
  await runProgressiveCityBuild({
    groups,
    buildFeature(feature) { order.push(feature.id); return feature.id; },
    commitGroup() {},
    getFocus: () => focus,
    getDistance: (group, current) => group.key === current ? 0 : 1,
    onCommit(group) { if (group.key === 'initial') focus = 'east'; },
    now: () => 0,
    yieldFrame: async () => {},
  });
  assert.deepEqual(order, ['i', 'e', 'w']);
});

test('yields at budget deadlines between whole features and reports the longest work slice', async () => {
  const groups = [{ key: 'tile', features: [{ id: 'slow', cost: 7 }, { id: 'quick', cost: 1 }] }];
  let time = 0;
  const events = [];
  const metrics = await runProgressiveCityBuild({
    groups,
    budgetMs: 5,
    now: () => time,
    buildFeature(feature) { events.push(`build:${feature.id}`); time += feature.cost; return feature.id; },
    commitGroup() { events.push('commit'); time += 2; },
    yieldFrame: async () => { events.push('yield'); },
  });
  assert.deepEqual(events, ['build:slow', 'yield', 'build:quick', 'commit', 'yield']);
  assert.equal(metrics.maxSliceMs, 7);
});

test('excludes awaited commit time from active build slices and reports it separately', async () => {
  let time = 0;
  const metrics = await runProgressiveCityBuild({
    groups: [{ key: 'tile', features: [{ id: 'a' }, { id: 'b' }] }],
    budgetMs: 10,
    now: () => time,
    buildFeature() { time += 2; },
    async commitGroup() { await Promise.resolve(); time += 25; },
    yieldFrame: async () => {},
  });
  assert.equal(metrics.maxSliceMs, 4);
  assert.equal(metrics.commitElapsedMs, 25);
});

test('propagates build and commit failures without returning a completion result', async () => {
  const buildError = new Error('feature failed');
  await assert.rejects(runProgressiveCityBuild({
    groups: [{ key: 'tile', features: [{ id: 'bad' }] }],
    buildFeature() { throw buildError; },
    commitGroup() { assert.fail('must not commit after a build error'); },
    now: () => 0,
    yieldFrame: async () => {},
  }), error => error === buildError);

  const commitError = new Error('commit failed');
  let commits = 0;
  await assert.rejects(runProgressiveCityBuild({
    groups: [{ key: 'tile', features: [{ id: 'ok' }] }],
    buildFeature(feature) { return feature.id; },
    commitGroup() { commits += 1; throw commitError; },
    now: () => 0,
    yieldFrame: async () => {},
  }), error => error === commitError);
  assert.equal(commits, 1);
});
