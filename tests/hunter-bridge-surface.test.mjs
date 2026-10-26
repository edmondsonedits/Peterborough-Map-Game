import assert from 'node:assert/strict';
import test from 'node:test';
import { createHunterBridgeSurface, isHunterBridgeLine } from '../city-explorer/hunter-bridge-surface.js';
const make = (id, xs, hs, bridge=false) => ({id:`way/${id}:0`,profile:{width:7.15,bridge},samples:xs.map((x,i)=>({x,y:0,distance:Math.abs(x-xs[0]),height:hs[i],groundHeight:hs[i]-.1}))});
const lines=()=>[make(499202158,[-100,-50], [4,4]),make(33953421,[-50,0],[4,4]),make(177049271,[0,100],[4,-8],true),make(33954231,[100,200],[-8,3],true),make(33953339,[200,250],[3,3]),make(33963410,[250,300],[3,3])];
test('replaces the shared river sag, preserves outer approach endpoints and source XY',()=>{
 const input=lines(), before=structuredClone(input), other=make(777,[0,100],[-5,-5]);input.push(other);
 const surface=createHunterBridgeSurface(input,()=>2.8);
 assert.ok(surface); assert.equal(surface.heightAt(100,0),3.5); assert.equal(surface.heightAt(-100,0),4); assert.equal(surface.heightAt(300,0),3);
 assert.deepEqual(other,make(777,[0,100],[-5,-5]));
 input.slice(0,6).forEach((l,i)=>l.samples.forEach((s,j)=>{assert.equal(s.x,before[i].samples[j].x);assert.equal(s.y,before[i].samples[j].y);assert.equal(s.distance,before[i].samples[j].distance);}));
 for(let x=-99;x<300;x++) assert.ok(Math.abs(surface.heightAt(x,0)-surface.heightAt(x-1,0))<.04);
 assert.equal(surface.heightAt(100,30),null); assert.equal(surface.heightAt(-101,0),null);
 assert.equal(surface.roadAt(100,2).onRoad,true); assert.equal(surface.roadAt(100,4),null);
});
test('fails closed without both connected source ways and ignores unrelated roads',()=>{
 assert.equal(createHunterBridgeSurface(lines().filter(l=>!l.id.includes('33954231')),()=>0),null);
 const disconnected=lines();disconnected[3].samples[0].y=20;
 assert.equal(createHunterBridgeSurface(disconnected,()=>0),null);
 assert.equal(isHunterBridgeLine('way/177049271:0'),true);assert.equal(isHunterBridgeLine('way/999:0'),false);
});
test('uses bank source heights rather than low-resolution terrain at the river endpoint',()=>{
 const input=lines();input[1].samples.at(-1).height=-3;input[2].samples[0].height=-3;
 const s=createHunterBridgeSurface(input,(x)=>x===0?4:2.8);
 assert.ok(s.heightAt(0,0)>=4.14-1e-8);assert.ok(s.heightAt(100,0)>3.5);
});

import { readFileSync } from 'node:fs';
import { HUNTER_BRIDGE_FEATURE } from '../city-explorer/hunter-bridge-source.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/hunter-bridge-road-profiles.json',import.meta.url)));
for(const [mode,original] of Object.entries(fixture)) test(`${mode}: reproduced bank profiles stay gentle without moving footprints or outer joins`,()=>{
 const input=structuredClone(original),all=input.flatMap(l=>l.samples),before=structuredClone(all);
 const surface=createHunterBridgeSurface(input,(x,z)=>before.find(p=>p.x===x&&p.y===z).sourceTerrain);
 assert.ok(surface);
 for(const l of input) for(let i=1;i<l.samples.length;i++){
   const a=l.samples[i-1],b=l.samples[i];
   assert.ok(Math.abs(b.height-a.height)/Math.hypot(b.x-a.x,b.y-a.y)<.06,'less than6% grade');
 }
 for(const bank of Object.values(surface.banks)) assert.ok(Number.isFinite(bank.height));
 for(const id of ['way/33953421:0','way/33953339:0']){
   const old=original.find(l=>l.id===id),updated=input.find(l=>l.id===id);
   const join=old.samples.at(-1);
   const current=updated.samples.find(p=>p.x===join.x&&p.y===join.y);
   assert.equal(current.height,join.height,'adjoining intersection height is preserved');
 }
 for(const p of all) assert.ok(p.height>=p.groundHeight-.002,'retain terrain clearance');
 for(const x of [surface.bounds.minX,surface.bounds.maxX]){
   const b=before.find(p=>p.x===x),a=all.find(p=>p.x===x);assert.equal(a.height,b.height,'outer join preserved');
 }
});
test('lite bridge footprint is the exact existing municipal BR60 snapshot',()=>{
 const data=JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-road-surfaces.geojson',import.meta.url)));
 const current=data.features.find(f=>f.properties?.FACILITYID==='BR60');
 assert.deepEqual(HUNTER_BRIDGE_FEATURE,current);
});

import { runInNewContext } from 'node:vm';
const runtime=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8').match(/^function gameplaySurfaceAt\([^]*?^\}/m)[0];
test('actual gameplay query chooses the Hunter ribbon beneath tires and preserves unrelated underpasses',()=>{
 const hit={height:5,onRoad:true,name:'Hunter Street East',bridge:true};
 const wrong={height:4.85,onRoad:true,name:'Hunter Street East',bridge:true};
 const state={renderedPavementIndex:{sample:()=>null},fallbackJunctionSurfaceIndex:{sample:()=>({height:4.9})},roadSurfaceIndex:{sample:()=>wrong}};
 const query=runInNewContext(runtime+'\ngameplaySurfaceAt',{terrainHeightAtWorld:()=>-10,state,hunterBridgeSurface:{roadAt:()=>hit}});
 assert.equal(query(0,0,4.85).height,5);assert.equal(query(0,0,4.85).heightSource,'road-ribbon');
 wrong.name='Underpass';wrong.height=-2;state.fallbackJunctionSurfaceIndex.sample=()=>null;
 assert.equal(query(0,0,-2).height,-2);
 state.renderedPavementIndex.sample=()=>({height:5.012,layer:'bridges',heightSource:'rendered-pavement-triangle'});
 assert.equal(query(0,0,-2).height,-2,'retain existing lower-road hint');
});
