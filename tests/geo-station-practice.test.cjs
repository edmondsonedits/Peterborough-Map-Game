'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../geo-guesser/station-practice.js'), 'utf8');
const prioritySource = fs.readFileSync(path.join(__dirname, '../shared/ems-priority.js'), 'utf8');
function api() { const context = vm.createContext({ Math, Number, Object, Array, setTimeout, clearTimeout }); context.window=context;vm.runInContext(prioritySource,context);vm.runInContext(source, context); return context.PTBO_STATION_PRACTICE; }
const targets = [
  {main:'Fire',name:'F1',lat:44.3,lng:-78.3,radius:25},
  {main:'Medical',name:'M1',lat:44.31,lng:-78.31,radius:20},
  {main:'Fire',name:'F2',lat:44.32,lng:-78.32,radius:30},
  {main:'Fire',name:'bad',lat:NaN,lng:-78.3,radius:30},
  {main:'Medical',name:'bad radius',lat:44.3,lng:-78.3,radius:0},
  {main:'Fire',name:'null coordinate',lat:null,lng:-78.3,radius:30}
];

test('practice target pools are shared across services and reject invalid coordinates or radii', () => {
  const practice = api();
  assert.deepEqual(Array.from(practice.serviceLocations(targets,'fire'), x => x.name), ['F1','M1','F2']);
  assert.deepEqual(Array.from(practice.serviceLocations(targets,'ems'), x => x.name), ['F1','M1','F2']);
  assert.equal(practice.serviceLocations([], 'fire').length, 0);
});

test('EMS-only care homes join every selected tier, retain their honest rank, and do not change Fire eligibility', async () => {
  const practice=api(),care={id:'moh-ltc-1',name:'Care home',lat:44.3,lng:-78.3,radius:65,recognitionDifficulty:'medium',facilityType:'long-term-care',trainingServices:['ems']};
  const ordinary={id:'ordinary',name:'Regular call',lat:44.31,lng:-78.31,radius:50,recognitionDifficulty:'easy'};
  assert.deepEqual(Array.from(practice.serviceLocations([ordinary,care],'fire','easy'),x=>x.id),['ordinary']);
  assert.deepEqual(Array.from(practice.serviceLocations([ordinary,care],'ems','easy'),x=>x.id),['ordinary','moh-ltc-1']);
  assert.deepEqual(Array.from(practice.serviceLocations([ordinary,care],'ems','medium'),x=>x.id),['moh-ltc-1']);
  assert.deepEqual(Array.from(practice.serviceLocations([ordinary,care],'ems','hard'),x=>x.id),['moh-ltc-1']);
  assert.equal(care.recognitionDifficulty,'medium','including a care home at every tier must not rewrite its sourced rank');
  const allTiers=Array.from(['easy','medium','hard'],tier=>practice.serviceLocations([ordinary,care],'ems',tier).map(x=>x.id));
  assert.deepEqual(allTiers,[['ordinary','moh-ltc-1'],['moh-ltc-1'],['moh-ltc-1']]);
  const ems=practice.createSession({locations:[ordinary,care],service:'ems',random:()=>0});
  assert.equal(ems.state.target.id,'moh-ltc-1','EMS practice begins with a care-home target when weighted draw favors care');
  assert.equal(ems.next(),true);
  await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal(ems.state.target.id,'ordinary','next target avoids an immediate care-home repeat when an ordinary candidate exists');
  const fire=practice.serviceLocations([ordinary,care],'fire','easy');
  assert.deepEqual(Array.from(fire,x=>x.id),['ordinary']);
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

test('correct guesses advance only on Next Call, and cancellation blocks further advancement', () => {
  const practice=api(),callbacks=[];
  const session=practice.createSession({locations:[targets[0],targets[2]],random:()=>0,onNext:t=>callbacks.push(t)});
  const first=session.state.target;
  assert.equal(session.guess(0,first.radius).correct,true);assert.equal(session.state.target,first);
  assert.equal(callbacks.length,0);assert.equal(session.next(),true);assert.equal(callbacks.length,1);
  session.cancel();assert.equal(session.next(),false);
});
test('Next skips an active or missed target without credit and ignores rapid duplicate activation', async () => {
  const session=api().createSession({locations:[targets[0],targets[2]],random:()=>0});
  const first=session.state.target;
  assert.equal(session.next(),true,'Next can skip before the first guess');
  const second=session.state.target;
  assert.notEqual(second,first);
  assert.deepEqual({completed:session.stats.completed,assisted:session.stats.assisted,misses:session.stats.misses},
    {completed:0,assisted:0,misses:0},'skipped targets are not scored as completed or assisted');
  assert.equal(session.next(),false,'a rapid duplicate does not skip the newly presented target');
  assert.equal(session.state.target,second);

  await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal(session.guess(second.radius+1,second.radius).correct,false);
  assert.equal(session.next(),true,'Next remains available after a miss');
  assert.notEqual(session.state.target,second);
  assert.deepEqual({completed:session.stats.completed,assisted:session.stats.assisted,misses:session.stats.misses},
    {completed:0,assisted:0,misses:1});
});
test('a successful retry counts once and waits for the next-call command',()=>{
  const session=api().createSession({locations:[targets[0],targets[2]],random:()=>0}),first=session.state.target;
  assert.equal(session.guess(first.radius+1,first.radius).correct,false);
  assert.equal(session.guess(first.radius,first.radius).firstTry,false);assert.equal(session.stats.completed,1);
  assert.equal(session.state.target,first);assert.equal(session.next(),true);assert.notEqual(session.state.target,first);
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
