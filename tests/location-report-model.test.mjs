import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNewThread } from '../feedback/model.mjs';

function report() {
  return {
    schemaVersion: 1, kind: 'geo-location', reason: 'point',
    snapshot: {
      resultId: 'result-1', callId: 'school-1', city: 'peterborough', service: 'fire',
      mode: 'geo', version: '1.6.134', datasetId: 'peterborough/locations', datasetRevision: 'sha256:one',
      question: { name: 'School', address: '1 School Road', crossStreets: null, difficulty: 'easy' },
      originalCircle: { center: { lat: 44.2865, lng: -78.3796 }, radiusMeters: 60 },
      guess: { lat: 44.2867, lng: -78.3775 }, distanceMeters: 165, result: 'incorrect', baseId: 'station-1',
    },
    suggestion: { center: { lat: 44.2867, lng: -78.3775 }, radiusMeters: 80 },
  };
}

test('new structured threads preserve an independent original and suggested circle', () => {
  const original = report();
  const value = normalizeNewThread({ title: 'Possible school issue', body: 'Please review.', category: 'map', locationReport: original });
  assert.deepEqual(value.locationReport, original);
  original.snapshot.originalCircle.center.lat = 0;
  original.suggestion.radiusMeters = 90;
  assert.equal(value.locationReport.snapshot.originalCircle.center.lat, 44.2865);
  assert.equal(value.locationReport.suggestion.radiusMeters, 80);
});

const locationModel = await import('../feedback/location-report.mjs');
const normalize = (input) => locationModel.normalizeLocationReport(input);

test('structured thread context is derived from its immutable snapshot', () => {
  const value = normalizeNewThread({ title: 'School', body: 'Review.', category: 'map', city: 'toronto', mode: 'dispatch', department: 'ems', version: 'old', locationReport: report() });
  assert.equal(value.city, 'peterborough');
  assert.equal(value.mode, 'geo');
  assert.equal(value.department, 'fire');
  assert.equal(value.version, '1.6.134');
});
test('normalization freezes its independent nested context', () => {
  const value = normalize(report());
  assert.throws(() => { value.snapshot.question.name = 'Changed'; }, TypeError);
  assert.throws(() => { value.suggestion.center.lat = 0; }, TypeError);
});
test('optional capture fields normalize to explicit nulls', () => {
  const input = report();
  for (const key of ['datasetRevision','guess','distanceMeters','baseId']) delete input.snapshot[key];
  delete input.snapshot.question.crossStreets;
  delete input.snapshot.question.difficulty;
  delete input.suggestion;
  const value = normalize(input);
  assert.equal(value.snapshot.datasetRevision, null);
  assert.equal(value.snapshot.guess, null);
  assert.equal(value.snapshot.distanceMeters, null);
  assert.equal(value.snapshot.baseId, null);
  assert.equal(value.snapshot.question.crossStreets, null);
  assert.equal(value.snapshot.question.difficulty, null);
  assert.equal(value.suggestion, null);
});
test('cross streets retain bounded separate street names', () => {
  const input = report();input.snapshot.question.crossStreets = [' First Street ', 'Second Road'];
  assert.deepEqual(normalize(input).snapshot.question.crossStreets, ['First Street','Second Road']);
  for (const streets of ['First / Second', ['x'.repeat(151)], ['a','b','c','d','e'], [42]]) {
    input.snapshot.question.crossStreets=streets;assert.throws(()=>normalize(input), /cross/i);
  }
});
for (const [name,suggestion] of [['centre only',{center:{lat:90,lng:-180}}],['radius only',{radiusMeters:5}],['both bounds',{center:{lat:-90,lng:180},radiusMeters:2000}]]) {
  test('accepts an optional '+name+' suggestion without changing the original',()=>{
    const input=report();input.suggestion=suggestion;const value=normalize(input);
    assert.deepEqual(value.suggestion,suggestion);
    assert.deepEqual(value.snapshot.originalCircle,{center:{lat:44.2865,lng:-78.3796},radiusMeters:60});
  });
}
for (const [name,edit] of [
 ['nonfinite latitude',r=>{r.snapshot.originalCircle.center.lat=NaN;}],
 ['out-of-earth longitude',r=>{r.suggestion.center.lng=181;}],
 ['string coordinate',r=>{r.snapshot.guess.lat='44';}],
 ['zero original radius',r=>{r.snapshot.originalCircle.radiusMeters=0;}],
 ['oversize original radius',r=>{r.snapshot.originalCircle.radiusMeters=20001;}],
 ['too-small suggestion',r=>{r.suggestion.radiusMeters=4.99;}],
 ['too-large suggestion',r=>{r.suggestion.radiusMeters=2000.01;}],
 ['empty suggestion',r=>{r.suggestion={};}],
 ['negative distance',r=>{r.snapshot.distanceMeters=-1;}],
 ['partial guess',r=>{r.snapshot.guess={lat:1};}],
 ['unsupported mode',r=>{r.snapshot.mode='route';}],
 ['unsupported service',r=>{r.snapshot.service='police';}],
 ['unsupported reason',r=>{r.reason='confirmed-wrong';}],
 ['unsupported result',r=>{r.snapshot.result='wrong';}],
 ['unknown report field',r=>{r.verified=true;}],
 ['unknown snapshot field',r=>{r.snapshot.email='private@example.test';}],
 ['unknown suggestion field',r=>{r.suggestion.address='other';}],
 ['oversize identifier',r=>{r.snapshot.callId='x'.repeat(161);}],
 ['non-string name',r=>{r.snapshot.question.name=42;}],
 ['non-string address',r=>{r.snapshot.question.address=42;}],
 ['non-string dataset revision',r=>{r.snapshot.datasetRevision=12;}],
]) test('rejects '+name,()=>{const input=report();edit(input);assert.throws(()=>normalize(input));});
test('keeps reported scoring contradictions for review rather than correcting them',()=>{
 const input=report();input.snapshot.distanceMeters=10;input.snapshot.result='incorrect';
 assert.equal(normalize(input).snapshot.result,'incorrect');
});
test('full identity detects a changed suggestion while ignoring object key order',()=>{
 assert.equal(typeof locationModel.locationReportIdentity,'function');
 const a=report(),b=JSON.parse(JSON.stringify(a));b.suggestion={radiusMeters:80,center:{lng:-78.3775,lat:44.2867}};
 assert.equal(locationModel.locationReportIdentity(a),locationModel.locationReportIdentity(b));
 b.suggestion.radiusMeters=81;
 assert.notEqual(locationModel.locationReportIdentity(a),locationModel.locationReportIdentity(b));
});
test('grouping retains reason, original circle and dataset-version differences',()=>{
 assert.equal(typeof locationModel.locationReportGroupKey,'function');
 const a=report(),b=report();b.snapshot.resultId='result-2';b.snapshot.guess.lat=44;b.suggestion.radiusMeters=100;
 assert.equal(locationModel.locationReportGroupKey(a),locationModel.locationReportGroupKey(b));
 for(const edit of [r=>{r.reason='radius';},r=>{r.snapshot.version='1.6.135';},r=>{r.snapshot.datasetRevision='sha256:two';},r=>{r.snapshot.originalCircle.radiusMeters=61;},r=>{r.snapshot.question.address='2 School Road';}]){
  const c=report();edit(c);assert.notEqual(locationModel.locationReportGroupKey(a),locationModel.locationReportGroupKey(c));
 }
});

test('missing displayed name and address text can themselves be reported',()=>{
 const input=report();input.snapshot.question.name='';input.snapshot.question.address='';
 const value=normalize(input);assert.equal(value.snapshot.question.name,'');assert.equal(value.snapshot.question.address,'');
 const spaced=report();spaced.snapshot.question.name='  ';assert.equal(normalize(spaced).snapshot.question.name,'');
});
