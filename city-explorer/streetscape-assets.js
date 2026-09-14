import * as THREE from 'three';
import { GLTFLoader } from './vendor/three-r180/examples/jsm/loaders/GLTFLoader.js';
const cache=new Map();
export function loadStreetscapeAsset(path) {
 if(!/^(kenney|props|trees)\/[\w-]+\.glb$/.test(path)) return Promise.reject(Error('Invalid asset path'));
 if(!cache.has(path)) cache.set(path,(async()=>{
  const url=new URL(`./assets/streetscape/${path}`,import.meta.url);
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw Error(`Asset HTTP ${response.status}: ${path}`);
  const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),new URL('.',url).href);
  gltf.scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3());
  if(![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)||size.y<=0)throw Error('Invalid asset bounds');
  gltf.scene.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
  return {scene:gltf.scene,bounds,size};
 })());
 return cache.get(path);
}
export function normalizedAsset(asset,height) {
 if(!Number.isFinite(height)||height<=0)throw Error('Positive asset height required');
 const root=new THREE.Group(),model=asset.scene.clone(true),scale=height/asset.size.y;
 model.scale.multiplyScalar(scale);
 model.position.y-=asset.bounds.min.y*scale;
 const center=asset.bounds.getCenter(new THREE.Vector3());
 model.position.x-=center.x*scale;model.position.z-=center.z*scale;
 root.add(model);return root;
}
export function wirePoints(start,end,sag=0.7,segments=20) {
 if(![...start,...end,sag].every(Number.isFinite)||start.length!==3||end.length!==3||sag<0||!Number.isInteger(segments)||segments<2)throw Error('Invalid wire span');
 return Array.from({length:segments+1},(_,i)=>{const t=i/segments;return new THREE.Vector3(start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t-4*sag*t*(1-t),start[2]+(end[2]-start[2])*t);});
}
export async function installStationStreetscape({group,project,terrainHeightAtWorld,lowPower=false}) {
 const root=new THREE.Group();root.name='Station1IllustrativeStreetscape';
 root.userData={type:'decorative-streetscape',placementEvidence:'Illustrative reference-inspired positions; no collision or operational role.'};
 // Small northern sidewalk pilot; existing road, terrain and survey geometry are untouched.
 const placements=[
  {id:'west-pole',asset:'kenney/electricity-pole-single.glb',lat:44.300765,lon:-78.32248,height:9},
  {id:'east-pole',asset:'kenney/electricity-pole-single.glb',lat:44.30079,lon:-78.32180,height:9},
 ];
 const loaded=await Promise.allSettled(placements.map(p=>loadStreetscapeAsset(p.asset)));
 const anchors=[];
 placements.forEach((p,i)=>{
  if(loaded[i].status!=='fulfilled')return;
  const asset=normalizedAsset(loaded[i].value,p.height),v=project(p.lat,p.lon),y=terrainHeightAtWorld(v.x,v.y);
  asset.position.set(v.x,y,v.y);asset.name=p.id;asset.userData={asset:p.asset,height:p.height,lat:p.lat,lon:p.lon};
  if(lowPower)asset.traverse(n=>{if(n.isMesh)n.castShadow=false;});
  root.add(asset);anchors.push([v.x,y+8.7,v.y]);
 });
 if(anchors.length===2){
  const material=new THREE.MeshStandardMaterial({color:0x24282a,roughness:.9});
  const curve=new THREE.CatmullRomCurve3(wirePoints(anchors[0],anchors[1]));
  root.add(new THREE.Mesh(new THREE.TubeGeometry(curve,24,.025,4,false),material));
 }
 group.add(root);
 const status={placed:placements.filter((_,i)=>loaded[i].status==='fulfilled').length,requested:placements.length,failed:loaded.filter(r=>r.status==='rejected').length};
 document.documentElement.dataset.streetscapePilot=JSON.stringify(status);
 return status;
}
