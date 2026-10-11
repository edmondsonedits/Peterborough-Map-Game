'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const BEFORE_COMMIT = '2496b157ebeb1d995278373297d5790b60a4150a';
const SITES = [
 {name:'hospital-overhead',group:'hospital',lat:44.301005,lon:-78.34631,altitude:75,distance:1,bearing:0,pitch:-1.5},
 {name:'hospital-eastbound',group:'hospital',lat:44.301005,lon:-78.34631,altitude:12,distance:42,bearing:285,pitch:-0.24},
 {name:'hospital-westbound',group:'hospital',lat:44.301005,lon:-78.34631,altitude:12,distance:42,bearing:105,pitch:-0.24},
 {name:'medical-overhead',group:'medical',lat:44.30171,lon:-78.34518,altitude:85,distance:1,bearing:0,pitch:-1.5},
 {name:'medical-northbound',group:'medical',lat:44.30171,lon:-78.34518,altitude:20,distance:55,bearing:180,pitch:-0.24},
 {name:'medical-southbound',group:'medical',lat:44.30171,lon:-78.34518,altitude:20,distance:55,bearing:0,pitch:-0.24},
 {name:'compound-left-through',group:'compound-arrows',wayId:'364843830',expectedCompoundKind:'left;through',lat:44.27218,lon:-78.341218,altitude:35,distance:1,bearing:0,pitch:-1.5},
 {name:'compound-through-right',group:'compound-arrows',wayId:'1414147320',expectedCompoundKind:'through;right',lat:44.299945,lon:-78.348811,altitude:35,distance:1,bearing:0,pitch:-1.5},
 {name:'sherbrooke-station',group:'baseline',lat:44.30080,lon:-78.32212,altitude:36,distance:42,bearing:180,pitch:-0.70},
 {name:'george-downtown',group:'other',lat:44.3045,lon:-78.3200,altitude:40,distance:36,bearing:105,pitch:-0.80},
 {name:'lansdowne-west',group:'baseline',lat:44.2742,lon:-78.3777,altitude:40,distance:42,bearing:180,pitch:-0.72},
 {name:'parkhill-west',group:'other',lat:44.3117,lon:-78.3367,altitude:38,distance:42,bearing:180,pitch:-0.72},
];

function selectSites(selection = '') {
 const requested = selection ? selection.split(',').map(value=>value.trim()) : ['baseline'];
 for(const value of requested) {
  if(!SITES.some(site=>site.group===value || site.name===value)) throw new Error('Unknown paint QA site/group: '+value);
 }
 return SITES.filter(site=>requested.includes(site.group)||requested.includes(site.name));
}

function commitMetadata(env = process.env, readHead = () => execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}).trim()) {
 const before = env.PTBO_PAINT_QA_BEFORE_COMMIT || BEFORE_COMMIT;
 if(before !== BEFORE_COMMIT) throw new Error('Paint QA requires exact before commit '+BEFORE_COMMIT);
 const after = readHead();
 if(!/^[0-9a-f]{40}$/.test(after)) throw new Error('Cannot identify actual candidate git HEAD');
 return {before,after};
}

async function captureSite(page, site, {label,output}) {
 await page.evaluate(view=>window.__PTBO_CITY_QA__.setView(view),site);
 await page.waitForTimeout(1000);
 const samples=await page.evaluate(()=>new Promise(resolve=>{
  const out=[];let previous=performance.now();
  function step(now){out.push(now-previous);previous=now;if(out.length===20)resolve(out);else requestAnimationFrame(step);}
  requestAnimationFrame(step);
 }));
 samples.shift();samples.sort((a,b)=>a-b);
 const metrics=await page.evaluate(()=>({
  ...window.__PTBO_CITY_QA__.metrics(),
  paintVersion:document.documentElement.dataset.roadPaintVersion||'legacy',
  paintVertices:Number(document.documentElement.dataset.roadPaintVertices||0),
  reviewedWays:Number(document.documentElement.dataset.roadPaintReviewedWays||0),
  roadSource:document.documentElement.dataset.officialRoadDetail,
  cityReadyMs:document.documentElement.dataset.cityReadyMs,
 }));
 const view={site:site.name,camera:site,medianFrameMs:samples[Math.floor(samples.length*.5)],p95FrameMs:samples[Math.floor(samples.length*.95)],...metrics};
 if(site.wayId) {
  view.wayId=site.wayId;
  view.expectedCompoundKind=site.expectedCompoundKind;
  if(label==='after') {
   try {
    view.arrowVisibility=await page.evaluate(wayId=>{
     if(typeof window.__PTBO_CITY_QA__?.mappedArrowVisibility!=='function') throw new Error('mappedArrowVisibility QA probe unavailable');
     return window.__PTBO_CITY_QA__.mappedArrowVisibility(wayId);
    },site.wayId);
   } catch(error) {view.arrowVisibilityError=String(error.message);}
  }
 }
 // Always capture pixels before any assertion about renderer or visibility.
 // The QA probe restores arrow meshes and rerenders in its own finally block.
 view.screenshot=label+'-'+site.name+'.png';
 await page.screenshot({path:path.join(output,view.screenshot)});
 return view;
}

function validateRun(entry) {
 if(entry.views.some(view=>!String(view.roadSource).includes('municipal'))) throw new Error('Municipal road surfaces did not load');
 if(entry.label==='after') {
  if(entry.views.some(view=>view.paintVersion!=='street-evidence-2')) throw new Error('New paint renderer was not active');
  if(entry.views.some(view=>view.reviewedWays!==6)) throw new Error('Expected six reviewed GeoJSON way IDs; inspect actual support and captured screenshots');
  for(const view of entry.views.filter(view=>view.expectedCompoundKind)) {
   const normalize=kind=>String(kind).split(';').sort().join(';');
   const targets=view.arrowVisibility?.targets?.filter(target=>normalize(target.kind)===normalize(view.expectedCompoundKind)) || [];
   if(view.arrowVisibilityError || !targets.length || targets.some(target=>
    !Number.isFinite(target.changedPixels) || !Number.isFinite(target.brighterPixels) || target.changedPixels<5 || target.brighterPixels<5)) {
    throw new Error(`Candidate compound arrow visibility failed at ${view.site}: ${view.arrowVisibilityError || JSON.stringify(view.arrowVisibility)}`);
   }
  }
 }
 if(entry.errors.length)throw new Error(entry.label+' uncaught browser errors: '+entry.errors.join('; '));
}

function entryURL(root, lowPower=false) {
 return root+'/city-explorer/?qa=1&municipalRoads=1'+(lowPower?'&lite=1':'');
}
async function main() {
 const {chromium}=require('playwright');
 const before=process.argv[2]||'http://127.0.0.1:4175';
 const after=process.argv[3]||'http://127.0.0.1:4174';
 const output=path.resolve(process.env.PTBO_QA_ARTIFACT_DIR||'artifacts/street-paint-qa');
 const sites=selectSites(process.env.PTBO_PAINT_QA_SITES);
 const commits=commitMetadata();
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const report={method:'Same headless software-rendered Chromium, viewport and cameras. Before commit is the declared exact baseline; candidate commit is actual local git HEAD. Not real phone GPU benchmarking, current-condition verification or survey accuracy.',commits,lowPower:process.env.PTBO_PAINT_QA_LOW_POWER==='1',runs:[]};
 try {
  for(const [label,root] of [['before',before],['after',after]]) {
   const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
   const errors=[];
   page.on('pageerror',error=>errors.push(String(error.message)));
   const entry={label,root,commit:commits[label],errors,views:[]};
   report.runs.push(entry);
   const start=Date.now();
   await page.goto(entryURL(root,report.lowPower),{waitUntil:'domcontentloaded',timeout:90000});
   await page.waitForFunction(()=>document.documentElement.dataset.gameplayReady==='true',null,{timeout:180000});
   entry.readyMs=Date.now()-start;
   for(const site of sites) entry.views.push(await captureSite(page,site,{label,output}));
   validateRun(entry);
   await page.close();
  }
 } catch(error) {
  report.failure=String(error.message);
  throw error;
 } finally {
  fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  await browser.close();
 }
}
module.exports={entryURL,BEFORE_COMMIT,SITES,selectSites,commitMetadata,captureSite,validateRun};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
