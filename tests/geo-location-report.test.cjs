const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {game}=require('./helpers/geo-game.cjs');

async function reportingGame(){
  const g=await game();
  const p=path.join(__dirname,'../geo-guesser/location-report-context.js');
  if(fs.existsSync(p))vm.runInContext(fs.readFileSync(p,'utf8'),g.c);
  g.c.PTBO_BUILD={version:'1.6.134'};
  g.c.PTBO_CITY_PACKAGE={id:'peterborough'};
  g.api.chooseService('fire');g.api.chooseDifficulty('easy');g.api.start(0);
  return g;
}

test('report preserves the checked guess and original circle before map review changes the viewport',async()=>{
  const g=await reportingGame(),target=g.api.state.target;
  const original={lat:target.lat,lng:target.lng,radius:target.radius};
  g.map.center={lat:44.2867184,lng:-78.3775783};
  g.api.check();
  const snapshot=g.api.state.review.reportSnapshot;
  assert.ok(snapshot,'a checked result must capture report context');
  assert.equal(snapshot.result,'incorrect');
  assert.deepEqual({...snapshot.guess},{lat:44.2867184,lng:-78.3775783});
  assert.deepEqual({...snapshot.originalCircle.center},{lat:original.lat,lng:original.lng});
  assert.equal(snapshot.originalCircle.radiusMeters,original.radius);
  assert.equal(snapshot.version,'1.6.134');
  assert.equal(snapshot.city,'peterborough');
  assert.equal(snapshot.service,'fire');
  assert.equal(snapshot.mode,'geo');
  g.map.center={lat:0,lng:0};
  assert.equal(snapshot.guess.lat,44.2867184,'later panning cannot replace the checked guess');
});

test('report remains independent of target edits and subsequent questions',async()=>{
  const g=await reportingGame();g.api.reveal();
  const target=g.api.state.target,snapshot=g.api.state.review.reportSnapshot;
  assert.ok(snapshot,'a revealed result must also be reportable');
  const name=snapshot.question.name,lat=snapshot.originalCircle.center.lat,id=snapshot.callId;
  target.name='Changed later';target.lat=1;
  assert.equal(snapshot.question.name,name);
  assert.equal(snapshot.originalCircle.center.lat,lat);
  assert.equal(snapshot.guess,null);
  assert.equal(snapshot.distanceMeters,null);
  assert.equal(snapshot.datasetRevision,null,'unknown data revision must remain explicitly unknown');
  g.api.next();
  assert.equal(snapshot.callId,id);
  assert.ok(Object.isFrozen(snapshot.originalCircle.center));
  assert.equal(g.api.state.review,null);
});
test('normal call reports include the available runtime catalog version without mislabelling care-home overlays',async()=>{
  const g=await reportingGame();g.c.PTBO_DISPATCH_STORE.dataVersion='catalog-2026-10-27';g.api.reveal();
  assert.equal(g.api.state.review.reportSnapshot.datasetRevision,'catalog-2026-10-27');
  g.api.next();g.api.state.target.facilityType='long-term-care';g.api.reveal();
  assert.equal(g.api.state.review.reportSnapshot.datasetId,'peterborough:priority-care-homes');
  assert.equal(g.api.state.review.reportSnapshot.datasetRevision,null,'a dispatch version does not certify a separate training overlay');
});
