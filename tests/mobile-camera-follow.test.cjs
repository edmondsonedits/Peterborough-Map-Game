const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../tools/location-report-tests/node_modules/jsdom');
const read=p=>fs.readFileSync(p,'utf8');
async function fixture(t,{stored,storageDenied=false}={}){
 const dom=new JSDOM('<div id="steering"></div><button id="recenter-button"></button><iframe></iframe>',{url:'https://game.example/response-simulator/mobile/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window.document.querySelector('iframe').contentWindow;
 w.document.body.innerHTML='<div id="map"></div><label class="checkbox-row"><input id="chk-camera"></label><div id="control-panel"><div class="panel-scroll"></div></div>';
 const el=w.document.getElementById('map');for(const [key,value] of Object.entries({clientWidth:390,clientHeight:844,offsetWidth:390,offsetHeight:844}))Object.defineProperty(el,key,{get:()=>value});
 w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.matchMedia=()=>({matches:false});
 if(stored){w.localStorage.setItem('ptboNorthUpDefaultV1','1');w.localStorage.setItem('ptboCameraMode',stored);}
 if(storageDenied)Object.defineProperty(w,'localStorage',{get(){throw Error('denied');}});
 w.eval(read('response-simulator/vendor/leaflet-1.9.4/leaflet.js'));
 w.eval('var simLat=43.88,simLng=-79.44,currentHeading=90,velocity=0,headingUpMode=false,updateMapOrientation=()=>{};var mapInstance=L.map("map",{zoomAnimation:false}).setView([simLat,simLng],19);var vehicleMarker=L.marker([simLat,simLng],{icon:L.divIcon({html:"<div class=truck-rotation-wrapper></div>"})}).addTo(mapInstance);');
 const source=read('response-simulator/smooth-driving-camera-1.4.19.js');
 w.eval(source.replace('    const api = Object.freeze({','    window.__cameraState=state;\n    const api = Object.freeze({'));await w.PTBO_DRIVING_CAMERA_READY;
 return{w,api:w.PTBO_DRIVING_CAMERA,state:w.__cameraState,hint:dom.window.document.getElementById('ptbo-follow-hint')};
}
test('north-up is primary, storage denial is safe, and explicit subsequent Driving View is retained',async t=>{
 for(const options of [{},{storageDenied:true}]){const s=await fixture(t,options);assert.equal(s.state.mode,'fixed');assert.equal(s.api.getBearing(),0);}
 const s=await fixture(t,{stored:'driving'});assert.equal(s.state.mode,'driving');assert.equal(s.api.getBearing(),90);
});
test('only dragging pauses follow and shows the hint; recenter resumes continuous following',async t=>{
 const s=await fixture(t);assert.equal(s.hint.hidden,true);s.w.mapInstance.fire('click');assert.equal(s.state.following,true);
 s.w.mapInstance.fire('dragstart');assert.equal(s.state.following,false);assert.equal(s.hint.hidden,false);assert.match(s.hint.textContent,/Recenter/);
 const old=s.w.mapInstance.getCenter().lat;s.w.simLat+=.001;s.w.vehicleMarker.setLatLng([s.w.simLat,s.w.simLng]);assert.equal(s.w.mapInstance.getCenter().lat,old);
 s.api.recenter();assert.equal(s.state.following,true);assert.equal(s.hint.hidden,true);
 s.w.simLat+=.001;s.w.vehicleMarker.setLatLng([s.w.simLat,s.w.simLng]);assert.ok(s.w.mapInstance.distance(s.w.mapInstance.getCenter(),s.w.vehicleMarker.getLatLng())<.3);
 s.w.mapInstance.fire('dragstart');s.api.setReviewMode(true);assert.equal(s.hint.hidden,true);s.api.setReviewMode(false);assert.equal(s.hint.hidden,false);s.api.setMode('driving');assert.equal(s.hint.hidden,true);
});
