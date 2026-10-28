import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {JSDOM}=require('../tools/location-report-tests/node_modules/jsdom');
const url=new URL('../feedback/location-report-ui.mjs',import.meta.url);
const ui=existsSync(url)?await import(url.href):{};
const snapshot=()=>({resultId:'result-1',callId:'school-1',city:'peterborough',service:'fire',mode:'geo',version:'1.6.134',datasetId:'peterborough:geo-locations',datasetRevision:null,question:{name:'James Strath Public',address:'1175 Brealey Dr',crossStreets:['Brealey Drive','Sherbrooke Street'],difficulty:'easy'},originalCircle:{center:{lat:44.2865,lng:-78.3796},radiusMeters:60},guess:{lat:44.2867,lng:-78.3775},distanceMeters:165,result:'incorrect',baseId:'fire-1'});
function setup(){
 const dom=new JSDOM('<div id="host"></div>',{url:'https://game.example.test/geo-guesser/',runScripts:'outside-only'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 const host=document.querySelector('#host');
 return {dom,host,change(selector,value){const el=host.querySelector(selector);assert.ok(el,selector);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));el.dispatchEvent(new window.Event('change',{bubbles:true}));},submit(){host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));}};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
function mount(g,extra={}){assert.equal(typeof ui.mountLocationReportComposer,'function','report composer must exist');return ui.mountLocationReportComposer({host:g.host,snapshot:snapshot(),rootUrl:new URL('https://game.example.test/'),mapLoader:async()=>{throw new Error('Map unavailable in this fixture');},...extra});}

test('a report can move and resize its proposed circle without changing the captured target',async()=>{
 const g=setup(),sent=[];const original=snapshot();
 const view=mount(g,{snapshot:original,onSend:async report=>{sent.push(report);},onReceived(){}});
 g.change('[name="reason"]','radius');g.change('[name="correct-circle"]',true);
 g.change('[name="latitude"]','44.2867');g.change('[name="longitude"]','-78.3775');g.change('[name="radius"]','125');
 g.submit();await flush();
 assert.equal(sent.length,1);assert.deepEqual(sent[0].suggestion,{center:{lat:44.2867,lng:-78.3775},radiusMeters:125});
 assert.equal(sent[0].snapshot.originalCircle.radiusMeters,60);assert.equal(original.originalCircle.center.lng,-78.3796);
 view.destroy();g.dom.window.close();
});
test('a failed send retains the identical submission; editing a circle changes its payload',async()=>{
 const g=setup(),sent=[];let fail=true;const view=mount(g,{onSend:async report=>{sent.push(report);if(fail)throw Error('Offline');},onReceived(){}});
 g.change('[name="correct-circle"]',true);g.change('[name="radius"]','100');g.submit();await flush();
 assert.match(g.host.textContent,/Offline/);fail=false;g.submit();await flush();
 assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);
 view.destroy();g.dom.window.close();
});
test('an invalid radius stays editable and never submits; disabling suggestions submits no proposed circle',async()=>{
 const g=setup(),sent=[];const view=mount(g,{onSend:async report=>sent.push(report),onReceived(){}});
 g.change('[name="correct-circle"]',true);g.change('[name="radius"]','0');g.submit();await flush();assert.equal(sent.length,0);
 g.change('[name="correct-circle"]',false);g.submit();await flush();assert.equal(sent.length,1);assert.equal(sent[0].suggestion,null);
 view.destroy();g.dom.window.close();
});
test('closing before an asynchronous send finishes suppresses stale UI completion',async()=>{
 const g=setup();let resolve,received=0;const pending=new Promise(r=>resolve=r);
 const view=mount(g,{onSend:()=>pending,onReceived:()=>received++});g.submit();await flush();view.destroy();g.host.textContent='New question';resolve();await flush();
 assert.equal(received,0);assert.equal(g.host.textContent,'New question');g.dom.window.close();
});
test('the real Leaflet map is initialized before circle bounds are queried',async()=>{
 const g=setup();
 // jsdom has no SVG layout engine; this supplies capability detection only.
 g.dom.window.SVGSVGElement.prototype.createSVGRect=()=>({});
 g.dom.window.eval(readFileSync(new URL('../response-simulator/vendor/leaflet-1.9.4/leaflet.js',import.meta.url),'utf8'));
 const view=mount(g,{mapLoader:async()=>({L:g.dom.window.L,spec:{url:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',attribution:''}}),onSend:async()=>{},onReceived(){}});
 g.change('[name="correct-circle"]',true);await flush();
 assert.equal(g.host.querySelector('[data-map-centre]').disabled,false,g.host.querySelector('.fb-map-status').textContent||'map initialization must complete before the correction tools become usable');
 assert.equal(g.host.querySelector('.fb-map-status').textContent,'');
 view.destroy();g.dom.window.close();
});
test('map placement and centre dragging wrap repeated-world longitudes into valid coordinates',async()=>{
 const g=setup();g.dom.window.SVGSVGElement.prototype.createSVGRect=()=>({});
 g.dom.window.eval(readFileSync(new URL('../response-simulator/vendor/leaflet-1.9.4/leaflet.js',import.meta.url),'utf8'));
 const L=g.dom.window.L,create=L.map;let map;
 L.map=(...args)=>(map=create(...args));
 const sent=[],view=mount(g,{mapLoader:async()=>({L,spec:{url:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',attribution:''}}),onSend:async report=>sent.push(report),onReceived(){}});
 g.change('[name="correct-circle"]',true);await flush();map.setView([44,282],2,{animate:false});
 g.host.querySelector('[data-map-centre]').click();
 assert.equal(Number(g.host.querySelector('[name="longitude"]').value),-78);
 let centre;map.eachLayer(layer=>{if(layer.options.title==='Drag the proposed circle centre')centre=layer;});
 centre.setLatLng([44,283]);centre.fire('drag');g.submit();await flush();
 assert.equal(sent[0].suggestion.center.lng,-77);assert.equal(g.host.querySelector('.fb-error').textContent,'');
 view.destroy();g.dom.window.close();
});

test('technical context starts collapsed while the unchanged snapshot and diagnostics remain attached',async()=>{
 const g=setup(),sent=[],source=snapshot(),diagnostics='Browser: Mobile test browser\nViewport: 338 × 656 CSS pixels\nReport opened: 2026-10-28T03:06:28.863Z';
 const view=mount(g,{snapshot:source,diagnosticsText:diagnostics,onSend:async report=>sent.push(report),onReceived(){}});
 const details=g.host.querySelector('.fb-report-context');
 assert.equal(details.open,false);
 assert.equal(details.querySelector('summary').textContent,'Technical details');
 const content=details.querySelector('.fb-auto-context-body');assert.ok(content,'all technical fields should share one collapsible container');
 assert.ok(content.contains(details.querySelector('dl')));
 assert.ok(content.textContent.includes(diagnostics));
 g.change('[name="note"]','The circle seems too small.');g.submit();await flush();
 assert.equal(sent.length,1);assert.deepEqual(sent[0].snapshot,source);
 assert.equal(details.open,false,'sending should not expand technical data');
 view.destroy();g.dom.window.close();
});
