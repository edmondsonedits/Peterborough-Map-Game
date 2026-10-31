/* node tools/check-dispatch-intersections.cjs [base-url]
 * Controlled turn through real road geometry with production collision/guard physics.
 * Playwright desktop and mobile-layout checks; not physical-phone evidence.
 */
const {chromium}=require('playwright');
const {spawn}=require('child_process'),fs=require('fs'),assert=require('assert/strict');
const base=(process.argv[2]||'http://127.0.0.1:4222').replace(/\/$/,'');
const artifactRoot=require('path').resolve(process.env.PTBO_QA_ARTIFACT_DIR||'artifacts/release-qa/intersections');fs.mkdirSync(artifactRoot,{recursive:true});
(async()=>{let server,browser;const report={cases:[],errors:[]};try{
if(['127.0.0.1','localhost'].includes(new URL(base).hostname)){server=spawn(process.execPath,['tools/serve-preview.cjs',new URL(base).port||'4222'],{stdio:'ignore',windowsHide:true});await new Promise(r=>setTimeout(r,500));}browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge',args:['--use-angle=d3d11']}: {})});
for(const [city,mobile] of [['peterborough',false],['richmond-hill',false],['richmond-hill',true]]){
 const c=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});await c.addInitScript(()=>{sessionStorage.setItem('ptbo-feedback-welcome','1');localStorage.setItem('ptboResponseVisualTutorialSeenV1','1');});
 await c.route('**/*',r=>r.request().method()==='GET'||(/google.com/.test(new URL(r.request().url()).hostname)&&/recaptcha/.test(r.request().url()))?r.continue():r.abort());
 const page=await c.newPage();page.on('pageerror',e=>report.errors.push(e.message));const started=Date.now();await page.goto(`${base}/response-simulator/${mobile?'mobile':'play'}/?city=${city}`,{waitUntil:'domcontentloaded'});await page.locator('#service-choice [data-service="fire"]').waitFor({timeout:45000});const startupMs=Date.now()-started;const frame=page.frames().find(f=>f!==page.mainFrame());
 const ready=await frame.evaluate(()=>({cornerState:PTBO_ROAD_INTERSECTION_SOFTENER.state,ready:!!PTBO_ROAD_INTERSECTION_SOFTENER.ready,roadCity:PTBO_ROAD_COLLISION.config.cityId,core:PTBO_ROAD_COLLISION.state.status}));assert.equal(ready.cornerState.installed,true);assert.equal(ready.roadCity,city);assert.ok(startupMs<30000);
 await page.locator('#service-choice [data-service="fire"]').click();let turn=null;
 if(city==='richmond-hill'){
 turn=await frame.evaluate(()=>{
 const roads=PTBO_ROAD_COLLISION,config=roads.config,my=110540,mx=111320*Math.cos(config.centerLat*Math.PI/180),w={lat:43.83861523249502,lng:-79.38975586035082};const xy=p=>({x:(p.lng-config.centerLng)*mx,y:(p.lat-config.centerLat)*my}),geo=p=>({lat:config.centerLat+p.y/my,lng:config.centerLng+p.x/mx}),v=xy(w);
 const project=s=>{const t=Math.max(0,Math.min(1,((v.x-s.ax)*s.dx+(v.y-s.ay)*s.dy)/s.lengthSq)),p={x:s.ax+s.dx*t,y:s.ay+s.dy*t};return{...p,d:Math.hypot(v.x-p.x,v.y-p.y),segment:s};};
 const originals=roads.state.segments.filter(s=>!s.syntheticIntersection).map(project).filter(p=>p.d<20).sort((a,b)=>a.d-b.d);let curve;
 findCurve:for(const a of originals)for(const b of originals){if(a.segment.featureIndex===b.segment.featureIndex||a.segment.levelKey!==b.segment.levelKey)continue;const angle=Math.abs((a.segment.dx*b.segment.dx+a.segment.dy*b.segment.dy)/(a.segment.length*b.segment.length));if(angle>.9)continue;const control={x:2*v.x-.5*(a.x+b.x),y:2*v.y-.5*(a.y+b.y)};const points=Array.from({length:61},(_,i)=>{const t=i/60;return{x:(1-t)**2*a.x+2*(1-t)*t*control.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*control.y+t*t*b.y};});if(points.every(p=>{const g=geo(p);return roads.isPointDrivable(g.lat,g.lng);})) {curve=points;break findCurve;}}
 if(!curve)throw Error('No bounded corner path found at measured source gap');
 releaseDrivingInput();const previous={arcade:PTBO_ARCADE_HANDLING,gears:window.PTBO_DIRECTIONAL_DRIVE_ZOOM,instruments:PTBO_VEHICLE_INSTRUMENTS,tuning:window.PTBO_DIRECTIONAL_STEERING_TUNING,lane:roads.state.laneAssist};
 let requestedSpeed=0;window.PTBO_ARCADE_HANDLING={state:{installed:false}};window.PTBO_VEHICLE_INSTRUMENTS={stepSteering(){}};window.PTBO_DIRECTIONAL_STEERING_TUNING={step(){}};window.PTBO_DIRECTIONAL_DRIVE_ZOOM={beforeStep(){},driveStep(){velocity=requestedSpeed;return true;}};roads.state.laneAssist=0;roads.state.stationExit=null;
 let maxError=0;const before=roads.state.collisions,hardBefore=PTBO_HARD_ROAD_BOUNDARY.state.corrections;
 try{const first=geo(curve[0]);simLat=first.lat;simLng=first.lng;vehicleMarker.setLatLng([simLat,simLng]);
 for(const p of curve.slice(1)){const target=geo(p),dy=target.lat-simLat,dx=(target.lng-simLng)*Math.cos(target.lat*Math.PI/180);requestedSpeed=Math.hypot(dx,dy);velocity=requestedSpeed;currentHeading=Math.atan2(dx,dy)*180/Math.PI;simulationStep();const actual=xy({lat:simLat,lng:simLng});maxError=Math.max(maxError,Math.hypot(actual.x-p.x,actual.y-p.y));}
 const blocked=roads.state.collisions-before,corrections=PTBO_HARD_ROAD_BOUNDARY.state.corrections-hardBefore;if(blocked||corrections||maxError>.1)throw Error(JSON.stringify({blocked,corrections,maxError}));
 let outside;for(const dx of [35,-35,50,-50]){const q=geo({x:v.x+dx,y:v.y+35});if(!roads.isPointDrivable(q.lat,q.lng)){outside=q;break;}}if(!outside)throw Error('No off-road negative sample');const dlat=outside.lat-simLat,dlng=(outside.lng-simLng)*Math.cos(outside.lat*Math.PI/180);requestedSpeed=Math.hypot(dlat,dlng);velocity=requestedSpeed;currentHeading=Math.atan2(dlng,dlat)*180/Math.PI;simulationStep();const outsideBlocked=roads.isPointDrivable(simLat,simLng)&&Math.hypot((simLat-outside.lat)*my,(simLng-outside.lng)*mx)>1;if(!outsideBlocked)throw Error('Off-road boundary failed');
 return{witness:w,steps:curve.length-1,blocked,hardCorrections:corrections,maxPositionErrorMetres:maxError,offRoadBlocked:outsideBlocked};
 }finally{window.PTBO_ARCADE_HANDLING=previous.arcade;window.PTBO_DIRECTIONAL_DRIVE_ZOOM=previous.gears;window.PTBO_VEHICLE_INSTRUMENTS=previous.instruments;window.PTBO_DIRECTIONAL_STEERING_TUNING=previous.tuning;roads.state.laneAssist=previous.lane;velocity=0;}
 });
 await frame.evaluate(()=>{PTBO_DRIVING_CAMERA.recenter();mapInstance.setView([simLat,simLng],19,{animate:false});const s=PTBO_ROAD_COLLISION.state;const x=PTBO_ROAD_COLLISION.config;for(const segment of s.segments.filter(s=>s.syntheticIntersection)){const lat=x.centerLat+(segment.ay+segment.by)/2/110540,lng=x.centerLng+(segment.ax+segment.bx)/2/(111320*Math.cos(x.centerLat*Math.PI/180));if(mapInstance.distance([lat,lng],[simLat,simLng])<80)L.circle([lat,lng],{radius:segment.allowed,color:'#22d3ee',fillOpacity:.18,weight:2}).addTo(mapInstance);}});
 }
 await frame.waitForFunction(()=>[...document.querySelectorAll('img.leaflet-tile-loaded')].filter(img=>img.naturalWidth>0).length>=2,null,{timeout:15000});
 await frame.waitForFunction(()=>{const tiles=[...document.querySelectorAll('.leaflet-tile-container img')].filter(img=>img.getBoundingClientRect().width>0);return tiles.some(img=>img.classList.contains('leaflet-tile-loaded')&&Number(getComputedStyle(img).opacity)>.99);},null,{timeout:15000});
 await page.waitForTimeout(500);
 await page.screenshot({path:`${artifactRoot}/${city}-${mobile?'mobile':'desktop'}-corners.png`});report.cases.push({city,mobile,startupMs,ready,turn});console.log(JSON.stringify(report.cases.at(-1)));await c.close();
}
fs.writeFileSync(require('path').join(artifactRoot,'browser-intersections.json'),JSON.stringify(report,null,2));assert.deepEqual(report.errors,[]);
}finally{if(browser)await browser.close();if(server)server.kill();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
