#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorldCollision } from '../city-explorer/multiplayer/world-collision.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.MAP_QA_URL||'http://127.0.0.1:4188';
const worldDir=path.join(root,'city-explorer/multiplayer/world-data/v1');
const world=await loadWorldCollision({manifestUrl:path.join(worldDir,'world-manifest.json')});
const heightRecord=JSON.parse(await readFile(path.join(worldDir,'station-heights.json'),'utf8'));
const runtimeDeps="C:\\Users\\Danny's Ultimate PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
let chromium;
try{({chromium}=createRequire(import.meta.url)('playwright'));}catch{({chromium}=createRequire(path.join(runtimeDeps,'package.json'))('playwright'));}
const station2=world.stations.find(station=>station.number===2);
const station2Tiles=new Set(world.manifest.roadPack.tiles.filter(tile=>{
 const b=tile.bounds,padding=160;
 return !(station2.anchor.x+padding<b.minX||station2.anchor.x-padding>b.maxX||station2.anchor.z+padding<b.minZ||station2.anchor.z-padding>b.maxZ);
}).map(tile=>path.basename(tile.url)));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const results=[];
function tileName(url){try{return path.basename(new URL(url).pathname).match(/[-\d]+_[-\d]+-[a-f0-9]+\.bin\.gz/)?.[0]||null;}catch{return null;}}
async function startPage(station,vehicle){
 const page=await browser.newPage({viewport:{width:1280,height:800}}),pageErrors=[],responses=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 page.on('response',response=>{const name=tileName(response.url());if(name)responses.push({name,status:response.status()});});
 await page.goto(`${base}/city-explorer/?station=${station}&vehicle=${vehicle}&quality=balanced&qaMultiplayerWorld=1`,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations,null,{timeout:180000});
 await page.waitForFunction(()=>globalThis.__PTBO_MULTIPLAYER_WORLD_SOURCE__?.stationReady(Number(new URLSearchParams(location.search).get('station'))),null,{timeout:60000});
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.stationHeightRecord),'ready','validated station-height sidecar loaded');
 return{page,pageErrors,responses};
}
async function verifyStation2(page,pageErrors,responses,label){
 await page.waitForFunction(()=>globalThis.__PTBO_MULTIPLAYER_WORLD_SOURCE__?.stationReady(2),null,{timeout:90000});
 const actual=await page.evaluate(()=>({datum:__PTBO_MULTIPLAYER_WORLD_SOURCE__.stationDatum(2),root:__PTBO_MULTIPLAYER_WORLD_SOURCE__.stationRootPosition(2),state:__PTBO_GAMEPLAY__.state()}));
 const expectedHeight=heightRecord.stations.find(station=>station.number===2);
 assert.ok(Math.abs(actual.datum-expectedHeight.datum)<1e-9,`${label}: Station 2 datum uses the world sidecar`);
 assert.ok(Math.abs(actual.root.x-station2.anchor.x)<1e-5&&Math.abs(actual.root.y-expectedHeight.datum)<1e-5&&Math.abs(actual.root.z-station2.anchor.z)<1e-5,`${label}: loaded station model root remains at its pinned world placement`);
 const surfaceFixtures=[
  {id:'station-two-apron',local:{x:0,z:-5.6}},
  {id:'station-two-bay-floor',local:{x:0,z:10}},
 ];
 const surfaces=[];
 for(const fixture of surfaceFixtures){
  const stationLocal=fixture.local,cos=Math.cos(station2.yaw),sin=Math.sin(station2.yaw),point={x:station2.anchor.x+stationLocal.x*cos+stationLocal.z*sin,z:station2.anchor.z-stationLocal.x*sin+stationLocal.z*cos};
  await world.prefetch(point.x,point.z,30);
  const expected=world.sampleSurface(point.x,point.z),observed=await page.evaluate(async point=>{const api=globalThis.__PTBO_MULTIPLAYER_WORLD_SOURCE__;await api.prefetch(point.x,point.z);return api.surface(point.x,point.z,null);},point);
  assert.equal(observed.ready,true,`${fixture.id}: shared source is ready`);
  assert.ok(Math.abs(observed.height-expected.height)<=0.01,`${fixture.id}: browser/runtime ${observed.height} vs package ${expected.height} m`);
  assert.equal(observed.surfaceId,expected.surfaceId,`${fixture.id}: contact surface identity`);
  surfaces.push({id:fixture.id,height:observed.height,surfaceId:observed.surfaceId,differenceMetres:observed.height-expected.height});
 }
 assert.equal(actual.state.activeVehicleId,'pump-2',`${label}: selected vehicle is based at Station 2`);
 assert.deepEqual(pageErrors,[],`${label}: no browser page errors`);
 await page.screenshot({path:path.join(process.env.TEMP||process.cwd(),`station-height-${label.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.png`)});
 return{label,datum:actual.datum,root:actual.root,stationTwoModelLoaded:actual.state.vehicles.find(v=>v.id==='pump-2')?.assetStatus,stationTwoTilesFetched:[...new Set(responses.map(response=>response.name))].filter(name=>station2Tiles.has(name)).length,surfaces};
}
try{
 const first=await startPage(1,'pump-1');
 const initial=await first.page.evaluate(()=>({stationTwoReady:__PTBO_MULTIPLAYER_WORLD_SOURCE__.stationReady(2),activeVehicleId:__PTBO_GAMEPLAY__.state().activeVehicleId}));
 const initialStation2TileFetches=[...new Set(first.responses.map(response=>response.name))].filter(name=>station2Tiles.has(name));
 assert.equal(initial.stationTwoReady,false,'distant Station 2 model stays unloaded at Station 1 startup');
 assert.deepEqual(initialStation2TileFetches,[],'Station 1 startup does not eagerly fetch Station 2 road tiles');
 await first.page.evaluate(()=>__PTBO_GAMEPLAY__.selectVehicle('pump-2'));
 await first.page.waitForFunction(()=>__PTBO_GAMEPLAY__?.state().activeVehicleId==='pump-2',null,{timeout:90000});
 results.push(await verifyStation2(first.page,first.pageErrors,first.responses,'station-1-to-station-2'));
 results[0].initialStation2ModelReady=initial.stationTwoReady;
 results[0].initialStation2TilesFetched=initialStation2TileFetches.length;
 await first.page.close();
 const direct=await startPage(2,'pump-2');
 results.push(await verifyStation2(direct.page,direct.pageErrors,direct.responses,'direct-station-2'));
 await direct.page.close();
 console.log(JSON.stringify({worldVersion:world.worldVersion,roadPackBuildId:world.manifest.roadPack.buildId,results}));
}finally{await browser.close();}
