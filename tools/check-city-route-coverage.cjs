'use strict';
// Read-only all-base coverage using production graph/trace code and SCC reachability.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),json=file=>JSON.parse(read(file));
const output=path.resolve(process.env.PTBO_COVERAGE_OUTPUT||path.join(root,'test-artifacts/city-expansion/base-coverage'));
fs.mkdirSync(output,{recursive:true});
const trace=require('../route-mapping/trace-core.js');
const registry={window:{}};vm.runInNewContext(read('cities/city-registry.js'),registry);
const appSource=read('route-mapping/app.js');
function app(city,training,bases){
 const c={window:{PTBO_SERVICE_CONFIG:{profiles:Object.fromEntries(['fire','ems'].map(service=>[service,{bases:bases.filter(b=>b.service===service)}]))}},document:{getElementById:()=>({})},console};
 const expose='globalThis.api={state,applyCityData,buildGraph,toXY,toLatLng,pathBetween,basePoint,baseAnchor:typeof baseAnchor===\'function\'?baseAnchor:null,nearestRoad,callsForService,buildDifficultyIndex,scoreCall,CONFIG};';
 if(!appSource.includes('  initialize();'))throw new Error('Production initialize hook changed');
 vm.runInNewContext(appSource.replace('  initialize();','  '+expose),c);
 c.api.applyCityData(city,training);return c.api;
}
async function inputs(city){
 const training=json(`cities/${city.id}/training-data.json`);let bases,raw;
 if(city.geoDataUrl){
  const geo=json(city.geoDataUrl);bases=geo.bases.filter(b=>b.status==='active'&&b.selectionEligible===true&&Number.isFinite(b.lat)&&Number.isFinite(b.lng));raw=geo.locations;
 }else if(city.id==='peterborough'){
  const c={window:{dispatchEvent(){}},URL,location:{href:'https://example.test/'},document:{currentScript:{src:'https://example.test/cities/peterborough/package.js'},documentElement:{dataset:{}}},CustomEvent:class{}};
  vm.runInNewContext(read('cities/peterborough/package.js'),c);bases=Object.entries(c.window.PTBO_SERVICE_CONFIG.profiles).flatMap(([service,p])=>p.bases.map(b=>({...b,service})));
  const encoded=read('shared/dispatch-data-1.4.4.js').match(/const PAYLOAD = '([^']+)'/)[1];raw=JSON.parse(zlib.gunzipSync(Buffer.from(encoded,'base64')));
 }else{
  let config;const c={window:{PTBO_PREVIEW_CITY_FACTORY:{version:'1.6.13',create(value){config=value;}}},URL,location:{href:'https://example.test/'},document:{currentScript:{src:`https://example.test/cities/${city.id}/package.js`}}};
  vm.runInNewContext(read(`cities/${city.id}/package.js`),c);
  bases=['fire','ems'].flatMap(service=>(config.sources[service].fallback||config.sources[service].entries).map(b=>({...b,id:b.id||`${service}-${b.number}`,service})));raw=[];
 }
 const c={console:{info(){},warn(){}},URL,setTimeout,clearTimeout,AbortController,CustomEvent:class{},location:{href:`https://example.test/?city=${city.id}`},
  document:{currentScript:{src:`https://example.test/shared/dispatch-locations.js?city=${city.id}`}},localStorage:{getItem:()=>null,setItem(){}},dispatchEvent(){},
  fetch:async()=>({ok:true,json:async()=>training}),PTBO_DISPATCH_DATA_VERSION:'coverage',PTBO_DISPATCH_DATA_READY:Promise.resolve(raw)};
 c.window=c;vm.runInNewContext(read('shared/ems-priority.js'),c);vm.runInNewContext(read('shared/dispatch-locations.js'),c);await c.PTBO_DISPATCH_STORE.ready();
 let calls=c.PTBO_DISPATCH_STORE.getAll();
 if(['belleville','scarborough'].includes(city.id))calls.push(...bases.filter(b=>b.service==='fire').map(b=>({...b,id:'route-base-'+b.id,addr:b.address,radius:65,main:'Fire',sub:'Station familiarization',trainingServices:['fire']})));
 calls=calls.map(call=>city.id!=='peterborough'&&!call.incidentProfiles&&!call.trainingServices?{...call,incidentProfiles:{fire:{sub:'Structure Fire'},ems:{sub:'Medical Assistance'}}}:call);
 return{training,bases,calls};
}
function components(graph){
 const nodes=graph.nodes,n=nodes.length,seen=new Uint8Array(n),cursor=new Uint32Array(n),order=[],stack=[];
 const offsets=new Uint32Array(n+1);for(const node of nodes)for(const e of node.edges)offsets[e.to+1]++;
 for(let i=1;i<=n;i++)offsets[i]+=offsets[i-1];
 const reverse=new Uint32Array(offsets[n]),fill=offsets.slice();for(const node of nodes)for(const e of node.edges)reverse[fill[e.to]++]=node.id;
 for(let seed=0;seed<n;seed++)if(!seen[seed]){
  stack.push(seed);seen[seed]=1;
  while(stack.length){const id=stack[stack.length-1],edges=nodes[id].edges;if(cursor[id]<edges.length){const to=edges[cursor[id]++].to;if(!seen[to]){seen[to]=1;stack.push(to);}}else{order.push(id);stack.pop();}}
 }
 const ids=new Int32Array(n);ids.fill(-1);const sizes=[];
 for(let i=order.length-1;i>=0;i--){const seed=order[i];if(ids[seed]>=0)continue;const component=sizes.length;let size=0;ids[seed]=component;stack.push(seed);
  while(stack.length){const id=stack.pop();size++;for(let p=offsets[id];p<offsets[id+1];p++){const from=reverse[p];if(ids[from]<0){ids[from]=component;stack.push(from);}}}sizes.push(size);
 }
 const exits=Array.from({length:sizes.length},()=>new Set());for(const node of nodes)for(const e of node.edges)if(ids[node.id]!==ids[e.to])exits[ids[node.id]].add(ids[e.to]);
 const cache=new Map();
 function canReach(from,to){const a=ids[from],b=ids[to];if(a===b)return true;let reached=cache.get(a);if(!reached){reached=new Set([a]);const pending=[a];while(pending.length)for(const next of exits[pending.pop()])if(!reached.has(next)){reached.add(next);pending.push(next);}cache.set(a,reached);}return reached.has(b);}
 return{ids,sizes,canReach};
}
function exits(graph,a,entering,difficulty=false){
 if(!a)return[];const s=graph.segments[a.segmentId],out=[];
 if(entering){if(s.forward||a.t===0)out.push(s.from);if(s.backward||a.t===1)out.push(s.to);}
 else{if(s.forward||(!difficulty&&a.t===1))out.push(s.to);if(s.backward||(!difficulty&&a.t===0))out.push(s.from);}
 return out;
}
function legalReach(graph,scc,a,b){
 if(!a||!b)return false;
 if(a.segmentId===b.segmentId){const s=graph.segments[a.segmentId];if(Math.abs(a.t-b.t)<1e-9||(b.t>=a.t?s.forward:s.backward))return true;}
 return exits(graph,a,false).some(from=>exits(graph,b,true).some(to=>scc.canReach(from,to)));
}
function verifyRoute(api,origin,destination){
 const route=api.state.traceCore.between(origin,destination);
 if(!route)return{pass:false,reason:'production A* returned no route'};
 const finished=api.state.traceCore.finish(route,destination,40);
 if(!finished.complete)return{pass:false,reason:'production finish did not complete'};
 for(let i=0;i<route.edges.length;i++){
  const e=route.edges[i],s=api.state.graph.segments[e.segmentId];if(e.reverse?!s.backward:!s.forward)throw new Error('Trace contains forbidden direction');
  if(i&&api.state.traceCore.distance(route.edges[i-1].end,e.start)>.2)throw new Error('Trace contains discontinuity');
 }
 return{pass:true,distance:route.distance,edges:route.edges.length};
}
function diagnoseBlockedBase(api,scc,base,pool){
 api.state.base=base;api.buildDifficultyIndex(base);
 const selectable=api.callsForService().map(api.scoreCall).filter(c=>Number.isFinite(c.difficultyDistance)&&c.difficultyDistance>0);
 const point={lat:Number(base.spawnLat??base.lat),lng:Number(base.spawnLng??base.lng)},xy=api.toXY(point.lat,point.lng),candidates=[];
 for(const s of api.state.graph.segments){
  const t=Math.max(0,Math.min(1,((xy.x-s.ax)*s.dx+(xy.y-s.ay)*s.dy)/s.lengthSq)),gap=Math.hypot(s.ax+s.dx*t-xy.x,s.ay+s.dy*t-xy.y);
  if(gap>260)continue;const ll=api.toLatLng(s.ax+s.dx*t,s.ay+s.dy*t);candidates.push({...ll,segmentId:s.id,t,distance:gap,road:s.name,highway:s.highway});
 }
 candidates.sort((a,b)=>a.distance-b.distance);
 const alternatives=[];
 for(const namedOnly of [false,true]){
  for(const a of candidates){
   if(namedOnly&&(a.road==='Unnamed road'||a.highway==='service'))continue;
   const starts=exits(api.state.graph,a,false,true),target=pool.find(c=>c.road&&starts.some(id=>scc.canReach(id,c.road.nodeId))&&legalReach(api.state.graph,scc,a,c.anchor));
   if(!target)continue;
   alternatives.push({namedPublic:namedOnly,...a,call:target.call.id,actual:verifyRoute(api,a,target.anchor)});break;
  }
 }
 return{productionSelectableCalls:selectable.length,alternatives};
}
(async()=>{
 const reports=[],findings=[];let proven=0,actual=0,totalBases=0;
 const cities=registry.window.PTBO_CITIES.filter(c=>c.modes.route&&(!process.env.PTBO_COVERAGE_CITY||process.env.PTBO_COVERAGE_CITY.split(',').includes(c.id)));
 for(const city of cities){
  const started=Date.now(),{training,bases,calls}=await inputs(city),api=app(city,training,bases),bytes=fs.readFileSync(path.join(root,training.roadsUrl));
  const raw=training.roadsUrl.endsWith('.gz')?zlib.gunzipSync(bytes):bytes,geo=JSON.parse(raw);api.state.graph=api.buildGraph(geo);const graph=api.state.graph;
  api.state.traceCore=trace.createTraceCore({graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
  const scc=components(graph),report={city:city.id,nodes:graph.nodes.length,segments:graph.segments.length,components:scc.sizes.length,largestComponent:scc.sizes.reduce((a,b)=>Math.max(a,b),0),bases:[],callSnaps:[],actualRoutes:[],findings:[]};
  if(training.roadDataSha256&&crypto.createHash('sha256').update(raw).digest('hex')!==training.roadDataSha256)report.findings.push({kind:'road-hash-mismatch'});
  api.state.calls=calls;
  for(const service of ['fire','ems']){
   api.state.service=service;const pool=api.callsForService().map(call=>({call,anchor:api.state.traceCore.snap(call,520),road:api.nearestRoad(call.lat,call.lng,650)}));
   report.callSnaps.push({service,total:pool.length,within520:pool.filter(c=>c.anchor).length,maxGap:pool.reduce((max,c)=>Math.max(max,c.anchor?.distance||0),0),without520:pool.filter(c=>!c.anchor).map(c=>({id:c.call.id,name:c.call.name,lat:c.call.lat,lng:c.call.lng,nearest650:c.road?.distance??null}))});
   const serviceBases=bases.filter(b=>b.service===service);
   for(let bi=0;bi<serviceBases.length;bi++){
    const base=serviceBases[bi],point={lat:Number(base.spawnLat??base.lat),lng:Number(base.spawnLng??base.lng)},road=api.nearestRoad(point.lat,point.lng,260),origin=api.baseAnchor?api.baseAnchor(base):api.state.traceCore.snap(api.basePoint(base),260);
    totalBases++;const entry={id:base.id,name:base.name,service,lat:point.lat,lng:point.lng,snapGap:road?.distance??null,accessGap:origin?.distance??null,alternate:origin?.alternate??false,road:origin?.road??null,highway:origin?.highway??null,proven:false};report.bases.push(entry);
    if(!road||!origin){report.findings.push({kind:road?'base-no-connected-access-within260':'base-no-public-road-within260',...entry,diagnostic:diagnoseBlockedBase(api,scc,base,pool)});continue;}
    const starts=exits(graph,origin,false,true),segment=graph.segments[origin.segmentId];
    const zeroNodes=new Set([...(segment.forward&&origin.t===1?[segment.to]:[]),...(segment.backward&&origin.t===0?[segment.from]:[])]);
    const selectable=pool.filter(c=>c.road&&!zeroNodes.has(c.road.nodeId)&&starts.some(id=>scc.canReach(id,c.road.nodeId)));
    const viable=selectable.filter(c=>legalReach(graph,scc,origin,c.anchor));
    entry.selectableCalls=selectable.length;entry.viableCalls=viable.length;entry.proven=viable.length>0;if(entry.proven)proven++;
    for(const c of selectable.filter(c=>!viable.includes(c)))report.findings.push({kind:'selectable-call-no-legal-target-route',base:base.id,service,call:c.call.id,name:c.call.name,anchor:!!c.anchor,nearest650:c.road?.distance});
    if(!viable.length){report.findings.push({kind:'base-no-viable-call',...entry,diagnostic:diagnoseBlockedBase(api,scc,base,pool)});continue;}
    viable.sort((a,b)=>api.state.traceCore.distance(origin,a.anchor)-api.state.traceCore.distance(origin,b.anchor));
    entry.witness={id:viable[0].call.id,name:viable[0].call.name,targetGap:viable[0].anchor.distance,originComponent:scc.ids[starts[0]],targetComponents:exits(graph,viable[0].anchor,true).map(id=>scc.ids[id])};
    if(bi===0||bi===serviceBases.length-1||origin.alternate||road.distance>100||['motorway','motorway_link','trunk','trunk_link'].includes(origin.highway)){
     let result;try{result=verifyRoute(api,origin,viable[0].anchor);}catch(error){result={pass:false,reason:error.message};}
     actual++;report.actualRoutes.push({base:base.id,service,call:viable[0].call.id,...result});if(!result.pass)report.findings.push({kind:'actual-route-failed',base:base.id,service,call:viable[0].call.id,...result});
    }
   }
  }
  report.durationMs=Date.now()-started;report.findings.forEach(f=>findings.push({city:city.id,...f}));reports.push(report);fs.writeFileSync(path.join(output,city.id+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({city:city.id,nodes:report.nodes,bases:report.bases.length,proven:report.bases.filter(b=>b.proven).length,actual:report.actualRoutes.length,findings:report.findings.length,ms:report.durationMs}));
 }
 const expected=new Set((process.env.PTBO_EXPECTED_UNAVAILABLE||'').split(',').filter(Boolean)),acceptedUnavailable=findings.filter(f=>f.kind==='base-no-connected-access-within260'&&expected.has(f.id)),unexpected=findings.filter(f=>!acceptedUnavailable.includes(f));
 for(const id of expected)if(!acceptedUnavailable.some(f=>f.id===id))unexpected.push({kind:'expected-unavailable-origin-not-observed',id});
 const summary={cities:reports.length,totalBases,proven,actualRoutes:actual,findings,acceptedUnavailable:acceptedUnavailable.map(f=>({city:f.city,id:f.id,name:f.name,service:f.service})),unexpectedFindings:unexpected,productionAppSha256:crypto.createHash('sha256').update(appSource).digest('hex'),limits:['Read-only production-code VM plus directed SCC proof; first/last and ambiguous bases get production A*/finish checks under the production120000visited-node limit.','No browser input tracing, authoritative coordinate revalidation or physical access/driveway survey.','Canonical published data with empty local edits; Peterborough advanced synthetic call additions not enumerated.','Directed reachability is proven for604bases; actual A* is sampled at first/last and alternate starts, not every candidate call pair.'],reports:reports.map(r=>({city:r.city,bases:r.bases.length,nodes:r.nodes,actualRoutes:r.actualRoutes.length,findings:r.findings.length}))};
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({cities:summary.cities,totalBases,proven,actualRoutes:actual,acceptedUnavailable:acceptedUnavailable.length,unexpectedFindings:unexpected.length}));if(unexpected.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
