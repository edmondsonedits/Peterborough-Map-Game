'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../tools/location-report-tests/node_modules/jsdom');
const read=file=>readFileSync(path.join(__dirname,'..',file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const AUDIO_KEY='ptboDispatchVoiceEnabled';

function environment(t,surface,policy={}){
  const html=read(`response-simulator/${surface}/index.html`);
  const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:`https://game.example.test/response-simulator/${surface}/`,runScripts:'outside-only'});
  const w=dom.window,frame=w.document.getElementById('simulator'),game=frame.contentWindow,errors=[];
  t.after(()=>{dom.window.close();assert.deepEqual(errors,[],'preference failures must not escape through event handlers');});
  const values=new Map(policy.saved===undefined?[]:[[AUDIO_KEY,policy.saved]]);
  for(const realm of [w,game]){
    realm.addEventListener('error',event=>{errors.push(event.error?.message||event.message);event.preventDefault();});
    realm.requestAnimationFrame=()=>0;realm.setTimeout=()=>0;realm.setInterval=()=>0;
    const storage={getItem(key){if(policy.read)throw new realm.DOMException('Storage blocked','SecurityError');return values.get(key)??null;},setItem(key,value){if(policy.write)throw new realm.DOMException('Storage full','QuotaExceededError');values.set(key,String(value));}};
    Object.defineProperty(realm,'localStorage',{configurable:true,get(){if(policy.getter)throw new realm.DOMException('Storage unavailable','SecurityError');return storage;}});
    // Expected diagnostics from the existing guarded steering-mode preference write.
    realm.console.warn=()=>{};
  }
  frame.dataset.ptboCity='peterborough';
  return{w,game,frame,html,values};
}
async function wrapper(t,surface,policy){
  const e=environment(t,surface,policy),{w,game,frame,html}=e;
  w.PTBO_DISPATCH_STORE={ready:async()=>{}};
  w.PTBO_SERVICE_SELECTION={ready:async()=>{},open:async()=>{}};
  game.PTBO_CITY_PACKAGE={id:'peterborough',name:'Peterborough',features:{},map:{maxZoom:19,minZoom:10}};
  let cancellations=0;game.speechSynthesis={cancel(){cancellations++;}};
  const append=game.document.body.appendChild.bind(game.document.body);
  game.document.body.appendChild=node=>{append(node);if(node.src)queueMicrotask(()=>{if(node.src.includes('simulator-readiness'))game.PTBO_SIMULATOR_READY=Promise.resolve({});node.onload?.();});return node;};
  const inline=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/\bsrc=/.test(m[1])).at(-1)[2];
  w.eval(inline);
  // The complete wrapper's real load listener must resume startup when runtime I/O becomes ready.
  game.initializeSimulator=()=>{};frame.dispatchEvent(new w.Event('load'));await tick();await tick();
  const loading=w.document.getElementById(surface==='play'?'loading':'loading-cover');
  assert.equal(loading.classList.contains('hidden'),true,'wrapper must reach its ready state');
  return{...e,audio:w.document.getElementById('audio-button'),cancellations:()=>cancellations};
}

for(const surface of ['play','mobile']){
  for(const [name,policy]of Object.entries({getter:{getter:true},read:{read:true},write:{write:true}})){
    test(`${surface} starts and mute toggles when optional storage ${name} fails`,async t=>{
      const e=await wrapper(t,surface,policy);
      assert.equal(e.w.ptboDispatchVoiceEnabled(),true);assert.equal(e.audio.getAttribute('aria-label'),'Mute dispatch voice');
      e.audio.click();assert.equal(e.w.ptboDispatchVoiceEnabled(),false);assert.equal(e.audio.classList.contains('muted'),true);assert.equal(e.cancellations(),1);
      assert.equal(e.audio.getAttribute('aria-label'),'Turn on dispatch voice');
      if(surface==='play')assert.equal(e.audio.getAttribute('aria-pressed'),'false');
      e.audio.click();assert.equal(e.w.ptboDispatchVoiceEnabled(),true);assert.equal(e.audio.classList.contains('muted'),false);
    });
  }
  test(`${surface} preserves readable mute preference even if later writes fail`,async t=>{
    const e=await wrapper(t,surface,{saved:'false',write:true});
    assert.equal(e.w.ptboDispatchVoiceEnabled(),false);assert.equal(e.audio.getAttribute('aria-label'),'Turn on dispatch voice');
    e.audio.click();assert.equal(e.w.ptboDispatchVoiceEnabled(),true);assert.equal(e.audio.getAttribute('aria-label'),'Mute dispatch voice');
    assert.equal(e.values.get(AUDIO_KEY),'false','failed saving must not pretend the persisted preference changed');
  });
  test(`${surface} still saves and restores the mute preference when storage works`,async t=>{
    const first=await wrapper(t,surface,{});first.audio.click();assert.equal(first.values.get(AUDIO_KEY),'false');
    const second=await wrapper(t,surface,{saved:first.values.get(AUDIO_KEY)});assert.equal(second.w.ptboDispatchVoiceEnabled(),false);
    second.audio.click();assert.equal(second.values.get(AUDIO_KEY),'true');
  });
  for(const [name,policy]of Object.entries({getter:{getter:true},read:{read:true},write:{write:true}})){
    test(`${surface} control modules install and remain usable when storage ${name} fails`,async t=>{
      const {w,game}=environment(t,surface,policy);
      game.document.body.innerHTML='<div id="map"></div><div class="panel-scroll"></div>';
      game.eval(`var keys={ArrowUp:false,ArrowDown:false,ArrowLeft:false,ArrowRight:false,w:false,a:false,s:false,d:false},currentHeading=0,velocity=0,simLat=44.3,simLng=-78.32,vehicleMarker=null;var mapInstance={options:{},getZoom:()=>19,setZoom(){},setView(){},getPane:()=>null};window.PTBO_FIXED_STEP=1/60;`);
      const steering=w.document.getElementById('steering');
      if(steering){steering.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});steering.setPointerCapture=()=>{};}
      for(const file of ['vehicle-instruments-core.js','directional-steering-tuning.js','arcade-handling-1.5.1.js','arcade-mobile-camera-1.5.3.js','gearbox-core.js','directional-drive-zoom-1.5.8.js'])game.eval(read('response-simulator/'+file));
      await tick();
      const core=game.PTBO_VEHICLE_INSTRUMENTS,arcade=game.PTBO_ARCADE_HANDLING;
      assert.equal(arcade.state.installed,true);
      assert.equal(core.state.steeringMode,surface==='mobile'?'directional':'standard');
      arcade.applyPreset('heavy');assert.equal(arcade.state.settings.preset,'heavy');
      assert.equal(game.document.getElementById('ptbo-arcade-preset').value,'heavy','handling UI must still update without persistence');
      if(steering){
        assert.equal(game.PTBO_DIRECTIONAL_STEERING_TUNING.state.installed,true);assert.equal(game.PTBO_STABLE_MOBILE_CAMERA.state.installed,true);assert.equal(game.PTBO_DIRECTIONAL_DRIVE_ZOOM.state.installed,true);
        const down=new w.Event('pointerdown',{bubbles:true,cancelable:true});Object.assign(down,{pointerId:10,clientX:100,clientY:50});steering.dispatchEvent(down);await tick();
        game.PTBO_DIRECTIONAL_DRIVE_ZOOM.beforeStep();game.PTBO_DIRECTIONAL_STEERING_TUNING.step(1/60);
        assert.equal(game.keys.ArrowUp,true);assert.ok(game.currentHeading>0);
      }
    });
  }
}
