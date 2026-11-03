import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
function section(first,last){return app.slice(app.indexOf(first),app.indexOf(last,app.indexOf(first)));}
function guards(overrides={}){
 const context={pendingCityBuildingGroups:[{bounds:{minX:1000,maxX:1200,minZ:1000,maxZ:1200}}],citySceneryRadius:100,document:{documentElement:{dataset:{}}},fullCityReady:false,progressiveCityStatus:{enabled:true,phase:'background'},pendingCityNavigation:null,showToast(){},...overrides};
 vm.createContext(context);vm.runInContext(section('function distanceToBuildingGroup(','async function finishProgressiveBuildings('),context);return context;
}
test('scenery guard requires the complete visible neighborhood, while leaving the ready area usable',()=>{
 const c=guards();assert.equal(c.citySceneryReadyAt(0,0),true);assert.equal(c.citySceneryReadyAt(950,1100),false);assert.equal(c.citySceneryReadyAt(1100,1100),false);assert.equal(c.document.documentElement.dataset.cityStreaming,'waiting');assert.equal(c.citySceneryReadyAt(0,0,false),true);assert.equal(c.document.documentElement.dataset.cityStreaming,'waiting');c.pendingCityBuildingGroups=[];assert.equal(c.citySceneryReadyAt(1100,1100),true);
});
test('quick travel waits for full readiness and never queues a failed background load',()=>{
 const c=guards();let invoked=0;const action=()=>invoked++;assert.equal(c.deferCityNavigation(action),true);assert.equal(invoked,0);assert.equal(c.pendingCityNavigation,action);c.pendingCityNavigation=null;c.progressiveCityStatus.phase='failed';assert.equal(c.deferCityNavigation(action),true);assert.equal(c.pendingCityNavigation,null);c.fullCityReady=true;assert.equal(c.deferCityNavigation(action),false);
});
test('background failure keeps pending scenery guarded and returns without claiming full readiness',async()=>{
 const c=guards({nextFrame:async()=>{},runProgressiveCityBuild:async()=>{throw Error('injected');},els:{worldStatus:{textContent:''}},console:{warn(){}},commitBackgroundBuildingBatch(){}});
 vm.runInContext(section('async function finishProgressiveBuildings(','async function parseOsmWithGeoJson('),c);assert.equal(await c.finishProgressiveBuildings(),false);assert.equal(c.progressiveCityStatus.phase,'failed');assert.equal(c.progressiveCityStatus.error,'injected');assert.equal(c.fullCityReady,false);assert.equal(c.pendingCityBuildingGroups.length,1);assert.match(c.els.worldStatus.textContent,/Station ready/);
});
test('background mesh visibility is released only after every commit step completes',async()=>{
 const batches=new Map([['a',{}],['b',{}]]),meshes=new Map([...batches.keys()].map(key=>[key,{userData:{cityPending:true},updateMatrix(){}}]));let yielded=0,updated=0,hidden=0,time=0;
 const c={performance:{now:()=>time+=3},progressiveCityStatus:{},buildingBatchCommitSteps:function*(map,background){assert.equal(map,batches);assert.equal(background,true);yield;yield;},nextFrame:async()=>{yielded++;assert.ok([...meshes.values()].every(m=>m.userData.cityPending));},generatedBuildingMeshes:meshes,batchMeshKey:(_,key)=>key,updateCityVisualLod:()=>{updated++;assert.ok([...meshes.values()].every(m=>!m.userData.cityPending));},hideSelectedStationReplacement:()=>hidden++,cityVisualLod:'previous'};
 vm.createContext(c);vm.runInContext(section('async function commitBackgroundBuildingBatch(','function buildVerticalSliceRooftopEquipment('),c);await c.commitBackgroundBuildingBatch(batches);assert.ok(yielded>0);assert.equal(updated,1);assert.equal(hidden,1);assert.equal(c.cityVisualLod,'');assert.ok([...meshes.values()].every(m=>m.matrixAutoUpdate===false));
});
