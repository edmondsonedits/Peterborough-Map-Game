'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {appendVerified}=require('../tools/topup-response-calls.cjs');
function fixture(){const c={id:'site',cityId:'city',name:'Site',addr:'1 Road',lat:1,lng:2,locationKind:'sourced-address',geographicVerificationRef:'proof',sources:['https://example.test'],incidentProfiles:{ems:{sub:'Medical Assistance'}}};const old={id:'old',addr:'2 Road',routeBaseId:'hall',trainingServices:['ems'],responseAssignment:{role:'first-due'}};const calls=[old,...Array.from({length:5},(_,i)=>({id:'old'+i,addr:(i+3)+' Road',routeBaseId:'hall',trainingServices:['ems'],responseAssignment:{role:'first-due'}}))];return{training:{id:'city',sharedLocations:[c],routeCalls:calls,routeResponses:{bases:[{baseId:'hall',service:'ems',callIds:calls.map(x=>x.id),challengeCalls:0,maxRouteMetres:3000}]}},c,old};}
const exercise=(c)=>({...c,id:'route-civic-4-hall-site',canonicalCallId:'site',routeBaseId:'hall',trainingServices:['ems'],main:'Medical',sub:'Medical Assistance',incidentProfiles:{ems:{sub:'Medical Assistance'}},responseAssignment:{generator:'civic-v1',role:'first-due',primaryBaseId:'hall'},routeQuality:{routeMetres:1000,meaningfulDecisions:1},routeDifficulty:30});
test('verified top-up appends without changing prior calls and is idempotent',()=>{
 const {training,c,old}=fixture(),original=structuredClone(old),call=exercise(c);
 assert.equal(appendVerified(training,c,call),true);assert.deepEqual(training.routeCalls[0],original);
 assert.equal(appendVerified(training,c,call),false);assert.equal(training.routeCalls.length,7);
});
test('top-up rejects duplicate address and reuse of an EMS canonical identity',()=>{
 const {training,c}=fixture();training.routeCalls[0].addr=c.addr;
 assert.throws(()=>appendVerified(training,c,exercise(c)),/address/);
 training.routeCalls[0].addr='2 Road';training.routeCalls[0].canonicalCallId='site';
 assert.throws(()=>appendVerified(training,c,exercise(c)),/canonical/);
});
test('top-up rejects mismatched service, primary, and source point',()=>{
 const {training,c}=fixture(),call=exercise(c);
 assert.throws(()=>appendVerified(training,c,{...call,lat:3}),/canonical/);
 assert.throws(()=>appendVerified(training,c,{...call,responseAssignment:{...call.responseAssignment,primaryBaseId:'other'}}),/assignment/);
 assert.throws(()=>appendVerified(training,c,{...call,trainingServices:['fire']}),/service/);
});
test('first-due top-ups require finite ownership within tolerance',()=>{
 const {isFirstDue}=require('../tools/topup-response-calls.cjs');
 assert.equal(isFirstDue(100,86,15),true);
 assert.equal(isFirstDue(102,86,15),false);
 assert.equal(isFirstDue(Infinity,86,15),false);
});
test('top-ups cannot displace the six civic calls or expand a full pool',()=>{
 const {training,c}=fixture();training.routeCalls[0].responseAssignment.role='support';
 assert.throws(()=>appendVerified(training,c,exercise(c)),/six existing/);
 training.routeCalls[0].responseAssignment.role='first-due';
 for(let i=0;i<6;i++){let old={id:'extra'+i,addr:'extra '+i,trainingServices:['ems']};training.routeCalls.push(old);training.routeResponses.bases[0].callIds.push(old.id);}
 assert.throws(()=>appendVerified(training,c,exercise(c)),/shortfall/);
});
