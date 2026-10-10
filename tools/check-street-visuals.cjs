'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = (process.argv[2] || 'http://127.0.0.1:4174').replace(/\/$/, '');
const label = process.env.STREET_CAPTURE_LABEL || 'baseline';
const output = path.join('artifacts', 'street-evidence', label);
const views = JSON.parse(fs.readFileSync('city-explorer/data/street-review-sites.json','utf8'))
  .map(s=>[s.id,s.lat,s.lon]);
(async () => {
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
  const page = await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
  // Explicit desktop emulation prevents the CI runner's 2-core hardware from
  // silently testing only the OSM compatibility path. Not a physical-device benchmark.
  await page.addInitScript(()=>{Object.defineProperty(navigator,'deviceMemory',{get:()=>8});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});});
  const errors=[];
  page.on('pageerror', e=>errors.push(String(e)));
  // Measurement only. Do not alter geometry or paint production code.
  await page.route('**/city-explorer/app.js*', async route=>{
    const response=await route.fetch();
    let source=await response.text();
    const marker='window.__PTBO_CITY_QA__ = Object.freeze({';
    if(!source.includes(marker)) throw Error('QA export changed');
    source=source.replace(marker,'window.__PTBO_STREET_INSPECT__ = { state, streetscapeGroup, roadGroup, renderer };\n  '+marker);
    await route.fulfill({response,body:source});
  });
  try {
    await page.goto(base+'/city-explorer/?qa=1', {waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>document.documentElement.dataset.gameplayReady==='true',null,{timeout:180000});
    await page.addStyleTag({content:'.hud-panel,.gameplay-hud,#flight-reticle,#mode-hint,.brand-panel{visibility:hidden!important}'});
    const captures=[];
    for(const [name,lat,lon] of views){
      await page.evaluate(v=>window.__PTBO_CITY_QA__.setView(v), {lat,lon,altitude:65,distance:32,bearing:180,pitch:-1.16});
      await page.waitForTimeout(800);
      await page.screenshot({path:path.join(output,name+'.png')});
      captures.push({name,lat,lon,metrics:await page.evaluate(()=>window.__PTBO_CITY_QA__.metrics())});
    }
    const paint=await page.evaluate(async()=>{
      const THREE=await import('./vendor/three-r180/build/three.module.min.js');
      const {state,streetscapeGroup}=window.__PTBO_STREET_INSPECT__;
      const matrix=new THREE.Matrix4(),p=new THREE.Vector3();
      let samples=0,covered=0,buried=0,floating=0,maxError=0;
      streetscapeGroup.traverse(o=>{
        if(!o.isInstancedMesh||!/^road-(lane|centre|edge)|mapped-cycle|surface-conforming-road-paint/.test(o.userData?.type||''))return;
        for(let i=0;i<o.count;i++){
          o.getMatrixAt(i,matrix);
          if(o.userData.type==='surface-conforming-road-paint')p.set(1/3,0,-1/3).applyMatrix4(matrix);
          else p.setFromMatrixPosition(matrix);
          samples++;
          const hit=state.renderedPavementIndex.sample(p.x,p.z,p.y,{includeParking:false});
          if(!hit)continue;covered++;
          const error=p.y-hit.height;maxError=Math.max(maxError,Math.abs(error));
          if(error<-.01)buried++;
          if(error>.08)floating++;
        }
      });
      return {samples,covered,buried,floating,maxError,meaning:'Instance-origin comparison against rendered pavement, not surveyed road accuracy'};
    });
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({label,errors,captures,paint,dataset:await page.evaluate(()=>({...document.documentElement.dataset}))},null,2));
    console.log(JSON.stringify({label,paint,errors}));
    if(errors.length)throw Error('Browser errors present');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
