import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const url=new URL('../feedback/location-circle.mjs',import.meta.url);
const module=existsSync(url)?await import(url.href):{};
const make=original=>{assert.equal(typeof module.createCircleDraft,'function','circle correction controller must exist');return module.createCircleDraft(original);};
const circle=()=>({center:{lat:44.2865,lng:-78.3796},radiusMeters:60});

test('moving and resizing a proposed circle never changes the original target',()=>{
 const original=circle(),draft=make(original);
 assert.equal(draft.suggestion(),null);
 draft.setEnabled(true);draft.setCenter({lat:44.2867,lng:-78.3775});draft.setRadius(125);
 assert.deepEqual(draft.suggestion(),{center:{lat:44.2867,lng:-78.3775},radiusMeters:125});
 assert.deepEqual(original,circle());
 const read=draft.value();read.center.lat=0;
 assert.equal(draft.value().center.lat,44.2867,'published values cannot mutate controller state');
});
test('reset removes correction changes and disabling excludes a retained draft',()=>{
 const draft=make(circle());draft.setEnabled(true);draft.setRadius(200);
 draft.setEnabled(false);assert.equal(draft.suggestion(),null);
 draft.setEnabled(true);assert.equal(draft.suggestion().radiusMeters,200);
 draft.reset();assert.equal(draft.suggestion(),null);assert.deepEqual(draft.value(),circle());
});
test('invalid radius or coordinates fail without replacing the last usable correction',()=>{
 const draft=make(circle());draft.setEnabled(true);draft.setRadius(5);draft.setRadius(2000);
 for(const x of [0,4,2001,NaN,Infinity,'80'])assert.throws(()=>draft.setRadius(x));
 for(const x of [{lat:91,lng:0},{lat:0,lng:-181},{lat:NaN,lng:0},{lat:'44',lng:-78}])assert.throws(()=>draft.setCenter(x));
 assert.equal(draft.value().radiusMeters,2000);
 assert.deepEqual(draft.value().center,{lat:44.2865,lng:-78.3796});
});
