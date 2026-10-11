import {reconcileStationPavement} from '../city-explorer/station-pavement-layer.js';
/** Approximate full-source CPU/buffer benchmark independently authored in review.
 * This is not browser startup/frame-rate or peak incremental paint memory proof.
 * --desktop selects desktop terrain; --municipal-only-ablation selects the old
 * support path (supply an old historical helper explicitly for exact ablation).
 */
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
const lowPower=!process.argv.includes('--desktop'),fixture=createHospitalSurfaceFixture({lowPower,halfWidth:20000,reconcile:false});
const station=fixture.project(44.3010,-78.32212);
reconcileStationPavement({THREE,group:fixture.group,polygons:fixture.polygons,center:{x:station.x,z:station.y},terrainHeight:fixture.terrainHeight,roadIndex:fixture.roadIndex,Index:RenderedPavementIndex});
const hospital=reconcileStationPavement({THREE,group:fixture.group,polygons:fixture.polygons,center:fixture.center,terrainHeight:fixture.terrainHeight,roadIndex:fixture.roadIndex,Index:RenderedPavementIndex,radius:120,heightSmoothing:4});
fixture.index=hospital.index;
const source=new Map(JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url))).elements.filter(w=>w.type==='way').map(w=>[w.id,w]));
const lines=fixture.roadLines.map(line=>({...line,id:`way/${line.id}:0`,samples:resampleRoadLine(source.get(line.id).geometry.map(p=>fixture.project(p.lat,p.lon)),line.tags,fixture.terrainHeight,lowPower)}));
const roadGroup=fixture.group,streetscapeGroup=new THREE.Group(),generatedRoadMeshes=new Map(),document={documentElement:{dataset:{}}};
const state={objectCount:0,renderedPavementIndex:fixture.index,roadSurfaceIndex:fixture.roadIndex,roadPaintRanges:new Map(),fallbackJunctionSurfaceIndex:null};
const municipalIdentity=state.renderedPavementIndex,materials={roadPaintWhite:new THREE.MeshBasicMaterial(),roadPaintYellow:new THREE.MeshBasicMaterial()};
for(const line of lines)for(const key of [line.profile.surfaceKey,line.profile.edgeKey])materials[key] ||=new THREE.MeshBasicMaterial();
let indexMilliseconds=0;
const measuredSelect=(...args)=>{const s=performance.now();const r=process.argv.includes('--municipal-only-ablation')?args[0].municipalIndex:selectMappedArrowSupportIndex(...args);indexMilliseconds+=performance.now()-s;return r;};
const env={historicalPaintProfile,renderHistoricalPaintProfile,selectMappedArrowSupportIndex:measuredSelect,roadProfile,laneCountFor,mappedCycleLaneSides,roadLaneMarkingBoundaries,reviewedPaintTags,drapePaintStrip:()=>[],THREE,state,roadGroup,streetscapeGroup,generatedRoadMeshes,document,materials,RenderedPavementIndex,
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
const local=segments;
const run=Function(...Object.keys(env),fn('buildRoadMarkings')+';return buildRoadMarkings')(...Object.values(env));
const phaseStart=performance.now(),cpuStart=process.cpuUsage();run(local);const historicalAndStubbedGenericMilliseconds=performance.now()-phaseStart;
const arrowRun=Function(...Object.keys(env),fn('setRoadQuaternion')+'\n'+fn('buildMappedTurnArrows')+';return buildMappedTurnArrows')(...Object.values(env));
const arrowStart=performance.now();arrowRun(segments);const arrowMilliseconds=performance.now()-arrowStart,cpu=process.cpuUsage(cpuStart);
const meshes=[...generatedRoadMeshes.values()].filter(m=>['historical-road-paint','mapped-turn-arrows'].includes(m.userData.type));
console.log(JSON.stringify({lowPower,municipalOnlyAblation:process.argv.includes('--municipal-only-ablation'),sourceWays:lines.length,segments:segments.length,municipalTriangles:fixture.index.triangleCount,boundedFallbackFaces:state.finalVisiblePaintIndex?.triangleCount,
indexMilliseconds,historicalAndStubbedGenericMilliseconds,arrowMilliseconds,cpuMilliseconds:(cpu.user+cpu.system)/1000,mappedArrowBuild:state.mappedArrowBuild,
historical:meshes.filter(m=>m.userData.type==='historical-road-paint').map(m=>({lineId:m.userData.lineId,triangles:m.geometry.attributes.position.count/3})),
historicalContact:state.historicalPaintContact,
paintBufferBytes:meshes.reduce((n,m)=>n+Object.values(m.geometry.attributes).reduce((s,a)=>s+a.array.byteLength,0),0),peakRssBytes:process.resourceUsage().maxRSS*1024,
limitations:['Approximate full-source municipal fixture omits global bridge lifts and water recess in municipal heights; actual OSM bridge lifts/ribbons are built','Generic paint draping stubbed, so this measures historical/support/arrow work, not complete paint or browser startup','CPU Node only; RSS is entirefixtureprocess not incrementalpaint/browsermemory']},null,2));
