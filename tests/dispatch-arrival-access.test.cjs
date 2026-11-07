'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(new URL('../response-simulator/index.html','file://'+__filename),'utf8');
const code=html.slice(html.indexOf('function resolveIncidentArrival('),html.indexOf('function escapeDispatchText('));
function resolver({nearest={lat:44.301,lng:-78.301,distance:0},scene=false,status='ready'}={}){
  const requests=[],c=vm.createContext({PTBO_CITY_PACKAGE:{features:{sceneResponseDrills:scene}},PTBO_ROAD_COLLISION:{state:{status},nearestRoad:(lat,lng,radius)=>{requests.push({lat,lng,radius});return nearest;}}});
  c.window=c;vm.runInContext(code,c);return{resolve:c.resolveIncidentArrival,requests};
}
const call={id:'mall',name:'Large landmark',lat:44.3,lng:-78.3,radius:245,arrivalRadiusMeters:60,routeAccess:{lat:44.301,lng:-78.301}};
test('large recognition areas still require arrival at the published road approach',()=>{
  const{resolve,requests}=resolver();const before=JSON.stringify(call),point=resolve(call);
  assert.equal(point.radius,60);assert.equal(point.lat,call.routeAccess.lat);assert.equal(point.lng,call.routeAccess.lng);assert.equal(point.accessPoint,true);
  assert.deepEqual(requests,[{...call.routeAccess,radius:20}]);assert.equal(JSON.stringify(call),before);
});
test('a mapped approach outside the road network is unavailable rather than moved to another street',()=>{
  const{resolve}=resolver({nearest:{lat:44.31,lng:-78.31,distance:30}});assert.equal(resolve(call),null);
});
test('an unresolved road network cannot accept a mapped approach',()=>{
  assert.equal(resolver({status:'loading'}).resolve(call),null);
});
test('existing calls without separate arrival metadata retain their original radius behavior',()=>{
  const legacy={...call,radius:80};delete legacy.arrivalRadiusMeters;delete legacy.routeAccess;
  const point=resolver().resolve(legacy);assert.equal(point.radius,80);assert.equal(point.lat,legacy.lat);assert.equal(point.accessPoint,false);
});
test('scene-response calls also honor their separate arrival tolerance',()=>{
  const point=resolver({scene:true}).resolve(call);assert.equal(point.radius,60);assert.equal(point.lat,call.routeAccess.lat);
});
