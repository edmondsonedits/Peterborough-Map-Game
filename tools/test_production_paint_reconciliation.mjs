/** Actual production-order paint regression: OSM buffers exist before the real
 * buildOfficialRoadSurfaces orchestrator builds municipal geometry and calls
 * Station, then Hospital reconciliation. Original feature geometries intersecting
 * the four paint sites + Station are selected unchanged. Buildings/curbs and
 * water recess are out of scope; paint oracle includes road foundations.
 * Candidate and metadata-free control transforms must match byte-for-byte.
 * Run default low-power or --desktop. PRODUCTION_PAINT_ROOT selects candidate.
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
const root=process.env.PRODUCTION_PAINT_ROOT?pathToFileURL(path.resolve(process.env.PRODUCTION_PAINT_ROOT)+'/'):new URL('../',import.meta.url);
const {selectMappedArrowSupportIndex}=await import(new URL('city-explorer/fallback-arrow-support.js',root));
const {reconcileStationPavement:reconcileCandidate}=await import(new URL('city-explorer/station-pavement-layer.js',root));
import {reconcileStationPavement as reconcileControl} from '../city-explorer/station-pavement-layer.js';
import {OfficialDrivableSurfaceIndex,officialSurfaceStatusActive,officialBridgeIsVehicular} from '../city-explorer/official-road-surfaces.js';
import {officialRoadMeshEdgeLength} from '../city-explorer/citywide-road-quality.js';
import {geometryPolygons} from '../city-explorer/feature-utils.js';
import {roadProfile,laneCountFor,ROAD_SURFACE_CLEARANCE,RoadSurfaceIndex} from '../city-explorer/road-network.js';
import {reviewedPaintTags} from '../city-explorer/street-paint.js';
import {mappedCycleLaneSides,roadLaneMarkingBoundaries} from '../city-explorer/city-detail-rules.js';
const {historicalPaintProfile,renderHistoricalPaintProfile}=await import(new URL('city-explorer/historical-paint-profiles.js',root));
const app=fs.readFileSync(new URL('city-explorer/app.js',root),'utf8');
const fn=name=>{const match=app.match(new RegExp('^(?:async )?function '+name+'\\([^]*?^\\}','m'));assert.ok(match,`real app ${name}`);return match[0];};
const fullNetwork=process.argv.includes('--full-network');
const lowPower=!process.argv.includes('--desktop'),fixture=createHospitalSurfaceFixture({lowPower,halfWidth:0,reconcile:false});
const source=new Map(JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url))).elements.filter(w=>w.type==='way').map(w=>[w.id,w]));
const lines=fixture.roadLines.map(line=>({...line,id:`way/${line.id}:0`,samples:resampleRoadLine(source.get(line.id).geometry.map(p=>fixture.project(p.lat,p.lon)),line.tags,fixture.terrainHeight,lowPower)}));
const roadGroup=new THREE.Group(),streetscapeGroup=new THREE.Group(),generatedRoadMeshes=new Map(),document={documentElement:{dataset:{}}};
const state={objectCount:0,renderedPavementIndex:new RenderedPavementIndex(),roadPaintRanges:new Map(),fallbackJunctionSurfaceIndex:null,officialRoadSurfacesAvailable:true,roadSurfaceIndex:fixture.roadIndex};
const municipalIdentity=state.renderedPavementIndex,materials={roadPaintWhite:new THREE.MeshBasicMaterial(),roadPaintYellow:new THREE.MeshBasicMaterial(),officialRoad:new THREE.MeshBasicMaterial(),bridge:new THREE.MeshBasicMaterial(),parking:new THREE.MeshBasicMaterial()};
for(const line of lines)for(const key of [line.profile.surfaceKey,line.profile.edgeKey])materials[key] ||=new THREE.MeshBasicMaterial();
const manifest=JSON.parse(fs.readFileSync(new URL('../city-explorer/data/manifest.json',import.meta.url)));
const corners=[fixture.project(manifest.bbox.south,manifest.bbox.west),fixture.project(manifest.bbox.north,manifest.bbox.east)];
const CITY={worldBounds:{minX:Math.min(...corners.map(p=>p.x))-520,minZ:Math.min(...corners.map(p=>p.y))-520}};
const roadRenderTileCoordinates=Function('CITY','ROAD_RENDER_TILE_SIZE',fn('roadRenderTileCoordinates')+';return roadRenderTileCoordinates')(CITY,3600);
const batchMeshKey=Function('const batchSetIds=new WeakMap();let nextBatchSetId=1;'+fn('batchSetId')+fn('batchMeshKey')+';return batchMeshKey')();
const reconciliationChecks=[];
const originalRanges=new Map();
function reconcileStationPavement(options){
 console.error(`Reconcile ${JSON.stringify(options.center)} started`);
 if(fullNetwork){const start=performance.now();const result=reconcileCandidate(options);reconciliationChecks.push({center:options.center,candidateMilliseconds:performance.now()-start,controlSkipped:true,hadSourceRanges:options.sourceRanges instanceof Map});return result;}
 const clone=options.group.clone(true);for(const mesh of clone.children)if(mesh.geometry)mesh.geometry=mesh.geometry.clone();
 const controlStart=performance.now();reconcileControl({...options,group:clone,sourceRanges:undefined});const controlMilliseconds=performance.now()-controlStart;
 const candidateStart=performance.now();const result=reconcileCandidate(options);const candidateMilliseconds=performance.now()-candidateStart;
 assert.equal(clone.children.length,options.group.children.length);
 for(let i=0;i<clone.children.length;i++){
  const a=clone.children[i].geometry?.attributes?.position?.array,b=options.group.children[i].geometry?.attributes?.position?.array;
  if(a&&b)assert.deepEqual(Buffer.from(a.buffer,a.byteOffset,a.byteLength),Buffer.from(b.buffer,b.byteOffset,b.byteLength),'provenance repair must leave final GPU geometry byte-identical');
 }
 reconciliationChecks.push({center:options.center,radius:options.radius??240,byteIdentical:true,controlMilliseconds,candidateMilliseconds,hadSourceRanges:options.sourceRanges instanceof Map});
 return result;
}
let indexMilliseconds=0,indexBuilds=0;
const timedSupport=options=>{const start=performance.now();const index=selectMappedArrowSupportIndex(options);indexMilliseconds+=performance.now()-start;indexBuilds++;return index;};
const env={reconcileStationPavement,OfficialDrivableSurfaceIndex,officialSurfaceStatusActive,officialBridgeIsVehicular,officialRoadMeshEdgeLength,geometryPolygons,ROAD_SURFACE_CLEARANCE,
 propertyValue:(properties,key)=>Object.entries(properties).find(([k])=>k.toLowerCase()===key.toLowerCase())?.[1],
 project:(lat,lon)=>{const p=fixture.project(lat,lon);return new THREE.Vector2(p.x,p.y);},CITY_ROAD_MESH_LEGACY:false,pavementQA:null,
 createBuildingBufferBatches:()=>new Map(),buildBufferedBuildingBatches:()=>{},buildOfficialCurbRibbons:()=>{},setProgress:()=>{},nextFrame:async()=>{},
 historicalPaintProfile,renderHistoricalPaintProfile,selectMappedArrowSupportIndex:timedSupport,roadProfile,laneCountFor,mappedCycleLaneSides,roadLaneMarkingBoundaries,reviewedPaintTags,drapePaintStrip:()=>[],THREE,state,roadGroup,streetscapeGroup,generatedRoadMeshes,document,materials,RenderedPavementIndex,
 terrainHeightAtWorld:fixture.terrainHeight,lowPowerProfile:lowPower,roadRibbonCrossSections,
 roadRenderTileCoordinates,ROAD_RENDER_TILE_SIZE:3600,
 batchMeshKey,attachRoadInstance:()=>{},solveFallbackJunctions:()=>null,URLSearchParams,location:{search:''},
 mappedTurnLaneGroups,mappedArrowLaneOffsets,mappedArrowTriangles,drapeMappedArrowTriangles,mappedArrowSupport,
 worldUp:new THREE.Vector3(0,1,0),roadSide:new THREE.Vector3(),roadSurfaceNormal:new THREE.Vector3(),roadBasis:new THREE.Matrix4()};
const names=['roadBatchPositions','appendRoadTriangle','roadRibbonSides','roadEndpointKey','smoothStep01','planarSegmentIntersection',
 'buildRoadClearanceIndex','bridgeClearanceLift','applyBridgeElevationProfiles','appendRoadRibbon','buildBufferedRoadBatches','roadProfilePriority','buildRoadJunctions'];
const render=Function(...Object.keys(env),names.map(fn).join('\n')+';return {applyBridgeElevationProfiles,appendRoadRibbon,buildBufferedRoadBatches,buildRoadJunctions}')(...Object.values(env));
render.applyBridgeElevationProfiles(lines);reconcileRoadNetworkElevations(lines);
const batches=new Map(),segments=[];
const historicalIds=new Set(['way/250810393:0','way/250811912:0']);
for(const line of lines){
 const way=source.get(Number(line.id.split('/')[1].split(':')[0]));
 const historical=historicalIds.has(line.id)?historicalPaintProfile(way.geometry.map(p=>fixture.project(p.lat,p.lon)),line.tags,line.id):null;
 const starts=captureBatchLengths(batches);render.appendRoadRibbon(line,batches);state.roadPaintRanges.set(line.id,collectBatchRanges(batches,starts).map(range=>({...range,key:batchMeshKey(batches,range.key)})));
 for(let i=1;i<line.samples.length;i++){
  const a=line.samples[i-1],b=line.samples[i];segments.push({a:new THREE.Vector2(a.x,a.y),b:new THREE.Vector2(b.x,b.y),aY:a.height,bY:b.height,
   aSourceVertex:a.sourceVertex,bSourceVertex:b.sourceVertex,aLineEndpoint:i===1,bLineEndpoint:i===line.samples.length-1,
   historicalPaintProfile:historical,chainStart:a.distance,lineLength:line.samples.at(-1).distance,lineId:line.id,tags:line.tags,profile:line.profile,width:line.profile.width,bridge:line.profile.bridge});
 }
}
render.buildBufferedRoadBatches(batches);
state.roadSurfaceIndex=new RoadSurfaceIndex();state.roadSurfaceIndex.addAll(segments);

for(const [id,ranges] of state.roadPaintRanges)originalRanges.set(id,ranges.slice());
const collection=JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-road-surfaces.geojson',import.meta.url)));
const windows=[];
for(const id of [250810393,250811912,1414147320,364843830]){const points=source.get(id).geometry.map(p=>fixture.project(p.lat,p.lon));windows.push([Math.min(...points.map(p=>p.x))-280,Math.min(...points.map(p=>p.y))-280,Math.max(...points.map(p=>p.x))+280,Math.max(...points.map(p=>p.y))+280]);}
const station=fixture.project(44.3010,-78.32212);windows.push([station.x-280,station.y-280,station.x+280,station.y+280]);
collection.features=collection.features.filter(f=>['road_surfaces','parking_surfaces','bridges'].includes(f.properties.ptbo_layer)&&(fullNetwork||geometryPolygons(f).some(poly=>{const pts=poly[0].map(([lon,lat])=>fixture.project(lat,lon)),b=[Math.min(...pts.map(p=>p.x)),Math.min(...pts.map(p=>p.y)),Math.max(...pts.map(p=>p.x)),Math.max(...pts.map(p=>p.y))];return windows.some(w=>w[0]<=b[2]&&w[2]>=b[0]&&w[1]<=b[3]&&w[3]>=b[1]);})));
const officialNames=['polygonCentroid','coordinatesToLandRing','cleanRing','officialRoadHeightAt','cachedOfficialRoadHeightAt','appendDrapedOfficialRoadTriangle','appendOfficialRoadPolygon','roadBatchPositions','appendRoadTriangle','buildBufferedRoadBatches','buildOfficialRoadSurfaces'];
console.error(`Building ${collection.features.length} municipal features, ${lowPower?'low-power':'desktop'}`);
const officialStarted=performance.now();
await Function(...Object.keys(env),officialNames.map(fn).join('\n')+';return buildOfficialRoadSurfaces')(...Object.values(env))(collection);
const officialMillisecondsWithControl=performance.now()-officialStarted;
assert.equal(reconciliationChecks.length,2,'execute actual production Station then Hospital orchestration');
assert.ok(reconciliationChecks.every(c=>c.hadSourceRanges),'actual app passes source range objects through both transformations');
let remapped=0;
for(const [id,ranges] of originalRanges)for(let i=0;i<ranges.length;i++){
 const range=ranges[i],mesh=generatedRoadMeshes.get(range.key);assert.equal(state.roadPaintRanges.get(id)[i],range,'editor binding keeps original range identity');
 assert.equal(range.roadGeometryRevision??0,mesh.userData.roadGeometryRevision??0,'range revision matches transformed actual GPU buffer');
 if(range.roadGeometryRevision>0)remapped++;
 assert.ok(range.startVertex>=0&&range.startVertex+range.vertexCount<=mesh.geometry.attributes.position.count);
}
const hash=()=>{const h=createHash('sha256');for(const mesh of roadGroup.children)h.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));return h.digest('hex');};
const beforePaint=hash(),sourceLines=JSON.stringify(lines),municipal=state.renderedPavementIndex;
const paintNames=['setRoadQuaternion','buildRoadMarkings','buildMappedTurnArrows'];
const painters=Function(...Object.keys(env),paintNames.map(fn).join('\n')+';return {buildRoadMarkings,buildMappedTurnArrows}')(...Object.values(env));
console.error('Building final paint');
const historicalStarted=performance.now();painters.buildRoadMarkings(segments);const historicalMilliseconds=performance.now()-historicalStarted;const arrowsStarted=performance.now();painters.buildMappedTurnArrows(segments);const arrowsMilliseconds=performance.now()-arrowsStarted;
assert.equal(hash(),beforePaint);assert.equal(JSON.stringify(lines),sourceLines);assert.equal(state.renderedPavementIndex,municipal);
const raw=new RenderedPavementIndex();
for(const mesh of roadGroup.children){if(!['road-surface-batch','road-foundation-batch'].includes(mesh.userData.type)&&!mesh.userData.type.startsWith('road-official-'))continue;const p=mesh.geometry.attributes.position.array;for(let i=0;i<p.length;i+=9){const b=[Math.min(p[i],p[i+3],p[i+6]),Math.min(p[i+2],p[i+5],p[i+8]),Math.max(p[i],p[i+3],p[i+6]),Math.max(p[i+2],p[i+5],p[i+8])];if(!windows.some(w=>w[0]<=b[2]&&w[2]>=b[0]&&w[1]<=b[3]&&w[3]>=b[1]))continue;raw.addTriangle(...p.slice(i,i+9),{type:mesh.userData.type,material:mesh.userData.material});}}
const reports=[];
for(const id of ['way/250810393:0','way/250811912:0','way/1414147320:0','way/364843830:0']){
 const ranges=state.roadPaintRanges.get(id).filter(r=>['historical-road-paint','mapped-turn-arrows'].includes(generatedRoadMeshes.get(r.key)?.userData.type));
 assert.ok(ranges.length>=2,`${id} retains requested marking shapes`);let probes=0,buried=0,foundationBuried=0,unsupported=0,maxBurial=0,maxLiftResidual=0,degenerateOrDownward=0;
 const kinds={};for(const range of ranges){kinds[range.kind??generatedRoadMeshes.get(range.key).userData.kind]=(kinds[range.kind??generatedRoadMeshes.get(range.key).userData.kind]||0)+1;const p=generatedRoadMeshes.get(range.key).geometry.attributes.position.array;
 for(let i=range.startVertex*3;i<(range.startVertex+range.vertexCount)*3;i+=9){if((p[i+5]-p[i+2])*(p[i+6]-p[i])-(p[i+3]-p[i])*(p[i+8]-p[i+2])<=0)degenerateOrDownward++;}
 for(let i=range.startVertex*3;i<(range.startVertex+range.vertexCount)*3;i+=9)for(const w of [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]){
  const [x,y,z]=[0,1,2].map(a=>p[i+a]*w[0]+p[i+3+a]*w[1]+p[i+6+a]*w[2]);
  const owned=municipal.sample(x,z,y-.008,{includeParking:!historicalIds.has(id),includeBridges:false});if(!owned){unsupported++;continue;}
  let top=owned.height,kind='municipal';for(const f of raw.cells.get(`${Math.floor(x/raw.cellSize)}:${Math.floor(z/raw.cellSize)}`)||[]){const dx=x-f.ax,dz=z-f.az,b=(dx*f.vz-dz*f.vx)*f.inverse,c=(f.ux*dz-f.uz*dx)*f.inverse;if(b< -1e-8||c< -1e-8||b+c>1+1e-8)continue;const h=f.ay+b*f.dyB+c*f.dyC;if(Math.abs(h-owned.height)<=1&&h>top){top=h;kind=f.metadata.type;}}
  maxLiftResidual=Math.max(maxLiftResidual,Math.abs(y-top-.008));probes++;if(top>y){buried++;maxBurial=Math.max(maxBurial,top-y);if(kind==='road-foundation-batch')foundationBuried++;}
 }}
 reports.push({id,lowPower,kinds,probes,buried,foundationBuried,unsupported,maxBurial,maxLiftResidual,degenerateOrDownward});
}
// A stale revision must not silently reinterpret transformed slices as source
// road or bridge faces. Rebuild the support index with deliberately stale tags.
const savedRevisions=[];
for(const ranges of state.roadPaintRanges.values())for(const range of ranges){const mesh=generatedRoadMeshes.get(range.key);if(mesh?.userData.type!=='road-surface-batch')continue;savedRevisions.push([range,Object.hasOwn(range,'roadGeometryRevision'),range.roadGeometryRevision]);range.roadGeometryRevision=-1;}
const stale=selectMappedArrowSupportIndex({THREE,municipalIndex:municipal,roadGroup,segments,roadPaintRanges:state.roadPaintRanges,generatedRoadMeshes,bounds:windows});
for(const [range,had,value] of savedRevisions){if(had)range.roadGeometryRevision=value;else delete range.roadGeometryRevision;}
let staleFaces=0,misclassifiedStaleFaces=0;
const inspected=new Set();for(const faces of stale.cells?.values()||[])for(const face of faces){if(inspected.has(face))continue;inspected.add(face);if(face.metadata?.unclassifiedSource){staleFaces++;if(face.metadata.lineId||face.metadata.sourceDeck)misclassifiedStaleFaces++;}}
assert.ok(staleFaces>0,'stale current slices are recorded only as unclassified occluders');
assert.equal(misclassifiedStaleFaces,0,'stale slices never regain guessed source road/bridge identity');
let staleRejectedSamples=0,freshSupportedStaleRejected=0;
for(const face of [...inspected].filter(f=>f.metadata?.unclassifiedSource)){const x=face.ax+(face.ux+face.vx)/3,z=face.az+(face.uz+face.vz)/3,y=face.ay+(face.dyB+face.dyC)/3;const hit=stale.forSource({highway:'secondary'},{}).sample(x,z,y,{includeParking:false,includeBridges:false});assert.ok(!hit?.unclassifiedSource,'unclassified face is never a returned eligible paint support');if(!hit){staleRejectedSamples++;if(state.finalVisiblePaintIndex.forSource({highway:'secondary'},{}).sample(x,z,y,{includeParking:false,includeBridges:false}))freshSupportedStaleRejected++;}if(freshSupportedStaleRejected>=10)break;}
assert.ok(freshSupportedStaleRejected>0,'same-XY fresh support becomes rejected only after provenance is made stale');
const mappedCandidates=lines.reduce((sum,line)=>sum+mappedTurnLaneGroups(line.tags,line.profile).reduce((n,g)=>n+g.symbols.filter(Boolean).length,0),0);
const meshPositionBytes=roadGroup.children.reduce((sum,m)=>sum+(m.geometry?.attributes?.position?.array?.byteLength||0),0);
const paintMeshCosts={};for(const mesh of generatedRoadMeshes.values()){if(!['historical-road-paint','mapped-turn-arrows'].includes(mesh.userData.type))continue;const row=paintMeshCosts[mesh.userData.type]??={triangles:0,positionBytes:0};row.triangles+=mesh.geometry.attributes.position.count/3;row.positionBytes+=mesh.geometry.attributes.position.array.byteLength;}
const report={paintMeshCosts,historicalContact:state.historicalPaintContact,lowPower,fullNetwork,indexMilliseconds,indexBuilds,staleRejectedSamples,freshSupportedStaleRejected,roadRenderTileSize:3600,worldBounds:CITY.worldBounds,staleFaces,misclassifiedStaleFaces,officialMillisecondsWithControl,historicalMilliseconds,arrowsMilliseconds,mappedCandidates,emittedMapped:Number(document.documentElement.dataset.mappedTurnArrows),meshPositionBytes,municipalSourceFeatures:collection.features.length,reconciliationChecks,remappedRanges:remapped,reports,unchangedPaintGeometry:true,unchangedSourceProfiles:true};
if(process.env.PRODUCTION_PAINT_GEOMETRY){
 const supportFaces=[...new Set([...municipal.cells.values()].flat())].filter(f=>f.metadata?.layer==='road_surfaces');
 const paint=[];for(const id of historicalIds)for(const range of state.roadPaintRanges.get(id)||[]){const mesh=generatedRoadMeshes.get(range.key);if(mesh?.userData.type==='historical-road-paint')paint.push({id,kind:range.kind,positions:Array.from(mesh.geometry.attributes.position.array.slice(range.startVertex*3,(range.startVertex+range.vertexCount)*3)),contact:mesh.userData.contact});}
 fs.writeFileSync(process.env.PRODUCTION_PAINT_GEOMETRY,JSON.stringify({lowPower,fullNetwork,paint,municipalRoadTriangles:supportFaces.map(f=>[f.ax,f.ay,f.az,f.ax+f.ux,f.ay+f.dyB,f.az+f.uz,f.ax+f.vx,f.ay+f.dyC,f.az+f.vz])}));
}
console.log(JSON.stringify(report,null,2));if(process.env.PRODUCTION_PAINT_REPORT)fs.writeFileSync(process.env.PRODUCTION_PAINT_REPORT,JSON.stringify(report,null,2));
assert.ok(reports.every(r=>r.buried===0&&r.unsupported===0),'Actual-order visible faces including foundations do not bury supported paint');
assert.ok(reports.find(r=>r.id==='way/250811912:0').kinds.solid>=2);assert.ok(reports.find(r=>r.id==='way/250811912:0').kinds.dash>0);

for(const [id,expected] of [['way/250810393:0',{solid:3,hatch:5}],['way/250811912:0',{solid:2,dash:16}]])for(const [kind,count] of Object.entries(expected))assert.equal(reports.find(r=>r.id===id).kinds[kind],count,`${id} retains every historical ${kind}`);
assert.ok(reports.every(r=>r.degenerateOrDownward===0),'Float32 paint triangles remain upward and nondegenerate');
assert.ok(reports.every(r=>r.maxLiftResidual<=.0022),'seven-point final visible top lift residual stays within 2.2 mm');
