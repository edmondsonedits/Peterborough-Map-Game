'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../tools/location-report-tests/node_modules/jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function launcher(t,{failure,missingApp=false,query='?city=toronto',stored='oshawa'}={}){
  const dom=new JSDOM(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://example.test/game/'+query,runScripts:'outside-only'});
  const w=dom.window,doc=w.document,timers=new Map(),requests=[],errors=[];let nextTimer=0,policy=failure,activeScript=null;
  Object.defineProperty(doc,'currentScript',{get:()=>activeScript});
  const execute=(node,file)=>{activeScript=node;try{w.eval(read(file));}finally{activeScript=null;}};
  t.after(()=>{dom.window.close();assert.deepEqual(errors,[]);});
  w.console={info(){},warn(){},error(){}};
  w.addEventListener('error',event=>{errors.push(event.error?.message||event.message);event.preventDefault();});
  w.setTimeout=(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;};w.clearTimeout=id=>timers.delete(id);w.setInterval=()=>0;
  w.localStorage.setItem('ptboSelectedCity',stored);
  const select=doc.getElementById('home-city-select');let changeHandlers=0;
  const add=select.addEventListener.bind(select);select.addEventListener=(name,...args)=>{if(name==='change')changeHandlers++;return add(name,...args);};
  for(const container of [doc.head,doc.body]){
    const append=container.appendChild.bind(container);
    container.appendChild=node=>{
      const result=append(node);if(node.tagName!=='SCRIPT')return result;
      const file=new URL(node.src).pathname.replace('/game/','');requests.push({node,file});
      queueMicrotask(()=>{
        if(policy?.file===file){if(policy.kind==='error')node.onerror?.();if(policy.kind==='noapi')node.onload?.();return;}
        if(['cities/city-registry.js','shared/city-selector.js','homepage/app.js'].includes(file))execute(node,file);
        node.onload?.();
      });return result;
    };
  }
  if(!missingApp)w.eval(read('homepage/app.js'));
  w.eval(read('shared/build-version.js'));await tick();await tick();
  const links=()=>[...doc.querySelectorAll('[data-preview],[data-preview-launch],#city-explorer-link,#dispatch-editor-link')];
  return{w,doc,select,requests,links,execute,handlers:()=>changeHandlers,
    async expire(){for(const [id,timer]of [...timers])if(timer.delay===12000){timers.delete(id);timer.fn();}await tick();await tick();},
    async retry(nextFailure=null){policy=nextFailure;doc.getElementById('home-city-retry')?.click();await tick();await tick();},
  };
}
function assertReady(h,city){
  assert.equal(h.select.disabled,false);assert.equal(h.select.value,city);
  assert.equal(h.doc.body.dataset.homeCity,city);assert.equal(h.doc.getElementById('home-city-retry').hidden,true);
  assert.equal(h.handlers(),1,'retries install exactly one city-change handler');
  for(const link of h.links()){
    assert.notEqual(link.getAttribute('aria-disabled'),'true');
    if(link.hasAttribute('href'))assert.equal(new URL(link.href).searchParams.get('city'),city,link.id||link.dataset.previewLaunch);
  }
  assert.ok(h.doc.getElementById('geo-game-link').hasAttribute('href'));
  assert.ok(h.doc.getElementById('dispatch-game-link').hasAttribute('href'));
}

test('homepage selector is disabled in HTML before asynchronous setup',()=>{
  assert.match(read('index.html'),/<select\b[^>]*id="home-city-select"[^>]*\bdisabled\b/);
});
for(const file of ['cities/city-registry.js','shared/city-selector.js']){
  for(const kind of ['error','timeout']){
    test(`${file} ${kind} blocks mismatched launches and same-page retry recovers once`,async t=>{
      const h=await launcher(t,{failure:{file,kind}});
      assert.equal(h.select.disabled,true);
      for(const link of h.links()){
        assert.equal(link.getAttribute('href'),null,'no normal, modified or context-menu stale launch');
        assert.equal(link.getAttribute('aria-disabled'),'true');
        const event=new h.w.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});link.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
      }
      if(kind==='timeout')await h.expire();
      assert.match(h.doc.getElementById('home-city-status').textContent,/couldn.t load|unable|unavailable/i);
      assert.equal(h.doc.getElementById('home-city-retry').hidden,false);
      await h.retry();assertReady(h,'toronto');
      h.select.value='peterborough';h.select.dispatchEvent(new h.w.Event('change'));assertReady(h,'peterborough');
      h.select.value='toronto';h.select.dispatchEvent(new h.w.Event('change'));assertReady(h,'toronto');
      h.doc.getElementById('home-city-retry').click();await tick();assert.equal(h.handlers(),1);
    });
  }
}
test('normal startup preserves remembered city and working modified-click destinations',async t=>{
  const h=await launcher(t,{query:''});assertReady(h,'oshawa');
  const link=h.doc.getElementById('geo-game-link');const e=new h.w.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});link.dispatchEvent(e);
  assert.equal(e.defaultPrevented,false);assert.equal(new URL(link.href).searchParams.get('city'),'oshawa');
});
test('missing static homepage controller is loaded before city initialization',async t=>{
  const h=await launcher(t,{missingApp:true});assertReady(h,'toronto');
  assert.equal(h.requests.filter(x=>x.file==='homepage/app.js').length,1);
});

for(const file of ['cities/city-registry.js','shared/city-selector.js','homepage/app.js']){
  test(`${file} load without an initialized API is retryable`,async t=>{
    const h=await launcher(t,{failure:{file,kind:'noapi'},missingApp:file==='homepage/app.js'});
    assert.equal(h.select.disabled,true);assert.equal(h.doc.getElementById('home-city-retry').hidden,false);
    await h.retry();assertReady(h,'toronto');
  });
}
test('repeated failures remain retryable and expired callbacks cannot complete a newer attempt',async t=>{
  const failure={file:'cities/city-registry.js',kind:'timeout'};
  const h=await launcher(t,{failure});
  const expired=h.requests.find(x=>x.file===failure.file).node;
  await h.expire();assert.equal(expired.isConnected,false,'timed-out script must be removed');
  await h.retry({file:'shared/city-selector.js',kind:'error'});
  assert.equal(h.select.disabled,true);assert.equal(h.doc.getElementById('home-city-retry').hidden,false);
  await h.retry();assertReady(h,'toronto');
  expired.onload?.();await tick();assertReady(h,'toronto');
  assert.notEqual(expired.dataset.ptboLoaded,'true','expired callback must not mark stale resources loaded');
});

test('late cancelled selector execution cannot resurrect links or bypass a new attempt',async t=>{
  const file='shared/city-selector.js';const h=await launcher(t,{failure:{file,kind:'timeout'}});
  const expired=h.requests.find(x=>x.file===file).node;await h.expire();
  const failedStatus=h.doc.getElementById('home-city-status').textContent;
  h.execute(expired,file);expired.onload?.();await tick();
  assert.equal(h.doc.getElementById('home-city-status').textContent,failedStatus);
  assert.ok(h.links().every(link=>!link.hasAttribute('href')));
  assert.equal(h.handlers(),0);assert.equal(h.select.disabled,true);
  await h.retry();assertReady(h,'toronto');
  h.execute(expired,file);expired.onload?.();await tick();assertReady(h,'toronto');
});
