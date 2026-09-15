import * as THREE from 'three';
import { GLTFLoader } from './vendor/three-r180/examples/jsm/loaders/GLTFLoader.js';

export function preparePumper(scene) {
  scene.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  if (![size.x,size.y,size.z].every(Number.isFinite) || size.x<2 || size.x>3.2 || size.y<2.8 || size.y>3.5 || size.z<9 || size.z>10.6) throw Error('Pumper dimensions outside vehicle envelope');
  const wheelNodes=['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'].map(name=>scene.getObjectByName(name));
  const beacons=['Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'].map(name=>scene.getObjectByName(name));
  if (wheelNodes.some(node=>!node || !(node.isMesh || node.children.some(child=>child.isMesh))) || beacons.some(node=>!node?.isMesh)) throw Error('Pumper animation nodes missing');
  const wheels=[],frontWheels=[];
  wheelNodes.forEach((node,index)=>{
    const pivot=new THREE.Group(),spin=new THREE.Group();
    pivot.name=`Steering_${node.name}`;spin.name=`Spin_${node.name}`;
    pivot.position.copy(node.position);node.position.set(0,0,0);
    scene.add(pivot);pivot.add(spin);spin.add(node);
    wheels.push({spin,pivot});if(index<2)frontWheels.push(pivot);
  });
  beacons.forEach(beacon=>{beacon.material=beacon.material.clone();});
  scene.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
  return {scene,wheels,frontWheels,beacons};
}

export async function installPumper(root) {
  const truck=root.userData.truck;
  const url=new URL('./assets/vehicles/generic-pumper.glb',import.meta.url);
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`Pumper HTTP ${response.status}`);
  const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),new URL('.',url).href);
  const model=preparePumper(gltf.scene);
  // Retain the procedural actor until the complete authored model has passed validation.
  const old=[...truck.visual.children];
  truck.visual.clear();truck.visual.add(model.scene);
  Object.assign(truck,{wheels:model.wheels,frontWheels:model.frontWheels,beacons:model.beacons,assetStatus:'blender-ready'});
  const geometries=new Set(),materials=new Set();
  old.forEach(child=>child.traverse(node=>{if(node.isMesh){geometries.add(node.geometry);for(const m of (Array.isArray(node.material)?node.material:[node.material]))materials.add(m);}}));
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());truck.labelTexture?.dispose();truck.labelTexture=null;
  return 'blender-ready';
}
