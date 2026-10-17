'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {game}=require('./helpers/geo-game.cjs');
const cityPackage={id:'peterborough',name:'Peterborough'};
const baseRecords=[
  {id:'fire-1',service:'fire',name:'Station 1',address:'210 Sherbrooke St',lat:44.301,lng:-78.322},
  {id:'fire-2',service:'fire',name:'Station 2',address:'Carnegie Ave',lat:44.33,lng:-78.31},
  {id:'ems-1',service:'ems',name:'Paramedic base',address:'Armour Rd',lat:44.305,lng:-78.303},
];
async function started(options={}){
  const g=await game({cityPackage,baseRecords,...options});
  g.api.chooseService('fire');g.api.chooseDifficulty('easy');g.api.start(0);return g;
}
test('Peterborough base dropdown changes the start without losing the current call or session',async()=>{
  const g=await started(),target=g.api.state.target,session=g.api.state.session;
  assert.equal(g.node('practice-bases').hidden,false);
  assert.equal(g.node('practice-base-options').children.length,2);
  assert.equal(g.api.chooseBase(1),true);
  assert.equal(g.api.state.base.id,'fire-2');assert.equal(g.api.state.target,target);assert.equal(g.api.state.session,session);
  assert.equal(g.map.center.lat,baseRecords[1].lat);assert.equal(g.map.center.lng,baseRecords[1].lng);
  assert.equal(g.node('practice-base-options').children[1]['aria-pressed'],'true');
  assert.equal(g.activeElement.id,'map');
  g.api.next();assert.equal(g.map.center.lat,baseRecords[1].lat);
  g.api.finish();assert.equal(g.activeElement.id,'practice-base-1');
});
test('base switching clears a missed-answer review and rejects invalid choices',async()=>{
  const g=await started(),target=g.api.state.target;g.api.check();
  assert.equal(g.api.state.review.outcome,'incorrect');
  assert.equal(g.api.chooseBase(1),true);assert.equal(g.api.state.review,null);assert.equal(g.api.state.target,target);
  assert.equal(g.api.chooseBase(8),false);assert.equal(g.api.state.base.id,'fire-2');
  g.api.finish();assert.equal(g.api.chooseBase(0),false);
});
test('Peterborough phone cross streets start collapsed, toggle both ways and reset each call',async()=>{
  const g=await started({mobile:true,savedCross:'true'});
  assert.equal(g.node('call-cross-streets').hidden,true);
  assert.equal(g.node('reveal-cross-streets').textContent,'Show cross streets');
  assert.equal(g.node('practice-feedback').textContent,'');
  g.api.revealCrossStreets();assert.equal(g.node('call-cross-streets').hidden,false);
  assert.equal(g.node('reveal-cross-streets')['aria-expanded'],'true');
  g.api.revealCrossStreets();assert.equal(g.node('call-cross-streets').hidden,true);
  g.api.revealCrossStreets();g.api.next();assert.equal(g.node('call-cross-streets').hidden,true);
  assert.equal(g.storage.get('geoShowCrossStreets'),'true','phone disclosure does not rewrite the desktop preference');
});
test('desktop cross streets keep their saved setting and EMS menu contains only EMS bases',async()=>{
  const g=await started();assert.equal(g.node('call-cross-streets').hidden,false);
  g.api.finish();g.api.chooseService('ems');g.api.chooseDifficulty('easy');g.api.start(0);
  assert.equal(g.node('practice-base-options').children.length,1);assert.equal(g.api.state.base.id,'ems-1');
  const hidden=await started({savedCross:'false'});assert.equal(hidden.node('call-cross-streets').hidden,true);
});
test('other cities share the Bases dropdown and collapsed phone cross streets',async()=>{
  const g=await started({cityPackage:{id:'toronto',name:'Toronto'},mobile:true});
  assert.equal(g.node('body').classList.contains('ptbo-geo-compact'),true);
  assert.equal(g.node('practice-bases').hidden,false);
  assert.equal(g.node('practice-base-options').children.length,2);
  assert.equal(g.node('call-cross-streets').hidden,true);
  assert.equal(g.node('practice-feedback').textContent,'');
});
test('Peterborough uses compact cross-street labels and removes the desktop hide row',async()=>{
  const g=await started();
  g.api.state.target.crossStreets=['Towerhill Road','Milroy Drive'];g.api.setCrossStreets(true);
  assert.equal(g.node('call-cross-streets').textContent,'Cross: Towerhill Rd • Milroy Dr');
  assert.equal(g.node('reveal-cross-streets').hidden,true);
  const other=await started({cityPackage:{id:'toronto',name:'Toronto'}});
  other.api.state.target.crossStreets=['Towerhill Road','Milroy Drive'];other.api.setCrossStreets(true);
  assert.equal(other.node('call-cross-streets').textContent,'Cross: Towerhill Rd • Milroy Dr');
  assert.equal(other.node('reveal-cross-streets').hidden,true);
});
test('phone cross streets keep an accessible inline hide control when expanded',async()=>{
  const g=await started({mobile:true});g.api.revealCrossStreets();
  assert.equal(g.node('reveal-cross-streets').hidden,false);
  assert.equal(g.node('reveal-cross-streets').textContent,'Hide');
  assert.equal(g.node('reveal-cross-streets')['aria-label'],'Hide cross streets');
  g.api.revealCrossStreets();assert.equal(g.node('reveal-cross-streets').textContent,'Show cross streets');
});
test('correct guesses show green success feedback and green guess markers, then clear on Next',async()=>{
  const g=await started(),t=g.api.state.target;g.map.setView([t.lat,t.lng],18);
  assert.equal(g.api.check(),true);
  assert.equal(g.node('game').dataset.feedback,'correct');
  assert.equal(g.node('guess-effect').hidden,false);
  assert.equal(g.node('guess-effect-icon').textContent,'✓');
  assert.equal(g.node('guess-effect-label').textContent,'Correct');
  assert.equal(g.node('practice-review-title').textContent,'Location found');
  const markers=g.layers.filter(l=>l.kind==='marker');
  assert.equal(markers.length,2);assert.equal(markers[0].options.fillColor,markers[1].options.fillColor);
  g.api.next();assert.equal(g.node('game').dataset.feedback,undefined);assert.equal(g.node('guess-effect').hidden,true);
});
test('wrong guesses show incorrect feedback and retry clears it without replacing the call',async()=>{
  const g=await started(),target=g.api.state.target;g.api.check();
  assert.equal(g.node('game').dataset.feedback,'incorrect');
  assert.equal(g.node('guess-effect-label').textContent,'Incorrect');
  assert.equal(g.node('guess-effect-icon').textContent,'×');
  assert.equal(g.node('practice-review-title').textContent,'Try again');
  assert.equal(g.api.check(),true);assert.equal(g.api.state.target,target);
  assert.equal(g.node('game').dataset.feedback,undefined);assert.equal(g.node('guess-effect').hidden,true);
});
test('reveals are neutral and Finish clears an active result effect',async()=>{
  const g=await started();g.api.reveal();
  assert.equal(g.node('game').dataset.feedback,'revealed');assert.equal(g.node('guess-effect').hidden,true);
  g.api.next();g.api.check();assert.equal(g.node('guess-effect').hidden,false);
  g.api.finish();assert.equal(g.node('game').dataset.feedback,undefined);assert.equal(g.node('guess-effect').hidden,true);
});
test('other cities share the green success effect',async()=>{
  const g=await started({cityPackage:{id:'toronto',name:'Toronto'}}),t=g.api.state.target;
  g.map.setView([t.lat,t.lng],18);g.api.check();
  assert.equal(g.node('game').dataset.feedback,'correct');assert.equal(g.node('guess-effect').hidden,false);
  assert.equal(g.node('guess-effect-label').textContent,'Correct');
});
