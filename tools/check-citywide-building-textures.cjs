const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.CITY_QA_URL||'http://127.0.0.1:4183';
const out=path.resolve(process.env.CITY_QA_OUT||'artifacts/citywide-building-textures');
const modes=(process.env.CITY_QA_MODES||'baseline,city,low').split(',');
const views=[
 ['north',{lat:44.3370,lon:-78.3159,altitude:5,distance:42,bearing:270,pitch:-.06}],
 ['west-street',{lat:44.3028,lon:-78.3498,altitude:6,distance:42,bearing:135,pitch:-.02}],
 ['custom',{lat:44.3010,lon:-78.32212,altitude:8,distance:45,bearing:180,pitch:-.04}],
 ['west',{lat:44.3028,lon:-78.3498,altitude:22,distance:85,bearing:135,pitch:-.20}],
 ['east',{lat:44.30155,lon:-78.3114,altitude:18,distance:75,bearing:40,pitch:-.16}],
 ['downtown',{lat:44.3049,lon:-78.3191,altitude:18,distance:75,bearing:220,pitch:-.16}],
 ['south',{lat:44.27875,lon:-78.32193,altitude:20,distance:85,bearing:110,pitch:-.18}],
];
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
try{for(const mode of modes){const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(r.url().startsWith(base))requests.push({url:r.url(),error:r.failure()?.errorText})});
 const started=Date.now();await page.goto(base+'/city-explorer/?station=2&qa=1&quality='+(mode==='low'?'low':'balanced')+'&cityFacades='+(mode==='baseline'?'0':'1'),{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>document.querySelector('#loading-screen')?.classList.contains('is-hidden')&&window.__PTBO_CITY_QA__,null,{timeout:300000});const startupMs=Date.now()-started,captures=[];console.log(JSON.stringify({mode,stage:'loaded',startupMs}));
 for(const [name,view]of views){await page.evaluate(v=>__PTBO_CITY_QA__.setView(v),view);await page.waitForTimeout(1200);const frames=await page.evaluate(()=>new Promise(resolve=>{let last;const values=[];function frame(t){if(last)values.push(t-last);last=t;if(values.length<120)requestAnimationFrame(frame);else{values.sort((a,b)=>a-b);resolve({medianMs:values[60],p95Ms:values[113],maxMs:values.at(-1)})}}requestAnimationFrame(frame)}));
 const metrics=await page.evaluate(()=>__PTBO_CITY_QA__.metrics());await page.screenshot({path:path.join(out,mode+'-'+name+'.png')});captures.push({name,view,frames,metrics});}
 let driveOutMetres=null;if(mode==='city'){await page.evaluate(()=>__PTBO_GAMEPLAY__.reset());await page.locator('#station2-door-control').click();await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().stationTwo.doors.front.some(d=>d.fraction>=.99));await page.keyboard.press('e');await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().mode==='driving');const before=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);await page.keyboard.down('w');await page.waitForTimeout(6500);await page.keyboard.up('w');const after=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);driveOutMetres=Math.hypot(after.x-before.x,after.z-before.z);if(driveOutMetres<20)throw Error('Driveout blocked: '+driveOutMetres);}
 if(mode!=='baseline'){const d=captures[0].metrics.cityBuildingFacades;if(!d||d.uncoveredPartCount!==0||d.eligibleParts!==d.coveredParts||d.consideredParts!==d.coveredParts+d.excludedParts)throw Error('Coverage accounting mismatch: '+JSON.stringify(d));}
 const result={mode,startedAt:new Date(started).toISOString(),startupMs,errors,requests,driveOutMetres,captures};fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({mode,startupMs,errors,requestFailures:requests.length,driveOutMetres,coverage:captures[0].metrics.cityBuildingFacades?((d)=>({considered:d.consideredParts,eligible:d.eligibleParts,covered:d.coveredParts,excluded:d.excludedParts,uncovered:d.uncoveredPartCount,openings:d.openingQuads,openingBudget:d.openingBudgetPerPart,roadCandidates:d.averageRoadCandidatesPerQuery,exclusions:d.exclusionReasons}))(captures[0].metrics.cityBuildingFacades):null,captures:captures.map(c=>({name:c.name,drawCalls:c.metrics.drawCalls,triangles:c.metrics.triangles,textures:c.metrics.textures,geometries:c.metrics.geometries,frames:c.frames}))}));await page.close();
 }}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});