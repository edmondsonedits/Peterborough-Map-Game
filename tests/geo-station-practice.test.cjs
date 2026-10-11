'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../geo-guesser/station-practice.js'), 'utf8');
function api() { const context = vm.createContext({ Math, Number, Object, Array, setTimeout, clearTimeout }); vm.runInContext(source, context); return context.PTBO_STATION_PRACTICE; }
const targets = [
  {main:'Fire',name:'F1',lat:44.3,lng:-78.3,radius:25},
  {main:'Medical',name:'M1',lat:44.31,lng:-78.31,radius:20},
  {main:'Fire',name:'F2',lat:44.32,lng:-78.32,radius:30},
  {main:'Fire',name:'bad',lat:NaN,lng:-78.3,radius:30},
  {main:'Medical',name:'bad radius',lat:44.3,lng:-78.3,radius:0},
  {main:'Fire',name:'null coordinate',lat:null,lng:-78.3,radius:30}
];

test('practice target pools are service-specific and reject invalid coordinates or radii', () => {
  const practice = api();
  assert.deepEqual(Array.from(practice.serviceLocations(targets,'fire'), x => x.name), ['F1','F2']);
  assert.deepEqual(Array.from(practice.serviceLocations(targets,'ems'), x => x.name), ['M1']);
  assert.equal(practice.serviceLocations([], 'fire').length, 0);
});

test('radius check uses raw metres at and just beyond the boundary; misses retain the target', () => {
  const practice = api(), session = practice.createSession({ locations:[targets[0]], random:() => 0 });
  const current = session.state.target;
  assert.equal(session.guess(25,25).correct, true);
  session.finish();
  const retry = practice.createSession({ locations:[targets[0]], random:() => 0 });
  assert.equal(retry.guess(25.0001,25).correct, false);
  assert.equal(retry.state.target, current);
  assert.equal(retry.stats.completed, 0);
});

test('a correct guess advances after a short delay and cancellation blocks stale callbacks', () => {
  const practice = api(), callbacks = [], timers = new Map(); let timerId = 0;
  const session = practice.createSession({ locations:[targets[0],targets[2]], random:() => 0,
    setTimeout:fn => { const id=++timerId;timers.set(id,fn);return id; }, clearTimeout:id => timers.delete(id),
    onNext:target => callbacks.push(target) });
  const first = session.state.target;
  const result = session.guess(0,first.radius);
  assert.equal(result.correct,true);
  assert.equal(session.stats.completed,1);
  assert.equal(session.stats.firstTry,1);
  assert.equal(session.state.target,first);
  const stale = [...timers.values()][0];
  session.cancel();
  stale();
  assert.equal(callbacks.length,0);
  assert.equal(session.state.target,first);
});

test('a successful retry counts once and calls the reset hook only after the delay', () => {
  const practice=api(), callbacks=[], pending=[];
  const session=practice.createSession({locations:[targets[0],targets[2]],random:() => 0,
    setTimeout:fn => { pending.push(fn);return pending.length; },clearTimeout() {},
    onNext:(target,stats) => callbacks.push({target,stats}) });
  const first=session.state.target;
  assert.equal(session.guess(first.radius+1,first.radius).correct,false);
  const success=session.guess(first.radius,first.radius);
  assert.equal(success.firstTry,false);
  assert.equal(session.stats.completed,1);
  assert.equal(session.stats.firstTry,0);
  assert.equal(callbacks.length,0);
  pending[0]();
  assert.equal(callbacks.length,1);
  assert.notEqual(session.state.target,first);
  assert.equal(callbacks[0].stats.completed,1);
});

test('shuffled cycles avoid repeats at boundaries and reveal is counted as assisted', () => {
  const practice = api(), cycle=practice.shuffledCycle([targets[0],targets[2]],() => 0);
  const picks=Array.from({length:6},()=>cycle.next());
  for(let i=1;i<picks.length;i++) assert.notEqual(picks[i],picks[i-1]);
  const session=practice.createSession({locations:[targets[0],targets[2]],random:() => 0});
  assert.equal(session.reveal(),true);
  assert.deepEqual({completed:session.stats.completed,assisted:session.stats.assisted,firstTry:session.stats.firstTry},
    {completed:1,assisted:1,firstTry:0});
  assert.equal(session.guess(0,100).accepted,false);
  assert.equal(session.continueRevealed(),true);
  assert.equal(session.state.revealed,false);
});
