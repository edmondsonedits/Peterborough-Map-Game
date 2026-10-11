/** Actual municipal plus still-rendered OSM ribbon regression. Both power
 * profiles and both mapped compound sites are supported via --desktop/--south.
 * Actual builders and Float32 buffers; water recess/browser pixels are omitted. */
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
const lowPower=!process.argv.includes('--desktop'),fixture=createHospitalSurfaceFixture({lowPower,...(process.argv.includes('--south')?{center:{lat:44.2722,lon:-78.3412},reconcile:false}:{})});
const source=new Map(JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url))).elements.filter(w=>w.type==='way').map(w=>[w.id,w]));
const lines=fixture.roadLines.map(line=>({...line,id:`way/${line.id}:0`,samples:resampleRoadLine(source.get(line.id).geometry.map(p=>fixture.project(p.lat,p.lon)),line.tags,fixture.terrainHeight,lowPower)}));
const roadGroup=new THREE.Group(),streetscapeGroup=new THREE.Group(),generatedRoadMeshes=new Map(),document={documentElement:{dataset:{}}};
const state={objectCount:0,renderedPavementIndex:fixture.index,roadPaintRanges:new Map(),fallbackJunctionSurfaceIndex:null};
const municipalIdentity=state.renderedPavementIndex,materials={roadPaintWhite:new THREE.MeshBasicMaterial()};
for(const line of lines)for(const key of [line.profile.surfaceKey,line.profile.edgeKey])materials[key] ||=new THREE.MeshBasicMaterial();
const env={THREE,state,roadGroup,streetscapeGroup,generatedRoadMeshes,document,materials,RenderedPavementIndex,
 terrainHeightAtWorld:fixture.terrainHeight,lowPowerProfile:lowPower,roadRibbonCrossSections,
 roadRenderTileCoordinates:(x,z)=>({x:Math.floor(x/3600),z:Math.floor(z/3600)}),ROAD_RENDER_TILE_SIZE:3600,
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
render.buildBufferedRoadBatches(batches);

let support,indexMilliseconds;
const run=Function(...Object.keys(env),'selectMappedArrowSupportIndex',fn('setRoadQuaternion')+'\n'+fn('buildMappedTurnArrows')+';return buildMappedTurnArrows')(...Object.values(env),options=>((()=>{const start=performance.now();const result=process.argv.includes('--municipal-only-ablation')?options.municipalIndex:selectMappedArrowSupportIndex(options);indexMilliseconds=performance.now()-start;return support=result;})()));
const started=performance.now();run(segments);const buildMilliseconds=performance.now()-started;
const target=process.argv.includes('--south')?'way/364843830:0':'way/1414147320:0';
const targetLine=lines.find(line=>line.id===target),ranges=state.roadPaintRanges.get(target).filter(r=>generatedRoadMeshes.get(r.key)?.userData.type==='mapped-turn-arrows');
assert.ok(ranges.length>=2,'both requested compound-site lane arrows must emit');
const raw=new RenderedPavementIndex();
for(const mesh of roadGroup.children){if(mesh.userData.type!=='road-surface-batch')continue;const p=mesh.geometry.attributes.position.array;for(let i=0;i<p.length;i+=9)raw.addTriangle(...p.slice(i,i+9),{layer:'road_surfaces'});}
let probes=0,hidden=0,unsupported=0,maxError=0,triangles=0;
for(const range of ranges){const p=generatedRoadMeshes.get(range.key).geometry.attributes.position.array;
 for(let i=range.startVertex*3;i<(range.startVertex+range.vertexCount)*3;i+=9){triangles++;
 for(const w of [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]){
 const [x,y,z]=[0,1,2].map(a=>p[i+a]*w[0]+p[i+3+a]*w[1]+p[i+6+a]*w[2]);
 const eligible=mappedArrowSupport(fixture.index,x,z,y-.008,targetLine.tags,targetLine.profile);if(!Number.isFinite(eligible)){unsupported++;continue;}
 let highest=eligible;
 for(const index of [raw,fixture.index])for(const f of index.cells.get(`${Math.floor(x/index.cellSize)}:${Math.floor(z/index.cellSize)}`)||[]){
 const dx=x-f.ax,dz=z-f.az,b=(dx*f.vz-dz*f.vx)*f.inverse,c=(f.ux*dz-f.uz*dx)*f.inverse;
 if(b< -1e-8||c< -1e-8||b+c>1+1e-8)continue;const h=f.ay+b*f.dyB+c*f.dyC;if(Math.abs(h-eligible)<=1)highest=Math.max(highest,h);
 }
 probes++;const lift=y-highest;if(lift<.0058)hidden++;maxError=Math.max(maxError,Math.abs(lift-.008));
 }}}
const report={lowPower,target,ranges:ranges.length,triangles,probes,hidden,unsupported,maxError,indexMilliseconds,buildMilliseconds,municipalOnlyAblation:process.argv.includes('--municipal-only-ablation')};console.log(JSON.stringify(report,null,2));
assert.equal(hidden,0,'paint must clear actual combined municipal and ribbon tops');assert.equal(unsupported,0);assert.ok(maxError<=.0022);
