import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTY_PRESETS, FINAL_CALLS, INCIDENT_VARIANTS, MEDALS } from '../../gta-fire-response/src/phase5-data.js';
import { adaptiveScale, debriefBreakdown, effectiveRisk, medalProgress, performanceTier, perkTaskRate, pickVariant, serviceRecordSummary, weightedCall } from '../../gta-fire-response/src/phase5-math.js';
import { Phase5SaveStore, migratePhase5Save } from '../../gta-fire-response/src/phase5-save.js';

test('final incident roster is broad and valid', () => {
  assert.equal(FINAL_CALLS.length, 15);
  assert.equal(new Set(FINAL_CALLS.map(call => call.id)).size, FINAL_CALLS.length);
  assert.deepEqual([...new Set(FINAL_CALLS.map(call => call.type))].sort(), ['alarm','medical','mvc','rescue','structure-fire','vehicle-fire']);
  for (const call of FINAL_CALLS) {
    assert.ok(Number.isFinite(call.lat) && Number.isFinite(call.lng));
    assert.ok(call.title && call.address && call.task);
  }
});

test('incident variants and difficulty alter real risk', () => {
  const call = FINAL_CALLS.find(item => item.type === 'structure-fire');
  const variant = pickVariant(call, INCIDENT_VARIANTS, () => .7);
  assert.ok(variant);
  const story = DIFFICULTY_PRESETS.find(item => item.id === 'story');
  const veteran = DIFFICULTY_PRESETS.find(item => item.id === 'veteran');
  assert.ok(effectiveRisk(38, variant.risk, veteran.risk) > effectiveRisk(38, variant.risk, story.risk));
});

test('career perks accelerate the correct tactical tasks', () => {
  const base = perkTaskRate(1, { unlocks:[], objectiveId:'search', callType:'structure-fire', apparatusId:'engine-1' });
  const thermal = perkTaskRate(1, { unlocks:['thermal-camera'], objectiveId:'search', callType:'structure-fire', apparatusId:'engine-1' });
  const rescue = perkTaskRate(1, { unlocks:['rescue-saw'], objectiveId:'access', callType:'mvc', apparatusId:'rescue-3' });
  assert.equal(base, 1);
  assert.ok(thermal > base);
  assert.ok(rescue > thermal);
});

test('after-action breakdown rewards safety and completion', () => {
  const strong = debriefBreakdown({ tacticalScore:420, responseSeconds:45, collisions:0, escalations:0, completionRatio:1, waterSupply:true, support:2, equipmentLeft:0, difficulty:1.2, variant:1.1 });
  const weak = debriefBreakdown({ tacticalScore:220, responseSeconds:180, collisions:3, escalations:3, completionRatio:.65, waterSupply:false, support:0, equipmentLeft:3, difficulty:1, variant:1 });
  assert.ok(strong.total > weak.total);
  assert.ok(strong.safety > weak.safety);
  assert.ok(strong.completion > weak.completion);
});

test('adaptive performance tier protects low frame-rate devices', () => {
  assert.equal(performanceTier(22, 'high'), 'low');
  assert.equal(performanceTier(35, 'high'), 'medium');
  assert.equal(performanceTier(56, 'medium'), 'high');
  assert.ok(adaptiveScale('low') < adaptiveScale('medium'));
  assert.ok(adaptiveScale('medium') < adaptiveScale('high'));
});

test('weighted call selection avoids the immediate repeat', () => {
  const selected = weightedCall(FINAL_CALLS.slice(0,3), { lastId:FINAL_CALLS[0].id, districtReputation:{}, random:() => 0 });
  assert.notEqual(selected.id, FINAL_CALLS[0].id);
});

test('medal progress counts distinct arrays', () => {
  const medal = MEDALS.find(item => item.metric === 'types');
  const progress = medalProgress(medal, { types:['medical','medical','mvc','alarm','rescue','structure-fire','vehicle-fire'] });
  assert.equal(progress.value, 6);
  assert.equal(progress.complete, true);
});

test('Phase 5 save migrates, records, awards medals and round-trips backups', () => {
  const memory = new Map();
  const storage = { getItem:key => memory.get(key) || null, setItem:(key,value)=>memory.set(key,value) };
  const migrated = migratePhase5Save({ difficulty:'invalid', completedCalls:-3, records:[{ score:-4, collisions:-2 }] });
  assert.equal(migrated.difficulty, 'standard');
  assert.equal(migrated.completedCalls, 0);
  assert.equal(migrated.records[0].score, 0);
  assert.equal(migrated.records[0].collisions, 0);

  const store = new Phase5SaveStore(storage);
  const result = store.record({ callId:'test-call', title:'Test Call', type:'medical', district:'central', station:'station-1', apparatus:'engine-1', rank:'S', score:1000, responseSeconds:40, collisions:0, escalations:0, completedAt:1 });
  assert.equal(store.data.completedCalls, 1);
  assert.ok(result.unlocked.some(medal => medal.id === 'first-call'));
  const bundle = store.exportBundle({ phase4:{ credits:500 } });
  const second = new Phase5SaveStore({ getItem:()=>null, setItem:()=>{} });
  const imported = second.importBundle(bundle);
  assert.equal(imported.ok, true);
  assert.equal(second.data.completedCalls, 1);
  const summary = serviceRecordSummary(second.data.records);
  assert.equal(summary.completed, 1);
  assert.equal(summary.cleanRate, 100);
});
