const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8'),flush=()=>new Promise(r=>setImmediate(r));
const center=[44.3091,-78.3197],my=110540,mx=111320*Math.cos(center[0]*Math.PI/180);
const point=(x,y)=>[center[1]+x/mx,center[0]+y/my];
const feature=(name,coords,properties={})=>({type:'Feature',properties:{name,highway:'primary',...properties},geometry:{type:'LineString',coordinates:coords.map(p=>point(...p))}});
async function roads(features,{gridSize=80}={}){
 const c={console,URL,Math,Map,Set,Promise,performance:{now:()=>0},setTimeout(){},clearTimeout(){},setInterval(){},requestAnimationFrame(){},addEventListener(){},dispatchEvent(){},CustomEvent:class{},document:{getElementById:()=>null,querySelector:()=>null,createElement:()=>({style:{},appendChild(){},addEventListener(){}}),head:{appendChild(){}},body:{appendChild(){}}},fetch:async()=>({ok:true,json:async()=>({type:'FeatureCollection',features})}),simLat:center[0],simLng:center[1],velocity:0,currentHeading:0,mapInstance:null,vehicleMarker:null,simulationLoop(){},simulationStep(){},evaluateDistanceToTarget(){},PTBO_BASE_STORE:{getAll:()=>[],contains:()=>false},PTBO_CITY_PACKAGE:{id:'test',roads:{center,gridSize,dataUrl:'roads.geojson'}}};
 c.window=c;vm.createContext(c);vm.runInContext(read('response-simulator/road-collision-core.js'),c);await c.PTBO_ROAD_COLLISION.ready;
 return{c,api:c.PTBO_ROAD_COLLISION,at:(x,y)=>{const [lng,lat]=point(x,y);return c.PTBO_ROAD_COLLISION.isPointDrivable(lat,lng);},async soften(){vm.runInContext(read('response-simulator/road-intersection-softener.js'),c);await flush();}};
}
test('near-matching road ends get a rounded turning area without opening distant private ground',async()=>{
 const h=await roads([feature('Main',[[-40,0],[0,0],[40,0]]),feature('Side',[[.3,.25],[.3,40]])]);assert.equal(h.at(9,9),false);await h.soften();assert.equal(h.at(9,9),true);assert.equal(h.at(25,25),false);
 h.api.state.laneAssist=0;let prev=point(0,30);
 for(let i=1;i<=30;i++){const a=i/30*Math.PI/2,next=point(30*(1-Math.cos(a)),30*(1-Math.sin(a)));const result=h.api.resolveMovement(prev[1],prev[0],next[1],next[0],.000001);assert.equal(result.blocked,false,`turn step ${i}`);prev=[result.lng,result.lat];}
});
test('rounded corners use the road index grid size supplied by the city',async()=>{
 const h=await roads([feature('Main',[[160,200],[200,200],[240,200]]),feature('Side',[[200,200],[200,240]])],{gridSize:32});await h.soften();assert.equal(h.at(209,209),true);
});
test('same-position roads on different bridge levels do not create a ground-level corner shortcut',async()=>{
 const h=await roads([feature('Ground',[[-40,0],[0,0],[40,0]]),feature('Bridge',[[0,0],[0,40]],{layer:'1',bridge:'yes'})]);await h.soften();assert.equal(h.c.PTBO_ROAD_INTERSECTION_SOFTENER.state.junctionCount,0);assert.equal(h.at(9,9),false);
});
test('nearest-road queries respect the requested maximum distance',async()=>{
 const h=await roads([feature('Main',[[-40,0],[40,0]])]);const [lng,lat]=point(0,30);assert.equal(h.api.nearestRoad(lat,lng,10),null);assert.ok(Math.abs(h.api.nearestRoad(lat,lng,40).distance-30)<.01);
});
function bootstrap(){let release;const files=[],events=[];const pending=new Promise(r=>release=r);const api={ready:Promise.resolve(),state:{status:'ready',originalLoop:true,segments:[]},config:{cityId:'test'}};
 const c={URL,console,Promise,performance:{now:()=>0},setTimeout(){},PTBO_BUILD:{version:'9.9.9'},PTBO_ROAD_COLLISION:api,CustomEvent:class{constructor(type){this.type=type;}},dispatchEvent:e=>events.push(e.type),document:{currentScript:{src:'https://game.test/response-simulator/road-collision.js?v=old'},baseURI:'https://game.test/response-simulator/',querySelector:()=>null,createElement:()=>({dataset:{},remove(){}}),body:{appendChild(s){const f=new URL(s.src).pathname.split('/').pop();files.push(s.src);if(f==='road-hard-boundary-1.6.6.js')c.PTBO_HARD_ROAD_BOUNDARY={ready:Promise.resolve(),state:{installed:true}};if(f==='road-intersection-softener.js')c.PTBO_ROAD_INTERSECTION_SOFTENER={ready:pending,state:{installed:false}};queueMicrotask(()=>s.onload());}}}};
 c.window=c;vm.createContext(c);vm.runInContext(read('response-simulator/road-collision.js'),c);return{c,files,events,release(){c.PTBO_ROAD_INTERSECTION_SOFTENER.state.installed=true;release();}};
}
test('road bootstrap does not announce readiness until rounded intersections are installed',async()=>{const h=bootstrap();let done=false;h.c.PTBO_ROAD_COLLISION_BOOTSTRAP_READY.then(()=>done=true);await flush();assert.equal(done,false);h.release();await h.c.PTBO_ROAD_COLLISION_BOOTSTRAP_READY;assert.ok(h.events.includes('ptbo-road-collision-bootstrap-ready'));});
test('road bootstrap uses the canonical release token for nested road modules',async()=>{const h=bootstrap();await flush();h.release();await h.c.PTBO_ROAD_COLLISION_BOOTSTRAP_READY;assert.ok(h.files.length>=2);for(const file of h.files)assert.ok(new URL(file).searchParams.get('v').startsWith('9.9.9'),file);});

test('near-endpoint matching stays bounded and does not chain across successive gaps',async()=>{
 const h=await roads([feature('Main',[[-40,0],[0,0],[40,0]]),feature('Near',[[.9,0],[.9,40]]),feature('Further',[[1.8,0],[1.8,-40]])]);await h.soften();
 const corners=h.api.state.segments.filter(s=>s.syntheticIntersection);assert.equal(corners.length,1);assert.equal(corners[0].incidentCount,3);
});
for(const degrees of [45,90,180,270])test(`rounded turning room survives road rotation ${degrees}`,async()=>{
 const a=degrees*Math.PI/180,rotate=([x,y])=>[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];
 const h=await roads([feature('Main',[[-40,0],[0,0],[40,0]].map(rotate)),feature('Side',[[.3,.25],[.3,40]].map(rotate))]);await h.soften();assert.equal(h.at(...rotate([9,9])),true);assert.equal(h.at(...rotate([25,25])),false);
});
