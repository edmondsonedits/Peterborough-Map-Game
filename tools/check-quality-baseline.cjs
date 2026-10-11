'use strict';
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 const out=path.resolve('test-artifacts/quality-audit/before');fs.mkdirSync(out,{recursive:true});
 const reports=[];
 for(const [name,url,mobile] of [['launcher','/',false],['route','/route-mapping/',false],['geo','/geo-guesser/',false],['geo-wrapper','/geo-guesser/desktop/',false],['response','/response-simulator/play/?city=peterborough',false],['response-mobile','/response-simulator/mobile/?city=peterborough',true],['dispatch-editor','/dispatch-editor/',false],['city','/city-explorer/',false],['tunnel','/tunnel-break/',false]]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},screen:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  await context.addInitScript(()=>localStorage.setItem('ptbo-emergency-developer-mode','enabled'));
  const page=await context.newPage(),errors=[],missing=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:4188')&&r.status()>=400)missing.push(r.status()+' '+new URL(r.url()).pathname)});
  await page.goto('http://127.0.0.1:4188'+url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(name.startsWith('response')||name==='city'?18000:3500);
  const state=await page.evaluate(()=>({title:document.title,body:document.body.innerText.slice(0,1700),overflow:document.documentElement.scrollWidth>innerWidth+1,routeReady:!!window.PTBO_ROUTE_MAPPING,geoReady:!!window.PTBO_GEO_MAP_PROVIDER?.readiness?.().ready,gameplay:window.__PTBO_GAMEPLAY__?.snapshot?.(),frames:[...document.querySelectorAll('iframe')].map(f=>({src:f.src,body:f.contentDocument?.body?.innerText.slice(0,900),enhancements:f.contentWindow?.PTBO_BUILD_ERRORS}))})).catch(e=>({error:e.message}));
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  reports.push({name,errors:[...new Set(errors)],missing:[...new Set(missing)],state});console.log(JSON.stringify(reports.at(-1)));
  await context.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(reports,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});