import test from 'node:test';
import assert from 'node:assert/strict';
import {
  station2FacadeLayout,
  station2EdgeRoles,
  station2NeighborhoodCoverage,
} from '../city-explorer/station2-neighborhood-facades.mjs';

const center = {x:0,z:0};
const building = (id, x, z, tags={building:'house'}, ring=[[x-4,z-5],[x+4,z-5],[x+4,z+5],[x-4,z+5]]) => ({id,tags,ring});

test('coverage selects all bounded buildings and reports custom exclusions explicitly',()=>{
  const result=station2NeighborhoodCoverage([
    building('inside',10,0),building('custom',20,0),building('outside',400,0),building('edge',320,0),
  ],{center,radius:320,excludedIds:['custom']});
  assert.deepEqual(result.included.map(item=>item.id),['inside','edge']);
  assert.deepEqual(result.excluded.map(item=>item.id),['custom']);
  assert.deepEqual(result.outside.map(item=>item.id),['outside']);
  assert.equal(result.totalMapped,4);
});

test('front side rear plans are stable, bounded to the footprint, and provide UV/material review data',()=>{
  const source=building('way/42',0,0,{building:'house','addr:street':'Example St'});
  const first=station2FacadeLayout(source);
  const second=station2FacadeLayout(source);
  assert.deepEqual(first,second);
  assert.deepEqual(new Set(first.faces.map(face=>face.role)),new Set(['front','side','rear']));
  assert.ok(first.faces.every(face=>face.quads.length>0));
  for(const face of first.faces) for(const quad of face.quads){
    assert.equal(quad.uv.length,4);
    assert.ok(quad.uv.flat().every(value=>value>=0&&value<=1));
    assert.ok(quad.positions.flat().every(Number.isFinite));
    assert.ok(quad.materialKey);
  }
  assert.ok(first.faces.every(face=>face.wall.repeatMetres===1&&face.wall.uv.flat().every(Number.isFinite)));
});

test('nearest parallel street frontage overrides the inferred longest-edge fallback',()=>{
  const ring=[[-4,-5],[4,-5],[4,5],[-4,5]];
  const roles=station2EdgeRoles(ring,'way/42',[{a:{x:-10,z:-8},b:{x:10,z:-8}}]);
  assert.equal(roles.find(edge=>edge.role==='front').index,0);
  assert.equal(roles.find(edge=>edge.role==='front').frontEvidence,'nearest-parallel-road');
});

test('ancillary and commercial forms use distinct opening families with capped surface detail',()=>{
  const garage=station2FacadeLayout(building('garage',0,0,{building:'garage'}));
  const shop=station2FacadeLayout(building('shop',0,0,{building:'retail'}));
  assert.equal(garage.archetype,'ancillary');
  assert.equal(shop.archetype,'commercial');
  assert.ok(garage.quadCount<=24);
  assert.ok(shop.quadCount<=80);
});

test('short discarded edges do not shift the road-score indexes',()=>{
 const roles=station2EdgeRoles([[0,0],[.5,0],[10,0],[10,8],[0,8]],'short-edge',[{a:{x:-8,z:-10},b:{x:-8,z:20}}]);
 assert.equal(roles.find(e=>e.role==='front').index,4);
});
