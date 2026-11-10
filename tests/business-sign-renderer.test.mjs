import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createBusinessSignLayer} from '../city-explorer/business-signs.js';
import {createGeneratedRegistry} from '../city-explorer/editor/generated-registry.js';
const canvasFactory=()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){},measureText:t=>({width:t.length*12})})});
const make=(count=1,transform=row=>row,profiles={},renderedSignsBySourceId)=>{const parent=new THREE.Group(),registry=createGeneratedRegistry(THREE),sourceId='way/1',generatedId=registry.registerEditableObject(new THREE.Object3D(),{sourceType:'building',sourceId,batchBinding:{setVisible(){},restore(){},cloneGeometry:()=>new THREE.Group()}}),feature={sourceId,generatedId,sourceGeometry:[[[[0,0],[20,0],[20,-10],[0,-10],[0,0]]]],partHeights:[{base:100,wallTop:108}],minY:100,maxY:108};const businesses=Array.from({length:count},(_,i)=>({id:String(i),name:i?'Caf\u00e9 & Company '+i:'First Business',buildingSourceId:sourceId,placementStatus:'approved',placementMode:'street-facing-wall',frontage:[{lat:0,lon:0},{lat:0,lon:20}],fraction:(i+.5)/count,widthMetres:2})).map(transform);return{parent,registry,generatedId,layer:createBusinessSignLayer({THREE,parent,features:[feature],directory:{schemaVersion:1,businesses},project:(lat,lon)=>({x:lon,y:-lat}),generatedRegistry:registry,canvasFactory,profiles,renderedSignsBySourceId})}};
test('atlas signs share the source building visibility and update distance within a city LOD cell',()=>{const {parent,registry,generatedId,layer}=make(3);assert.equal(layer.stats().renderedNames,3);assert.equal(layer.stats().atlasPages,1);const root=parent.children[0],lod=root.children[0];layer.update({position:{x:10,y:104,z:-10}},true);assert.equal(lod.visible,true);registry.hide(generatedId);assert.equal(root.visible,false);layer.update({position:{x:10,y:104,z:-40}},true);assert.equal(root.visible,false);registry.restore(generatedId);assert.equal(root.visible,true);layer.update({position:{x:400,y:104,z:-10}},true);assert.equal(lod.visible,false);layer.update({position:{x:20,y:104,z:-10}});assert.equal(lod.visible,true);for(const mesh of lod.children){assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));assert.ok([...mesh.geometry.attributes.uv.array].every(n=>n>=0&&n<=1));assert.equal(mesh.material.side,THREE.FrontSide)}});
test('all text and identifiers remain in QA metadata and teardown releases renderer resources',()=>{const {layer}=make(2);const samples=layer.samples();assert.equal(samples.length,2);assert.equal(samples[1].name,'Caf\u00e9 & Company 1');assert.equal(samples[0].buildingSourceId,'way/1');assert.equal(layer.stats().meshes,1);layer.dispose();assert.equal(layer.stats().meshes,0)});

test('map-to-street round trip restores distance visibility without overriding editor hiding',()=>{const {parent,layer,registry,generatedId}=make();const root=parent.children[0],lod=root.children[0],camera={position:{x:10,y:104,z:-10}};layer.update(camera,true,'map');assert.equal(lod.visible,false);layer.update(camera,false,'driving');assert.equal(lod.visible,true);registry.hide(generatedId);layer.update(camera,false,'map');layer.update(camera,false,'driving');assert.equal(root.visible,false)});
test('empty or unreadable directories fail closed while a readable directory counts all members',()=>{
 for(const members of [[],Array.from({length:100},(_,i)=>'Tenant '+i)]){const {layer}=make(1,row=>({...row,placementMode:'shared-entrance-directory',members}));assert.equal(layer.stats().renderedNames,0);assert.equal(layer.stats().rejected,1)}
 const {layer}=make(1,row=>({...row,name:'Building directory',placementMode:'shared-entrance-directory',members:['One Company','Two Company','Three Company']}));assert.equal(layer.stats().renderedNames,3);assert.equal(layer.stats().newSignPanels,1);
});

test('footage glazing clearance raises a shop sign above its ground-floor glass',()=>{const {layer}=make(1,row=>row,{'way/1':{style:'retail',eaveHeight:8,levels:2,glazedLevels:[0]}});const sign=layer.samples()[0];assert.ok(sign.center.y-sign.height/2>=104.02-1e-7);assert.ok(Math.abs(sign.center.z)>=.3);layer.dispose()});


test('profile intent without a rendered replacement retains the directory fallback',()=>{
 const {layer}=make(1,row=>row,{'way/1':{style:'retail',height:8,levels:2,signText:'First Business'}});
 assert.equal(layer.stats().existingProfileSigns,0);
 assert.equal(layer.stats().newSignPanels,1);
 assert.equal(layer.samples()[0].existingProfileSign,undefined);
});

test('actual replacement dedup requires the same source, frontage and tenant',()=>{
 const profile={'way/1':{style:'retail',height:8,levels:2,signText:'First Business'}};
 const record={sourceId:'way/1',frontageIndex:1,name:'Second Tenant',text:'SECOND TENANT',frontage:[{lat:0,lon:0},{lat:0,lon:20}]};
 const records=new Map([['way/1',[record]]]);
 const {layer}=make(2,(row,i)=>({...row,name:i?'Second Tenant':'First Business',frontageIndex:i}),profile,records);
 assert.equal(layer.stats().existingProfileSigns,1);
 assert.equal(layer.stats().newSignPanels,1);
 assert.equal(layer.samples().find(s=>s.name==='Second Tenant').frontageIndex,1);
 assert.equal(layer.samples().find(s=>s.name==='First Business').existingProfileSign,undefined);
 for(const wrong of [{...record,sourceId:'way/elsewhere'}, {...record,frontageIndex:0}, {...record,name:'Different Tenant',text:'DIFFERENT'}, {...record,text:''}]){
  const result=make(1,row=>({...row,name:'Second Tenant',frontageIndex:1}),{},new Map([['way/1',[wrong]]])).layer;
  assert.equal(result.stats().existingProfileSigns,0);
  assert.equal(result.stats().newSignPanels,1);
 }
});

test('catalogue rows without frontage indices match actual wall coordinates rather than another side',()=>{
 const record={sourceId:'way/1',frontageIndex:1,name:'First Business',text:'FIRST BUSINESS',frontage:[{lat:0,lon:0},{lat:0,lon:20}]};
 const same=make(1,row=>row,{},new Map([['way/1',[record]]])).layer;
 assert.equal(same.stats().existingProfileSigns,1);
 assert.equal(same.stats().newSignPanels,0);
 const opposite=make(1,row=>({...row,frontage:[{lat:-10,lon:0},{lat:-10,lon:20}]}),{},new Map([['way/1',[record]]])).layer;
 assert.equal(opposite.stats().existingProfileSigns,0);
 assert.equal(opposite.stats().newSignPanels,1);
 const different=make(1,row=>({...row,name:'First Business2'}),{},new Map([['way/1',[record]]])).layer;
 assert.equal(different.stats().existingProfileSigns,0,'a brand prefix does not replace another tenant');
 assert.equal(different.stats().newSignPanels,1);
});
