'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('route-mapping/app.js','utf8'),{createTraceCore}=require('../route-mapping/trace-core.js');
function fixture(){
 const ll={lat:43.7,lng:-79.4},base={id:'fire-a',service:'fire',number:1,name:'Island Hall',address:'Main Road',...ll};
 const line=(id,name,coordinates,properties={})=>({type:'Feature',id,properties:{highway:'service',name,...properties},geometry:{type:'LineString',coordinates}});
 const main=line('way/1','Main Road',[[-79.4,43.7],[-79.399,43.7]]),duplicate=line('way/2','Old duplicate',[[-79.399,43.7],[-79.398,43.7]]),wood=line('way/1082514126','Wooden boardwalk',[[-79.399,43.7],[-79.399,43.701]],{surface:'wood'});
 const emergency=(id,name,coordinates,properties={})=>line(id,name,coordinates,{surface:'asphalt',trainingEmergencyAccess:true,sourceUrl:'https://www.openstreetmap.org/'+id,motor_vehicle:'private',...properties});
 const supplement={type:'FeatureCollection',features:[emergency('way/2','Emergency Avenue',[[-79.399,43.7],[-79.398,43.7]],{oneway:'yes'}),emergency('way/3','Cibola Avenue',[[-79.398,43.7],[-79.398,43.701]]),wood]};
 const roads={type:'FeatureCollection',features:[main,duplicate,wood]},metadata={url:'cities/toronto/emergency-access-roads.geojson',wayCount:3,excludedWayIds:['way/1082514126'],officialPolicyUrl:'https://www.toronto.ca/example-policy'};
 const routeCalls=Array.from({length:3},(_,i)=>({id:'route-local-'+i,routeBaseId:base.id,main:'Fire',trainingServices:['fire'],incidentProfiles:{fire:{sub:'Fire'}},...ll}));
 const data={id:'toronto',center:[43.7,-79.4],roadsUrl:'cities/toronto/roads.geojson',roadSource:{emergencyAccessSupplement:metadata},routeCalls,routeResponses:{schemaVersion:1,minCallsPerBase:3,bases:[{baseId:base.id,service:'fire',name:base.name,number:1,maxRouteMetres:3000,callIds:routeCalls.map(call=>call.id),access:{...ll,gapMetres:0}}]}};
 const requests=[],c={window:{PTBO_DISPATCH_STORE:{ready:async()=>[],getTrainingData:()=>data},PTBO_BASE_STORE:{getSeed:()=>[base],getBases:service=>service==='fire'?[base]:[]},PTBO_ROUTE_TRACE:{createTraceCore}},document:{getElementById:()=>({appendChild(){}}),createElement:()=>({})},console:{info(){}},URL,AbortSignal,location:{href:'https://example.invalid/product/route-mapping/?city=toronto'},fetch:async(url,options)=>{requests.push({url:new URL(url),options});return {ok:true,json:async()=>String(url).includes('emergency-access-roads')?supplement:roads};}};
 vm.runInNewContext(source.replace('  initialize();','  globalThis.api={state,applyCityData,loadData};'),c);c.api.applyCityData({id:'toronto',name:'Toronto'},data);
 return {a:c.api,c,data,metadata,roads,supplement,requests};
}

test('loader merges source-backed same-city roads once, preserves direction, and excludes wooden ways from both inputs',async()=>{
 const {a,requests,roads,supplement}=fixture();await a.loadData();
 assert.equal(requests.length,2);assert.equal(requests[1].url.origin,'https://example.invalid');assert.equal(requests[1].url.pathname,'/product/cities/toronto/emergency-access-roads.geojson');assert.ok(requests[1].url.searchParams.get('v'));assert.equal(requests[1].options.redirect,'error');assert.equal(requests[1].options.mode,'same-origin');
 const segments=a.state.graph.segments;assert.equal(segments.length,3);assert.deepEqual(Array.from(segments,segment=>segment.name),['Main Road','Emergency Avenue','Cibola Avenue']);assert.equal(a.state.graph.directedEdges,5);assert.equal(segments[1].backward,false);
 assert.equal(roads.features.length,3);assert.equal(supplement.features.length,3);assert.equal(supplement.features[0].properties.motor_vehicle,'private');assert.equal(supplement.features[0].properties.sourceUrl,'https://www.openstreetmap.org/way/2');
});

test('cities without an emergency supplement fetch only their normal road package',async()=>{
 const {a,data,requests}=fixture();delete data.roadSource.emergencyAccessSupplement;await a.loadData();assert.equal(requests.length,1);assert.equal(a.state.graph.segments.length,3);
});

test('the published Toronto asphalt supplement satisfies the runtime loader contract',async()=>{
 const {a,data,supplement}=fixture(),packaged=JSON.parse(fs.readFileSync('cities/toronto/emergency-access-roads.geojson','utf8')),training=JSON.parse(fs.readFileSync('cities/toronto/training-data.json','utf8'));
 data.roadSource.emergencyAccessSupplement=training.roadSource.emergencyAccessSupplement;supplement.features=packaged.features;await a.loadData();
 assert.equal(packaged.features.length,33);assert.equal(a.state.graph.segments.length,2+packaged.features.reduce((sum,feature)=>sum+feature.geometry.coordinates.length-1,0));assert.ok(!a.state.graph.segments.some(segment=>segment.name==='Wooden boardwalk'));
});

test('external, traversing, encoded, and wrong-city supplement URLs are rejected before a supplement fetch',async()=>{
 for(const url of ['https://outside.invalid/roads.geojson','//outside.invalid/roads.geojson','cities/toronto/../ottawa/emergency-access-roads.geojson','cities/toronto/%2e%2e/emergency-access-roads.geojson','cities/ottawa/emergency-access-roads.geojson','/cities/toronto/emergency-access-roads.geojson','cities/toronto/emergency-access-roads.geojson#other']){
  const {a,metadata,requests}=fixture();metadata.url=url;await assert.rejects(a.loadData(),/supplement/i,url);assert.equal(requests.length,1,url);
 }
});

test('malformed supplement metadata and duplicate or invalid road features fail clearly',async()=>{
 const cases=[
  f=>{f.metadata.wayCount=4;},
  f=>{f.metadata.excludedWayIds=['../wood'];},
  f=>{f.metadata.excludedWayIds.push('way/1082514126');},
  f=>{f.supplement.type='GeometryCollection';},
  f=>{f.supplement.features[1].id='way/2';},
  f=>{f.supplement.features[1].geometry.type='Polygon';},
  f=>{f.supplement.features[1].geometry.coordinates=[[-79.4,43.7]];},
  f=>{f.supplement.features[1].geometry.coordinates[1][0]=NaN;},
  f=>{f.supplement.features[1].geometry.coordinates[1][1]=91;},
  f=>{f.supplement.features[1].properties.surface='wood';},
  f=>{f.supplement.features[1].properties.trainingEmergencyAccess=false;},
  f=>{f.supplement.features[1].properties.sourceUrl='https://outside.invalid/unknown';}
 ];
 for(const mutate of cases){const f=fixture();mutate(f);await assert.rejects(f.a.loadData(),/supplement/i,mutate.toString());}
});

test('failed supplement downloads stop graph construction with a useful error',async()=>{
 const {a,c}=fixture(),fetch=c.fetch;c.fetch=async(url,options)=>String(url).includes('emergency-access-roads')?{ok:false,status:404}:fetch(url,options);await assert.rejects(a.loadData(),/supplement.*404/i);assert.equal(a.state.graph,null);
});
