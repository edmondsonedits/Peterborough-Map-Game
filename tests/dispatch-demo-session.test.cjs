'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.join(__dirname, '../response-simulator/dispatch-demo-session.js');
const {createSession} = fs.existsSync(modulePath) ? require(modulePath) : {};

const cityId = 'richmond-hill';
const selection = {cityId, service:'fire', baseId:'fire-1'};
const calls = ['a','b','c','d','e'].map(id => ({id, cityId, trainingServices:['fire']}));
const training = {id:cityId, dispatchDemo:{schemaVersion:1, callLimit:5, bases:[{baseId:'fire-1',service:'fire',callIds:['a','b','c','d','e']} ]}};
const mission = (generation, callId = 'a', extra = {}) => ({...selection, generation, callId, ...extra});

test('only five completed assignments are admitted, with no sixth start', () => {
  assert.equal(typeof createSession, 'function', 'the shared simulator needs a demo session controller');
  const session = createSession({cityId, callLimit:5});
  for (let generation=1; generation<=5; generation++) {
    assert.equal(session.start(mission(generation, calls[generation-1].id)), true);
    assert.equal(session.state.completed, generation-1, 'dispatching is not completing');
    assert.equal(session.complete({cityId,generation}), true);
  }
  assert.equal(session.state.completed, 5);
  assert.equal(session.state.finished, true);
  assert.equal(session.canStart(), false);
  assert.equal(session.start(mission(6,'extra')), false);
});

test('duplicate, foreign-city, aborted and stale completions never consume a call', () => {
  const session = createSession({cityId, callLimit:5});
  session.start(mission(1));
  assert.equal(session.complete({cityId:'peterborough',generation:1}), false);
  session.cancel();
  assert.equal(session.complete({cityId,generation:1}), false);
  session.start(mission(2));
  assert.equal(session.complete({cityId,generation:1}), false);
  assert.equal(session.complete({cityId,generation:2}), true);
  assert.equal(session.complete({cityId,generation:2}), false);
  assert.equal(session.start(mission(2,'b')), false, 'one generation cannot be re-awarded');
  assert.equal(session.state.completed, 1);
});

test('service and base changes retain progress while replay starts a fresh session', () => {
  const session = createSession({cityId, callLimit:5});
  session.start(mission(1)); session.complete({cityId,generation:1});
  session.start(mission(2,'b')); session.cancel();
  session.start(mission(3,'ems-a',{baseId:'ems-2',service:'ems'}));
  session.complete({cityId,generation:3});
  assert.equal(session.state.completed, 2);
  session.reset();
  assert.equal(session.state.completed, 0);
  assert.equal(session.complete({cityId,generation:3}), false);
  assert.equal(session.start(mission(4)), true);
});

test('per-base call pools reject missing, duplicate, wrong-city and unsupported data', () => {
  const session = createSession({cityId, callLimit:5});
  assert.deepEqual(session.candidates(training,calls,selection).map(call=>call.id), ['a','b','c','d','e']);
  assert.throws(()=>session.candidates({...training,id:'peterborough'},calls,selection));
  assert.throws(()=>session.candidates(training,calls.slice(1),selection));
  assert.throws(()=>session.candidates(training,calls,{...selection,baseId:'unknown'}));
  assert.throws(()=>session.candidates({...training,dispatchDemo:{...training.dispatchDemo,bases:[{...training.dispatchDemo.bases[0],callIds:['a','a','b','c','d']}]}},calls,selection));
  assert.throws(()=>createSession({cityId,callLimit:50}));
});

test('completed calls disappear from the selected pool; aborted calls remain available', () => {
  const session = createSession({cityId, callLimit:5});
  session.start(mission(1)); session.cancel();
  assert.equal(session.candidates(training,calls,selection).length, 5);
  session.start(mission(2)); session.complete({cityId,generation:2});
  assert.deepEqual(session.candidates(training,calls,selection).map(call=>call.id), ['b','c','d','e']);
  assert.equal(session.start(mission(3,'a')), false);
  assert.equal(session.candidates(training,calls,selection,{includeCompleted:true}).length, 5);
  session.reset();
  assert.equal(session.candidates(training,calls,selection).length, 5);
});
