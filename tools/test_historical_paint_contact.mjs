import test from 'node:test';
import assert from 'node:assert/strict';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
import {renderHistoricalPaintProfile} from '../city-explorer/historical-paint-profiles.js';
function rect(index,x0,x1,height,layer='road_surfaces'){
 index.addTriangle(x0,height,-1,x1,height,-1,x1,height,1,{layer});index.addTriangle(x0,height,-1,x1,height,1,x0,height,1,{layer});
}
const profile={strokes:[{points:[{x:-2501,z:0,station:0},{x:-2499,z:0,station:2}],width:.13,kind:'solid'}]};
test('supported real height step retains full eligible border with only bounded local unresolved contact patches',()=>{
 const index=new RenderedPavementIndex();rect(index,-2502,-2500.123,10);rect(index,-2500.123,-2498,10.2);
 const before=JSON.stringify(profile),result=renderHistoricalPaintProfile(profile,index);
 assert.ok(result.positions.length>0,'a local height discontinuity must not erase the entire supported stroke');
 assert.ok(result.contact.omittedPatchCount>0);assert.ok(result.contact.omittedAreaM2<.002);
 assert.ok(result.contact.maxAffectedStationSpanM<.005);assert.equal(JSON.stringify(profile),before);
 const p=Float32Array.from(result.positions);
 for(let i=0;i<p.length;i+=9){
  const upward=(p[i+5]-p[i+2])*(p[i+6]-p[i])-(p[i+3]-p[i])*(p[i+8]-p[i+2]);
  assert.ok(upward>0,'no collapsed or downward Float32 triangles');
  for(const w of [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]){
   const [x,y,z]=[0,1,2].map(a=>p[i+a]*w[0]+p[i+3+a]*w[1]+p[i+6+a]*w[2]);
   const h=index.sample(x,z,y,{includeParking:false,includeBridges:false});assert.ok(h);
   assert.ok(Math.abs(y-h.height-.008)<=.00151);
  }
 }
});
test('a missing ROAD-support patch still omits the entire stroke, never merely a contact leaf',()=>{
 const index=new RenderedPavementIndex();rect(index,-2502,-2500.2,10);rect(index,-2499.8,-2498,10);
 const result=renderHistoricalPaintProfile(profile,index);assert.equal(result.positions.length,0);assert.equal(result.reviewed,false);
 assert.equal(result.contact.omittedPatchCount,0,'unsupported stroke is not disguised as a tiny contact gap');
});
