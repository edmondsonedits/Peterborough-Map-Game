import test from 'node:test';
import assert from 'node:assert/strict';
import {
  driveThrottleDemand,
  legacyThrottleDemand,
  driveSpeedScale,
  reverseSpeedScale,
  laneOffsetMeters,
  followingGap,
  followingSpeedLimit,
  selectSafeExit,
  priorityScore
} from '../../gta-fire-response/src/player-benefit-math.js';
import { migrateProgression } from '../../gta-fire-response/src/progression.js';

test('partial mobile stick produces a true crawl while full input is unchanged', () => {
  const partial = .2;
  assert.ok(driveThrottleDemand(partial) < legacyThrottleDemand(partial) * .4);
  assert.ok(driveThrottleDemand(partial) > 0);
  assert.equal(driveThrottleDemand(1), 1);
  assert.equal(driveSpeedScale(1), 1);
  assert.equal(reverseSpeedScale(1), 1);

  const maxSpeed = 23;
  const beforeKmh = legacyThrottleDemand(partial) * maxSpeed * 3.6;
  const afterKmh = driveThrottleDemand(partial) * maxSpeed * 3.6;
  assert.ok(beforeKmh > 25);
  assert.ok(afterKmh < 10);
});

test('civilian traffic uses a normal lane and moves farther right when yielding', () => {
  const segment = { width:14, allowed:8.4 };
  const lane = laneOffsetMeters(segment, false);
  const shoulder = laneOffsetMeters(segment, true);
  assert.ok(lane >= 1.35);
  assert.ok(shoulder > lane);
  assert.ok(shoulder <= segment.allowed);
});

test('same-lane following distance slows cars before overlap', () => {
  const vehicle = { segmentId:2, direction:1, t:.4 };
  const ahead = { segmentId:2, direction:1, t:.5 };
  const opposing = { segmentId:2, direction:-1, t:.5 };
  const gap = followingGap(vehicle, ahead, 100);
  assert.equal(gap, 10);
  assert.equal(followingGap(vehicle, opposing, 100), Infinity);
  assert.ok(followingSpeedLimit(gap, 10) < 2);
  assert.equal(followingSpeedLimit(30, 10), 10);
  assert.equal(followingSpeedLimit(4, 10), 0);
});

test('unsafe exits return null rather than falling back into traffic', () => {
  const candidates = [{ lat:0, lng:0 }, { lat:0, lng:10 }];
  const traffic = [{ active:true, lat:0, lng:0 }, { active:true, lat:0, lng:10 }];
  const distance = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng);
  assert.equal(selectSafeExit(candidates, traffic, null, distance), null);
  traffic[1].active = false;
  assert.deepEqual(selectSafeExit(candidates, traffic, null, distance), candidates[1]);
});

test('progression migration clamps values and derives unlocks from XP', () => {
  const migrated = migrateProgression({
    version:1,
    xp:-200,
    level:99,
    rank:'Chief of Everything',
    unlocks:['legend-radio','not-real'],
    reputation:-3,
    operations:-8,
    achievements:['One','One',4]
  });
  assert.equal(migrated.xp, 0);
  assert.equal(migrated.level, 1);
  assert.notEqual(migrated.rank, 'Chief of Everything');
  assert.ok(!migrated.unlocks.includes('legend-radio'));
  assert.ok(!migrated.unlocks.includes('not-real'));
  assert.equal(migrated.reputation, 0);
  assert.equal(migrated.operations, 0);
  assert.deepEqual(migrated.achievements, ['One']);
});

test('priority scoring favours high-impact low-risk work', () => {
  const precisionDriving = priorityScore({ impact:5, reach:5, confidence:5, effort:2, risk:2 });
  const extraCurrency = priorityScore({ impact:1, reach:2, confidence:2, effort:4, risk:3 });
  assert.ok(precisionDriving > extraCurrency * 20);
});
