const test = require('node:test');
const assert = require('node:assert/strict');
const {createFocusState} = require('../response-simulator/driving-ui.js');

test('movement is debounced and compact view latches through brief stops', () => {
 const s=createFocusState();
 assert.equal(s.update({now:0,speed:12,attention:'idle'}),false);
 assert.equal(s.update({now:400,speed:12,attention:'idle'}),false);
 assert.equal(s.update({now:700,speed:12,attention:'idle'}),true);
 assert.equal(s.update({now:2000,speed:0,attention:'idle'}),true);
});
test('new dispatch and transport phases expand before movement can compact again', () => {
 const s=createFocusState();
 s.update({now:0,speed:20,attention:'1:response'});
 s.update({now:700,speed:20,attention:'1:response'});
 assert.equal(s.update({now:800,speed:20,attention:'1:transport'}),false);
 assert.equal(s.update({now:2000,speed:20,attention:'1:transport'}),false);
 assert.equal(s.update({now:7000,speed:20,attention:'1:transport'}),true);
});
test('arrival requiring attention stays expanded even with stale speed', () => {
 const s=createFocusState();
 s.update({now:0,speed:10,attention:'response'});
 s.update({now:700,speed:10,attention:'response'});
 assert.equal(s.update({now:9000,speed:10,attention:'pickup',urgent:true}),false);
 assert.equal(s.update({now:20000,speed:10,attention:'pickup',urgent:true}),false);
});
test('tapping details holds them open and disabling auto-minimize restores the full UI', () => {
 const s=createFocusState();
 s.update({now:0,speed:10,attention:'idle'});s.update({now:700,speed:10,attention:'idle'});
 s.reveal(1000);
 assert.equal(s.update({now:5000,speed:10,attention:'idle'}),false);
 assert.equal(s.update({now:10000,speed:10,attention:'idle'}),true);
 s.setEnabled(false);
 assert.equal(s.update({now:20000,speed:10,attention:'idle'}),false);
});
test('a short input pulse and invalid speed do not collapse the interface', () => {
 const s=createFocusState();
 s.update({now:0,speed:10,attention:'idle'});
 s.update({now:300,speed:0,attention:'idle'});
 assert.equal(s.update({now:700,speed:10,attention:'idle'}),false);
 assert.equal(s.update({now:1000,speed:NaN,attention:'idle'}),false);
});

test('closing the tablet delegates to the shared layout without adding legacy collapse classes', () => {
 const vm=require('node:vm'),fs=require('node:fs');
 let refreshes=0;
 const hud={querySelector:()=>null,classList:{contains:()=>true,add:()=>assert.fail('legacy class must not be added')}};
 const document={readyState:'loading',getElementById:id=>id==='ptbo-tablet-dispatch-expand'?{setAttribute(){}}:hud,addEventListener(){},createElement:()=>assert.fail('legacy controls must not be installed by minimize')};
 const window={PTBO_DRIVING_UI:{refresh(){refreshes++}}};
 vm.runInNewContext(fs.readFileSync('response-simulator/tablet-close-dispatch-1.6.53.js','utf8'),{document,window});
 assert.equal(window.PTBO_TABLET_CLOSE_DISPATCH.minimize(),true);
 assert.equal(refreshes,1);
});
