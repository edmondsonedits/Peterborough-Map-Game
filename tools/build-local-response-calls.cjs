'use strict';
// Offline generation: never broadens a hall's calls to the citywide catalog.
// Node22, no external dependencies. Sources remain in the city package.
const fs=require('node:fs'),path=require('node:path');
const data=require('./route-response-data.cjs'),trace=require('../route-mapping/trace-core.js');
const round=(n,p=1)=>Math.round(n*10**p)/10**p;
function starts(graph,anchor,metric){
 const s=graph.segments[anchor.segmentId],factor=metric==='weight'?(graph.nodes[s.from].edges.find(e=>e.segmentId===s.id)||graph.nodes[s.to].edges.find(e=>e.segmentId===s.id)).weight/s.length:1;
 return [...(s.forward?[{id:s.to,cost:(1-anchor.t)*s.length*factor}]:[]),...(s.backward?[{id:s.from,cost:anchor.t*s.length*factor}]:[]),...(anchor.t===0?[{id:s.from,cost:0}]:[]),...(anchor.t===1?[{id:s.to,cost:0}]:[])];
}
function dijkstra(api,anchors,metric,limit=Infinity,stop){
 const graph=api.state.graph,distances=new Float64Array(graph.nodes.length),owners=new Int16Array(graph.nodes.length),heap=new api.MinHeap();distances.fill(Infinity);owners.fill(-1);
 anchors.forEach((anchor,owner)=>{for(const {id,cost} of starts(graph,anchor,metric))if(cost<distances[id]){distances[id]=cost;owners[id]=owner;heap.push({id,score:cost});}});
 while(heap.size){
  const current=heap.pop();if(current.score>distances[current.id]+1e-7)continue;
  if(current.score>limit)break;if(stop?.(current.id,current.score))break;
  for(const edge of graph.nodes[current.id].edges){const cost=current.score+edge[metric];if(cost>limit||cost>=distances[edge.to]-1e-7)continue;distances[edge.to]=cost;owners[edge.to]=owners[current.id];heap.push({id:edge.to,score:cost});}
 }
 return {distances,owners,anchors};
}
function costToAnchor(api,index,anchor,metric='weight'){
 const graph=api.state.graph,s=graph.segments[anchor.segmentId],factor=metric==='weight'?(graph.nodes[s.from].edges.find(e=>e.segmentId===s.id)||graph.nodes[s.to].edges.find(e=>e.segmentId===s.id)).weight/s.length:1;
 let cost=Math.min(anchor.t===0?index.distances[s.from]:s.forward?index.distances[s.from]+anchor.t*s.length*factor:Infinity,anchor.t===1?index.distances[s.to]:s.backward?index.distances[s.to]+(1-anchor.t)*s.length*factor:Infinity);
 for(const origin of index.anchors||[])if(origin.segmentId===anchor.segmentId){const delta=anchor.t-origin.t;if(Math.abs(delta)<1e-9||delta>0&&s.forward||delta<0&&s.backward)cost=Math.min(cost,Math.abs(delta)*s.length*factor);}
 return cost;
}
function findAccess(api,base,candidates){
 const xy=api.toXY(base.spawnLat,base.spawnLng),possible=[];
 for(const id of api.nearbySegments(xy.x,xy.y,260)){
  const s=api.state.graph.segments[id],p=api.projectToSegment(xy.x,xy.y,s);
  if(p.distance<=260)possible.push({...api.toLatLng(p.x,p.y),segmentId:id,t:p.t,distance:p.distance,road:s.name,highway:s.highway});
 }
 possible.sort((a,b)=>a.distance-b.distance||a.segmentId-b.segmentId);
 const nodes=new Set(candidates.map(c=>c.nodeId)),tested=new Set();
 for(const anchor of possible){
  const s=api.state.graph.segments[anchor.segmentId],key=[s.from,s.to].sort((a,b)=>a-b).join('-');if(tested.has(key))continue;tested.add(key);let found=0;
  dijkstra(api,[anchor],'distance',12000,(id,cost)=>cost>180&&nodes.has(id)&&++found>=3);
  if(found>=3)return anchor;
 }
 throw Error(base.id+': no mapped access within260m reaching three local intersections');
}
const fireIncidents=['Motor Vehicle Collision','Vehicle Fire','Outdoor Fire'];
const emsIncidents=['Medical Assistance','Motor Vehicle Collision','Pedestrian Injury'];
function junctionCall(candidate,service,index){
 const sub=(service==='fire'?fireIncidents:emsIncidents)[index%3],addr=candidate.names.join(' & ');
 return {name:addr,addr,lat:candidate.lat,lng:candidate.lng,radius:40,main:service==='fire'?'Fire':'Medical',sub,incidentProfiles:{[service]:{sub}},trainingServices:[service],simulatedIncident:true,locationKind:'mapped-intersection',osmWays:candidate.ways,sources:candidate.ways.map(id=>'https://www.openstreetmap.org/'+id),_node:candidate.nodeId,_kind:'junction'};
}
async function buildCity(city){
 const began=Date.now(),{training,bases,calls,roads,areas}=await data.loadCity(city),api=data.app(city,training,bases);
 if(city.id==='peterborough'){
  const source=JSON.parse(fs.readFileSync(path.join(data.root,'city-explorer/data/peterborough-osm.json'))),nodes=new Map(source.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
  for(const e of source.elements){
   const tags=e.tags||{};if(!tags['addr:housenumber']||!tags['addr:street'])continue;
   const coords=e.type==='node'?[e]:(e.geometry||e.nodes?.map(id=>nodes.get(id))||[]).filter(p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon));if(!coords.length)continue;
   calls.push({id:`osm-address-${e.type}-${e.id}`,name:tags.name||tags['addr:housenumber']+' '+tags['addr:street'],addr:tags['addr:housenumber']+' '+tags['addr:street'],lat:coords.reduce((n,c)=>n+c.lat,0)/coords.length,lng:coords.reduce((n,c)=>n+c.lon,0)/coords.length,incidentProfiles:{fire:{sub:'Structure Fire'},ems:{sub:'Medical Assistance'}},sources:[`https://www.openstreetmap.org/${e.type}/${e.id}`]});
  }
 }
 api.state.graph=api.buildGraph(roads);api.state.traceCore=trace.createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
 const junctions=data.intersectionCandidates(roads,api),scc=data.components(api.state.graph),origins=new Map(),official=new Map();
 for(const base of bases){
  const features=base.service==='fire'?data.featuresForBase(areas,base):[];official.set(base.id,features);
  const local=junctions.filter(c=>!features.length||features.some(f=>data.inside(c,f.geometry)));
  origins.set(base.id,findAccess(api,base,local));
 }
 const manifest={schemaVersion:1,minCallsPerBase:3,targetCallsPerBase:6,generatedOn:'2026-10-17',model:{description:'Published first-due polygons where available. Otherwise a directed road-network estimate using road class travel cost from every same-service hall; allows a15second cost tie for overlapping nearby halls. This is training geography, not live dispatch advice.',ownershipToleranceSeconds:15,maximumCandidateRouteMetres:12000},...(areas?{officialAreasUrl:`cities/${city.id}/response-areas.geojson`,officialSource:areas.source}:{}),bases:[]};
 const routeCalls=[];api.state.routeResponses=manifest;api.state.tuning=api.normalizeTuning(null);api.state.skillProfile=api.normalizeSkillProfile(null);
 for(const service of ['fire','ems']){
  const serviceBases=bases.filter(b=>b.service===service),ownership=dijkstra(api,serviceBases.map(b=>origins.get(b.id)),'weight');
  for(let bi=0;bi<serviceBases.length;bi++){
   const base=serviceBases[bi],origin=origins.get(base.id),features=official.get(base.id),weighted=dijkstra(api,[origin],'weight',1500),shortest=dijkstra(api,[origin],'distance',12000);
   const belongs=point=>features.length?features.some(f=>data.inside(point,f.geometry)):weighted.distances[point.nodeId]<=ownership.distances[point.nodeId]+15.00001;
   const local=junctions.filter(c=>shortest.distances[c.nodeId]>=180&&shortest.distances[c.nodeId]<=12000&&belongs(c));
   if(local.length<3)throw Error(`${city.id}/${base.id}: only${local.length} local junctions in response area`);
   const profile={baseId:base.id,service,number:base.number,name:base.name,method:features.length?'official-run-area':'modeled-road-response',...(features.length?{sourceUrl:areas.source.url,areaCode:String(base.number)}:{}),maxRouteMetres:12000,access:{lat:origin.lat,lng:origin.lng,road:origin.road,gapMetres:round(origin.distance)},callIds:[]};manifest.bases.push(profile);api.state.service=service;api.state.base=base;
   // Nearby named junctions plus a few existing sourced civic/care locations.
   const candidates=local.map((c,i)=>({...junctionCall(c,service,i),_distance:shortest.distances[c.nodeId]}));
   for(const call of calls){
    if(call.id.startsWith('route-base-')||call.trainingServices&&!call.trainingServices.includes(service))continue;
    if(!call.sources?.length||!call.sources.every(url=>/^https:\/\//.test(url)))continue;
    if(!call.incidentProfiles?.[service]&&call.main!==(service==='fire'?'Fire':'Medical'))continue;
    const snap=api.state.traceCore.snap(call,120);if(!snap)continue;
    const segment=api.state.graph.segments[snap.segmentId],nodeId=segment.from,point={...call,nodeId},metres=costToAnchor(api,shortest,snap,'distance'),ownCost=costToAnchor(api,weighted,snap),bestCost=costToAnchor(api,ownership,snap);
    if(!Number.isFinite(metres)||metres<250||metres>6500||!(features.length?features.some(f=>data.inside(point,f.geometry)):ownCost<=bestCost+15.00001))continue;
    const sub=call.incidentProfiles?.[service]?.sub||call.sub||'Medical Assistance';
    candidates.push({...call,main:service==='fire'?'Fire':'Medical',sub,incidentProfiles:{[service]:{sub}},trainingServices:[service],simulatedIncident:true,canonicalCallId:call.id,locationKind:'sourced-address',_node:nodeId,_kind:'civic',_distance:metres});
   }
   const nearest=local.map(c=>shortest.distances[c.nodeId]).sort((a,b)=>a-b),localLimit=Math.min(12000,Math.max(2800,nearest[Math.min(15,nearest.length-1)]*1.25));
   const within=candidates.filter(c=>c._distance<=localLimit),center=api.toXY(base.lat,base.lng);
   const sector=c=>{const xy=api.toXY(c.lat,c.lng);return Math.floor((Math.atan2(xy.y-center.y,xy.x-center.x)+Math.PI)*8/(2*Math.PI))%8;};
   const shortlist=[],used=new Set();
   const add=c=>{if(c&&!used.has(c)){shortlist.push(c);used.add(c);}};
   // Spread the shortlist across directions and near/middle/far local journeys,
   // instead of filling every slot with the closest block around the station.
   for(const target of [800,1700,2600])for(let bearing=0;bearing<8;bearing++){
    const group=within.filter(c=>c._kind==='junction'&&sector(c)===bearing&&!used.has(c));
    group.sort((a,b)=>Math.abs(a._distance-target)-Math.abs(b._distance-target)||a.addr.localeCompare(b.addr));add(group[0]);
   }
   within.filter(c=>c._kind==='civic').sort((a,b)=>(b.facilityType==='long-term-care')-(a.facilityType==='long-term-care')||a._distance-b._distance).slice(0,8).forEach(add);
   within.sort((a,b)=>a._distance-b._distance).slice(0,12).forEach(add);
   const tested=[],selected=[];let civicCount=0;
   const accept=c=>{
    const xy=api.toXY(c.lat,c.lng);return !selected.some(p=>{const z=api.toXY(p.lat,p.lng);return Math.hypot(xy.x-z.x,xy.y-z.y)<140||p.addr===c.addr;});
   };
   for(const candidate of shortlist.slice(0,64)){
    if(tested.length>=36&&tested.filter(c=>c._quality.meaningfulDecisions>0).length>=6)break;
    const destination=api.state.traceCore.snap(candidate,120),exits=destination?data.exits(api.state.graph,destination,false):[];
    // A one-way terminal can be reached but cannot serve as a previous-call
    // origin. Keep only destinations with legal onward access to another real
    // junction in this same hall's response area.
    if(!local.some(c=>Math.hypot(c.lat-candidate.lat,(c.lng-candidate.lng)*.7)>.001&&exits.some(id=>scc.canReach(id,c.nodeId))))continue;
    const route=destination&&api.state.traceCore.between(origin,destination,{maxDistance:12000});
    if(!route||route.distance<180||route.distance>localLimit)continue;
    const scored=api.scoreCall(candidate,route),analysis=api.analyzeDecisionDifficulty(scored,base);
    const quality={routeMetres:round(route.distance),meaningfulDecisions:analysis.meaningfulForks,maxAlternativePenaltyMetres:round(Math.max(0,...analysis.traps.map(t=>t.penalty))),decisionKinds:[...new Set(analysis.traps.map(t=>t.kind))],departureRoad:route.edges[0]?.name||origin.road,estimatedCostSeconds:round(costToAnchor(api,weighted,destination)),bestSameServiceCostSeconds:round(costToAnchor(api,ownership,destination))};
    tested.push({...candidate,_quality:quality,_analysis:analysis});
   }
   // Preserve locality, then select direction/turn challenges and varied destinations.
   const chooseScore=(c,index)=>{
    const xy=api.toXY(c.lat,c.lng),separation=selected.length?Math.min(...selected.map(p=>{const z=api.toXY(p.lat,p.lng);return Math.hypot(xy.x-z.x,xy.y-z.y);})):0;
    const target=[800,1800,2500,1200,2200,1600][index];
    return (c._quality.meaningfulDecisions>0?100:0)+(c._kind==='civic'?12:0)+Math.min(2200,separation)*.015-Math.abs(c._distance-target)*.012;
   };
   for(let index=0;index<6;index++){
    const eligible=tested.filter(c=>!selected.includes(c)&&accept(c)&&!(c._kind==='civic'&&civicCount>=2));
    eligible.sort((a,b)=>chooseScore(b,index)-chooseScore(a,index)||a.addr.localeCompare(b.addr));
    const c=eligible[0];if(!c)break;selected.push(c);if(c._kind==='civic')civicCount++;
   }
   if(selected.length<3)for(const c of tested){if(selected.length>=3)break;if(!selected.includes(c)&&!selected.some(p=>p.addr===c.addr))selected.push(c);}
   if(selected.length<3)throw Error(`${city.id}/${base.id}: only${selected.length} separated, verified routes`);
   profile.maxRouteMetres=Math.min(15000,Math.ceil((Math.max(...selected.map(c=>c._quality.routeMetres))*2.15+250)/100)*100);
   profile.challengeCalls=selected.filter(c=>c._quality.meaningfulDecisions>0).length;
   if(profile.challengeCalls<3)profile.challengeNote='Local street topology provides fewer than three distinct route-choice challenges; response-area locality takes priority.';
   selected.forEach((candidate,index)=>{
    const {_node,_distance,_kind,_quality,_analysis,...call}=candidate;delete call.id;delete call.trainingServices;const id=`route-local-${base.id}-${String(index+1).padStart(2,'0')}`;
    routeCalls.push({...call,id,routeBaseId:base.id,trainingServices:[service],routeQuality:_quality});profile.callIds.push(id);
   });
   console.log(JSON.stringify({city:city.id,base:base.id,calls:selected.length,challenges:profile.challengeCalls,furthest:Math.max(...selected.map(c=>c._quality.routeMetres)),method:profile.method}));
  }
 }
 training.routeResponses=manifest;training.routeCalls=routeCalls;
 fs.writeFileSync(path.join(data.root,`cities/${city.id}/training-data.json`),JSON.stringify(training,null,2)+'\n');
 console.log(JSON.stringify({city:city.id,halls:bases.length,calls:routeCalls.length,ms:Date.now()-began}));return {city:city.id,halls:bases.length,calls:routeCalls.length};
}
async function main(){
 for(const city of data.registry.filter(c=>c.modes.route&&(!process.env.PTBO_RESPONSE_CITY||process.env.PTBO_RESPONSE_CITY.split(',').includes(c.id))))await buildCity(city);
}
module.exports={dijkstra,starts,costToAnchor,findAccess,buildCity};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
