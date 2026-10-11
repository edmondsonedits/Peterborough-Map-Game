import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createHospitalSurfaceFixture} from './hospital-surface-fixture.mjs';
import {roadProfile,laneCountFor,resampleRoadLine} from '../city-explorer/road-network.js';
import {mappedCycleLaneSides,roadLaneMarkingBoundaries} from '../city-explorer/city-detail-rules.js';
import {reviewedPaintTags} from '../city-explorer/street-paint.js';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
const root=process.env.HISTORICAL_APP_ROOT?pathToFileURL(path.resolve(process.env.HISTORICAL_APP_ROOT)+'/'):new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('city-explorer/app.js',root),'utf8');
const helper=process.env.HISTORICAL_HELPER_PATH?pathToFileURL(path.resolve(process.env.HISTORICAL_HELPER_PATH)):new URL('city-explorer/historical-paint-profiles.js',root);
const {historicalPaintProfile,renderHistoricalPaintProfile}=await import(helper);
const osm=JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url))).elements;
const fn=name=>{const match=app.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'));assert.ok(match,`real app ${name}`);return match[0];};
function queue(fixture,id,mutate=x=>x){
 const way=osm.find(w=>w.type==='way'&&w.id===id),lines=[];
 const env={THREE,historicalPaintProfile,roadProfile,resampleRoadLine,roadBucket:()=> 'minor',getRoadWidth:t=>roadProfile(t).width,
  terrainHeightAtWorld:fixture.terrainHeight,lowPowerProfile:false,project:(lat,lon)=>{const p=fixture.project(lat,lon);return new THREE.Vector2(p.x,p.y);}};
 Function(...Object.keys(env),fn('queueProjectedLine')+'\n'+fn('addLineSegments')+';return addLineSegments')(...Object.values(env))(
  mutate(way.geometry.map(p=>[p.lon,p.lat])),way.tags,{},lines,`way/${id}:0`);
 return lines[0];
}
function runtime(fixture,index=fixture.index){
 const state={renderedPavementIndex:index,roadSurfaceIndex:fixture.roadIndex,roadPaintRanges:new Map(),objectCount:0};
 const generatedRoadMeshes=new Map(),streetscapeGroup=new THREE.Group(),document={documentElement:{dataset:{}}};
 const env={THREE,state,generatedRoadMeshes,streetscapeGroup,document,historicalPaintProfile,renderHistoricalPaintProfile,
  roadProfile,laneCountFor,mappedCycleLaneSides,roadLaneMarkingBoundaries,reviewedPaintTags,lowPowerProfile:false,
  roadRenderTileCoordinates:()=>({x:0,z:0}),ROAD_RENDER_TILE_SIZE:400,terrainHeightAtWorld:fixture.terrainHeight,
  materials:{roadPaintYellow:new THREE.MeshBasicMaterial(),roadPaintWhite:new THREE.MeshBasicMaterial()},drapePaintStrip:()=>[]};
 return {run:Function(...Object.keys(env),fn('buildRoadMarkings')+';return buildRoadMarkings')(...Object.values(env)),
  gameplay:Function(...Object.keys(env),fn('gameplaySurfaceAt')+';return gameplaySurfaceAt')(...Object.values(env)),state,generatedRoadMeshes,document};
}
const reports=[], failures=[];
for(const lowPower of [false,true]){
 const fixture=createHospitalSurfaceFixture({lowPower}),segments=[],profiles=new Map();
 for(const id of [250810393,250811912]){
  const queued=queue(fixture,id);assert.ok(queued.historicalPaintProfile);profiles.set(id,queued.historicalPaintProfile);
  for(const alter of [x=>[...x,null],x=>x.slice(1),x=>[x[0],[(x[0][0]+x[1][0])/2,(x[0][1]+x[1][1])/2],...x.slice(1)]])
   assert.ok(!queue(fixture,id,alter)?.historicalPaintProfile,'whole-source proof precedes filtering/resampling');
  assert.ok(queue(fixture,id,x=>x.reverse()).historicalPaintProfile.sourceReversed);
  const line=fixture.roadLines.find(l=>l.id===id);
  for(let i=1;i<line.samples.length;i++){
   const a=line.samples[i-1],b=line.samples[i];segments.push({a:new THREE.Vector2(a.x,a.y),b:new THREE.Vector2(b.x,b.y),aY:a.height,bY:b.height,
    aSourceVertex:a.sourceVertex,bSourceVertex:b.sourceVertex,name:line.tags.name,chainStart:a.distance,lineId:queued.id,lineLength:line.samples.at(-1).distance,
    tags:line.tags,profile:line.profile,width:line.profile.width,historicalPaintProfile:queued.historicalPaintProfile});
  }
 }
 const r=runtime(fixture);for(const s of segments)r.state.roadPaintRanges.set(s.lineId,[]);r.run(segments);
 assert.equal(r.document.documentElement.dataset.roadPaintReviewedWays,'2');
 for(const [key,mesh] of r.generatedRoadMeshes){
  const p=mesh.geometry.attributes.position.array;let maxError=0,minLift=Infinity,samples=0;
  for(let i=0;i<p.length;i+=9){
   const points=[Array.from(p.slice(i,i+3)),Array.from(p.slice(i+3,i+6)),Array.from(p.slice(i+6,i+9))];
   for(const [a,b] of [[0,1],[1,2],[2,0]])points.push([0,1,2].map(axis=>(points[a][axis]+points[b][axis])/2));
   points.push([0,1,2].map(axis=>(p[i+axis]+p[i+3+axis]+p[i+6+axis])/3));
   for(const [x,y,z] of points){const hit=fixture.index.sample(x,z,y,{includeParking:false,includeBridges:false});
    if(hit?.layer!=='road_surfaces'){failures.push({lowPower,key,unsupported:[x,y,z]});continue;}const lift=y-hit.height;
    maxError=Math.max(maxError,Math.abs(lift-.008));minLift=Math.min(minLift,lift);samples++;
    if(Math.abs(lift-.008)>.0022)failures.push({lowPower,key,lift,point:[x,y,z]});
   }
  }
  reports.push({lowPower,key,triangles:p.length/9,probes:samples,maxLiftErrorMetres:maxError,minLiftMetres:minLift});
 }
 // Real gameplay must use final surveyed pavement, even outside unchanged6.7m Hospital ribbon.
 const hospital=fixture.roadLines.find(l=>l.id===250811912);assert.equal(hospital.profile.width,6.7);
 let outside=0;const outerLaneQueries=[];
 for(const stroke of profiles.get(250811912).strokes.filter(s=>s.kind==='solid'))for(const p of stroke.points){
  const nearest=hospital.samples.reduce((best,q)=>Math.hypot(q.x-p.x,q.y-p.z)<best.distance?{q,distance:Math.hypot(q.x-p.x,q.y-p.z)}:best,{distance:Infinity}).q;
  const i=Math.min(hospital.samples.length-2,Math.max(0,hospital.samples.indexOf(nearest))),a=hospital.samples[i],b=hospital.samples[i+1],dx=b.x-a.x,dz=b.y-a.y,length=Math.hypot(dx,dz);
  const side=(p.x-nearest.x)*(dz/length)+(p.z-nearest.y)*(-dx/length)>=0?1:-1;
  const x=p.x+side*dz/length*1.5,z=p.z-side*dx/length*1.5;
  const road=fixture.roadIndex.sample(x,z,0,nearest.height);
  const hit=r.gameplay(x,z,nearest.height);
  if(!road?.onRoad&&hit.official?.layer==='road_surfaces'){
   assert.equal(hit.onRoad,true);assert.equal(hit.heightSource,'rendered-pavement-triangle');outside++;
   outerLaneQueries.push({...fixture.unproject(x,z),pavementHeight:hit.height,osmRibbonOnRoad:false});
  }
 }
 assert.ok(outside>0,'Outer painted lanes need actual footprint gameplay queries beyond original6.7m ribbon');
 const absent=runtime(fixture,new RenderedPavementIndex());absent.run(segments);assert.equal(absent.document.documentElement.dataset.roadPaintReviewedWays,'0');
 const oneSupported=runtime(fixture,{sample:(x,z,...args)=>z<850?null:fixture.index.sample(x,z,...args)});
 oneSupported.run(segments);assert.equal(oneSupported.document.documentElement.dataset.roadPaintReviewedWays,'1');
 assert.equal(oneSupported.generatedRoadMeshes.size,1);assert.ok(oneSupported.generatedRoadMeshes.has('paint:historical:way/250811912:0'));
 // A genuine intersecting public road trims only a portion, not the whole way.
 const base=segments.find(s=>s.lineId==='way/250811912:0'&&s.aSourceVertex&&s.chainStart>20&&s.chainStart<80);
 assert.ok(base);const crossing={...base,lineId:'way/crossing',name:'Cross street',historicalPaintProfile:null,tags:{highway:'residential',name:'Cross street',lane_markings:'no'},
  b:base.a.clone().add(new THREE.Vector2(0,10)),bY:base.aY,profile:roadProfile({highway:'residential'}),aSourceVertex:true,bSourceVertex:false};
 const partial=runtime(fixture);partial.run([...segments,crossing]);
 assert.equal(partial.document.documentElement.dataset.roadPaintReviewedWays,'2');
 const key='paint:historical:way/250811912:0';
 assert.ok(partial.generatedRoadMeshes.get(key).geometry.attributes.position.count<r.generatedRoadMeshes.get(key).geometry.attributes.position.count,'partial intersection exclusions remove paint');
 reports.push({lowPower,outerLaneGameplayQueries:outside,outerLaneQueries,partialExclusions:true,countOnlyEmitted:true});
}
console.log(JSON.stringify({status:failures.length?'fail':'pass',reports,failedProbeCount:failures.length,worst:failures.sort((a,b)=>a.lift-b.lift).slice(0,10)},null,2));
assert.equal(failures.length,0,'Every emitted triangle probe needs final pavement support and8mm lift within2.2mm');
