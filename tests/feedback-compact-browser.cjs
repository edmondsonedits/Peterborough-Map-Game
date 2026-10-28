'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const base=`http://127.0.0.1:${server.address().port}`;try{
 for(const viewport of [{width:338,height:656},{width:390,height:844},{width:1000,height:800}]){
  const page=await browser.newPage({viewport});await page.goto(base+'/tests/fixtures/location-report.html');await page.locator('#location-report-button').click();
  const details=page.locator('.fb-report-context'),body=details.locator('.fb-auto-context-body');
  assert.equal(await details.evaluate(el=>el.open),false);assert.equal(await body.isVisible(),false);
  assert.equal(await page.locator('.fb-report-place').isVisible(),true);assert.equal(await page.locator('[name="note"]').isVisible(),true);
  const send=page.getByRole('button',{name:'Send report',exact:true});await send.scrollIntoViewIfNeeded();const box=await send.boundingBox(),dialog=await page.locator('dialog').boundingBox();assert.ok(box.y>=dialog.y&&box.y+box.height<=dialog.y+dialog.height+1);
  await details.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await body.isVisible(),true);assert.match(await body.textContent(),/Browser:.*\nViewport:/s);
  await details.locator('summary').click();assert.equal(await body.isVisible(),false);
  if(viewport.width===338)await page.screenshot({path:'/tmp/pmg-compact-report-338.png'});
  await page.locator('[name="note"]').fill('Please review this circle.');await send.click();await page.getByRole('button',{name:'Open conversation',exact:true}).waitFor();
  const saved=await page.evaluate(async()=>{const service=PTBO_FEEDBACK.service,t=(await service.loadThreads()).rows[0];let messages;service.watchMessages(t.id,p=>messages=p.rows);return{snapshot:t.locationReport.snapshot,body:messages[0].body};});
  assert.equal(saved.snapshot.callId,'ptbo-location-b53711e5e3c867');assert.match(saved.body,/Please review this circle\.[\s\S]*Browser:[\s\S]*Viewport:[\s\S]*Report opened:/);
  console.log(`PASS ${viewport.width}×${viewport.height}: technical details hidden, keyboard disclosure works, Send reachable, report context retained`);await page.close();
 }
 const page=await browser.newPage({viewport:{width:338,height:656}});await page.goto(base+'/tests/fixtures/feedback-ui.html');await page.locator('#ptbo-feedback-entry').click();await page.locator('#feedback-new').click();
 const details=page.locator('.fb-message-context');assert.equal(await details.evaluate(el=>el.open),false);assert.equal(await page.locator('#feedback-city').isVisible(),false);
 await page.locator('#feedback-title').fill('Feedback');await page.locator('#feedback-body').fill('More practice locations please.');
 await page.locator('#feedback-city').evaluate(el=>{el.value='';el.form.requestSubmit();});assert.equal(await details.evaluate(el=>el.open),true);assert.equal(await page.locator('#feedback-city').isVisible(),true);assert.equal(await page.locator('#feedback-city').evaluate(el=>document.activeElement===el),true);
 console.log('PASS general feedback hides automatic context and reveals required fields when validation needs attention');await page.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
