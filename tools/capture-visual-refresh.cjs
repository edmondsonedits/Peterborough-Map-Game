'use strict';

// Bounded, reproducible camera evidence. A successful run means actual scene
// frames were captured; it deliberately does not claim a visual-quality pass.
// Run against an untouched baseline and the current checkout with this same
// harness. The baseline has eye-height fly cameras, not the newer cab QA hook.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const SOURCE_IDS = ['176908280','755556771','176908281','446343896','383393878','446339024','77717331','446339099','446343895','176910551','1002815290','446366842','1002815291','1002815295','1002815296','1002815324'].map(id => `way/${id}`);
// Targets are mapped frontage midpoints from map-match-register.csv. Camera
// positions are nearest points on the repository's named OSM road centerlines.
// Walmart is an explicitly approximate parking-lot viewpoint. No geographic
// camera assignment is a claim that a target is unobscured in the rendered view.
const SITES = [
  ['chemong-r014-176908280','Walmart Supercentre','way/176908280',44.32449705,-78.33384195,44.3239,-78.3347,45.7,95],
  ['chemong-r026-755556771','Starbucks','way/755556771',44.32236895,-78.33511875,44.3225759,-78.3349805,205.55,25.5],
  ['chemong-r026-176908281','Shoppers Drug Mart','way/176908281',44.32303745,-78.3357265,44.323136,-78.335533,234.57,18.9],
  ['chemong-r033-446343896','Chemong Family Dentistry','way/446343896',44.32051075,-78.33245555,44.3203399,-78.332801,55.36,33.4],
  ['chemong-r037-383393878','Pizza Pizza and Tim Hortons','way/383393878',44.3191713,-78.33214035,44.3193323,-78.3318211,234.82,31.1],
  ['chemong-r041-446339024','Garage behind Bellevue Ultramar','way/446339024',44.3189806,-78.33100535,44.3188223,-78.331316,54.54,30.4],
  ['chemong-r048-77717331','Brookdale Plaza','way/77717331',44.318856,-78.33232675,44.3191845,-78.3316755,234.82,63.5],
  ['chemong-r053-446339099','Dairy Queen','way/446339099',44.31827575,-78.3301999,44.3180748,-78.3305896,54.23,38.3],
  ['chemong-r053-446343895','Little Caesars','way/446343895',44.3177471,-78.3298896,44.3176222,-78.3301387,54.98,24.2],
  ['chemong-r055-176910551','806 Chemong storefronts','way/176910551',44.31737565,-78.329452,44.3172293,-78.3297493,55.47,28.7],
  ['chemong-r056-1002815290','Twin-dormer house','way/1002815290',44.31671525,-78.3297722,44.3168942,-78.3294205,234.58,34.4],
  ['chemong-r057-446366842','KFC','way/446366842',44.3168931,-78.3290643,44.3167731,-78.3293001,54.58,23.1],
  ['chemong-r058-1002815291','Red brick house','way/1002815291',44.3165585,-78.32944045,44.316678,-78.3292056,234.58,23],
  ['chemong-r059-1002815295','Pale gable house','way/1002815295',44.31597175,-78.32885875,44.3160895,-78.328624,234.96,22.8],
  ['chemong-r061-1002815296','Mason north corner house','way/1002815296',44.31575715,-78.3286427,44.315873,-78.3284118,234.95,22.5],
  ['chemong-r061-1002815324','Mason south corner house','way/1002815324',44.3154,-78.3284729,44.3155236,-78.3281334,243.03,30.3],
  ['generic-residential','576 Stewart Street generic house','way/1005416086',44.311073914,-78.325782836,44.3110668,-78.3260183,87.57,18.8],
  ['generic-commercial','166 McDonnel Street generic commercial','way/1005415935',44.3097383,-78.321056125,44.3095889,-78.3210452,357,16.7],
  ['station-1','Station 1 control','way/1009651229',44.300893,-78.322265,44.30069675,-78.32224908,356.68,21.9],
  ['sherbrooke','Sherbrooke blue-house control','way/1006575702',44.30062,-78.32122,44.30073974,-78.32122964,176.7,13.4],
].map(([id,name,sourceId,lat,lon,eyeLat,eyeLon,bearing,distance]) => ({
  id,name,sourceIds:[sourceId],target:{lat,lon},eye:{lat:eyeLat,lon:eyeLon,bearing},distance,
  locationBasis:id.includes('r014')?'approximate Walmart lot position':'mapped road centerline',
}));

const json = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value,null,2)}\n`);
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const percentile = (values, fraction) => [...values].sort((a,b) => a-b)[Math.floor((values.length-1)*fraction)] ?? null;
const root = path.resolve(process.env.PTBO_QA_ARTIFACT_DIR || 'artifacts/visual-refresh');
const criticalError = /\b(?:uncaught|typeerror|referenceerror|syntaxerror|rangeerror|webgl|shader|context\s*lost|failed to load module)\b/i;

function sourceIdentity(sourceRoot) {
  const revision = process.env.PTBO_QA_REVISION || execFileSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const files = fs.readdirSync(path.join(sourceRoot,'city-explorer')).filter(name => /\.(?:js|mjs|html|css)$/.test(name)).map(name => `city-explorer/${name}`);
  for (const name of ['manifest.json','editor/peterborough-details.json']) files.push(`city-explorer/data/${name}`);
  const materials = path.join(sourceRoot,'city-explorer/assets/shared-wall-materials');
  if (fs.existsSync(materials)) for (const name of fs.readdirSync(materials)) {
    if (fs.statSync(path.join(materials,name)).isFile()) files.push(`city-explorer/assets/shared-wall-materials/${name}`);
  }
  const sources = files.sort().map(file => ({file,sha256:sha256(fs.readFileSync(path.join(sourceRoot,file)))}));
  return {revision,sourceHash:sha256(JSON.stringify(sources)),sources,scope:'Top-level runtime modules, HTML/CSS, data manifest, published editor data, and shared-wall source assets; immutable checkout SHA identifies other assets.'};
}

function flyView(site, kind) {
  if (kind === 'eye') return {...site.eye,bearing:(site.eye.bearing+180)%360,altitude:2.5,distance:.01,pitch:.015};
  return {...site.target,bearing:(site.eye.bearing+180+25)%360,altitude:Math.max(12,site.distance*.32),distance:Math.max(42,site.distance*1.15),pitch:-.22};
}

// Count real WebGL draw invocations without changing arguments, shaders or scene
// state. The overhead is identical for every variant; frame timings are rAF wall
// intervals and are never labelled GPU execution time or hardware benchmarks.
function installRenderProbe() {
  const state = {draws:0,contexts:0};
  let activeContext = null;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type,...args) {
    const context = Reflect.apply(originalGetContext,this,[type,...args]);
    if (context && /^(?:webgl2?|experimental-webgl)$/.test(type)) {
      if (activeContext !== context) state.contexts++;
      activeContext = context;
    }
    return context;
  };
  for (const proto of [globalThis.WebGLRenderingContext?.prototype,globalThis.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    for (const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
      if (!Object.hasOwn(proto,name) || typeof proto[name] !== 'function') continue;
      const original = proto[name];
      proto[name] = function(...args) { state.draws++; return Reflect.apply(original,this,args); };
    }
  }
  globalThis.__PTBO_VISUAL_RENDER_PROBE__ = () => {
    const gl = activeContext;
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {...state,contextLost:gl?.isContextLost() ?? true,version:gl?.getParameter(gl.VERSION) ?? null,
      gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
      drawingBuffer:gl?[gl.drawingBufferWidth,gl.drawingBufferHeight]:null};
  };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const data = document.documentElement.dataset;
    const qa = globalThis.__PTBO_CITY_QA__;
    const gameplay = globalThis.__PTBO_GAMEPLAY__?.state();
    const input = qa?.input();
    const metrics = qa?.metrics();
    const map = globalThis.__PTBO_MAP_VIEW__?.state();
    return {build:{shared:globalThis.PTBO_BUILD?.version,explorer:globalThis.PTBO_CITY_EXPLORER_BUILD?.version},
      input,metrics,gameplay,probe:globalThis.__PTBO_VISUAL_RENDER_PROBE__?.(),
      camera:metrics?.renderState?.camera ?? {position:input?.position,yaw:input?.yaw,pitch:input?.pitch,
        fov:gameplay?.camera?.fov,near:gameplay?.camera?.near,agl:map?.altitudeAGL,measurement:'public input/gameplay/map state'},
      readiness:{fullCityReady:data.cityFullReady==='true',loadingHidden:document.querySelector('#loading-screen')?.classList.contains('is-hidden')===true,
        graphicsQuality:data.graphicsQuality,stationOneModel:data.stationOneModel,roadTiles:JSON.parse(data.roadTiles || 'null'),
        roadStreaming:data.roadStreaming,lod:data.cityDetailLod,readyMs:Number(data.cityFullReadyMs)},
      viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},userAgent:navigator.userAgent};
  });
}

async function prefetch(page, position) {
  await page.evaluate(async ({lat,lon}) => {
    const point = globalThis.__PTBO_MAP_VIEW__.project(lat,lon);
    const prefetcher = globalThis.__PTBO_MULTIPLAYER_WORLD_SOURCE__;
    if (!prefetcher?.prefetch) throw new Error('Existing QA road prefetch API missing');
    prefetcher.beginProbe();
    try {
      const result = await prefetcher.prefetch(point.x,point.z);
      if (!result.ready) throw new Error('Required road tiles did not become ready');
    } finally { prefetcher.endProbe(); }
  },position);
}

async function settle(page) {
  await page.waitForFunction(() => {
    const data = document.documentElement.dataset;
    const metrics = globalThis.__PTBO_CITY_QA__?.metrics();
    const roads = JSON.parse(data.roadTiles || 'null');
    return data.cityFullReady==='true' && document.querySelector('#loading-screen')?.classList.contains('is-hidden')
      && metrics?.drawCalls>0 && metrics?.triangles>0 && globalThis.__PTBO_VISUAL_RENDER_PROBE__?.().draws>0
      && (!roads || (roads.pendingCount===0 && roads.failures===0))
      && metrics?.renderState?.roadReady !== false;
  },null,{timeout:120000});
  await page.evaluate(() => new Promise(resolve => {
    let count=0; const frame=()=>{if(++count>=6)resolve();else requestAnimationFrame(frame);}; requestAnimationFrame(frame);
  }));
}

async function sampleFrames(page) {
  return page.evaluate(() => new Promise((resolve,reject) => {
    const started=performance.now(),drawsBefore=globalThis.__PTBO_VISUAL_RENDER_PROBE__().draws;
    const intervals=[];let previous=0;
    const timeout=setTimeout(()=>reject(new Error('Timed out sampling actual rendered frames')),120000);
    const frame=now=>{
      if(previous)intervals.push(now-previous);previous=now;
      if(intervals.length>=12 && now-started>=1000){
        clearTimeout(timeout);resolve({intervals,drawsBefore,drawsAfter:globalThis.__PTBO_VISUAL_RENDER_PROBE__().draws,durationMs:now-started});
      }else requestAnimationFrame(frame);
    };requestAnimationFrame(frame);
  }));
}

async function imagePixels(page, png) {
  return page.evaluate(async encoded => {
    const picture = new Image(); picture.src=`data:image/png;base64,${encoded}`; await picture.decode();
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;
    const context=canvas.getContext('2d');
    context.drawImage(picture,picture.width*.15,picture.height*.15,picture.width*.7,picture.height*.7,0,0,96,64);
    const pixels=context.getImageData(0,0,96,64).data,colors=new Set();let minimum=255,maximum=0;
    for(let i=0;i<pixels.length;i+=4){
      colors.add(`${pixels[i]>>4},${pixels[i+1]>>4},${pixels[i+2]>>4}`);
      const luminance=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
      minimum=Math.min(minimum,luminance);maximum=Math.max(maximum,luminance);
    }
    return {sampledRegion:'central 70% of screenshot',uniqueQuantizedColors:colors.size,luminanceRange:maximum-minimum};
  },png.toString('base64'));
}

async function capture(page, out, site, kind) {
  await prefetch(page,site.eye);
  const request = kind==='cab'?{...site.eye,pitch:.015}:flyView(site,kind);
  const accepted = await page.evaluate(({kind,request}) => kind==='cab'
    ? globalThis.__PTBO_CITY_QA__.setDriverView(request)
    : globalThis.__PTBO_CITY_QA__.setView(request),{kind,request});
  assert.equal(accepted,true,`${site.id} ${kind}: camera request rejected`);
  await settle(page);
  if(site.sourceIds.includes('way/176908280')){
    // Full city readiness does not await the facility GLB layer. A successful
    // generic city frame is not evidence of the intended Walmart replacement.
    await page.waitForFunction(()=>{
      const entry=globalThis.__PTBO_GAMEPLAY__.state().emergencyFacilities['way-176908280'];
      return entry && entry.status!=='loading';
    },null,{timeout:180000});
    const facility=await page.evaluate(()=>({entry:globalThis.__PTBO_GAMEPLAY__.state().emergencyFacilities['way-176908280'],
      current:typeof globalThis.__PTBO_CITY_QA__.setDriverView==='function',quality:document.documentElement.dataset.graphicsQuality}));
    assert.equal(facility.entry.status,'ready',`Walmart replacement failed: ${JSON.stringify(facility.entry)}`);
    if(facility.current && facility.quality!=='lite')assert.equal(facility.entry.decoration,'ready','Walmart route frontage decoration did not load');
    if(facility.current && facility.quality==='lite')assert.equal(facility.entry.decoration,undefined,'Lite unexpectedly added optional Walmart decoration');
  }
  if(site.id==='station-1')await page.waitForFunction(()=>globalThis.__PTBO_MULTIPLAYER_WORLD_SOURCE__.stationReady(1)
    || globalThis.__PTBO_GAMEPLAY__.state().emergencyFacilities.station1?.status==='ready',null,{timeout:180000});
  const frames = await sampleFrames(page);
  const state = await snapshot(page);
  assert.ok(frames.drawsAfter>frames.drawsBefore,'No actual WebGL draws during frame sample');
  assert.equal(state.probe.contextLost,false,'WebGL context was lost');
  assert.ok(state.metrics.drawCalls>0 && state.metrics.triangles>0,'No scene geometry rendered');
  assert.equal(state.readiness.fullCityReady,true,'Full scene did not load');
  assert.equal(state.input.mode,kind==='cab'?'driving':'fly','Wrong camera mode');
  if(kind==='cab')assert.equal(state.gameplay.camera.view,'cab','Actual gameplay cab camera not active');
  const key=`${site.id}-${kind}`;
  const png=await page.screenshot({path:path.join(out,`${key}.png`),timeout:60000});
  const pixels=await imagePixels(page,png);
  assert.ok(pixels.uniqueQuantizedColors>8 && pixels.luminanceRange>10,'Screenshot appears blank or uniform');
  const record={key,site,kind,request,viewSemantics:kind==='cab'?'stationary gameplay cab camera':kind==='eye'?'2.5 metre eye-height fly camera':'oblique fly camera',
    state,performance:{sampleCount:frames.intervals.length,durationMs:frames.durationMs,medianFrameMs:percentile(frames.intervals,.5),
      p95FrameMs:percentile(frames.intervals,.95),p99FrameMs:percentile(frames.intervals,.99),actualWebglDraws:frames.drawsAfter-frames.drawsBefore,
      frameIntervalsMs:frames.intervals,measurement:'requestAnimationFrame wall intervals; not GPU timing or a hardware benchmark'},
    evidence:{png:`${key}.png`,pngSha256:sha256(png),bytes:png.length,pixels},visualReview:'pending'};
  json(path.join(out,`${key}.json`),record);
  console.log(`${key}: ${state.metrics.drawCalls} draws, ${state.metrics.triangles} triangles, ${record.performance.medianFrameMs.toFixed(1)} ms median rAF`);
  return record;
}

async function driveSmoke(page,out) {
  // Straight Chemong segment south of Wolsely. A short ordinary-input movement
  // proves the cab is attached to gameplay; this is not a continuous route test.
  const request={lat:44.316678,lon:-78.3292056,bearing:145.4,pitch:0};
  await prefetch(page,request);
  assert.equal(await page.evaluate(view=>globalThis.__PTBO_CITY_QA__.setDriverView(view),request),true);
  await settle(page);
  const start=await snapshot(page);
  assert.equal(start.gameplay.onRoad,true,'Cab drive start is not on rendered drivable road');
  await page.locator('canvas').first().focus();
  await page.keyboard.down('KeyW');
  let forward;
  try{
    await page.waitForFunction(({x,z})=>{const truck=globalThis.__PTBO_GAMEPLAY__.state().truck;return truck.speed>=.45 && Math.hypot(truck.x-x,truck.z-z)>=.2;},start.gameplay.truck,{timeout:30000});
    forward=await snapshot(page);
  }finally{await page.keyboard.up('KeyW');}
  await page.keyboard.down('KeyS');
  try{await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__.state().truck.speed<=.04,null,{timeout:30000});}
  finally{await page.keyboard.up('KeyS');}
  const end=await snapshot(page);
  const distance=Math.hypot(forward.gameplay.truck.x-start.gameplay.truck.x,forward.gameplay.truck.z-start.gameplay.truck.z);
  assert.equal(forward.gameplay.mode,'driving');assert.equal(forward.gameplay.camera.view,'cab');assert.ok(distance>=.2);
  const png=await page.screenshot({path:path.join(out,'chemong-cab-drive.png')});
  const result={status:'passed',request,start,forward,end,distanceMetres:distance,pngSha256:sha256(png),scope:'Short forward acceleration and brake on one straight Chemong segment; not a whole-route or physical-device test.'};
  json(path.join(out,'chemong-cab-drive.json'),result);return result;
}

async function run(base,label,profile) {
  assert.ok(['balanced','lite'].includes(profile),'Profile must be balanced or lite');
  assert.match(label,/^[a-zA-Z0-9_-]+$/,'Artifact label must be a plain filename');
  const selected = process.env.PTBO_CAPTURE_SITES?.split(',').filter(Boolean);
  const sites = selected?SITES.filter(site=>selected.includes(site.id)):SITES;
  assert.ok(sites.length>0,'No capture sites selected');
  if(selected)assert.equal(sites.length,new Set(selected).size,'Unknown or duplicate selected site');
  const cab = process.env.PTBO_CAPTURE_DRIVER !== '0';
  const out=path.join(root,label,profile);fs.mkdirSync(out,{recursive:true});
  const identity=sourceIdentity(path.resolve(process.env.PTBO_QA_SOURCE_ROOT || '.'));
  const report={schemaVersion:1,status:'running',capturedAt:new Date().toISOString(),base,label,profile,identity,
    viewport:{width:1280,height:800},requestedSites:sites,requiredSourceIds:SOURCE_IDS,
    coverageSemantics:'One dedicated eye-height camera for each enabled profile; actual visibility/occlusion must be inspected in the PNGs.',
    limitations:['Eye-height fly views are separate from actual gameplay cab views.','Baseline lacks QA truck placement, so its cab images are intentionally absent.',
      'Stationary cab viewpoints face frontages; these are not a replay of the reference drive.','Browser automation is not physical-phone certification.','Timing samples are rAF wall intervals, not measured GPU execution time.'],
    errors:{page:[],console:[],failedRequests:[],http:[]},views:[]};
  json(path.join(out,'report.json'),report);
  let browser,page;
  try{
    const {chromium}=require('playwright');
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),
      args:process.platform==='win32'?['--use-angle=d3d11']:[]});
    page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1});
    page.setDefaultTimeout(120000);
    const origin=new URL(base).origin;
    page.on('pageerror',error=>report.errors.page.push(error.message));
    page.on('console',message=>{if(message.type()==='error')report.errors.console.push(message.text());});
    page.on('requestfailed',request=>report.errors.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
    page.on('response',response=>{if(response.status()>=400 && new URL(response.url()).origin===origin && !response.url().endsWith('/favicon.ico'))report.errors.http.push({url:response.url(),status:response.status()});});
    await page.addInitScript(installRenderProbe);
    const url=new URL(`${base.replace(/\/$/,'')}/city-explorer/`);
    url.search=new URLSearchParams({qa:'1',qaMultiplayerWorld:'1',progressive:'0',quality:profile,analytics:'off',revision:identity.revision});
    const extras=new URLSearchParams(process.env.PTBO_CAPTURE_QUERY || '');
    for(const [key,value]of extras){assert.ok(!['quality','qa','qaMultiplayerWorld','progressive'].includes(key),'Capture query may not override readiness/profile settings');url.searchParams.set(key,value);}
    report.url=url.href;
    await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>document.documentElement.dataset.cityFullReady==='true' && globalThis.__PTBO_CITY_QA__?.setView && globalThis.__PTBO_GAMEPLAY__?.state,null,{timeout:300000});
    if(cab){
      report.wallMaterials=await page.evaluate(()=>globalThis.__PTBO_CITY_QA__.materialsReady());
      const expected=profile==='lite' || extras.get('wallMaterials')==='procedural'?'procedural':'source';
      report.wallMaterialExpectation={requested:extras.get('wallMaterials') || 'source',effective:expected,
        reason:profile==='lite'?'Lite disables optional scenery; shared photographic wall assets must remain unused.':'Requested shared-wall mode.'};
      assert.equal(report.wallMaterials.ready,true,'Shared wall materials did not settle');
      assert.equal(report.wallMaterials.sources.length,2,'Both shared wall source families must report readiness');
      assert.ok(report.wallMaterials.sources.every(source=>source.status===expected),`Expected ${expected} wall materials: ${JSON.stringify(report.wallMaterials)}`);
    }
    await settle(page);
    if(cab)assert.equal(await page.evaluate(()=>typeof globalThis.__PTBO_CITY_QA__.setDriverView),'function','Current checkout must expose the actual driver-camera QA hook');
    await page.addStyleTag({content:'#app > :not(canvas):not(#cab-view-frame), #ptbo-build-badge {visibility:hidden!important}'});
    report.initial=await snapshot(page);
    assert.equal(report.initial.readiness.graphicsQuality,profile,'Requested graphics profile was not applied');
    // Keep all fly captures before cab views: older setView intentionally retains
    // the current FOV, and the gameplay cab has a different 68-degree FOV.
    for(const site of sites)for(const kind of ['eye','oblique']){
      report.views.push(await capture(page,out,site,kind));json(path.join(out,'report.json'),report);
    }
    if(cab)for(const site of sites){report.views.push(await capture(page,out,site,'cab'));json(path.join(out,'report.json'),report);}
    if(process.env.PTBO_CAPTURE_DRIVE_SMOKE==='1')report.driveSmoke=await driveSmoke(page,out);
    report.final=await snapshot(page);
    report.sharedWallImageRequests=await page.evaluate(()=>performance.getEntriesByType('resource')
      .filter(entry=>entry.name.includes('/assets/shared-wall-materials/') && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(entry.name))
      .map(entry=>({url:entry.name,transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,decodedBodySize:entry.decodedBodySize})));
    if(cab)assert.equal(report.sharedWallImageRequests.length,report.wallMaterialExpectation.effective==='source'?2:0,'Unexpected shared-wall source image downloads');
    report.errors.criticalConsole=report.errors.console.filter(message=>criticalError.test(message));
    report.errors.criticalRequests=report.errors.failedRequests.filter(item=>new URL(item.url).origin===origin && item.error!=='net::ERR_ABORTED');
    assert.equal(report.errors.page.length,0,report.errors.page.join('\n'));
    assert.equal(report.errors.criticalConsole.length,0,report.errors.criticalConsole.join('\n'));
    assert.equal(report.errors.criticalRequests.length,0,JSON.stringify(report.errors.criticalRequests));
    assert.equal(report.errors.http.length,0,JSON.stringify(report.errors.http));
    const covered=new Set(report.views.filter(view=>view.kind==='eye').flatMap(view=>view.site.sourceIds));
    report.requestedCoverage={capturedSourceIds:[...covered],missingEnabledSourceIds:SOURCE_IDS.filter(id=>!covered.has(id)),partialSelection:Boolean(selected)};
    if(!selected)assert.equal(report.requestedCoverage.missingEnabledSourceIds.length,0,'An enabled source lacks a dedicated eye-height view');
    report.status='captured-awaiting-visual-review';
  }catch(error){
    report.status='failed';report.failure={message:error.message,stack:error.stack};
    if(page){report.failure.state=await snapshot(page).catch(()=>null);await page.screenshot({path:path.join(out,'failure.png'),timeout:10000}).catch(()=>{});}
    throw error;
  }finally{
    report.finishedAt=new Date().toISOString();json(path.join(out,'report.json'),report);await browser?.close();
  }
  console.log(JSON.stringify({status:report.status,label,profile,views:report.views.length,revision:identity.revision,out}));
}

function compare(labels) {
  assert.ok(labels.length>=2,'Provide baseline and current artifact labels');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rows=[];const comparison={labels,profiles:{},visualReview:'pending'};
  for(const profile of ['balanced','lite']){
    const reports=labels.map(label=>{const file=path.join(root,label,profile,'report.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;});
    if(!reports.some(Boolean))continue;
    const pairs=[];
    for(const before of reports[0]?.views || []){
      const after=reports[1]?.views.find(view=>view.key===before.key);if(!after)continue;
      const positionDelta=Math.hypot(...before.state.input.position.map((value,index)=>value-after.state.input.position[index]));
      const fovDelta=Math.abs(before.state.camera.fov-after.state.camera.fov);
      const requestIdentical=JSON.stringify(before.request)===JSON.stringify(after.request);
      pairs.push({key:before.key,requestIdentical,positionDeltaMetres:positionDelta,fovDeltaDegrees:fovDelta,
        camerasMatch:requestIdentical && positionDelta<.02 && fovDelta<.01,
        drawCalls:{before:before.state.metrics.drawCalls,after:after.state.metrics.drawCalls,
          changePercent:(after.state.metrics.drawCalls/before.state.metrics.drawCalls-1)*100},
        triangles:{before:before.state.metrics.triangles,after:after.state.metrics.triangles},
        medianRafMs:{before:before.performance.medianFrameMs,after:after.performance.medianFrameMs}});
    }
    comparison.profiles[profile]={variants:reports.map(report=>report?{label:report.label,status:report.status,revision:report.identity.revision,viewCount:report.views.length}:null),pairs,
      unmatchedCameras:pairs.filter(pair=>!pair.camerasMatch).map(pair=>pair.key)};
    const keys=[...new Set(reports.flatMap(report=>report?.views.map(view=>view.key)||[]))];
    rows.push(`<h2>${escape(profile)}</h2>`);
    for(const key of keys){
      const cells=reports.map((report,index)=>{
        const view=report?.views.find(item=>item.key===key);if(!view)return `<div><h3>${escape(labels[index])}</h3><p>Not captured for this variant.</p></div>`;
        const file=`${labels[index]}/${profile}/${view.evidence.png}`,m=view.state.metrics;
        return `<div><h3>${escape(labels[index])} · ${escape(report.identity.revision.slice(0,8))}</h3><a href="${escape(file)}"><img loading="lazy" src="${escape(file)}" alt="${escape(key)}"></a><p>${m.drawCalls} draws · ${m.triangles} triangles · ${view.performance.medianFrameMs.toFixed(1)} ms rAF · ${m.textures} textures</p><a href="${escape(`${labels[index]}/${profile}/${key}.json`)}">Camera and render receipt</a></div>`;
      });rows.push(`<section><h3>${escape(key)}</h3><div class="row">${cells.join('')}</div></section>`);
    }
  }
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(root,'comparison.html'),`<!doctype html><meta charset="utf-8"><title>Visual refresh capture evidence</title><style>body{font:15px system-ui;background:#12161d;color:#eef2f6;margin:24px}a{color:#a8d5ff}.row{display:grid;grid-template-columns:repeat(${labels.length},minmax(0,1fr));gap:16px}img{width:100%;display:block}section{border-top:1px solid #52606e;padding:16px 0}h3{font-size:15px}p{line-height:1.5}@media(max-width:900px){.row{grid-template-columns:1fr}}</style><h1>Visual refresh camera evidence</h1><p>Actual browser render captures, awaiting visual review. Baseline eye/oblique cameras are matched; baseline has no cab-placement API. Procedural is the same current code with wallMaterials=procedural. Source and camera receipts accompany every image. rAF intervals are not GPU timings; narrow or Lite rendering is not physical-phone testing.</p>${rows.join('\n')}`);
  json(path.join(root,'comparison.json'),comparison);
}

if(require.main===module){
  const [first='http://127.0.0.1:4174',label='current',profile='balanced',...rest]=process.argv.slice(2);
  if(first==='--describe')console.log(JSON.stringify({sites:SITES,sourceIds:SOURCE_IDS,views:['eye','oblique','cab']},null,2));
  else if(first==='--compare')compare([label,profile,...rest]);
  else run(first,label,profile).catch(error=>{console.error(error);process.exitCode=1;});
}
