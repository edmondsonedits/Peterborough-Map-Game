import test from 'node:test';import assert from 'node:assert/strict';import {verifyRoadMarkings} from '../tools/verify-road-markings.mjs';
const road={kind:'official-road_surfaces',contact:'official',layer:'road_surfaces',positions:new Float32Array([0,0,0,5,0,0,0,0,5,5,0,0,5,0,5,0,0,5])};
const paint=(y=.012,x=1)=>({kind:'paint',contact:null,materialKey:'roadPaintWhite',positions:new Float32Array([x,y,1,x+1,y,1,x,y,2])});
function run(groups){const tile={id:'0:0',bounds:{minX:0,maxX:10,minZ:0,maxZ:10}};return verifyRoadMarkings({buildId:'test',tiles:[tile]},()=>({groups}));}
test('packed paint verification accepts supported lifted paint',()=>{const r=run([road,paint()]);assert.equal(r.passed,true);assert.equal(r.checkedTriangles,1);});
test('packed paint verification catches a sunk marking and a floating marking',()=>{assert.equal(run([road,paint(-.02)]).belowSurface,1);assert.equal(run([road,paint(.1)]).aboveSurface,1);});
test('packed paint verification rejects paint over a pavement hole',()=>{const r=run([road,paint(.012,8)]);assert.equal(r.passed,false);assert.equal(r.missingSurface,1);});
test('paint on a tile edge can use its neighbour contact geometry',()=>{const a={id:'0:0',bounds:{minX:0,maxX:5,minZ:0,maxZ:5}},b={id:'1:0',bounds:{minX:1,maxX:2,minZ:1,maxZ:2}};const r=verifyRoadMarkings({buildId:'test',tiles:[a,b]},t=>({groups:t.id===a.id?[road]:[paint()]}));assert.equal(r.passed,true);});
