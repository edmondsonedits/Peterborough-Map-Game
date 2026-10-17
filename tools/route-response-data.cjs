'use strict';
// Shared, read-only data preparation for the response builder and independent audit.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
const coverage=require('./check-city-route-coverage.cjs');
function canonicalBases(city,raw){
 const c={console,URL,CustomEvent:class{},location:{href:'https://example.test/'},localStorage:{getItem:()=>null,setItem(){}},document:{currentScript:{src:'https://example.test/shared/base-locations.js'}}};
 c.window=c;c.dispatchEvent=()=>{};c.addEventListener=()=>{};
 c.PTBO_CITY_PACKAGE={id:city.id,roads:{center:[44,-79]}};
 c.PTBO_SERVICE_CONFIG={profiles:Object.fromEntries(['fire','ems'].map(service=>[service,{id:service,bases:raw.filter(b=>b.service===service)}]))};
 vm.runInNewContext(fs.readFileSync(path.join(root,'shared/location-changes.js'),'utf8'),c);
 vm.runInNewContext(fs.readFileSync(path.join(root,'shared/base-locations.js'),'utf8'),c);
 return c.PTBO_BASE_STORE.getSeed();
}
async function loadCity(city){
 const input=await coverage.inputs(city);input.bases=canonicalBases(city,input.bases);
 const data=fs.readFileSync(path.join(root,input.training.roadsUrl));
 input.roads=JSON.parse(input.training.roadsUrl.endsWith('.gz')?zlib.gunzipSync(data):data);
 const supplement=input.training.roadSource?.emergencyAccessSupplement;
 if(supplement){
  if(supplement.url!==`cities/${city.id}/emergency-access-roads.geojson`)throw Error('Invalid packaged emergency-access path');
  const extra=JSON.parse(fs.readFileSync(path.join(root,supplement.url))),excluded=new Set(supplement.excludedWayIds||[]),ids=new Set();
  if(extra.type!=='FeatureCollection'||extra.features.length!==supplement.wayCount)throw Error('Invalid emergency road supplement');
  for(const f of extra.features){if(!/^way\/\d+$/.test(f.id)||ids.has(f.id)||f.geometry?.type!=='LineString'||!f.properties?.trainingEmergencyAccess)throw Error('Invalid emergency road identity/geometry');ids.add(f.id);}
  input.roads={...input.roads,features:input.roads.features.filter(f=>!excluded.has(f.id)&&!ids.has(f.id)).concat(extra.features.filter(f=>!excluded.has(f.id)))};
 }
 const file=path.join(root,`cities/${city.id}/response-areas.geojson`);
 input.areas=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
 return input;
}
function inRing(point,ring){
 let inside=false;const x=point.lng,y=point.lat;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [xi,yi]=ring[i],[xj,yj]=ring[j];
  if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}
function inside(point,geometry){
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
 return polygons.some(rings=>inRing(point,rings[0])&&!rings.slice(1).some(r=>inRing(point,r)));
}
function featuresForBase(areas,base){return areas?.features.filter(f=>String(f.properties.stationCode)===String(base.number))||[];}
function intersectionCandidates(roads,api){
 const vertices=new Map(),classes=new Set(['primary','secondary','tertiary','unclassified','residential','living_street','road']);
 const islandJunctionWays=new Set(['way/100882922','way/442943456','way/100974747']);
 for(const feature of roads.features){
  const p=feature.properties||{},name=String(p.name||'').trim();
  // Only exact shared source vertices on ground-level named roads. Reviewed
  // Island service roads are the sole private-access exception.
  if(!name||(!classes.has(p.highway)&&!(p.highway==='service'&&(p.trainingEmergencyAccess||islandJunctionWays.has(feature.id)))))continue;
  if(p.bridge&&!['no','false'].includes(String(p.bridge))||!['0',''].includes(String(p.layer||'0')))continue;
  if(feature.geometry?.type!=='LineString')continue;
  const coords=feature.geometry.coordinates;
  for(let i=0;i<coords.length;i++){
   const key=api.keyCoord(...coords[i]);let v=vertices.get(key);
   if(!v){v={lat:coords[i][1],lng:coords[i][0],names:new Set(),ways:new Set(),arms:new Set()};vertices.set(key,v);}
   const wayId=feature.id||(Number.isInteger(p.osm_id)?'way/'+p.osm_id:null);
   if(!wayId)throw Error('Named source road has no OSM way identity: '+name);
   v.names.add(name);v.ways.add(wayId);
   for(const j of [i-1,i+1])if(coords[j])v.arms.add(api.keyCoord(...coords[j]));
  }
 }
 const seen=new Map(),out=[];
 for(const v of vertices.values()){
  if(v.names.size<2||v.arms.size<3)continue;
  const names=[...v.names].sort(),key=names.join('|').toLowerCase(),xy=api.toXY(v.lat,v.lng),near=seen.get(key)||[];
  if(near.some(p=>Math.hypot(p.x-xy.x,p.y-xy.y)<80))continue;
  near.push(xy);seen.set(key,near);out.push({lat:v.lat,lng:v.lng,names,ways:[...v.ways].sort(),...xy});
 }
 const nodeByCoord=new Map(api.state.graph.nodes.map(n=>[api.keyCoord(n.lng,n.lat),n.id]));
 return out.map(v=>({...v,nodeId:nodeByCoord.get(api.keyCoord(v.lng,v.lat))})).filter(v=>Number.isInteger(v.nodeId));
}
module.exports={...coverage,root,canonicalBases,loadCity,inside,featuresForBase,intersectionCandidates};
