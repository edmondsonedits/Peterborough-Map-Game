import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionRoadGeometry } from '../city-explorer/road-pack-build.js';
const triangle=(x)=>[x,1,0,x,2,2,x+2,1,0];
test('partition preserves every Float32 triangle and shared seam exactly once',()=>{
 const positions=new Float32Array([...triangle(510),...triangle(514)]);
 const tiles=partitionRoadGeometry([{materialKey:'officialRoad',kind:'official-road_surfaces',contact:'official',layer:'road_surfaces',positions}],{tileSize:512});
 assert.equal(tiles.length,2);assert.equal(tiles.reduce((s,t)=>s+t.groups.reduce((n,g)=>n+g.positions.length,0),0),18);
 const output=tiles.flatMap(t=>t.groups.flatMap(g=>Array.from(g.positions)));assert.deepEqual(output,Array.from(positions));
 assert.equal(tiles[0].bounds.maxX,512);assert.equal(tiles[1].bounds.minX,514);
});
test('editor source ranges survive a source group split across geographic tiles',()=>{
 const tiles=partitionRoadGeometry([{materialKey:'roadLocal',kind:'surface',contact:'fallback',positions:new Float32Array([...triangle(510),...triangle(514)]),sourceRanges:[{sourceId:'way/7:0',startVertex:0,vertexCount:6}]}]);
 for(const tile of tiles)assert.deepEqual(tile.groups[0].sourceRanges,[{sourceId:'way/7:0',startVertex:0,vertexCount:3}]);
});
test('surface and paint groups retain separate contact policy and finite payloads',()=>{
 const tiles=partitionRoadGeometry([{materialKey:'roadPaintWhite',kind:'paint',positions:triangle(0)},{materialKey:'officialRoad',kind:'surface',contact:'official',layer:'road_surfaces',positions:triangle(0)}]);
 assert.equal(tiles[0].groups.length,2);assert.equal(tiles[0].groups.filter(g=>g.contact).length,1);
 assert.throws(()=>partitionRoadGeometry([{positions:[0,NaN,1,0,0,1,1,0,1]}]),/finite/i);
});
