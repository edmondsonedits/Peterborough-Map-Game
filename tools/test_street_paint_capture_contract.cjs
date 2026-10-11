'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const capturePath=path.join(__dirname,'check-street-paint-comparison.cjs');
// This guard makes the initial red result an explicit missing contract assertion,
// rather than accidentally launching Chromium when importing the old script.
test('capture module exposes a testable production contract without browser side effects',()=>{
 assert.match(fs.readFileSync(capturePath,'utf8'),/module\.exports\s*=/);
});
function contract(){assert.match(fs.readFileSync(capturePath,'utf8'),/module\.exports\s*=/);return require(capturePath);}
test('default baseline scenes remain and explicit profile/compound groups select every requested camera',()=>{
 const {selectSites}=contract();
 assert.deepEqual(selectSites().map(s=>s.name),['sherbrooke-station','lansdowne-west']);
 assert.equal(selectSites('hospital').length,3);
 assert(selectSites('hospital,medical').some(s=>s.name==='medical-overhead'));
 const compound=selectSites('compound-arrows');assert.equal(compound.length,2);
 assert.deepEqual(compound.map(s=>s.wayId),['364843830','1414147320']);
 for(const s of compound)assert.deepEqual([s.altitude,s.distance,s.bearing,s.pitch],[35,1,0,-1.5]);
 assert.throws(()=>selectSites('typo'),/Unknown/);
});
test('candidate compound visibility requires correct kind and both pixel thresholds',()=>{
 const {validateRun}=contract();
 const base={paintVersion:'street-evidence-2',roadSource:'citywide-municipal-mobile',reviewedWays:6,site:'compound-left-through',expectedCompoundKind:'left;through'};
 for(const result of [null,{targets:[]},{targets:[{kind:'left',changedPixels:20,brighterPixels:20}]},{targets:[{kind:'left;through',changedPixels:4,brighterPixels:20}]},{targets:[{kind:'left;through',changedPixels:20,brighterPixels:4}]}]) {
  assert.throws(()=>validateRun({label:'after',errors:[],views:[{...base,arrowVisibility:result}]}),/compound|visibility/i);
 }
 assert.doesNotThrow(()=>validateRun({label:'after',errors:[],views:[{...base,arrowVisibility:{targets:[{kind:'left;through',changedPixels:5,brighterPixels:5}]}}]}));
 assert.doesNotThrow(()=>validateRun({label:'before',errors:[],views:[{...base,paintVersion:'legacy',reviewedWays:4}]}));
});
test('visibility probe failure still records the screenshot and failed metrics before validation throws',async()=>{
 const {captureSite,selectSites,validateRun}=contract();const calls=[];let evaluates=0;
 const page={evaluate:async()=>{evaluates++;if(evaluates===1)return undefined;if(evaluates===2)return Array(20).fill(16);if(evaluates===3)return {paintVersion:'street-evidence-2',roadSource:'municipal',reviewedWays:6};throw new Error('QA probe unavailable');},waitForTimeout:async()=>{},screenshot:async({path})=>calls.push(path)};
 const view=await captureSite(page,selectSites('compound-arrows')[0],{label:'after',output:'/tmp/capture-contract'});
 assert.equal(calls.length,1);assert.match(calls[0],/after-compound-left-through\.png$/);assert.match(view.arrowVisibilityError,/QA probe unavailable/);
 assert.throws(()=>validateRun({label:'after',views:[view],errors:[]}),/visibility/i);
});
test('CI pins exact baseline for all three comparison captures and runs new tests after declared dependencies',()=>{
 const yml=fs.readFileSync(path.join(__dirname,'../.github/workflows/city-explorer-browser-qa.yml'),'utf8');
 assert.equal((yml.match(/PTBO_PAINT_QA_BEFORE_COMMIT: 2496b157ebeb1d995278373297d5790b60a4150a/g)||[]).length,3);
 assert.match(yml,/PTBO_PAINT_QA_LOW_POWER: '1'/);
 assert.match(yml,/artifacts\/compound-arrow-low-power-qa\//);
 for(const test of ['test_mobile_input_lifecycle.cjs','test_historical_paint_*.mjs','test_mapped_arrow_*.mjs','test_street_paint_capture_contract.cjs','test_road_review_tracker.py','test_street_lane_audit.py','test_fallback_arrow_*.mjs','test_fallback_arrow_runtime.mjs --desktop'])assert(yml.includes(test),test);
 assert.match(yml,/pip install.*shapely==2\.0\.7.*pyproj==3\.7\.0/);
 assert(yml.indexOf('pip install')<yml.indexOf('python tools/test_street_lane_audit.py'));
 assert.match(yml,/PTBO_PAINT_QA_SITES: hospital,medical/);assert.match(yml,/PTBO_PAINT_QA_SITES: compound-arrows/);
});
test('capture provenance binds before to exact approved baseline and candidate to actual HEAD reader',()=>{
 const {commitMetadata,BEFORE_COMMIT}=contract();let reads=0;const head='b'.repeat(40);
 assert.deepEqual(commitMetadata({PTBO_PAINT_QA_BEFORE_COMMIT:BEFORE_COMMIT},()=>{reads++;return head;}),{before:BEFORE_COMMIT,after:head});assert.equal(reads,1);
 assert.throws(()=>commitMetadata({PTBO_PAINT_QA_BEFORE_COMMIT:'a'.repeat(40)},()=>head),/exact before/);
 assert.throws(()=>commitMetadata({},()=> 'shortsha'),/actual candidate git HEAD/);
});
test('all matching combined targets must pass; renderer-support count cannot silently change',()=>{
 const {validateRun}=contract();const view={site:'compound-through-right',paintVersion:'street-evidence-2',roadSource:'municipal',reviewedWays:6,expectedCompoundKind:'through;right',arrowVisibility:{targets:[{kind:'through;right',changedPixels:10,brighterPixels:10},{kind:'through;right',changedPixels:0,brighterPixels:0}]}};
 assert.throws(()=>validateRun({label:'after',errors:[],views:[view]}),/visibility/);
 view.arrowVisibility.targets.pop();view.reviewedWays=5;assert.throws(()=>validateRun({label:'after',errors:[],views:[view]}),/six reviewed/);
});
test('low-power comparison explicitly enables the same municipal support with the low-power renderer',()=>{
 const {entryURL}=require('./check-street-paint-comparison.cjs');
 assert.equal(typeof entryURL,'function');
 const url=new URL(entryURL('http://127.0.0.1:4174',true));
 assert.equal(url.searchParams.get('qa'),'1');assert.equal(url.searchParams.get('municipalRoads'),'1');assert.equal(url.searchParams.get('lite'),'1');
 assert.equal(new URL(entryURL('http://127.0.0.1:4174',false)).searchParams.has('lite'),false);
});
test('default-lite mobile browser QA checks retained arrows without forcing municipal download',()=>{
 const source=fs.readFileSync(path.join(__dirname,'check-mobile-controls.cjs'),'utf8');
 assert.match(source,/\?lite=1&pavementQA=1&qa=1/);
 assert.doesNotMatch(source,/municipalRoads=1/);
 assert.match(source,/mappedArrowsRetained/);
 assert.match(source,/mappedArrowBuild/);
});
test('browser jobs test the exact triggering head rather than an implicit merge or moving branch',()=>{
 const yml=fs.readFileSync(path.join(__dirname,'../.github/workflows/city-explorer-browser-qa.yml'),'utf8');
 assert.equal((yml.match(/ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/g)||[]).length,2);
});
test('historical overhead checks require all visible strokes and both expected paint kinds',()=>{
 const {validateRun}=contract();const view={site:'hospital-overhead',paintVersion:'street-evidence-2',roadSource:'municipal',reviewedWays:6,expectedHistoricalKinds:['solid','dash'],historicalVisibility:{targets:[{kind:'solid',changedPixels:12,brighterPixels:12},{kind:'dash',changedPixels:0,brighterPixels:0}]}};
 assert.throws(()=>validateRun({label:'after',errors:[],views:[view]}),/historical.*visibility/i);
 view.historicalVisibility.targets[1].changedPixels=8;view.historicalVisibility.targets[1].brighterPixels=8;validateRun({label:'after',errors:[],views:[view]});
 view.historicalVisibility.targets.pop();assert.throws(()=>validateRun({label:'after',errors:[],views:[view]}),/historical.*visibility/i);
});
test('capture deliberately selects desktop capabilities and rejects an unintended effective profile',async()=>{
 const api=contract();assert.equal(typeof api.configureCapabilities,'function');let init;
 await api.configureCapabilities({addInitScript:async fn=>{init=fn;}});
 const navigator={};require('node:vm').runInNewContext('('+init.toString()+')()',{navigator,Object});
 assert.equal(navigator.deviceMemory,8);assert.equal(navigator.hardwareConcurrency,8);
 const entry={label:'after',requestedLowPower:false,errors:[],views:[{site:'fixture',paintVersion:'street-evidence-2',roadSource:'municipal',reviewedWays:6,mappedArrowBuild:{lowPowerProfile:true}}]};
 assert.throws(()=>api.validateRun(entry),/profile/i);
 entry.views[0].mappedArrowBuild.lowPowerProfile=false;api.validateRun(entry);
});
test('ready-for-review browser validation binds the final generated-asset head without a new source mutation',()=>{
 const yml=fs.readFileSync(path.join(__dirname,'../.github/workflows/city-explorer-browser-qa.yml'),'utf8');
 assert.match(yml,/pull_request:\s*types:\s*\[opened, synchronize, reopened, ready_for_review\]/);
 const geo=fs.readFileSync(path.join(__dirname,'../.github/workflows/build-peterborough-assets.yml'),'utf8');
 assert.doesNotMatch(geo,/ready_for_review/,'ready transition must not trigger another asset timestamp commit');
});
