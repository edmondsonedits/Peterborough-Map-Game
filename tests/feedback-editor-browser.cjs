'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage();await page.route('https://**/*',route=>route.abort());await page.addInitScript(()=>localStorage.setItem('ptbo-emergency-developer-mode','enabled'));
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'cities/ottawa/geo-data.json'))),call=catalog.locations[0],base=`http://127.0.0.1:${server.address().port}`;
 await page.goto(`${base}/dispatch-editor/?city=ottawa&callId=${encodeURIComponent(call.id)}&feedback=test`);await page.evaluate(()=>window.PTBO_EDITOR_READY);
 assert.match(await page.locator('#editor-id').textContent(),new RegExp(call.id));assert.equal(Number(await page.locator('#f-lat').inputValue()),call.lat);assert.equal(Number(await page.locator('#f-radius').inputValue()),call.radius);
 assert.match(await page.locator('#save-status').textContent(),/Feedback location opened/);
 await page.goto(`${base}/dispatch-editor/?city=ottawa&callId=missing-location`);await page.evaluate(()=>window.PTBO_EDITOR_READY);assert.match(await page.locator('#save-status').textContent(),/not in the current Ottawa call catalog/);assert.equal(await page.locator('#editor').evaluate(el=>el.classList.contains('hidden')),true);
 console.log('PASS editor deep link selects exact catalog location; missing IDs do not select or modify another location');
}finally{await browser.close();server.close();}})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
