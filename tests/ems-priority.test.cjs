'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
function api() {
  const context = vm.createContext({ Math, Object, Array, Number });
  context.window = context;
  vm.runInContext(source('shared/ems-priority.js'), context);
  return context.PTBO_EMS_PRIORITY;
}

test('EMS group choice favors eligible care homes while preserving service limits and non-repeat', () => {
  const priority = api();
  const calls = [
    {id:'ordinary-a'},
    {id:'care-a', facilityType:'long-term-care'},
    {id:'care-b', facilityType:'long-term-care'},
    {id:'ems-only', trainingServices:['ems']},
  ];
  assert.deepEqual(Array.from(priority.chooseGroup(calls, {service:'ems', random:()=>0.69})), calls.filter(c=>c.facilityType==='long-term-care'));
  assert.deepEqual(Array.from(priority.chooseGroup(calls, {service:'ems', random:()=>0.7})), calls.filter(c=>!c.facilityType||c.id==='ems-only'));
  assert.deepEqual(Array.from(priority.chooseGroup(calls, {service:'fire', random:()=>0})), calls.filter(c=>c.id!=='ems-only'));
  assert.deepEqual(Array.from(priority.chooseGroup(calls, {service:'ems', random:()=>0,lastId:'care-a'})), calls.filter(c=>c.id==='care-b'));
  assert.deepEqual(Array.from(priority.chooseGroup([{id:'last',facilityType:'long-term-care'}], {service:'ems', random:()=>0,lastId:'last'})), [{id:'last',facilityType:'long-term-care'}]);
});

test('weighted EMS picks approach 70 percent care homes without immediate repeats', () => {
  const priority = api();
  const calls = [
    {id:'ordinary-a'}, {id:'ordinary-b'}, {id:'ordinary-c'},
    {id:'care-a',facilityType:'long-term-care'}, {id:'care-b',facilityType:'long-term-care'},
  ];
  let state = 87321;
  const random = () => ((state = (state * 48271) % 2147483647) - 1) / 2147483646;
  let previous = null, careCount = 0;
  for (let i=0;i<10000;i++) {
    const selected = priority.pick(calls, {service:'ems',random,lastId:previous});
    assert.ok(selected);
    assert.notEqual(selected.id, previous);
    if (selected.facilityType==='long-term-care') careCount++;
    previous = selected.id;
  }
  const careRate = careCount / 10000;
  assert.ok(careRate > 0.68 && careRate < 0.72, `expected about 70 percent care-home calls, got ${careRate}`);
});
