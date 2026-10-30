import test from 'node:test';import assert from 'node:assert/strict';
import {buildRoadMarkingLayout} from '../city-explorer/road-marking-layout.js';
const tags={highway:'secondary',oneway:'yes',lanes:'2',name:'Test Road'};
function segment(id,a,b,start=0,extra={}){return{a:{x:a[0],y:a[1]},b:{x:b[0],y:b[1]},aY:0,bY:0,chainStart:start,lineId:id,width:7,profile:{highway:'secondary',oneWay:true,lanes:2,width:7,renderClass:'arterial'},tags:{...tags},...extra};}
function ranges(layout){return layout.markings.filter(m=>m.kind==='dash').map(m=>[m.path.startDistance,m.path.endDistance]);}
test('dash lengths and phases ignore arbitrary sampled segment subdivisions',()=>{
 const single=buildRoadMarkingLayout([segment('a',[0,0],[40,0])]);
 const split=buildRoadMarkingLayout([segment('a',[0,0],[3,0]),segment('a',[3,0],[7,0],3),segment('a',[7,0],[40,0],7)]);
 assert.deepEqual(ranges(split),ranges(single));for(const[a,b]of ranges(single).slice(0,-1))assert.ok(Math.abs(b-a-4.2)<1e-6);
});
test('solid markings share exact stroke ends through a mapped bend',()=>{
 const t={highway:'secondary',lanes:'2'};const p={highway:'secondary',oneWay:false,lanes:2,width:7};
 const layout=buildRoadMarkingLayout([segment('a',[0,0],[10,0],0,{tags:t,profile:p}),segment('a',[10,0],[14,8],10,{tags:t,profile:p})]);
 const solid=layout.markings.filter(m=>m.kind==='solid');assert.equal(solid.length,1);assert.ok(solid[0].polygons.length>=2);
 assert.deepEqual(solid[0].polygons[0][3],solid[0].polygons[1][0]);assert.deepEqual(solid[0].polygons[0][2],solid[0].polygons[1][1]);
});
test('explicit same-grade way splits keep one dash chain and precise source attribution',()=>{
 const layout=buildRoadMarkingLayout([segment('a',[0,0],[13,0],0,{aNodeId:1,bNodeId:2}),segment('b',[13,0],[40,0],0,{aNodeId:2,bNodeId:3})]);
 assert.equal(layout.stats.joinedWayEndpoints,1);assert.deepEqual(ranges(layout),ranges(buildRoadMarkingLayout([segment('x',[0,0],[40,0])])));
 assert.deepEqual(layout.markings[0].lineIds,['a']);assert.deepEqual(layout.markings.at(-1).lineIds,['b']);
});
test('way directions may reverse only when directional lane rules remain compatible',()=>{
 const t={highway:'secondary',lanes:'2'};const p={highway:'secondary',oneWay:false,lanes:2,width:7};
 const layout=buildRoadMarkingLayout([segment('a',[0,0],[10,0],0,{tags:t,profile:p,bNodeId:2}),segment('b',[20,0],[10,0],0,{tags:t,profile:p,bNodeId:2})]);assert.equal(layout.stats.joinedWayEndpoints,1);
 const wrong=buildRoadMarkingLayout([segment('a',[0,0],[10,0],0,{bNodeId:2}),segment('b',[20,0],[10,0],0,{bNodeId:2})]);assert.equal(wrong.stats.joinedWayEndpoints,0);
});
test('junction cuts suppress paint without resetting dash rhythm beyond the mouth',()=>{
 const s=segment('a',[0,0],[40,0]);const context={cutsByLine:new Map([['a',[{start:12,end:18}]]]),segmentLengths:new Map([[s,40]])};
 const layout=buildRoadMarkingLayout([s],{paintContext:context});
 for(const m of layout.markings){const lo=Math.min(...m.path.points.map(p=>p.sourceDistance)),hi=Math.max(...m.path.points.map(p=>p.sourceDistance));assert.ok(hi<=12||lo>=18);}
 assert.ok(ranges(layout).some(([a])=>Math.abs(a-21)<1e-6));
});
test('nearby disconnected nodes, different grades and different lane layouts do not merge',()=>{
 for(const extra of [{aNodeId:9},{aNodeId:2,tags:{...tags,layer:'1'}},{aNodeId:2,width:10,profile:{highway:'secondary',oneWay:true,lanes:3,width:10},tags:{...tags,lanes:'3'}}]){
 const r=buildRoadMarkingLayout([segment('a',[0,0],[10,0],0,{bNodeId:2}),segment('b',[10,0],[30,0],0,extra)]);assert.equal(r.stats.joinedWayEndpoints,0);
 }
});

test('a dash crossing a way split keeps joined geometry but precise per-piece source ranges',()=>{
 const layout=buildRoadMarkingLayout([segment('a',[0,0],[13,0],0,{aNodeId:1,bNodeId:2}),segment('b',[13,0],[40,0],0,{aNodeId:2,bNodeId:3})]);
 const dash=layout.markings.find(m=>m.path.startDistance<13&&m.path.endDistance>13);assert.ok(dash);
 assert.ok(dash.pieces?.length>=2);for(const piece of dash.pieces){assert.equal(piece.lineIds.length,1);const points=piece.polygons.flat();if(piece.lineIds[0]==='a')assert.ok(points.every(p=>p.sourceDistance<=13+1e-6));else assert.ok(points.every(p=>p.sourceDistance>=13-1e-6));}
});

test('a closed road loop fits one uniform dash rhythm without a short seam fragment',()=>{
 const points=[[0,0],[10,0],[10,10],[0,10],[0,0]],segs=[];for(let i=1;i<points.length;i++)segs.push(segment('loop',points[i-1],points[i],(i-1)*10));
 const dashes=buildRoadMarkingLayout(segs).markings.filter(m=>m.kind==='dash');assert.equal(dashes.length,4);for(const m of dashes)assert.ok(Math.abs(m.path.endDistance-m.path.startDistance-4)<1e-6);assert.ok(Math.abs(40-dashes.at(-1).path.endDistance+dashes[0].path.startDistance-6)<1e-6);
});
