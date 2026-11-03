'use strict';
// Deterministic package wiring from the reviewed hospital matrix and canonical city manifests.
const fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const read=f=>fs.readFileSync(f,'utf8'),write=(f,s)=>fs.writeFileSync(f,s,'utf8');
const descriptorsOnly=process.argv.includes('--descriptors-only');
const matrix=JSON.parse(read('docs/validation/all-city-dispatch-hospitals.json'));
const registry={window:{}};vm.runInNewContext(read('cities/city-registry.js'),registry);
for(const city of registry.window.PTBO_CITIES){
 const dir=`cities/${city.id}`,file=`${dir}/city.json`,manifest=JSON.parse(read(file));
 if(!descriptorsOnly)Object.assign(manifest.features,{baseTraining:false,dispatch:true,roadBoundaries:true,routeGuidance:true,hospitalTransport:true});
 if(city.id==='peterborough'){if(!descriptorsOnly)write(file,JSON.stringify(manifest,null,2)+'\n');continue;}
 const geo=JSON.parse(read(`${dir}/geo-data.json`));
 const descriptorFile=`${dir}/dispatch-data.js`;
 const previousDescriptor=fs.existsSync(descriptorFile)?read(descriptorFile):'';
 let trackedDescriptor='';
 try{trackedDescriptor=execFileSync('git',['show',`HEAD:${descriptorFile}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{}
 const previousVersion=trackedDescriptor.match(/version\s*:\s*['"]([^'"]+)['"]/)?.[1]
  ||previousDescriptor.match(/version\s*:\s*['"]([^'"]+)['"]/)?.[1];
 const dataVersion=typeof geo.dispatchDataVersion==='string'&&geo.dispatchDataVersion.trim()
  ?geo.dispatchDataVersion.trim():previousVersion||'ontario-geo-1';
 write(descriptorFile,`/* Canonical ${city.name} locations; scenario assignments live in training-data.json. */\n(() => {\n  'use strict';\n  const source=new URL(document.currentScript?.src||location.href,location.href);\n  window.PTBO_CITY_DISPATCH_SOURCE=Object.freeze({cityId:${JSON.stringify(city.id)},version:${JSON.stringify(dataVersion)},available:true,url:source.href});\n  if(window.PTBO_DISPATCH_DATA_READY)return;\n  window.PTBO_DISPATCH_DATA_READY=fetch(new URL('./geo-data.json',source).href,{cache:'force-cache'}).then(async response=>{\n    if(!response.ok)throw Error('City dispatch locations could not load.');\n    const data=await response.json();\n    if(data.id!==${JSON.stringify(city.id)}||!Array.isArray(data.locations))throw Error('City dispatch locations are invalid.');\n    window.PTBO_DISPATCH_DATA_VERSION=data.dispatchDataVersion||${JSON.stringify(dataVersion)};return data.locations;\n  });\n})();\n`);
 if(descriptorsOnly)continue;
 const row=matrix.cities.find(r=>r.cityId===city.id),h=row?.hospital;
 if(!h?.id||!h.name||!h.address||!Number.isFinite(h.lat)||!Number.isFinite(h.lng)||!h.officialEdUrl)throw Error(`Incomplete hospital source for ${city.id}`);
 const map=JSON.parse(JSON.stringify({...geo.map,...manifest.map}));
 map.bounds[0][0]=Math.min(map.bounds[0][0],h.lat-.005);map.bounds[0][1]=Math.min(map.bounds[0][1],h.lng-.005);
 map.bounds[1][0]=Math.max(map.bounds[1][0],h.lat+.005);map.bounds[1][1]=Math.max(map.bounds[1][1],h.lng+.005);
 const config={id:city.id,name:city.name,map,canonicalRoster:true,sceneResponseDrills:true,routeGuidance:true,sources:{}};
 if(city.id==='richmond-hill')config.hospitalLocationId='richmond-hill-call-10';
 else config.hospitalSite={id:h.id,name:h.name,addr:h.address,lat:h.lat,lng:h.lng,radius:40,sourceUrl:h.officialEdUrl,coordinateSourceUrl:h.coordinateSourceUrl||null,coordinateMethod:h.coordinateMethod,trainingArrivalKind:'sourced-site-point'};
 write(`${dir}/package.js`,"/* Shared Dispatch demo with canonical city data and a sourced hospital site. */\n(() => {\n  'use strict';\n  const VERSION='1.6.13';\n  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);\n  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;\n  const config="+JSON.stringify(config)+";\n  const start=()=>window.PTBO_PREVIEW_CITY_FACTORY.create({...config,sourceUrl});\n  if(window.PTBO_PREVIEW_CITY_FACTORY?.version===VERSION){start();return;}\n  const factoryUrl=new URL('../preview-package-factory.js?v='+CACHE_VERSION,sourceUrl).href;\n  if(document.readyState==='loading'&&typeof document.write==='function'){\n    // The inserted external script runs after this script returns. Queue its\n    // initializer after it so following parser scripts see the city package.\n    const payload=JSON.stringify({...config,sourceUrl:sourceUrl.href}).replace(/</g,'\\\\u003c');\n    document.write('<script src=\"'+factoryUrl.replace(/&/g,'&amp;').replace(/\"/g,'&quot;')+'\"><'+'/script>'+\n      '<script>window.PTBO_PREVIEW_CITY_FACTORY.create('+payload+');<'+'/script>');\n    return;\n  }\n  const script=document.createElement('script');script.src=factoryUrl;script.onload=start;script.onerror=()=>console.error('Unable to load base-training city package factory.');document.head.appendChild(script);\n})();\n");
 Object.assign(manifest,{status:'dispatch-demo',playable:true,note:'Fire and EMS response demo with hospital transport and route review.',map,runtime:'./package.js'});
 Object.assign(manifest.features,{sceneResponseDrills:true});Object.assign(manifest.data,{roads:'roads.geojson.gz',dispatchLocations:'dispatch-data.js',bases:'geo-data.json',hospitals:'package.js',services:'package.js'});
 write(file,JSON.stringify(manifest,null,2)+'\n');
}
console.log('Configured '+registry.window.PTBO_CITIES.length+' city packages; gameplay verification still required.');
