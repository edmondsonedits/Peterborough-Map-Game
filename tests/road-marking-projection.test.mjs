import test from 'node:test';
import assert from 'node:assert/strict';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
import {drapePaintStrip} from '../city-explorer/street-paint.js';

function plane(index,x0,x1,z0,z1,height,metadata={}){
 const p=(x,z)=>height(x,z);
 index.addTriangle(x0,p(x0,z0),z0,x1,p(x1,z0),z0,x1,p(x1,z1),z1,{layer:'road_surfaces',...metadata});
 index.addTriangle(x0,p(x0,z0),z0,x1,p(x1,z1),z1,x0,p(x0,z1),z1,{layer:'road_surfaces',...metadata});
}
function area(positions){let total=0;for(let i=0;i<positions.length;i+=9)total+=Math.abs((positions[i+3]-positions[i])*(positions[i+8]-positions[i+2])-(positions[i+6]-positions[i])*(positions[i+5]-positions[i+2]))/2;return total;}
const options=index=>({spacing:4,lift:.012,pavementIndices:[index]});
test('paint follows the exact face break at a road crest instead of cutting through it',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-3,0,-2,2,x=>x*.25);plane(index,0,3,-2,2,x=>-x*.25);
 const sample=(x,z)=>index.sample(x,z)?.height;
 const positions=drapePaintStrip({x:-2,z:0},{x:2,z:0},.15,sample,options(index));
 assert.ok(positions.length);assert.ok(Math.abs(area(positions)-.6)<1e-5);
 for(let i=0;i<positions.length;i+=9){const x=(positions[i]+positions[i+3]+positions[i+6])/3,z=(positions[i+2]+positions[i+5]+positions[i+8])/3,y=(positions[i+1]+positions[i+4]+positions[i+7])/3;assert.ok(Math.abs(y-sample(x,z)-.012)<1e-5,'every paint triangle lies above its support plane at its interior');}
});
test('exact clipping preserves supported paint up to a pavement hole without dropping a whole span',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-3,-.4,-2,2,()=>0);plane(index,.4,3,-2,2,()=>0);
 const positions=drapePaintStrip({x:-2,z:0},{x:2,z:0},.15,(x,z)=>index.sample(x,z)?.height,options(index));
 assert.ok(Math.abs(area(positions)-3.2*.15)<1e-5,'only the exact unsurfaced .8m gap is omitted');
 for(let i=0;i<positions.length;i+=9){const xs=[positions[i],positions[i+3],positions[i+6]];assert.ok(Math.max(...xs)<=-.4+1e-6||Math.min(...xs)>=.4-1e-6);}
});
test('paint keeps its reference deck and excludes parking faces',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-3,3,-2,2,()=>0);plane(index,-3,3,-2,2,()=>8,{layer:'bridges'});plane(index,4,7,-2,2,()=>0,{layer:'parking_surfaces'});
 const sampler=(x,z)=>index.sample(x,z,8)?.height;
 const positions=drapePaintStrip({x:-2,z:0},{x:2,z:0},.15,sampler,{...options(index),referenceHeight:8});
 assert.ok(positions.length);for(let i=1;i<positions.length;i+=3)assert.ok(Math.abs(positions[i]-8.012)<1e-5);
 const parking=drapePaintStrip({x:4.2,z:0},{x:6.8,z:0},.15,(x,z)=>index.sample(x,z)?.height,options(index));assert.equal(parking.length,0);
});

test('coincident pavement meshes with different triangulations paint each area only once',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-3,3,-2,2,()=>0);
 index.addTriangle(-3,0,-2,3,0,-2,-3,0,2,{layer:'road_surfaces'});index.addTriangle(3,0,-2,3,0,2,-3,0,2,{layer:'road_surfaces'});
 const positions=drapePaintStrip({x:-2,z:0},{x:2,z:0},.15,(x,z)=>index.sample(x,z)?.height,options(index));assert.ok(Math.abs(area(positions)-.6)<1e-5,'overlapping support triangulations do not duplicate painted area');
});

test('a bridge stripe stops at the upper deck edge instead of dropping onto the lower road',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-3,3,-2,2,()=>0);plane(index,-3,0,-2,2,()=>8,{layer:'bridges'});
 const positions=drapePaintStrip({x:-2,z:0},{x:2,z:0},.15,(x,z)=>index.sample(x,z,8)?.height,{...options(index),referenceHeight:8});
 assert.ok(positions.length);assert.ok(Math.abs(area(positions)-.3)<1e-5);for(let i=0;i<positions.length;i+=3){assert.ok(positions[i]<=1e-6);assert.ok(Math.abs(positions[i+1]-8.012)<1e-5);}
});
