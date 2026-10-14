'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createTraceCore}=require('../route-mapping/trace-core.js');
const modulePath=path.resolve(__dirname,'../route-mapping/connected-authoring.js');
const authoring=fs.existsSync(modulePath)?require(modulePath):null;
function fixture(coords,links){
 const nodes=coords.map(([x,y],id)=>({id,x,y,lng:x,lat:y,edges:[]})),segments=[];
 for(const [from,to,name='Road',oneway=false] of links){const a=nodes[from],b=nodes[to],id=segments.length,length=Math.hypot(b.x-a.x,b.y-a.y);
  segments.push({id,from,to,ax:a.x,ay:a.y,bx:b.x,by:b.y,dx:b.x-a.x,dy:b.y-a.y,length,lengthSq:length*length,name,forward:true,backward:!oneway});
  for(const reverse of oneway?[false]:[false,true])nodes[reverse?to:from].edges.push({from:reverse?to:from,to:reverse?from:to,segmentId:id,reverse,name,distance:length,duration:length/10});
 }
 const graph={nodes,segments},core=createTraceCore({graph,toXY:(lat,lng)=>({x:lng,y:lat}),toLatLng:(x,y)=>({lat:y,lng:x})});
 assert.ok(authoring,'connected-street authoring is available');
 return{graph,core,editor:authoring.createConnectedAuthoring({graph,traceCore:core}),anchor:(id,t)=>({segmentId:id,t,lat:segments[id].ay+segments[id].dy*t,lng:segments[id].ax+segments[id].dx*t})};
}
test('fractional departure offers legal directions and stops at real street decisions',()=>{
 const{core,editor,anchor}=fixture([[0,0],[100,0],[160,0],[200,0],[160,60]],[[0,1,'Main'],[1,2,'Main'],[2,3,'Main'],[2,4,'Cross']]);
 const start=core.begin(anchor(0,.5)),choices=editor.choices(start,anchor(3,1));
 assert.equal(choices.length,2);const east=choices.find(c=>c.direction==='east');
 assert.equal(east.distance,110);const route=editor.apply(start,east,anchor(3,1),10);
 assert.equal(route.endpoint.lng,160);assert.equal(route.endpoint.lat,0);assert.equal(route.complete,false);
 assert.deepEqual(editor.choices(route,anchor(3,1)).map(c=>c.direction).sort(),['east','north','west']);
});
test('choices cannot leave a one-way backwards or cross a disconnected coincident level',()=>{
 const{core,editor,anchor}=fixture([[0,0],[100,0],[100,0],[100,100]],[[0,1,'One way',true],[2,3,'Overpass']]);
 const route=core.begin(anchor(0,.5)),choices=editor.choices(route,anchor(1,1));
 assert.equal(choices.length,1);const end=editor.apply(route,choices[0],anchor(1,1),10);
 assert.equal(editor.choices(end,anchor(1,1)).length,0);assert.equal(end.complete,false);
 assert.throws(()=>core.follow(route,[{segmentId:0,t:0}]),/direction|legal/i);
 assert.throws(()=>core.follow(end,[{segmentId:1,t:1}]),/connected|junction/i);
});
test('fractional call on the chosen street is reachable without a generated route',()=>{
 const{core,editor,anchor}=fixture([[0,0],[100,0],[200,0]],[[0,1,'Main'],[1,2,'Main']]);
 const start=core.begin(anchor(0,.2)),target=anchor(1,.4),east=editor.choices(start,target).find(c=>c.direction==='east');
 const route=editor.apply(start,east,target,10);
 assert.equal(route.complete,true);assert.equal(route.distance,120);assert.equal(route.endpoint.lng,140);
});
test('learner can choose a longer connected detour and receives the same trace distance',()=>{
 const{core,editor,anchor}=fixture([[0,0],[100,0],[0,100],[100,100]],[[0,1,'Direct'],[0,2,'West'],[2,3,'North'],[3,1,'East']]);
 let route=core.begin(anchor(0,0));const target=anchor(0,1),points=[route.start];
 for(const road of ['West','North','East']){const choice=editor.choices(route,target).find(c=>c.road===road);assert.ok(choice,road);route=editor.apply(route,choice,target,10);points.push(route.endpoint);}
 assert.equal(route.complete,true);assert.equal(route.distance,300);assert.equal(core.trace(points,{tolerance:1}).distance,route.distance);
 assert.equal(core.between(route.start,target).distance,100);
});
module.exports={fixture};
function appHarness(){
 const elements=new Map(),node=(id='')=>({id,children:[],hidden:false,disabled:false,style:{},dataset:{},textContent:'',listeners:{},classList:{toggle(){}},setAttribute(k,v){this[k]=v;},addEventListener(k,v){this.listeners[k]=v;},appendChild(child){this.children.push(child);},replaceChildren(...children){this.children=children;},focus(){this.focused=true;},getBoundingClientRect(){return{left:0,top:0,width:500,height:300};}});
 const element=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id);};
 const c=vm.createContext({window:{PTBO_ROUTE_AUTHORING:authoring,PTBO_ROUTE_LEARNING:require('../route-mapping/learning-core.js')},document:{getElementById:element,createElement:()=>node(),body:{classList:{toggle(){}}},addEventListener(){}},L:{point:(x,y)=>({x,y}),polyline:()=>({addTo(){return this;},setLatLngs(){}}),marker:()=>({addTo(){return this;},setLatLng(){}}),divIcon:x=>x},localStorage:{setItem(){},getItem(){return null;}},console,requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
 c.window.addEventListener=()=>{};
 const source=fs.readFileSync(path.resolve(__dirname,'../route-mapping/app.js'),'utf8');
 vm.runInContext(source.replace('  initialize();','  globalThis.testApi={state,ui,bindUi,undo,setMode,submitRoute};'),c);
 const api=c.testApi,{core,editor,anchor}=fixture([[0,0],[100,0],[200,0]],[[0,1,'First'],[1,2,'Second']]);
 api.state.traceCore=core;api.state.routeAuthoring=editor;api.state.base={lat:0,lng:0};api.state.call={lat:0,lng:200};api.state.progression={completed:0};api.state.tuning={arrivalDistance:10};
 api.state.map={removeLayer(){},fitBounds(){},latLngToContainerPoint:p=>({x:p.lng,y:p.lat}),getSize:()=>({x:500,y:300}),getContainer:()=>element('map')};
 api.state.originAnchor=anchor(0,0);api.state.destinationAnchor=anchor(1,1);api.setMode('drawing');api.bindUi();
 return{api,element};
}
test('connected buttons support pointer or keyboard activation, Undo, Submit and focused review',()=>{
 const{api,element}=appHarness(),toggle=element('authoring-toggle');
 assert.equal(typeof toggle.listeners.click,'function','optional street-choice mode can be selected');toggle.listeners.click();
 assert.equal(element('connected-panel').hidden,false);let choices=element('road-choices').children;
 assert.equal(choices.length,1);assert.equal(choices[0].type,'button');assert.match(choices[0].textContent,/First.*east/i);
 choices[0].listeners.click();assert.equal(api.state.playerRoute.distance,100);assert.equal(api.ui.submit.disabled,true);
 const first=api.state.playerRoute;api.ui.undo.listeners.click();assert.equal(api.state.playerRoute,null);
 element('road-choices').children[0].listeners.click();assert.equal(api.state.playerRoute.distance,first.distance);
 element('road-choices').children.find(button=>/Second/.test(button.textContent)).listeners.click();
 assert.equal(api.state.playerRoute.complete,true);assert.equal(api.ui.submit.disabled,false);assert.equal(api.ui.submit.focused,true);
 api.ui.submit.listeners.click();assert.equal(api.state.mode,'results');assert.equal(api.ui.efficiency.textContent,'100% efficient');
 assert.equal(api.state.progression.completed,1);assert.equal(api.ui.results.focused,true);
 api.ui.submit.listeners.click();assert.equal(api.state.progression.completed,1,'review cannot record the same call twice');
});
test('switching input methods preserves a fractional traced route and Undo snapshot',()=>{
 const{api,element}=appHarness(),core=api.state.traceCore;
 const partial=core.advance(core.begin(api.state.originAnchor),{lat:0,lng:50},{tolerance:1}).route;
 api.state.playerRoute=partial;api.state.history=[null];api.setMode('drawing');
 element('authoring-toggle').listeners.click();element('road-choices').children[0].listeners.click();
 assert.equal(api.state.playerRoute.distance,100);api.ui.undo.listeners.click();assert.equal(api.state.playerRoute,partial);
 element('authoring-toggle').listeners.click();assert.equal(api.state.authoringMode,'trace');assert.equal(api.state.playerRoute,partial);
 assert.equal(api.ui.drawSurface.hidden,false);
});
test('connected authoring completes a real Peterborough route with the same legal road distance',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../route-mapping/app.js'),'utf8'),c=vm.createContext({window:{},document:{getElementById:()=>({})},console});
 vm.runInContext(source.replace('  initialize();','  globalThis.api={state,buildGraph,toXY,toLatLng,pathBetween};'),c);
 const a=c.api,graph=a.buildGraph(JSON.parse(fs.readFileSync(path.resolve(__dirname,'../city-explorer/data/osm-public-roads.geojson'),'utf8')));a.state.graph=graph;
 const referenceCore=createTraceCore({graph,toXY:a.toXY,toLatLng:a.toLatLng,search:(from,to,options)=>a.pathBetween(from,to,'distance',options)});
 const core=createTraceCore({graph,toXY:a.toXY,toLatLng:a.toLatLng,search:()=>{throw Error('Choice authoring must not request a shortest answer');}}),editor=authoring.createConnectedAuthoring({graph,traceCore:core});
 const start=core.snap({lat:44.300942,lng:-78.322201},260),target=core.snap({lat:44.3145,lng:-78.3001},520);
 let route=core.begin(start),count=0;
 while(!route.complete&&count++<200){
  const reference=referenceCore.between(route.endpoint,target);assert.ok(reference?.edges.length,'a legal reference continuation exists');
  const first=reference.edges[0],id=first.segmentId+':'+(first.reverse?0:1),choice=editor.choices(route,target).find(value=>value.id===id);assert.ok(choice,'connected choice exposes the learner-selected reference direction');
  route=editor.apply(route,choice,target,10);
 }
 assert.equal(route.complete,true);assert.ok(count>2&&count<200);assert.ok(Math.abs(route.distance-referenceCore.between(start,target).distance)<.01);
 const drawn=core.trace([start,...route.edges.map(edge=>edge.end)],{tolerance:12});assert.ok(Math.abs(drawn.distance-route.distance)<.01);
});
