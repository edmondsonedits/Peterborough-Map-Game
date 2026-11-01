import test from 'node:test';import assert from 'node:assert/strict';
import {buildRoadMarkingLayout} from '../city-explorer/road-marking-layout.js';
const tags={highway:'secondary',oneway:'yes',lanes:'2',name:'Test Road'};
function segment(id,a,b,start=0,extra={}){return{a:{x:a[0],y:a[1]},b:{x:b[0],y:b[1]},aY:0,bY:0,chainStart:start,lineId:id,width:7,profile:{highway:'secondary',oneWay:true,lanes:2,width:7,renderClass:'arterial'},tags:{...tags},...extra};}
function ranges(layout){return layout.markings.filter(m=>m.kind==='dash').map(m=>[m.path.startDistance,m.path.endDistance]);}
function groupByLateralOffset(markings){const groups=new Map();for(const m of markings){const key=Math.round(m.path.points[0].z*1e3);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}return [...groups.values()];}
test('dash lengths and phases ignore arbitrary sampled segment subdivisions',()=>{
 const single=buildRoadMarkingLayout([segment('a',[0,0],[40,0])]);
 const split=buildRoadMarkingLayout([segment('a',[0,0],[3,0]),segment('a',[3,0],[7,0],3),segment('a',[7,0],[40,0],7)]);
 assert.deepEqual(ranges(split),ranges(single));for(const[a,b]of ranges(single).slice(0,-1))assert.ok(Math.abs(b-a-3)<1e-6);
 for(let i=1;i<ranges(single).length;i++)assert.ok(Math.abs(ranges(single)[i][0]-ranges(single)[i-1][1]-6)<1e-6);
});
test('multi-lane urban arterials at 70 km/h use the rural 3 m on, 9 m off pattern',()=>{
 const layout=buildRoadMarkingLayout([segment('fast',[0,0],[48,0],0,{tags:{...tags,maxspeed:'70'}})]),dashes=ranges(layout);
 assert.ok(dashes.length>1);for(const[a,b]of dashes)assert.ok(Math.abs(b-a-3)<1e-6);
 for(let i=1;i<dashes.length;i++)assert.ok(Math.abs(dashes[i][0]-dashes[i-1][1]-9)<1e-6);
});
test('a dashed yellow directional divider stays 3 m on, 6 m off at 90 km/h',()=>{
 const t={highway:'secondary',lanes:'4','lanes:forward':'2','lanes:backward':'2',divider:'dashed_line',maxspeed:'90'};
 const p={highway:'secondary',oneWay:false,lanes:4,width:14,renderClass:'arterial'};
 const layout=buildRoadMarkingLayout([segment('fast-two-way',[0,0],[60,0],0,{width:14,tags:t,profile:p})]);
 const yellow=layout.markings.filter(m=>m.kind==='dash'&&m.materialKey==='roadPaintYellow');assert.ok(yellow.length>1);
 for(const m of yellow)assert.ok(Math.abs(m.path.endDistance-m.path.startDistance-3)<1e-6);
 for(let i=1;i<yellow.length;i++)assert.ok(Math.abs(yellow[i].path.startDistance-yellow[i-1].path.endDistance-6)<1e-6);
});
test('a speed-regime way joint keeps each marking rule on its applicable dash rhythm',()=>{
 const base={highway:'secondary',lanes:'4','lanes:forward':'2','lanes:backward':'2',divider:'dashed_line'};
 const p={highway:'secondary',oneWay:false,lanes:4,width:14,renderClass:'arterial'};
 const a=segment('a',[0,0],[21,0],0,{width:14,tags:{...base,maxspeed:'70'},profile:p,aNodeId:1,bNodeId:2});
 const b=segment('b',[21,0],[50,0],0,{width:14,tags:{...base,maxspeed:'60'},profile:p,aNodeId:2,bNodeId:3});
 const layout=buildRoadMarkingLayout([a,b]);
 assert.ok(!layout.markings.some(m=>m.kind==='dash'&&m.lineIds.includes('a')&&m.lineIds.includes('b')));
 const yellowA=layout.markings.filter(m=>m.materialKey==='roadPaintYellow'&&m.lineIds.includes('a'));
 const yellowB=layout.markings.filter(m=>m.materialKey==='roadPaintYellow'&&m.lineIds.includes('b'));
 assert.ok(yellowA.length&&yellowB.length);for(const m of [...yellowA,...yellowB])assert.ok(m.path.endDistance-m.path.startDistance<=3+1e-6);
 for(const set of [yellowA,yellowB]){const full=set.filter(m=>Math.abs(m.path.endDistance-m.path.startDistance-3)<1e-6).sort((x,y)=>x.path.startDistance-y.path.startDistance);for(let i=1;i<full.length;i++)assert.ok(Math.abs(full[i].path.startDistance-full[i-1].path.endDistance-6)<1e-6);}
 const whiteA=layout.markings.filter(m=>m.kind==='dash'&&m.materialKey==='roadPaintWhite'&&m.lineIds.includes('a'));
 const whiteB=layout.markings.filter(m=>m.kind==='dash'&&m.materialKey==='roadPaintWhite'&&m.lineIds.includes('b'));
 assert.ok(whiteA.length&&whiteB.length);for(const m of whiteA)assert.ok(m.path.endDistance-m.path.startDistance<=3+1e-6);
 for(const group of groupByLateralOffset(whiteA)){const full=group.filter(m=>Math.abs(m.path.endDistance-m.path.startDistance-3)<1e-6).sort((x,y)=>x.path.startDistance-y.path.startDistance);for(let i=1;i<full.length;i++)assert.ok(Math.abs(full[i].path.startDistance-full[i-1].path.endDistance-9)<1e-6);}
 for(const m of whiteB)assert.ok(m.path.endDistance-m.path.startDistance<=3+1e-6);
 for(const group of groupByLateralOffset(whiteB)){const full=group.filter(m=>Math.abs(m.path.endDistance-m.path.startDistance-3)<1e-6).sort((x,y)=>x.path.startDistance-y.path.startDistance);for(let i=1;i<full.length;i++)assert.ok(Math.abs(full[i].path.startDistance-full[i-1].path.endDistance-6)<1e-6);}
});
test('vehicle lane and cycle separators use 10 cm stripes while highway edge lines retain their separate width',()=>{
 const road=buildRoadMarkingLayout([segment('road',[0,0],[40,0])]);
 assert.ok(road.markings.length>0);for(const marking of road.markings)assert.ok(Math.abs(marking.path.width-.1)<1e-9);
 const cycle=buildRoadMarkingLayout([segment('cycle',[0,0],[40,0],0,{tags:{...tags,cycleway:'lane','cycleway:right':'lane'}})]);
 const separators=cycle.markings.filter(m=>m.kind==='cycle-edge');assert.ok(separators.length>0);
 for(const marking of separators)assert.ok(Math.abs(marking.path.width-.1)<1e-9);
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
 assert.ok(ranges(layout).some(([a])=>Math.abs(a-18)<1e-6));
});
test('nearby disconnected nodes, different grades and different lane layouts do not merge',()=>{
 for(const extra of [{aNodeId:9},{aNodeId:2,tags:{...tags,layer:'1'}},{aNodeId:2,width:10,profile:{highway:'secondary',oneWay:true,lanes:3,width:10},tags:{...tags,lanes:'3'}}]){
 const r=buildRoadMarkingLayout([segment('a',[0,0],[10,0],0,{bNodeId:2}),segment('b',[10,0],[30,0],0,extra)]);assert.equal(r.stats.joinedWayEndpoints,0);
 }
});

test('a dash crossing a way split keeps joined geometry but precise per-piece source ranges',()=>{
 const layout=buildRoadMarkingLayout([segment('a',[0,0],[10,0],0,{aNodeId:1,bNodeId:2}),segment('b',[10,0],[40,0],0,{aNodeId:2,bNodeId:3})]);
 const dash=layout.markings.find(m=>m.path.startDistance<10&&m.path.endDistance>10);assert.ok(dash);
 assert.ok(dash.pieces?.length>=2);for(const piece of dash.pieces){assert.equal(piece.lineIds.length,1);const points=piece.polygons.flat();if(piece.lineIds[0]==='a')assert.ok(points.every(p=>p.sourceDistance<=10+1e-6));else assert.ok(points.every(p=>p.sourceDistance>=10-1e-6));}
});

test('a closed road loop fits one uniform dash rhythm without a short seam fragment',()=>{
 const points=[[0,0],[10,0],[10,10],[0,10],[0,0]],segs=[];for(let i=1;i<points.length;i++)segs.push(segment('loop',points[i-1],points[i],(i-1)*10));
 const dashes=buildRoadMarkingLayout(segs).markings.filter(m=>m.kind==='dash');assert.equal(dashes.length,4);for(const m of dashes)assert.ok(Math.abs(m.path.endDistance-m.path.startDistance-10/3)<1e-6);assert.ok(Math.abs(40-dashes.at(-1).path.endDistance+dashes[0].path.startDistance-20/3)<1e-6);
});
