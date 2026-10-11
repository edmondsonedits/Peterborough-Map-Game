'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../shared/build-version.js'),'utf8');
const bridge=source.slice(source.indexOf('  function installGeoGuesserMapPolicy()'),source.indexOf('  let analyticsInstallPromise'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function harness(url='about:blank') {
  const listeners={},pending=[],nodes=new Map();
  const childDoc=URL=>({URL,readyState:'complete'});
  const frame={contentDocument:childDoc(url),contentWindow:{PTBO_GEO_MAP_PROVIDER:{readiness:()=>({ready:true})}},dataset:{},style:{},addEventListener(name,fn){listeners[name]=fn}};
  nodes.set('game-frame',frame);
  const context=vm.createContext({VERSION:'preview',location:{pathname:'/geo-guesser/mobile/'},
    document:{getElementById:id=>nodes.get(id),body:{appendChild(el){nodes.set(el.id,el)}},createElement:()=>({style:{},remove(){nodes.delete(this.id)}})},
    injectScript(doc){return new Promise((resolve,reject)=>pending.push({doc,resolve,reject}))},traceWarn(){} });
  context.window=context;vm.runInContext(bridge+';installGeoGuesserMapPolicy();',context);
  return {frame,pending,nodes,load:()=>listeners.load(),childDoc};
}

test('Geo wrapper waits for the game document rather than injecting into initial about:blank',async()=>{
  const h=harness();assert.equal(h.pending.length,0);
  h.frame.contentDocument=h.childDoc('http://localhost/geo-guesser/index.html');h.load();
  assert.equal(h.pending.length,1);h.pending[0].resolve();await flush();
  assert.equal(h.frame.dataset.ptboMapPolicyReady,'true');
});

test('duplicate readiness signals for one game document share one policy installation',async()=>{
  const h=harness('http://localhost/geo-guesser/index.html');h.load();
  assert.equal(h.pending.length,1);h.pending[0].resolve();await flush();
  assert.equal(h.frame.style.pointerEvents,'');
});

test('an old document failure cannot block a replacement game whose policy passed',async()=>{
  const h=harness('http://localhost/geo-guesser/index.html?old');
  h.frame.contentDocument=h.childDoc('http://localhost/geo-guesser/index.html?new');h.load();
  h.pending[1].resolve();await flush();
  h.pending[0].reject(new Error('Old document timed out'));await flush();
  assert.equal(h.frame.dataset.ptboMapPolicyReady,'true');
  assert.equal(h.frame.style.pointerEvents,'');
  assert.equal(h.nodes.has('ptbo-geo-map-policy-blocker'),false);
});
