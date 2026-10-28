'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {game}=require('./helpers/geo-game.cjs');
const fs=require('node:fs');
for(const city of [{id:'peterborough',name:'Peterborough'},{id:'toronto',name:'Toronto'}]) {
 test(`${city.name}: call details collapse after map movement and reopen`,async()=>{
  const g=await game({cityPackage:city,mobile:true});
  g.api.chooseService('fire');g.api.chooseDifficulty('easy');g.api.start(0);
  assert.equal(g.node('call-toggle')['aria-expanded'],'true');
  assert.equal(g.node('call-cross-streets').hidden,false);
  g.map.fire('dragstart');
  assert.equal(g.node('call-toggle')['aria-expanded'],'false');
  g.api.toggleCallDetails();assert.equal(g.node('call-toggle')['aria-expanded'],'true');
  g.map.fire('dragstart');assert.equal(g.node('call-toggle')['aria-expanded'],'true');
  g.api.next();assert.equal(g.node('call-toggle')['aria-expanded'],'true');
 });
 test(`${city.name}: Return preserves selections and allows another base`,async()=>{
  const records=[{id:'f1',service:'fire',name:'Station 1',address:'A',lat:44,lng:-78},{id:'f2',service:'fire',name:'Station 2',address:'B',lat:44.1,lng:-78.1}];
  const g=await game({cityPackage:city,mobile:true,baseRecords:records});
  g.api.chooseService('fire');g.api.chooseDifficulty('medium');g.api.start(0);
  assert.match(fs.readFileSync('geo-guesser/index.html','utf8'),/<button id="practice-return"[^>]*onclick="PTBO_GEO.finish\(\)"/);
  assert.equal(g.node('practice-return').hidden,false);
  g.api.check();g.api.finish();
  assert.equal(g.node('base-step').hidden,false);assert.equal(g.api.state.service,'fire');assert.equal(g.api.state.difficulty,'medium');
  assert.equal(g.api.state.session,null);assert.equal(g.activeElement.id,'practice-base-0');
  assert.equal(g.api.start(1),true);assert.equal(g.api.state.base.id,'f2');
 });
}
test('review stays open, retry re-arms collapse, and hidden cross streets are respected',async()=>{
 const g=await game({cityPackage:{id:'toronto',name:'Toronto'},mobile:true,savedCross:'false'});
 g.api.chooseService('fire');g.api.chooseDifficulty('easy');g.api.start(0);
 assert.equal(g.node('call-cross-streets').hidden,true);g.api.revealCrossStreets();assert.equal(g.node('call-cross-streets').hidden,false);
 g.map.fire('dragstart');g.api.check();assert.equal(g.node('call-toggle')['aria-expanded'],'true');
 g.map.fire('dragstart');assert.equal(g.node('call-toggle')['aria-expanded'],'true');
 g.api.retry();g.map.fire('dragstart');assert.equal(g.node('call-toggle')['aria-expanded'],'false');
});
