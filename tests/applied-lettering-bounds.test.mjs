import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createFootageFacade} from '../city-explorer/sherbrooke-footage.js';
const ring=[{x:0,z:0},{x:20,z:0},{x:20,z:10},{x:0,z:10}];
const field={text:'OBSERVED',fraction:.3,heightMetres:2.5,widthMetres:3,panelHeightMetres:.5,outsetMetres:.255};
const profile={id:'way/lettering-fixture',blankFacade:true,entryDoor:null,style:'canopy',height:5,frontLatLon:[{lat:0,lon:0},{lat:0,lon:20}],
 appliedLettering:{businessName:'Observed name',fields:[field]}};
function render(changes={}){
 const original=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillText(){},measureText:t=>({width:t.length*20})})})};
 try{return createFootageFacade({THREE,profile:{...profile,...changes},ring,base:0,top:5,project:(lat,lon)=>({x:lon,z:lat})});}
 finally{globalThis.document=original;}
}
const planes=group=>{const result=[];group.traverse(node=>{if(node.isMesh&&node.material?.map)result.push(node)});return result;};
test('malformed, overflowing or excessive applied groups are rejected atomically',()=>{
 for(const fields of [Array.from({length:5},()=>field),[field,{...field,fraction:NaN}],[{...field,fraction:0}],[{...field,heightMetres:4.9}],[{...field,panelHeightMetres:2}],[{...field,outsetMetres:4}]]){
  const group=render({appliedLettering:{businessName:'Observed name',fields}});assert.equal(planes(group).length,0);assert.deepEqual(group.userData.renderedSigns,[]);
 }
});
test('applied fields do not inherit onto an unrecorded secondary wall',()=>{
 const group=render({additionalFrontages:[{label:'unrecorded return',frontLatLon:[{lat:10,lon:20},{lat:10,lon:0}]}]});
 assert.equal(planes(group).length,1);assert.equal(group.userData.renderedSigns.length,1);assert.equal(group.userData.renderedSigns[0].frontageIndex,0);
});
test('ordinary signText keeps its independent existing rendering path',()=>{
 const group=render({appliedLettering:undefined,signText:'Ordinary name',signBusinessName:'Ordinary name',signStyle:'applied',signWidthMetres:3,signHeightMetres:3});
 assert.equal(planes(group).length,1);assert.equal(group.userData.renderedSigns[0].text,'Ordinary name');assert.equal(group.userData.renderedSigns[0].kind,undefined);
});
