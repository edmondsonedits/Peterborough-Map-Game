/** Approximate full packaged-source workload, not final-browser equivalence.
 * The reusable source fixture omits global bridge elevation profiles and water
 * recess. Active-status and vehicular-bridge filters are applied. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createHospitalSurfaceFixture} from './hospital-surface-fixture.mjs';
import {arrowRuntime} from './mapped-arrow-runtime-fixture.mjs';
import {mappedTurnLaneGroups} from '../city-explorer/city-detail-rules.js';
import {reconcileStationPavement} from '../city-explorer/station-pavement-layer.js';
import {RenderedPavementIndex,officialSurfaceStatusActive,officialBridgeIsVehicular} from '../city-explorer/official-road-surfaces.js';
const lowPower=process.argv.includes('--low-power'),started=performance.now();
const fixture=createHospitalSurfaceFixture({lowPower,halfWidth:20000,reconcile:false});
const source=JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-road-surfaces.geojson',import.meta.url)));
const expectedPolygons=source.features.reduce((sum,f)=>{
 const layer=f.properties.ptbo_layer,status=Object.entries(f.properties).find(([key])=>key.toLowerCase()==='status')?.[1];
 if(!officialSurfaceStatusActive(status)||(layer==='bridges'&&!officialBridgeIsVehicular(f.properties))
   ||!['road_surfaces','parking_surfaces','bridges'].includes(layer))return sum;
 return sum+(f.geometry.type==='Polygon'?1:f.geometry.type==='MultiPolygon'?f.geometry.coordinates.length:0);
},0);
assert.equal(fixture.polygons.length,expectedPolygons,'Every eligible packaged pavement polygon must be included');
const station=fixture.project(44.3010,-78.32212);
reconcileStationPavement({THREE,group:fixture.group,polygons:fixture.polygons,center:{x:station.x,z:station.y},
 terrainHeight:fixture.terrainHeight,roadIndex:fixture.roadIndex,Index:RenderedPavementIndex});
const hospital=reconcileStationPavement({THREE,group:fixture.group,polygons:fixture.polygons,center:fixture.center,
 terrainHeight:fixture.terrainHeight,roadIndex:fixture.roadIndex,Index:RenderedPavementIndex,radius:120,heightSmoothing:4});
const runtime=arrowRuntime(hospital.index),segments=[];
let eligibleWays=0;
for(const line of fixture.roadLines){
 if(mappedTurnLaneGroups(line.tags,line.profile).length)eligibleWays++;
 runtime.state.roadPaintRanges.set(String(line.id),[]);
 for(let i=1;i<line.samples.length;i++){
  const a=line.samples[i-1],b=line.samples[i];segments.push({a:new THREE.Vector2(a.x,a.y),b:new THREE.Vector2(b.x,b.y),aY:a.height,bY:b.height,
   tags:line.tags,profile:line.profile,width:line.profile.width,lineId:line.id,lineLength:line.samples.at(-1).distance,chainStart:a.distance});
 }
}
const fixtureMilliseconds=performance.now()-started;
const cpuStart=process.cpuUsage(),buildStart=performance.now();
runtime.run(segments);
const buildWallMilliseconds=performance.now()-buildStart,cpu=process.cpuUsage(cpuStart);
const meshes=[...runtime.generatedRoadMeshes.values()];
let nonUpwardTriangles=0;
for(const mesh of meshes){const p=mesh.geometry.attributes.position.array;for(let i=0;i<p.length;i+=9)
 if((p[i+5]-p[i+2])*(p[i+6]-p[i])-(p[i+3]-p[i])*(p[i+8]-p[i+2])<=0)nonUpwardTriangles++;}
assert.equal(nonUpwardTriangles,0,'Every final Float32 arrow triangle must remain nondegenerate and upward');
const vertices=meshes.reduce((sum,m)=>sum+m.geometry.attributes.position.count,0);
const bufferBytes=meshes.reduce((sum,m)=>sum+Object.values(m.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0),0);
const result={scope:'Approximate full packaged-source workload; not browser-equivalent',
 limitations:['Global bridge elevation profiles omitted','Water recess omitted','Global app bridge lifts and water effects are not reproduced by this source fixture',
 'CPU and memory are local Node measurements, not browser frame time or GPU memory','Support uses finite seven-probe samples, not proof against arbitrarily microscopic gaps'],
 profile:lowPower?'low-power':'desktop',sourceRoadWays:fixture.roadLines.length,sourceRoadSegments:segments.length,sourcePavementPolygons:fixture.polygons.length,
 finalApproximatePavementTriangles:hospital.index.triangleCount,eligibleMappedWays:eligibleWays,
 emittedMappedWays:[...runtime.state.roadPaintRanges.values()].filter(r=>r.length).length,
 nonUpwardTriangles,emittedArrows:meshes.reduce((sum,m)=>sum+m.userData.count,0),meshCount:meshes.length,vertices,triangles:vertices/3,attributeBufferBytes:bufferBytes,
 buildWallMilliseconds,buildCpuMilliseconds:(cpu.user+cpu.system)/1000,
 processPeakRssBytes:process.resourceUsage().maxRSS*1024,fixtureMilliseconds,
 kinds:meshes.map(m=>({kind:m.userData.kind,arrows:m.userData.count,vertices:m.geometry.attributes.position.count}))};
console.log(JSON.stringify(result,null,2));
if(process.env.ARROW_BENCHMARK_REPORT)fs.writeFileSync(process.env.ARROW_BENCHMARK_REPORT,JSON.stringify(result,null,2)+'\n');
