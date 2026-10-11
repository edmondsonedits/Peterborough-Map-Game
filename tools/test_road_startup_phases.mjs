import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
const functionSource=name=>{const m=app.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'));assert.ok(m,`${name} exists`);return m[0];};
test('QA phase recorder is opt-in, ordered, bounded and uses monotonic elapsed time',()=>{
 const root={},clock={now:()=>125};
 const record=Function('globalThis','performance',functionSource('recordRoadStartupPhase')+';return recordRoadStartupPhase')(root,clock);
 record('ignored');assert.deepEqual(root,{});
 root.__PTBO_ROAD_STARTUP_QA__={startedAt:100,phases:[]};
 record('paint:before');clock.now=()=>140;record('paint:after');
 assert.deepEqual(root.__PTBO_ROAD_STARTUP_QA__.phases,[{phase:'paint:before',elapsedMilliseconds:25},{phase:'paint:after',elapsedMilliseconds:40}]);
 for(let i=0;i<100;i++)record('bounded');assert.equal(root.__PTBO_ROAD_STARTUP_QA__.phases.length,64);
});
test('startup instrumentation brackets actual work without changing awaits',()=>{
 assert.match(app,/if \(new URLSearchParams\(location.search\).get\('roadStartupQA'\) === '1'\)/);
 for(const [phase,operation]of[
 ['cityOpenData','summary.cityOpenData = buildCityOpenData(cityOpenData);'],
 ['roadPaint','buildRoadMarkings(state.roadMarkingSegments || []);'],
 ['mappedArrows','buildMappedTurnArrows(state.roadMarkingSegments || []);'],
 ['landRaster','flushLandCoverRaster();'],
 ['semanticSurvey','await initializeSemanticSurvey();'],
 ['capturedDetail','await initializeCapturedDetailLayer();'],
 ]){const before=app.indexOf(`recordRoadStartupPhase('${phase}:before')`),work=app.indexOf(operation,before),after=app.indexOf(`recordRoadStartupPhase('${phase}:after')`,work);assert.ok(before>=0&&work>before&&after>work,phase);}
 assert.ok(app.indexOf("recordRoadStartupPhase('landmarks:before')")<app.indexOf('const landmarkSummary = createPeterboroughLandmarks'));
 assert.match(app,/buildLandmarkMapLabels\(\);\s+recordRoadStartupPhase\('landmarks:after'\)/);
 assert.match(app,/dataset.gameplayReady = 'true';\s+recordRoadStartupPhase\('gameplay:ready'\)/);
 assert.match(app,/setReadyStatus\(summary\);\s+recordRoadStartupPhase\('city:ready'\)/);
 assert.match(app,/supportIndexCpuMilliseconds/);
 assert.match(app,/__PTBO_ROAD_STARTUP_QA__\.mappedArrowBuild = \{\.\.\.state.mappedArrowBuild\}/);
});
test('real empty-arrow builder reports exact QA support-index and total timing only when enabled',()=>{
 const root={__PTBO_ROAD_STARTUP_QA__:{phases:[]}},state={objectCount:0},ticks=[10,20,27,40];
 const env={globalThis:root,performance:{now:()=>ticks.shift()},state,THREE:{Object3D:class{}},roadGroup:{},generatedRoadMeshes:new Map(),lowPowerProfile:true,
  mappedTurnLaneGroups:()=>[],selectMappedArrowSupportIndex:()=>({}),document:{documentElement:{dataset:{}}}};
 const run=Function(...Object.keys(env),functionSource('buildMappedTurnArrows')+';return buildMappedTurnArrows')(...Object.values(env));
 run([]);assert.equal(state.mappedArrowBuild.supportIndexCpuMilliseconds,7);assert.equal(state.mappedArrowBuild.cpuMilliseconds,30);
 assert.deepEqual(root.__PTBO_ROAD_STARTUP_QA__.mappedArrowBuild,state.mappedArrowBuild);
 assert.notEqual(root.__PTBO_ROAD_STARTUP_QA__.mappedArrowBuild,state.mappedArrowBuild);
 delete root.__PTBO_ROAD_STARTUP_QA__;ticks.push(50,60);run([]);
 assert.equal(state.mappedArrowBuild.cpuMilliseconds,10);assert.equal('supportIndexCpuMilliseconds' in state.mappedArrowBuild,false);
 assert.deepEqual(root,{});
});
