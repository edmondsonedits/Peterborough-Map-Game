'use strict';

// Repeatable mobile-layout driving captures for road paint QA. This is a
// Playwright phone emulation pass, not a physical-device GPU/performance test.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const [beforeUrl = 'http://127.0.0.1:4186', afterUrl = 'http://127.0.0.1:4187', outputArg = 'artifacts/road-markings-phone'] = process.argv.slice(2);
const output = path.resolve(process.env.ROAD_MARKING_PHONE_OUTPUT || outputArg);
const contractPath = path.join(output, 'pose-contract.json');
const allProfiles = [
  { name: 'low', width: 390, height: 720, dpr: 2, query: '&quality=low' },
  { name: 'balanced', width: 390, height: 720, dpr: 2, query: '' },
  { name: 'high', width: 390, height: 720, dpr: 3, query: '&quality=high' },
];
const profiles = String(process.env.ROAD_MARKING_PHONE_PROFILES || 'low,balanced,high').split(',').map(name=>allProfiles.find(profile=>profile.name===name.trim())).filter(Boolean);
const allTargets = ['water-showplace-cycle', 'curved-road', 'junction', 'bridge', 'sherbrooke'];
const targets = String(process.env.ROAD_MARKING_PHONE_TARGETS || allTargets.join(',')).split(',').map(name=>name.trim()).filter(name=>allTargets.includes(name));
const appOriginFor = url => new URL(url).origin;

function instrumentation() {
  return `\n;(()=>{if(!new URLSearchParams(location.search).has('roadPhoneQa'))return;
    globalThis.__ROAD_PHONE_QA__={
      get state(){return state},get renderer(){return renderer},get camera(){return camera},get scene(){return scene},
      get roadGroup(){return roadGroup},get truckState(){return truckState},get truckActor(){return fireTruckActor},
      get roadTileLayer(){return roadTileLayer},get roadTileManifest(){return roadTileManifest},
      get segments(){return state.roadMarkingSegments||[]},get gameplayReady(){return gameplayReady},
      project,gameplaySurfaceAt,headingFromDirection,updateGameplayHud,syncGameplayRootClasses,
      updateCamera:(snap=true)=>updateGameplayCamera(1/60,snap),stepTruck:updateFireTruck,
      placeTruck({x,z,heading}){
        state.mode='driving';state.gameplayYaw=heading;state.gameplayPitch=-0.19;state.gameplayCameraDistanceScale=1;
        const surface=gameplaySurfaceAt(x,z,null);truckState.x=x;truckState.z=z;truckState.y=surface.height+0.035;
        truckState.heading=heading;truckState.speed=0;truckState.acceleration=0;truckState.steering=0;truckState.pitch=0;truckState.roll=0;truckState.lastRoadWheelCount=4;
        fireTruckActor.position.set(truckState.x,truckState.y,truckState.z);fireTruckActor.rotation.set(0,heading,0,'YXZ');
        syncGameplayRootClasses();updateGameplayHud();updateGameplayCamera(1/60,true);
        return {surface:{onRoad:surface.onRoad,height:surface.height,name:surface.name},truck:{x:truckState.x,z:truckState.z,y:truckState.y,heading:truckState.heading}};
      },
      refresh(){updateGameplayHud();updateGameplayCamera(1/60,true);scene.updateMatrixWorld(true)},
      suspendRender(value){globalThis.__ROAD_PHONE_QA_SUSPEND_RENDER__=Boolean(value)},
      renderOnce(){originalRender(scene,camera)}
    };
    const originalRender=renderer.render.bind(renderer);
    renderer.render=(...args)=>{if(!globalThis.__ROAD_PHONE_QA_SUSPEND_RENDER__)originalRender(...args)};
  })();\n`;
}

async function discoverContract(page) {
  return page.evaluate((targetNames) => {
    const q=globalThis.__ROAD_PHONE_QA__, segments=q.segments.filter(s=>s?.a&&s?.b&&Number.isFinite(s.a.x)&&Number.isFinite(s.a.y));
    const point=(s,t=.5)=>({x:s.a.x+(s.b.x-s.a.x)*t,z:s.a.y+(s.b.y-s.a.y)*t});
    const heading=(s,reverse=false)=>q.headingFromDirection((s.b.x-s.a.x)*(reverse?-1:1),(s.b.y-s.a.y)*(reverse?-1:1));
    const ids=s=>String(s.lineId||'');
    const tags=s=>s.tags||{};
    const oneWay=s=>['yes','1','true','-1'].includes(String(tags(s).oneway||'').toLowerCase());
    const cycle=s=>Object.entries(tags(s)).some(([key,value])=>/^cycleway(?::(?:left|right|both))?$/.test(key)&&String(value).toLowerCase()==='lane');
    const water=segments.filter(s=>/water street/i.test(s.name||tags(s).name||'')&&oneWay(s));
    const showplace=q.project(44.3026758,-78.3195376);const show={x:showplace.x,z:showplace.y};
    const distanceTo=(s,p)=>Math.hypot(point(s).x-p.x,point(s).z-p.z);
    water.sort((a,b)=>(cycle(b)?1:0)-(cycle(a)?1:0)||distanceTo(a,show)-distanceTo(b,show));
    const selectedWater=water[0];

    const byLine=new Map();for(const s of segments){const id=ids(s);if(!id)continue;if(!byLine.has(id))byLine.set(id,[]);byLine.get(id).push(s)}
    const curves=[];
    for(const [lineId,list] of byLine){list.sort((a,b)=>(a.chainStart||0)-(b.chainStart||0));for(let i=1;i<list.length;i++){
      const a=list[i-1],b=list[i];if(Math.hypot(a.b.x-b.a.x,a.b.y-b.a.y)>1.2)continue;
      const h1=heading(a),h2=heading(b);const turn=Math.atan2(Math.sin(h2-h1),Math.cos(h2-h1));
      const highway=String(tags(b).highway||'');
      if(Math.abs(turn)>.24&&!['service','footway','cycleway','path','track'].includes(highway))curves.push({segment:b,lineId,turn,score:Math.hypot(point(b).x-show.x,point(b).z-show.z)});
    }}
    curves.sort((a,b)=>a.score-b.score);const curve=curves[0];

    const nodeMap=new Map();for(const s of segments)for(const [p,id] of [[{x:s.a.x,z:s.a.y},s.aNodeId],[{x:s.b.x,z:s.b.y},s.bNodeId]]){
      const key=id?String(id):`${Math.round(p.x*2)}:${Math.round(p.z*2)}`;if(!nodeMap.has(key))nodeMap.set(key,new Map());nodeMap.get(key).set(ids(s),{point:p,segment:s});
    }
    let junction=null;for(const roads of nodeMap.values())if(roads.size>=3){const samples=[...roads.values()];const p=samples[0].point;const score=Math.hypot(p.x-show.x,p.z-show.z);if(!junction||score<junction.score)junction={point:p,segment:samples[0].segment,score};}
    const bridges=segments.filter(s=>Boolean(s.bridge)||['yes','viaduct','bridge'].includes(String(tags(s).bridge||'').toLowerCase()));
    // Anchor the bridge screenshot to the mapped Hunter Street East deck rather
    // than whichever bridge happens to be nearest the Showplace comparison.
    const hunterBridgeAnchor=q.project(44.30578,-78.31375),hunterBridgePoint={x:hunterBridgeAnchor.x,z:hunterBridgeAnchor.y};
    const hunterBridgeSegments=bridges.filter(s=>/hunter street east/i.test(s.name||tags(s).name||''));
    hunterBridgeSegments.sort((a,b)=>distanceTo(a,hunterBridgePoint)-distanceTo(b,hunterBridgePoint));
    bridges.sort((a,b)=>distanceTo(a,show)-distanceTo(b,show));
    const sherbrooke=segments.filter(s=>/sherbrooke street/i.test(s.name||tags(s).name||''));
    const sherbrookeAnchor=q.project(44.3006997,-78.3221781),sherbrookePoint={x:sherbrookeAnchor.x,z:sherbrookeAnchor.y};
    sherbrooke.sort((a,b)=>distanceTo(a,sherbrookePoint)-distanceTo(b,sherbrookePoint));
    const make=(name,s,extra={})=>{if(!s)return null;const reverse=String(tags(s).oneway||'').toLowerCase()==='-1';const p=point(s,.5);return {name,x:p.x,z:p.z,heading:heading(s,reverse),lineId:ids(s),street:s.name||tags(s).name||null,segment:{a:[s.a.x,s.a.y],b:[s.b.x,s.b.y],chainStart:s.chainStart||0,width:s.width||0},tags:tags(s),...extra}};
    const result={
      'water-showplace-cycle':make('water-showplace-cycle',selectedWater,{cyclewayTagFound:Boolean(selectedWater&&cycle(selectedWater)),showplaceProjected:show,distanceToShowplace: selectedWater?distanceTo(selectedWater,show):null}),
      'curved-road':curve?make('curved-road',curve.segment,{turnRadians:curve.turn}):null,
      junction:junction?make('junction',junction.segment,{node:[junction.point.x,junction.point.z]}):null,
      bridge:make('bridge',hunterBridgeSegments[0]||bridges[0],{bridgeDeckSource:Boolean(hunterBridgeSegments[0]),bridgeAnchorProjected:hunterBridgePoint}),
      sherbrooke:make('sherbrooke',sherbrooke[0]||null),
    };
    return Object.fromEntries(targetNames.map(name=>[name,result[name]]));
  },targets);
}

async function validateContract(page, contract) {
  return page.evaluate(poses=>Object.entries(poses).map(([name,pose])=>{
    const q=globalThis.__ROAD_PHONE_QA__,baseId=String(pose.lineId||'').split(':')[0];
    const candidates=q.segments.filter(s=>String(s.lineId||'')===pose.lineId||String(s.lineId||'').split(':')[0]===baseId);
    let nearest={distance:Infinity,segment:null};
    for(const s of candidates){const ax=s.a.x,az=s.a.y,bx=s.b.x,bz=s.b.y,dx=bx-ax,dz=bz-az,len=dx*dx+dz*dz,t=len?Math.max(0,Math.min(1,((pose.x-ax)*dx+(pose.z-az)*dz)/len)):0,x=ax+dx*t,z=az+dz*t,distance=Math.hypot(x-pose.x,z-pose.z);if(distance<nearest.distance)nearest={distance,segment:s};}
    const tags=nearest.segment?.tags||{};const cycleway=name==='water-showplace-cycle'&&Object.entries(tags).some(([key,value])=>/^cycleway(?::(?:left|right|both))?$/.test(key)&&String(value).toLowerCase()==='lane');
    return{name,lineId:pose.lineId,candidateCount:candidates.length,nearestMetres:Number.isFinite(nearest.distance)?nearest.distance:null,cyclewayTagValid:name!=='water-showplace-cycle'||cycleway,valid:Boolean(nearest.segment)&&nearest.distance<=5&&(name!=='water-showplace-cycle'||cycleway)};
  }),contract);
}

async function boot(browser, root, profile) {
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},screen:{width:profile.width,height:profile.height},deviceScaleFactor:profile.dpr,isMobile:true,hasTouch:true});
  const page=await context.newPage(),origin=appOriginFor(root);
  const errors={page:[],console:[],consoleEntries:[],requests:[],http:[],tileFailures:[]};
  await page.addInitScript(()=>{window.__ROAD_PHONE_BOOT_TRACE__=[];const record=(kind,target)=>window.__ROAD_PHONE_BOOT_TRACE__.push({t:performance.now(),kind,target:String(target).slice(0,180)});const attach=()=>{const root=document.documentElement;if(!root)return false;new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')record(r.attributeName,r.target.id||r.target.className||r.target.tagName);else record('childList',r.target.id||r.target.tagName)}}).observe(root,{subtree:true,attributes:true,attributeFilter:['class','style'],childList:true});return true};if(!attach())new MutationObserver((_,observer)=>{if(attach())observer.disconnect()}).observe(document,{childList:true,subtree:true});addEventListener('error',e=>record('window-error',e.message));addEventListener('unhandledrejection',e=>record('unhandled-rejection',e.reason?.message||e.reason));});
  page.on('pageerror',e=>errors.page.push(String(e.stack||e).slice(0,1000)));
  page.on('console',m=>{if(m.type()==='error')errors.console.push(m.text().slice(0,800));});
  page.on('console',m=>{if(m.type()==='error')errors.consoleEntries.push({text:m.text().slice(0,800),location:m.location()})});
  page.on('requestfailed',r=>{try{if(new URL(r.url()).origin===origin){const item={url:r.url(),error:r.failure()?.errorText||'request failed'};errors.requests.push(item);if(/tile|road/i.test(r.url()))errors.tileFailures.push(item)}}catch{}});
  page.on('response',r=>{if(r.status()<400)return;try{const u=new URL(r.url());const item={url:r.url(),status:r.status(),firstParty:u.origin===origin};errors.http.push(item);if(/tile|road/i.test(r.url()))errors.tileFailures.push(item)}catch{}});
  await page.route('**/city-explorer/app.js*',async route=>{const response=await route.fetch();let source=await response.text();source=source.replace('aSourceVertex: a.sourceVertex,','aSourceVertex: a.sourceVertex, aNodeId: a.nodeId,').replace('bSourceVertex: b.sourceVertex,','bSourceVertex: b.sourceVertex, bNodeId: b.nodeId,');source+=instrumentation();await route.fulfill({response,body:source,headers:{...response.headers(),'content-length':String(Buffer.byteLength(source))}})});
  try {
  const started=Date.now();const response=await page.goto(`${root.replace(/\/$/,'')}/city-explorer/?qa=1&roadPhoneQa=1${profile.query}`,{waitUntil:'domcontentloaded',timeout:90000});
  const bootDiagnostic=()=>page.evaluate(()=>{const overlay=document.querySelector('#loading-screen'),style=overlay&&getComputedStyle(overlay),canvas=document.querySelector('canvas'),bootstrap=globalThis.__PTBO_EXPLORER_BOOTSTRAP__;let gameplay=null;try{gameplay=globalThis.__PTBO_GAMEPLAY__?.state?.()||null}catch(error){gameplay={stateError:String(error)}}return{url:location.href,ready:document.documentElement.dataset.gameplayReady||null,dataset:{...document.documentElement.dataset},overlay:overlay?{className:overlay.className,text:overlay.innerText,display:style.display,visibility:style.visibility,opacity:style.opacity}:null,bootstrap:bootstrap?{keys:Object.keys(bootstrap),touchType:typeof bootstrap.touch,readyType:typeof bootstrap.ready,failType:typeof bootstrap.fail}:null,truckAppearance:gameplay?.truckAppearance||null,gameplay,canvas:canvas?{width:canvas.width,height:canvas.height}:null,bootTrace:(window.__ROAD_PHONE_BOOT_TRACE__||[]).slice(-24)}});
  const waitWithDiagnostic=async(label,predicate)=>{let reported=false;const timer=setTimeout(async()=>{reported=true;try{const snapshot={progress:label,elapsedMs:Date.now()-started,diagnostics:await bootDiagnostic(),pageErrors:errors.page,consoleErrors:errors.console};reportRef.preflightDiagnostics??=[];reportRef.preflightDiagnostics.push(snapshot);persistReport(reportRef);console.log(JSON.stringify(snapshot))}catch(error){console.log(JSON.stringify({progress:label,diagnosticError:String(error)}))}},60000);try{await page.waitForFunction(predicate,null,{timeout:240000})}catch(error){throw new Error(`${label} failed after 240 seconds: ${JSON.stringify(await bootDiagnostic())}; pageErrors=${JSON.stringify(errors.page)}; consoleErrors=${JSON.stringify(errors.console)}; ${error.message}`)}finally{clearTimeout(timer)}return reported};
  await waitWithDiagnostic('gameplay-ready',()=>document.documentElement.dataset.gameplayReady==='true'&&globalThis.__ROAD_PHONE_QA__?.roadTileLayer);
  await waitWithDiagnostic('loading-overlay-display-none',()=>{const el=document.querySelector('#loading-screen');return !el||getComputedStyle(el).display==='none'});
  await waitWithDiagnostic('truck-appearance-blender-ready',()=>globalThis.__PTBO_GAMEPLAY__?.state?.().truckAppearance?.status==='blender-ready'&&document.documentElement.dataset.pumperAsset==='blender-ready');
  await waitWithDiagnostic('road-marking-segments',()=>globalThis.__ROAD_PHONE_QA__?.segments?.length>0);
  if(await page.evaluate(()=>globalThis.__PTBO_GAMEPLAY__?.state?.().mode!=='driving')){
    await page.locator('#mobile-action-button').tap({timeout:30000});
    await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state?.().mode==='driving',null,{timeout:30000});
  }
  return {context,page,errors,responseStatus:response?.status()||null,readyMs:Date.now()-started,profile,enteredDrivingViaTouch:true};
  } catch(error) {await context.close();throw error;}
}

async function settle(page, pose) {
  return page.evaluate(async p=>{
    const q=globalThis.__ROAD_PHONE_QA__;
    q.placeTruck(p);q.refresh();
    const stats=await q.roadTileLayer.update(q.camera.position.x,q.camera.position.z,{protectX:p.x,protectZ:p.z,protectRadius:100});
    if(!q.roadTileLayer.readyAt(p.x,p.z,12))throw new Error(`Road tile coverage not ready at ${p.name}: ${JSON.stringify({stats,tiles:q.roadTileLayer.stats(),camera:[q.camera.position.x,q.camera.position.z],truck:[p.x,p.z],tileError:document.documentElement.dataset.roadTileError||null})}`);
    await new Promise((resolve,reject)=>{const started=performance.now(),check=()=>{const toast=document.querySelector('#toast');if(!toast||!toast.classList.contains('is-visible'))return resolve();if(performance.now()-started>10000)return reject(new Error('Driving toast did not expire before pose capture'));setTimeout(check,100);};check();});
    const placed=q.placeTruck(p);q.suspendRender(true);q.refresh();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));q.refresh();q.renderOnce();
    const hud=document.querySelector('#gameplay-hud'),hudStyle=hud&&getComputedStyle(hud),canvas=document.querySelector('canvas');
    const gl=q.renderer.getContext(),attributes=gl.getContextAttributes()||{};
    return {placed,mode:q.state.mode,camera:{position:q.camera.position.toArray(),quaternion:q.camera.quaternion.toArray(),fov:q.camera.fov},
      rendering:{pixelRatio:q.renderer.getPixelRatio(),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],antialias:attributes.antialias,alpha:attributes.alpha,webgl2:q.renderer.capabilities.isWebGL2,maxTextureSize:q.renderer.capabilities.maxTextureSize},
      roadPack:q.roadTileManifest?.buildId||null,quality:document.querySelector('#graphics-quality-select')?.value||null,
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,isMobile:matchMedia('(pointer:coarse)').matches},
      hud:{present:Boolean(hud),display:hudStyle?.display||null,visibility:hudStyle?.visibility||null,opacity:Number(hudStyle?.opacity||0),box:hud?(()=>{const r=hud.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})():null},
      truckActorVisible:Boolean(q.truckActor?.visible),tileStats:q.roadTileLayer.stats(),canvas:{width:canvas?.width,height:canvas?.height}};
  },pose);
}

async function touchDriveTurn(page) {
  const start=await page.evaluate(()=>({x:globalThis.__ROAD_PHONE_QA__.truckState.x,z:globalThis.__ROAD_PHONE_QA__.truckState.z,heading:globalThis.__ROAD_PHONE_QA__.truckState.heading}));
  const box=await page.locator('#movement-joystick').boundingBox();if(!box)return {available:false,reason:'movement joystick is not visible'};
  const x=box.x+box.width/2,y=box.y+box.height/2,r=Math.min(box.width,box.height)*.27;
  const session=await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y-r,id:1,radiusX:5,radiusY:5,force:1}]});
    await page.waitForTimeout(900);
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-r*.55,y:y-r*.82,id:1,radiusX:5,radiusY:5,force:1}]});
    await page.waitForTimeout(1000);
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } finally {await session.detach();}
  const end=await page.evaluate(()=>({x:globalThis.__ROAD_PHONE_QA__.truckState.x,z:globalThis.__ROAD_PHONE_QA__.truckState.z,heading:globalThis.__ROAD_PHONE_QA__.truckState.heading,steering:globalThis.__ROAD_PHONE_QA__.truckState.steering,speed:globalThis.__ROAD_PHONE_QA__.truckState.speed}));
  return {available:true,start,end,distance:Math.hypot(end.x-start.x,end.z-start.z),headingDelta:Math.atan2(Math.sin(end.heading-start.heading),Math.cos(end.heading-start.heading)),onRoad:await page.evaluate(()=>globalThis.__ROAD_PHONE_QA__.gameplaySurfaceAt(globalThis.__ROAD_PHONE_QA__.truckState.x,globalThis.__ROAD_PHONE_QA__.truckState.z).onRoad)};
}

async function runRoot(browser, label, root, contract, initial=null) {
  const rootOut=path.join(output,label);fs.mkdirSync(rootOut,{recursive:true});
  for(const profile of profiles){
    const booted=initial&&profile.name===initial.profile.name?initial:await boot(browser,root,profile);
    const {context,page,errors,responseStatus,readyMs}=booted;
    const run={label,profile,responseStatus,readyMs,poses:[],errors};reportRef.runs.push(run);persistReport(reportRef);
    try {
      run.sourcePoseValidation=await validateContract(page,contract);
      if(run.sourcePoseValidation.some(item=>!item.valid))throw new Error(`Frozen pose no longer matches source geometry: ${JSON.stringify(run.sourcePoseValidation.filter(item=>!item.valid))}`);
      for(const name of targets){if(profile.name!=='balanced'&&name!=='water-showplace-cycle'){run.poses.push({name,skipped:true,reason:'Low/high profiles capture the Water Street comparison pose; balanced captures all route contexts.'});persistReport(reportRef);continue;}
        const pose=contract[name];if(!pose){run.poses.push({name,skipped:true,reason:'No authoritative source segment was found by the selector.'});continue;}
        const placement=await settle(page,pose);await page.screenshot({path:path.join(rootOut,`${profile.name}-${name}.png`),fullPage:false,timeout:120000,animations:'disabled'});
        run.poses.push({name,source:{lineId:pose.lineId,street:pose.street,tags:pose.tags,cyclewayTagFound:pose.cyclewayTagFound,distanceToShowplace:pose.distanceToShowplace},placement});persistReport(reportRef);
      }
      if(profile.name==='balanced'&&contract['water-showplace-cycle']){await settle(page,contract['water-showplace-cycle']);await page.evaluate(()=>globalThis.__ROAD_PHONE_QA__.suspendRender(false));run.touchDriveTurn=await touchDriveTurn(page);}
      run.finalDiagnostics={pageErrors:errors.page,consoleErrors:errors.console,firstPartyHttpFailures:errors.http.filter(e=>e.firstParty),failedRequests:errors.requests,tileFailures:errors.tileFailures,
        consoleEntries:errors.consoleEntries,httpFailures:errors.http,
        renderer:await page.evaluate(()=>{const q=globalThis.__ROAD_PHONE_QA__,gl=q.renderer.getContext();return{pixelRatio:q.renderer.getPixelRatio(),maxAnisotropy:q.renderer.capabilities.getMaxAnisotropy(),attributes:gl.getContextAttributes(),info:{render:q.renderer.info.render,memory:q.renderer.info.memory}}})};
    } catch(error) {run.failure=String(error.stack||error);persistReport(reportRef);throw error;}
    finally {await context.close();if(initial===booted)initial=null;}
  }
}

let reportRef=null;
function persistReport(report){if(!report)return;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}

(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
  const report={method:'Same Playwright mobile emulation, portrait 390x720 viewport, touch controls, renderer flags, and frozen world-space truck poses. Software WebGL results do not establish physical-phone performance.',profiles,runs:[],assertions:{}};
  reportRef=report;
  try {
    const first=await boot(browser,beforeUrl,profiles[0]);let contract;
    contract=fs.existsSync(contractPath)?JSON.parse(fs.readFileSync(contractPath,'utf8')):null;
    if(contract){const validation=await validateContract(first.page,contract);if(validation.some(item=>!item.valid))contract=null;}
    if(!contract)contract=await discoverContract(first.page);
    if(targets.includes('bridge')&&!contract.bridge?.bridgeDeckSource)throw new Error('No source-tagged Hunter Street East bridge deck segment was found; refusing the generic nearest-bridge fallback.');
    fs.writeFileSync(contractPath,JSON.stringify(contract,null,2));
    const present=targets.filter(name=>contract[name]);
    if(targets.includes('water-showplace-cycle')&&!present.includes('water-showplace-cycle'))throw new Error('No one-way Water Street segment was found for the requested Showplace-area pose.');
    report.poseContract={path:contractPath,poses:present.map(name=>({name,lineId:contract[name].lineId,street:contract[name].street,x:contract[name].x,z:contract[name].z,heading:contract[name].heading,sourceTags:contract[name].tags||{},bridgeDeckSource:contract[name].bridgeDeckSource||false,bridgeAnchorProjected:contract[name].bridgeAnchorProjected||null,cyclewayTagFound:contract[name].cyclewayTagFound||false}))};
    await runRoot(browser,process.env.ROAD_MARKING_PHONE_LABEL||'before',beforeUrl,contract,first);
    if(afterUrl!==beforeUrl)await runRoot(browser,'after',afterUrl,contract);
    const failures=report.runs.flatMap(run=>[
      ...run.errors.page.map(message=>`${run.label}/${run.profile.name} page: ${message}`),
      ...run.errors.http.filter(item=>item.firstParty).map(item=>`${run.label}/${run.profile.name} HTTP ${item.status}: ${item.url}`),
      ...run.errors.requests.map(item=>`${run.label}/${run.profile.name} request: ${item.url} (${item.error})`),
    ]);
    const touchRuns=report.runs.filter(run=>run.profile.name==='balanced');
    const captured=report.runs.flatMap(run=>run.poses.filter(p=>p.placement).map(p=>({profile:run.profile.name,...p.placement})));
    const expectedPack=process.env.ROAD_MARKING_EXPECT_PACK||null;
    report.assertions={
      expectedPack:!expectedPack||captured.every(p=>p.roadPack===expectedPack),
      actualPhoneDrivingView:captured.length>0&&captured.every(p=>p.mode==='driving'&&p.viewport.isMobile&&p.viewport.dpr>=2),
      requestedRenderQuality:!expectedPack||captured.every(p=>p.profile==='low'?p.rendering.antialias===false&&Math.abs(p.rendering.pixelRatio-.85)<.001:p.rendering.antialias===true&&Math.abs(p.rendering.pixelRatio-(p.profile==='balanced'?1.35:1.65))<.001),
      sameFrozenPoses:report.poseContract.poses.length>=1,waterStreetOneWayFound:!targets.includes('water-showplace-cycle')||Boolean(contract['water-showplace-cycle']),
      waterCyclewayTagObserved:!targets.includes('water-showplace-cycle')||Boolean(contract['water-showplace-cycle']?.cyclewayTagFound),
      hunterBridgeSource:!targets.includes('bridge')||Boolean(contract.bridge?.bridgeDeckSource),allRequestedContextsFound:present.length===targets.length,
      allProfilesHaveRuns:profiles.length>0&&report.runs.length===profiles.length*(afterUrl===beforeUrl?1:2),
      everyPoseOnRoad:report.runs.every(run=>run.poses.filter(p=>p.placement).every(p=>p.placement.placed.surface.onRoad)),
      gameplayHudVisible:report.runs.every(run=>run.poses.filter(p=>p.placement).every(p=>{const h=p.placement.hud,v=p.placement.viewport;return h.present&&h.visibility!=='hidden'&&h.display!=='none'&&h.opacity>.01&&h.box&&h.box.width>0&&h.box.height>0&&h.box.x>=0&&h.box.y>=0&&h.box.x+h.box.width<=v.width+1&&h.box.y+h.box.height<=v.height+1})),
      truckActorVisible:report.runs.every(run=>run.poses.filter(p=>p.placement).every(p=>p.placement.truckActorVisible)),
      touchControlsMovedAndTurnedTruck:touchRuns.length>0&&touchRuns.every(run=>run.touchDriveTurn?.available===true&&run.touchDriveTurn.distance>.15&&Math.abs(run.touchDriveTurn.headingDelta)>.0005),
      noPageErrors:report.runs.every(run=>run.errors.page.length===0),noFirstPartyFailures:failures.length===0,
      noTileFailures:report.runs.every(run=>run.errors.tileFailures.length===0),failures};
    report.assertions.failedChecks=Object.entries(report.assertions).filter(([key,value])=>key!=='failures'&&key!=='failedChecks'&&value===false).map(([key])=>key);
    persistReport(report);
    console.log(JSON.stringify(report,null,2));
    if(failures.length||report.assertions.failedChecks.length)process.exitCode=1;
  } catch(error) {report.fatalError=String(error.stack||error);persistReport(report);throw error;}
  finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
