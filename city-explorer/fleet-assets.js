import * as THREE from 'three';
import {GLTFLoader} from './vendor/three-r180/examples/jsm/loaders/GLTFLoader.js';
const cache=new Map();
const assetRevision='2';
export async function loadFleetAsset(type){
  const name=type==='aerial'?'aerial-platform':'medi-pickup';
  if(!cache.has(name))cache.set(name,Promise.all([
    fetch(new URL(`./assets/vehicles/${name}.glb?rev=${assetRevision}`,import.meta.url)).then(r=>{if(!r.ok)throw Error(`${name}: HTTP ${r.status}`);return r.arrayBuffer();}),
    fetch(new URL(`./assets/vehicles/${name}.json?rev=${assetRevision}`,import.meta.url)).then(r=>{if(!r.ok)throw Error(`${name} metadata: HTTP ${r.status}`);return r.json();}),
  ]).catch(e=>{cache.delete(name);throw e;}));
  const [bytes,metadata]=await cache.get(name);
  const {scene}=await new GLTFLoader().parseAsync(bytes,'');
  return prepareFleetAsset(scene,metadata,type);
}
export function prepareFleetAsset(scene,metadata,type){
  const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
  const valid=type==='aerial'?size.x>=2&&size.x<=3.4&&size.y>=3&&size.y<4.5&&size.z>=10.5&&size.z<=13.55:size.x>=1.8&&size.x<=2.9&&size.y>=2&&size.y<=3.3&&size.z>=5.8&&size.z<=7.9;
  if(!valid)throw Error(`Invalid ${type} model envelope: ${size.toArray().join(', ')}`);
  // Station door and vehicle footprints are measured from the bumper midpoint.
  const centerZ=(bounds.min.z+bounds.max.z)/2;
  scene.position.z-=centerZ;
  const names=['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR',...(type==='aerial'?['Wheel_RL2','Wheel_RR2']:[])];
  const wheels=[],frontWheels=[];
  for(const name of names){
    const node=scene.getObjectByName(name);if(!node)throw Error(`Missing ${name}`);
    const parent=node.parent,pivot=new THREE.Group(),spin=new THREE.Group();pivot.position.copy(node.position);pivot.quaternion.copy(node.quaternion);node.position.set(0,0,0);node.quaternion.identity();parent.add(pivot);pivot.add(spin);spin.add(node);wheels.push({pivot,spin});if(name.includes('_F'))frontWheels.push(pivot);
  }
  const beaconNodes=['Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'].map(n=>scene.getObjectByName(n));
  if(beaconNodes.some(n=>!n))throw Error('Missing fleet beacon lenses');
  const beacons=[];beaconNodes.forEach(node=>node.traverse(n=>{if(n.isMesh)beacons.push(n);}));
  if(beacons.length<4)throw Error('Missing fleet beacon geometry');
  beacons.forEach(n=>{n.material=n.material.clone();});
  const rig={};
  const boxCorner=value=>Array.isArray(value)?{x:value[0],y:value[1],z:value[2]-centerZ}:{...value,z:value.z-centerZ};
  const cabClearance=type==='aerial'&&metadata.cabClearance?{
    min:boxCorner(metadata.cabClearance.min),max:boxCorner(metadata.cabClearance.max),
  }:null;
  const ladderSections=type==='aerial'?(metadata.ladderSections??metadata.pivotContract?.ladderSections??[1,2,3,4].map(i=>({node:`LadderSection_${i}`,length:i===4?3.2:5.6,travel:i===2||i===3?4.8:0}))):[];
  if(type==='aerial')for(const name of ['TurntableYaw','LadderPitch',...ladderSections.map(section=>section.node),'KnuckleFold','BasketLevel','BasketFold','Basket','MonitorYaw','MonitorPitch','NozzleOutlet',...['FL','FR','RL','RR'].flatMap(n=>[`Outrigger_${n}`,`Jack_${n}`])]){
    const node=scene.getObjectByName(name);if(!node)throw Error(`Missing aerial node ${name}`);rig[name]=node;node.userData.fleetRest={position:node.position.clone(),rotation:node.rotation.clone()};
  }
  if(type==='aerial')for(const name of ['RearControls','RearOperator','BasketStand']){
    const node=scene.getObjectByName(name);if(node)rig[name]=node;
  }
  if(type==='aerial')for(const side of ['L','R'])for(const prefix of ['Cylinder_Base_','Cylinder_Tip_','ElevationRam_']){
    const name=prefix+side,node=scene.getObjectByName(name);if(node)rig[name]=node;
  }
  // Elevation cylinders belong to the slewing assembly, preserving their rest world pins.
  if(type==='aerial'){
    scene.updateMatrixWorld(true);
    for(const side of ['L','R'])if(rig[`Cylinder_Base_${side}`])rig.TurntableYaw.attach(rig[`Cylinder_Base_${side}`]);
  }
  scene.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
  return {scene,metadata,wheels,frontWheels,beacons,rig,ladderSections,cabClearance};
}
export function installFleetAsset(root,createTruck,type){
  // The base constructor provides a complete driving fallback and its loading contract.
  const base=root.userData.truck;
  base.ready=Promise.resolve(base.ready).then(async()=>{
    const model=await loadFleetAsset(type);
    const old=[...base.visual.children];base.visual.clear();base.visual.add(model.scene);
    const geometries=new Set(),materials=new Set();
    old.forEach(child=>child.traverse(node=>{if(node.isMesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}}));
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    Object.assign(base,model,{assetStatus:'blender-ready'});
    return 'blender-ready';
  }).catch(error=>{base.assetStatus='asset-error';base.assetError=String(error);console.error(`Fleet ${type} model failed`,error);return 'asset-error';});
  return root;
}
