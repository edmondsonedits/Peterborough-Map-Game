'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('../tools/location-report-tests/node_modules/jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

function setup(){
  const dom=new JSDOM('<!doctype html><html><head><title>City Explorer v1.6.169</title></head><body><span id="ptbo-build-badge"></span><div class="control-panel"><button id="play-mode">Play</button></div><div id="mode-hint"><strong>Loading Fire Station 1.</strong></div><div id="gameplay-road">Fire Station 1</div></body></html>');
  const location={href:'https://example.test/city-explorer/?station=1',search:'?station=1',assignCalls:[]};
  location.assign=url=>location.assignCalls.push(url);
  const browser=dom.window;
  const win={PTBO_BUILD:{version:'1.6.170'},location,URL,URLSearchParams,
    document:browser.document,MutationObserver:browser.MutationObserver,Event:browser.Event,
    addEventListener:browser.addEventListener.bind(browser),dispatchEvent:browser.dispatchEvent.bind(browser),
    setTimeout:browser.setTimeout.bind(browser),clearTimeout:browser.clearTimeout.bind(browser)};
  win.window=win;
  vm.runInNewContext(read('city-explorer/release.js'),win);
  return{dom,win,doc:win.document,location};
}

test('vehicle picker waits for readiness and restores the active truck after failed selection',async t=>{
  const h=setup();t.after(()=>h.dom.window.close());
  const select=h.doc.getElementById('station-select');
  assert.equal(select.getAttribute('aria-label'),'Vehicle');assert.deepEqual([...select.options].map(o=>o.value),['pump-1','pump-2','pump-3','aerial','medi']);
  assert.ok(select);assert.equal(select.disabled,true,'picker is not ready before gameplay API exists');
  assert.equal(h.location.assignCalls.length,0);

  let active='pump-1';let canSwitchStations=false;const load=deferred();let calls=0;
  h.win.__PTBO_GAMEPLAY__={
    state:()=>({activeVehicleId:active,canSwitchStations}),
    selectVehicle:number=>{calls++;return load.promise;},
  };
  h.win.dispatchEvent(new h.win.Event('ptbo:gameplay-ready'));
  assert.equal(select.disabled,true,'picker waits until original station assets are ready');
  canSwitchStations=true;
  h.win.dispatchEvent(new h.win.Event('ptbo:gameplay-ready'));
  assert.equal(select.disabled,false);
  select.value='pump-2';select.dispatchEvent(new h.win.Event('change'));
  assert.equal(select.disabled,true,'pending selection cannot start duplicate UI requests');
  assert.equal(select.getAttribute('aria-busy'),'true');
  assert.match(h.doc.getElementById('station-select-status').textContent,/loading vehicle/i);
  assert.equal(calls,1);
  assert.equal(h.location.assignCalls.length,0);

  load.reject(new Error('Station 2 assets unavailable'));
  await tick();await tick();
  assert.equal(select.value,'pump-1','failure mirrors actual active gameplay station');
  assert.equal(select.disabled,false);
  assert.equal(select.getAttribute('aria-busy'),'false');
  assert.match(h.doc.getElementById('station-select-status').textContent,/station 2 assets unavailable/i);
  assert.equal(h.location.href,'https://example.test/city-explorer/?station=1');
  assert.equal(h.location.assignCalls.length,0);
});

test('successful switch reflects gameplay state and remains on the same page',async t=>{
  const h=setup();t.after(()=>h.dom.window.close());
  let active='pump-1';const completion=deferred();
  h.win.__PTBO_GAMEPLAY__={state:()=>({activeVehicleId:active,canSwitchStations:true}),selectVehicle:()=>completion.promise};
  h.win.dispatchEvent(new h.win.Event('ptbo:gameplay-ready'));
  const select=h.doc.getElementById('station-select');select.value='pump-3';select.dispatchEvent(new h.win.Event('change'));
  active='pump-3';completion.resolve({ok:true});
  await tick();await tick();
  assert.equal(select.value,'pump-3');assert.equal(select.disabled,false);
  assert.equal(h.location.assignCalls.length,0);
  assert.equal(h.location.href,'https://example.test/city-explorer/?station=1');
});
