import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createFootageFacade} from '../city-explorer/sherbrooke-footage.js';
const ring=[{x:0,z:0},{x:10,z:0},{x:10,z:8},{x:0,z:8}], project=(lat,lon)=>({x:lon,z:lat});
const source={id:'test',label:'test',style:'office',confidence:'observed',levels:2,windowColumns:2,frontLatLon:[{lat:0,lon:0},{lat:0,lon:10}],facadePhoto:{file:'test.jpg',widthFraction:.15,centerFraction:.4,bottomMetres:3,heightMetres:1,keepProceduralDetails:true}};
function setup(profile=source){let load;class Loader{load(url,onLoad,progress,onError){load={onLoad,onError};}}const group=createFootageFacade({THREE:{...THREE,TextureLoader:Loader},profile,ring,base:0,top:7,project});return {group,load};}
test('a partial photo preserves windows and depth when it succeeds, and keeps fallback on failure',async()=>{
 for(const success of [true,false]){const {group,load}=setup();assert.equal(group.getObjectByName('frontage-procedural-details').visible,true);success?load.onLoad(new THREE.Texture()):load.onError();assert.equal(await group.userData.photoReady,success?'loaded':'failed');assert.equal(group.getObjectByName('frontage-procedural-details').visible,true);assert.equal(!!group.getObjectByName('reviewed-facade-photo'),success);}
});
test('existing full-face photographs still replace the procedural frontage only on success',async()=>{
 const {group,load}=setup({...source,facadePhoto:{...source.facadePhoto,keepProceduralDetails:false}});load.onLoad(new THREE.Texture());await group.userData.photoReady;assert.equal(group.getObjectByName('frontage-procedural-details').visible,false);
});
test('reference garden tints do not change surface geometry or safe-setback checks',()=>{
 const garden={depthMetres:4,pathWidthMetres:1,pathFraction:.5,drivewayWidthMetres:2,drivewayFraction:.1};
 const make=g=>createFootageFacade({THREE,profile:{...source,facadePhoto:undefined,frontGarden:g},ring,base:0,top:7,project,terrainHeightAtWorld:()=>0,gardenClear:(x,z)=>z<=0});
 const a=make(garden),b=make({...garden,pathColor:'#85827b',drivewayColor:'#514f4b'});
 for(const [name,color]of [['front-garden-path','85827b'],['front-garden-driveway','514f4b']]){const before=a.getObjectByName(name),after=b.getObjectByName(name);assert.ok(after);assert.deepEqual(after.geometry.attributes.position.array,before.geometry.attributes.position.array);assert.equal(after.material.color.getHexString(),color);}
});
