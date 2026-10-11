import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createHospitalSurfaceFixture} from './hospital-surface-fixture.mjs';
import {nearbyMunicipalRoadHeight,municipalCurbTop,officialCurbDisplayMode} from '../city-explorer/citywide-road-quality.js';
import {splitRoadDetailSegment,curbIsRaised,CURB_REVEAL,pavementSupportBottom} from '../city-explorer/station-road-detail.js';
import {hospitalInferredCurbTop,hospitalCurbNeedsDetail} from '../city-explorer/hospital-curb-detail.js';
const source=JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-road-surfaces.geojson',import.meta.url)));
const app=fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
const fn=name=>app.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'))[0];
for(const lowPower of [false,true]){
 const f=createHospitalSurfaceFixture({lowPower}),segments=[];
 const height=p=>Math.max(f.roadIndex.sampleAll(p.x,p.y,14)[0]?.height??-Infinity,f.terrainHeight(p.x,p.y)+.14)+.008;
 for(const feature of source.features){
  if(feature.properties.ptbo_layer!=='curb_edges')continue;
  const lines=feature.geometry.type==='LineString'?[feature.geometry.coordinates]:feature.geometry.type==='MultiLineString'?feature.geometry.coordinates:[];
  for(const line of lines){const points=line.map(([lon,lat])=>{const p=f.project(lat,lon);return new THREE.Vector2(p.x,p.y);});
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];if(a.distanceTo(b)<.25)continue;
    const s={a,b,bridge:false,stationDetail:false};if(!hospitalCurbNeedsDetail(s,f.result.field))continue;
    const curbMode=officialCurbDisplayMode(curbIsRaised(feature.properties.CURBTYPE));
    segments.push({...s,id:feature.id,aY:height(a)+.07,bY:height(b)+.07,curbMode,width:.24});
   }
  }
 }
 const state={renderedPavementIndex:f.index,hospitalPavementField:f.result.field,objectCount:0},streetscapeGroup=new THREE.Group();
 const env={THREE,state,streetscapeGroup,splitRoadDetailSegment,CURB_REVEAL,pavementSupportBottom,hospitalInferredCurbTop,hospitalCurbNeedsDetail,nearbyMunicipalRoadHeight,municipalCurbTop,lowPowerProfile:lowPower,roadRenderTileCoordinates:()=>({x:0,z:0}),ROAD_RENDER_TILE_SIZE:400,materials:{curbConcrete:new THREE.MeshBasicMaterial()},terrainHeightAtWorld:f.terrainHeight};
 const run=Function(...Object.keys(env),fn('appendRoadTriangle')+'\n'+fn('buildOfficialCurbRibbons')+';return buildOfficialCurbRibbons')(...Object.values(env));
 run(segments);
 let probes=0,worstTop=Infinity,worstBottom=-Infinity;const failures=[];
 for(const mesh of streetscapeGroup.children){const p=mesh.geometry.getAttribute('position');
  for(let start=0;start<p.count;start+=lowPower?6:12)for(let t=0;t<6;t+=3){
   const v=[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(p,start+t+i));
   for(const weights of [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]){
    const point=new THREE.Vector3();v.forEach((q,i)=>point.addScaledVector(q,weights[i]));
    if(Math.hypot(point.x-f.center.x,point.z-f.center.z)>99)continue;
    const road=nearbyMunicipalRoadHeight(f.index,point.x,point.z,point.y);if(!Number.isFinite(road))continue;
    probes++;const top=point.y-road,bottom=top-.11;worstTop=Math.min(worstTop,top);worstBottom=Math.max(worstBottom,bottom);
    if(top<-.025||bottom>.025)failures.push({point:point.toArray(),top,bottom});
   }
  }
 }
 assert.ok(probes>1000);assert.equal(failures.length,0,JSON.stringify({lowPower,probes,worstTop,worstBottom,failures:failures.slice(0,5)}));
 console.log(JSON.stringify({lowPower,probes,worstTop,worstBottom,classification:'inferred-unchanged',finiteSampling:true}));
}
