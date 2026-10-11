/** Independent historical paint visibility regression: actual Float32 municipal
 * meshes plus retained source OSM ribbons on packaged lidar. Both source builder
 * and paint builder are executed; the visibility oracle does not call the paint
 * support selector. Water recess/browser startup are not reproduced.
 * Run with --desktop or without it for low-power. VISIBLE_PAINT_ROOT optionally
 * selects a candidate code tree; VISIBLE_PAINT_DIAGNOSTIC writes omitted probes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createHospitalSurfaceFixture} from './hospital-surface-fixture.mjs';
import {roadRibbonCrossSections,resampleRoadLine,reconcileRoadNetworkElevations} from '../city-explorer/road-network.js';
import {captureBatchLengths,collectBatchRanges} from '../city-explorer/editor/feature-batch-binding.js';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
import {mappedTurnLaneGroups} from '../city-explorer/city-detail-rules.js';
import {mappedArrowLaneOffsets,mappedArrowTriangles,drapeMappedArrowTriangles,mappedArrowSupport} from '../city-explorer/mapped-arrow-paint.js';
const root=process.env.VISIBLE_PAINT_ROOT?pathToFileURL(path.resolve(process.env.VISIBLE_PAINT_ROOT)+'/'):new URL('../',import.meta.url);
const {selectMappedArrowSupportIndex}=await import(new URL('city-explorer/fallback-arrow-support.js',root));
const historicalHelper=process.env.VISIBLE_HISTORICAL_HELPER_PATH?pathToFileURL(path.resolve(process.env.VISIBLE_HISTORICAL_HELPER_PATH)):new URL('city-explorer/historical-paint-profiles.js',root);
const {historicalPaintProfile,renderHistoricalPaintProfile}=await import(historicalHelper);
import {roadProfile,laneCountFor} from '../city-explorer/road-network.js';
import {reviewedPaintTags} from '../city-explorer/street-paint.js';
import {mappedCycleLaneSides,roadLaneMarkingBoundaries} from '../city-explorer/city-detail-rules.js';
const app=fs.readFileSync(new URL('city-explorer/app.js',root),'utf8');
const fn=name=>{const match=app.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'));assert.ok(match,`real app ${name}`);return match[0];};
const lowPower=!process.argv.includes('--desktop'),fixture=createHospitalSurfaceFixture({lowPower});
const source=new Map(JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url))).elements.filter(w=>w.type==='way').map(w=>[w.id,w]));
const lines=fixture.roadLines.map(line=>({...line,id:`way/${line.id}:0`,samples:resampleRoadLine(source.get(line.id).geometry.map(p=>fixture.project(p.lat,p.lon)),line.tags,fixture.terrainHeight,lowPower)}));
const roadGroup=fixture.group,streetscapeGroup=new THREE.Group(),generatedRoadMeshes=new Map(),document={documentElement:{dataset:{}}};
const state={objectCount:0,renderedPavementIndex:fixture.index,roadSurfaceIndex:fixture.roadIndex,roadPaintRanges:new Map(),fallbackJunctionSurfaceIndex:null};
const municipalIdentity=state.renderedPavementIndex,materials={roadPaintWhite:new THREE.MeshBasicMaterial(),roadPaintYellow:new THREE.MeshBasicMaterial()};
for(const line of lines)for(const key of [line.profile.surfaceKey,line.profile.edgeKey])materials[key] ||=new THREE.MeshBasicMaterial();
const env={historicalPaintProfile,renderHistoricalPaintProfile,selectMappedArrowSupportIndex,roadProfile,laneCountFor,mappedCycleLaneSides,roadLaneMarkingBoundaries,reviewedPaintTags,drapePaintStrip:()=>[],THREE,state,roadGroup,streetscapeGroup,generatedRoadMeshes,document,materials,RenderedPavementIndex,
 terrainHeightAtWorld:fixture.terrainHeight,lowPowerProfile:lowPower,roadRibbonCrossSections,
 roadRenderTileCoordinates:(x,z)=>({x:Math.floor(x/400),z:Math.floor(z/400)}),ROAD_RENDER_TILE_SIZE:400,
 batchMeshKey:(_,key)=>key,attachRoadInstance:()=>{},solveFallbackJunctions:()=>null,URLSearchParams,location:{search:''},
 mappedTurnLaneGroups,mappedArrowLaneOffsets,mappedArrowTriangles,drapeMappedArrowTriangles,mappedArrowSupport,
 worldUp:new THREE.Vector3(0,1,0),roadSide:new THREE.Vector3(),roadSurfaceNormal:new THREE.Vector3(),roadBasis:new THREE.Matrix4()};
const names=['roadBatchPositions','appendRoadTriangle','roadRibbonSides','roadEndpointKey','smoothStep01','planarSegmentIntersection',
 'buildRoadClearanceIndex','bridgeClearanceLift','applyBridgeElevationProfiles','appendRoadRibbon','buildBufferedRoadBatches','roadProfilePriority','buildRoadJunctions'];
const render=Function(...Object.keys(env),names.map(fn).join('\n')+';return {applyBridgeElevationProfiles,appendRoadRibbon,buildBufferedRoadBatches,buildRoadJunctions}')(...Object.values(env));
render.applyBridgeElevationProfiles(lines);reconcileRoadNetworkElevations(lines);
const batches=new Map(),segments=[];
const targets=new Set(['way/250810393:0','way/250811912:0']);
for(const line of lines){
 const original=source.get(Number(line.id.split('/')[1].split(':')[0]));
 const historical=targets.has(line.id)?historicalPaintProfile(original.geometry.map(p=>fixture.project(p.lat,p.lon)),line.tags,line.id):null;
 const starts=captureBatchLengths(batches);render.appendRoadRibbon(line,batches);state.roadPaintRanges.set(line.id,collectBatchRanges(batches,starts));
 for(let i=1;i<line.samples.length;i++){
  const a=line.samples[i-1],b=line.samples[i];segments.push({a:new THREE.Vector2(a.x,a.y),b:new THREE.Vector2(b.x,b.y),aY:a.height,bY:b.height,
   aSourceVertex:a.sourceVertex,bSourceVertex:b.sourceVertex,aLineEndpoint:i===1,bLineEndpoint:i===line.samples.length-1,
   historicalPaintProfile:historical,chainStart:a.distance,lineLength:line.samples.at(-1).distance,lineId:line.id,tags:line.tags,profile:line.profile,width:line.profile.width,bridge:line.profile.bridge});
 }
}
render.buildBufferedRoadBatches(batches);
const geometryHash=()=>{const hash=createHash('sha256');for(const mesh of roadGroup.children)hash.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));return hash.digest('hex');};
const sourceGeometry=geometryHash(),sourceLines=JSON.stringify(lines),municipalFaces=fixture.index.triangleCount;
const local=segments.filter(s=>targets.has(s.lineId)||(s.a.x>fixture.bounds[0]&&s.a.x<fixture.bounds[2]&&s.a.y>fixture.bounds[1]&&s.a.y<fixture.bounds[3]));
const renderCalls=[];env.renderHistoricalPaintProfile=(profile,index,options)=>{const result=renderHistoricalPaintProfile(profile,index,options);renderCalls.push({profile,options,result});return result;};
const run=Function(...Object.keys(env),fn('buildRoadMarkings')+';return buildRoadMarkings')(...Object.values(env));
run(local);
assert.equal(geometryHash(),sourceGeometry,'Paint does not mutate actual Float32 road meshes');
assert.equal(JSON.stringify(lines),sourceLines,'Paint does not mutate source profiles, samples or widths');
assert.equal(state.renderedPavementIndex,municipalIdentity);assert.equal(fixture.index.triangleCount,municipalFaces);
assert.equal(lines.find(l=>l.id==='way/250811912:0').profile.width,6.7);
const actual=new RenderedPavementIndex();
// Independent oracle reads actual uploaded mesh positions, not helper output.
for(const mesh of roadGroup.children){
 if(mesh.userData.type!=='road-surface-batch'&&mesh.userData.layer!=='road_surfaces')continue;
 const p=mesh.geometry.attributes.position.array;
 for(let i=0;i<p.length;i+=9){
  const xs=[p[i],p[i+3],p[i+6]],zs=[p[i+2],p[i+5],p[i+8]];
  if(Math.max(...xs)<fixture.bounds[0]||Math.min(...xs)>fixture.bounds[2]||Math.max(...zs)<fixture.bounds[1]||Math.min(...zs)>fixture.bounds[3])continue;
  actual.addTriangle(...Array.from(p.slice(i,i+9)),{layer:'road_surfaces',kind:mesh.userData.type,material:mesh.userData.material});
 }
}
if(process.env.VISIBLE_PAINT_DIAGNOSTIC){
 const x=-2114.355550130208,z=894.6661580403645,hits=[];
 for(const [lineId,ranges] of state.roadPaintRanges) for(const range of ranges){
  const mesh=generatedRoadMeshes.get(range.key);if(mesh?.userData.type!=='road-surface-batch')continue;
  const p=mesh.geometry.attributes.position.array;
  for(let i=range.startVertex*3;i<(range.startVertex+range.vertexCount)*3;i+=9){
   const t=new RenderedPavementIndex();t.addTriangle(...Array.from(p.slice(i,i+9)),{layer:'road_surfaces'});
   const hit=t.sample(x,z);if(hit)hits.push({lineId,material:mesh.userData.material,height:hit.height,tags:lines.find(l=>l.id===lineId)?.tags});
  }
 }
 console.log('OCCLUDER_PROVENANCE',JSON.stringify(hits));
}
const reports=[],failures=[],qa=[];
for(const id of targets){
 const mesh=generatedRoadMeshes.get(`paint:historical:${id}`);
 assert.ok(mesh,`${id} retains actual historical geometry`);
 const p=mesh.geometry.attributes.position.array;let probes=0,buried=0,maxBurial=0,maxError=0,unsupported=0,invalidFaces=0;
 assert.ok(p instanceof Float32Array);
 for(let i=0;i<p.length;i+=9)if((p[i+5]-p[i+2])*(p[i+6]-p[i])-(p[i+3]-p[i])*(p[i+8]-p[i+2])<=0)invalidFaces++;
 assert.equal(invalidFaces,0,'No zero-area/downward actual Float32 contact faces');
 for(let i=0;i<p.length;i+=9)for(const w of [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]){
  const [x,y,z]=[0,1,2].map(a=>p[i+a]*w[0]+p[i+3+a]*w[1]+p[i+6+a]*w[2]);
  const municipal=fixture.index.sample(x,z,y,{includeParking:false,includeBridges:false});
  if(municipal?.layer!=='road_surfaces'){unsupported++;continue;}
  // All local original source decks are street level; only <=1m higher actual
  // faces belong to this bounded presentation comparison, never a bridge jump.
  let top=municipal.height;
  for(const f of actual.cells.get(`${Math.floor(x/actual.cellSize)}:${Math.floor(z/actual.cellSize)}`)||[]){
   const dx=x-f.ax,dz=z-f.az,b=(dx*f.vz-dz*f.vx)*f.inverse,c=(f.ux*dz-f.uz*dx)*f.inverse;
   if(b< -1e-8||c< -1e-8||b+c>1+1e-8)continue;
   const h=f.ay+b*f.dyB+c*f.dyC;if(h>=municipal.height&&h-municipal.height<=1)top=Math.max(top,h);
  }
  probes++;const lift=y-top;maxError=Math.max(maxError,Math.abs(lift-.008));maxBurial=Math.max(maxBurial,-lift);
  if(lift<.0058){buried++;if(failures.length<12)failures.push({id,x,y,z,top,lift});}
 }
 const emittedKinds={};for(const range of state.roadPaintRanges.get(id)||[])if(range.key===`paint:historical:${id}`)emittedKinds[range.kind]=(emittedKinds[range.kind]||0)+1;
 const call=renderCalls.find(c=>String(c.profile.id)===id.split('/')[1].split(':')[0]);
 const baseline=renderHistoricalPaintProfile(call.profile,fixture.index,call.options),baselineKinds={};for(const stroke of baseline.strokes)baselineKinds[stroke.kind]=(baselineKinds[stroke.kind]||0)+1;
 qa.push({id,profile:call.profile,options:call.options,emitted:Array.from(p),eligible:Array.from(Float32Array.from(baseline.positions)),contact:call.result.contact??null,omittedPatches:call.result.contact?.omittedPatches??null});
 const {omittedPatches,...contactSummary}=call.result.contact??{};
 reports.push({id,lowPower,emittedKinds,baselineKinds,contact:contactSummary,baselineTriangles:baseline.positions.length/9,triangles:p.length/9,probes,buried,unsupported,invalidFaces,maxBurial,maxError});
}
console.log(JSON.stringify({reports,failures,sourceGeometryUnchanged:true,municipalEligibilityUnchanged:true},null,2));
if(process.env.HISTORICAL_CONTACT_QA){fs.mkdirSync(process.env.HISTORICAL_CONTACT_QA,{recursive:true});fs.writeFileSync(path.join(process.env.HISTORICAL_CONTACT_QA,lowPower?'historical-low-power.json':'historical-desktop.json'),JSON.stringify({lowPower,reports,profiles:qa}));}
assert.equal(reports.reduce((n,r)=>n+r.unsupported,0),0,'All historical XY remains municipal ROAD-supported');
assert.equal(reports.reduce((n,r)=>n+r.buried,0),0,'Historical paint must remain above actual compatible visible road tops');
assert.ok(reports.every(r=>r.maxError<=.0022),'Final Float32 triangle vertices/interiors retain 8mm lift within2.2mm');
if(process.env.VISIBLE_PAINT_DIAGNOSTIC){
 const diagnostics=[];
 for(const id of targets){
  const segment=local.find(s=>s.lineId===id),profile=segment.historicalPaintProfile;
  const support=state.finalVisiblePaintIndex?.forSource(segment.tags,segment.profile)??fixture.index;
  for(const [i,stroke] of profile.strokes.entries()){
   const last=[],missing=[];let calls=0;
   const traced={sample:(...args)=>{const hit=support.sample(...args);calls++;last.push({x:args[0],z:args[1],height:hit?.height??null});if(last.length>12)last.shift();if(!hit&&missing.length<3)missing.push(last.at(-1));return hit;}};
   const result=renderHistoricalPaintProfile({...profile,strokes:[stroke]},traced,{referenceHeight:segment.aY});
   if(!result.reviewed)diagnostics.push({id,stroke:i,kind:stroke.kind,from:stroke.points[0].station,to:stroke.points.at(-1).station,calls,reason:missing.length?'missing-or-conflicting-support':'height-refinement-or-Float32-limit',missing,last});
  }
 }
 fs.writeFileSync(process.env.VISIBLE_PAINT_DIAGNOSTIC,JSON.stringify(diagnostics,null,2));
 console.log('OMITTED_STROKES',JSON.stringify(diagnostics.map(({last,missing,...d})=>d)));
}
// Explicit ownership and stacked-deck challenges use real Float32 triangle meshes.
const profiles=[...targets].map(id=>({id,profile:local.find(s=>s.lineId===id).historicalPaintProfile,tags:local.find(s=>s.lineId===id).tags,road:local.find(s=>s.lineId===id).profile}));
const options={THREE,roadGroup,segments:local,roadPaintRanges:state.roadPaintRanges,generatedRoadMeshes,bounds:[fixture.bounds]};
for(const layer of ['road_surfaces','parking_surfaces']){
 const absent=new RenderedPavementIndex();
 // Keep the municipal index nonempty: otherwise mapped arrows legitimately use
 // their separate default-lite fallback, which historical profiles never may.
 if(layer==='road_surfaces')absent.addTriangle(0,0,0,2,0,0,0,0,2,{layer});
 else for(const t of fixture.triangles.filter(t=>t.metadata.layer==='road_surfaces'))absent.addTriangle(...t.vertices,{layer});
 const support=selectMappedArrowSupportIndex({...options,municipalIndex:absent});
 for(const p of profiles){const emitted=renderHistoricalPaintProfile(p.profile,support.forSource?.(p.tags,p.road)??support);assert.equal(emitted.reviewed,false,`${layer}: ribbons cannot create historical XY eligibility`);}
}
for(const lift of [.2,5]){
 const group=new THREE.Group(),meshes=new Map(),ranges=new Map(),bridgeSegments=[];
 for(const [i,original] of fixture.group.children.filter(m=>m.userData.layer==='road_surfaces').entries()){
  const geometry=original.geometry.clone(),positions=geometry.attributes.position.array;
  for(let j=1;j<positions.length;j+=3)positions[j]+=lift;
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.userData={type:'road-surface-batch',material:'roadBridge'};group.add(mesh);
  const key=`synthetic-bridge-${i}`,id=`way/bridge-${i}`;meshes.set(key,mesh);ranges.set(id,[{key,startVertex:0,vertexCount:positions.length/3}]);
  bridgeSegments.push({lineId:id,bridge:true,profile:{bridge:true},tags:{highway:'secondary',bridge:'yes',layer:'1'}});
 }
 const support=selectMappedArrowSupportIndex({THREE,municipalIndex:fixture.index,roadGroup:group,segments:bridgeSegments,roadPaintRanges:ranges,generatedRoadMeshes:meshes,bounds:[fixture.bounds]});
 for(const p of profiles){
  const emitted=renderHistoricalPaintProfile(p.profile,support.forSource?.(p.tags,p.road)??support);
  assert.equal(emitted.reviewed,lift>1,`bridge at +${lift} m must ${lift>1?'remain a separate deck':'fail closed without jumping'} `);
  for(let i=0;i<emitted.positions.length;i+=3){const [x,y,z]=emitted.positions.slice(i,i+3);const hit=fixture.index.sample(x,z,y,{includeParking:false,includeBridges:false});assert.ok(Math.abs(y-hit.height-.008)<=.0022);}
 }
}
assert.equal(geometryHash(),sourceGeometry);assert.equal(JSON.stringify(lines),sourceLines);
console.log(JSON.stringify({lowPower,offFootprintAndParkingOmission:true,nearBridgeConflictOmission:true,separateBridgeNoJump:true,sourceImmutability:true}));

assert.ok(reports.find(r=>r.id==='way/250811912:0').emittedKinds.solid>=2,'Hospital shared-turn appearance retains both solid borders');
assert.ok(reports.find(r=>r.id==='way/250811912:0').emittedKinds.dash>0,'Hospital shared-turn appearance retains dashed interiors');
assert.ok(reports.find(r=>r.id==='way/250810393:0').emittedKinds.solid>=3,'Medical taper retains its three boundary strokes/ranges');
assert.ok(reports.find(r=>r.id==='way/250810393:0').emittedKinds.hatch>0,'Medical taper retains generalized hatches');
