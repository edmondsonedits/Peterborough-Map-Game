/* Shared production build marker and response-simulator enhancement loader. */
(() => {
  'use strict';

  const VERSION = '1.6.13';
  const LABEL = `v${VERSION}`;
  const SCRIPT_URL = document.currentScript?.src || new URL('shared/build-version.js', location.href).href;
  if (window.PTBO_BUILD?.version === VERSION) return;

  window.PTBO_BUILD = Object.freeze({version:VERSION,label:LABEL,channel:'production'});
  window.PTBO_BUILD_ERRORS = window.PTBO_BUILD_ERRORS || [];
  document.documentElement.dataset.ptboBuild = VERSION;
  document.documentElement.dataset.ptboChannel = 'production';

  if (!document.documentElement.dataset.ptboBuildErrorListeners) {
    document.documentElement.dataset.ptboBuildErrorListeners = 'true';
    addEventListener('error',event => {
      window.PTBO_BUILD_ERRORS.push({message:String(event.message || event.error || 'Unknown error'),source:String(event.filename || event.target?.src || event.target?.href || ''),line:Number(event.lineno || 0),column:Number(event.colno || 0),stack:String(event.error?.stack || '')});
      document.documentElement.dataset.ptboBuildErrors = JSON.stringify(window.PTBO_BUILD_ERRORS);
    },true);
    addEventListener('unhandledrejection',event => {
      window.PTBO_BUILD_ERRORS.push({message:String(event.reason?.message || event.reason || 'Unhandled promise rejection'),source:'unhandledrejection',line:0,column:0,stack:String(event.reason?.stack || '')});
      document.documentElement.dataset.ptboBuildErrors = JSON.stringify(window.PTBO_BUILD_ERRORS);
    });
  }

  function installBadge() {
    if (!document.body) return;
    let style=document.getElementById('ptbo-build-style');
    if(!style){
      style=document.createElement('style');style.id='ptbo-build-style';
      style.textContent='#ptbo-build-badge{position:fixed;top:max(4px,env(safe-area-inset-top));left:50%;z-index:2147483647;padding:3px 8px;color:#e2e8f0;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(15,23,42,.82);box-shadow:0 3px 10px rgba(0,0,0,.25);font:800 9px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.05em;white-space:nowrap;transform:translateX(-50%);pointer-events:none}@media(max-width:420px){#ptbo-build-badge{top:max(2px,env(safe-area-inset-top));padding:2px 6px;font-size:7px}}';
      document.head.appendChild(style);
    }
    let badge=document.getElementById('ptbo-build-badge');
    if(!badge){badge=document.createElement('div');badge.id='ptbo-build-badge';badge.setAttribute('role','status');document.body.appendChild(badge);}
    badge.setAttribute('aria-label',`Production version ${VERSION}`);badge.textContent=LABEL;
  }

  function injectPageScript(id, relativeUrl) {
    return new Promise((resolve,reject) => {
      const expected=new URL(relativeUrl,SCRIPT_URL).href;
      const existing=document.getElementById(id);
      if(existing && existing.src===expected){
        if(existing.dataset.ptboLoaded==='true')return resolve(existing);
        existing.addEventListener('load',()=>resolve(existing),{once:true});
        existing.addEventListener('error',()=>reject(new Error(`Unable to load ${relativeUrl}.`)),{once:true});
        return;
      }
      existing?.remove();
      const script=document.createElement('script');script.id=id;script.src=expected;script.dataset.ptboVersion=VERSION;
      script.onload=()=>{script.dataset.ptboLoaded='true';resolve(script);};
      script.onerror=()=>reject(new Error(`Unable to load ${relativeUrl}.`));
      document.head.appendChild(script);
    });
  }

  function injectIntoFrame(doc,id,relativeUrl,marker) {
    return new Promise((resolve,reject) => {
      const expected=new URL(relativeUrl,SCRIPT_URL).href;
      const existing=doc.getElementById(id);
      if(existing && existing.src===expected){
        if(existing.dataset.ptboLoaded==='true')return resolve(existing);
        existing.addEventListener('load',()=>resolve(existing),{once:true});
        existing.addEventListener('error',()=>reject(new Error(`Unable to load ${relativeUrl}.`)),{once:true});
        return;
      }
      existing?.remove();
      const script=doc.createElement('script');script.id=id;script.src=expected;script.dataset.ptboVersion=VERSION;
      if(marker)script.setAttribute(marker,'true');
      script.onload=()=>{script.dataset.ptboLoaded='true';resolve(script);};
      script.onerror=()=>reject(new Error(`Unable to load ${relativeUrl}.`));
      (doc.body||doc.documentElement).appendChild(script);
    });
  }

  function selectedCityId() {
    const params=new URLSearchParams(location.search);let stored=null;
    try{stored=localStorage.getItem('ptboSelectedCity');}catch(_){}
    const requested=String(params.get('city')||stored||'peterborough').toLowerCase();
    return /^[a-z0-9-]+$/.test(requested)?requested:'peterborough';
  }

  function installCitySelector() {
    if(!document.getElementById('dispatch-game-link'))return;
    injectPageScript('ptbo-city-registry-loader',`../cities/city-registry.js?v=${VERSION}`)
      .then(()=>injectPageScript('ptbo-city-selector-loader',`city-selector.js?v=${VERSION}`))
      .catch(error=>console.error('City selector failed to initialize.',error));
  }

  function normalizeSimulatorFrameUrl(frame) {
    if(!frame)return;
    const isWrapper=/\/response-simulator\/(?:play|mobile)\/(?:index\.html)?$/.test(location.pathname);
    if(!isWrapper)return;
    try{
      const url=new URL(frame.getAttribute('src')||'../index.html',location.href);
      const cityId=selectedCityId();
      const changed=url.searchParams.get('city')!==cityId || url.searchParams.get('v')!==VERSION;
      url.searchParams.set('city',cityId);url.searchParams.set('v',VERSION);
      frame.dataset.ptboCityUrlVersion=VERSION;frame.dataset.ptboCity=cityId;
      if(changed)frame.src=url.href;
    }catch(error){console.warn('Unable to normalize simulator city URL.',error);}
  }

  function setBaseTrainingLoadingCopy() {
    if(selectedCityId()==='peterborough')return;
    const title=document.getElementById('loading-title');
    const status=document.getElementById('loading-status');
    if(title)title.textContent='Loading base training';
    if(status)status.textContent='Loading Fire/EMS bases, map imagery, and vehicle controls…';
  }

  function installResponseEnhancements() {
    const isDesktop=/\/response-simulator\/play\/(?:index\.html)?$/.test(location.pathname);
    const isMobile=/\/response-simulator\/mobile\/(?:index\.html)?$/.test(location.pathname);
    if(!isDesktop&&!isMobile)return;
    const frame=document.getElementById('simulator');if(!frame)return;

    normalizeSimulatorFrameUrl(frame);
    setBaseTrainingLoadingCopy();
    injectPageScript('ptbo-current-service-selection',`../response-simulator/service-selection.js?v=${VERSION}`).catch(console.error);

    if(frame.dataset.ptboEnhancementLoader===VERSION)return;
    frame.dataset.ptboEnhancementLoader=VERSION;

    let cover=null,coverStyle=null,completed=false,frameGeneration=0;
    const finishCover=()=>{if(completed)return;completed=true;if(!cover)return;cover.classList.add('hidden');setTimeout(()=>{cover?.remove();coverStyle?.remove();},240);};
    const installCover=()=>{
      if(document.getElementById('ptbo-satellite-startup-cover'))return;
      coverStyle=document.createElement('style');coverStyle.id='ptbo-satellite-startup-style';
      coverStyle.textContent='#ptbo-satellite-startup-cover{position:fixed;inset:0;z-index:5950;display:grid;place-items:center;padding:24px;color:#f8fafc;background:#111827;text-align:center;transition:opacity .2s ease;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#ptbo-satellite-startup-cover.hidden{opacity:0;pointer-events:none}#ptbo-satellite-startup-cover strong{display:block;font-size:1.15rem}#ptbo-satellite-startup-cover span{display:block;margin-top:7px;color:#cbd5e1;font-size:.9rem;line-height:1.45}';
      cover=document.createElement('div');cover.id='ptbo-satellite-startup-cover';
      cover.innerHTML=`<div><strong>Loading ${selectedCityId()==='peterborough'?'satellite map':'base training'}</strong><span>${selectedCityId()==='peterborough'?'Preparing imagery, city package, camera, and protected driving controls…':'Preparing imagery, Fire/EMS bases, camera, and free-driving controls…'}</span></div>`;
      document.head.appendChild(coverStyle);document.body.appendChild(cover);
    };
    installCover();

    const installInsideFrame=async()=>{
      const generation=++frameGeneration;
      const doc=frame.contentDocument,game=frame.contentWindow;
      if(!doc||!game)return;
      try{
        game.PTBO_CITY_RUNTIME_BOOTSTRAP_EXPECTED_VERSION=VERSION;
        await injectIntoFrame(doc,'ptbo-city-runtime-bootstrap',`../response-simulator/city-runtime-bootstrap-1.6.10.js?v=${VERSION}`);
        await game.PTBO_CITY_RUNTIME_READY;
        if(generation!==frameGeneration)return;

        const city=game.PTBO_CITY_PACKAGE;
        const baseTraining=Boolean(city?.features?.baseTraining || city?.dispatch?.available===false || selectedCityId()!=='peterborough');
        if(baseTraining)await injectIntoFrame(doc,'ptbo-base-training-mode',`../response-simulator/base-training-mode-1.6.8.js?v=${VERSION}`);
        else await injectIntoFrame(doc,'ptbo-hard-road-boundary-loader',`../response-simulator/road-hard-boundary-1.6.6.js?v=${VERSION}`);

        if(isMobile){
          await injectIntoFrame(doc,'ptbo-directional-drive-zoom-loader',`../response-simulator/directional-drive-zoom-1.5.8.js?v=${VERSION}`);
          await injectIntoFrame(doc,'ptbo-mobile-ui-layout-loader',`../response-simulator/mobile-ui-layout-1.5.9.js?v=${VERSION}`);
        }

        await injectIntoFrame(doc,'ptbo-satellite-map-loader',`../response-simulator/satellite-map-1.5.6.js?v=${VERSION}`);
        if(game.PTBO_SATELLITE_MAP_READY)await Promise.resolve(game.PTBO_SATELLITE_MAP_READY).catch(()=>{});
        if(generation===frameGeneration)finishCover();
      }catch(error){
        console.error('Response enhancement bootstrap failed.',error);
        if(generation===frameGeneration)finishCover();
      }
    };

    frame.addEventListener('load',installInsideFrame);
    if(frame.contentDocument?.readyState==='complete')setTimeout(installInsideFrame,0);
    setTimeout(finishCover,20000);
  }

  function installPageEnhancements() {
    installBadge();
    const isMobile=/\/response-simulator\/mobile\/(?:index\.html)?$/.test(location.pathname);
    if(isMobile&&!document.getElementById('ptbo-mobile-dispatch-hud-loader')){
      const script=document.createElement('script');script.id='ptbo-mobile-dispatch-hud-loader';
      script.src=new URL(`mobile-dispatch-hud-1.5.5.js?v=${VERSION}`,SCRIPT_URL).href;script.async=true;document.head.appendChild(script);
    }
    installCitySelector();
    installResponseEnhancements();
  }

  if(document.body)installPageEnhancements();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installPageEnhancements,{once:true});
  else if(!document.body)installPageEnhancements();
  console.info(`Production build ${LABEL} initialized.`);
})();
