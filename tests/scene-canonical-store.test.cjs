'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),json=p=>JSON.parse(read(p));
for(const city of ['oshawa','belleville','scarborough'])test(`${city} scene startup awaits canonical Geo source and preserves the shared edited snapshot`,async()=>{
 const geo=json(`cities/${city}/geo-data.json`),training=json(`cities/${city}/training-data.json`),seed=geo.locations.length>=2?geo.locations:training.sharedLocations;
 const edited={...seed[0],name:'Saved user edit'},deleted=seed[1].id,version=geo.dispatchDataVersion||'ontario-geo-1';
 const snapshot={version:3,cityId:city,dataVersion:version,trainingSharedLocationIds:training.sharedLocations.map(x=>x.id),trainingCareHomeIds:[],items:[edited]};
 const values=new Map([[`ptboSharedDispatchLocationsV3:${city}`,JSON.stringify(snapshot)]]);let release,requested=[];
 const gate=new Promise(resolve=>{release=resolve});
 const c=vm.createContext({URL,URLSearchParams,AbortController,setTimeout,clearTimeout,console,CustomEvent:class{},location:{href:`https://example.test/response-simulator/play/?city=${city}`},
  fetch:async url=>{requested.push(String(url));if(String(url).includes('/geo-data.json')){await gate;return{ok:true,json:async()=>geo}}if(String(url).includes('/training-data.json'))return{ok:true,json:async()=>training};throw Error('Unexpected fetch '+url)},
  localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},dispatchEvent(){},addEventListener(){},
  document:{currentScript:{src:'https://example.test/cities/preview-package-factory.js'},readyState:'complete',documentElement:{dataset:{}},createElement:()=>({dataset:{},setAttribute(){}}),head:{appendChild(node){if(node.src)throw Error('Unexpected descriptor injection: '+node.src)}}}});
 c.window=c;vm.runInContext(read('cities/preview-package-factory.js'),c);
 vm.runInContext(read('shared/ems-priority.js'),c);c.document.currentScript.src=`https://example.test/shared/dispatch-locations.js?city=${city}`;vm.runInContext(read('shared/dispatch-locations.js'),c);
 c.PTBO_PREVIEW_CITY_FACTORY.create({id:city,name:geo.name,sourceUrl:new URL(`https://example.test/cities/${city}/package.js`),map:geo.map,sources:{fire:{},ems:{}},sceneResponseDrills:true});
 release();await c.PTBO_DISPATCH_STORE.ready();const rows=c.PTBO_DISPATCH_STORE.getAll();
 assert.equal(c.PTBO_DISPATCH_STORE.dataVersion,version);assert.equal(rows.find(r=>r.id===edited.id)?.name,'Saved user edit');assert.ok(!rows.some(r=>r.id===deleted),'deleted location remains deleted');
 assert.ok(!requested.some(url=>url.includes('dispatch-data.js')));
});
