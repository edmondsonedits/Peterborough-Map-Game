/** Actual renderer-function fixture for default-lite arrow support. No municipal
 * index is populated. Terrain comes from packaged lidar; water recess/browser
 * startup are not reproduced. Real bridge lifts, ribbons and cap builders run. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createHospitalSurfaceFixture} from './hospital-surface-fixture.mjs';
import {roadRibbonCrossSections,resampleRoadLine,reconcileRoadNetworkElevations} from '../city-explorer/road-network.js';
import {captureBatchLengths,collectBatchRanges} from '../city-explorer/editor/feature-batch-binding.js';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
import {mappedTurnLaneGroups} from '../city-explorer/city-detail-rules.js';
import {mappedArrowLaneOffsets,mappedArrowTriangles,drapeMappedArrowTriangles,mappedArrowSupport} from '../city-explorer/mapped-arrow-paint.js';
import {selectMappedArrowSupportIndex} from '../city-explorer/fallback-arrow-support.js';
const app=fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
const fn=name=>{const match=app.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'));assert.ok(match,`real app ${name}`);return match[0];};
const lowPower=!process.argv.includes('--desktop'),fixture=createHospitalSurfaceFixture({lowPower,halfWidth:0,reconcile:false});
const source=new Map(JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url))).elements.filter(w=>w.type==='way').map(w=>[w.id,w]));
const lines=fixture.roadLines.map(line=>({...line,id:`way/${line.id}:0`,samples:resampleRoadLine(source.get(line.id).geometry.map(p=>fixture.project(p.lat,p.lon)),line.tags,fixture.terrainHeight,lowPower)}));
const roadGroup=new THREE.Group(),streetscapeGroup=new THREE.Group(),generatedRoadMeshes=new Map(),document={documentElement:{dataset:{}}};
const state={objectCount:0,renderedPavementIndex:new RenderedPavementIndex(),roadPaintRanges:new Map(),fallbackJunctionSurfaceIndex:null};
const municipalIdentity=state.renderedPavementIndex,materials={roadPaintWhite:new THREE.MeshBasicMaterial()};
for(const line of lines)for(const key of [line.profile.surfaceKey,line.profile.edgeKey])materials[key] ||=new THREE.MeshBasicMaterial();
const env={THREE,state,roadGroup,streetscapeGroup,generatedRoadMeshes,document,materials,RenderedPavementIndex,
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
for(const line of lines){
 const starts=captureBatchLengths(batches);render.appendRoadRibbon(line,batches);state.roadPaintRanges.set(line.id,collectBatchRanges(batches,starts));
 for(let i=1;i<line.samples.length;i++){
  const a=line.samples[i-1],b=line.samples[i];segments.push({a:new THREE.Vector2(a.x,a.y),b:new THREE.Vector2(b.x,b.y),aY:a.height,bY:b.height,
   aSourceVertex:a.sourceVertex,bSourceVertex:b.sourceVertex,aLineEndpoint:i===1,bLineEndpoint:i===line.samples.length-1,
   chainStart:a.distance,lineLength:line.samples.at(-1).distance,lineId:line.id,tags:line.tags,profile:line.profile,width:line.profile.width,bridge:line.profile.bridge});
 }
}
render.buildBufferedRoadBatches(batches);render.buildRoadJunctions(segments);
const geometryHash=()=>{const hash=createHash('sha256');for(const mesh of roadGroup.children)hash.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));return hash.digest('hex');};
const sourceGeometry=geometryHash(),gameplayCapIndex=state.fallbackJunctionSurfaceIndex;
const candidates=lines.reduce((n,line)=>n+mappedTurnLaneGroups(line.tags,line.profile).reduce((k,g)=>k+g.symbols.filter(Boolean).length,0),0);
function runner(select){return Function(...Object.keys(env),'selectMappedArrowSupportIndex',fn('setRoadQuaternion')+'\n'+fn('buildMappedTurnArrows')+';return buildMappedTurnArrows')(...Object.values(env),select);}
runner(()=>state.renderedPavementIndex)(segments);
assert.equal(Number(document.documentElement.dataset.mappedTurnArrows),0,'Reproduce broken municipal-only default-lite path');
let support;const started=performance.now();runner(options=>(support=selectMappedArrowSupportIndex(options)))(segments);const buildMilliseconds=performance.now()-started;
assert.equal(state.renderedPavementIndex,municipalIdentity);assert.equal(state.renderedPavementIndex.triangleCount,0);
assert.equal(state.fallbackJunctionSurfaceIndex,gameplayCapIndex);assert.equal(geometryHash(),sourceGeometry,'Paint support must not mutate rendered roads or driving geometry');
let triangles=0,probes=0,maxError=0,unsupported=0,nonUpward=0;const omissions=[];
for(const line of lines){
 const expected=mappedTurnLaneGroups(line.tags,line.profile).reduce((n,g)=>n+g.symbols.filter(Boolean).length,0);if(!expected)continue;
 const ranges=state.roadPaintRanges.get(line.id).filter(r=>generatedRoadMeshes.get(r.key)?.userData.type==='mapped-turn-arrows');
 if(ranges.length<expected)omissions.push({lineId:line.id,candidates:expected,emitted:ranges.length,bridge:line.profile.bridge});
 for(const range of ranges){
  const p=generatedRoadMeshes.get(range.key).geometry.attributes.position.array;
  for(let i=range.startVertex*3;i<(range.startVertex+range.vertexCount)*3;i+=9){
   if((p[i+5]-p[i+2])*(p[i+6]-p[i])-(p[i+3]-p[i])*(p[i+8]-p[i+2])<=0)nonUpward++;
   const points=[Array.from(p.slice(i,i+3)),Array.from(p.slice(i+3,i+6)),Array.from(p.slice(i+6,i+9))];
   for(const [a,b]of[[0,1],[1,2],[2,0]])points.push([0,1,2].map(axis=>(points[a][axis]+points[b][axis])/2));
   points.push([0,1,2].map(axis=>(p[i+axis]+p[i+3+axis]+p[i+6+axis])/3));
   for(const [x,y,z]of points){const h=mappedArrowSupport(support.forSource(line.tags,line.profile),x,z,y-.008,line.tags,line.profile);probes++;if(!Number.isFinite(h)){unsupported++;continue;}maxError=Math.max(maxError,Math.abs(y-h-.008));}
   triangles++;
  }
 }
}
const emitted=Number(document.documentElement.dataset.mappedTurnArrows),report={profile:lowPower?'default-lite-mobile':'lite-desktop',sourceWays:lines.length,
 candidates,baselineMunicipalOnlyEmitted:0,emitted,omissions,triangles,probes,unsupported,nonUpward,maxLiftErrorMetres:maxError,
 boundedSupportTriangles:support.triangleCount,buildMilliseconds,bridgeStats:state.roadBridgeStats,municipalIndexUnchanged:true,gameplayIndexUnchanged:true,
 limitations:['Actual Three.js renderer builders and source geometry; not a browser startup/frame-rate measurement','Packaged lidar terrain fixture omits water recess','Seven finite probes per emitted triangle cannot prove absence of arbitrarily microscopic gaps']};
console.log(JSON.stringify(report,null,2));
if(process.env.FALLBACK_ARROW_REPORT)fs.writeFileSync(process.env.FALLBACK_ARROW_REPORT,JSON.stringify(report,null,2)+'\n');
assert.ok(candidates>0);assert.equal(emitted,candidates,'Current full-source fixture supports every validated mapped candidate');assert.deepEqual(omissions,[]);assert.equal(unsupported,0);assert.equal(nonUpward,0);assert.ok(maxError<=.0022);

// Independent visible-top check from the actual GPU mesh attributes, without the new helper's ranges or cap selection logic.
const raw=new RenderedPavementIndex(), windows=[];
for(const ranges of state.roadPaintRanges.values())for(const r of ranges){const mesh=generatedRoadMeshes.get(r.key);if(mesh?.userData.type!=='mapped-turn-arrows')continue;
 const p=mesh.geometry.attributes.position.array;let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(let i=r.startVertex*3;i<(r.startVertex+r.vertexCount)*3;i+=3){minX=Math.min(minX,p[i]);maxX=Math.max(maxX,p[i]);minZ=Math.min(minZ,p[i+2]);maxZ=Math.max(maxZ,p[i+2]);}windows.push([minX,minZ,maxX,maxZ]);}
const append=(mesh,matrix)=>{const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
 for(let i=0;i<(ix?.count??p.count);i+=3){const v=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(matrix));
 if(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).y<=1e-10)continue;
 const xs=v.map(p=>p.x),zs=v.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
 if(!windows.some(b=>b[0]<=maxX&&b[2]>=minX&&b[1]<=maxZ&&b[3]>=minZ))continue;
 raw.addTriangle(...v.flatMap(p=>p.toArray()),{layer:'road_surfaces'});
 }};
for(const mesh of roadGroup.children){if(mesh.userData.type==='road-surface-batch')append(mesh,mesh.matrixWorld);else if(mesh.userData.type==='road-junction-surfaces')for(let i=0;i<mesh.count;i++){const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);append(mesh,new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld,m));}}
let covered=0,missing=0,hidden=0,maximumBurial=0;const worst=[];
for(const ranges of state.roadPaintRanges.values())for(const r of ranges){const mesh=generatedRoadMeshes.get(r.key);if(mesh?.userData.type!=='mapped-turn-arrows')continue;
 const p=mesh.geometry.attributes.position.array;for(let i=r.startVertex*3;i<(r.startVertex+r.vertexCount)*3;i+=9){
 for(const w of [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]){
 const [x,y,z]=[0,1,2].map(a=>p[i+a]*w[0]+p[i+3+a]*w[1]+p[i+6+a]*w[2]);
 let highest=-Infinity;for(const face of raw.cells.get(`${Math.floor(x/raw.cellSize)}:${Math.floor(z/raw.cellSize)}`)||[]){const dx=x-face.ax,dz=z-face.az,b=(dx*face.vz-dz*face.vx)*face.inverse,c=(face.ux*dz-face.uz*dx)*face.inverse;if(b< -1e-8||c< -1e-8||b+c>1+1e-8)continue;const h=face.ay+b*face.dyB+c*face.dyC;if(Math.abs(h-(y-.008))<.25)highest=Math.max(highest,h);}
 if(!Number.isFinite(highest)){missing++;continue;}covered++;const lift=y-highest;maximumBurial=Math.max(maximumBurial,-lift);if(lift<.0058){hidden++;if(worst.length<6)worst.push({x,y,z,lift});}
 }}}
console.log(JSON.stringify({independentActualVisibleTop:{rawFaces:raw.triangleCount,covered,missing,hidden,maximumBurial,worst}},null,2));
assert.equal(missing,0);assert.equal(hidden,0);
