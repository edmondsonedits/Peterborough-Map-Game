'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assessAlternative,changedGeometry,challengeDifficulty,loadEngine,loadCity,chooseChallenges}=require('../tools/build-city-route-challenges.cjs');
const edge=(segmentId,name,distance,extra={})=>({segmentId,name,distance,highway:'secondary',reverse:false,...extra});
const route=(edges,seconds)=>({edges,seconds,distance:edges.reduce((s,e)=>s+e.distance,0),feasible:true});
test('meaningful alternatives require a material modeled penalty and changed named-road geometry',()=>{
 const best=route([edge(1,'Main',300),edge(2,'Main',300)],100);
 assert.equal(assessAlternative(best,route([edge(1,'Main',300),edge(3,'Other',300)],117)),null);
 assert.equal(assessAlternative(best,route([edge(1,'Main',300),edge(3,'Unnamed road',300,{highway:'service'})],140)),null);
 assert.equal(assessAlternative(best,route([edge(1,'Main',300),edge(3,'Other',90)],140)),null);
 const quality=assessAlternative(best,route([edge(1,'Main',300),edge(3,'Other',200)],140));
 assert.equal(quality.changedDistance,200);assert.equal(quality.penalty,40);
});
test('same-road opposite departure needs 180 metres of changed named nonservice geometry',()=>{
 const best=route([edge(1,'Main',100),edge(2,'Main',300)],100);
 assert.equal(assessAlternative(best,route([edge(1,'Main',100,{reverse:true}),edge(3,'Main',170)],140)),null);
 assert.ok(assessAlternative(best,route([edge(1,'Main',100,{reverse:true}),edge(3,'Main',180)],140)));
});
test('route challenge difficulty has no distance or recognition input',()=>{
 const best=route([edge(1,'Main',1000)],100),alt=route([edge(2,'Other',1200)],130),quality=assessAlternative(best,alt);
 const score=challengeDifficulty(best,alt,quality,'corridor-choice');
 assert.equal(challengeDifficulty({...best,distance:100000,recognitionDifficulty:'hard'},{...alt,distance:200000},quality,'corridor-choice'),score);
});
test('same corridor incurs a selection penalty only with same decision type and over 85 percent overlap',()=>{
 const best=route([edge(1,'Main',1000)],100),c=(id,difficulty,decisionType,edges)=>({call:{id},difficulty,decisionType,best:route(edges,100)});
 const selected=chooseChallenges([c('a',90,'corridor-choice',best.edges),c('b',89,'corridor-choice',best.edges),c('c',80,'bridge-choice',best.edges),c('d',79,'corridor-choice',[edge(2,'Other',1000)])],3);
 assert.deepEqual(selected.map(x=>x.call.id),['a','c','d']);
});
test('the builder exports the browser game graph and response functions without initializing UI',()=>{
 const engine=loadEngine('peterborough');
 for(const key of ['buildGraph','toXY','toLatLng','snapRoadAccess','referenceBetween','basePoint','callPoint'])assert.equal(typeof engine[key],'function');
 const city=loadCity('peterborough');assert.equal(city.bases.length,5);assert.equal(city.calls.filter(c=>c.recognitionDifficulty!==null).length,200);
});
