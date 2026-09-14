import * as THREE from 'three';
import {loadStreetscapeAsset,normalizedAsset} from '../../city-explorer/streetscape-assets.js';
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x18232d);
scene.add(new THREE.HemisphereLight(0xcceaff,0x5b4b39,2));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(15,35,20);scene.add(sun);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,500);
const controls={target:new THREE.Vector3(),update(){camera.lookAt(this.target);}};
let drag=null;renderer.domElement.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);};
renderer.domElement.onpointerup=()=>{drag=null;};renderer.domElement.onpointermove=e=>{if(!drag)return;const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);s.theta-=(e.clientX-drag.x)*.006;s.phi=Math.max(.12,Math.min(1.52,s.phi+(e.clientY-drag.y)*.006));camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));drag={x:e.clientX,y:e.clientY};};
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();const v=camera.position.clone().sub(controls.target);v.setLength(Math.max(4,Math.min(180,v.length()*Math.exp(e.deltaY*.001))));camera.position.copy(controls.target).add(v);},{passive:false});
const grid=new THREE.GridHelper(90,45,0x70818d,0x354753);scene.add(grid);
const items=[],errors=[];const data=await fetch('./assets.json').then(r=>r.json());
const records=data.assets.filter(r=>r.localPath?.includes('/streetscape/')&&r.localPath.endsWith('.glb')&&!/-lod[12]\.glb$/.test(r.localPath));
for(const [i,r] of records.entries()){
 try{
  const path=r.localPath.split('/streetscape/')[1],asset=await loadStreetscapeAsset(path);
  const size=asset.size;const model=normalizedAsset(asset,Math.min(7,7*size.y/Math.max(size.x,size.y,size.z)));
  model.position.set((i%6-2.5)*12,0,(Math.floor(i/6)-2)*12);scene.add(model);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const c=canvas.getContext('2d');c.fillStyle='#d8edf5';c.font='22px sans-serif';c.textAlign='center';c.fillText(r.name,256,38);
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));label.scale.set(10,1.25,1);label.position.copy(model.position);label.position.y=8;scene.add(label);
  items.push({model,label});const option=new Option(r.name,String(items.length-1));document.querySelector('#asset').add(option);
 }catch(e){errors.push({id:r.id,error:e.message});}
}
function reset(){camera.position.set(48,55,65);controls.target.set(0,1,0);controls.update();}
function select(){const value=document.querySelector('#asset').value;items.forEach((item,i)=>{item.model.visible=value==='all'||i===Number(value);item.label.visible=item.model.visible;});if(value==='all')reset();else{const p=items[Number(value)].model.position;controls.target.copy(p).add(new THREE.Vector3(0,3,0));camera.position.copy(p).add(new THREE.Vector3(10,7,12));controls.update();}}
document.querySelector('#asset').onchange=select;document.querySelector('#reset').onclick=select;reset();
document.querySelector('#status').textContent=`${items.length} loaded · ${errors.length} errors · Kenney CC0 and original project models`;
window.__ASSET_GALLERY__={loaded:items.length,expected:records.length,errors,ready:true};
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
