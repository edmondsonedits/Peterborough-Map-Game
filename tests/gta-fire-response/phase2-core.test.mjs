import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityManager } from '../../gta-fire-response/src/entities.js';
import { defaultSave, migrateSave, SAVE_VERSION } from '../../gta-fire-response/src/save.js';
import { applyConditionDamage, buildWeightedCallPool, calculateCallScore } from '../../gta-fire-response/src/phase2-math.js';
import { CALLS } from '../../gta-fire-response/src/config.js';

test('entity manager enforces caps and returns entities to pools', () => {
  const manager = new EntityManager({ pedestrian: 2 });
  const a = manager.acquire('pedestrian', { state:'walking' });
  const b = manager.acquire('pedestrian', { state:'walking' });
  assert.ok(a && b);
  assert.equal(manager.acquire('pedestrian'), null);
  assert.equal(manager.count('pedestrian'), 2);
  manager.release(a);
  assert.equal(manager.count('pedestrian'), 1);
  const recycled = manager.acquire('pedestrian', { state:'yielding' });
  assert.equal(recycled.id, a.id);
  assert.equal(recycled.state, 'yielding');
});

test('save migration repairs malformed and old data', () => {
  const migrated = migrateSave({ version:1, shift:{ callsCompleted:'4', collisions:-3, responseTimes:['1000','bad'] }, achievements:['a','a',4] });
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.shift.callsCompleted, 4);
  assert.equal(migrated.shift.collisions, 0);
  assert.deepEqual(migrated.achievements, ['a']);
  assert.equal(defaultSave().shift.callsCompleted, 0);
});

test('damage is proportional and retains minimum recoverable systems', () => {
  let condition = { body:100, steering:100, engine:100, lights:100, pump:100 };
  for (let i=0;i<30;i+=1) condition = applyConditionDamage(condition, 15);
  assert.equal(condition.body, 0);
  assert.equal(condition.steering, 35);
  assert.equal(condition.engine, 40);
  assert.equal(condition.lights, 45);
  assert.equal(condition.pump, 45);
});

test('call weighting avoids immediate accidental repetition', () => {
  const history = [{ callId:CALLS[0].id }];
  const pool = buildWeightedCallPool(CALLS, history);
  assert.ok(pool.length > 0);
  assert.ok(pool.every(call => call.id !== CALLS[0].id));
});

test('score rewards safe, correctly equipped coordinated calls', () => {
  const strong = calculateCallScore({ positioned:true, correctEquipment:true, waterSupply:true, crewCommands:4, isFire:true });
  const poor = calculateCallScore({ collisions:3, roadHits:8, positioned:false, correctEquipment:false, damageDelta:20, isFire:true });
  assert.ok(strong.score > poor.score);
  assert.ok(['S','A'].includes(strong.rank));
  assert.ok(['C','B'].includes(poor.rank));
});
