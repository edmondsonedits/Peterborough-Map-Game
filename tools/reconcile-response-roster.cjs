'use strict';
// Retain valid exercise identities when a verified station roster/access changes.
// The freshly generated descriptor supplies replacement destinations, never
// silently reuses an old exercise ID for a different address, and writes scratch.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const data=require('./route-response-data.cjs'),trace=require('../route-mapping/trace-core.js');
const {dijkstra,costToAnchor}=require('./build-local-response-calls.cjs');

function reconcile(previous,fresh,decisions){
 const training=structuredClone(previous),oldProfiles=new Map(previous.routeResponses.bases.map(b=>[b.baseId,b]));
 const oldCalls=new Map(previous.routeCalls.map(c=>[c.id,c])),newCalls=new Map(fresh.routeCalls.map(c=>[c.id,c]));
 const calls=[],profiles=[],retired=[],added=[];
 for(const freshProfile of fresh.routeResponses.bases){
  const prior=oldProfiles.get(freshProfile.baseId),profile={...structuredClone(freshProfile),callIds:[]};
  const local=[];
  for(const id of prior?.callIds||[]){
   const call=oldCalls.get(id),decision=decisions.get(id);
   if(decision?.valid){
    const retained=structuredClone(call);
    if(call.locationKind==='mapped-intersection'&&decision.sourceWays){retained.osmWays=[...decision.sourceWays];retained.sources=retained.osmWays.map(id=>'https://www.openstreetmap.org/'+id);}
    local.push(retained);
   }
   else retired.push({id,baseId:profile.baseId,address:call?.addr,reason:decision?.reason||'not-revalidated'});
  }
  for(const id of freshProfile.callIds){
   if(local.length>=Math.max(6,prior?.callIds.length||0))break;
   const candidate=newCalls.get(id);
   if(local.some(c=>c.addr.toLowerCase()===candidate.addr.toLowerCase()))continue;
   const call=structuredClone(candidate);
   if(oldCalls.has(id)&&JSON.stringify([oldCalls.get(id).addr,oldCalls.get(id).lat,oldCalls.get(id).lng])!==JSON.stringify([call.addr,call.lat,call.lng])){
    const hash=crypto.createHash('sha256').update(JSON.stringify([call.addr,call.lat,call.lng])).digest('hex').slice(0,12);
    call.id=`route-roster-${profile.baseId}-${hash}`;
   }
   local.push(call);added.push({id:call.id,baseId:profile.baseId,address:call.addr});
  }
  if(local.length<3)throw Error(profile.baseId+': fewer than three validated local destinations');
  profile.maxRouteMetres=Math.max(profile.maxRouteMetres,prior?.maxRouteMetres||0);
  profile.callIds=local.map(c=>c.id);profiles.push(profile);calls.push(...local);
 }
 for(const prior of previous.routeResponses.bases)if(!profiles.some(p=>p.baseId===prior.baseId)){
  for(const id of prior.callIds)retired.push({id,baseId:prior.baseId,address:oldCalls.get(id)?.addr,reason:'base-no-longer-selectable'});
 }
 if(new Set(calls.map(c=>c.id)).size!==calls.length)throw Error('Reconciliation produced duplicate exercise IDs');
 training.routeResponses={...previous.routeResponses,...fresh.routeResponses,bases:profiles};training.routeCalls=calls;
 return {training,report:{retained:calls.filter(c=>oldCalls.has(c.id)).length,added,retired}};
}

async function run(city,fresh,outputDir){
 const {training,bases,roads,areas}=await data.loadCity(city),api=data.app(city,training,bases),decisions=new Map();
 api.state.routeResponses=fresh.routeResponses;api.state.graph=api.buildGraph(roads);
 api.state.traceCore=trace.createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
 const junctions=new Map(data.intersectionCandidates(roads,api).map(c=>[api.keyCoord(c.lng,c.lat),c]));
 for(const service of ['fire','ems']){
  api.state.service=service;
  const selected=bases.filter(b=>b.service===service),origins=selected.map(b=>api.baseAnchor(b,service));
  if(origins.some(a=>!a))throw Error(city.id+': missing refreshed hall access');
  const ownership=dijkstra(api,origins,'weight');
  for(let i=0;i<selected.length;i++){
   const base=selected[i],index=dijkstra(api,[origins[i]],'weight',15000),features=service==='fire'?data.featuresForBase(areas,base):[];
   for(const call of training.routeCalls.filter(c=>c.routeBaseId===base.id)){
    const junction=call.locationKind==='mapped-intersection'?junctions.get(api.keyCoord(call.lng,call.lat)):null;
    if(call.locationKind==='mapped-intersection'&&(!junction||junction.names.join(' & ')!==call.addr)){decisions.set(call.id,{valid:false,reason:'junction-no-longer-matches-current-road-source'});continue;}
    const target=api.state.traceCore.snap(call,120);
    if(!target){decisions.set(call.id,{valid:false,reason:'no-current-road-access'});continue;}
    const own=costToAnchor(api,index,target),best=costToAnchor(api,ownership,target);
    const belongs=features.length?features.some(f=>data.inside(call,f.geometry)):Number.isFinite(own)&&own<=best+fresh.routeResponses.model.ownershipToleranceSeconds+.01;
    if(!belongs){decisions.set(call.id,{valid:false,reason:'outside-first-due-area-after-roster-or-base-access-correction'});continue;}
    const route=api.state.traceCore.between(origins[i],target,{maxDistance:15000});
    decisions.set(call.id,{valid:Boolean(route&&route.distance>0&&api.state.traceCore.finish(route,target,40).complete),reason:'unreachable-after-base-access-correction',...(junction?{sourceWays:junction.ways}:{})});
   }
  }
 }
 const result=reconcile(training,fresh,decisions);
 result.report.cityId=city.id;result.report.reviewedOn=new Date().toISOString();
 const priorReview=training.routeResponses.rosterReconciliation;
 if(priorReview)result.training.routeResponses.rosterReconciliationHistory=[...(training.routeResponses.rosterReconciliationHistory||[]),priorReview];
 result.training.routeResponses.rosterReconciliation={reviewedOn:result.report.reviewedOn,retainedExerciseIds:result.report.retained,addedExerciseIds:result.report.added.map(c=>c.id),retiredExercises:result.report.retired,reason:'Verified station roster and source-point corrections; valid existing IDs and destinations retained.'};
 fs.mkdirSync(outputDir,{recursive:true});
 fs.writeFileSync(path.join(outputDir,city.id+'.json'),JSON.stringify(result.training,null,2)+'\n');
 fs.writeFileSync(path.join(outputDir,city.id+'-reconciliation.json'),JSON.stringify(result.report,null,2)+'\n');
 return result.report;
}
async function main(){
 const [id,freshFile,out]=process.argv.slice(2),city=data.registry.find(c=>c.id===id);
 if(!city||!freshFile||!out)throw Error('Usage: node tools/reconcile-response-roster.cjs CITY SCRATCH_REGENERATED_JSON SCRATCH_OUTPUT_DIR');
 const directory=path.resolve(out);if(directory===data.root||directory.startsWith(data.root+path.sep))throw Error('Write reconciled proposals outside the production repository');
 const report=await run(city,JSON.parse(fs.readFileSync(freshFile)),directory);
 console.log(JSON.stringify({city:id,retained:report.retained,added:report.added.length,retired:report.retired.length}));
}
module.exports={reconcile,run};if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
