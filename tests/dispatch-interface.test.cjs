'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// The chooser runs in either the wrapper or the standalone core. These small
// DOM surfaces retain real listeners and exercise its public open() API.
function chooserHarness({standalone=false}={}) {
  const nodes = new Map(), navigations = [];
  let released = 0, focused = '';
  class Element {
    constructor(tag) { this.tagName=tag; this.listeners={}; this.dataset={}; this.isConnected=false; this.open=false; }
    setAttribute(name,value) { this[name]=value; }
    addEventListener(type,fn) { (this.listeners[type] ||= []).push(fn); }
    dispatch(type,event={}) { for (const fn of this.listeners[type]||[]) fn(event); }
    appendChild(node) { node.isConnected=true; if(node.id)nodes.set(node.id,node); return node; }
    remove() { this.isConnected=false; }
    showModal() { this.open=true; }
    close() { this.open=false; }
    focus() { focused=this.id; }
    set innerHTML(value) {
      this.html=value;this.buttons=[];
      for(const service of ['fire','ems'])if(value.includes(`data-service="${service}"`)){const button=new Element('button');button.dataset.service=service;this.buttons.push(button);}
      for(const id of ['service-back-cities','service-all-games'])if(value.includes(`id="${id}"`)){const button=new Element('button');button.id=id;nodes.set(id,button);}
    }
    querySelectorAll(selector) { return selector==='[data-service]'?this.buttons:[]; }
    querySelector(selector) { return nodes.get(selector.slice(1))||null; }
  }
  const document={head:new Element('head'),body:new Element('body'),activeElement:null,
    currentScript:{src:'https://example.test/response-simulator/service-selection.js'},
    baseURI:'https://example.test/response-simulator/index.html',
    createElement:tag=>new Element(tag),getElementById:id=>nodes.get(id)||null};
  const frame=new Element('iframe');frame.id='simulator';if(!standalone)nodes.set(frame.id,frame);
  const map=new Element('div');map.id='map';nodes.set(map.id,map);
  const game={PTBO_CITY_PACKAGE:{id:'test',name:'Test City',features:{baseTraining:true}},
    PTBO_SERVICE_CONFIG:{profiles:{fire:{bases:[{}]},ems:{bases:[{}]}}},
    PTBO_SERVICE:{state:{selected:false},select(mode){this.state.selected=true;this.state.mode=mode;return true;}},
    releaseDrivingInput(){released++;}};
  const context=vm.createContext({document,URL,location:{href:document.baseURI},performance:{now:()=>0},setTimeout,console});
  context.window=context;context.top={location:{assign:url=>navigations.push(url)}};
  vm.runInContext(read('response-simulator/service-selection.js'),context);
  return {context,game,nodes,navigations,get released(){return released;},get focused(){return focused;}};
}

test('service chooser releases movement and offers meaningful Escape exit without selecting a service',async()=>{
  const h=chooserHarness();await h.context.PTBO_SERVICE_SELECTION.open(h.game);
  assert.ok(h.released>0,'opening the modal releases held movement');
  const dialog=h.nodes.get('service-choice');
  assert.ok(h.nodes.get('service-back-cities'),'visible Back to cities action');
  assert.ok(h.nodes.get('service-all-games'),'visible All games action');
  let prevented=false;dialog.dispatch('cancel',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(h.game.PTBO_SERVICE.state.selected,false,'exit never unlocks the vehicle');
  const exit=new URL(h.navigations.at(-1));
  assert.equal(exit.pathname,'/');assert.equal(exit.searchParams.get('chooseCity'),'1');
  assert.equal(exit.hash,'#dispatch-start');
});

test('All games exits direct links with Dispatch focus destination',async()=>{
  const h=chooserHarness({standalone:true});await h.context.PTBO_SERVICE_SELECTION.open(h.game);
  const allGames=h.nodes.get('service-all-games');assert.ok(allGames,'standalone chooser includes All games');
  allGames.dispatch('click');
  const exit=new URL(h.navigations.at(-1));assert.equal(exit.pathname,'/');assert.equal(exit.searchParams.get('focus'),'dispatch');
  assert.equal(h.game.PTBO_SERVICE.state.selected,false);
});

for(const standalone of [false,true])test(`successful service selection restores ${standalone?'standalone map':'wrapper iframe'} focus`,async()=>{
  const h=chooserHarness({standalone});await h.context.PTBO_SERVICE_SELECTION.open(h.game);
  h.nodes.get('service-choice').querySelectorAll('[data-service]')[1].dispatch('click');
  assert.equal(h.game.PTBO_SERVICE.state.mode,'ems');
  assert.equal(h.nodes.get('service-choice').open,false);
  assert.equal(h.focused,standalone?'map':'simulator');
});

test('Options releases movement, exposes its state, and restores the actual mobile opener',()=>{
  const source=read('response-simulator/index.html');
  const snippet=source.slice(source.indexOf('        function togglePanel()'),source.indexOf('        function changeBasemap()'));
  let closed=true,released=0,focused='';
  const panel={inert:true,classList:{toggle(){closed=!closed;return closed;},contains(){return closed;}},setAttribute(name,value){this[name]=value;},querySelector(){return {focus(){focused='setting';}};}};
  const button={setAttribute(name,value){this[name]=value;},focus(){focused='inner-options';}};
  const mobileOpener={isConnected:true,focus(){focused='mobile-options';}};
  const context=vm.createContext({document:{activeElement:{id:'map'},getElementById:id=>id==='control-panel'?panel:button},parent:{document:{activeElement:mobileOpener}},window:{},releaseDrivingInput(){released++;},setTimeout(){},mapInstance:null});
  vm.runInContext(snippet,context);context.togglePanel();
  assert.equal(panel.inert,false);assert.equal(panel['aria-hidden'],'false');assert.equal(button['aria-expanded'],'true');assert.equal(focused,'setting');
  context.togglePanel();assert.equal(panel.inert,true);assert.equal(button['aria-expanded'],'false');assert.equal(focused,'mobile-options');assert.equal(released,2);
});

function historyHarness(raw=null) {
  const nodes=new Map();let focused='',released=0;
  class Element {
    constructor(){this.listeners={};this.style={};this.hidden=false;this.isConnected=true;}
    setAttribute(){}
    appendChild(node){if(node.id)nodes.set(node.id,node);return node;}
    addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
    dispatch(type,event){for(const fn of this.listeners[type]||[])fn(event);}
    focus(){focused=this.id;}
    set innerHTML(value){this.html=value;this.children=[];for(const match of value.matchAll(/id="([^"]+)"/g)){const node=new Element();node.id=match[1];nodes.set(node.id,node);this.children.push(node);}}
    querySelectorAll(){return [...nodes.values()].filter(node=>/ptbo-history-(close|export|clear)$/.test(node.id));}
  }
  const opener=new Element();opener.id='history-opener';
  const document={head:new Element(),body:new Element(),activeElement:opener,getElementById:id=>nodes.get(id)||null,querySelector:()=>null,createElement:()=>new Element()};
  const context=vm.createContext({document,console,URL,Blob,location:{href:'https://example.test/response-simulator/index.html'},localStorage:{getItem:()=>raw,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){}},setTimeout(){},setInterval(){return 1;},clearInterval(){},addEventListener(){},releaseDrivingInput(){released++;},PTBO_INCIDENT_FORMAT:{formatForHistory:x=>x}});
  context.window=context;vm.runInContext(read('response-simulator/training-history-1.6.45.js'),context);
  return {context,nodes,document,get focused(){return focused;},get released(){return released;}};
}

test('history opens with input released and focus, Escape closes and restores its opener',()=>{
  const h=historyHarness();h.context.PTBO_TRAINING_HISTORY.open();
  assert.ok(h.released>0,'history modal releases held movement');
  assert.equal(h.focused,'ptbo-history-close');
  const modal=h.nodes.get('ptbo-training-history-modal');assert.equal(modal.hidden,false);
  let prevented=false;modal.dispatch('keydown',{key:'Escape',preventDefault(){prevented=true;},stopPropagation(){}});
  assert.equal(modal.hidden,true);assert.equal(h.focused,'history-opener');assert.equal(prevented,true);
});

test('history traps focus on its last action and shows an honest unreadable-storage state',()=>{
  const h=historyHarness('{broken json');h.context.PTBO_TRAINING_HISTORY.open();
  assert.match(h.nodes.get('ptbo-training-history-card').html,/could not be read/i);
  h.document.activeElement=h.nodes.get('ptbo-history-clear');
  let prevented=false;h.nodes.get('ptbo-training-history-modal').dispatch('keydown',{key:'Tab',shiftKey:false,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(h.focused,'ptbo-history-close');
  assert.match(h.nodes.get('ptbo-training-history-card').html,/No completed assignments/i);
  assert.doesNotMatch(h.nodes.get('ptbo-training-history-card').html,/Resume/);
});

test('driving keys cannot restart a vehicle behind Options or history',()=>{
  const source=read('response-simulator/index.html');
  const snippet=source.slice(source.indexOf('        function drivingKey('),source.indexOf('        function playDispatchAudioText('));
  const listeners={};let settingsOpen=true,historyOpen=false;
  const context=vm.createContext({keys:{ArrowUp:false},velocity:2,lastTimestamp:9,physicsAccumulator:1,
    document:{getElementById:id=>id==='control-panel'?{classList:{contains:()=>!settingsOpen}}:id==='ptbo-training-history-modal'?{hidden:!historyOpen}:null,querySelector:()=>null,addEventListener(){}},
    addEventListener(type,fn){listeners[type]=fn;}});context.window=context;context.parent=context;
  vm.runInContext(snippet,context);
  const press=()=>listeners.keydown({key:'ArrowUp',preventDefault(){}});
  press();assert.equal(context.keys.ArrowUp,false,'Options keeps movement released');
  settingsOpen=false;historyOpen=true;press();assert.equal(context.keys.ArrowUp,false,'history keeps movement released');
  historyOpen=false;press();assert.equal(context.keys.ArrowUp,true,'driving resumes after closing overlays');
});
