import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {createFootageFacade,frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {FOOTAGE_PROFILES as BASE} from '../city-explorer/sherbrooke-footage-profiles.js';
import {addRouteLandmarkAppearances,ROUTE_LANDMARK_APPEARANCES} from '../city-explorer/route-landmark-appearances.js';
import {ROUTE_CORNER_APPEARANCES} from '../city-explorer/route-corner-appearances.js';
import {ROUTE_STREET_APPEARANCES} from '../city-explorer/route-street-appearances.js';
import {ROUTE_REID_APPEARANCES} from '../city-explorer/route-reid-appearances.js';
const records={...ROUTE_LANDMARK_APPEARANCES,...ROUTE_CORNER_APPEARANCES,...ROUTE_STREET_APPEARANCES,...ROUTE_REID_APPEARANCES};
const profiles=addRouteLandmarkAppearances(BASE);
const data=JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url),'utf8'));
const ways=new Map(data.elements.filter(x=>x.type==='way').map(x=>['way/'+x.id,x]));
const project=(lat,lon)=>({x:(lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),z:-(lat-44.3091)*110540});
const height=id=>profiles[id].appearanceOnly?mappedBuildingDimensions(ways.get(id).tags,id).height:profiles[id].eaveHeight;
const faces=profile=>{const {additionalFrontages,...primary}=profile;return[primary,...(additionalFrontages||[]).map(face=>({...primary,...face,facadePhoto:face.facadePhoto}))];};
function rendered(id,faceIndex=0,override){const profile=faces(override||profiles[id])[faceIndex],ring=ways.get(id).geometry.slice(0,-1).map(p=>project(p.lat,p.lon)),wallHeight=override?.detailHeightMetres||height(id),frame=frontageFrame({profile,ring,project});return {profile,frame,wallHeight,group:createFootageFacade({THREE,profile,ring,base:0,top:wallHeight,project})};}
function boxes(group,frame){const result=[],matrix=new THREE.Matrix4();group.traverse(node=>{if(!node.isInstancedMesh)return;for(let index=0;index<node.count;index++){node.getMatrixAt(index,matrix);const p=new THREE.Vector3(),s=new THREE.Vector3();matrix.decompose(p,new THREE.Quaternion(),s);result.push({name:node.name,x:(p.x-frame.start.x)*frame.tangent.x+(p.z-frame.start.z)*frame.tangent.z,y:p.y,out:(p.x-frame.start.x)*frame.outward.x+(p.z-frame.start.z)*frame.outward.z,w:s.x,h:s.y,d:s.z});}});return result;}
const fasciaFixtures=[['way/446339099',0,0],['way/446343895',0,0],['way/446366842',0,0],['way/446343896',0,0],['way/383393878',0,0],['way/383393878',1,0],['way/446339024',0,0],['way/446339087',0,1]];

test('commercial fascia bands retain useful height on actual mapped source walls',()=>{
 for(const [id,index,panelIndex]of fasciaFixtures){
  const {profile,frame,wallHeight,group}=rendered(id,index),panel=profile.facadePanels[panelIndex];
  const band=boxes(group,frame).find(box=>box.name===`frontage-${panel.color}`&&Math.abs(box.w-frame.length*panel.widthFraction)<.02);
  assert.ok(band,`${id}/${index} fascia exists`);
  assert.ok(band.h>=.3,`${id}/${index}: fascia collapsed to ${band.h.toFixed(3)} m on ${wallHeight.toFixed(2)} m wall`);
  assert.ok(Math.abs(band.h-panel.heightMetres)<1e-5,`${id}/${index}: fascia does not rely on height clipping`);
  assert.ok(band.y+band.h/2<=wallHeight+.001,`${id}/${index}: fascia stays below roof`);
 }
});

test('route panels and service/entry glazing fit the real source height instead of a fictional tall test wall',()=>{
 for(const id of Object.keys(records))for(let index=0;index<faces(profiles[id]).length;index++){
  const {profile,wallHeight,group,frame}=rendered(id,index),h=Math.min(wallHeight,profile.detailHeightMetres||profile.eaveHeight||profile.height||wallHeight);
  for(const panel of profile.facadePanels||[])assert.ok(panel.bottomMetres+panel.heightMetres<=h+.001,`${id}/${index}: requested panel exceeds ${h.toFixed(2)} m available height`);
  for(const window of profile.groundWindows||[])assert.ok(window.bottom+window.height<=h+.001,`${id}/${index}: service/window pane exceeds wall height`);
  if(profile.entryDoor){const frameBoxes=boxes(group,frame).filter(box=>box.name===`frontage-${profile.entryDoor.color||'trim'}`&&Math.abs(box.w-(profile.entryDoor.widthMetres||1.15))<.02);assert.ok(frameBoxes.some(box=>box.h>=2.0&&box.y+box.h/2<=h+.001),`${id}: usable entry height retained`);}
 }
});

test('named sign text stays within the actual wall and ahead of overlapping glass or panels',()=>{
 const original=globalThis.document;
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})})};
 try{
  for(const id of Object.keys(records))for(let index=0;index<faces(profiles[id]).length;index++){
   const {profile,frame,wallHeight,group}=rendered(id,index);if(!profile.signText)continue;
   const text=group.children.flatMap(child=>child.children||[]).find(node=>node.isMesh&&!node.isInstancedMesh&&node.material?.map);
   assert.ok(text,`${id}/${index}: named text plane renders`);
   const geometry=text.geometry.parameters,w=geometry.width,h=geometry.height,p=text.position;
   const sx=(p.x-frame.start.x)*frame.tangent.x+(p.z-frame.start.z)*frame.tangent.z,sy=p.y,so=(p.x-frame.start.x)*frame.outward.x+(p.z-frame.start.z)*frame.outward.z;
   assert.ok(sy-h/2>=0&&sy+h/2<=wallHeight+.001,`${id}/${index}: text below roof`);
   const board=boxes(group,frame).find(box=>box.name===`frontage-${profile.signBoardColor||'trim'}`&&Math.abs(box.w-w/.9)<.02&&Math.abs(box.y-sy)<.001);
   assert.ok(board,`${id}/${index}: text has a backing board`);assert.ok(board.y+board.h/2<=wallHeight+.001,`${id}/${index}: board below roof`);
   for(const box of boxes(group,frame)){
    const overlaps=Math.min(sx+w/2,box.x+box.w/2)-Math.max(sx-w/2,box.x-box.w/2)>.01&&Math.min(sy+h/2,box.y+box.h/2)-Math.max(sy-h/2,box.y-box.h/2)>.01;
    if(overlaps)assert.ok(box.out+box.d/2<so-.005,`${id}/${index}: ${box.name} occludes text`);
   }
  }
 }finally{globalThis.document=original;}
});

test('the Walmart fallback fits its low source shell while replacement decoration retains the authored GLB scale',()=>{
 const fallback=rendered('way/176908280');assert.equal(fallback.wallHeight,3.15);
 const replacement={...profiles['way/176908280'],...profiles['way/176908280'].replacementFrontage};
 for(const face of faces(replacement))for(const panel of face.facadePanels||[])assert.ok(panel.bottomMetres+panel.heightMetres<=10.15+.001,'GLB decoration remains within authored wall');
 assert.equal(replacement.detailHeightMetres,10.15);
 assert.ok(replacement.signHeightMetres>6,'replacement sign is not shrunk to the fallback shell');
});
