import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('three');
const {GLTFLoader}=await import('../city-explorer/vendor/three-r180/examples/jsm/loaders/GLTFLoader.js');
const {prepareFirefighter,installFirefighterModel}=await import('../city-explorer/firefighter-asset.js');
const {createFirefighterLocomotion}=await import('../city-explorer/firefighter-locomotion.js');
const bytes=await readFile(new URL('../city-explorer/assets/characters/firefighter.glb',import.meta.url));
const load=async()=>new GLTFLoader().register(()=>({name:'node-texture-fixture',loadTexture(){return Promise.resolve(new THREE.Texture());}})).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');

function validModel(){
  const scene=new THREE.Group(),bones=[];let parent=scene;
  for(const name of ['Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftLeg','LeftShin','LeftFoot','LeftToe','RightLeg','RightShin','RightFoot','RightToe']){const bone=new THREE.Bone();bone.name=name;parent.add(bone);bones.push(bone);parent=bone;}
  bones[0].position.y=.05;bones[1].position.y=.45;bones[2].position.y=.3;bones[3].position.y=.2;bones[4].position.y=.2;
  const geometry=new THREE.BoxGeometry(.3,1.8,.2);geometry.translate(0,.9,0);geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(geometry.attributes.position.count*4),4));const skinWeights=new Float32Array(geometry.attributes.position.count*4);for(let i=0;i<geometry.attributes.position.count;i++)skinWeights[i*4]=1;geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());mesh.add(bones[0]);scene.add(mesh);mesh.bind(new THREE.Skeleton(bones));
  const clips=['Idle','Walk','Run'].map((name,i)=>new THREE.AnimationClip(name,[1,.86,.64][i],['Hips','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftLeg','RightLeg','LeftShin','RightShin'].map(bone=>new THREE.QuaternionKeyframeTrack(bone+'.quaternion',[0,[1,.86,.64][i]],[0,0,0,1,0,Math.sin(.5),0,Math.cos(.5)]))));
  return {scene,clips};
}
function weightedVertices(scene,meshes,boneName){
  const out=[];
  for(const mesh of meshes){
    const boneIndex=mesh.skeleton.bones.findIndex(b=>b.name===boneName),indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    if(boneIndex<0||!indices||!weights)continue;
    scene.updateMatrixWorld(true);mesh.skeleton.update();
    const position=new THREE.Vector3();
    for(let i=0;i<indices.count;i++){
      let influence=0;for(let j=0;j<4;j++)if(indices.getComponent(i,j)===boneIndex)influence+=weights.getComponent(i,j);
      if(influence<.25)continue;
      mesh.getVertexPosition(i,position);out.push({mesh,index:i,rest:position.clone()});
    }
  }
  return out;
}
function maxSkinDisplacement(scene,vertices){
  let max=0;const position=new THREE.Vector3();
  for(const item of vertices){scene.updateMatrixWorld(true);item.mesh.skeleton.update();item.mesh.getVertexPosition(item.index,position);max=Math.max(max,item.rest.distanceTo(position));}
  return max;
}

test('firefighter GLB has a bounded skinned model and validated Idle, Walk, Run clips',async()=>{
  const gltf=await load(),model=prepareFirefighter(gltf.scene,gltf.animations),bounds=new THREE.Box3().setFromObject(gltf.scene);let triangles=0,draws=0;
  gltf.scene.traverse(n=>{if(n.isMesh){triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;draws++;}});
  assert.ok(triangles<120000);assert.ok(draws<=45);assert.ok(bytes.length<9000000);assert.ok(bounds.min.y>=-.02&&bounds.max.y<=2.1);
  assert.ok(model.meshes.length>0);assert.deepEqual(model.clips.map(c=>c.name),['Idle','Walk','Run']);
  const boneNames=new Set(model.meshes[0].skeleton.bones.map(b=>b.name));for(const name of ['LeftShin','RightShin','LeftForeArm','RightForeArm'])assert.ok(boneNames.has(name));
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.ok(json.animations.length>=3);assert.ok(json.images.every(im=>Number.isInteger(im.bufferView)&&im.mimeType==='image/png'&&!im.uri));assert.ok(json.buffers.every(b=>!b.uri));
  for(const clip of model.clips)for(const track of clip.tracks){
    const stride=track.getValueSize(),last=(track.times.length-1)*stride;
    assert.ok(Math.abs(track.times.at(-1)-clip.duration)<1e-4,'track must end at the clip loop duration');
    for(let i=0;i<stride;i++)assert.ok(Math.abs(track.values[i]-track.values[last+i])<1e-3,'clip endpoint must loop without a jump');
  }
});

test('run animation deforms skinned knee and elbow vertices',async()=>{
  const gltf=await load(),model=prepareFirefighter(gltf.scene,gltf.animations),gait=createFirefighterLocomotion(model.scene,model.clips);
  const knee=weightedVertices(model.scene,model.meshes,'LeftShin'),elbow=weightedVertices(model.scene,model.meshes,'LeftForeArm');
  assert.ok(knee.length>0,'no vertices are weighted to the knee joint');assert.ok(elbow.length>0,'no vertices are weighted to the elbow joint');
  gait.update(.1,3.8);gait.update(.1,3.8);gait.update(.1,3.8);
  assert.ok(maxSkinDisplacement(model.scene,knee)>.01,'run clip did not bend the knee skin');
  assert.ok(maxSkinDisplacement(model.scene,elbow)>.01,'run clip did not bend the elbow skin');
});

test('sampled idle and gait cycles remain finite with per-foot ground support',async()=>{
  for(const [clipName,speed,duration] of [['Idle',0,3],['Walk',1.51,.86],['Run',3.71,.64]]){
    const gltf=await load(),model=prepareFirefighter(gltf.scene,gltf.animations),gait=createFirefighterLocomotion(model.scene,model.clips);
    const toes=['LeftToe','RightToe'].map(name=>model.scene.getObjectByName(name)),minToes=[Infinity,Infinity];
    const frames=Math.ceil(duration*60);
    for(let frame=0;frame<=frames;frame++){
      gait.update(1/60,speed);model.scene.updateMatrixWorld(true);
      for(const bone of model.meshes[0].skeleton.bones){
        assert.ok(bone.position.toArray().every(Number.isFinite),'bone position must stay finite');
        assert.ok(bone.quaternion.toArray().every(Number.isFinite),'bone rotation must stay finite');
      }
      for(let foot=0;foot<2;foot++){const y=toes[foot].getWorldPosition(new THREE.Vector3()).y;assert.ok(Number.isFinite(y));minToes[foot]=Math.min(minToes[foot],y);}
      if(frame%6===0){
        const bounds=new THREE.Box3().setFromObject(model.scene),size=bounds.getSize(new THREE.Vector3());
        assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite),'model bounds must stay finite');
        assert.ok(size.x<1.5&&size.y<2.25&&size.z<1.5,'deformed mesh must stay inside its movement envelope');
      }
    }
    if(clipName!=='Idle')for(const [foot,y]of minToes.entries())assert.ok(y>=-.02&&y<.11,`${clipName} foot ${foot} must reach supporting ground`);
  }
});

test('invalid animation export leaves the fallback character installed',()=>{
  const {scene,clips}=validModel(),root=new THREE.Group(),visual=new THREE.Group(),fallback=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());visual.add(fallback);root.add(visual);root.userData.animation={visual};
  assert.throws(()=>installFirefighterModel(root,scene,clips.filter(clip=>clip.name!=='Run')),/Missing firefighter animation clip: Run/);
  assert.equal(visual.children.length,1);assert.equal(visual.children[0],fallback);
});
