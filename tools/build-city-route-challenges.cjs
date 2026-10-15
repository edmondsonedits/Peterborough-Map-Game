#!/usr/bin/env node
'use strict';
// Curate base-dependent road choices using exactly the browser game's graph and
// response router. The output is map-derived evidence, not facility inspection.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {normalizeRouteMetadata}=require('../shared/dispatch-locations.js');
const ROOT=path.resolve(__dirname,'..');
const readJSON=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const round=(n,p=2)=>Math.round(Number(n)*10**p)/10**p;
const named=name=>Boolean(name&&name!=='Unnamed road'&&name!=='Road');
const roadKey=name=>String(name||'').trim().toLowerCase().replace(/\s+/g,' ');
const publicNamed=edge=>named(edge.name)&&edge.highway!=='service';
const unique=values=>[...new Set(values)];
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function loadEngine(cityId,cityMap){
  const cost=require('../route-mapping/cost-core.js');
  if(!cityMap){const city=loadCity(cityId);cityMap=city.geo?.map||city.map;}
  const window={PTBO_ROUTE_COST:cost,PTBO_CITY_PACKAGE:{id:cityId,map:cityMap,route:{baseAccess:{}}},PTBO_BUILD:{version:'curation'}};
  const context=vm.createContext({window,document:{getElementById:()=>null},console,URL,Math,Number,String,Object,Boolean,Array,Map,Set,Float64Array,Int32Array,Int16Array,Uint8Array,localStorage:{getItem:()=>null},performance:{now:()=>Date.now()}});
  const source=fs.readFileSync(path.join(ROOT,'route-mapping/app.js'),'utf8');
  const exports=['state','buildGraph','toXY','toLatLng','snapRoadAccess','referenceBetween','basePoint','callPoint'];
  if(!source.includes('  initialize();'))throw new Error('Game initialize export marker changed.');
  vm.runInContext(source.replace('  initialize();','  globalThis.routeCuration={'+exports.join(',')+'};'),context,{filename:'route-mapping/app.js'});
  return {...context.routeCuration,window,cost};
}
function loadCity(cityId){
  if(cityId!=='peterborough'){
    const file=path.join(ROOT,'cities',cityId,'geo-data.json'),geo=readJSON(file);
    return {geo,file,calls:geo.locations,bases:geo.bases.filter(b=>b.status==='active'&&b.selectionEligible!==false&&['fire','ems'].includes(b.service)&&Number.isFinite(b.lat)&&Number.isFinite(b.lng))};
  }
  const file=path.join(ROOT,'shared/dispatch-data-1.4.4.js'),script=fs.readFileSync(file,'utf8'),payload=script.match(/const PAYLOAD = '([^']+)'/);
  if(!payload)throw new Error('Peterborough shared PAYLOAD missing.');
  const calls=JSON.parse(zlib.gunzipSync(Buffer.from(payload[1],'base64'))),window={};
  const document={currentScript:{src:'https://local/cities/peterborough/package.js'},documentElement:{dataset:{}}};
  window.dispatchEvent=()=>{};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'cities/peterborough/package.js'),'utf8'),{window,document,location:{href:'https://local/'},URL,CustomEvent:class{}});
  const bases=Object.entries(window.PTBO_SERVICE_CONFIG.profiles).flatMap(([service,p])=>p.bases.map(b=>({...b,service,status:'active',selectionEligible:true})));
  const catalogFile=path.join(ROOT,'cities/peterborough/locations.json'),catalog=readJSON(catalogFile);
  return {file,script,calls,bases,catalogFile,catalog,map:window.PTBO_CITY_PACKAGE.map};
}
function saveCalls(city){
  for(const call of city.calls)Object.assign(call,normalizeRouteMetadata(call));
  if(city.geo){city.geo.locations=city.calls;fs.writeFileSync(city.file,JSON.stringify(city.geo)+'\n');return;}
  const payload=zlib.gzipSync(JSON.stringify(city.calls),{level:9}).toString('base64');
  fs.writeFileSync(city.file,city.script.replace(/const PAYLOAD = '[^']+'/,'const PAYLOAD = '+JSON.stringify(payload).replace(/^"|"$/g,"'")));
  const byId=new Map(city.calls.map(c=>[c.id,c]));
  city.catalog.locations=city.catalog.locations.filter(c=>!String(c.id).includes('-route-osm-node-')).map(c=>{
    const call=byId.get(c.id),copy={...c};delete copy.routeChallenges;delete copy.routeAccess;
    if(call?.routeChallenges)copy.routeChallenges=call.routeChallenges;if(call?.routeAccess)copy.routeAccess=call.routeAccess;
    return copy;
  });
  const readableIds=new Set(city.catalog.locations.map(c=>c.id));
  for(const call of city.calls)if(!readableIds.has(call.id))city.catalog.locations.push({id:call.id,city:'peterborough',name:call.name,address:call.addr,lat:call.lat,lng:call.lng,radiusMeters:call.radius,difficulty:null,crossStreets:call.crossStreets,sourceCallIds:[],sources:call.sources,origin:'Route-only OSM junction',addressVerification:'OSM named road junction; no civic number asserted',addressSource:call.sources[0],routeChallenges:call.routeChallenges,routeAccess:call.routeAccess});
  if(city.catalog.totals){city.catalog.totals.total=city.catalog.locations.length;city.catalog.totals.routeOnly=city.catalog.locations.filter(c=>c.difficulty===null).length;}
  fs.writeFileSync(city.catalogFile,JSON.stringify(city.catalog,null,2)+'\n');
}
function routeRoads(route){return unique((route?.edges||[]).filter(publicNamed).map(e=>e.name));}
function routeSignature(route){return (route?.edges||[]).map(e=>e.segmentId+':'+Number(Boolean(e.reverse))).join(',');}
function changedGeometry(best,alternative){
  const referenceIds=new Set(best.edges.map(e=>e.segmentId)),referenceNames=new Set(routeRoads(best).map(roadKey));
  let changed=0,namedChanged=0,newCorridor=0;
  for(const e of alternative.edges){
    if(referenceIds.has(e.segmentId))continue;
    changed+=e.distance;
    if(publicNamed(e)){namedChanged+=e.distance;if(!referenceNames.has(roadKey(e.name)))newCorridor+=e.distance;}
  }
  const a=best.edges.find(e=>e.distance>2),b=alternative.edges.find(e=>e.distance>2);
  const oppositeDeparture=Boolean(a&&b&&a.segmentId===b.segmentId&&Boolean(a.reverse)!==Boolean(b.reverse));
  const shared=alternative.edges.reduce((sum,e)=>sum+(referenceIds.has(e.segmentId)?e.distance:0),0);
  return {changedDistance:changed,namedChangedDistance:namedChanged,newNamedCorridorDistance:newCorridor,oppositeDeparture,overlap:shared/Math.max(1,alternative.distance)};
}
function assessAlternative(best,alternative){
  if(!best||!alternative||!Number.isFinite(alternative.seconds)||alternative.feasible===false)return null;
  if(routeSignature(best)===routeSignature(alternative))return null;
  const geometry=changedGeometry(best,alternative),penalty=alternative.seconds-best.seconds,threshold=Math.max(18,best.seconds*.035);
  if(penalty<=threshold)return null;
  if(!(geometry.changedDistance>=120&&geometry.namedChangedDistance>=120&&geometry.newNamedCorridorDistance>0||geometry.oppositeDeparture&&geometry.namedChangedDistance>=180))return null;
  // A modest local detour can be credible even when the reference is short;
  // otherwise reject broad circuits that merely manufacture a bad choice.
  if(alternative.seconds>Math.max(best.seconds*2.8,best.seconds+300))return null;
  return {...geometry,penalty,threshold,ratio:penalty/Math.max(1,best.seconds)};
}
function challengeDifficulty(best,alternative,quality,decisionType){
  // Road-choice complexity only. Neither route length nor recognition tier is
  // an input. The same call can therefore differ for Fire, EMS and each base.
  const changes=routeRoads(best).length,altChoices=routeRoads(alternative).filter(n=>!routeRoads(best).map(roadKey).includes(roadKey(n))).length;
  return Math.round(Math.max(0,Math.min(100,38+Math.min(20,quality.ratio*65)+Math.min(16,altChoices*4)+Math.min(12,Math.max(0,changes-2)*2)+(decisionType==='bridge-choice'?8:decisionType==='departure-direction'?6:3))));
}
function summarizeRoute(route){
  const values={distance:route.distance,seconds:route.seconds,cost:route.cost??route.seconds,travelSeconds:route.travelSeconds,turnSeconds:route.turnSeconds,controlSeconds:route.controlSeconds,suitabilitySeconds:route.suitabilitySeconds};
  return Object.fromEntries(Object.entries(values).filter(([,v])=>Number.isFinite(v)).map(([k,v])=>[k,round(v)]));
}
function challengeReason(base,call,best,alternative,decisionType){
  const preferred=best.roads||routeRoads(best),other=alternative.roads||routeRoads(alternative),names=new Set(preferred.map(roadKey)),newRoads=other.filter(n=>!names.has(roadKey(n)));
  const label={'departure-direction':'departure direction','bridge-choice':'crossing','corridor-choice':'corridor'}[decisionType]||'road';
  const delay=r=>round((r.turnSeconds||0)+(r.controlSeconds||0),1);
  return `From ${base.shortName||base.name||base.id} to ${call.name||call.addr}, the ${label} choice via ${preferred.slice(0,4).join(' / ')} models ${round(best.seconds,1)} seconds, compared with ${round(alternative.seconds,1)} seconds via ${(newRoads.length?newRoads:other).slice(0,4).join(' / ')}: ${round(alternative.seconds-best.seconds,1)} modeled seconds saved. Turn/control delay is ${delay(best)} versus ${delay(alternative)} seconds; roadway suitability cost is ${round(best.suitabilitySeconds||0,1)} versus ${round(alternative.suitabilitySeconds||0,1)} seconds.`;
}
function finalizeCityMetadata(cityId){
  const city=loadCity(cityId),report=readJSON(path.join(ROOT,'outputs/ontario-route-curation',cityId+'.json')),bases=new Map(city.bases.map(b=>[b.id,b])),calls=new Map(city.calls.map(c=>[c.id,c]));
  for(const row of report.routes){
    const call=calls.get(row.callId),base=bases.get(row.baseId),challenge=call?.routeChallenges?.find(c=>c.baseId===row.baseId&&c.service===row.service);
    if(!call||!base||!challenge)throw new Error(`${cityId}: evidence/metadata association missing: ${row.baseId}/${row.callId}`);
    challenge.reason=challengeReason(base,call,row.reference,row.alternatives[0].route,row.decisionType);
    challenge.alternatives.forEach((a,i)=>{const e=row.alternatives[i];if(e)a.reason=`${(e.route.roads||[]).slice(0,4).join(' / ')} models ${round(e.route.seconds,1)} seconds, ${round(e.quality.penalty,1)} seconds more than the preferred route; ${Math.round(e.quality.namedChangedDistance)} m of changed named public-road geometry.`;});
  }
  saveCalls(city);return {cityId,callCount:city.calls.length,challengeCount:report.routes.length};
}
function evidenceRoute(route,graph){
  return {...summarizeRoute(route),roads:routeRoads(route),geometry:route.coordinates,edges:route.edges.map(e=>({from:e.from,to:e.to,fromOsmId:graph.nodes[e.from]?.osmId,toOsmId:graph.nodes[e.to]?.osmId,wayId:e.wayId,segmentId:e.segmentId,reverse:Boolean(e.reverse),t0:e.t0??(e.reverse?1:0),t1:e.t1??(e.reverse?0:1),distance:round(e.distance,4),name:e.name,highway:e.highway,start:e.start||{lat:graph.nodes[e.from].lat,lng:graph.nodes[e.from].lng},end:e.end||{lat:graph.nodes[e.to].lat,lng:graph.nodes[e.to].lng}}))};
}
function candidateOrder(calls,base,engine,maxDistance=35000){
  const origin=engine.toXY(base.lat,base.lng),ordered=calls.map(call=>{const p=engine.toXY(Number(call.lat),Number(call.lng));return {call,d:Math.hypot(p.x-origin.x,p.y-origin.y),angle:Math.atan2(p.y-origin.y,p.x-origin.x)};}).filter(x=>Number.isFinite(x.d)&&x.d>200&&x.d<=maxDistance).sort((a,b)=>a.d-b.d||String(a.call.id).localeCompare(String(b.call.id)));
  // Begin with destinations in several directions, then exhaust the existing
  // sourced catalog before considering a new OSM junction.
  const out=[],seen=new Set(),add=x=>{if(x&&!seen.has(x.call.id)){seen.add(x.call.id);out.push(x.call);}};
  for(let band=0;band<4;band++)add(ordered.find(x=>Math.floor((x.angle+Math.PI)/(Math.PI/2))%4===band));
  for(const x of ordered)add(x);
  return out;
}
function probeOptions(best,graph){
  const result=[],seen=new Set(),add=(options,type,label)=>{const key=JSON.stringify(options);if(!seen.has(key)){seen.add(key);result.push({options,type,label});}};
  const first=best.edges.find(e=>e.distance>2),segment=first&&graph.segments[first.segmentId];
  if(first&&segment?.forward&&segment?.backward)add({startDirection:first.reverse?'forward':'backward'},'departure-direction','opposite legal departure');
  const bridges=unique(best.edges.map(e=>e.bridgeKey).filter(Boolean));
  if(bridges.length)add({avoidBridge:bridges[0]},'bridge-choice','another connected crossing');
  const forks=best.edges.map((edge,index)=>({edge,index,node:graph.nodes[edge.from]})).filter(({edge,index,node})=>index>1&&index<best.edges.length-2&&node?.edges.some(e=>e.to!==edge.to&&publicNamed(e)&&roadKey(e.name)!==roadKey(edge.name)));
  const picks=[.28,.55,.78].map(f=>forks[Math.floor((forks.length-1)*f)]).filter(Boolean);
  for(const fork of picks)add({avoidNode:fork.edge.from},'corridor-choice','a different named corridor');
  return result.slice(0,3);
}
function analyzeCall(base,call,engine,origin){
  origin??=engine.snapRoadAccess(engine.basePoint(base),260,{base:true});
  const destination=engine.snapRoadAccess(engine.callPoint(call),520);
  if(!origin||!destination)return null;
  const best=engine.referenceBetween(origin,destination,{baseAccess:true});
  if(!best||!best.edges?.length||!Number.isFinite(best.seconds))return null;
  const alternatives=[];
  for(const probe of probeOptions(best,engine.state.graph)){
    const route=engine.referenceBetween(origin,destination,{baseAccess:true,...probe.options}),quality=assessAlternative(best,route);
    if(quality){alternatives.push({...probe,route,quality});break;}
  }
  if(!alternatives.length)return null;
  alternatives.sort((a,b)=>b.quality.newNamedCorridorDistance-a.quality.newNamedCorridorDistance||b.quality.penalty-a.quality.penalty);
  const preferred=alternatives[0],difficulty=challengeDifficulty(best,preferred.route,preferred.quality,preferred.type);
  return {call,origin,destination,best,alternatives,decisionType:preferred.type,difficulty};
}
function routeOverlap(a,b){
  const ids=new Set(a.best.edges.map(e=>e.segmentId));
  return b.best.edges.reduce((s,e)=>s+(ids.has(e.segmentId)?e.distance:0),0)/Math.max(1,b.best.distance);
}
function chooseChallenges(candidates,count=3){
  const remaining=candidates.slice(),selected=[];
  while(remaining.length&&selected.length<count){
    const value=c=>c.difficulty-selected.reduce((p,s)=>p+(c.decisionType===s.decisionType&&Math.min(routeOverlap(c,s),routeOverlap(s,c))>.85?24:0),0);
    remaining.sort((a,b)=>value(b)-value(a)||String(a.call.id).localeCompare(String(b.call.id)));
    selected.push(remaining.shift());
  }
  return selected;
}
function osmJunctions(engine,cityId,existing){
  const graph=engine.state.graph,existingPoints=existing.map(c=>engine.toXY(Number(c.lat),Number(c.lng))),out=[];
  for(const node of graph.nodes){
    if(!/^\d+$/.test(String(node.osmId))||existingPoints.some(p=>Math.hypot(p.x-node.x,p.y-node.y)<150))continue;
    const roads=unique(node.edges.filter(publicNamed).map(e=>e.name)).sort();
    if(roads.length<2)continue;
    out.push({id:`${cityId}-route-osm-node-${node.osmId}`,name:`${roads[0]}/${roads[1]} junction`,addr:`${roads[0]} & ${roads[1]}`,lat:node.lat,lng:node.lng,radius:65,recognitionDifficulty:null,crossStreets:roads.slice(0,2),custom:false,sources:[`https://www.openstreetmap.org/node/${node.osmId}`],routeSource:'OSM named public-road junction'});
  }
  return out;
}
function accessRecord(anchor,source,graph,graphVersion){
  const segment=graph.segments[anchor.segmentId],wayId=segment.wayId??graph.nodes[segment.from].edges.find(e=>e.segmentId===segment.id)?.wayId;
  if(!wayId||!Number.isFinite(Number(wayId)))throw new Error('Public-road access has no source OSM way.');
  const nearest=anchor.t<.5?graph.nodes[segment.from]:graph.nodes[segment.to];
  return {lat:anchor.lat,lng:anchor.lng,sourceLat:Number(source.spawnLat??source.lat),sourceLng:Number(source.spawnLng??source.lng),wayId:Number(wayId),...(nearest.osmId?{nodeId:Number(nearest.osmId)}:{}),graphVersion,reviewStatus:'map-derived',sourceUrl:`https://www.openstreetmap.org/way/${wayId}`};
}
function buildCity(cityId,{write=false,networkFile}={}){
  const start=Date.now(),city=loadCity(cityId),engine=loadEngine(cityId,city.geo?.map||city.map);
  // Generated junction rows belong to this deterministic build. Reconsider
  // them from their OSM graph each time rather than accumulating stale picks.
  city.calls=city.calls.filter(c=>!String(c.id).includes('-route-osm-node-'));
  const file=networkFile||path.join(ROOT,'outputs/ontario-route-source/networks',cityId+'.json');
  const networkText=fs.readFileSync(file,'utf8'),network=JSON.parse(networkText),graphVersion=network.graphVersion||network.properties?.graphVersion||network.metadata?.graphVersion||network.version;
  if(!graphVersion)throw new Error(`${cityId}: network graphVersion missing`);
  const graph=engine.buildGraph(network);engine.state.graph=graph;
  const originalTiers=new Map(city.calls.map(c=>[c.id,c.recognitionDifficulty]));
  for(const call of city.calls){delete call.routeChallenges;delete call.routeAccess;}
  const baseAccess={},coverage=[],evidence=[],exceptions=[];let junctions;
  engine.window.PTBO_CITY_PACKAGE.route={graphVersion,baseAccess};engine.state.routeManifest=engine.window.PTBO_CITY_PACKAGE.route;
  for(const base of city.bases){
    engine.state.service=base.service;
    const source={lat:Number(base.spawnLat??base.lat),lng:Number(base.spawnLng??base.lng)},anchor=engine.snapRoadAccess(source,1200,{base:true});
    if(!anchor){exceptions.push({baseId:base.id,reason:'No connected named public-road access within 1200 m'});continue;}
    baseAccess[base.id]=accessRecord(anchor,base,graph,graphVersion);
    const origin=engine.snapRoadAccess(engine.basePoint(base),260,{base:true});
    const candidates=[],order=candidateOrder(city.calls.filter(c=>!String(c.id).includes('-route-osm-node-')),base,engine);let tried=0;
    for(const call of order){const result=analyzeCall(base,call,engine,origin);tried++;if(result)candidates.push(result);if(tried>=5&&candidates.length>=3)break;}
    if(candidates.length<3){
      junctions??=osmJunctions(engine,cityId,city.calls);
      const nearby=candidateOrder(junctions,base,engine,18000);
      for(const call of nearby){const result=analyzeCall(base,call,engine,origin);tried++;if(result)candidates.push(result);if(tried>=5&&candidates.length>=3)break;}
    }
    const selected=chooseChallenges(candidates);
    if(selected.length!==3){exceptions.push({baseId:base.id,service:base.service,reason:'Fewer than 3 meaningful legal named-road alternatives',candidateCount:tried,meaningfulCount:selected.length});continue;}
    for(const result of selected){
      let call=city.calls.find(c=>c.id===result.call.id);if(!call){call=result.call;city.calls.push(call);}
      const alternatives=result.alternatives.map(a=>({roads:routeRoads(a.route),estimatedSeconds:round(a.route.seconds),cost:round(a.route.cost??a.route.seconds),distance:round(a.route.distance),reason:`${a.label}; ${round(a.quality.penalty)} modeled seconds slower; ${Math.round(a.quality.changedDistance)} m of changed geometry`}));
      const challenge={id:`${base.id}:${call.id}`,baseId:base.id,service:base.service,difficulty:result.difficulty,decisionType:result.decisionType,preferredRoads:routeRoads(result.best),alternatives,responseSeconds:round(result.best.seconds),cost:round(result.best.cost??result.best.seconds),distance:round(result.best.distance),reason:challengeReason(base,call,result.best,result.alternatives[0].route,result.decisionType),reviewStatus:'map-derived',graphVersion,costProfileVersion:engine.cost.VERSION};
      (call.routeChallenges??=[]).push(challenge);call.routeAccess=accessRecord(result.destination,call,graph,graphVersion);
      evidence.push({baseId:base.id,service:base.service,callId:call.id,decisionType:result.decisionType,difficulty:result.difficulty,origin:result.origin,destination:result.destination,reference:evidenceRoute(result.best,graph),alternatives:result.alternatives.map(a=>({decisionType:a.type,probe:a.options,quality:Object.fromEntries(Object.entries(a.quality).map(([k,v])=>[k,typeof v==='number'?round(v,4):v])),route:evidenceRoute(a.route,graph)}))});
    }
    coverage.push({baseId:base.id,service:base.service,callIds:selected.map(r=>r.call.id),meaningfulCount:3,decisionTypes:unique(selected.map(r=>r.decisionType)),accessReviewStatus:'needs-facility-review',accessMethod:'nearest-connected-named-public-road',candidateCount:tried,originalCatalogCandidates:order.length,accessDistance:round(anchor.distance||0)});
    process.stdout.write(`${cityId} ${base.id}: 3 meaningful (${tried} candidates)\n`);
  }
  const recognitionPreserved=city.calls.every(c=>!originalTiers.has(c.id)||c.recognitionDifficulty===originalTiers.get(c.id));
  const manifest={schemaVersion:1,cityId,graphVersion,costProfileVersion:engine.cost.VERSION,networkUrl:'route-network.js',baseAccess,coverage,callCount:city.calls.length,challengeCount:evidence.length,baseCount:city.bases.length,meaningfulChallengeCount:evidence.length,recognitionPreserved,reviewComplete:false,reviewStatus:'map-derived',readiness:'candidate-data',source:'OpenStreetMap Ontario snapshot; static apparatus response model',inputs:{network:path.relative(ROOT,file),networkSha256:hash(networkText),originalCallCount:originalTiers.size,activeBaseIds:city.bases.map(b=>b.id),costProfile:engine.cost.VERSION,minimumMeaningfulPenaltySeconds:18,minimumMeaningfulPenaltyRatio:.035,minimumChangedGeometryMeters:120,oppositeDepartureNamedChangedMeters:180,maxCorridorProbes:3},exceptions};
  const report={...manifest,elapsedSeconds:round((Date.now()-start)/1000),routes:evidence};
  if(write){saveCalls(city);fs.writeFileSync(path.join(ROOT,'cities',cityId,'route-data.json'),JSON.stringify(manifest)+'\n');fs.mkdirSync(path.join(ROOT,'outputs/ontario-route-curation'),{recursive:true});fs.writeFileSync(path.join(ROOT,'outputs/ontario-route-curation',cityId+'.json'),JSON.stringify(report)+'\n');}
  return report;
}
function main(){
  const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1],cityId=args.includes('--city')?value('--city'):'all',write=args.includes('--write');
  const ids=cityId==='all'?fs.readdirSync(path.join(ROOT,'cities')).filter(id=>fs.existsSync(path.join(ROOT,'cities',id,'geo-data.json'))||id==='peterborough'):[cityId];
  let errors=0;
  for(const id of ids){try{if(args.includes('--finalize-only')){console.log(JSON.stringify(finalizeCityMetadata(id)));continue;}const report=buildCity(id,{write,networkFile:args.includes('--network')?path.resolve(value('--network')):undefined});console.log(JSON.stringify({cityId:id,bases:report.baseCount,covered:report.coverage.length,challenges:report.challengeCount,calls:report.callCount,exceptions:report.exceptions,elapsedSeconds:report.elapsedSeconds}));if(report.exceptions.length)errors++;}catch(error){console.error(id+': '+error.stack);errors++;}}
  if(errors)process.exitCode=1;
}
if(require.main===module)main();
module.exports={loadEngine,loadCity,saveCalls,buildCity,finalizeCityMetadata,challengeReason,changedGeometry,assessAlternative,challengeDifficulty,chooseChallenges,routeRoads,probeOptions};
