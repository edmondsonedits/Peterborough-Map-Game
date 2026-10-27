const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor(tag) { this.tagName=tag; this.children=[]; this.dataset={}; this.style={}; this.listeners={}; this.classList={toggle(){}}; this.attributes={}; }
  setAttribute(k,v){this.attributes[k]=v} appendChild(e){this.children.push(e);return e} replaceChildren(...e){this.children=e} addEventListener(k,f){this.listeners[k]=f}
}
const shortcuts=new Element('div'), parentDoc={documentElement:{dataset:{}},head:new Element('head'),createElement:t=>new Element(t),querySelector:s=>s==='.station-shortcuts'?shortcuts:null,getElementById:()=>null};
const hud=new Element('div');
const doc={body:null,documentElement:{dataset:{}},getElementById:id=>id==='hud-content'?hud:null,querySelectorAll:()=>[],createElement:t=>new Element(t)};
let moved=[];
const bases={fire:[{number:1,name:'Station 1',shortName:'Station 1',address:'A',lat:1,lng:2},{number:2,name:'Station 2',shortName:'Station 2',address:'B',lat:3,lng:4}],ems:Array.from({length:30},(_,i)=>({number:i+1,name:`Base ${i+1}`,shortName:`Base ${i+1}`,address:'C',lat:i,lng:i+1}))};
const window={PTBO_SERVICE_CONFIG:{profiles:{fire:{label:'Fire',bases:bases.fire},ems:{label:'EMS',bases:bases.ems}},alarmCategories:[]},PTBO_CITY_PACKAGE:{id:'test',name:'Test'},addEventListener(){},dispatchEvent(){},teleportToStation:(a,b)=>moved.push([a,b])};
const context={window,document:doc,parent:{document:parentDoc},console,resetDispatchWorkflow(){},updateVehicleChassis(){},escapeDispatchText:x=>x,CustomEvent:class{},Event:class{}};
vm.runInNewContext(fs.readFileSync('response-simulator/service-mode.js','utf8'),context);
window.PTBO_SERVICE.select('fire');
assert.equal(shortcuts.children.length,1);
let menu=shortcuts.children[0];
assert.equal(menu.tagName,'select');
assert.equal(menu.children[0].textContent,'Station');
assert.equal(menu.children.length,3);
menu.value='2';menu.listeners.change();
assert.deepEqual(moved.at(-1),[3,4]);
window.PTBO_SERVICE.select('ems');
menu=shortcuts.children[0];
assert.equal(menu.children.length,31);
menu.value='30';menu.listeners.change();
assert.deepEqual(moved.at(-1),[29,30]);
console.log('Station dropdown selects fire stations and large EMS base lists.');
