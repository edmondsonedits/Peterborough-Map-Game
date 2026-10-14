'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function declaration(file, start) {
 const source=fs.readFileSync(file,'utf8');
 const index=source.indexOf(start);assert.ok(index>=0,`${file}: ${start}`);
 const open=source.indexOf('{',index);let depth=1,end=open+1;
 while(depth && end<source.length){const c=source[end++];if(c==='{')depth++;if(c==='}')depth--;}
 return source.slice(index,end);
}
function owner(){
 const badge={textContent:'v1.6.102',setAttribute(){}};let refreshed=0,appended=0;
 const document={documentElement:{dataset:{}},querySelector:()=>({appendChild:()=>{appended++}}),getElementById:id=>id==='ptbo-build-badge'?badge:id==='ptbo-training-ui-1657-style'?{}:null,head:{appendChild:()=>{appended++}},createElement:()=>({})};
 const PTBO_BUILD={version:'1.6.102',refreshBadge(){refreshed++;badge.textContent='v1.6.102'}};
 const context={document,PTBO_BUILD,VERSION:'1.6.47',removeLegacyPinnedNotice(){},hostDocument:()=>document};context.window=context;context.hostWindow=()=>context;
 return{context,badge,refreshes:()=>refreshed,appended:()=>appended};
}
test('late launcher module refresh delegates to canonical build',()=>{
 const h=owner();vm.runInNewContext(declaration('shared/launcher-access-1.6.47.js','const refreshVersionMarker = () =>')+';refreshVersionMarker();',h.context);
 assert.equal(h.badge.textContent,'v1.6.102');assert.equal(h.refreshes(),1);
});
test('late training UI refresh preserves the host release identity',()=>{
 const h=owner();h.context.VERSION='1.6.57';vm.runInNewContext(declaration('response-simulator/training-ui-1.6.57.js','function installHostPolish()')+';installHostPolish();',h.context);
 assert.equal(h.badge.textContent,'v1.6.102');assert.equal(h.context.document.documentElement.dataset.ptboRelease,'1.6.102');assert.equal(h.refreshes(),1);
});
test('retained readiness module cannot create a second visible build marker',()=>{
 const h=owner();vm.runInNewContext(declaration('response-simulator/simulator-readiness-1.4.5.js','function installVersionBadge()')+';installVersionBadge();',h.context);
 assert.equal(h.appended(),0);assert.equal(h.refreshes(),1);
});
