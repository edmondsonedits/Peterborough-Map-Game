'use strict';
// Bounded, explicit EMS top-ups. Existing exercises and assignments are never rebuilt.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const data=require('./route-response-data.cjs'),trace=require('../route-mapping/trace-core.js');
const {dijkstra,costToAnchor}=require('./build-local-response-calls.cjs');
const round=(n,p=1)=>Math.round(n*10**p)/10**p;
const addr=s=>String(s||'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
const exerciseId=(baseId,canonicalId)=>`route-civic-${baseId.length}-${encodeURIComponent(baseId)}-${encodeURIComponent(canonicalId)}`;
function isFirstDue(own,best,tolerance){return Number.isFinite(own)&&Number.isFinite(best)&&own<=best+tolerance+.01;}
function appendVerified(training,canonical,call){
 assert.ok(canonical&&canonical.id===call.canonicalCallId&&canonical.cityId===training.id&&canonical.locationKind==='sourced-address'&&canonical.geographicVerificationRef&&Array.isArray(canonical.sources)&&canonical.sources.length&&canonical.sources.every(x=>/^https:\/\//.test(x)),call.id+' has a verified canonical identity');
 for(const key of ['name','addr','lat','lng','locationKind','geographicVerificationRef'])assert.equal(call[key],canonical[key],call.id+' matches canonical '+key);
 assert.deepEqual(call.sources,canonical.sources,call.id+' matches canonical sources');
 assert.deepEqual(call.trainingServices,['ems'],call.id+' is an EMS service exercise');
 assert.ok(canonical.incidentProfiles?.ems?.sub&&call.sub===canonical.incidentProfiles.ems.sub&&call.incidentProfiles?.ems?.sub===call.sub&&(canonical.trainingServices===undefined||(Array.isArray(canonical.trainingServices)&&canonical.trainingServices.includes('ems'))),call.id+' matches canonical EMS service incident');
 assert.ok(call.responseAssignment?.generator==='civic-v1'&&call.responseAssignment.role==='first-due'&&call.responseAssignment.primaryBaseId===call.routeBaseId,call.id+' has a valid first-due assignment');
 assert.equal(call.id,exerciseId(call.routeBaseId,canonical.id),call.id+' has a stable exercise identity');
 const profile=training.routeResponses.bases.find(p=>p.baseId===call.routeBaseId);assert.ok(profile&&profile.service==='ems'&&!profile.unavailable,call.id+' has an EMS profile');
 const existing=training.routeCalls.find(c=>c.id===call.id);if(existing){assert.deepEqual(existing,call,call.id+' existing exercise matches top-up');assert.ok(profile.callIds.includes(call.id),call.id+' existing profile membership');return false;}
 const local=profile.callIds.map(id=>training.routeCalls.find(c=>c.id===id));assert.ok(local.every(Boolean),call.id+' has a valid existing profile');
 assert.ok(local.filter(c=>c.responseAssignment?.role==='first-due').length>=6,call.id+' has six existing new first-due calls');
 assert.ok(local.length<12,call.id+' fills an actual local shortfall');
 assert.ok(!local.some(c=>addr(c.addr)===addr(call.addr)),call.id+' duplicates an address');
 assert.ok(!training.routeCalls.some(c=>c.trainingServices?.includes('ems')&&c.canonicalCallId===canonical.id),call.id+' reuses a canonical EMS assignment');
 assert.ok(call.routeQuality&&Number.isFinite(call.routeQuality.routeMetres)&&call.routeQuality.routeMetres>0&&call.routeQuality.routeMetres<=6500,call.id+' has bounded route quality');
 training.routeCalls.push(call);profile.callIds.push(call.id);
 profile.maxRouteMetres=Math.min(15000,Math.max(profile.maxRouteMetres,Math.ceil((call.routeQuality.routeMetres*2.15+250)/100)*100));
 profile.challengeCalls=local.filter(c=>c.routeQuality?.meaningfulDecisions>0).length+(call.routeQuality.meaningfulDecisions>0?1:0);
 if(profile.challengeCalls<3)profile.challengeNote='Local street topology provides fewer than three distinct route-choice challenges; response-area locality takes priority.';else delete profile.challengeNote;
 return true;
}
function routeQuality(api,base,call,route,own,ownership,target,origin){
 const a=api.analyzeDecisionDifficulty(api.scoreCall(call,route),base);
 return {routeMetres:round(route.distance),meaningfulDecisions:a.meaningfulForks,maxAlternativePenaltyMetres:round(Math.max(0,...a.traps.map(t=>t.penalty))),decisionKinds:[...new Set(a.traps.map(t=>t.kind))],departureRoad:route.edges[0]?.name||origin.road,estimatedCostSeconds:round(costToAnchor(api,own,target)),bestSameServiceCostSeconds:round(costToAnchor(api,ownership,target))};
}
async function buildCity(city,{plan,source,outputDir,dryRun=false,trainingOverride}){
 const loaded=await data.loadCity(city),{bases,roads}=loaded,training=trainingOverride||loaded.training;
 if(training.id!==city.id||training.roadsUrl!==loaded.training.roadsUrl)throw Error('Training override does not match the city and packaged road graph');
 if(!Array.isArray(plan))throw Error('Top-up plan must be an array');
 const relevant=plan.filter(p=>p.baseId&&p.id&&p.baseId.startsWith('ems-'+city.id+'-'));if(!relevant.length)throw Error(city.id+': no matching EMS top-up entries');
 if(!training.routeResponses?.civicResponses)throw Error(city.id+': missing civic response manifest');
 const canonical=new Map((training.sharedLocations||[]).map(c=>[c.id,c])),sourceMap=new Map((source?.sharedLocations||[]).map(c=>[c.id,c])),newRecords={};
 for(const p of relevant){if(canonical.has(p.id))continue;const c=sourceMap.get(p.id),provenance=source?.provenance?.records?.[p.id];if(!c||!provenance)throw Error(p.id+': missing approved canonical record or provenance');canonical.set(p.id,c);newRecords[p.id]=provenance;training.sharedLocations.push(c);}
 const api=data.app(city,training,bases);api.state.routeResponses=training.routeResponses;api.state.calls=training.routeCalls;api.state.graph=api.buildGraph(roads);
 api.state.traceCore=trace.createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});api.state.service='ems';api.state.tuning=api.normalizeTuning(null);api.state.skillProfile=api.normalizeSkillProfile(null);
 const bs=bases.filter(b=>b.service==='ems'),origins=bs.map(b=>api.baseAnchor(b,'ems'));if(origins.some(x=>!x))throw Error(city.id+': missing EMS access');const ownership=dijkstra(api,origins,'weight'),ownByBase=new Map(),counts={appended:0,alreadyPresent:0};
 for(const p of relevant){const i=bs.findIndex(b=>b.id===p.baseId);if(i<0)throw Error(p.baseId+': unknown same-city EMS hall');const base=bs[i],origin=origins[i],profile=training.routeResponses.bases.find(x=>x.baseId===p.baseId),c=canonical.get(p.id);if(!c)throw Error(p.id+': unknown canonical location');
  const target=api.state.traceCore.snap(c,80);if(!target)throw Error(p.id+': snap exceeds 80 metres');let own=ownByBase.get(base.id);if(!own){own=dijkstra(api,[origin],'weight',15000);ownByBase.set(base.id,own);}if(!isFirstDue(costToAnchor(api,own,target),costToAnchor(api,ownership,target),training.routeResponses.model.ownershipToleranceSeconds))throw Error(p.id+': outside modeled same-service first-due ownership');
  const route=api.state.traceCore.between(origin,target,{maxDistance:6500});if(!route||route.distance<180||route.distance>6500||!api.state.traceCore.finish(route,target,40).complete)throw Error(p.id+': invalid directed route');
  const onward=profile.callIds.some(id=>{const prev=training.routeCalls.find(x=>x.id===id);if(!prev||prev.canonicalCallId===c.id)return false;const destination=api.state.traceCore.snap(prev,120),r=destination&&api.state.traceCore.between(target,destination,{maxDistance:profile.maxRouteMetres});return r&&r.distance>0;});if(!onward)throw Error(p.id+': no reachable onward call');
  const sub=c.incidentProfiles?.ems?.sub,call={...c,id:exerciseId(base.id,c.id),canonicalCallId:c.id,routeBaseId:base.id,trainingServices:['ems'],main:'Medical',sub,incidentProfiles:{ems:{sub}},simulatedIncident:true,responseAssignment:{generator:'civic-v1',role:'first-due',primaryBaseId:base.id}};api.state.base=base;
  call.routeQuality=routeQuality(api,base,call,route,own,ownership,target,origin);call.routeDifficulty=api.analyzeDecisionDifficulty(api.scoreCall(call,route),base).score;
  if(appendVerified(training,c,call))counts.appended++;else counts.alreadyPresent++;
 }
 training.routeResponses.civicResponses.minimumLocalCallTarget=12;training.routeResponses.civicResponses.minimumLocalCallTargetNote='Additional modeled first-due EMS training assignments fill a local shortfall only after six civic first-due exercises; they are not official run cards or mutual aid.';
 if(outputDir){fs.mkdirSync(outputDir,{recursive:true});fs.writeFileSync(path.join(outputDir,city.id+'.json'),JSON.stringify(training,null,2)+'\n');fs.writeFileSync(path.join(outputDir,city.id+'-promotion-delta.json'),JSON.stringify({sharedLocations:Object.keys(newRecords).map(id=>canonical.get(id)),provenance:{schemaVersion:1,cityId:city.id,records:newRecords}},null,2)+'\n');}else if(!dryRun)throw Error('Specify an output directory; production writes are disabled.');
 return {city:city.id,...counts,addedCanonical:Object.keys(newRecords).length};
}
async function main(){const id=process.env.PTBO_RESPONSE_CITY,dir=process.env.PTBO_RESPONSE_OUTPUT,planFile=process.env.PTBO_TOPUP_PLAN||path.join(__dirname,'response-floor-topups.json'),sourceFile=process.env.PTBO_TOPUP_SOURCE;if(!id||id.includes(','))throw Error('Set one PTBO_RESPONSE_CITY');const city=data.registry.find(c=>c.id===id&&c.modes.route);if(!city)throw Error('Unknown route city');const plan=JSON.parse(fs.readFileSync(planFile)),source=sourceFile?JSON.parse(fs.readFileSync(sourceFile)):null,trainingOverride=process.env.PTBO_TOPUP_TRAINING?JSON.parse(fs.readFileSync(process.env.PTBO_TOPUP_TRAINING)):undefined;console.log(JSON.stringify(await buildCity(city,{plan,source,trainingOverride,outputDir:dir,dryRun:process.env.PTBO_RESPONSE_DRY_RUN==='1'})));}
module.exports={appendVerified,isFirstDue,buildCity};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
