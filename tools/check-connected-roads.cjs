'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const rootUrl = (process.argv[2] || 'http://127.0.0.1:4186').replace(/\/$/, '');
const output = path.resolve(process.env.ROAD_QA_OUTPUT || 'artifacts/road-rebuild/final');
const views = require('../tests/fixtures/connected-road-views.json').views;
const profiles = [
  { name: 'low', width: 430, height: 900, query: '&quality=low' },
  { name: 'balanced', width: 430, height: 900, query: '' },
  { name: 'high', width: 1500, height: 950, query: '&quality=high' },
];
const phase = process.env.ROAD_QA_PHASE || 'all';
const reportPath = path.join(output, phase === 'all' ? 'report.json' : `report-${phase}.json`);
let reportForError=null,reportPathForError=null;
const profileRuns = phase === 'drive' || phase === 'junctions' || phase === 'inspect-road' || phase === 'control' || phase === 'recovery' ? []
  : phase === 'balanced' ? profiles.filter(profile => profile.name === 'balanced')
  : phase === 'high' ? profiles.filter(profile => profile.name === 'high') : profiles;
const appOrigin = new URL(rootUrl).origin;
const hudCss = `#loading-screen,#hud,#gameplay-hud,#top-hud,#bottom-hud,.hud-panel,.hud-button,
  #mode-hint,#location-label,#fps-counter,#minimap,#compass,#menu-toggle,#graphics-quality-open,
  #station1-door-control,#station2-door-control,#station3-door-control{visibility:hidden!important}`;

function instrumentation() {
  return `\n;(()=>{if(!new URLSearchParams(location.search).has('roadQa'))return;
    const originalAxes=currentGameplayAxes;
    currentGameplayAxes=function(delta){return globalThis.__ROAD_QA_AXES__?{...globalThis.__ROAD_QA_AXES__}:originalAxes(delta)};
    const originalUpdateFireTruck=updateFireTruck;
    updateFireTruck=function(delta){if(!globalThis.__ROAD_QA_SUSPEND__)originalUpdateFireTruck(delta)};
    const originalUpdateFlyControls=updateFlyControls;
    updateFlyControls=function(delta){if(!globalThis.__ROAD_QA_CAMERA_LOCK__)originalUpdateFlyControls(delta)};
    const originalRender=renderer.render.bind(renderer);
    renderer.render=function(...args){if(!globalThis.__ROAD_QA_NO_RENDER__)originalRender(...args)};
    globalThis.__ROAD_QA__={get state(){return state},get scene(){return scene},get roadGroup(){return roadGroup},get terrainGroup(){return terrainGroup},get streetscapeGroup(){return streetscapeGroup},
      get renderer(){return renderer},get camera(){return camera},get truckState(){return truckState},get TRUCK_TUNING(){return TRUCK_TUNING},
      get roadTileLayer(){return roadTileLayer},get roadTileManifest(){return roadTileManifest},get roadMarkingSegments(){return state.roadMarkingSegments||[]},
      get roadPackId(){return roadTileManifest?.buildId||ROAD_PACK_ID},get gameplayReady(){return gameplayReady},get sceneGroups(){return scene.children},
      gameplaySurfaceAt,gameplaySurfaceBaseAt,terrainHeightAtWorld, sampleTruckWheelContacts, stepTruck:originalUpdateFireTruck, stopFlyMotion, project,
      raycastAt(x,z){scene.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(x,200,z),new THREE.Vector3(0,-1,0));return ray.intersectObjects([terrainGroup,roadGroup,streetscapeGroup],true).slice(0,12).map(hit=>({x:hit.point.x,y:hit.point.y,z:hit.point.z,distance:hit.distance,name:hit.object.name,type:hit.object.userData?.type||null,id:hit.object.userData?.sourceId||hit.object.userData?.roadId||hit.object.userData?.roadTileId||null,kind:hit.object.userData?.kind||null,layer:hit.object.userData?.layer||null,material:hit.object.material?.name||hit.object.userData?.material||null,color:hit.object.material?.color?.getHexString?.()||null,faceIndex:hit.faceIndex}));},
      raycastPixel(u,v){scene.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(u*2-1,1-v*2),camera);return ray.intersectObjects([terrainGroup,roadGroup,streetscapeGroup],true).slice(0,12).map(hit=>({point:hit.point.toArray(),distance:hit.distance,name:hit.object.name,type:hit.object.userData?.type||null,id:hit.object.userData?.sourceId||hit.object.userData?.roadId||hit.object.userData?.roadTileId||null,kind:hit.object.userData?.kind||null,layer:hit.object.userData?.layer||null,material:hit.object.material?.name||hit.object.userData?.material||null,color:hit.object.material?.color?.getHexString?.()||null,faceIndex:hit.faceIndex}));},
      setAxes(value){globalThis.__ROAD_QA_AXES__=value},suspend(value){globalThis.__ROAD_QA_SUSPEND__=Boolean(value)},cameraLock(value){globalThis.__ROAD_QA_CAMERA_LOCK__=Boolean(value)},
      suspendRender(value){globalThis.__ROAD_QA_NO_RENDER__=Boolean(value)}};
  })();\n`;
}

async function bootPage(browser, profile) {
  const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1 });
  const errors = { page: [], console: [], requests: [], responses: [] };
  page.on('pageerror', error => errors.page.push(String(error.stack || error).slice(0, 1200)));
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text().slice(0, 900)); });
  page.on('requestfailed', request => {
    if (new URL(request.url()).origin === appOrigin) errors.requests.push({ url: request.url(), error: request.failure()?.errorText || 'request failed' });
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.responses.push({ url: response.url(), origin: new URL(response.url()).origin, status: response.status(), firstParty: new URL(response.url()).origin === appOrigin });
  });
  await page.route(/\/city-explorer\/app\.js(?:\?|$)/, async route => {
    const response = await route.fetch();
    let source = await response.text();
    source = source.replace('aSourceVertex: a.sourceVertex,', 'aSourceVertex: a.sourceVertex, aNodeId: a.nodeId,')
      .replace('bSourceVertex: b.sourceVertex,', 'bSourceVertex: b.sourceVertex, bNodeId: b.nodeId,');
    source += instrumentation();
    await route.fulfill({ response, body: source, headers: { ...response.headers(), 'content-length': String(Buffer.byteLength(source)) } });
  });
  const url = `${rootUrl}/city-explorer/?qa=1&roadQa=1${profile.query}`;
  const started = Date.now();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => document.documentElement.dataset.gameplayReady === 'true'
    && document.querySelector('#loading-screen')?.classList.contains('is-hidden'), null, { timeout: 240000 });
  try {
    await page.waitForFunction(() => { const el = document.querySelector('#loading-screen'); if (!el) return true; const s = getComputedStyle(el); return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) <= 0.01; }, null, { timeout: 10000 });
  } catch (error) {
    const overlay = await page.evaluate(() => { const el=document.querySelector('#loading-screen'),s=el&&getComputedStyle(el); return { className:el?.className,text:el?.innerText,opacity:s?.opacity,visibility:s?.visibility,display:s?.display,bootPhase:document.documentElement.dataset.explorerBootPhase,gameplayReady:document.documentElement.dataset.gameplayReady }; });
    throw new Error(`Loading overlay did not become visually hidden: ${JSON.stringify(overlay)}; ${error.message}`);
  }
  await page.waitForFunction(() => Boolean(globalThis.__ROAD_QA__?.roadTileLayer && globalThis.__ROAD_QA__.roadMarkingSegments.length), null, { timeout: 60000 });
  const hudStyle = await page.addStyleTag({ content: hudCss });
  await hudStyle.evaluate(style => { style.id = 'road-qa-hidden-hud'; });
  return { page, errors, responseStatus: response?.status() || null, readyMs: Date.now() - started };
}

async function setView(page, view) {
  return page.evaluate(async pose => {
    const q = globalThis.__ROAD_QA__;
    q.stopFlyMotion();
    q.state.mode = 'fly';
    q.cameraLock(true);
    const camera = q.camera;
    const position = pose.kind === 'overhead' ? pose.camera.position : [pose.camera.x, pose.camera.y, pose.camera.z];
    let surfaceReference = null;
    if (pose.kind === 'truck-eye') {
      surfaceReference = q.gameplaySurfaceAt(position[0], position[2], pose.camera.y - 2.6);
      position[1] = surfaceReference.height + 2.6;
    }
    q.state.pitch = pose.camera.pitch; q.state.yaw = pose.camera.yaw;
    q.state.lastFlyPitch = pose.camera.pitch; q.state.lastFlyYaw = pose.camera.yaw;
    q.state.lastFlyPosition.set(...position); camera.position.set(...position);
    camera.up.set(0, 1, 0); camera.rotation.order = 'YXZ';
    camera.rotation.set(pose.camera.pitch, pose.camera.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    camera.updateMatrixWorld(true);
    const actual = { position: camera.position.toArray(), yaw: camera.rotation.y, pitch: camera.rotation.x, roll: camera.rotation.z, quaternion: camera.quaternion.toArray(), stateYaw: q.state.yaw, statePitch: q.state.pitch };
    const yawError=Math.atan2(Math.sin(actual.yaw-pose.camera.yaw),Math.cos(actual.yaw-pose.camera.yaw));
    if (Math.hypot(...actual.position.map((v, i) => v - position[i])) > 0.01 || Math.abs(yawError) > 0.001 || Math.abs(actual.pitch - pose.camera.pitch) > 0.001 || Math.abs(actual.roll) > 0.001) throw new Error(`Camera pose drift at ${pose.name}: ${JSON.stringify(actual)}`);
    await q.roadTileLayer.update(camera.position.x, camera.position.z, { protectX: q.truckState.x, protectZ: q.truckState.z, protectRadius: 100 });
    if (!q.roadTileLayer.readyAt(camera.position.x, camera.position.z, 12)) throw new Error(`Road tile coverage is not ready at ${pose.name}`);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { position: camera.position.toArray(), yaw: camera.rotation.y, pitch: camera.rotation.x, roll: camera.rotation.z, quaternion: camera.quaternion.toArray(),
      surfaceReference: surfaceReference ? { height: surfaceReference.height, onRoad: surfaceReference.onRoad, eyeOffset: position[1] - surfaceReference.height } : null,
      roadTiles: q.roadTileLayer.stats() };
  }, view);
}

async function viewMetrics(page) {
  return page.evaluate(() => {
    const q = globalThis.__ROAD_QA__;
    const roadGeometries = [];
    q.roadGroup.traverse(object => { if (object.isMesh && object.geometry) roadGeometries.push(object.geometry); });
    let roadGpuBytes = 0, roadTriangles = 0, roadPositionBytes = 0, roadNormalBytes = 0, roadIndexBytes = 0;
    for (const geometry of roadGeometries) {
      const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), index = geometry.index;
      if (position) { roadPositionBytes += position.array.byteLength; roadGpuBytes += position.array.byteLength; }
      if (normal) { roadNormalBytes += normal.array.byteLength; roadGpuBytes += normal.array.byteLength; }
      if (index) { roadIndexBytes += index.array.byteLength; roadGpuBytes += index.array.byteLength; roadTriangles += index.count / 3; }
      else if (position) roadTriangles += position.count / 3;
    }
    const stats = q.roadTileLayer.stats();
    const manifest = q.roadTileManifest;
    const scene = q.renderer.info.render;
    const overlay = document.querySelector('#loading-screen'); const overlayStyle = overlay ? getComputedStyle(overlay) : null;
    return { actualCamera: { position: q.camera.position.toArray(), yaw: q.camera.rotation.y, pitch: q.camera.rotation.x, roll: q.camera.rotation.z, quaternion: q.camera.quaternion.toArray(), stateYaw: q.state.yaw, statePitch: q.state.pitch }, loadingOverlay: overlayStyle ? { opacity: Number(overlayStyle.opacity), visibility: overlayStyle.visibility, display: overlayStyle.display, hiddenClass: overlay.classList.contains('is-hidden') } : null,
      buildId: q.roadPackId, manifestBuildId: manifest?.buildId || null, sourceGeneratedAt: manifest?.sourceGeneratedAt || null,
      sourceHashCount: manifest?.sources ? Object.keys(manifest.sources).length : 0,
      manifestTiles: manifest?.tiles?.length || 0, residentRoadTiles: stats.residentCount, residentRawBytes: stats.residentBytes,
      roadGpuBytes, roadPositionBytes, roadNormalBytes, roadIndexBytes, roadTriangles,
      sceneDrawCalls: scene.calls, sceneTriangles: scene.triangles, sceneGeometries: q.renderer.info.memory.geometries,
      sceneTextures: q.renderer.info.memory.textures, quality: document.querySelector('#graphics-quality-select')?.value || null };
  });
}

async function boundedFrameMetrics(page, durationMs = 2000) {
  return page.evaluate(async duration => {
    const deltas=[];let first=null,last=null;
    await new Promise(resolve=>requestAnimationFrame(function frame(now){
      if(first===null)first=now;
      if(last!==null)deltas.push(now-last);last=now;
      if(now-first<duration)requestAnimationFrame(frame);else resolve();
    }));
    const sorted=deltas.slice().sort((a,b)=>a-b),quantile=q=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))]:null;
    return {method:'bounded requestAnimationFrame timing; software WebGL desktop browser only, not device FPS',durationMs:Math.round(last-first),frames:deltas.length,meanFrameMs:deltas.length?deltas.reduce((sum,value)=>sum+value,0)/deltas.length:null,medianFrameMs:quantile(0.5),p95FrameMs:quantile(0.95),maxFrameMs:sorted.at(-1)||null,meanFps:deltas.length?1000*deltas.length/(last-first):null};
  }, durationMs);
}

async function postbootTile404Recovery(browser, profile, onProgress=()=>{}) {
  const {page,errors,responseStatus,readyMs}=await bootPage(browser,profile);
  try {
    await setView(page,views[0]);
    const target=await page.evaluate(()=>{
      const q=globalThis.__ROAD_QA__,tiles=q.roadTileManifest.tiles,segments=q.roadMarkingSegments;
      const candidates=[];
      for(const tile of tiles){const x=(tile.bounds.minX+tile.bounds.maxX)/2,z=(tile.bounds.minZ+tile.bounds.maxZ)/2;if(q.roadTileLayer.readyAt(x,z,12))continue;const segment=segments.find(item=>item?.a&&item?.b&&((item.a.x+item.b.x)/2)>=tile.bounds.minX&&((item.a.x+item.b.x)/2)<=tile.bounds.maxX&&((item.a.y+item.b.y)/2)>=tile.bounds.minZ&&((item.a.y+item.b.y)/2)<=tile.bounds.maxZ);if(segment)candidates.push({tile,x,z,roadX:(segment.a.x+segment.b.x)/2,roadZ:(segment.a.y+segment.b.y)/2,name:segment.name||segment.tags?.name||''});}
      candidates.sort((a,b)=>Math.hypot(b.x-q.truckState.x,b.z-q.truckState.z)-Math.hypot(a.x-q.truckState.x,a.z-q.truckState.z));
      const selected=candidates[0];if(!selected)return null;
      const surface=q.gameplaySurfaceAt(selected.roadX,selected.roadZ);
      Object.assign(q.truckState,{x:selected.roadX,z:selected.roadZ,y:surface.height+0.035,heading:Math.atan2(-(selected.tile.bounds.maxX-selected.tile.bounds.minX),0),speed:0,steering:0,acceleration:0,lastRoadWheelCount:4,pitch:0,roll:0});
      q.state.mode='driving';q.camera.position.set(selected.x,q.camera.position.y,selected.z);q.state.lastFlyPosition.copy(q.camera.position);q.cameraLock(true);q.suspend(true);q.suspendRender(true);
      return {id:selected.tile.id,url:selected.tile.url,center:{x:selected.x,z:selected.z},resumePose:{x:q.truckState.x,z:q.truckState.z,y:q.truckState.y,heading:q.truckState.heading,mode:q.state.mode},name:selected.name,residentBefore:q.roadTileLayer.stats().residentCount,readyBefore:q.roadTileLayer.readyAt(selected.x,selected.z,12)};
    });
    if(!target)throw new Error('Could not find a nonresident manifest tile containing a source road segment');
    let injected404Count=0;
    const tileSuffix=new URL(target.url,new URL('./data/road-pack/manifest.json',page.url())).pathname;
    target.requestPath=tileSuffix;
    await page.route('**/road-pack/**',async route=>{
      if(new URL(route.request().url()).pathname===tileSuffix){injected404Count++;await route.fulfill({status:404,contentType:'text/plain',body:'QA injected postboot road tile 404'});}
      else await route.continue();
    });
let recoveryRequestedUrl=null,recoveryObserverError=null,readinessError=null,fallbackDetected=false;
    const mainFrameNavigations=[];
    let resolveRoadPackNavigation;
    const roadPackNavigation=new Promise(resolve=>{resolveRoadPackNavigation=resolve;});
    page.on('framenavigated',frame=>{if(frame===page.mainFrame()){const url=frame.url();mainFrameNavigations.push({url,at:new Date().toISOString()});if(new URL(url).searchParams.get('roadPack')==='0')resolveRoadPackNavigation(url);}});
    const attemptStats=[];
    for(let attempt=1;attempt<=3;attempt++){
      try{const stats=await page.evaluate(async point=>{const q=globalThis.__ROAD_QA__;return q.roadTileLayer.update(point.x,point.z,{protectX:q.truckState.x,protectZ:q.truckState.z,protectRadius:100});},target.center);attemptStats.push({attempt,failures:stats.failures,pending:stats.pendingCount,resident:stats.residentCount,injected404Count});}
      catch(error){attemptStats.push({attempt,error:String(error.message||error),injected404Count});}
      if(attempt<3)await page.waitForTimeout(100);
    }
    const matching404Responses=errors.responses.filter(response=>response.status===404&&new URL(response.url).pathname===tileSuffix);
    const partialRecovery=()=>({responseStatus,readyMs,target,attemptStats,injected404Count,matching404Responses,preWaitUrl:page.url(),mainFrameNavigations:[...mainFrameNavigations],errors});
    onProgress(partialRecovery());
    const navigationResult=await Promise.race([roadPackNavigation.then(url=>({url})),new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),120000))]);
    if(navigationResult.url){fallbackDetected=true;recoveryRequestedUrl=navigationResult.url;}
    else recoveryObserverError='Timed out waiting for a main-frame URL with roadPack=0';
    if(fallbackDetected){
      try{await page.waitForFunction(()=>new URLSearchParams(location.search).get('roadPack')==='0'&&document.documentElement.dataset.roadRecovery==='source-restored'&&document.documentElement.dataset.gameplayReady==='true',null,{timeout:240000});}
      catch(error){readinessError=String(error.message||error);}
      try{await page.waitForFunction(()=>{const el=document.querySelector('#loading-screen');if(!el)return true;const s=getComputedStyle(el);return s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<=0.01;},null,{timeout:15000});}
      catch(error){readinessError=readinessError||String(error.message||error);}
    }
    let restored=null;
    try{restored=await page.evaluate(()=>{const q=globalThis.__ROAD_QA__,params=new URLSearchParams(location.search),surface=q?.gameplaySurfaceAt(q.truckState.x,q.truckState.z,q.truckState.y);return {url:location.href,roadPack:params.get('roadPack'),roadResumeRemaining:params.has('roadResume'),roadRecovery:document.documentElement.dataset.roadRecovery,mode:q?.state.mode,truck:q?{x:q.truckState.x,z:q.truckState.z,y:q.truckState.y,heading:q.truckState.heading}:null,resumedSurface:surface?{onRoad:surface.onRoad,height:surface.height,name:surface.name,heightSource:surface.heightSource}:null,roadTileLayerPresent:Boolean(q?.roadTileLayer),gameplayReady:q?.gameplayReady,overlay:{className:document.querySelector('#loading-screen')?.className,opacity:getComputedStyle(document.querySelector('#loading-screen')).opacity,display:getComputedStyle(document.querySelector('#loading-screen')).display,visibility:getComputedStyle(document.querySelector('#loading-screen')).visibility}};});}
    catch(error){readinessError=readinessError||String(error.message||error);restored={url:page.url(),evaluationError:String(error.message||error)};}
    return {...partialRecovery(),firstPartyErrors:errors.responses.filter(response=>response.firstParty&&response.status>=400),recoveryRequestedUrl,fallbackDetected,recoveryObserverError,readinessError,restored,expectedPose:target.resumePose};
  } finally {await page.close();}
}

async function sourceRoutes(page) {
  return page.evaluate(() => {
    const byLine = new Map();
    for (const s of globalThis.__ROAD_QA__.roadMarkingSegments) {
      if (!s?.a || !s?.b || !Number.isFinite(s.a.x) || !Number.isFinite(s.a.y)) continue;
      const id = String(s.lineId || '');
      if (!byLine.has(id)) byLine.set(id, []);
      byLine.get(id).push({ id, name: s.name || s.tags?.name || '', a: [s.a.x, s.a.y], b: [s.b.x, s.b.y], aNodeId: s.aNodeId || null, bNodeId: s.bNodeId || null, chainStart: s.chainStart || 0, width: s.width || 0, bridge: Boolean(s.bridge), tags: s.tags || {} });
    }
    const priorities = [/George Street/i, /Lansdowne Street/i, /Stewart Street/i, /Ashburnham Drive/i, /Sherbrooke Street/i, /Parkhill Road/i, /Hunter Street West/i];
    const result = [];
    for (const [lineId, segments] of byLine) {
      segments.sort((a, b) => a.chainStart - b.chainStart);
      const chain = [segments[0].a];
      for (const s of segments) chain.push(s.b);
      const compact = chain.filter((p, i) => !i || Math.hypot(p[0] - chain[i - 1][0], p[1] - chain[i - 1][1]) > 0.05);
      let length = 0;
      for (let i = 1; i < compact.length; i++) length += Math.hypot(compact[i][0] - compact[i - 1][0], compact[i][1] - compact[i - 1][1]);
      const name = segments.find(s => s.name)?.name || '';
      const rank = priorities.findIndex(re => re.test(name));
      if (rank >= 0 && length >= 40) result.push({ lineId, name, rank, length, points: compact, segments: segments.map(s => ({ a: s.a, b: s.b, aNodeId: s.aNodeId, bNodeId: s.bNodeId, chainStart: s.chainStart, width: s.width, bridge: s.bridge })) });
    }
    const lineChains = [...byLine].map(([lineId, segments]) => {
      segments.sort((a, b) => a.chainStart - b.chainStart);
      const points = [segments[0].a];
      for (const segment of segments) points.push(segment.b);
      return { lineId, name: segments.find(s => s.name)?.name || '', points, segments };
    });
    const nodeLines = new Map();
    for (const chain of lineChains) for (const segment of chain.segments) {
      for (const [nodeId, point] of [[segment.aNodeId, segment.a], [segment.bNodeId, segment.b]]) {
        if (!nodeId) continue;
        const key = String(nodeId);
        if (!nodeLines.has(key)) nodeLines.set(key, new Map());
        nodeLines.get(key).set(chain.lineId, { lineId: chain.lineId, name: chain.name, point });
      }
    }
    const arm = (chain, point, direction) => {
      let index = 0, distance = Infinity;
      chain.points.forEach((candidate, i) => { const d = Math.hypot(candidate[0] - point[0], candidate[1] - point[1]); if (d < distance) { distance = d; index = i; } });
      const indices = [];
      if (direction < 0) for (let i = index; i >= 0; i--) indices.push(i);
      else for (let i = index; i < chain.points.length; i++) indices.push(i);
      const points = indices.map(i => chain.points[i]);
      let length = 0;
      const limitedPoints=points.length?[points[0]]:[];
      for(let i=1;i<points.length&&length<110;i++){
        const a=points[i-1],b=points[i],segmentLength=Math.hypot(b[0]-a[0],b[1]-a[1]),remaining=110-length;
        if(segmentLength<=remaining){limitedPoints.push(b);length+=segmentLength;}
        else{const t=remaining/segmentLength;limitedPoints.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);length=110;}
      }
      if (direction < 0) limitedPoints.reverse();
      return { lineId: chain.lineId, name: chain.name, points:limitedPoints, length, direction: direction < 0 ? 'in' : 'out' };
    };
    for (const [nodeId, lines] of nodeLines) {
      const entries = [...lines.values()];
      const node = entries[0].point;
      const chains = entries.map(entry => lineChains.find(chain => chain.lineId === entry.lineId));
      const arms = chains.flatMap((chain, i) => [-1, 1].map(direction => arm(chain, node, direction)));
      const outwardBearings=arms.map(candidate=>{const origin=candidate.direction==='in'?candidate.points.at(-1):candidate.points[0],adjacent=candidate.direction==='in'?candidate.points.at(-2):candidate.points[1];if(!origin||!adjacent)return null;const dx=adjacent[0]-node[0],dz=adjacent[1]-node[1];return Math.hypot(dx,dz)>0.05?Math.atan2(dx,dz):null;}).filter(Number.isFinite);
      const uniqueBearings=[];
      for(const bearing of outwardBearings)if(!uniqueBearings.some(existing=>Math.abs(Math.atan2(Math.sin(bearing-existing),Math.cos(bearing-existing)))<=Math.PI/18))uniqueBearings.push(bearing);
      const physicalDegree=uniqueBearings.length;
      if(physicalDegree<3)continue;
      let best = null;
      for (let i = 0; i < arms.length; i++) for (let j = 0; j < arms.length; j++) {
        if (i === j || arms[i].direction !== 'in' || arms[j].direction !== 'out' || arms[i].lineId === arms[j].lineId || arms[i].length < 24 || arms[j].length < 24) continue;
        const incoming = arms[i].points.length > 1 ? [arms[i].points.at(-1)[0] - arms[i].points.at(-2)[0], arms[i].points.at(-1)[1] - arms[i].points.at(-2)[1]] : [0, 0];
        const outgoing = arms[j].points.length > 1 ? [arms[j].points[1][0] - arms[j].points[0][0], arms[j].points[1][1] - arms[j].points[0][1]] : [0, 0];
        const angle = Math.acos(Math.max(-1, Math.min(1, (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / Math.max(1e-6, Math.hypot(...incoming) * Math.hypot(...outgoing)))));
        if (angle < 0.55 || angle > 2.6) continue;
        const score = Math.abs(angle - Math.PI / 2) + (arms[i].length + arms[j].length < 100 ? 0.4 : 0);
        if (!best || score < best.score) best = { inbound: arms[i], outbound: arms[j], angle, score };
      }
      if (best) {
        const rank = priorities.findIndex(re => re.test(best.inbound.name) || re.test(best.outbound.name));
        if (rank >= 0) result.unshift({ lineId: `${best.inbound.lineId}->${best.outbound.lineId}`, name: `${best.inbound.name} to ${best.outbound.name}`, rank, kind: 'source-node-turn', junctionNode: nodeId, junctionPoint: node, junctionDegree: physicalDegree, junctionWayCount: lines.size, turnDegrees: best.angle * 180 / Math.PI, length: best.inbound.length + best.outbound.length, points: [...best.inbound.points, ...best.outbound.points.slice(1)] });
      }
    }
    const compare = (a, b) => a.rank - b.rank || Math.min(b.length, 400) - Math.min(a.length, 400);
    const turns = result.filter(route => route.kind === 'source-node-turn').sort(compare).slice(0, 12);
    const roads = result.filter(route => route.kind !== 'source-node-turn').sort((a,b) => Number(Boolean(b.segments?.some(s=>s.bridge))) - Number(Boolean(a.segments?.some(s=>s.bridge))) || compare(a,b)).slice(0, 30);
    const tileManifest=globalThis.__ROAD_QA__.roadTileManifest.tiles;
    const tileAt=point=>tileManifest.find(tile=>point[0]>=tile.bounds.minX&&point[0]<=tile.bounds.maxX&&point[1]>=tile.bounds.minZ&&point[1]<=tile.bounds.maxZ)?.id||null;
    const withBoundaries=route=>{
      let distance=0,boundaryTransition=null;
      for(let i=1;i<route.points.length;i++){
        const a=route.points[i-1],b=route.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        const count=Math.max(1,Math.ceil(length/8));let previous=tileAt(a);
        for(let j=1;j<=count&&!boundaryTransition;j++){const t=j/count,point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],owner=tileAt(point);if(previous&&owner&&previous!==owner)boundaryTransition={fromTileId:previous,toTileId:owner,distance:distance+length*(t-0.5/count),point};previous=owner;}
        distance+=length;
      }
      let bridgeRange=null,walked=0;
      if(route.segments?.length){for(const segment of route.segments){const length=Math.hypot(segment.b[0]-segment.a[0],segment.b[1]-segment.a[1]);if(segment.bridge){bridgeRange=bridgeRange||{start:walked,end:walked+length};bridgeRange.end=walked+length;}walked+=length;}}
      return {...route,boundaryTransition,bridgeRange};
    };
    return [...turns, ...roads].map(withBoundaries);
  });
}

async function replayRoute(page, route) {
  return page.evaluate(async sourceRoute => {
    const q = globalThis.__ROAD_QA__;
    const raw = sourceRoute.points;
    if (raw.length < 2) return { lineId: sourceRoute.lineId, status: 'invalid', reason: 'no centerline points' };
    q.cameraLock(true); q.state.mode = 'fly';
    q.camera.position.set(raw[0][0], q.camera.position.y, raw[0][1]);
    q.state.lastFlyPosition.copy(q.camera.position);
    await q.roadTileLayer.update(raw[0][0], raw[0][1], { protectX: raw[0][0], protectZ: raw[0][1], protectRadius: 100 });
    if (!q.roadTileLayer.readyAt(raw[0][0], raw[0][1], 12)) return { lineId: sourceRoute.lineId, name: sourceRoute.name, status: 'invalid', reason: 'route start tiles not resident', roadTiles: q.roadTileLayer.stats() };
    const total = raw.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - raw[i][0], p[1] - raw[i][1]), 0);
    const routePoints = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      const a = raw[i - 1], b = raw[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(length / 2));
      for (let j = 1; j <= steps; j++) routePoints.push([a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps]);
    }
    const distanceAtPoint=point=>{
      if(!point)return null;let walked=0,best={error:Infinity,distance:null};
      for(let i=1;i<routePoints.length;i++){const a=routePoints[i-1],b=routePoints[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/Math.max(length*length,1e-6))),x=a[0]+dx*t,z=a[1]+dz*t,error=Math.hypot(point[0]-x,point[1]-z);if(error<best.error)best={error,distance:walked+length*t};walked+=length;}
      return best.error<=5?best.distance:null;
    };
    const junctionProgress=sourceRoute.junctionPoint?distanceAtPoint(sourceRoute.junctionPoint):null;
    const supportTileAt=(x,z,y)=>q.roadTileLayer.sample(x,z,y)?.id||null;
    if(sourceRoute.boundaryTransition){
      for(let i=0;i<routePoints.length;i+=10){const point=routePoints[i];await q.roadTileLayer.update(point[0],point[1],{protectX:point[0],protectZ:point[1],protectRadius:100});}
    }
    let boundaryTransition=null,boundaryWalked=0,boundaryPrior=null;
    for(let i=0;i<routePoints.length;i++){const point=routePoints[i],surface=q.gameplaySurfaceAt(point[0],point[1]),owner=supportTileAt(point[0],point[1],surface.height+0.035);if(i&&owner&&boundaryPrior&&owner!==boundaryPrior&&!boundaryTransition)boundaryTransition={fromTileId:boundaryPrior,toTileId:owner,distance:boundaryWalked,point:[...point],source:'resident-support-face'};if(i)boundaryWalked+=Math.hypot(point[0]-routePoints[i-1][0],point[1]-routePoints[i-1][1]);if(owner)boundaryPrior=owner;}
    const bridgeRange=sourceRoute.bridgeRange||null;
    const sampleAt = p => q.gameplaySurfaceAt(p[0], p[1]);
    let startIndex = 1, start = routePoints[startIndex], surface = sampleAt(start);
    while (startIndex < routePoints.length - 2 && !surface.onRoad) { start = routePoints[++startIndex]; surface = sampleAt(start); }
    if (!surface.onRoad) return { lineId: sourceRoute.lineId, name: sourceRoute.name, length: total, status: 'invalid', reason: 'route has no on-road start' };
    Object.assign(q.truckState, { x: start[0], z: start[1], y: surface.height + 0.035, heading: Math.atan2(-(routePoints[startIndex + 1][0] - start[0]), -(routePoints[startIndex + 1][1] - start[1])), speed: 0, steering: 0, acceleration: 0, lastRoadWheelCount: 4, pitch: 0, roll: 0 });

const targetDistance = Math.min(400, total - startIndex * 2);
    const targetStartProgress=startIndex*2,targetEndProgress=targetStartProgress+targetDistance;
    const junctionWithinTarget=sourceRoute.kind!=='source-node-turn'||(junctionProgress!==null&&junctionProgress>targetStartProgress&&junctionProgress<=targetEndProgress);
    const bridgeWithinTarget=sourceRoute.lineId!=='way/177049271:0'||Boolean(bridgeRange&&targetStartProgress<=bridgeRange.start+2&&targetEndProgress>=bridgeRange.end-2);
    const boundaryWithinTarget=!sourceRoute.boundaryTransition||Boolean(boundaryTransition&&targetStartProgress<boundaryTransition.distance&&targetEndProgress>=boundaryTransition.distance+3);
    const featurePreflight={targetStartProgress,targetEndProgress,junctionWithinTarget,junctionProgress,bridgeWithinTarget,bridgeRange,boundaryWithinTarget,boundaryTransition};
    if(!junctionWithinTarget||!bridgeWithinTarget||!boundaryWithinTarget)return {lineId:sourceRoute.lineId,name:sourceRoute.name,routeKind:sourceRoute.kind||'source-way',status:'invalid',reason:'mandatory junction, bridge, or actual tile-support transition lies outside the bounded replay target',candidateLength:total,boundedTargetDistance:targetDistance,featurePreflight};
    q.state.mode = 'driving'; q.suspend(true); q.suspendRender(true);
    const samples = [], steps = Math.min(9000, Math.ceil(targetDistance / 4 * 60) + 360);
    let progress = startIndex * 2, maxError = 0, minProgress = progress, offRoadFrames = 0, tileUnreadyFrames=0, tileReadyFrames=0, maxSpeed=0,maxJunctionSpeed=0,minJunctionSpeed=Infinity;
    const tileAt=(x,z,y)=>supportTileAt(x,z,y??q.gameplaySurfaceAt(x,z).height+0.035);
    let priorTileId=tileAt(start[0],start[1],q.truckState.y),lastStreamProgress=progress;const tileTransitions=[],streamingUpdates=[];
    const routeAt = distance => {
      let left = distance;
      for (let i = 1; i < routePoints.length; i++) {
        const a = routePoints[i - 1], b = routePoints[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (left <= length) return [a[0] + (b[0] - a[0]) * left / Math.max(length, 1e-6), a[1] + (b[1] - a[1]) * left / Math.max(length, 1e-6)];
        left -= length;
      }
      return routePoints.at(-1);
    };
    for (let tick = 0; tick < steps && progress < targetDistance + startIndex * 2; tick++) {
      const truck = q.truckState;
      const turnFollow=sourceRoute.kind==='source-node-turn';
      let nearest = { distance: Infinity, along: progress };
      let walked = 0;
      for (let i = 1; i < routePoints.length; i++) {
        const a = routePoints[i - 1], b = routePoints[i], dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((truck.x - a[0]) * dx + (truck.z - a[1]) * dz) / Math.max(length2, 1e-6)));
        const px = a[0] + dx * t, pz = a[1] + dz * t, distance = Math.hypot(truck.x - px, truck.z - pz);
        if (distance < nearest.distance) nearest = { distance, along: walked + Math.sqrt(length2) * t };
        walked += Math.sqrt(length2);
      }
      progress = nearest.along; maxError = Math.max(maxError, nearest.distance); minProgress = Math.min(minProgress, progress); maxSpeed=Math.max(maxSpeed,Math.abs(truck.speed));if(turnFollow&&junctionProgress!==null&&Math.abs(progress-junctionProgress)<=45){maxJunctionSpeed=Math.max(maxJunctionSpeed,Math.abs(truck.speed));minJunctionSpeed=Math.min(minJunctionSpeed,Math.abs(truck.speed));}
     const aim = routeAt(Math.min(total, progress + (turnFollow?12:Math.max(5, Math.abs(truck.speed) * 0.75))));
      const desired = Math.atan2(-(aim[0] - truck.x), -(aim[1] - truck.z));
      let delta = Math.atan2(Math.sin(desired - truck.heading), Math.cos(desired - truck.heading));
      const speedRatio = Math.min(1, Math.abs(truck.speed) / q.TRUCK_TUNING.maximumForwardSpeed);
      const maximumSteer = q.TRUCK_TUNING.steeringLowSpeed + (q.TRUCK_TUNING.steeringHighSpeed - q.TRUCK_TUNING.steeringLowSpeed) * speedRatio;
      const steer = Math.max(-1, Math.min(1, delta / Math.max(maximumSteer, 0.05)));
      const near = routeAt(Math.min(total, progress + 6)), far = routeAt(Math.min(total, progress + 28));
      const nearHeading = Math.atan2(-(near[0] - truck.x), -(near[1] - truck.z));
      const farHeading = Math.atan2(-(far[0] - near[0]), -(far[1] - near[1]));
      const bend = Math.abs(Math.atan2(Math.sin(farHeading - nearHeading), Math.cos(farHeading - nearHeading)));
      const inJunctionApproach=turnFollow&&junctionProgress!==null&&progress>=junctionProgress-85&&progress<=junctionProgress+45;
      const targetSpeed = inJunctionApproach?3:(bend>0.22?4:6.5);
      const throttle = truck.speed < targetSpeed - 0.25 ? 0.7 : truck.speed > targetSpeed + 0.45 ? -0.3 : 0;
      q.setAxes({ forward: throttle, steering: steer, strafe: 0, sprinting: false });
      q.stepTruck(1 / 60);
      if(progress-lastStreamProgress>=20){
        const streamStats=await q.roadTileLayer.update(truck.x,truck.z,{protectX:truck.x,protectZ:truck.z,protectRadius:100});
        lastStreamProgress=progress;
        streamingUpdates.push({routeProgress:progress,tileId:tileAt(truck.x,truck.z,truck.y),ready:q.roadTileLayer.readyAt(truck.x,truck.z,12),residentRoadTiles:streamStats.residentCount,pending:streamStats.pendingCount,failures:streamStats.failures});
      }
      const contact = q.sampleTruckWheelContacts(q.truckState, q.TRUCK_TUNING, q.gameplaySurfaceAt);
      const center = q.gameplaySurfaceAt(q.truckState.x, q.truckState.z, q.truckState.y);
      if (contact.roadWheelCount < 4) offRoadFrames++;
      const tileId=tileAt(truck.x,truck.z,truck.y),tileReady=q.roadTileLayer.readyAt(truck.x,truck.z,12),residentCount=q.roadTileLayer.stats().residentCount;
      if(tileReady)tileReadyFrames++;else tileUnreadyFrames++;
      if(tileId&&priorTileId&&tileId!==priorTileId)tileTransitions.push({fromTileId:priorTileId,toTileId:tileId,routeProgress:progress,tileReady,wheelContacts:contact.roadWheelCount,residentCount});
      if(tileId)priorTileId=tileId;
      if (tick % 30 === 0) samples.push({ tick, x: truck.x, z: truck.z, speed: truck.speed, onRoad: center.onRoad, wheelContacts: contact.roadWheelCount, height: center.height, pitch: truck.pitch, roll: truck.roll, routeProgress: progress, trackingError: nearest.distance,tileId,tileReady,residentRoadTiles:residentCount });
      if (nearest.distance > (sourceRoute.kind==='source-node-turn'?4:2.5)) break;
    }
    q.setAxes({ forward: 0, steering: 0, strafe: 0, sprinting: false }); q.stepTruck(0.25); q.suspend(false); q.suspendRender(false); q.state.mode = 'fly';
    const traveled = Math.max(0, progress - startIndex * 2);
    const junctionInboundCrossed=junctionProgress!==null&&startIndex*2<junctionProgress;
    const junctionOutboundCrossed=junctionProgress!==null&&progress>=junctionProgress+3;
    const junctionCrossed=junctionInboundCrossed&&junctionOutboundCrossed;
    const sourceSpineDepartureLimit=sourceRoute.kind==='source-node-turn'?4:2.5;
    const steeringAtTurnSpeed=q.TRUCK_TUNING.steeringLowSpeed+(q.TRUCK_TUNING.steeringHighSpeed-q.TRUCK_TUNING.steeringLowSpeed)*(4/q.TRUCK_TUNING.maximumForwardSpeed);
    const turnGeometry={targetSpeedMps:3,junctionBrakeWindowMetres:85,junctionLookAheadMetres:12,observedMaxSpeedMps:maxSpeed,junctionSpeedRangeMps:Number.isFinite(minJunctionSpeed)?[minJunctionSpeed,maxJunctionSpeed]:null,wheelbaseMetres:5.65,maxSteerRadiansAt4Mps:steeringAtTurnSpeed,minTurningRadiusAt4Mps:5.65/Math.tan(steeringAtTurnSpeed),trackingGateReason:sourceRoute.kind==='source-node-turn'?'The QA controller slows to 3m/s in an 85m approach with 12m lookahead. A 5.65m wheelbase and 0.483rad steering limit imply a 10.77m minimum radius and about 3.16m nominal centerline departure on a 90-degree mapped turn; the 4m gate allows the swept path while requiring all four tires on road.':'Named-road routes retain the 2.5m source-spine gate.'};
    const bridgeCrossed=Boolean(bridgeRange&&startIndex*2<=bridgeRange.start+2&&progress>=bridgeRange.end-2);
    const boundaryCrossed=Boolean(boundaryTransition&&startIndex*2<boundaryTransition.distance&&progress>=boundaryTransition.distance+3&&tileTransitions.some(t=>t.fromTileId===boundaryTransition.fromTileId&&t.toTileId===boundaryTransition.toTileId&&t.tileReady&&t.wheelContacts===4));
    const status = maxError > sourceSpineDepartureLimit || traveled < targetDistance * 0.9 || offRoadFrames > 0 || tileUnreadyFrames > 0 || (sourceRoute.kind==='source-node-turn'&&!junctionCrossed) || (sourceRoute.lineId==='way/177049271:0'&&!bridgeCrossed) || (boundaryTransition&&!boundaryCrossed) ? 'invalid' : 'valid';
    let turns = 0;
    for (let i = 1; i < routePoints.length - 1; i++) {
      const h1 = Math.atan2(routePoints[i][0] - routePoints[i - 1][0], routePoints[i][1] - routePoints[i - 1][1]);
      const h2 = Math.atan2(routePoints[i + 1][0] - routePoints[i][0], routePoints[i + 1][1] - routePoints[i][1]);
      if (Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) > 0.28) turns++;
    }
    const heightSteps = samples.slice(1).map((s, i) => Math.abs(s.height - samples[i].height));
    return { lineId: sourceRoute.lineId, name: sourceRoute.name, routeKind: sourceRoute.kind || 'source-way', junctionNode: sourceRoute.junctionNode || null, junctionDegree: sourceRoute.junctionDegree || null, junctionWayCount:sourceRoute.junctionWayCount||null, junctionProgress, featurePreflight, junctionInboundCrossed,junctionOutboundCrossed,junctionCrossed, bridgeRange, bridgeCrossed, boundaryTransition, boundaryCrossed,tileTransitions,streamingUpdates,tileReadyFrames,tileUnreadyFrames,roadTilesFinal:q.roadTileLayer.stats(),turnGeometry,sourceSpineDepartureLimit,maxSourceSpineDeparture:maxError,turnDegrees: sourceRoute.turnDegrees || null, candidateLength: total, boundedTargetDistance:targetDistance, traveled, status,
      maxTrackingError: maxError, offRoadWheelFrames: offRoadFrames, turnSamples: turns,
      maxSampleHeightStep: Math.max(0, ...heightSteps), maxPitch: Math.max(0, ...samples.map(s => Math.abs(s.pitch))), maxRoll: Math.max(0, ...samples.map(s => Math.abs(s.roll))), samples };
  }, route);
}

async function staticRouteSampling(page, routes) {
  return page.evaluate(sourceRoutes => sourceRoutes.map(route => {
    const q = globalThis.__ROAD_QA__;
    const points = route.points;
    const samples = [];
    let distance = 0, nextAt = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      while (distance + length >= nextAt) {
        const t = Math.max(0, Math.min(1, (nextAt - distance) / Math.max(length, 1e-6)));
        const x = a[0] + dx * t, z = a[1] + dz * t;
        const nx = -dz / Math.max(length, 1e-6), nz = dx / Math.max(length, 1e-6);
        const center = q.gameplaySurfaceAt(x, z);
        const left = q.gameplaySurfaceAt(x + nx * 1.2, z + nz * 1.2, center.height);
        const right = q.gameplaySurfaceAt(x - nx * 1.2, z - nz * 1.2, center.height);
        samples.push({ distance: nextAt, onRoad: center.onRoad, height: center.height, leftOnRoad: left.onRoad, rightOnRoad: right.onRoad });
        nextAt += 10;
      }
      distance += length;
    }
    const backward = [...samples].reverse();
    return { lineId: route.lineId, name: route.name, length: distance,
      forward: { samples: samples.length, onRoad: samples.filter(s => s.onRoad).length, bothEdgesOnRoad: samples.filter(s => s.leftOnRoad && s.rightOnRoad).length },
      reverse: { samples: backward.length, onRoad: backward.filter(s => s.onRoad).length, bothEdgesOnRoad: backward.filter(s => s.leftOnRoad && s.rightOnRoad).length } };
  }), routes);
}

async function qualityControlCheck(page) {
  await page.evaluate(() => document.querySelector('#road-qa-hidden-hud')?.remove());
  await page.locator('#graphics-quality-open').click();
  const values = await page.locator('#graphics-quality-select option').evaluateAll(nodes => nodes.map(node => node.value));
  const initial = await page.locator('#graphics-quality-select').inputValue();
  await page.locator('#graphics-quality-select').selectOption('high');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }),
    page.locator('#graphics-quality-apply').click(),
  ]);
  await page.waitForFunction(() => document.documentElement.dataset.gameplayReady === 'true'
    && document.querySelector('#loading-screen')?.classList.contains('is-hidden'), null, { timeout: 240000 });
  await page.waitForFunction(() => { const el=document.querySelector('#loading-screen');if(!el)return true;const s=getComputedStyle(el);return s.visibility==='hidden'||Number(s.opacity)<=0.01; }, null, { timeout: 15000 });
  return { options: values, initial, applied: await page.locator('#graphics-quality-select').inputValue(), urlQuality: new URL(page.url()).searchParams.get('quality'), savedPreference: await page.evaluate(()=>localStorage.getItem('ptbo.graphicsQuality')||null), overlayHidden: await page.locator('#loading-screen').evaluate(el=>{const s=getComputedStyle(el);return el.classList.contains('is-hidden')&&(s.visibility==='hidden'||Number(s.opacity)<=0.01);}) };
}

async function terrainFixAcceptance(page) {
  return page.evaluate(() => {
    const q=globalThis.__ROAD_QA__,thresholdMetres=0.1399;
    const points=[{name:'visible-green-band-center',x:-232.247,z:926.538},{name:'visible-green-band-40m-forward',x:-237.32,z:926.24}];
    const samples=points.map(point=>{
      const official=q.roadTileLayer?.sample(point.x,point.z,null,{contact:'official'})||null;
      const terrainY=q.terrainHeightAtWorld(point.x,point.z);
      const verticalHits=q.raycastAt(point.x,point.z);
      const topHit=verticalHits[0]||null;
      const roadMinusTerrain=official?official.height-terrainY:null;
      const visibleRoadTop=Boolean(topHit?.type==='packed-road-tile'&&topHit.layer==='road_surfaces');
      return {...point,terrainY,officialRoad:official,roadMinusTerrain,thresholdMetres,visibleRoadTop,verticalHits,passed:Boolean(official&&roadMinusTerrain>=thresholdMetres&&visibleRoadTop)};
    });
    return {view:'sherbrooke-truck-eye',profile:document.querySelector('#graphics-quality-select')?.value||new URLSearchParams(location.search).get('quality')||'balanced',camera:{position:q.camera.position.toArray(),rotation:q.camera.rotation.toArray(),quaternion:q.camera.quaternion.toArray()},points:samples,passed:samples.every(sample=>sample.passed),roadTiles:q.roadTileLayer?.stats()||null};
  });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const report = { schemaVersion: 2, phase, generatedAt: new Date().toISOString(), url: rootUrl,
    method: 'Playwright Chromium software WebGL, DPR 1; final screenshots retain live rendering; one bounded 2-second rAF timing sample at Balanced quality plus numeric gameplay route replay; not physical-device FPS.',
    sourceBaseline: require('../tests/fixtures/connected-road-views.json').sourceBaseline,
    profiles: [], routeReplays: [], qualityControl: null, firstPartyErrors: [] };
  reportForError=report;reportPathForError=reportPath;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
    if(phase==='recovery')report.recovery=await postbootTile404Recovery(browser,profiles.find(profile=>profile.name==='balanced'),partial=>{report.recovery=partial;fs.writeFileSync(reportPath,JSON.stringify(report,null,2));});
    else {
    for (const profile of profileRuns) {
      const { page, errors, responseStatus, readyMs } = await bootPage(browser, profile);
      try {
        const profileReport = { name: profile.name, viewport: { width: profile.width, height: profile.height, dpr: 1 }, responseStatus, readyMs, views: [], errors };
        report.profiles.push(profileReport);
        if (profile.name === 'balanced') profileReport.qualityDefault = await page.locator('#graphics-quality-select').inputValue();
        for (const view of views) {
          const actualPose = await setView(page, view);
          if(profile.name==='balanced'&&view.name==='sherbrooke-truck-eye')report.terrainFixAcceptance=await terrainFixAcceptance(page);
          if(profile.name==='balanced'&&view===views[0])profileReport.boundedFrameMetrics=await boundedFrameMetrics(page,2000);
          const metrics = await viewMetrics(page);
          const file = `${profile.name}-${view.name}.png`;
          await page.screenshot({ path: path.join(output, file), timeout: 90000 });
          profileReport.views.push({ name: view.name, kind: view.kind, site: { lat: view.lat, lon: view.lon }, requestedPose: view.camera, actualPose, file, metrics });
          fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        }
        if (profile.name === 'balanced') report.qualityControl = await qualityControlCheck(page);
        report.firstPartyErrors.push({ profile: profile.name, ...errors });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      } finally { await page.close(); }
    }
    if(phase!=='high'){
    const driveProfile = profiles.find(profile => profile.name === 'balanced');
    const { page, errors, responseStatus, readyMs } = await bootPage(browser, driveProfile);
    try {
      const driveView=phase==='inspect-road'?views.find(view=>view.name==='sherbrooke-truck-eye'):views[0];
      const drivePose=await setView(page, driveView);
      if(phase==='inspect-road') report.roadSurfaceInvestigation=await page.evaluate(()=>{
        const q=globalThis.__ROAD_QA__,camera=q.camera,distances=[0,10,20,30,40,50,60,80,100],ground=[];
        const dir={x:-Math.sin(camera.rotation.y)*Math.cos(camera.rotation.x),z:-Math.cos(camera.rotation.y)*Math.cos(camera.rotation.x)};
        for(const distance of distances){const x=camera.position.x+dir.x*distance,z=camera.position.z+dir.z*distance,terrain=q.terrainHeightAtWorld(x,z),official=q.roadTileLayer.sample(x,z,null,{contact:'official'}),fallback=q.roadTileLayer.sample(x,z,null,{contact:'fallback'}),surface=q.gameplaySurfaceBaseAt(x,z);ground.push({distance,x,z,terrainY:terrain,official,fallback,surface:{height:surface.height,heightSource:surface.heightSource,onRoad:surface.onRoad,name:surface.name},verticalHits:q.raycastAt(x,z)});}
        const pixelGrid=[];for(const v of [0.48,0.50,0.52,0.54,0.56])for(const u of [0.2,0.4,0.5,0.6,0.8])pixelGrid.push({u,v,hits:q.raycastPixel(u,v)});
        return {camera:{position:camera.position.toArray(),rotation:camera.rotation.toArray(),quaternion:camera.quaternion.toArray()},ground,pixelGrid,roadTiles:q.roadTileLayer.stats(),screen:{width:innerWidth,height:innerHeight}};
      });
      const candidates = await sourceRoutes(page);
      report.sourceRouteCandidates = candidates.map(({ lineId, name, rank, length }) => ({ lineId, name, rank, length }));
      const staticRoutes = [];
      for (const route of candidates) if (route.kind !== 'source-node-turn' && !staticRoutes.some(selected => selected.rank === route.rank)) staticRoutes.push(route);
      report.staticRouteSampling = await staticRouteSampling(page, staticRoutes.slice(0, 7));
      const chosenRoutes = [];
      const addUnique = route => { if(route && !chosenRoutes.some(item=>item.lineId===route.lineId))chosenRoutes.push(route); };
      addUnique(candidates.find(route=>route.kind==='source-node-turn'&&route.junctionDegree===3));
      addUnique(candidates.find(route=>route.kind==='source-node-turn'&&route.junctionDegree>=4));
      const named=[];
      const sherbrookeRoad=candidates.find(route=>route.kind!=='source-node-turn'&&route.lineId.split(':')[0]==='way/460581459');
      const sherbrookeRoadAvailable=Boolean(sherbrookeRoad);
      if(sherbrookeRoad)named.push(sherbrookeRoad);
      for(const route of candidates) if(route.kind!=='source-node-turn'&&route.lineId!=='way/177049271:0'&&!named.some(item=>item.rank===route.rank)){named.push(route);if(named.length===3)break;}
      named.forEach(addUnique);
      report.sherbrookeRoadAvailable=sherbrookeRoadAvailable;
      report.selectedSherbrookeRoad=sherbrookeRoad?{lineId:sherbrookeRoad.lineId,name:sherbrookeRoad.name}:null;
      const hunterBridgeRoute=candidates.find(route=>route.lineId==='way/177049271:0');
      addUnique(hunterBridgeRoute);
      const tileBoundaryRoute=candidates.find(route=>route.kind!=='source-node-turn'&&route.boundaryTransition);
      addUnique(tileBoundaryRoute);
      report.selectedRouteCoverage=chosenRoutes.map(route=>({lineId:route.lineId,name:route.name,kind:route.kind||'source-way',junctionDegree:route.junctionDegree||null,junctionWayCount:route.junctionWayCount||null,bridge:Boolean(route.segments?.some(segment=>segment.bridge)),bridgeRange:route.bridgeRange||null,boundaryTransition:route.boundaryTransition||null}));
      report.missingRouteCoverage={tJunction:!chosenRoutes.some(route=>route.kind==='source-node-turn'&&route.junctionDegree===3),fourWay:!chosenRoutes.some(route=>route.kind==='source-node-turn'&&route.junctionDegree>=4),namedRoadCount:named.length,sherbrookeRoad460581459:!sherbrookeRoadAvailable||chosenRoutes.some(route=>route.lineId.split(':')[0]==='way/460581459'),hunterBridgeWay177049271:!hunterBridgeRoute||!chosenRoutes.some(route=>route.lineId===hunterBridgeRoute.lineId),tileBoundary:!tileBoundaryRoute||!chosenRoutes.some(route=>route.lineId===tileBoundaryRoute.lineId)};
      const replaySet = phase === 'junctions' ? chosenRoutes.filter(route=>route.kind==='source-node-turn') : ['inspect-road','control','balanced','high','captures'].includes(phase) ? [] : chosenRoutes;
      for (const route of replaySet) {
        const result = await replayRoute(page, route);
        report.routeReplays.push(result);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      }
      report.routeRun = { responseStatus, readyMs, errors };
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    } finally { await page.close(); }
    }
    }
  } finally {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    await browser.close();
  }
  const summary = { output, phase, profiles: report.profiles.map(p => ({ name: p.name, errors: p.errors, views: p.views.length })),
    routes: report.routeReplays.map(r => ({ name: r.name, status: r.status, traveled: r.traveled, maxTrackingError: r.maxTrackingError })), selectedRouteCoverage:report.selectedRouteCoverage,missingRouteCoverage:report.missingRouteCoverage,qualityControl: report.qualityControl,recovery:report.recovery?{target:report.recovery.target,attempts:report.recovery.attemptStats,count404:report.recovery.matching404Responses?.length,restored:report.recovery.restored}:null };
  console.log(JSON.stringify(summary, null, 2));
  const failures=[];
  const expectedProfiles=phase==='balanced'?['balanced']:phase==='high'?['high']:phase==='captures'||phase==='all'?['low','balanced','high']:[];
  for(const name of expectedProfiles){const profile=report.profiles.find(item=>item.name===name);if(!profile||profile.views.length!==views.length)failures.push(`profile ${name} incomplete (${profile?.views.length||0}/${views.length} views)`);}
  if((phase==='all'||phase==='captures'||phase==='balanced')&&report.profiles.some(profile=>profile.views.some(view=>!view.metrics.loadingOverlay?.hiddenClass||profile.views.some(v=>v.metrics.loadingOverlay?.opacity>0.01||v.metrics.loadingOverlay?.visibility!=='hidden'))))failures.push('one or more screenshots captured before the loading overlay was visually hidden');
  if((phase==='all'||phase==='balanced'||phase==='captures')&&(!report.qualityControl?.overlayHidden||report.qualityControl?.applied!=='high'||report.qualityControl?.urlQuality!=='high'||report.qualityControl?.savedPreference!=='high'))failures.push('graphics quality control Apply/restart/persistence check failed');
  if((phase==='all'||phase==='balanced'||phase==='captures')&&!report.terrainFixAcceptance?.passed)failures.push('terrain-envelope check failed at one or both observed Sherbrooke green-band points');
  const routePhase=phase==='all'||phase==='drive'||phase==='junctions';
  const requiredTurns=phase==='all'||phase==='drive'||phase==='junctions';
  if(requiredTurns){for(const degree of [3,4])if(!report.routeReplays.some(route=>route.routeKind==='source-node-turn'&&route.junctionDegree===degree&&route.junctionCrossed))failures.push(`junction degree ${degree} was not replayed through`);}
  if(phase==='all'||phase==='drive'){
    if(!report.routeReplays.some(route=>route.lineId==='way/177049271:0'&&route.bridgeCrossed))failures.push('Hunter bridge way 177049271 was not traversed');
    if(!report.routeReplays.some(route=>route.boundaryTransition&&route.boundaryCrossed))failures.push('no 2D road tile ownership transition was traversed');
    const named=new Set(report.routeReplays.filter(route=>route.routeKind==='source-way'&&route.name&&!route.lineId.includes('177049271')).map(route=>route.name));if(named.size<3)failures.push(`only ${named.size} named road routes were replayed`);
  }
  if(routePhase&&report.routeReplays.some(route=>route.status!=='valid'))failures.push(`invalid route replays: ${report.routeReplays.filter(route=>route.status!=='valid').map(route=>route.name+': '+(route.reason||'acceptance gate')).join('; ')}`);
  let recoveryOverlayHidden=false;
  if(phase==='recovery'){
    const recovery=report.recovery;
    const exactPosition=recovery?.restored&&recovery?.expectedPose&&Math.hypot(recovery.restored.truck.x-recovery.expectedPose.x,recovery.restored.truck.z-recovery.expectedPose.z)<0.05&&Math.abs(Math.atan2(Math.sin(recovery.restored.truck.heading-recovery.expectedPose.heading),Math.cos(recovery.restored.truck.heading-recovery.expectedPose.heading)))<0.01;
    if(recovery?.injected404Count!==3||recovery?.matching404Responses?.length!==3)failures.push('postboot tile retry did not produce exactly three first-party 404 responses');
    if(recovery?.restored?.roadRecovery!=='source-restored'||recovery?.restored?.roadPack!=='0'||recovery?.restored?.roadTileLayerPresent||!recovery?.restored?.gameplayReady||recovery?.restored?.mode!=='driving'||!exactPosition||recovery?.restored?.roadResumeRemaining||!recovery?.restored?.resumedSurface?.onRoad)failures.push('postboot tile failure did not restore the bounded driving pose onto source roads');
    const recoveryOverlay=recovery?.restored?.overlay;
    recoveryOverlayHidden=Boolean(recoveryOverlay&&(recoveryOverlay.display==='none'||recoveryOverlay.visibility==='hidden'||Number(recoveryOverlay.opacity)<=0.01));
    if(!recoveryOverlayHidden)failures.push('source-road recovery overlay did not settle hidden');
  }
  const errorRuns=[...report.profiles.map(profile=>({name:profile.name,...profile.errors})),...(report.routeRun?[{name:'route',...report.routeRun.errors}]:[]),...(report.recovery?[{name:'recovery',...report.recovery.errors}]:[])];
  for(const run of errorRuns){if(run.page?.length)failures.push(`${run.name}: page errors`);if(run.requests?.length)failures.push(`${run.name}: first-party requests failed`);const unexpected=(run.responses||[]).filter(response=>response.firstParty&&!(phase==='recovery'&&response.status===404&&new URL(response.url).pathname===report.recovery?.target?.requestPath));if(unexpected.length)failures.push(`${run.name}: unexpected first-party HTTP error responses`);}
  const screenshotsExpected=phase==='all'||phase==='captures'||phase==='balanced'||phase==='high';
  const expectedProfileNames=phase==='balanced'?['balanced']:phase==='high'?['high']:phase==='captures'||phase==='all'?['low','balanced','high']:[];
  const profilesComplete=expectedProfileNames.every(name=>report.profiles.some(profile=>profile.name===name&&profile.views.length===views.length));
  const routeCoveragePassed=phase==='junctions'?![3,4].some(degree=>!report.routeReplays.some(route=>route.routeKind==='source-node-turn'&&route.junctionDegree===degree&&route.junctionCrossed))
    :phase==='drive'||phase==='all'?report.routeReplays.length>0&&report.routeReplays.every(route=>route.status==='valid')&&report.routeReplays.some(route=>route.lineId==='way/177049271:0'&&route.bridgeCrossed)&&report.routeReplays.some(route=>route.boundaryTransition&&route.boundaryCrossed)&&(!report.sherbrookeRoadAvailable||report.routeReplays.some(route=>route.lineId.split(':')[0]==='way/460581459'))&&new Set(report.routeReplays.filter(route=>route.routeKind==='source-way'&&route.name&&!route.lineId.includes('177049271')).map(route=>route.name)).size>=3
    :null;
  const firstPartyClear=errorRuns.every(run=>!run.page?.length&&!run.requests?.length&&!(run.responses||[]).some(response=>response.firstParty&&!(phase==='recovery'&&response.status===404&&new URL(response.url).pathname===report.recovery?.target?.requestPath)));
  report.acceptance={status:failures.length?'failed':'passed',phase,failures,checks:{screenshotsExpected,profilesComplete:expectedProfileNames.length?profilesComplete:'not-required',loadingOverlay: screenshotsExpected?(report.profiles.every(profile=>profile.views.length===views.length&&profile.views.every(view=>view.metrics.loadingOverlay?.hiddenClass&&view.metrics.loadingOverlay?.visibility==='hidden'&&view.metrics.loadingOverlay?.opacity<=0.01))?'passed':'failed'):'not-required',qualityApplyRestart:(phase==='all'||phase==='captures'||phase==='balanced')?(Boolean(report.qualityControl?.overlayHidden&&report.qualityControl.applied==='high'&&report.qualityControl.urlQuality==='high'&&report.qualityControl.savedPreference==='high')?'passed':'failed'):'not-required',terrainEnvelope:(phase==='all'||phase==='captures'||phase==='balanced')?(report.terrainFixAcceptance?.passed?'passed':'failed'):'not-required',routeCoverage:routeCoveragePassed===null?'not-required':routeCoveragePassed?'passed':'failed',firstPartyErrors:firstPartyClear?'clear':'failed',recovery:phase==='recovery'?(report.recovery?.fallbackDetected&&report.recovery?.restored?.roadRecovery==='source-restored'&&recoveryOverlayHidden&&report.recovery?.matching404Responses?.length===3?'passed':'failed'):'not-required'}};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  if(failures.length)throw new Error(`QA acceptance failed: ${failures.join(' | ')}`);
})().catch(error => {
  if(reportForError&&reportPathForError&&!reportForError.acceptance){reportForError.acceptance={status:'failed',phase,failures:[String(error.stack||error)],checks:{runCompleted:false}};try{fs.writeFileSync(reportPathForError,JSON.stringify(reportForError,null,2));}catch{}}
  console.error(error.stack || error); process.exitCode = 1;
});
