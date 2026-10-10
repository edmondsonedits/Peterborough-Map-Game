'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function context(storage={}){
 const source=fs.readFileSync(path.resolve(__dirname,'../route-mapping/app.js'),'utf8').replace('  initialize();',`  globalThis.routeTuningApi={state,CONFIG,normalizeTuning,loadTuning,saveTuning,traceTolerance,traceOptions,arrivalDistance,weightedCallChoice,applySettings};`);
 const values=new Map(Object.entries(storage));
 const c=vm.createContext({document:{getElementById:()=>null,body:{classList:{toggle(){}}}},window:{},L:{point:(x,y)=>({x,y})},localStorage:{getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,value)},console,Math,Float64Array,Int32Array,Map,Set,Array,Number,String,Object,Boolean,JSON,Promise,requestAnimationFrame:fn=>fn()});
 vm.runInContext(source,c);return {api:c.routeTuningApi,values,c};
}

test('tuning normalization clamps finite values and falls back for corrupt or missing fields',()=>{
 const {api}=context();
 assert.deepEqual({...api.normalizeTuning({streetForgiveness:99,straightPreference:NaN,arrivalDistance:5,challengeFrequency:72})},{streetForgiveness:24,straightPreference:35,arrivalDistance:10,challengeFrequency:72});
});

test('tuning persistence recovers from denied and corrupt localStorage',()=>{
 const saved=context();saved.api.saveTuning({streetForgiveness:18,straightPreference:61,arrivalDistance:32,challengeFrequency:67});
 assert.deepEqual(JSON.parse(saved.values.get('ptboRouteMappingTuningV1')),{streetForgiveness:18,straightPreference:61,arrivalDistance:32,challengeFrequency:67});
 const corrupt=context({ptboRouteMappingTuningV1:'{broken'});
 assert.deepEqual({...corrupt.api.loadTuning()},{streetForgiveness:12,straightPreference:35,arrivalDistance:40,challengeFrequency:80});
 const blocked=context();blocked.c.localStorage={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};
 assert.deepEqual({...blocked.api.loadTuning()},{streetForgiveness:12,straightPreference:35,arrivalDistance:40,challengeFrequency:80});
 assert.doesNotThrow(()=>blocked.api.saveTuning({streetForgiveness:18,straightPreference:50,arrivalDistance:35,challengeFrequency:65}));
});

test('street forgiveness sets a zoom-aware map tolerance and trace direction bias',()=>{
 const {api}=context();api.state.tuning={streetForgiveness:18,straightPreference:60,arrivalDistance:40,challengeFrequency:80};
 api.state.map={containerPointToLatLng:p=>({lat:p.x/110540,lng:0})};
 const zoomed=api.traceTolerance();
 api.state.map={containerPointToLatLng:p=>({lat:p.x*2/110540,lng:0})};
 assert.ok(api.traceTolerance()>zoomed);
 assert.equal(api.traceOptions().tolerance,api.traceTolerance());assert.equal(api.traceOptions().directionBias,.6);
 api.state.map=null;assert.equal(api.traceTolerance(),43.2);
});

test('arrival distance and same-service settings apply without replacing the current call',()=>{
 const {api}=context();api.state.service='fire';api.state.call={id:'current'};api.state.tuning={streetForgiveness:12,straightPreference:35,arrivalDistance:40,challengeFrequency:80};
 assert.equal(api.arrivalDistance(),40);assert.equal(api.applySettings('fire',{streetForgiveness:20,straightPreference:50,arrivalDistance:55,challengeFrequency:70}),false);
 assert.equal(api.state.call.id,'current');assert.equal(api.arrivalDistance(),55);assert.equal(api.state.tuning.streetForgiveness,20);
});

test('challenge mix follows the selected frequency',()=>{
 const {api}=context();api.state.tuning={streetForgiveness:12,straightPreference:35,arrivalDistance:40,challengeFrequency:50};api.state.skillProfile={plays:0,rating:28,highStreak:0};
 const calls=[{id:'challenge',difficulty:28,decisionAnalysis:{traps:[{}]}},{id:'refresher',difficulty:28}];
 const oldRandom=Math.random;
 try{Math.random=()=>.49;assert.equal(api.weightedCallChoice(calls,28).id,'challenge');Math.random=()=>.51;assert.equal(api.weightedCallChoice(calls,28).id,'refresher');}
 finally{Math.random=oldRandom;}
});

test('settings expose labeled bounded sliders and usable apply/reset actions',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../route-mapping/index.html'),'utf8');
 for(const id of ['street-forgiveness','straight-preference','arrival-distance','challenge-frequency'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/Apply settings/);assert.match(html,/Reset defaults/);
});
