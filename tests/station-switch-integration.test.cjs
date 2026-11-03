'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','city-explorer','app.js'),'utf8');
const start=source.indexOf('async function prepareStationSwitch('),end=source.indexOf('\nfunction syncStationControls()',start);
assert.ok(start>=0&&end>start,'prepareStationSwitch source range must be found');

function harness({number=2,roadTileLayer=null,runtimeLoad=async()=>true,ready=()=>true,spawnPoints}={}){
 const station={number,lat:44,lon:-78};
 const runtime={playerSpawn:{x:21,z:22},spawn:{x:31,z:32},load:runtimeLoad};
 const scenery=[],stationThreeCalls=[];
 const c=vm.createContext({
  FIRE_STATIONS:[{number:1,lat:1,lon:1},{number:2,lat:2,lon:2}].filter(value=>value.number!==number).concat(station),
  stationTransitionTarget:{x:90,z:91,protection:{protectX:1,protectZ:2,protectRadius:3}},
  cityEditor:{active:false},roadTileLayer,
  waitForStationTask:async task=>await task,
  ensureStationRuntime:()=>runtime,
  stationThreeSpawnPoints:value=>{stationThreeCalls.push(value);return spawnPoints;},
  loadStationThreeModel:async()=>{},placeStationThreeModel(){},stationThreeAssetReady:true,stationThreeModel:{},
  citySceneryReadyAt:(x,z)=>{scenery.push([x,z]);return ready(x,z);},progressiveCityStatus:{phase:'ready'},
  performance:{now:()=>0},setTimeout,clearTimeout,console,
 });
 vm.runInContext(source.slice(start,end)+'\nthis.prepareStationSwitch=prepareStationSwitch;',c);
 return{prepare:c.prepareStationSwitch,station,runtime,scenery,stationThreeCalls,c};
}

test('unrelated road update failures do not reject when destination coverage is ready',async()=>{
 const readiness=[];
 const h=harness({roadTileLayer:{update:async()=>({failures:7}),readyAt:(x,z,radius)=>{readiness.push([x,z,radius]);return true;}}});
 const prepared=await h.prepare(2,{isCurrent:()=>true});
 assert.equal(prepared.station.number,2);assert.equal(prepared.runtime,h.runtime);
 assert.deepEqual(readiness,[[90,91,110],[31,32,15],[21,22,8]]);
});

test('Station 3 checks road and scenery coverage at exact interior spawn coordinates',async()=>{
 const interior={truckPoint:{x:314.25,y:426.75},playerPoint:{x:309.5,y:423.125}};
 const roadChecks=[],h=harness({number:3,spawnPoints:interior,roadTileLayer:{
  update:async()=>({failures:0}),readyAt:(x,z,radius)=>{roadChecks.push([x,z,radius]);return true;},
 }});
 const prepared=await h.prepare(3,{isCurrent:()=>true});
 assert.equal(prepared.runtime,null);assert.deepEqual(h.stationThreeCalls,[h.station]);
 assert.deepEqual(h.scenery,[[interior.truckPoint.x,interior.truckPoint.y],[interior.playerPoint.x,interior.playerPoint.y]]);
 assert.deepEqual(roadChecks,[[90,91,110],[interior.truckPoint.x,interior.truckPoint.y,15],[interior.playerPoint.x,interior.playerPoint.y,8]]);
});

test('a target model finishing after supersession rejects before the commit stage',async()=>{
 let resolveLoad,current=true,commits=0;
 const load=new Promise(resolve=>{resolveLoad=resolve;});
 const h=harness({runtimeLoad:()=>load});
 const attempt=h.prepare(2,{isCurrent:()=>current}).then(prepared=>{commits++;return prepared;});
 await Promise.resolve();current=false;resolveLoad(true);
 await assert.rejects(attempt,/superseded/i);
 assert.equal(commits,0);assert.deepEqual(h.scenery,[]);
});

test('final destination coverage loss rejects even when the initial road probe passed',async()=>{
 const checks=[],h=harness({roadTileLayer:{update:async()=>({failures:0}),readyAt:(x,z,radius)=>{
  checks.push([x,z,radius]);return radius===110;
 }}});
 await assert.rejects(h.prepare(2,{isCurrent:()=>true}),/coverage changed/i);
 assert.deepEqual(checks,[[90,91,110],[31,32,15]]);
});
