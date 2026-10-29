'use strict';
// Append independently sourced civic training exercises to existing profiles.
const fs=require('node:fs'),path=require('node:path');
const data=require('./route-response-data.cjs'),trace=require('../route-mapping/trace-core.js');
const {dijkstra,costToAnchor}=require('./build-local-response-calls.cjs');
const round=(n,p=1)=>Math.round(n*10**p)/10**p;
function withinRouteLowerBound(api,origin,target,limit){
 const a=api.toXY(origin.lat,origin.lng),b=api.toXY(target.lat,target.lng);
 return Math.hypot(a.x-b.x,a.y-b.y)<=limit+1e-6;
}
function computeDirectedCosts(api,origins,targets,onIndex,metric='weight',limit=15000){
 return origins.map((origin,i)=>{
  const index=dijkstra(api,[origin],metric,limit);
  const row=Float64Array.from(targets,target=>target?costToAnchor(api,index,target,metric):Infinity);
  if(onIndex)onIndex(index,i);
  return row;
 });
}
const addressKey=s=>String(s||'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
const priorityFamilies={
 care:new Set(['hospital','clinic','doctors','healthcare','care-home','long-term-care','nursing_home','hospice']),
 education:new Set(['school','kindergarten','childcare','university','college','post-secondary']),
 multiunit:new Set(['apartments','dormitory','hotel']),
 industrial:new Set(['industrial','warehouse','manufacture','factory','works']),
 assembly:new Set(['community_centre','library','townhall','municipal-facility','museum','theatre','cinema','arts_centre','place_of_worship','sports_centre','stadium','social_centre','public','civic'])
};
function priorityFamily(location){
 const type=String(location.facilityType||'').toLowerCase();
 if(type==='healthcare'&&/pharma|\brx\b|dental|dentist|optometr|hearing|massage|chiropract|physiotherap|veterinar/i.test(location.name||''))return null;
 return Object.keys(priorityFamilies).find(key=>priorityFamilies[key].has(type))||null;
}
function selectAssignments(candidates,options={}){
 const firstLimit=options.firstDueLimit??6,supportLimit=options.supportPerBase??2,callLimit=options.supportPerCall??2,max=options.maxSupportMetres??6500;
 const order=(a,b)=>a.distance-b.distance||a.canonical.id.localeCompare(b.canonical.id)||a.baseId.localeCompare(b.baseId);
 const out=[],used=new Map(),types=new Map(),families=new Map(),firstCounts=new Map();
 const add=c=>{out.push(c);if(!used.has(c.baseId))used.set(c.baseId,new Set());used.get(c.baseId).add(addressKey(c.canonical.addr));};
 const first=candidates.filter(c=>c.baseId===c.primaryBaseId).sort(order);
 for(const base of [...new Set(first.map(c=>c.baseId))].sort()){
  const pool=first.filter(c=>c.baseId===base),chosen=[];types.set(base,new Set());families.set(base,new Set());
  while(chosen.length<firstLimit){
   const eligible=pool.filter(c=>!chosen.includes(c)&&!used.get(base)?.has(addressKey(c.canonical.addr)));
   const rank=c=>{const family=priorityFamily(c.canonical);return family&&!families.get(base).has(family)?0:!types.get(base).has(c.canonical.facilityType)?1:2;};
   eligible.sort((a,b)=>rank(a)-rank(b)||order(a,b));
   const next=eligible[0];if(!next)break;chosen.push(next);add(next);types.get(base).add(next.canonical.facilityType);const family=priorityFamily(next.canonical);if(family)families.get(base).add(family);
  }
  firstCounts.set(base,chosen.length);
 }
 const selectedIds=new Set(out.map(c=>c.service+'\0'+c.canonical.id+'\0'+c.primaryBaseId));
 const supports=new Map(),perCall=new Map();
 for(const c of candidates.filter(c=>c.service==='fire'&&c.canonical.incidentProfiles?.fire?.sub==='Structure Fire'&&c.baseId!==c.primaryBaseId&&c.distance<=max&&selectedIds.has(c.service+'\0'+c.canonical.id+'\0'+c.primaryBaseId)).sort(order)){
  const key=c.canonical.id+'\0'+c.primaryBaseId;
  if((supports.get(c.baseId)||0)>=supportLimit||(perCall.get(key)||0)>=callLimit||used.get(c.baseId)?.has(addressKey(c.canonical.addr)))continue;
  add(c);supports.set(c.baseId,(supports.get(c.baseId)||0)+1);perCall.set(key,(perCall.get(key)||0)+1);
 }
 return out;
}
function allocatePrimaryAssignments(candidates,options={}){
 const groups=new Map(),target=options.targetPerBase??6;
 for(const c of candidates){const key=c.service+'\0'+c.canonical.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
 const eligible=g=>g.filter(c=>c.primaryEligible).sort((a,b)=>a.costs.own-b.costs.own||a.baseId.localeCompare(b.baseId));
 const ordered=[...groups.values()].sort((a,b)=>eligible(a).length-eligible(b).length||a[0].service.localeCompare(b[0].service)||a[0].canonical.id.localeCompare(b[0].canonical.id));
 // A residual network ensures each location and each address at a hall use
 // at most one slot. Increasing hall capacities one at a time balances the
 // reservation while augmenting paths repair earlier tie choices.
 const graph=[[],[]],source=0,sink=1,baseNodes=new Map(),addressNodes=new Map(),assignmentEdges=new Map(),baseSinkEdges=[];
 const node=()=>{graph.push([]);return graph.length-1;};
 function edge(from,to,cap){const f={to,cap,reverse:graph[to].length},r={to:from,cap:0,reverse:graph[from].length};graph[from].push(f);graph[to].push(r);return f;}
 for(const group of ordered){
  const gn=node();edge(source,gn,1);const links=[];
  for(const c of eligible(group)){
   let bn=baseNodes.get(c.baseId);if(bn===undefined){bn=node();baseNodes.set(c.baseId,bn);baseSinkEdges.push(edge(bn,sink,0));}
   const address=c.baseId+'\0'+addressKey(group[0].canonical.addr);let an=addressNodes.get(address);
   if(an===undefined){an=node();addressNodes.set(address,an);edge(an,bn,1);}
   links.push({baseId:c.baseId,edge:edge(gn,an,1)});
  }
  assignmentEdges.set(group,links);
 }
 function saturate(){for(;;){const level=new Int32Array(graph.length);level.fill(-1);level[source]=0;const queue=[source];for(let n=0;n<queue.length;n++)for(const e of graph[queue[n]])if(e.cap>0&&level[e.to]<0){level[e.to]=level[queue[n]]+1;queue.push(e.to);}if(level[sink]<0)return;
  const next=new Int32Array(graph.length);function send(v){if(v===sink)return true;for(;next[v]<graph[v].length;next[v]++){const e=graph[v][next[v]];if(e.cap>0&&level[e.to]===level[v]+1&&send(e.to)){e.cap--;graph[e.to][e.reverse].cap++;return true;}}return false;}
  while(send(source)){}
 }}
 for(let n=0;n<target;n++){for(const e of baseSinkEdges)e.cap++;saturate();}
 const assigned=new Map(),counts=new Map();
 for(const group of ordered){const used=assignmentEdges.get(group).find(x=>x.edge.cap===0);if(used){assigned.set(group,used.baseId);counts.set(used.baseId,(counts.get(used.baseId)||0)+1);}}
 // Keep remaining candidates available for diversity and support selection.
 for(const group of ordered)if(!assigned.has(group)){
  const choices=eligible(group).sort((a,b)=>(counts.get(a.baseId)||0)-(counts.get(b.baseId)||0)||a.costs.own-b.costs.own||a.baseId.localeCompare(b.baseId));
  if(choices[0]){assigned.set(group,choices[0].baseId);counts.set(choices[0].baseId,(counts.get(choices[0].baseId)||0)+1);}
 }
 for(const group of ordered){const primary=assigned.get(group)??null;for(const c of group)c.primaryBaseId=primary;}
 return candidates;
}
function selectValidatedAssignments(candidates,options,validate){
 let pool=[...candidates];const checked=new Set();
 for(;;){
  if(options.balancePrimaries)allocatePrimaryAssignments(pool,options);
  const selected=selectAssignments(pool,options);
  // Validate near ties too: each indexed distance may differ from trace by up to 1 cm.
  const cap=options.maxSupportMetres??6500;
  const pending=pool.filter(c=>!checked.has(c)&&(selected.some(s=>Math.abs(c.distance-s.distance)<=.020001)||(c.service==='fire'&&c.baseId!==c.primaryBaseId&&Math.abs(c.distance-cap)<=.010001)));
  if(!pending.length)return selected;
  for(const c of pending){checked.add(c);if(!validate(c))pool=pool.filter(item=>item!==c);}
 }
}
function quality(api,base,call,route,weighted,ownership,target,origin,costs){
 const analysis=api.analyzeDecisionDifficulty(api.scoreCall(call,route),base);
 return {routeMetres:round(route.distance),meaningfulDecisions:analysis.meaningfulForks,maxAlternativePenaltyMetres:round(Math.max(0,...analysis.traps.map(t=>t.penalty))),decisionKinds:[...new Set(analysis.traps.map(t=>t.kind))],departureRoad:route.edges[0]?.name||origin.road,estimatedCostSeconds:round(costs?.own??costToAnchor(api,weighted,target)),bestSameServiceCostSeconds:round(costs?.best??costToAnchor(api,ownership,target))};
}
async function buildCity(city,options={}){
 const {training,bases,roads,areas}=await data.loadCity(city);if(options.locations)training.sharedLocations=options.locations;const manifest=training.routeResponses;
 if(!manifest)throw Error(city.id+': missing local response manifest');
 const api=data.app(city,training,bases);api.state.routeResponses=manifest;api.state.calls=training.routeCalls;api.state.graph=api.buildGraph(roads);
 api.state.traceCore=trace.createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
 api.state.tuning=api.normalizeTuning(null);api.state.skillProfile=api.normalizeSkillProfile(null);
 const profiles=new Map(manifest.bases.map(p=>[p.baseId,p])),calls=new Map(training.routeCalls.map(c=>[c.id,c])),candidates=[];
 // Rebuild is idempotent: existing generated civic exercises are replaced by the same IDs.
 const previous=new Set(training.routeCalls.filter(c=>c.responseAssignment?.generator==='civic-v1').map(c=>c.id));
 training.routeCalls=training.routeCalls.filter(c=>!previous.has(c.id));for(const id of previous)calls.delete(id);for(const p of manifest.bases)p.callIds=p.callIds.filter(id=>!previous.has(id));
 const canonical=(training.sharedLocations||[]).filter(c=>c.cityId===city.id&&c.locationKind==='sourced-address'&&c.geographicVerificationRef&&c.id&&c.addr&&Array.isArray(c.sources)&&c.sources.length&&c.sources.every(url=>/^https:\/\//.test(url))&&Number.isFinite(c.lat)&&Number.isFinite(c.lng));
 for(const service of ['fire','ems']){
  api.state.service=service;const bs=bases.filter(b=>b.service===service&&!profiles.get(b.id)?.unavailable),origins=bs.map(b=>api.baseAnchor(b,service));
  if(origins.some(x=>!x))throw Error(city.id+': missing hall access');
  const ownership=dijkstra(api,origins,'weight'),targets=canonical.map(location=>location.incidentProfiles?.[service]?api.state.traceCore.snap(location,80):null);
  const weighted=computeDirectedCosts(api,origins,targets,(index,i)=>{
   if(!options.refreshMetrics)return;const base=bs[i],p=profiles.get(base.id);api.state.base=base;
   for(const id of p.callIds){const c=calls.get(id),target=api.state.traceCore.snap(c,120),route=target&&api.state.traceCore.between(origins[i],target,{maxDistance:15000});if(!route)throw Error(id+': cannot refresh route');c.routeQuality=quality(api,base,c,route,index,ownership,target,origins[i]);}
  });
  const distances=computeDirectedCosts(api,origins,targets,null,'distance',6500.01);
  const fixedAddresses=bs.map(b=>new Set(profiles.get(b.id).callIds.map(id=>addressKey(calls.get(id)?.addr))));
  for(let ci=0;ci<canonical.length;ci++){
   const location=canonical[ci],target=targets[ci];if(!target)continue;
   const owners=[];
   for(let i=0;i<bs.length;i++){
    const features=service==='fire'?data.featuresForBase(areas,bs[i]):[],own=weighted[i][ci],best=costToAnchor(api,ownership,target);
    if(Number.isFinite(own)&&(features.length?features.some(f=>data.inside(location,f.geometry)):own<=best+manifest.model.ownershipToleranceSeconds+.01))owners.push({i,cost:own});
   }
   owners.sort((a,b)=>a.cost-b.cost||bs[a.i].id.localeCompare(bs[b.i].id));if(!owners.length||!Number.isFinite(owners[0].cost))continue;
   const indices=service==='fire'&&location.incidentProfiles.fire.sub==='Structure Fire'?bs.map((_,i)=>i):owners.map(o=>o.i);
   for(const i of indices){
    if(fixedAddresses[i].has(addressKey(location.addr)))continue;
    const origin=origins[i];if(!withinRouteLowerBound(api,origin,target,6500.01)||distances[i][ci]>6500.01||distances[i][ci]<179.99)continue;
    candidates.push({canonical:location,service,baseId:bs[i].id,primaryBaseId:null,primaryEligible:owners.some(o=>o.i===i),distance:distances[i][ci],target,origin,costs:{own:weighted[i][ci],best:costToAnchor(api,ownership,target)}});
   }
  }
 }
 const selected=selectValidatedAssignments(candidates,{balancePrimaries:true},c=>{
  const route=api.state.traceCore.between(c.origin,c.target,{maxDistance:6500});
  if(!route||route.distance<180||route.distance>6500||!api.state.traceCore.finish(route,c.target,40).complete)return false;
  if(Math.abs(route.distance-c.distance)>.01)throw Error(`${city.id}/${c.baseId}/${c.canonical.id}: directed distance differs from production trace by ${Math.abs(route.distance-c.distance)} m`);
  c.distance=route.distance;const profile=profiles.get(c.baseId);
  return profile.callIds.some(id=>{const next=api.state.traceCore.snap(calls.get(id),120),r=next&&api.state.traceCore.between(c.target,next,{maxDistance:profile.maxRouteMetres});return r&&r.distance>0;});
 }),byBase=new Map(bases.map(b=>[b.id,b]));
 for(const c of selected){
  const base=byBase.get(c.baseId),profile=profiles.get(c.baseId),sub=c.canonical.incidentProfiles[c.service].sub,id=`route-civic-${c.baseId.length}-${encodeURIComponent(c.baseId)}-${encodeURIComponent(c.canonical.id)}`;
  if(calls.has(id))throw Error('duplicate civic exercise '+id);
  const call={...c.canonical,id,canonicalCallId:c.canonical.id,routeBaseId:c.baseId,trainingServices:[c.service],main:c.service==='fire'?'Fire':'Medical',sub,incidentProfiles:{[c.service]:{sub}},simulatedIncident:true,responseAssignment:{generator:'civic-v1',role:c.baseId===c.primaryBaseId?'first-due':'support',primaryBaseId:c.primaryBaseId}};
  api.state.service=c.service;api.state.base=base;const route=api.state.traceCore.between(c.origin,c.target,{maxDistance:6500});if(!route)throw Error(id+': selected route changed');
  call.routeQuality=quality(api,base,call,route,null,null,c.target,c.origin,c.costs);call.routeDifficulty=api.analyzeDecisionDifficulty(api.scoreCall(call,route),base).score;
  training.routeCalls.push(call);profile.callIds.push(id);calls.set(id,call);
 }
 for(const p of manifest.bases){if(p.unavailable)continue;const local=p.callIds.map(id=>calls.get(id));p.maxRouteMetres=Math.min(15000,Math.max(p.maxRouteMetres,Math.ceil((Math.max(...local.map(c=>c.routeQuality.routeMetres))*2.15+250)/100)*100));p.challengeCalls=local.filter(c=>c.routeQuality.meaningfulDecisions>0).length;if(p.challengeCalls<3)p.challengeNote='Local street topology provides fewer than three distinct route-choice challenges; response-area locality takes priority.';else delete p.challengeNote;}
 manifest.civicResponses={schemaVersion:1,firstDuePerBase:6,supportPerBase:2,supportPerCall:2,maxSupportRouteMetres:6500,description:'Estimated training assignments only; not official run cards or mutual aid. Eligible modeled cost ties are allocated to balance first-due training coverage.'};
 if(options.outputDir){fs.mkdirSync(options.outputDir,{recursive:true});fs.writeFileSync(path.join(options.outputDir,city.id+'.json'),JSON.stringify(training,null,2)+'\n');}
 else if(!options.dryRun)throw Error('Specify an output directory; production writes are deliberately disabled.');
 return {city:city.id,canonical:canonical.length,firstDue:selected.filter(c=>c.baseId===c.primaryBaseId).length,support:selected.filter(c=>c.baseId!==c.primaryBaseId).length};
}
async function main(){const cityId=process.env.PTBO_RESPONSE_CITY,outputDir=process.env.PTBO_RESPONSE_OUTPUT;if(!cityId||cityId.includes(','))throw Error('Set PTBO_RESPONSE_CITY to one city');const city=data.registry.find(c=>c.id===cityId&&c.modes.route);if(!city)throw Error('Unknown route city');console.log(JSON.stringify(await buildCity(city,{outputDir,dryRun:process.env.PTBO_RESPONSE_DRY_RUN==='1',refreshMetrics:process.env.PTBO_RESPONSE_REFRESH_METRICS==='1',locations:process.env.PTBO_CIVIC_LOCATIONS?JSON.parse(fs.readFileSync(process.env.PTBO_CIVIC_LOCATIONS)):undefined})));}
module.exports={selectAssignments,allocatePrimaryAssignments,selectValidatedAssignments,buildCity,withinRouteLowerBound,computeDirectedCosts};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
