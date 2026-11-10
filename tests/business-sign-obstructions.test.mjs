import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createBusinessSignLayer} from '../city-explorer/business-signs.js';
import {createGeneratedRegistry} from '../city-explorer/editor/generated-registry.js';
import {createFootageFacade} from '../city-explorer/sherbrooke-footage.js';
import {FOOTAGE_PROFILES} from '../city-explorer/sherbrooke-footage-profiles.js';
import {addRouteLandmarkAppearances} from '../city-explorer/route-landmark-appearances.js';
import {planRecordedEnclosedBays} from '../city-explorer/recorded-enclosed-bays.js';
import {enclosedBayObstructions} from '../city-explorer/business-sign-obstructions.js';
const profiles=addRouteLandmarkAppearances(FOOTAGE_PROFILES);
const osm=JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url),'utf8'));
const directory=JSON.parse(await readFile(new URL('../city-explorer/data/business-directory.json',import.meta.url),'utf8'));
const project=(lat,lon)=>({x:(lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),z:-(lat-44.3091)*110540});
const canvasFactory=()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){},measureText:text=>({width:text.length*7})})});
function fixture(id,{transformRow=row=>row,transformProfile=profile=>profile,lowPower=false}={}){
 const sourceId='way/'+id,way=osm.elements.find(e=>e.type==='way'&&e.id===id),profile=transformProfile(structuredClone(profiles[sourceId]));
 const ring=way.geometry.slice(0,-1).map(p=>project(p.lat,p.lon)),parent=new THREE.Group(),registry=createGeneratedRegistry(THREE);
 const generatedId=registry.registerEditableObject(new THREE.Object3D(),{sourceType:'building',sourceId,batchBinding:{setVisible(){},restore(){},cloneGeometry:()=>new THREE.Group()}});
 const row=transformRow(structuredClone(directory.businesses.find(r=>r.buildingSourceId===sourceId)));
 const feature={sourceId,generatedId,sourceGeometry:[[way.geometry.map(p=>[p.lon,p.lat])]],properties:way.tags,partHeights:[{base:0,wallTop:profile.eaveHeight}],minY:0,maxY:profile.height};
 const layer=createBusinessSignLayer({THREE,parent,features:[feature],directory:{businesses:[row]},project,generatedRegistry:registry,profiles:{[sourceId]:profile},canvasFactory,lowPower});
 const facade=createFootageFacade({THREE,profile,ring,base:0,top:profile.eaveHeight,project,lite:lowPower});facade.updateMatrixWorld(true);
 return{layer,facade,row,profile};
}
function occludedSamples(sample,facade){
 let hits=0;for(let x=0;x<11;x++)for(let y=0;y<5;y++){
  const right={x:sample.normal.z,z:-sample.normal.x},target=new THREE.Vector3(sample.center.x+right.x*sample.width*((x+.5)/11-.5),sample.center.y+sample.height*((y+.5)/5-.5),sample.center.z+right.z*sample.width*((x+.5)/11-.5));
  const origin=target.clone().add(new THREE.Vector3(sample.normal.x*10,0,sample.normal.z*10));
  if(new THREE.Raycaster(origin,target.clone().sub(origin).normalize(),0,9.99999).intersectObject(facade,true).length)hits++;
 }return hits;
}
test('actual Water directory markers clear the production bay geometry in their reviewed ground-floor bands',()=>{
 for(const id of [1006243558,1006243559])for(const lowPower of [false,true]){
  const {layer,facade,row}=fixture(id,{lowPower}),sign=layer.samples()[0];assert.ok(sign,row.name);
  assert.equal(occludedSamples(sign,facade),0,`${row.name}: no bay, sill or storefront pier hides the marker`);
  assert.equal(sign.placementEvidence?.kind,'estimated-educational-marker');
  assert.equal(sign.placementEvidence?.reviewedDirectoryId,row.id);
  assert.equal(sign.placementEvidence?.observedSign,false);
  const band=id===1006243558?[2.55,2.95]:[2.6,3];
  assert.ok(sign.center.y-sign.height/2>=band[0]&&sign.center.y+sign.height/2<=band[1]);
  assert.ok(sign.height<=.35+1e-8);assert.equal(layer.stats().renderedNames,1);assert.equal(layer.stats().existingProfileSigns,0);
 }
});
test('a conflicting unknown identity or absent reviewed band is withheld instead of shifted or pushed through a bay',()=>{
 for(const changes of [{transformRow:row=>({...row,id:'unreviewed'})},{transformRow:row=>({...row,name:row.name+' Other'})},{transformProfile:profile=>({...profile,directoryMarkerBands:undefined})}]){
  const {layer}=fixture(1006243558,changes);assert.equal(layer.samples().length,0);assert.ok(layer.rejected().some(r=>r.reason==='reviewed-bay-obstruction'));
 }
});
for(const [label,bands]of [['object instead of array',{}],['null row',[null]]])test(`malformed marker data (${label}) rejects the conflicting sign without throwing`,()=>{
 const {layer}=fixture(1006243558,{transformProfile:profile=>({...profile,directoryMarkerBands:bands})});
 assert.equal(layer.samples().length,0);assert.equal(layer.stats().renderedNames,0);
 assert.equal(layer.rejected()[0].reason,'reviewed-bay-obstruction');
});
test('a malformed row prevents partial acceptance of an otherwise matching marker band',()=>{
 const {layer}=fixture(1006243558,{transformProfile:profile=>({...profile,directoryMarkerBands:[null,...profile.directoryMarkerBands]})});
 assert.equal(layer.samples().length,0);assert.equal(layer.rejected()[0].reason,'reviewed-bay-obstruction');
});
test('clear original directory candidates stay unchanged even when a reviewed marker band exists',()=>{
 const {layer}=fixture(1006243558,{transformRow:row=>({...row,fraction:.2})}),sign=layer.samples()[0];
 assert.ok(sign);assert.equal(sign.placementEvidence,undefined);assert.ok(sign.center.y>3.3);assert.equal(sign.height,.54);
});
test('invalid or still-obstructed bands cannot relocate a sign, and another source wall does not inherit the band',()=>{
 for(const change of [{bottomMetres:NaN},{topMetres:30},{heightMetres:.8},{bottomMetres:3.3,topMetres:3.9}]){
  const {layer}=fixture(1006243558,{transformProfile:profile=>({...profile,directoryMarkerBands:profile.directoryMarkerBands.map(band=>({...band,...change}))})});
  assert.equal(layer.samples().length,0);assert.equal(layer.rejected()[0].reason,'reviewed-bay-obstruction');
 }
 const {layer}=fixture(1006243558,{transformRow:row=>({...row,frontage:[{lat:44.3052394,lon:-78.3192127},{lat:44.3052438,lon:-78.319009}],fraction:.5})});
 assert.equal(layer.samples().length,1);assert.equal(layer.samples()[0].placementEvidence,undefined);
});
test('obstruction spans use clamped bay dimensions, actual plane depth, and only explicitly joined spandrels',()=>{
 const frame={start:{x:0,z:0},tangent:{x:1,z:0},outward:{x:0,z:1},length:8.4};
 const source={fraction:.78,widthMetres:2.25,bottomMetres:3.15,heightMetres:2.55,depthMetres:.55};
 const sample={centerAlong:frame.length*.78,bottom:5.9,top:6.1,width:.5,outset:.34};
 const options={frame,height:9.4,specs:[source,{...source,bottomMetres:6.25}]};
 assert.equal(enclosedBayObstructions(planRecordedEnclosedBays(options),sample).length,0,'no phantom volume in a disconnected floor gap');
 const joined=planRecordedEnclosedBays({...options,specs:[{...source,joinToNext:true},options.specs[1]]});
 assert.equal(enclosedBayObstructions(joined,sample)[0].join,true);
 assert.equal(enclosedBayObstructions(joined,{...sample,outset:.7}).length,0,'a plane ahead of the actual projection is not embedded');
 const clamped=planRecordedEnclosedBays({...options,specs:[{...source,fraction:2,widthMetres:40,depthMetres:50}]});
 assert.equal(clamped.bays[0].summary.widthMetres,4);assert.equal(clamped.bays[0].summary.depthMetres,1.2);
 assert.ok(clamped.bays[0].outline.every(p=>p.x>=0&&p.x<=frame.length));
 assert.equal(enclosedBayObstructions(clamped,{...sample,bottom:4,top:4.5,outset:1.4}).length,0);
 assert.equal(planRecordedEnclosedBays({...options,frame:{...frame,outward:{x:1,z:0}}}).bays.length,0);
});
