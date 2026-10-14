'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../route-mapping/startup-loader.js'),api=fs.existsSync(file)?require(file):null;
function loader(options){assert.ok(api,'bounded route startup loader is available');return api.createStartupLoader({timeoutMs:15,...options});}
const pending=()=>new Promise(()=>{});
test('a never resolving road fetch reaches recovery and aborts its own request',async()=>{
 let signal;const load=loader({readCalls:()=>[1],fetch:(_url,options)=>{signal=options.signal;return pending();}});
 await assert.rejects(load.load('roads'),/taking longer|timed out/i);assert.equal(signal.aborted,true);
});
test('dispatch readiness and JSON body parsing share the bounded startup deadline',async()=>{
 const slowCalls=loader({readCalls:pending,fetch:()=>{throw Error('must not fetch yet');}});
 await assert.rejects(slowCalls.load('roads'),/taking longer|timed out/i);
 let signal;const slowBody=loader({readCalls:()=>[1],fetch:(_url,options)=>{signal=options.signal;return{ok:true,json:pending};}});
 await assert.rejects(slowBody.load('roads'),/taking longer|timed out/i);assert.equal(signal.aborted,true);
});
test('retry supersedes the old attempt and cannot publish a late response',async()=>{
 let resolveOld,oldSignal,attempt=0;const load=loader({timeoutMs:1000,readCalls:()=>[1],fetch:(_url,options)=>{attempt++;if(attempt===1){oldSignal=options.signal;return new Promise(resolve=>{resolveOld=resolve;});}return{ok:true,json:async()=>({new:true})};}});
 const old=load.load('roads'),oldRejected=assert.rejects(old,/superseded|cancelled/i);
 await new Promise(resolve=>setImmediate(resolve));
 const latest=await load.load('roads');assert.deepEqual(latest,{calls:[1],geojson:{new:true}});assert.equal(oldSignal.aborted,true);
 resolveOld({ok:true,json:async()=>({old:true})});await oldRejected;
});
test('HTTP failure is recoverable on the next load without reloading the page',async()=>{
 let attempt=0;const load=loader({readCalls:()=>[1],fetch:async()=>++attempt===1?{ok:false,status:503}:{ok:true,json:async()=>({features:[]})}});
 await assert.rejects(load.load('roads'),/503/);assert.deepEqual((await load.load('roads')).geojson,{features:[]});
});
test('startup failure exposes a focused retry state and retry owns a fresh deadline',async()=>{
 const vm=require('node:vm'),elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,style:{},dataset:{},listeners:{},setAttribute(k,v){this[k]=v;},addEventListener(k,v){this.listeners[k]=v;},focus(){this.focused=true;}});return elements.get(id);};
 const c=vm.createContext({window:{addEventListener(){}},document:{getElementById:element,addEventListener(){}},console:{error(){},info(){}},Promise});
 const source=fs.readFileSync(path.resolve(__dirname,'../route-mapping/app.js'),'utf8');
 vm.runInContext(source.replace('  initialize();','  globalThis.testApi={state,bindUi,startTraining:typeof startTraining==="function"?startTraining:null};'),c);
 const app=c.testApi;assert.equal(typeof app.startTraining,'function','startup can recover in the same page');
 let attempts=0;app.state.startupLoader=loader({readCalls:()=>[1],fetch:async()=>{attempts++;return{ok:false,status:attempts===1?503:502};}});
 await app.startTraining();assert.equal(element('loading-error').hidden,false);assert.equal(element('retry-button').focused,true);assert.equal(element('route-app')['aria-busy'],'false');
 app.bindUi();const retry=element('retry-button').listeners.click();assert.equal(element('route-app')['aria-busy'],'true');assert.equal(element('loading-error').hidden,true);
 await retry;assert.equal(attempts,2);assert.match(element('loading-error-message').textContent,/502/);assert.equal(element('loading-error').hidden,false);
});
