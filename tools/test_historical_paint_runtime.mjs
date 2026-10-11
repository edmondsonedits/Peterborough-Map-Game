import {selectMappedArrowSupportIndex} from '../city-explorer/fallback-arrow-support.js';
import {mappedTurnLaneGroups} from '../city-explorer/city-detail-rules.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {historicalPaintProfile,renderHistoricalPaintProfile} from '../city-explorer/historical-paint-profiles.js';
import {roadProfile,laneCountFor,resampleRoadLine} from '../city-explorer/road-network.js';
import {mappedCycleLaneSides,roadLaneMarkingBoundaries} from '../city-explorer/city-detail-rules.js';
import {reviewedPaintTags} from '../city-explorer/street-paint.js';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
const app=fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
const osm=JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url))).elements;
const project=(lat,lon)=>new THREE.Vector2((lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),-(lat-44.3091)*110540);
const fn=name=>app.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'))[0];
function queued(id,mutate=x=>x){
 const w=osm.find(x=>x.type==='way'&&x.id===id),lines=[];
 const env={THREE,historicalPaintProfile,roadProfile,resampleRoadLine,roadBucket:()=> 'minor',getRoadWidth:t=>roadProfile(t).width,terrainHeightAtWorld:()=>10,lowPowerProfile:false,project};
 const run=Function(...Object.keys(env),fn('queueProjectedLine')+'\n'+fn('addLineSegments')+';return addLineSegments')(...Object.values(env));
 run(mutate(w.geometry.map(p=>[p.lon,p.lat])),w.tags,{},lines,`way/${id}:0`);return lines[0];
}
test('runtime resolves historical eligibility before filtering and resampling whole source geometry',()=>{
 for(const id of [250810393,250811912]){
  assert.ok(queued(id).historicalPaintProfile);
  assert.equal(queued(id,x=>[...x,null]).historicalPaintProfile,null);
  assert.equal(queued(id,x=>[...x.slice(0,1),[x[0][0]+.00001,x[0][1]],...x.slice(1)]).historicalPaintProfile,null);
  assert.ok(queued(id,x=>x.reverse()).historicalPaintProfile.sourceReversed);
 }
 assert.match(fn('finalizeRoadLines'),/historicalPaintProfile: line.historicalPaintProfile/);
});
function runtime(index){
 const state={renderedPavementIndex:index,roadPaintRanges:new Map(),objectCount:0};
 const generatedRoadMeshes=new Map(),streetscapeGroup=new THREE.Group(),document={documentElement:{dataset:{}}};
 const env={THREE,state,generatedRoadMeshes,streetscapeGroup,document,roadGroup:new THREE.Group(),selectMappedArrowSupportIndex,mappedTurnLaneGroups,historicalPaintProfile,renderHistoricalPaintProfile,roadProfile,laneCountFor,mappedCycleLaneSides,roadLaneMarkingBoundaries,reviewedPaintTags,lowPowerProfile:false,roadRenderTileCoordinates:()=>({x:0,z:0}),ROAD_RENDER_TILE_SIZE:400,materials:{roadPaintYellow:new THREE.MeshBasicMaterial(),roadPaintWhite:new THREE.MeshBasicMaterial()},drapePaintStrip:()=>[]};
 return {run:Function(...Object.keys(env),fn('buildRoadMarkings')+';return buildRoadMarkings')(...Object.values(env)),state,generatedRoadMeshes,streetscapeGroup,document};
}
test('runtime emits once per validated whole way, strict support and editor ranges determine review count',()=>{
 const index=new RenderedPavementIndex();
 index.addTriangle(-4000,10,0,0,10,0,0,10,2000,{layer:'road_surfaces'});index.addTriangle(-4000,10,0,0,10,2000,-4000,10,2000,{layer:'road_surfaces'});
 const segments=[];
 for(const id of [250810393,250811912]){
  const line=queued(id);
  for(let i=1;i<line.samples.length;i++){
   const a=line.samples[i-1],b=line.samples[i];segments.push({a:new THREE.Vector2(a.x,a.y),b:new THREE.Vector2(b.x,b.y),aY:10,bY:10,chainStart:a.distance,lineId:line.id,lineLength:line.samples.at(-1).distance,tags:line.tags,profile:line.profile,width:line.profile.width,historicalPaintProfile:line.historicalPaintProfile});
  }
 }
 const good=runtime(index);for(const s of segments)good.state.roadPaintRanges.set(s.lineId,[]);good.run(segments);
 assert.equal(good.document.documentElement.dataset.roadPaintReviewedWays,'2');assert.equal(good.generatedRoadMeshes.size,2);
 for(const ranges of good.state.roadPaintRanges.values()){assert.ok(ranges.length);assert.ok(ranges.every(r=>['solid','dash','hatch'].includes(r.kind)));}
 const absent=runtime(new RenderedPavementIndex());absent.run(segments);assert.equal(absent.document.documentElement.dataset.roadPaintReviewedWays,'0');
 const changed=runtime(index);changed.run(segments.map(s=>({...s,historicalPaintProfile:null})));assert.equal(changed.document.documentElement.dataset.roadPaintReviewedWays,'0','old Hospital tag-only override cannot bypass full geometry');
});
test('actual fallback parser rejects incomplete chosen source geometry and accepts valid inline or node forms',()=>{
 const results=[];
 const env={THREE,project,state:{officialRoadSurfacesAvailable:true},createBuildingBufferBatches:()=>{},createFootprintCentroidIndex:()=>{},isCrossingWay:()=>false,
 queueProjectedLine:(points,tags,buckets,lines,id,complete=true)=>{results.push(complete?historicalPaintProfile(points,tags,id):null);return 1;}};
 for(const name of ['finalizeRoadLines','buildInstancedLines','buildRoadSurfaceIndex','flushPrototypeFacades','buildBufferedBuildingBatches','buildMapRoadLines','buildCrossings','buildBridgeDetails','buildTunnelStructures','buildStreetLabels','buildStreetNameSigns'])env[name]=()=>{};
 const run=Function(...Object.keys(env),fn('parseOsmWayFallback')+';return parseOsmWayFallback')(...Object.values(env));
 for(const id of [250810393,250811912]){
  const way=osm.find(w=>w.id===id&&w.type==='way');
  run({elements:[way]});assert.ok(results.pop());
  run({elements:[{...way,geometry:[...way.geometry,null]}]});assert.equal(results.pop(),null);
  const nodes=way.geometry.map((p,i)=>({type:'node',id:i+1,...p}));
  run({elements:[...nodes,{...way,nodes:nodes.map(n=>n.id)}]});assert.ok(results.pop());
  run({elements:[...nodes,{...way,nodes:[...nodes.map(n=>n.id),999]}]});assert.equal(results.pop(),null);
 }
});

test('historical QA visibility selects historical meshes and source range kinds',()=>{
 const qa=fn('exposeCityQualityQa');
 assert.match(qa,/historicalPaintVisibility\(wayId\)/);
 assert.match(qa,/meshType:'historical-road-paint'/);
 assert.match(fn('buildRoadMarkings'),/kind:range.kind/);
 assert.match(fn('buildMappedTurnArrows'),/state.finalVisiblePaintIndex \|\| selectMappedArrowSupportIndex/);
});
