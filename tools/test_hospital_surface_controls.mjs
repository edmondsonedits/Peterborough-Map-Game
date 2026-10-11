import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
import {reconcileStationPavement} from '../city-explorer/station-pavement-layer.js';
import {createHospitalSurfaceFixture} from './hospital-surface-fixture.mjs';
const hash=group=>createHash('sha256').update(Buffer.concat(group.map(m=>Buffer.from(m.geometry.attributes.position.array.buffer)))).digest('hex');
for(const lowPower of [false,true]){
 const hospital=createHospitalSurfaceFixture({lowPower,reconcile:false});
 const station=createHospitalSurfaceFixture({lowPower,center:{lat:44.3010,lon:-78.32212},reconcile:false});
 const chemong=createHospitalSurfaceFixture({lowPower,center:{lat:44.368716,lon:-78.3814536},reconcile:false});
 const group=new THREE.Group(),stationMeshes=[...station.group.children],chemongMeshes=[...chemong.group.children];
 for(const fixture of [hospital,station,chemong])for(const mesh of [...fixture.group.children])group.add(mesh);
 const polygons=[...hospital.polygons,...station.polygons,...chemong.polygons];
 const args={THREE,group,polygons,terrainHeight:hospital.terrainHeight,roadIndex:hospital.roadIndex,Index:RenderedPavementIndex};
 const stationResult=reconcileStationPavement({...args,center:station.center});
 assert.equal(stationResult.diagnostics.radius,240);assert.equal(stationResult.diagnostics.heightSmoothing,0);
 const beforeStation=hash(stationMeshes),beforeChemong=hash(chemongMeshes),geometryRefs=[...stationMeshes,...chemongMeshes].map(m=>m.geometry);
 const result=reconcileStationPavement({...args,center:hospital.center,radius:120,heightSmoothing:4});
 assert.ok(result);
 assert.equal(hash(stationMeshes),beforeStation,'Normal Station reconstruction stays byte-for-byte unchanged after Hospital');
 assert.equal(hash(chemongMeshes),beforeChemong,'Chemong source geometry stays byte-for-byte unchanged');
 assert.deepEqual([...stationMeshes,...chemongMeshes].map(m=>m.geometry),geometryRefs,'Distant GPU geometry is reused');
 let verified=0;
 for(const mesh of [...stationMeshes,...chemongMeshes]){
  const p=mesh.geometry.attributes.position.array;
  for(let i=0;i<p.length;i+=9*19){const x=(p[i]+p[i+3]+p[i+6])/3,z=(p[i+2]+p[i+5]+p[i+8])/3,y=(p[i+1]+p[i+4]+p[i+7])/3;
   const before=stationResult.index.sample(x,z,y),after=result.index.sample(x,z,y);assert.deepEqual(after,before);verified++;
  }
 }
 console.log(JSON.stringify({status:'pass',profile:lowPower?'low-power':'desktop',stationUnchanged:true,chemongUnchanged:true,distantContactSamples:verified}));
}
// Integration ordering keeps curb attachment on the final rendered road index.
const app=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
const start=app.indexOf("console.warn('Station pavement continuity retained original geometry:");
const hospital=app.indexOf('const hospitalCenter = project(44.301005, -78.34631)',start);
const curbs=app.indexOf('buildOfficialCurbRibbons(curbs)',hospital);
assert.ok(start>=0&&hospital>start&&curbs>hospital);
assert.ok(app.slice(hospital,curbs).includes('state.renderedPavementIndex = result.index'));
