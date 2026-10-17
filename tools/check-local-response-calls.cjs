'use strict';
// Exhaustive production-route checks, not a sample of first/last stations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const data=require('./route-response-data.cjs'),trace=require('../route-mapping/trace-core.js');
const {dijkstra,costToAnchor}=require('./build-local-response-calls.cjs');
const output=path.resolve(process.env.PTBO_RESPONSE_OUTPUT||'/tmp/local-response-audit');
function fingerprint(city){
 const trainingFile=`cities/${city.id}/training-data.json`,training=JSON.parse(fs.readFileSync(path.join(data.root,trainingFile))),hash=crypto.createHash('sha256');
 for(const file of ['route-mapping/app.js','route-mapping/trace-core.js','route-mapping/learning-core.js','tools/route-response-data.cjs','tools/build-local-response-calls.cjs','tools/check-local-response-calls.cjs',trainingFile,training.roadsUrl,...(training.routeResponses?.officialAreasUrl?[training.routeResponses.officialAreasUrl]:[]),...(training.roadSource.emergencyAccessSupplement?[training.roadSource.emergencyAccessSupplement.url]:[])])hash.update(file).update(fs.readFileSync(path.join(data.root,file)));
 return hash.digest('hex');
}
function validateLeg(api,origin,call,range){
 const target=api.state.traceCore.snap(call,120);assert.ok(target,call.id+' has close real-road access');
 const route=api.state.traceCore.between(origin,target,{maxDistance:range});assert.ok(route&&route.distance>0,call.id+' has a directed production route');
 assert.ok(route.distance<=range,call.id+' is within hall range');
 assert.ok(api.state.traceCore.finish(route,target,40).complete,call.id+' can be completed');
 for(let i=0;i<route.edges.length;i++){
  const e=route.edges[i],s=api.state.graph.segments[e.segmentId];assert.ok(e.reverse?s.backward:s.forward,call.id+' obeys one-way roads');
  if(i)assert.ok(api.state.traceCore.distance(route.edges[i-1].end,e.start)<.2,call.id+' has no route gap');
 }
 return {route,target};
}
async function auditCity(city){
 const began=Date.now(),{training,bases,roads,areas}=await data.loadCity(city),api=data.app(city,training,bases),manifest=training.routeResponses;
 api.validateRouteResponses(training);api.state.routeResponses=manifest;api.state.calls=training.routeCalls;
 api.state.graph=api.buildGraph(roads);api.state.traceCore=trace.createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
 api.state.tuning=api.normalizeTuning(null);api.state.skillProfile=api.normalizeSkillProfile(null);
 const junctions=data.intersectionCandidates(roads,api),junctionByCoord=new Map(junctions.map(c=>[api.keyCoord(c.lng,c.lat),c])),profiles=new Map(manifest.bases.map(p=>[p.baseId,p])),calls=new Map(training.routeCalls.map(c=>[c.id,c]));
 const report={city:city.id,verifiedFingerprint:fingerprint(city),halls:[],routes:0,continuousOrigins:0,officialCalls:0,modeledCalls:0,maxRouteMetres:0,minCallsPerHall:Infinity,minChallengeCallsPerHall:Infinity};
 for(const service of ['fire','ems']){
  api.state.service=service;
  const serviceBases=bases.filter(b=>b.service===service),origins=serviceBases.map(base=>api.baseAnchor(base,service));
  assert.ok(origins.every(Boolean),city.id+' every hall has audited access');
  const ownership=dijkstra(api,origins,'weight');
  for(let i=0;i<serviceBases.length;i++){
   const base=serviceBases[i],profile=profiles.get(base.id),origin=origins[i],local=profile.callIds.map(id=>calls.get(id)),features=service==='fire'?data.featuresForBase(areas,base):[],weighted=features.length?null:dijkstra(api,[origin],'weight',1500);
   api.state.base=base;assert.equal(profile.service,service);assert.ok(local.length>=3,base.id+' has three calls');
   const addresses=new Set();let challengeCalls=0,maxDistance=0;
   for(const call of local){
    assert.ok(!addresses.has(call.addr),base.id+' has distinct real destinations');addresses.add(call.addr);
    const {route,target}=validateLeg(api,origin,call,profile.maxRouteMetres);assert.ok(Math.abs(route.distance-call.routeQuality.routeMetres)<.2,call.id+' matches audited distance');
    if(call.locationKind==='mapped-intersection'){
     const source=junctionByCoord.get(api.keyCoord(call.lng,call.lat));assert.ok(source,call.id+' is a shared source vertex, not an invented crossing');
     assert.deepEqual([...call.osmWays].sort(),source.ways);assert.equal(call.addr,source.names.join(' & '));
    }else assert.ok(call.canonicalCallId,call.id+' retains source address identity');
    if(features.length){assert.ok(features.some(f=>data.inside(call,f.geometry)),call.id+' is inside the official hall area');report.officialCalls++;}
    else{
     const own=costToAnchor(api,weighted,target),best=costToAnchor(api,ownership,target);
     assert.ok(own<=best+manifest.model.ownershipToleranceSeconds+.01,call.id+' is within the estimated same-service first-due area');report.modeledCalls++;
    }
    const analysis=api.analyzeDecisionDifficulty(api.scoreCall(call,route),base);
    assert.equal(analysis.meaningfulForks,call.routeQuality.meaningfulDecisions,call.id+' has reproducible decision choices');
    assert.ok(analysis.traps.every(t=>t.penalty>Math.max(160,route.distance*.035)),call.id+' does not label equal alternatives as traps');
    if(analysis.meaningfulForks)challengeCalls++;
    maxDistance=Math.max(maxDistance,route.distance);report.routes++;
   }
   assert.equal(profile.challengeCalls,challengeCalls);if(challengeCalls<3)assert.ok(profile.challengeNote,'topology exception must be explicit');
   // All generated previous-call origins must retain at least one different
   // reachable call within the same local hall catalog.
   for(const previous of local){
    const start=api.state.traceCore.snap(previous,120);let next=0;
    for(const call of local)if(call.id!==previous.id){const target=api.state.traceCore.snap(call,120),r=api.state.traceCore.between(start,target,{maxDistance:profile.maxRouteMetres});if(r&&r.distance>0){next++;break;}}
    assert.ok(next,previous.id+' has a different reachable local next call');report.continuousOrigins++;
   }
   // Exercise production history exhaustion. Seed recent IDs to cover the
   // entire city, then require every choice to remain with this hall/service.
   api.state.phase={continuous:false,completedInPhase:0};api.state.recentCallIds=training.routeCalls.map(c=>c.id);
   for(let j=0;j<3;j++){const before=api.state.recentCallIds.at(-1),chosen=api.chooseCall();assert.ok(profile.callIds.includes(chosen.id));assert.equal(chosen.routeBaseId,base.id);assert.notEqual(chosen.id,before);}
   report.halls.push({id:base.id,service,calls:local.length,challengeCalls,maxRouteMetres:Math.round(maxDistance),method:profile.method});
   report.maxRouteMetres=Math.max(report.maxRouteMetres,maxDistance);report.minCallsPerHall=Math.min(report.minCallsPerHall,local.length);report.minChallengeCallsPerHall=Math.min(report.minChallengeCallsPerHall,challengeCalls);
  }
 }
 report.durationMs=Date.now()-began;fs.writeFileSync(path.join(output,city.id+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,halls:report.halls.length}));return report;
}
async function main(){
 fs.mkdirSync(output,{recursive:true});const reports=[],failures=[];
 for(const city of data.registry.filter(c=>c.modes.route&&(!process.env.PTBO_RESPONSE_CITY||process.env.PTBO_RESPONSE_CITY.split(',').includes(c.id)))){
  if(process.env.PTBO_RESPONSE_READY_ONLY==='1'&&!JSON.parse(fs.readFileSync(path.join(data.root,`cities/${city.id}/training-data.json`))).routeResponses)continue;
  const file=path.join(output,city.id+'.json'),cached=process.env.PTBO_RESPONSE_RESUME==='1'&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
  if(cached?.verifiedFingerprint===fingerprint(city)){reports.push(cached);console.log(JSON.stringify({city:city.id,verifiedUnchanged:true,halls:cached.halls.length,routes:cached.routes}));}
  else try{reports.push(await auditCity(city));}catch(error){const failure={city:city.id,error:error.message};failures.push(failure);console.error(JSON.stringify(failure));}
 }
 const summary={schemaVersion:1,cities:reports.length,halls:reports.reduce((n,r)=>n+r.halls.length,0),routes:reports.reduce((n,r)=>n+r.routes,0),continuousOrigins:reports.reduce((n,r)=>n+r.continuousOrigins,0),officialCalls:reports.reduce((n,r)=>n+r.officialCalls,0),modeledCalls:reports.reduce((n,r)=>n+r.modeledCalls,0),maxRouteMetres:Math.round(Math.max(...reports.map(r=>r.maxRouteMetres))),minCallsPerHall:Math.min(...reports.map(r=>r.minCallsPerHall)),minChallengeCallsPerHall:Math.min(...reports.map(r=>r.minChallengeCallsPerHall)),topologyExceptions:reports.flatMap(r=>r.halls.filter(b=>b.challengeCalls<3).map(b=>({city:r.city,...b}))),productionAppSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(data.root,'route-mapping/app.js'))).digest('hex'),limits:['Official run-area endpoints enforced in six cities; all other Fire and all EMS catchments are explicit road-cost estimates, not certified operational dispatch areas.','Incidents are simulations at real source locations; road directions and connectivity follow packaged source data, not current traffic, apparatus availability or a field access survey.'],reports:reports.map(r=>({city:r.city,halls:r.halls.length,routes:r.routes,maxRouteMetres:Math.round(r.maxRouteMetres)}))};
 summary.failures=failures;fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;
}
module.exports={auditCity,validateLeg};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
