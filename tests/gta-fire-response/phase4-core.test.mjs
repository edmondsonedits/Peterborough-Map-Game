import test from 'node:test';
import assert from 'node:assert/strict';
import { APPARATUS_PROFILES, CITY_DISTRICTS, CITY_STATIONS, SHIFT_CHALLENGES } from '../../gta-fire-response/src/phase4-data.js';
import { callPayout, challengeProgress, chooseCoverageStation, coverageGrade, distanceMeters, fuelUse, mutualAidEta, pickChallenges, readinessScore, serviceQuote } from '../../gta-fire-response/src/phase4-math.js';
import { Phase4SaveStore, migratePhase4Save } from '../../gta-fire-response/src/phase4-save.js';

test('station coordinates produce sensible city distances', () => {
  const station1 = CITY_STATIONS[0];
  const station3 = CITY_STATIONS[2];
  const distance = distanceMeters(station1, station3);
  assert.ok(distance > 2500);
  assert.ok(distance < 6000);
});

test('coverage selection favours a nearby ready station', () => {
  const call = { lat:44.2849, lng:-78.3508 };
  const states = Object.fromEntries(CITY_STATIONS.map(station => [station.id, { fuel:100, water:750, maxWater:750, condition:{ body:100, steering:100, engine:100, lights:100, pump:100 } }]));
  const best = chooseCoverageStation(call, CITY_STATIONS, states);
  assert.equal(best.station.id, 'station-3');
  assert.ok(best.score > 60);
});

test('readiness and service quote reflect depleted apparatus', () => {
  const profile = APPARATUS_PROFILES[0];
  const state = { fuel:20, water:100, maxWater:profile.tank, condition:{ body:40, steering:70, engine:80, lights:90, pump:60 } };
  assert.ok(readinessScore(state) < 65);
  const quote = serviceQuote(state, profile);
  assert.ok(quote.repair > 0);
  assert.ok(quote.refuel > 0);
  assert.ok(quote.refill > 0);
  assert.ok(quote.full < quote.repair + quote.refuel + quote.refill);
});

test('call payout rewards strong response and readiness', () => {
  const strong = callPayout({ score:950, tacticalRank:'S', responseMinutes:2, modifier:1.1, readiness:95 });
  const weak = callPayout({ score:350, tacticalRank:'C', responseMinutes:8, modifier:1, readiness:45 });
  assert.ok(strong > weak);
  assert.ok(weak >= 75);
});

test('fuel use and mutual-aid ETA scale predictably', () => {
  const engine = fuelUse(5000, APPARATUS_PROFILES[0]);
  const ladder = fuelUse(5000, APPARATUS_PROFILES[3]);
  assert.ok(ladder > engine);
  assert.ok(mutualAidEta(400, 20, 1) < mutualAidEta(400, 12, 1.2));
});

test('shift challenges rotate and count distinct districts', () => {
  const first = pickChallenges(SHIFT_CHALLENGES, 1);
  const second = pickChallenges(SHIFT_CHALLENGES, 2);
  assert.equal(first.length, 3);
  assert.notDeepEqual(first.map(item => item.id), second.map(item => item.id));
  const challenge = SHIFT_CHALLENGES.find(item => item.metric === 'districts');
  const status = challengeProgress(challenge, { districts:['central','central','west','north'] });
  assert.equal(status.value, 3);
  assert.equal(status.complete, true);
  assert.equal(coverageGrade(85), 'Excellent');
});

test('Phase 4 save migrates, records calls and services apparatus', () => {
  const memory = new Map();
  const storage = { getItem:key => memory.get(key) || null, setItem:(key,value)=>memory.set(key,value) };
  const migrated = migratePhase4Save({ credits:-10, selectedApparatus:'engine-1', apparatus:{ 'engine-1':{ fuel:-20, water:9999, condition:{ body:-4 } } } });
  assert.equal(migrated.credits, 0);
  assert.equal(migrated.apparatus['engine-1'].fuel, 0);
  assert.equal(migrated.apparatus['engine-1'].water, 750);
  assert.equal(migrated.apparatus['engine-1'].condition.body, 0);

  const store = new Phase4SaveStore(storage);
  store.recordCall({ distance:1000, waterRemaining:500, condition:{ body:90, steering:95, engine:96, lights:98, pump:94 }, collisions:0, waterSupply:true, crewCommands:2, turnoutSeconds:20, district:'central', equipmentLeftBehind:0 });
  assert.equal(store.data.callsThisShift, 1);
  assert.equal(store.data.metrics.cleanCalls, 1);
  assert.equal(store.data.metrics.waterCalls, 1);
  assert.equal(store.data.metrics.fastTurnouts, 1);
  store.data.credits = 1000;
  const result = store.service('engine-1', 'full', APPARATUS_PROFILES[0]);
  assert.equal(result.ok, true);
  assert.equal(store.data.apparatus['engine-1'].water, 750);
  assert.equal(store.data.apparatus['engine-1'].condition.body, 100);
});
