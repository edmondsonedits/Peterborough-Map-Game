import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationEngine } from '../../gta-fire-response/src/operation-engine.js';
import { OPERATION_TEMPLATES } from '../../gta-fire-response/src/phase3-data.js';
import { airStep, calculateEscalation, levelForXp, operationGrade, staminaStep } from '../../gta-fire-response/src/phase3-math.js';
import { ProgressionStore } from '../../gta-fire-response/src/progression.js';

test('operation dependencies unlock in order', () => {
  const engine = new OperationEngine(OPERATION_TEMPLATES.alarm, 0);
  assert.equal(engine.get('sizeup').status, 'locked');
  engine.complete('arrival', 'test', 1);
  assert.equal(engine.get('sizeup').status, 'available');
  assert.equal(engine.complete('meter', 'test', 2), false);
  engine.complete('sizeup', 'test', 2);
  engine.advance('investigate', 100, 'test', 3);
  assert.equal(engine.get('meter').status, 'available');
});

test('essential completion ignores optional water objective', () => {
  const engine = new OperationEngine(OPERATION_TEMPLATES['structure-fire']);
  for (const id of ['arrival','sizeup','command','attack','search','overhaul','accountability']) engine.complete(id, 'test');
  assert.equal(engine.get('water').status, 'available');
  assert.equal(engine.essentialComplete(), true);
});

test('risk rises with delay and falls with mitigation', () => {
  const early = calculateEscalation({ elapsedSeconds:30, baseRisk:30 });
  const late = calculateEscalation({ elapsedSeconds:180, baseRisk:30 });
  const mitigated = calculateEscalation({ elapsedSeconds:180, baseRisk:30, completedRatio:.8, supportOnScene:2, waterSupply:true });
  assert.ok(late > early);
  assert.ok(mitigated < late);
});

test('stamina and air consume and recover predictably', () => {
  assert.ok(staminaStep(80, { running:true, moving:true }, 1) < 80);
  assert.ok(staminaStep(80, { resting:true }, 1) > 80);
  assert.equal(airStep(50, { maskOn:false, nearHazard:true, working:true }, 10), 50);
  assert.ok(airStep(50, { maskOn:true, nearHazard:true, working:true }, 10) < 50);
});

test('operation grade rewards completion and safety', () => {
  const clean = operationGrade({ completionRatio:1, elapsedSeconds:100, collisions:0, escalations:0, optionalCompleted:1 });
  const rough = operationGrade({ completionRatio:.7, elapsedSeconds:280, collisions:3, escalations:2 });
  assert.ok(clean.score > rough.score);
  assert.ok(['S','A'].includes(clean.rank));
});

test('progression levels and unlocks persist', () => {
  const memory = new Map();
  const storage = { getItem:key => memory.get(key) || null, setItem:(key,value)=>memory.set(key,value) };
  const store = new ProgressionStore(storage);
  for (let i=0;i<5;i++) store.record({ score:950, rank:'S', noCollision:true, completionRatio:1 });
  assert.ok(store.data.level >= 3);
  assert.ok(store.data.unlocks.includes('rescue-saw'));
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(900), 3);
});
