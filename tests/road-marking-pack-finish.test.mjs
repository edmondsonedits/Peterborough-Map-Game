import test from 'node:test';
import assert from 'node:assert/strict';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
import {createVisibleMarkingIndex,finishPaintGroup} from '../city-explorer/road-marking-pack-finish.js';

function plane(index,x0,x1,z0,z1,y,metadata={}){
 const tri=(a,b,c)=>index.addTriangle(...a,...b,...c,{layer:'road_surfaces',...metadata});
 tri([x0,y,z0],[x1,y,z0],[x1,y,z1]);tri([x0,y,z0],[x1,y,z1],[x0,y,z1]);
}
function group(triangles,sourceRanges=[{sourceId:'way/1',startVertex:0,vertexCount:triangles.length*3}]){
 return {materialKey:'paint:white',kind:'paint',layer:'road_markings',contact:null,
  positions:new Float32Array(triangles.flat()),sourceRanges};
}
function tri(x0,x1,z0,z1,y){return [x0,y,z0,x1,y,z0,x0,y,z1];}
const area=positions=>{let n=0;for(let i=0;i<positions.length;i+=9)n+=Math.abs((positions[i+3]-positions[i])*(positions[i+8]-positions[i+2])-(positions[i+6]-positions[i])*(positions[i+5]-positions[i+2]))/2;return n;};

test('repairs paint occluded by a coincident face 2 cm above the ordinary road',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-2,2,-2,2,0);plane(index,-2,2,-2,2,.02,{layer:'bridges'});
 const input=group([tri(-1,1,-1,1,.012)]),{group:output,stats}=finishPaintGroup(input,[index]);
 assert.ok(stats.repairedTriangles>0);assert.ok(output.positions.length>0);
 for(let i=0;i<output.positions.length;i+=9){const x=(output.positions[i]+output.positions[i+3]+output.positions[i+6])/3,z=(output.positions[i+2]+output.positions[i+5]+output.positions[i+8])/3;
  const visible=index.sample(x,z,null,{includeParking:false});assert.ok(visible);const y=(output.positions[i+1]+output.positions[i+4]+output.positions[i+7])/3;assert.ok(y-visible.height>=.006&&y-visible.height<=.025);
 }
});

test('repairs clearance just below the verifier 6 mm minimum',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-2,2,-2,2,0);
 const input=group([tri(-1,1,-1,1,.005995)]),{group:output,stats}=finishPaintGroup(input,[index]);
 assert.ok(stats.repairedTriangles>0);assert.notDeepEqual([...output.positions],[...input.positions]);
 for(let i=0;i<output.positions.length;i+=9){const x=(output.positions[i]+output.positions[i+3]+output.positions[i+6])/3,z=(output.positions[i+2]+output.positions[i+5]+output.positions[i+8])/3;
  const support=index.sample(x,z,null,{includeParking:false});assert.ok(support);const y=(output.positions[i+1]+output.positions[i+4]+output.positions[i+7])/3;assert.ok(y-support.height>=.006&&y-support.height<=.025);
 }
});

test('repairs only the supported portion at a source-edge pavement hole and keeps source attribution',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-2,-.25,-2,2,0);plane(index,.25,2,-2,2,0);
 const input=group([tri(-1,1,-.6,.6,.012)]),{group:output,stats}=finishPaintGroup(input,[index]);
 assert.ok(output.positions.length>0);assert.ok(stats.droppedTriangles>=0);assert.ok(Math.abs(stats.inputArea-stats.outputArea-stats.suppressedArea)<1e-6);
 assert.ok(output.sourceRanges.some(r=>r.sourceId==='way/1'&&r.vertexCount===output.positions.length/3));
 for(let i=0;i<output.positions.length;i+=9){const x=(output.positions[i]+output.positions[i+3]+output.positions[i+6])/3;assert.ok(x<=-.25+1e-5||x>=.25-1e-5);}
});

test('does not drop an unsupported upper stripe onto a lower road within 0.5 m',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-2,2,-2,2,0);plane(index,-2,-.2,-2,2,.405,{layer:'bridges'});
 const input=group([tri(-1,1,-.3,.3,.417)]),{group:output,stats}=finishPaintGroup(input,[index]);
 assert.ok(output.positions.length>0);assert.ok(stats.suppressedArea>0);
 for(let i=0;i<output.positions.length;i+=9){const x=(output.positions[i]+output.positions[i+3]+output.positions[i+6])/3;assert.ok(x<-.2+1e-5,'paint remains only over the upper support');}
});

test('maps split output ranges to each original triangle and is idempotent',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-2,-.1,-2,2,0);plane(index,.1,2,-2,2,0);
 const input=group([tri(-1,0,-.5,.5,.02),tri(0,1,-.5,.5,.02)],[{sourceId:'way/a',startVertex:0,vertexCount:3},{sourceId:'way/b',startVertex:3,vertexCount:3}]);
 const first=finishPaintGroup(input,[index]),second=finishPaintGroup(first.group,[index]);
 for(let t=0;t<first.group.positions.length/9;t++){
  const startVertex=t*3,ids=first.group.sourceRanges.filter(r=>startVertex>=r.startVertex&&startVertex+3<=r.startVertex+r.vertexCount).map(r=>r.sourceId);
  const x=(first.group.positions[t*9]+first.group.positions[t*9+3]+first.group.positions[t*9+6])/3;
  assert.deepEqual(ids,[x<0?'way/a':'way/b'],'each clipped output triangle retains its actual source line');
 }
 assert.deepEqual([...second.group.positions],[...first.group.positions]);assert.equal(second.stats.repairedTriangles,0);
 assert.deepEqual(second.group.sourceRanges,first.group.sourceRanges);
});

test('leaves non-paint groups unchanged',()=>{
 const input={kind:'road',positions:new Float32Array([1,2,3])};const result=finishPaintGroup(input,[]);
 assert.equal(result.group,input);assert.equal(result.stats.inputTriangles,0);
});

test('visible index chooses the upper coincident face but will not lower a high-grade query',()=>{
 const index=new RenderedPavementIndex(2);plane(index,-2,2,-2,2,0);plane(index,-2,2,-2,2,.02,{layer:'bridges'});
 const visible=createVisibleMarkingIndex([index],{maxLowering:.025,maxHeightDelta:.5});
 assert.ok(Math.abs(visible.sample(0,0,0).height-.02)<1e-7);
 const lowerOnly=new RenderedPavementIndex(2);plane(lowerOnly,-2,2,-2,2,0);
 const guarded=createVisibleMarkingIndex([lowerOnly],{maxLowering:.025,maxHeightDelta:.5});
 assert.equal(guarded.sample(0,0,.405),null);
});
