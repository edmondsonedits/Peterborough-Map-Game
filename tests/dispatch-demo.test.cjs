'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.existsSync('response-simulator/dispatch-demo.js')?fs.readFileSync('response-simulator/dispatch-demo.js','utf8'):'';
const ids=['call-1','call-2','call-3','call-4','call-5'];
function demo(config={demoCallIds:ids}) {
  const elements=new Map();
  function node(id='') {return {id,style:{},children:[],textContent:'',disabled:false,setAttribute(){},appendChild(child){this.children.push(child);if(child.id)elements.set(child.id,child);},replaceChildren(...children){this.children=children;for(const child of children)if(child.id)elements.set(child.id,child);},querySelector:()=>null};}
  for(const id of ['hud-content','hud-action-btn','dispatch-hud'])elements.set(id,node(id));
  const c=vm.createContext({URL,window:null,document:{getElementById:id=>elements.get(id)||null,createElement:()=>node(),querySelector:selector=>selector==='.hud-timer-block'?elements.get('dispatch-hud'):null,head:node(),documentElement:{dataset:{}}},location:{href:'https://game.test/response-simulator/?city=richmond-hill'},PTBO_CITY_PACKAGE:{id:'richmond-hill',dispatch:config}});c.window=c;
  vm.runInContext(source,c);
  assert.ok(c.PTBO_DISPATCH_DEMO,'dispatch demo API should be installed');
  return {api:c.PTBO_DISPATCH_DEMO,elements,c};
}
const pool=()=>[...ids.map(id=>({id,name:id})),{id:'ptbo-other'},{id:'richmond-extra'}];
test('demo restricts a merged city catalogue to exactly five configured canonical calls',()=>{
  const {api}=demo();assert.equal(api.enabled(),true);
  assert.deepEqual(Array.from(api.filterCandidates(pool()),c=>c.id),ids);
  assert.equal(api.progress().total,5);assert.equal(api.progress().completed,0);
});
test('completed calls cannot repeat and a duplicate completion cannot consume another demo slot',()=>{
  const {api}=demo();assert.equal(api.complete({id:ids[0]}),true);assert.equal(api.complete({id:ids[0]}),false);assert.equal(api.complete({id:'ptbo-other'}),false);
  assert.equal(api.progress().completed,1);assert.equal(api.filterCandidates(pool()).length,4);
});
test('five real completions finish the demo and replay restores all five calls',()=>{
  const {api,elements}=demo();for(const id of ids)api.complete({id});
  assert.equal(api.progress().finished,true);assert.equal(api.canStart(),false);assert.equal(api.filterCandidates(pool()).length,0);
  assert.equal(elements.get('hud-action-btn').textContent,'Replay Demo');assert.equal(elements.get('hud-action-btn').disabled,false);
  assert.match(elements.get('ptbo-demo-progress').textContent,/5.*5/);
  const request=elements.get('ptbo-demo-request');assert.match(request.href,/city=richmond-hill/);assert.equal(request.target,'_top');
  api.reset();assert.equal(api.canStart(),true);assert.equal(api.progress().completed,0);assert.equal(api.filterCandidates(pool()).length,5);
});
test('Peterborough and other packages without a demo configuration keep their unrestricted pool',()=>{
  const {api}=demo({});const calls=pool();assert.equal(api.enabled(),false);assert.equal(api.filterCandidates(calls),calls);assert.equal(api.complete(calls[0]),false);assert.equal(api.canStart(),true);
});
test('invalid or duplicate demo ids cannot silently enable a smaller session',()=>{
  for(const demoCallIds of [[],ids.slice(0,4),['a','a','b','c','d']])assert.equal(demo({demoCallIds}).api.enabled(),false);
});
