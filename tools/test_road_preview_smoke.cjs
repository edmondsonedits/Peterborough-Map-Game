'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
test('startup smoke passes its declared timeout as Playwright options, not page data',async()=>{
 const calls=[];
 const page={on(){},goto:async()=>({status:()=>200}),waitForFunction:async(...args)=>{calls.push(args);},evaluate:async()=>({ready:'true'})};
 const chromium={launch:async()=>({newPage:async()=>page,close:async()=>{}})};
 const context={require:id=>id==='playwright'?{chromium}:require(id),process:{argv:['node','smoke'],env:{}},console:{log(){},error(){}},Date};
 await vm.runInNewContext(fs.readFileSync(require.resolve('./check-road-preview-smoke.cjs'),'utf8'),context);
 assert.equal(calls.length,1);
 assert.equal(calls[0][1],null,'argument slot must be separate from timeout options');
 assert.equal(calls[0][2]?.timeout,65000,'declared existing 65 second budget must reach Playwright');
});
test('startup diagnostics retain wait failure and never mark an unready page successful',async()=>{
 const logs=[];const errors=[];const processStub={argv:['node','smoke'],env:{}};
 const page={on(){},goto:async()=>({status:()=>200}),waitForFunction:async()=>{throw new Error('fixture timeout');},evaluate:async()=>({ready:'false',startup:'fixture phase'})};
 const chromium={launch:async()=>({newPage:async()=>page,close:async()=>{}})};
 await vm.runInNewContext(fs.readFileSync(require.resolve('./check-road-preview-smoke.cjs'),'utf8'),{require:id=>id==='playwright'?{chromium}:require(id),process:processStub,console:{log:(...v)=>logs.push(v),error:e=>errors.push(e)},Date});
 assert.equal(processStub.exitCode,1);
 const report=JSON.parse(logs[0][1]);assert.match(report.waitError,/fixture timeout/);assert.equal(report.snapshot.startup,'fixture phase');assert.equal(errors.length,1);
});
test('CI records both exact baseline and candidate startup and requires both playable',()=>{
 const workflow=fs.readFileSync(require('node:path').join(__dirname,'../.github/workflows/city-explorer-browser-qa.yml'),'utf8');
 assert.match(workflow,/git worktree add \/tmp\/ptbo-startup-before f8818548ad903b14b22ee5a48a88f3abcd92f582/);
 assert.match(workflow,/PTBO_STARTUP_REPORT=artifacts\/startup-qa\/before.json/);
 assert.match(workflow,/PTBO_STARTUP_REPORT=artifacts\/startup-qa\/after.json/);
 assert.match(workflow,/test \$before_status -eq 0 && test \$after_status -eq 0/);
});
test('late readiness cannot turn a timed-out startup wait into success',async()=>{
 const processStub={argv:['node','smoke'],env:{}};
 const page={on(){},goto:async()=>({status:()=>200}),waitForFunction:async()=>{throw new Error('fixture timeout');},evaluate:async()=>({ready:'true'})};
 const chromium={launch:async()=>({newPage:async()=>page,close:async()=>{}})};
 await vm.runInNewContext(fs.readFileSync(require.resolve('./check-road-preview-smoke.cjs'),'utf8'),{require:id=>id==='playwright'?{chromium}:require(id),process:processStub,console:{log(){},error(){}},Date});
 assert.equal(processStub.exitCode,1);
});
