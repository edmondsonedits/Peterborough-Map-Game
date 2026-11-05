import * as THREE from 'three';
import {GLTFLoader} from './vendor/three-r180/examples/jsm/loaders/GLTFLoader.js';
import {createPromiseCache} from './asset-request-cache.js';
import {createFirefighterLocomotion} from './firefighter-locomotion.js?v=6';

const cacheAssetRequest=createPromiseCache();
const FIREFIGHTER_URL=new URL('./assets/characters/firefighter.glb?v=6',import.meta.url);
const REQUIRED_BONES=['Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftLeg','LeftShin','LeftFoot','LeftToe','RightLeg','RightShin','RightFoot','RightToe'];
const REQUIRED_CLIPS=['Idle','Walk','Run','Sprint'];

export function preloadFirefighterAsset() {
  return cacheAssetRequest(FIREFIGHTER_URL.href,async()=>{
    const response=await fetch(FIREFIGHTER_URL,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`Firefighter HTTP ${response.status}`);
    return response.arrayBuffer();
  });
}

export function prepareFirefighter(scene,clips) {
  scene.updateMatrixWorld(true);
  const meshes=[];scene.traverse(node=>{if(node.isSkinnedMesh)meshes.push(node);});
  if(!meshes.length||meshes.some(mesh=>!mesh.skeleton?.bones?.length||!mesh.geometry?.attributes?.skinIndex||!mesh.geometry?.attributes?.skinWeight))throw Error('Firefighter requires a weighted skinned mesh');
  const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
  if(![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)||size.y<1.75||size.y>2.1||size.x>1.2||bounds.min.y<-.02)throw Error('Invalid firefighter dimensions');
  const bones=new Map();
  for(const name of REQUIRED_BONES){const node=scene.getObjectByName(name);if(!node?.isBone)throw Error(`Missing firefighter bone: ${name}`);bones.set(name,node);}
  for(const mesh of meshes){
    const meshBones=new Set(mesh.skeleton.bones.map(bone=>bone.name));
    if(REQUIRED_BONES.some(name=>!meshBones.has(name)))throw Error('Firefighter skin is missing required skeleton bones');
  }
  const byName=new Map((clips||[]).map(clip=>[clip.name,clip]));
  for(const name of REQUIRED_CLIPS){
    const clip=byName.get(name);
    if(!clip||!Number.isFinite(clip.duration)||clip.duration<=0||!clip.tracks?.length)throw Error(`Missing firefighter animation clip: ${name}`);
    const animatedBones=REQUIRED_BONES.filter(bone=>clip.tracks.some(track=>track.name.includes(bone)));
    if(!animatedBones.includes('Hips')||!['LeftArm','RightArm','LeftForeArm','RightForeArm','LeftLeg','RightLeg','LeftShin','RightShin'].every(bone=>animatedBones.includes(bone)))throw Error('Firefighter clip is missing body or limb tracks');
  }
  scene.traverse(node=>{if(node.isMesh){
    node.castShadow=true;node.receiveShadow=true;
    const materials=Array.isArray(node.material)?node.material:[node.material];
    for(const material of materials){if(material?.name==='short04'){
      material.color.setRGB(.6,.28,.10);material.alphaTest=.35;material.transparent=false;material.depthWrite=true;
    }}
  }});
  return {scene,clips:REQUIRED_CLIPS.map(name=>byName.get(name)),bones,meshes};
}

/** Validate and install synchronously so a bad export never removes the fallback actor. */
export function installFirefighterModel(root,scene,clips) {
  const model=prepareFirefighter(scene,clips);
  const animation=root.userData.animation;
  if(!animation?.visual)throw Error('Firefighter fallback visual is unavailable');
  const locomotion=createFirefighterLocomotion(model.scene,model.clips);
  const old=[...animation.visual.children];
  animation.visual.clear();animation.visual.add(model.scene);
  animation.visual.position.set(0,0,0);
  animation.leftArm=model.bones.get('LeftArm');
  animation.rightArm=model.bones.get('RightArm');
  animation.leftLeg=model.bones.get('LeftLeg');
  animation.rightLeg=model.bones.get('RightLeg');
  animation.locomotion=locomotion;
  animation.phase=0;
  const geometries=new Set(),materials=new Set();
  old.forEach(child=>child.traverse(node=>{if(node.isMesh){geometries.add(node.geometry);for(const material of(Array.isArray(node.material)?node.material:[node.material]))materials.add(material);}}));
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  animation.assetStatus='blender-ready';return 'blender-ready';
}

export async function installFirefighter(root) {
  const gltf=await new GLTFLoader().parseAsync(await preloadFirefighterAsset(),new URL('.',FIREFIGHTER_URL).href);
  return installFirefighterModel(root,gltf.scene,gltf.animations);
}
