'use strict';
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']}),page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
 await page.addInitScript(()=>{globalThis.CITY_EDITOR_PUBLISHER_URL='http://127.0.0.1:4188/qa-publisher';});
 await page.route('**/qa-publisher/auth/status',route=>route.fulfill({contentType:'application/json',body:'{"authenticated":true}'}));
 await page.route('**/city-explorer/app.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nglobalThis.qaRenderer=renderer;globalThis.qaCamera=camera;Object.defineProperty(globalThis,"qaCityEditor",{get:()=>cityEditor});globalThis.qaGeneratedRegistry=generatedRegistry;globalThis.qaTHREE=THREE;globalThis.qaGroups={generatedEditorProxyGroup,terrainGroup,roadGroup,mapRoadGroup,buildingGroup,vegetationGroup,streetscapeGroup,streetLabelGroup,landmarkGroup,semanticSurveyGroup,gameplayGroup};'});});
 await page.goto('http://127.0.0.1:4188/city-explorer/?qa=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.documentElement.dataset.gameplayReady==='true',null,{timeout:180000});
 await page.locator('#play-mode').click();await page.locator('canvas').first().focus();await page.keyboard.press('KeyE');await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().mode==='driving');await page.waitForTimeout(2500);
 const result=await page.evaluate(()=>new Promise(resolve=>{
  const groups=Object.fromEntries(Object.keys(qaGroups).map(k=>[k,{meshes:0,draws:0,types:{}}]));let observedFrame=null,proxyUpdates=0;
  const proxies=qaGroups.generatedEditorProxyGroup,originalUpdate=proxies.updateMatrixWorld;proxies.updateMatrixWorld=function(...args){proxyUpdates++;return originalUpdate.apply(this,args);};
  for(const [name,group] of Object.entries(qaGroups))group.traverse(obj=>{if(!obj.isMesh)return;groups[name].meshes++;const before=obj.onBeforeRender;obj.onBeforeRender=function(...args){before.apply(this,args);const frame=qaRenderer.info.render.frame;if(observedFrame===null)observedFrame=frame;if(frame!==observedFrame)return;groups[name].draws++;let parent=obj;while(parent!==group.parent&&!parent.userData?.type)parent=parent.parent;const type=parent?.userData?.type||obj.name||'untagged';groups[name].types[type]=(groups[name].types[type]||0)+1;};});
  requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({groups,proxyUpdates,metrics:__PTBO_CITY_QA__.metrics()})));
 }));
 fs.writeFileSync(path.resolve('test-artifacts/quality-audit/after/render-groups.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert.equal(result.groups.generatedEditorProxyGroup.draws,0,'editor picking proxies must not generate gameplay draw calls');assert.equal(result.proxyUpdates,0,'pick-only proxies must not traverse on each render frame');
 await page.evaluate(async()=>{if(!await qaCityEditor.enter())throw Error('Mock owner editor entry failed');});
 for(const sourceType of ['building','road']){
  const receipt=await page.evaluate(type=>{
   const record=[...qaGeneratedRegistry.records.values()].filter(r=>r.sourceType===type&&r.object.userData.cityEditorProxy).sort((a,b)=>a.object.position.distanceTo(qaCamera.position)-b.object.position.distanceTo(qaCamera.position))[0];
   const worldPosition=new qaTHREE.Vector3().setFromMatrixPosition(record.object.matrixWorld);if(worldPosition.distanceTo(record.object.position)>1e-6)throw Error(type+' proxy world matrix not initialized');
   const ray=new qaTHREE.Raycaster(record.object.position.clone().add(new qaTHREE.Vector3(0,record.object.scale.y+5,0)),new qaTHREE.Vector3(0,-1,0));ray.layers.enable(31);
   if(!ray.intersectObject(record.object).length)throw Error(type+' proxy no longer picks');
   if(!qaCityEditor.selectById(record.id))throw Error(type+' editor selection failed');return{id:record.id,picks:true};
  },sourceType);
  await page.locator('[data-editor-delete]').click();assert.equal(await page.evaluate(id=>qaGeneratedRegistry.records.get(id).object.visible,receipt.id),false);
  await page.evaluate(id=>qaCityEditor.selectById(id),receipt.id);await page.locator('[data-editor-restore]').click();assert.equal(await page.evaluate(id=>qaGeneratedRegistry.records.get(id).object.visible,receipt.id),true);
  result[sourceType+'Editor']={picked:true,selected:true,hiddenAndRestored:true};
 }
 await page.evaluate(()=>qaCityEditor.exit());fs.writeFileSync(path.resolve('test-artifacts/quality-audit/after/render-groups.json'),JSON.stringify(result,null,2));console.log('Editor building/road picking, selection, hide and restore passed with mocked local owner authentication.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
