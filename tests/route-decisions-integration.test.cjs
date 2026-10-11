'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),services=require('../response-simulator/service-config.js');
const calls=JSON.parse(zlib.gunzipSync(Buffer.from(read('shared/dispatch-data-1.4.4.js').match(/const PAYLOAD = '([^']+)'/)[1],'base64')));
function app(){
 const storage=new Map(),elements=new Map(),c=vm.createContext({
  window:{PTBO_SERVICE_CONFIG:services,PTBO_ROUTE_LEARNING:require('../route-mapping/learning-core.js')},
  document:{body:{classList:{toggle(){}}},getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,hidden:true,dataset:{},setAttribute(){}});return elements.get(id);}},
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
  console,requestAnimationFrame:fn=>fn()
 });
 const exportNames=['state','CONFIG','toXY','toLatLng','buildGraph','basePoint','callPoint','pathBetween','buildDifficultyIndex','scoreCall','analyzeDecisionDifficulty','chooseCall','progressionPhase','applyProgressionStart','loadProgression','saveProgression','loadSkillProfiles','weightedCallChoice','weaknessBoostForAnalysis','undo','snapStroke','submitRoute','newCall','updateMarkers'];
 vm.runInContext(read('route-mapping/app.js').replace('  initialize();','  globalThis.routeTest={'+exportNames.join(',')+'};'),c);
 const a=c.routeTest;
 a.state.graph=a.buildGraph(JSON.parse(read('city-explorer/data/osm-public-roads.geojson')));
 a.state.traceCore=require('../route-mapping/trace-core.js').createTraceCore({graph:a.state.graph,toXY:a.toXY,toLatLng:a.toLatLng,search:(from,to,o)=>a.pathBetween(from,to,'distance',o)});
 return {a,storage,c};
}
const real=app();
test('real Station 1 50 metre stroke remains partial on Sherbrooke Street',()=>{
 const {a}=real,core=a.state.traceCore,start=core.snap(a.basePoint(services.profiles.fire.bases[0]),260);
 const target=core.snap(calls.find(x=>x.addr==='353 Hunter St E')||calls[0],520),reference=core.between(start,target);
 assert.ok(reference.distance>500);
 // Keep this check fractional even if the selected road edge is shorter than 50 m.
 const pts=[start];let remaining=50;
 for(const edge of reference.edges){const take=Math.min(remaining,edge.distance),p=a.toXY(edge.start.lat,edge.start.lng),q=a.toXY(edge.end.lat,edge.end.lng);pts.push(a.toLatLng(p.x+(q.x-p.x)*take/edge.distance,p.y+(q.y-p.y)*take/edge.distance));remaining-=take;if(remaining<.01)break;}
 const trace=core.trace(pts,{tolerance:12});
 assert.ok(Math.abs(trace.distance-50)<1);
 assert.equal(core.finish(trace,target,40).complete,false);
 assert.equal(trace.start.road,'Sherbrooke Street');
});
test('representative real Fire and EMS street routes trace continuously and retain distance',()=>{
 const {a}=real,core=a.state.traceCore;let count=0;
 for(const service of ['fire','ems'])for(const base of services.profiles[service].bases){
  const origin=core.snap(a.basePoint(base),260);
  const pool=calls.filter(x=>String(x.main).toLowerCase()===(service==='fire'?'fire':'medical')).filter((_,i)=>i%8===0).slice(0,5);
  for(const call of pool){
   const destination=core.snap(call,520),reference=core.between(origin,destination);if(!reference?.edges.length)continue;
   const trace=core.trace([origin,...reference.edges.map(e=>e.end)],{tolerance:12});
   assert.ok(Math.abs(trace.distance-reference.distance)<2,base.name+' to '+call.addr);
   assert.equal(core.finish(trace,destination,40).complete,true);count++;
  }
 }
 assert.ok(count>=20);console.log('Real-road traces checked:',count);
});
test('difficulty seeds the actual chosen base instead of the closest service base',()=>{
 const {a}=real;a.state.service='fire';
 for(const base of services.profiles.fire.bases){
  a.buildDifficultyIndex(base);
  assert.equal(a.state.difficultyIndex.stations.length,1);assert.equal(a.state.difficultyIndex.stations[0].id,base.id);
  const origin=a.state.traceCore.snap(a.basePoint(base),260);
  const destination=a.state.traceCore.snap(calls[0],520),s=a.state.graph.segments[destination.segmentId],node=a.state.graph.nodes[s.to];
  const nodeAnchor={...node,segmentId:s.id,t:1},reference=a.state.traceCore.between(origin,nodeAnchor);
  assert.ok(Math.abs(a.state.difficultyIndex.distances[node.id]-reference.distance)<.01);
 }
});
test('EMS advances through its two bases and keeps progression separate from Fire',()=>{
 const {a,storage}=real;
 a.state.service='fire';a.state.progression={completed:25,lastCall:null};a.saveProgression();
 a.state.service='ems';a.loadProgression();assert.equal(a.state.progression.completed,0);
 a.state.progression={completed:20,lastCall:null};a.applyProgressionStart();assert.equal(a.state.base.id,'ems-clonsilla');
 a.state.progression={completed:40,lastCall:{lat:44.3,lng:-78.32,addr:'Previous call'}};a.applyProgressionStart();assert.equal(a.state.base.id,'previous-call');a.saveProgression();
 a.state.service='fire';a.loadProgression();assert.equal(a.state.progression.completed,25);
 assert.equal(storage.size,2);
});
test('weakness migration retains rating and play history but drops obsolete inferred choices',()=>{
 const {a,storage}=real;
 storage.set(a.CONFIG.adaptiveSkillStorageKey,JSON.stringify({version:1,profiles:{fire:{rating:72,plays:18,history:[{efficiency:96,difficulty:80,rating:72}],weakDecisions:{obsolete:{score:3}}}}}));
 a.loadSkillProfiles();assert.equal(a.state.skillProfiles.fire.rating,72);assert.equal(a.state.skillProfiles.fire.plays,18);assert.equal(a.state.skillProfiles.fire.history.length,1);
 assert.equal(Object.keys(a.state.skillProfiles.fire.weakDecisions).length,0);
});
test('a recent weakness waits for intervening calls before boosting a retest',()=>{
 const {a}=real;a.state.skillProfile={plays:10,weakDecisions:{junction:{score:2,lastPlay:10}}};
 const analysis={traps:[{key:'junction'}]};assert.equal(a.weaknessBoostForAnalysis(analysis),1);
 a.state.skillProfile.plays=15;assert.ok(a.weaknessBoostForAnalysis(analysis)>1);
 a.state.skillProfile.plays=29;assert.equal(a.weaknessBoostForAnalysis(analysis),1);
});
module.exports={app,calls,services};

test('partial continuation, invalid-stroke preservation, Undo, submission, and next-call state stay coherent',async()=>{
 const {a,c}=app();
 c.document.body={classList:{toggle(){}}};
 c.L={divIcon:o=>o,polyline:()=>({addTo:()=>({})}),marker:()=>({addTo:()=>({})})};
 a.state.base=services.profiles.fire.bases[0];a.state.call=calls.find(x=>x.addr==='353 Hunter St E');a.state.mode='drawing';
 a.loadSkillProfiles();a.state.progression={completed:0};
 const core=a.state.traceCore,origin=core.snap(a.basePoint(a.state.base),260),target=core.snap(a.state.call,520),reference=core.between(origin,target);
 let remaining=50,last=origin;const firstPoints=[origin];
 for(const e of reference.edges){const take=Math.min(remaining,e.distance),p=a.toXY(e.start.lat,e.start.lng),q=a.toXY(e.end.lat,e.end.lng);last=a.toLatLng(p.x+(q.x-p.x)*take/e.distance,p.y+(q.y-p.y)*take/e.distance);firstPoints.push(last);remaining-=take;if(remaining<.01)break;}
 a.state.rawPoints=firstPoints;await a.snapStroke();
 assert.equal(a.state.mode,'drawing');assert.equal(a.state.playerRoute.complete,false);assert.equal(a.state.history.length,1);
 const partial=a.state.playerRoute;
 a.state.rawPoints=[partial.endpoint,{lat:44.9,lng:-78.9}];await a.snapStroke();
 assert.equal(a.state.playerRoute,partial);assert.equal(a.state.history.length,1);
 const tail=core.between(partial.endpoint,target);
 a.state.rawPoints=[partial.endpoint,...tail.edges.map(e=>e.end)];await a.snapStroke();
 assert.equal(a.state.mode,'editing');assert.equal(a.state.playerRoute.complete,true);
 a.undo();assert.equal(a.state.playerRoute,partial);assert.equal(a.state.mode,'drawing');
 a.state.rawPoints=[partial.endpoint,...tail.edges.map(e=>e.end)];await a.snapStroke();a.submitRoute();
 assert.equal(a.state.mode,'results');assert.equal(a.state.progression.completed,1);assert.equal(a.state.skillProfile.plays,1);
 assert.ok(a.state.shortestRoute.distance>500);
 a.state.calls=calls.slice(0,100);a.state.map={removeLayer(){},fitBounds(){}};a.newCall();
 assert.equal(a.state.mode,'drawing');assert.equal(a.state.playerRoute,null);assert.equal(a.state.history.length,0);
});
test('call marker and fitting target use the same explicit road access as completion',()=>{
 const {a,c}=app(),seen=[];
 c.L={divIcon:o=>o,marker:(point,options)=>({addTo:()=>{seen.push({point,options});return{};}})};
 a.state.base=services.profiles.fire.bases[0];
 const referenceCall=calls.find(x=>x.addr==='353 Hunter St E');
 const xy=a.toXY(referenceCall.lat,referenceCall.lng);
 a.state.call={...referenceCall,...a.toLatLng(xy.x,xy.y+100)};
 a.updateMarkers();
 const access=a.state.traceCore.snap(a.state.call,a.CONFIG.destinationSearchRadius);
 assert.ok(Math.abs(seen[1].point[0]-access.lat)<1e-9);assert.ok(Math.abs(seen[1].point[1]-access.lng)<1e-9);
 assert.match(seen[1].options.title,/Public-road access/);
});
