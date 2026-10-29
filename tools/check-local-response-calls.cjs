'use strict';
// Exhaustive production-route checks, not a sample of first/last stations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const data=require('./route-response-data.cjs'),trace=require('../route-mapping/trace-core.js');
const {dijkstra,costToAnchor}=require('./build-local-response-calls.cjs');
const {computeDirectedCosts}=require('./build-civic-response-calls.cjs');
const output=path.resolve(process.env.PTBO_RESPONSE_OUTPUT||'/tmp/local-response-audit');
function fingerprint(city){
 const trainingFile=`cities/${city.id}/training-data.json`,training=JSON.parse(fs.readFileSync(path.join(data.root,trainingFile))),hash=crypto.createHash('sha256');
 // Cache the inputs that loadCity uses to derive canonical base identities and
 // coordinates as well as the graph and exercises themselves.
 const baseFiles=city.geoDataUrl?[city.geoDataUrl]:[`cities/${city.id}/package.js`,...(city.id==='peterborough'?['shared/dispatch-data-1.4.4.js']:['cities/preview-package-factory.js'])];
 for(const file of ['cities/city-registry.js','shared/base-locations.js','shared/location-changes.js','shared/dispatch-locations.js','shared/ems-priority.js','route-mapping/app.js','route-mapping/trace-core.js','route-mapping/learning-core.js','tools/check-city-route-coverage.cjs','tools/route-response-data.cjs','tools/build-local-response-calls.cjs','tools/build-civic-response-calls.cjs','tools/check-local-response-calls.cjs',...baseFiles,trainingFile,training.roadsUrl,...(training.routeResponses?.officialAreasUrl?[training.routeResponses.officialAreasUrl]:[]),...(training.roadSource.emergencyAccessSupplement?[training.roadSource.emergencyAccessSupplement.url]:[])])hash.update(file).update(fs.readFileSync(path.join(data.root,file)));
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
function validateCivicAssignment(call,{cityId,canonical,baseId,service,primary,primaryOwns,primaryExercise,distance,snapDistance}){
 const assignment=call.responseAssignment;
 assert.ok(Number.isFinite(snapDistance)&&snapDistance<=80,call.id+' has a close source snap');
 assert.ok(canonical&&canonical.id===call.canonicalCallId&&canonical.cityId===cityId&&canonical.locationKind==='sourced-address'&&canonical.geographicVerificationRef&&Array.isArray(canonical.sources)&&canonical.sources.length&&canonical.sources.every(url=>/^https:\/\//.test(url)),call.id+' has verified same-city canonical identity');
 for(const key of ['name','addr','lat','lng','locationKind','geographicVerificationRef'])assert.equal(call[key],canonical[key],call.id+' matches canonical '+key);
 assert.deepEqual(call.sources,canonical.sources,call.id+' matches canonical sources');
 const incident=canonical.incidentProfiles?.[service]?.sub;
 assert.ok(typeof incident==='string'&&incident.trim()&&call.sub===incident&&call.incidentProfiles?.[service]?.sub===incident,call.id+' matches canonical service incident');
 assert.ok(canonical.trainingServices===undefined||(Array.isArray(canonical.trainingServices)&&canonical.trainingServices.includes(service)),call.id+' is allowed for canonical service');
 assert.ok(primary&&primary.service===service&&primary.baseId===assignment.primaryBaseId&&primaryOwns,call.id+' has validated primary ownership');
 if(assignment.role==='support'){
  assert.equal(service,'fire',call.id+' support is Fire');assert.notEqual(baseId,assignment.primaryBaseId,call.id+' support differs from primary');
  assert.equal(canonical.incidentProfiles?.fire?.sub,'Structure Fire',call.id+' support is a structure fire');
  assert.ok(primaryExercise,call.id+' has a primary exercise');assert.ok(distance<=6500,call.id+' support route is bounded');
 }else assert.ok(assignment.role==='first-due'&&baseId===assignment.primaryBaseId,call.id+' has valid first-due assignment');
}
async function auditCity(city,options={}){
 const began=Date.now(),loaded=await data.loadCity(city),{bases,roads,areas}=loaded,training=options.training||loaded.training,api=data.app(city,training,bases),manifest=training.routeResponses;
 api.validateRouteResponses(training);api.state.routeResponses=manifest;api.state.calls=training.routeCalls;
 api.state.graph=api.buildGraph(roads);api.state.traceCore=trace.createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
 api.state.tuning=api.normalizeTuning(null);api.state.skillProfile=api.normalizeSkillProfile(null);
 const junctions=data.intersectionCandidates(roads,api),junctionByCoord=new Map(junctions.map(c=>[api.keyCoord(c.lng,c.lat),c])),profiles=new Map(manifest.bases.map(p=>[p.baseId,p])),calls=new Map(training.routeCalls.map(c=>[c.id,c]));
 const supportCounts=new Map(),supportPerCall=new Map();
 const report={city:city.id,verifiedFingerprint:options.training?null:fingerprint(city),halls:[],routes:0,continuousOrigins:0,officialCalls:0,modeledCalls:0,maxRouteMetres:0,minCallsPerHall:Infinity,minChallengeCallsPerHall:Infinity};
 for(const service of ['fire','ems']){
  api.state.service=service;
  const serviceBases=bases.filter(b=>b.service===service),origins=serviceBases.map(base=>api.baseAnchor(base,service));
  assert.ok(origins.every(Boolean),city.id+' every hall has audited access');
  const ownership=dijkstra(api,origins,'weight'),serviceCalls=training.routeCalls.filter(c=>c.trainingServices?.includes(service)),callIndexes=new Map(serviceCalls.map((c,i)=>[c.id,i]));
  const targets=serviceCalls.map(c=>api.state.traceCore.snap(c,120)),rows=computeDirectedCosts(api,origins,targets),weightedByBase=new Map(serviceBases.map((base,i)=>[base.id,rows[i]]));
  for(let i=0;i<serviceBases.length;i++){
   const base=serviceBases[i],profile=profiles.get(base.id),origin=origins[i],local=profile.callIds.map(id=>calls.get(id)),features=service==='fire'?data.featuresForBase(areas,base):[],weighted=weightedByBase.get(base.id);
   api.state.base=base;assert.equal(profile.service,service);assert.ok(local.filter(c=>c.responseAssignment?.role!=='support').length>=3,base.id+' has three first-due calls');
   const addresses=new Set();let challengeCalls=0,maxDistance=0;
   for(const call of local){
    assert.ok(!addresses.has(call.addr),base.id+' has distinct real destinations');addresses.add(call.addr);
    const {route,target}=validateLeg(api,origin,call,profile.maxRouteMetres);assert.ok(Math.abs(route.distance-call.routeQuality.routeMetres)<.2,call.id+' matches audited distance');
    if(call.locationKind==='mapped-intersection'){
     const source=junctionByCoord.get(api.keyCoord(call.lng,call.lat));assert.ok(source,call.id+' is a shared source vertex, not an invented crossing');
     assert.deepEqual([...call.osmWays].sort(),source.ways);assert.equal(call.addr,source.names.join(' & '));
    }else assert.ok(call.canonicalCallId,call.id+' retains source address identity');
    const assignment=call.responseAssignment;
    if(assignment?.generator==='civic-v1'){
     const canonical=(training.sharedLocations||[]).find(c=>c.id===call.canonicalCallId),primary=profiles.get(assignment.primaryBaseId),primaryBase=serviceBases.find(b=>b.id===assignment.primaryBaseId);
     const primaryFeatures=primaryBase&&service==='fire'?data.featuresForBase(areas,primaryBase):[];
     const own=primaryBase?weightedByBase.get(primaryBase.id)[callIndexes.get(call.id)]:Infinity,best=costToAnchor(api,ownership,target);
     const primaryOwns=primaryFeatures.length?primaryFeatures.some(f=>data.inside(call,f.geometry)):Number.isFinite(own)&&own<=best+manifest.model.ownershipToleranceSeconds+.01;
     const primaryExercise=Boolean(primary?.callIds.some(id=>{const c=calls.get(id);return c?.canonicalCallId===call.canonicalCallId&&c.responseAssignment?.role==='first-due'&&c.responseAssignment.primaryBaseId===primary.baseId;}));
     validateCivicAssignment(call,{cityId:city.id,canonical,baseId:base.id,service,primary,primaryOwns,primaryExercise,distance:route.distance,snapDistance:target.distance});
    }
    if(assignment?.role==='support'&&assignment.generator==='civic-v1'){
     supportCounts.set(base.id,(supportCounts.get(base.id)||0)+1);assert.ok(supportCounts.get(base.id)<=2,base.id+' has at most two support calls');
     supportPerCall.set(call.canonicalCallId,(supportPerCall.get(call.canonicalCallId)||0)+1);assert.ok(supportPerCall.get(call.canonicalCallId)<=2,call.canonicalCallId+' has at most two supports');
     report.supportCalls=(report.supportCalls||0)+1;
    }
    else if(features.length){assert.ok(features.some(f=>data.inside(call,f.geometry)),call.id+' is inside the official hall area');report.officialCalls++;}
    else{
     const own=weighted[callIndexes.get(call.id)],best=costToAnchor(api,ownership,target);
     assert.ok(own<=best+manifest.model.ownershipToleranceSeconds+.01,call.id+' is within the estimated same-service first-due area');report.modeledCalls++;
    }
    const analysis=api.analyzeDecisionDifficulty(api.scoreCall(call,route),base);
    assert.equal(analysis.meaningfulForks,call.routeQuality.meaningfulDecisions,call.id+' has reproducible decision choices');
    if(assignment?.generator==='civic-v1')assert.equal(call.routeDifficulty,analysis.score,call.id+' has reproducible route difficulty');
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
module.exports={auditCity,validateLeg,validateCivicAssignment};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
