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

function settingsInjectionHarness(advancedPresent) {
  const nodes=new Map();
  class Element {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.listeners={};this.textContent='';this.value='';this.className='';}
    appendChild(node){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(x=>x!==node);this.children.push(node);node.parentElement=this;if(node.id)nodes.set(node.id,node);return node;}
    append(...items){items.forEach(node=>this.appendChild(node));}
    insertBefore(node,reference){if(reference===null||reference===undefined)return this.appendChild(node);const index=this.children.indexOf(reference);assert.notEqual(index,-1,'insertion reference belongs to selected parent');this.children.splice(index,0,node);node.parentElement=this;if(node.id)nodes.set(node.id,node);return node;}
    addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
    dispatch(type){for(const fn of this.listeners[type]||[])fn({target:this});}
    set innerHTML(value){
      this.markup=value;
      // Enough tree structure for the real calibration range and road controls.
      for(const match of value.matchAll(/<(input|select|span|div)\b([^>]*)>/g)){
        const node=new Element(match[1]);const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));Object.assign(node,attrs);node.checked=/\bchecked\b/.test(match[2]);this.appendChild(node);
      }
    }
    querySelectorAll(selector){const descendants=this.children.flatMap(node=>[node,...node.querySelectorAll('*')]);return selector==='*'?descendants:descendants.filter(node=>selector==='.section-title'?node.className==='section-title':false);}
    querySelector(selector){if(selector==='input')return this.children.find(node=>node.tagName==='INPUT');if(selector==='label span:last-child')return this.children.filter(node=>node.tagName==='SPAN').at(-1);if(selector==='.section-title')return this.querySelectorAll(selector)[0]||null;return null;}
  }
  const panel=new Element();const serviceTitle=new Element();serviceTitle.className='section-title';serviceTitle.textContent='Emergency Service';panel.appendChild(serviceTitle);const drivingTitle=new Element();drivingTitle.className='section-title';drivingTitle.textContent='Driving Modifiers';panel.appendChild(drivingTitle);
  const advanced=new Element('details');advanced.id='ptbo-advanced-settings';if(advancedPresent)panel.appendChild(advanced);
  const document={querySelector:selector=>selector==='.panel-scroll'?panel:null,getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),head:new Element('head')};
  const context=vm.createContext({document,console,VERSION:'test',DESKTOP_MANUAL_MAP:false,PRESETS:{},state:{enabled:true,status:'loading',segments:[],laneAssist:.6,settings:{preset:'classic',responseMs:45,lowSpeedTurnRate:245,highSpeedTurnRate:72,highSpeedReferenceKmh:190,steeringCurve:1.1,cornerAssist:58,zoomOutLevels:2,cameraLookAheadMeters:38,speedZoomEnabled:true}},controlNodes:new Map(),presetSelect:null,CONFIG:{spawnSnapDistance:120},saveSettings(){},snapVehicleToRoad(){},toggleDebugLayer(){}});
  return {context,nodes,panel,advanced,serviceTitle,drivingTitle};
}

for(const advancedPresent of [true,false]) {
  test(`road calibration installs into ${advancedPresent?'Advanced':'legacy Options'} with live controls`,()=>{
    const h=settingsInjectionHarness(advancedPresent);const source=read('response-simulator/road-collision-core.js');
    vm.runInContext(source.slice(source.indexOf('  function updateStatusText()'),source.indexOf('  function toggleDebugLayer(')),h.context);h.context.installControls();
    const target=advancedPresent?h.advanced:h.panel;
    assert.ok(h.nodes.get('road-lock-status').parentElement===target,'road diagnostics use the intended settings parent');
    assert.equal(h.nodes.get('road-assist').parentElement.parentElement,target);
    h.nodes.get('road-assist').value='35';h.nodes.get('road-assist').dispatch('input');assert.equal(h.context.state.laneAssist,.35);assert.equal(h.nodes.get('road-assist-value').textContent,'35%');
    assert.equal(h.panel.children[0],advancedPresent?h.serviceTitle:target.children[0]);
  });
  test(`arcade calibration installs into ${advancedPresent?'Advanced':'legacy Options'} with live controls`,()=>{
    const h=settingsInjectionHarness(advancedPresent);const source=read('response-simulator/arcade-handling-1.5.1.js');
    vm.runInContext(source.slice(source.indexOf('  function formatSetting('),source.indexOf('  function migrateDefaultMode(')),h.context);h.context.installSettingsPanel();
    const section=h.nodes.get('ptbo-arcade-handling-section');assert.ok(section.parentElement===(advancedPresent?h.advanced:h.panel),'arcade calibration uses the intended settings parent');
    assert.equal(h.nodes.get('ptbo-arcade-range-controls').children.length,8);
    const response=h.nodes.get('ptbo-arcade-responseMs');assert.equal(response.value,'45');response.value='80';response.dispatch('input');assert.equal(h.context.state.settings.responseMs,80);assert.equal(h.context.state.settings.preset,'custom');
    assert.equal(h.nodes.get('ptbo-arcade-preset').listeners.change.length,1);
  });
}
