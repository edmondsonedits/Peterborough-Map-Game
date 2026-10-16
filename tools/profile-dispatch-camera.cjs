'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const base=process.argv[2]||'http://127.0.0.1:4203';
const out=path.resolve(process.env.PTBO_CAMERA_OUTPUT||'test-artifacts/camera-profile/current');
fs.mkdirSync(out,{recursive:true});
const baseline=process.env.PTBO_CAMERA_BASELINE==='1';
const baselineFiles=baseline?Object.fromEntries(['satellite-map-1.5.6.js','smooth-driving-camera-1.4.19.js'].map(name=>[name,execFileSync('git',['-c',`safe.directory=${process.cwd().replace(/\\/g,'/')}`,'show',`0b2c8dc:response-simulator/${name}`],{encoding:'utf8'})])):null;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 try{
 const reports=[];
 for(const mobile of [false,true]){
  const name=mobile?'mobile':'desktop',context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  await context.route('https://firestore.googleapis.com/**',r=>r.fulfill({status:403,body:'{}'}));
  if(baseline)await context.route(/\/response-simulator\/(satellite-map-1\.5\.6|smooth-driving-camera-1\.4\.19)\.js(?:\?|$)/,r=>r.fulfill({contentType:'application/javascript',body:baselineFiles[new URL(r.request().url()).pathname.split('/').pop()]}));
  await context.addInitScript(()=>localStorage.setItem('ptboResponseVisualTutorialSeenV1','1'));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+`/response-simulator/${mobile?'mobile':'play'}/?city=peterborough`);
  await page.locator('#service-choice [data-service="fire"]').click({timeout:45000});
  const frame=page.frames().find(f=>f!==page.mainFrame());
  await frame.waitForFunction(()=>window.PTBO_SATELLITE_MAP?.state.installed&&window.PTBO_DRIVING_CAMERA&&(!parent.document.getElementById('steering')||window.PTBO_STABLE_MOBILE_CAMERA?.state.installed));
  await page.waitForTimeout(800);
  const data=await frame.evaluate(async mobile=>{
   const samples=[],longTasks=[],events=[];let observer;
   try{observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));observer.observe({type:'longtask',buffered:false});}catch(_){}
   const start=performance.now(),original=simulationStep,conversion=111195*60*3.6;
   PTBO_ROAD_COLLISION.state.enabled=false;window.PTBO_DESKTOP_DRIVETRAIN?.setGear?.(6);currentHeading=90;
   const speedAt=t=>t<3000?(mobile?145:195):t<5000?(mobile?160:210):t<6500?0:(mobile?160:210);
   simulationStep=function(){const speed=speedAt(performance.now()-start);velocity=speed/conversion;original();velocity=speed/conversion;};
   const onZoom=()=>events.push({t:performance.now()-start,type:'zoomend',zoom:mapInstance.getZoom()});mapInstance.on('zoomend',onZoom);
   let last=start;
   await new Promise(resolve=>{const tick=now=>{const center=mapInstance.getCenter(),matrix=new DOMMatrixReadOnly(document.getElementById('ptbo-camera-world').style.transform),icon=vehicleMarker._icon.getBoundingClientRect(),artwork=vehicleMarker._icon.querySelector('.truck-rotation-wrapper').getBoundingClientRect(),rect=mapInstance.getContainer().getBoundingClientRect(),anchor=mapInstance.latLngToContainerPoint(vehicleMarker.getLatLng());samples.push({t:now-start,dt:now-last,speed:Math.abs(velocity)*conversion,zoom:mapInstance.getZoom(),lat:simLat,lng:simLng,centerLat:center.lat,centerLng:center.lng,error:mapInstance.distance(center,[simLat,simLng]),pending:PTBO_SATELLITE_MAP.state.pendingZoom?.zoom??null,scale:Math.hypot(matrix.a,matrix.b),anchorError:Math.hypot(icon.left+icon.width/2-rect.left-anchor.x,icon.top+icon.height/2-rect.top-anchor.y),iconWidth:artwork.width});last=now;if(now-start<8500)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
   simulationStep=original;releaseDrivingInput();observer?.disconnect();mapInstance.off('zoomend',onZoom);
   return{mobile,samples,longTasks,events,mode:PTBO_SATELLITE_MAP.state.mode,tiles:performance.getEntriesByType('resource').filter(e=>/arcgisonline\.com/.test(e.name)).map(e=>({duration:e.duration,name:e.name})),versions:{build:PTBO_BUILD.version,camera:PTBO_DRIVING_CAMERA.version,satellite:PTBO_SATELLITE_MAP.version}};
  },mobile);
  const percentile=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];
  let stalled=0,maxStall=0;
  for(let i=1;i<data.samples.length;i++){const a=data.samples[i-1],b=data.samples[i];if(b.speed>100&&Math.hypot(b.centerLat-a.centerLat,b.centerLng-a.centerLng)<1e-10)stalled+=b.dt;else{maxStall=Math.max(maxStall,stalled);stalled=0;}}
  const report={name,baseline,mode:data.mode,versions:data.versions,maxFrameMs:Math.max(...data.samples.map(s=>s.dt)),p95FrameMs:percentile(data.samples.map(s=>s.dt),.95),maxFollowStallMs:Math.max(maxStall,stalled),maxCenterErrorMeters:Math.max(...data.samples.map(s=>s.error)),maxAnchorErrorPx:Math.max(...data.samples.map(s=>s.anchorError)),iconWidthRange:[Math.min(...data.samples.map(s=>s.iconWidth)),Math.max(...data.samples.map(s=>s.iconWidth))],easedFrames:data.samples.filter(s=>Math.abs(s.scale-1)>.001).length,longTasks:data.longTasks,zoomEvents:data.events,tileRequests:data.tiles.length,errors,fixture:'Actual browser and tile requests; deterministic fixed-step velocity wrapper; boundary collision disabled for the same straight controlled path; no calls or training data modified'};
  await page.screenshot({path:path.join(out,name+'.png')});
  await frame.evaluate(()=>{velocity=0;releaseDrivingInput();});
  if(mobile){
   // Directional mode drives by pointing the stick; Gas is a gear-up control.
   const cdp=await context.newCDPSession(page),box=await page.locator('#steering').boundingBox();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height*.2}]});
   await page.waitForTimeout(450);
   report.input=await frame.evaluate(()=>({held:!!keys.ArrowUp,moving:velocity>0}));
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{
   await page.locator('#simulator').focus();await page.keyboard.down('ArrowUp');await page.waitForTimeout(450);
   report.input=await frame.evaluate(()=>({held:!!keys.ArrowUp,moving:velocity>0}));await page.keyboard.up('ArrowUp');
  }
  report.input.released=await frame.evaluate(()=>!keys.ArrowUp);
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({report,data},null,2));reports.push(report);console.log(JSON.stringify(report));await context.close();
  assert.ok(report.input.held&&report.input.moving&&report.input.released,`${name}: input hold/release`);
  if(!baseline){assert.ok(report.maxFollowStallMs<50,`${name}: camera follow stalled`);assert.ok(report.maxAnchorErrorPx<1,`${name}: truck lost its anchor`);assert.ok(report.easedFrames>10,`${name}: expected eased zoom frames`);}
 }
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(reports,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
