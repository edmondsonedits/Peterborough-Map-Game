'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
function runtime({context='geo',search='?city=toronto',stored=null,fail=false,delayed=false,denied=false,pack}={}){
 const requested=[],trainingRequested=[],events=[],storage=new Map(stored?[['ptboSelectedCity',stored]]:[]);let release;
 const data=pack||{schemaVersion:1,id:'toronto',name:'Toronto',map:{bounds:[[43,-80],[44,-79]],defaultCenter:[43.7,-79.4],minZoom:7,maxZoom:19},bases:[{id:'station-1',number:1,name:'Fire One',address:'1 Main St',service:'fire',lat:43.7,lng:-79.4,status:'active',selectionEligible:true},{id:'ems-1',number:1,name:'EMS One',address:'2 Main St',service:'ems',lat:43.71,lng:-79.4,status:'active',selectionEligible:true},{id:'future',number:2,name:'Future',address:'TBA',service:'fire',lat:null,lng:null,status:'planned',selectionEligible:false}],locations:[{id:'call',name:'Mall',addr:'3 Main St',lat:43.72,lng:-79.4,radius:100,recognitionDifficulty:'easy',crossStreets:['A','B']}]};
 const nodes=[];
 const c=vm.createContext({URL,URLSearchParams,console,AbortController,setTimeout,clearTimeout,CustomEvent:class{constructor(type,o){this.type=type;this.detail=o?.detail;}},
 location:{href:'https://example.test/game/geo-guesser/index.html'+search},
 localStorage:{getItem:k=>{if(denied)throw Error('Denied');return storage.get(k)||null;},setItem:(k,v)=>{if(denied)throw Error('Denied');storage.set(k,v);}},
 fetch:async url=>{const value=String(url);if(value.includes('/training-data.json')){trainingRequested.push(value);if(fail)throw Error('Offline');const id=new URL(value).pathname.split('/').at(-2);return{ok:true,json:async()=>({schemaVersion:1,id,careHomes:[]})};}requested.push(value);if(delayed)await new Promise(r=>release=r);if(fail)throw Error('Offline');return {ok:true,json:async()=>structuredClone(data)};},
 addEventListener(){},dispatchEvent:e=>events.push(e),
 document:{readyState:'complete',querySelector:()=>null,documentElement:{dataset:{}},scripts:[],currentScript:{src:'https://example.test/game/geo-guesser/city-loader.js?v=preview'},createElement:()=>({dataset:{},addEventListener(){},remove(){}}),head:{appendChild(node){nodes.push(node);if(!node.src)return;Promise.resolve().then(()=>{try{c.document.currentScript={src:node.src};const file=new URL(node.src).pathname.replace('/game/','');vm.runInContext(read(file),c);node.onload();}catch(e){console.error(node.src, e);node.onerror?.(e);}});}}}});
 c.window=c;vm.runInContext(read('cities/city-registry.js'),c);vm.runInContext(read('shared/location-changes.js'),c);
 if(fs.existsSync(path.join(root,'shared/city-location-runtime.js')))vm.runInContext(read('shared/city-location-runtime.js'),c);
 if(context==='editor'){if(c.PTBO_CITY_LOCATION_RUNTIME)c.PTBO_EDITOR_CITY_READY=c.PTBO_CITY_LOCATION_RUNTIME.load({context:'editor'});c.PTBO_EDITOR_CITY_READY?.catch(()=>{});}
 else if(fs.existsSync(path.join(root,'geo-guesser/city-loader.js')))vm.runInContext(read('geo-guesser/city-loader.js'),c);
 return{c,requested,trainingRequested,events,storage,data,nodes,release:()=>release?.()};
}
module.exports={runtime};
