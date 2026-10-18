'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const out=path.resolve('artifacts/hunter-bridge-editor');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const page=await context.newPage();page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',error=>errors.push(String(error.stack||error)));
 const report={version:'1.6.122',target:'Hunter Street / Ashburnham Bridge',checks:[],errors};
 let changed=false;
 async function run(command){const result=await page.evaluate(command=>window.PTBO_CITY_EDITOR.run(command),command);report.checks.push({command,result});return result;}
 try {
  await page.goto('https://peterborough-3d-map-editor-preview.dans-host.chatgpt.site/city-explorer/?editor=1&lite=1&v=1.6.122',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.PTBO_CITY_EDITOR?.run({op:'status'}).data?.active===true || document.documentElement.dataset.explorerBoot==='failed',null,{timeout:180000});
  const status=await run({op:'status'});assert.equal(status.data.active,true);assert.equal(status.data.version,'1.6.122');
  report.url=page.url();
  await page.locator('.ai-editor-tools summary').click();
  await page.locator('[data-ai-search]').fill('Ashburnham Bridge');
  await page.locator('[data-ai-find]').click();
  assert.equal(await page.locator('[data-ai-feature-id]').count(),1,'one bridge landmark should match');
  await page.locator('[data-ai-feature-id]').click();
  const selected=JSON.parse(await page.locator('[data-ai-result]').textContent());
  assert.equal(selected.ok,true);assert.equal(selected.data.sourceId,'ashburnham-bridge');
  report.bridge=selected.data;report.selectedId=selected.data.id;
  assert.equal(selected.data.capabilities.transform,false,'the source-aligned bridge must remain transform protected');
  assert.deepEqual(selected.data.capabilities.appearance,['color','opacity']);
  await page.locator('[data-ai-focus]').click();
  assert.equal(JSON.parse(await page.locator('[data-ai-result]').textContent()).ok,true);
  const inspected=await run({op:'inspect'});assert.equal(inspected.ok,true);assert.ok(inspected.data.bounds);
  report.initialScene=(await run({op:'export'})).data.scene;
  const cameraCommand={op:'camera',latitude:44.305884,longitude:-78.314833,altitude:20,distance:230,bearing:180};
  await page.locator('[data-ai-command]').fill(JSON.stringify(cameraCommand));await page.locator('[data-ai-run]').click();
  assert.equal(JSON.parse(await page.locator('[data-ai-result]').textContent()).ok,true,'DOM JSON command path works');
  assert.equal((await run({op:'view.save',name:'Hunter bridge QA before'})).ok,true);
  report.beforeCamera=(await run({op:'context'})).data.camera;
  await page.screenshot({path:path.join(out,'editor-controls.png')});
  const style=await page.addStyleTag({content:'#app > :not(canvas), #ptbo-build-badge, #ptbo-training-use-notice { visibility:hidden !important; }'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:path.join(out,'bridge-before.png')});
  const tint=await run({op:'edit',expectedRevision:inspected.revision,changes:[{id:report.selectedId,appearance:{color:'#ff00ff'}}]});
  assert.equal(tint.ok,true,JSON.stringify(tint));changed=tint.data.changed;
  assert.equal((await run({op:'inspect'})).data.appearance.color,'#ff00ff');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:path.join(out,'bridge-tint-test.png')});
  assert.equal((await run({op:'undo'})).ok,true);changed=false;
  assert.deepEqual((await run({op:'export'})).data.scene,report.initialScene,'undo must restore the exact original scene');
  assert.equal((await run({op:'redo'})).ok,true);changed=true;
  assert.equal((await run({op:'inspect'})).data.appearance.color,'#ff00ff');
  assert.equal((await run({op:'undo'})).ok,true);changed=false;
  assert.equal((await run({...cameraCommand,bearing:90,distance:80})).ok,true);
  assert.equal((await run({op:'view.restore',name:'Hunter bridge QA before'})).ok,true);
  assert.deepEqual((await run({op:'context'})).data.camera,report.beforeCamera,'saved view restores exact camera and orbit target');
  const protectedEdit=await run({op:'edit',changes:[{id:report.selectedId,transform:{elevation:1}}]});
  assert.equal(protectedEdit.ok,false);assert.equal(protectedEdit.error.code,'UNSUPPORTED');
  assert.deepEqual((await run({op:'export'})).data.scene,report.initialScene);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:path.join(out,'bridge-restored.png')});
  assert.equal((await run({op:'view.delete',name:'Hunter bridge QA before'})).ok,true);
  await style.evaluate(element=>element.remove());
  await page.locator('[data-ai-inspect]').click();
  await page.screenshot({path:path.join(out,'editor-finished.png')});
  assert.deepEqual(errors,[],'no page JavaScript errors');
  report.status='pass';
 }catch(error){report.status='fail';report.failure=String(error.stack||error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
 finally{
  if(changed)await run({op:'undo'}).catch(()=>{});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,failure:report.failure,target:report.bridge?.label,commands:report.checks.length,errors},null,2));
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

