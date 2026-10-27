import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {mountFeedback} from '../feedback/ui.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('../tools/location-report-tests/node_modules/jsdom');
const snapshot=()=>({resultId:'result-1',callId:'school-1',city:'peterborough',service:'fire',mode:'geo',version:'1.6.134',datasetId:'peterborough:geo-locations',datasetRevision:null,question:{name:'School',address:'1175 Brealey Dr',crossStreets:null,difficulty:'easy'},originalCircle:{center:{lat:44.2865,lng:-78.3796},radiusMeters:60},guess:null,distanceMeters:null,result:'revealed',baseId:null});
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup({fresh=false}={}){
 const dom=new JSDOM('<header class="site-header"></header><button id="location-report-button" hidden>Report a problem</button>',{url:'https://game.example.test/geo-guesser/'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.location=dom.window.location;globalThis.sessionStorage=dom.window.sessionStorage;globalThis.Event=dom.window.Event;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let current=fresh?null:{uid:'alice',isDeveloper:false,isGuest:true},listener,id=0,fail=true;const submissions=[];
 const service={ready:Promise.resolve(),get account(){return current;},id:()=>`id-${++id}`,subscribeAccount(fn){listener=fn;fn(current);},ensureGuest:async()=>{if(!current){current={uid:'alice',isDeveloper:false,isGuest:true};listener(current);}return current;},watchThreads(fn){fn({rows:[],more:false,cursor:null});return()=>{};},sendLocationReport:async args=>{submissions.push(args);if(fail)throw Error('Offline');},switchUser(uid){current={uid,isDeveloper:false,isGuest:true};listener(current);},receive(){fail=false;}};
 const api=mountFeedback({config:{enabled:true},service,rootUrl:new URL('https://game.example.test/'),reportMapLoader:async()=>{throw new Error('Map unavailable in this fixture');}});
 const set=(name,value)=>{const el=document.querySelector(`[name="${name}"]`);assert.ok(el,name);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));el.dispatchEvent(new window.Event('change',{bubbles:true}));};
 const submit=()=>document.querySelector('.fb-report-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 return{dom,api,service,submissions,set,submit};
}
test('retry uses one immutable report and ID pair; editing the correction creates a fresh submission',async()=>{
 const g=setup();assert.equal(typeof g.api.openLocationReport,'function','feedback must offer the structured report entry point');
 await g.api.openLocationReport(snapshot());g.set('correct-circle',true);g.set('radius','100');g.submit();await tick();g.submit();await tick();
 assert.equal(g.submissions.length,2);assert.equal(g.submissions[0].threadId,g.submissions[1].threadId);assert.equal(g.submissions[0].messageId,g.submissions[1].messageId);
 assert.match(g.submissions[0].note,/Browser:/,'the first message must include bounded automatic diagnostic context');
 g.set('radius','125');g.submit();await tick();
 assert.notEqual(g.submissions[1].threadId,g.submissions[2].threadId);assert.notEqual(g.submissions[1].messageId,g.submissions[2].messageId);
 assert.equal(g.submissions[2].report.suggestion.radiusMeters,125);assert.equal(g.submissions[0].report.suggestion.radiusMeters,100);
 g.service.receive();g.submit();await tick();assert.match(document.querySelector('.fb-body').textContent,/Report received/);
 g.api.close();g.dom.window.close();
});
test('close and reopen preserves a result draft, while switching identity clears its private note',async()=>{
 const g=setup();assert.equal(typeof g.api.openLocationReport,'function');
 await g.api.openLocationReport(snapshot());g.set('note','Alice private note');g.set('correct-circle',true);g.set('radius','120');g.api.close();
 await g.api.openLocationReport(snapshot());assert.equal(document.querySelector('[name="note"]').value,'Alice private note');assert.equal(document.querySelector('[name="radius"]').value,'120');
 g.service.switchUser('bob');await g.api.openLocationReport(snapshot());assert.equal(document.querySelector('[name="note"]').value,'');assert.equal(document.querySelector('[name="radius"]').value,'60');
 g.api.close();g.dom.window.close();
});
test('a Geo result from an iframe realm opens the parent report composer',async()=>{
 const g=setup();const foreign=runInNewContext('JSON.parse(data)',{data:JSON.stringify(snapshot())});
 await g.api.openLocationReport(foreign);
 assert.ok(document.querySelector('.fb-report-form'),'same-origin iframe snapshots must cross the parent boundary as copied data');
 g.api.close();g.dom.window.close();
});
test('typing a circle value is preserved even when the form closes before a change event',async()=>{
 const g=setup();await g.api.openLocationReport(snapshot());g.set('correct-circle',true);
 const input=document.querySelector('[name="radius"]');input.value='125';input.dispatchEvent(new window.Event('input',{bubbles:true}));
 g.api.close();await g.api.openLocationReport(snapshot());
 assert.equal(document.querySelector('[name="radius"]').value,'125');
 g.api.close();g.dom.window.close();
});
test('a first-time guest receives confirmation after their first report is acknowledged',async()=>{
 const g=setup({fresh:true});g.service.receive();await g.api.openLocationReport(snapshot());
 assert.ok(document.querySelector('.fb-report-form'));g.submit();await tick();
 assert.equal(g.submissions.length,1);assert.match(document.querySelector('.fb-body').textContent,/Report received/);
 g.api.close();g.dom.window.close();
});
test('a stale inbox-opening failure cannot replace a newer location report',async()=>{
 const g=setup(),ensureGuest=g.service.ensureGuest;let rejectOld;
 g.service.ensureGuest=()=>new Promise((resolve,reject)=>{rejectOld=reject;});
 const oldOpen=g.api.open();g.service.ensureGuest=ensureGuest;
 await g.api.openLocationReport(snapshot());rejectOld(new Error('Old inbox connection failed'));await oldOpen;
 assert.ok(document.querySelector('.fb-report-form'),'the current report must survive an earlier failed request');
 g.api.close();g.dom.window.close();
});
