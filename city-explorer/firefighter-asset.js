import * as THREE from 'three';
import {GLTFLoader} from './vendor/three-r180/examples/jsm/loaders/GLTFLoader.js';

export function prepareFirefighter(scene) {
  scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
  if(![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)||size.y<1.8||size.y>2.1||size.x>1.2||bounds.min.y<-.02)throw Error('Invalid firefighter dimensions');
  const names={leftArm:'LeftArm',rightArm:'RightArm',leftLeg:'LeftLeg',rightLeg:'RightLeg'};
  const rig={};
  for(const [key,name] of Object.entries(names)){
    const node=scene.getObjectByName(name);
    if(!node||!node.children.length||!node.position.toArray().every(Number.isFinite))throw Error(`Missing firefighter limb: ${name}`);
    rig[key]=node;
  }
  scene.traverse(node=>{if(node.isMesh){
    node.castShadow=true;node.receiveShadow=true;
    if(node.material.name==='short04') {
      node.material.color.setRGB(.6,.28,.10);
      node.material.alphaTest=.35;node.material.transparent=false;node.material.depthWrite=true;
    }
  }});
  return {scene,...rig};
}
export async function installFirefighter(root) {
  const url=new URL('./assets/characters/firefighter.glb?v=3',import.meta.url);
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`Firefighter HTTP ${response.status}`);
  const model=prepareFirefighter((await new GLTFLoader().parseAsync(await response.arrayBuffer(),new URL('.',url).href)).scene);
  const animation=root.userData.animation,old=[...animation.visual.children];
  animation.visual.clear();animation.visual.add(model.scene);
  for(const key of ['leftArm','rightArm','leftLeg','rightLeg'])animation[key]=model[key];
  const geometries=new Set(),materials=new Set();old.forEach(child=>child.traverse(node=>{if(node.isMesh){geometries.add(node.geometry);materials.add(node.material);}}));
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  animation.assetStatus='blender-ready';return 'blender-ready';
}
