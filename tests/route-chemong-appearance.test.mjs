import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createFootageFacade, frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {createEmergencyFacilityLayer} from '../city-explorer/emergency-facilities.js';
import {createBusinessSignLayer} from '../city-explorer/business-signs.js';
import {createGeneratedRegistry} from '../city-explorer/editor/generated-registry.js';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {installCityMaterialDetail} from '../city-explorer/city-material-library.js';
import {FOOTAGE_PROFILES as BASE} from '../city-explorer/sherbrooke-footage-profiles.js';

const flatRing = [{x:0,z:0},{x:12,z:0},{x:12,z:8},{x:0,z:8}];
const flatProject = (lat,lon)=>({x:lon,z:lat});
const fixture = {id:'test',label:'test',confidence:'observed',style:'retail',levels:1,windowColumns:3,frontLatLon:[{lat:0,lon:0},{lat:0,lon:12}]};
const facade = (profile={},options={}) => createFootageFacade({THREE,profile:{...fixture,...profile},ring:flatRing,base:0,top:4,project:flatProject,...options});

test('explicit photographed glass tint applies only to improved glass and keeps the legacy default',()=>{
 const plain=facade(),tinted=facade({glassColor:'#57716d'}),legacy=facade({glassColor:'#57716d'},{visuals:'legacy'});
 assert.equal(tinted.getObjectByName('frontage-glass').material.color.getHexString(),'57716d');
 assert.equal(plain.getObjectByName('frontage-glass').material.color.getHexString(),'33494e');
 assert.equal(legacy.getObjectByName('frontage-glass').material.color.getHexString(),'33494e');
});

test('opted-in retail entry replaces only its window bay and undecorated fronts keep their openings',()=>{
 const before=facade(),after=facade({entryDoor:{fraction:.5,color:'#246828',widthMetres:1.2}});
 assert.equal(before.getObjectByName('frontage-glass').count,3);
 assert.ok(after.getObjectByName('frontage-#246828'),'reviewed entrance frame is present');
 assert.equal(after.getObjectByName('frontage-glass').count,3,'two shop windows and one door pane');
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
 after.getObjectByName('frontage-#246828').getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);
 assert.equal(position.x,6);assert.ok(Math.abs(scale.x-1.2)<1e-6);
 const suppressed=facade({style:'house',blankFacade:true,porch:false,entryDoor:null});
 assert.equal(suppressed.getObjectByName('frontage-door'),undefined,'a material-only reviewed elevation does not invent an entry');
});

test('explicit green shutters add only the paired window trim',()=>{
 const group=facade({style:'house',porch:false,shutterColor:'#456053',skipGroundWindows:true,groundWindows:[{t:.25,bottom:.8,width:1.1,height:1.2},{t:.75,bottom:.8,width:1.1,height:1.2}]});
 assert.equal(group.getObjectByName('frontage-#456053')?.count,4);
 assert.equal(group.userData.collision,false);
});

async function routeRegistry(){
 const module=await import('../city-explorer/route-landmark-appearances.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return null;throw error;});
 assert.ok(module,'the reviewed Chemong registry must be available to runtime');
 return module;
}
const center={lat:44.3091,lon:-78.3197};
const project=(lat,lon)=>({x:(lon-center.lon)*111320*Math.cos(center.lat*Math.PI/180),z:-(lat-center.lat)*110540});

test('active route profiles preserve reviewed baseline massing and resolve only the bounded photo segment',async()=>{
 const {addRouteLandmarkAppearances}=await routeRegistry();
 const original=structuredClone(BASE),active=addRouteLandmarkAppearances(BASE);
 assert.equal(addRouteLandmarkAppearances(BASE,false),BASE);
 assert.deepEqual(BASE,original);
 assert.equal(active['way/176908281'].eaveHeight,BASE['way/176908281'].eaveHeight);
 assert.deepEqual(active['way/176908281'].frontLatLon,BASE['way/176908281'].frontLatLon);
 assert.equal(active['way/446365624'],BASE['way/446365624'],'Reid is queued separately');
 assert.equal(active['way/446339023'],BASE['way/446339023'],'open canopy waits for collision review');
 for(const id of ['way/176908280','way/755556771','way/446339099','way/1002815296','way/1002815324']){
  assert.ok(active[id],`${id} is in runtime profile composition`);
  assert.equal(active[id].appearanceOnly,true);assert.equal(active[id].preserveMappedMassing,true);
  assert.equal(active[id].eaveHeight,undefined);assert.equal(active[id].roofRise,undefined);
 }
 assert.equal(active['way/446343896'].signText,undefined,'unreadable dentist text stays unnamed');
 assert.equal(active['way/77717331'].signText,undefined,'Dollarama sign placement is not inferred from a cropped view');
 assert.deepEqual(active['way/176908280'].groundWindows,[],'distant Walmart photo does not invent entrance bay counts');
 assert.equal(active['way/176908280'].entryDoor,null);
});

test('reviewed frontages stay on mapped edges and produce finite non-collision details',async()=>{
 const {addRouteLandmarkAppearances}=await routeRegistry();
 const data=JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url),'utf8'));
 const ways=new Map(data.elements.filter(x=>x.type==='way').map(x=>['way/'+x.id,x]));
 const profiles=addRouteLandmarkAppearances({});
 for(const [id,profile]of Object.entries(profiles)){
  const source=ways.get(id);assert.ok(source,id);
  const coords=source.geometry.slice(0,-1),ring=coords.map(p=>project(p.lat,p.lon));
  for(const face of [profile,...(profile.additionalFrontages||[])]){
   const endpoints=face.frontLatLon.map(end=>coords.findIndex(p=>Math.abs(p.lat-end.lat)<1e-7&&Math.abs(p.lon-end.lon)<1e-7));
   assert.ok(endpoints.every(index=>index>=0),`${id} frontage endpoints on source ring`);
   assert.ok(Math.abs(endpoints[0]-endpoints[1])===1||Math.abs(endpoints[0]-endpoints[1])===coords.length-1,`${id} frontage follows one mapped edge`);
   const f=frontageFrame({profile:face,ring,project});assert.ok(f.length>1&&Number.isFinite(f.yaw));
  }
  const wallHeight=mappedBuildingDimensions(source.tags,id).height;
  const group=createFootageFacade({THREE,profile,ring,base:100,top:100+wallHeight,project});
  assert.equal(group.userData.collision,false);
  group.traverse(node=>{if(node.isInstancedMesh){assert.ok([...node.instanceMatrix.array].every(Number.isFinite),`${id} instance matrix`);}if(node.geometry)assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite),`${id} geometry`);});
 }
});

test('facility decoration retains world coordinates and the replacement visibility contract',async()=>{
 const scene=new THREE.Group(),hidden=[];
 const entry={id:'fixture',assetUrl:'fixture',rootName:'Fixture',sourceIds:['way/1'],origin:{lat:0,lon:0,yawDegrees:90},footprint:[[-5,0],[5,0],[5,10],[-5,10]],maxHeight:12};
 const model=new THREE.Group();model.name='Fixture';const mass=new THREE.Mesh(new THREE.BoxGeometry(10,5,10),new THREE.MeshStandardMaterial());mass.position.set(0,2.5,5);model.add(mass);
 const layer=createEmergencyFacilityLayer({THREE,scene,loader:{loadAsync:async()=>({scene:model})},entries:[entry],project:()=>({x:100,z:200}),baseSurface:()=>({height:10}),records:()=>[{id:'shell',sourceType:'building',sourceId:'way/1'}],hide:id=>hidden.push(id),decorate:(_entry,{ring,base})=>{assert.equal(ring[0].x,100);assert.equal(ring[0].z,205);const detail=new THREE.Group();detail.name='reviewed-frontage';detail.position.set(110,base+2,205);return detail;}});
 await layer.load();scene.updateMatrixWorld(true);
 const detail=scene.getObjectByName('reviewed-frontage');assert.ok(detail,'validated GLB retains optional reviewed facade');
 assert.deepEqual(detail.getWorldPosition(new THREE.Vector3()).toArray(),[110,12.06,205]);
 assert.deepEqual(hidden,['shell']);assert.equal(layer.getStatus().fixture.decoration,'ready');
 layer.setRuntimeOwner('fixture',true);assert.equal(scene.children[0].visible,false);
});

const canvasFactory=()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){},measureText:t=>({width:t.length*10})})});
test('verified signs on an additional storefront suppress duplicate directory labels',()=>{
 const parent=new THREE.Group(),registry=createGeneratedRegistry(THREE),sourceId='way/1';
 const generatedId=registry.registerEditableObject(new THREE.Object3D(),{sourceType:'building',sourceId,batchBinding:{setVisible(){},restore(){},cloneGeometry:()=>new THREE.Group()}});
 const feature={sourceId,generatedId,sourceGeometry:[[[[0,0],[12,0],[12,-8],[0,-8],[0,0]]]],partHeights:[{base:0,wallTop:5}],minY:0,maxY:5};
 const businesses=['Pizza Pizza','Tim Hortons','Another shop'].map((name,i)=>({id:String(i),name,buildingSourceId:sourceId,placementStatus:'approved',placementMode:'street-facing-wall',frontage:[{lat:0,lon:0},{lat:0,lon:12}],fraction:(i+.5)/3,widthMetres:2}));
 const profile={id:sourceId,confidence:'observed',style:'retail',height:5,levels:1,signText:'PIZZA PIZZA',frontLatLon:[{lat:0,lon:0},{lat:0,lon:6}],additionalFrontages:[{signText:'TIM HORTONS',frontLatLon:[{lat:0,lon:6},{lat:0,lon:12}]}]};
 const previousDocument=globalThis.document;let detail;
 try{globalThis.document={createElement:()=>canvasFactory()};detail=createFootageFacade({THREE,profile,ring:[{x:0,z:0},{x:12,z:0},{x:12,z:8},{x:0,z:8}],base:0,top:5,project:(lat,lon)=>({x:lon,z:-lat}),lite:true});}
 finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
 parent.add(detail);
 const renderedSignsBySourceId=new Map([[sourceId,detail.userData.renderedSigns]]);
 const layer=createBusinessSignLayer({THREE,parent,features:[feature],directory:{schemaVersion:1,businesses},project:(lat,lon)=>({x:lon,z:-lat}),generatedRegistry:registry,canvasFactory,profiles:{[sourceId]:profile},renderedSignsBySourceId});
 assert.equal(layer.stats().existingProfileSigns,2);assert.equal(layer.stats().newSignPanels,1);
 assert.equal(layer.samples().find(x=>x.name==='Tim Hortons').existingProfileSign,true);
 layer.dispose();
});


test('every explicitly selected route surface installs a supported material recipe',async()=>{
 const {addRouteLandmarkAppearances}=await routeRegistry();
 for(const [id,profile] of Object.entries(addRouteLandmarkAppearances(BASE))){
  if(!profile.reviewedWallMaterial||!profile.wallSurface)continue;
  const material=new THREE.MeshStandardMaterial({color:profile.wallColor});
  assert.equal(installCityMaterialDetail(material,{kind:profile.wallSurface,quality:'full'}),true,`${id}: unsupported ${profile.wallSurface}`);
  assert.equal(material.userData.cityMaterial.kind,profile.wallSurface);
 }
});
