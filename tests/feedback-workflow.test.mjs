import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountFeedback} from '../feedback/ui.mjs';
import {filterThreads} from '../feedback/model.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('../tools/location-report-tests/node_modules/jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
const thread=(id='report',extra={})=>({id,ownerId:'player',title:'Location correction',city:'peterborough',mode:'geo',department:'fire',version:'1.6.145',category:'map',status:'new',priority:'normal',updatedAt:1,lastMessageId:'m1',playerMessages:1,developerMessages:0,developerRead:0,playerRead:0,...extra});
function setup({admin=true,pages=[],readUpdatesThread=false}={}){
 const dom=new JSDOM('<header class="site-header"></header>',{url:'https://game.example.test/geo-guesser/',pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,sessionStorage:dom.window.sessionStorage,Event:dom.window.Event});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.hasFocus=()=>true;
 let account={uid:admin?'dev':'player',isGuest:!admin,isDeveloper:admin},listener,rows=[thread()],id=0,messageNext;
 const scopes=[],reads=[],watchers=[],loads=[],sends=[],threadListeners=new Map();
 const service={ready:Promise.resolve(),id:()=>`id-${++id}`,get account(){return account;},subscribeAccount(fn){listener=fn;fn(account);},ensureGuest:async()=>account,
  watchThreads(fn,error,scope){scopes.push(scope);const w={fn,scope};watchers.push(w);fn({rows:scope.developer?rows:rows.filter(t=>t.ownerId===account.uid),cursor:'page0',more:scope.developer&&pages.length>0});return()=>{watchers.splice(watchers.indexOf(w),1);};},
  async loadThreads({cursor}){loads.push(cursor);return pages[Number(cursor.replace('page',''))]||{rows:[],cursor:null,more:false};},
  watchMessages(id,fn){messageNext=fn;fn({rows:[{id:'m1',authorRole:'player',body:'Original message',authorId:'player',createdAt:{toMillis:()=>1}}],more:false});return()=>{};},
  async send(payload){sends.push(payload);},
  watchThread(id,fn){threadListeners.set(id,fn);return()=>threadListeners.delete(id);},
  watchNotes(id,fn){fn([]);return()=>{};},markRead:async(...args)=>{reads.push(args);if(readUpdatesThread)threadListeners.get(args[0])?.(thread(args[0],{developerRead:1}));},
  emit(t){rows=[t];for(const w of [...watchers])w.fn({rows:w.scope.developer?rows:rows.filter(t=>t.ownerId===account.uid),more:false,cursor:'page0'});},
  emitMessages(rows){messageNext({rows,more:false});},change(uid){account={uid,isGuest:false,isDeveloper:false};listener(account);}
 };
 const api=mountFeedback({config:{enabled:true},service,rootUrl:new URL('https://game.example.test/')});
 const show=async()=>{await api.open();await tick();};
 const openThread=async(id='report')=>{document.querySelector(`[data-thread-id="${id}"]`).click();const list=document.querySelector('.fb-messages');list.getBoundingClientRect=()=>({top:100,bottom:400,height:300});Object.defineProperties(list,{scrollHeight:{value:300,configurable:true},clientHeight:{value:300,configurable:true}});document.querySelector('.fb-detail').getBoundingClientRect=()=>({top:50,bottom:500,height:450});for(const row of list.querySelectorAll('article'))row.getBoundingClientRect=()=>({top:200,bottom:250,height:50});list.dispatchEvent(new window.Event('scroll'));await tick();};
 return{dom,api,service,scopes,reads,loads,sends,show,openThread,close(){api.close();dom.window.close();}};
}
test('developer has one inbox with no personal switch and keeps notifications',async()=>{
 const g=setup();await g.show();assert.equal(g.scopes[0].developer,true);assert.ok(document.querySelector('[data-thread-id="report"]'));
 assert.equal(document.querySelector('#feedback-developer'),null);assert.equal(document.querySelector('#feedback-new').hidden,true);assert.equal(document.querySelector('#feedback-heading').textContent,'Developer inbox');g.service.emit(thread('report',{playerMessages:2}));
 assert.equal(document.querySelector('#ptbo-feedback-entry').dataset.unread,'true');g.close();
});
test('developer read acknowledgement waits for rendered latest content in a visible tab',async()=>{
 const g=setup();await g.show();await g.openThread();assert.equal(g.reads.length,1);assert.equal(g.reads[0][2],'m1');g.reads.length=0;
 Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});g.service.emit(thread('report',{lastMessageId:'m2',playerMessages:2}));await tick();assert.equal(g.reads.length,0,'parent update cannot acknowledge missing message');
 g.service.emitMessages([{id:'m1',body:'Original',authorRole:'player',createdAt:{toMillis:()=>1}},{id:'m2',body:'New report',authorRole:'player',createdAt:{toMillis:()=>2}}]);await tick();assert.equal(g.reads.length,0,'hidden tab remains unread');
 Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});const last=document.querySelector('[data-message-id="m2"]');last.getBoundingClientRect=()=>({top:200,bottom:250,height:50});document.dispatchEvent(new window.Event('visibilitychange'));await tick();assert.equal(g.reads.length,1);assert.equal(g.reads[0][2],'m2');g.close();
});
test('scrolling away from the latest message keeps it unread until visible',async()=>{
 const g=setup();await g.show();await g.openThread();g.reads.length=0;g.service.emit(thread('report',{lastMessageId:'m2',playerMessages:2}));g.service.emitMessages([{id:'m2',body:'New',authorRole:'player',createdAt:{toMillis:()=>2}}]);
 const last=document.querySelector('[data-message-id="m2"]');last.getBoundingClientRect=()=>({top:600,bottom:650,height:50});await tick();assert.equal(g.reads.length,0);last.getBoundingClientRect=()=>({top:200,bottom:250,height:50});document.querySelector('.fb-messages').dispatchEvent(new window.Event('scroll'));await tick();assert.equal(g.reads[0][2],'m2');g.close();
});
test('developer queue searches older pages automatically and exposes complete counts',async()=>{
 const g=setup({pages:[{rows:[thread('older',{title:'A buried school report',priority:'high'})],more:false,cursor:'page1'}]});await g.show();assert.equal(g.loads.length,1);
 const search=document.querySelector('input[type="search"]');search.value='buried';search.dispatchEvent(new window.Event('input'));assert.ok(document.querySelector('[data-thread-id="older"]'));assert.match(document.querySelector('.fb-queue-summary').textContent,/1.*2/);g.close();
});
test('queue search covers report identifiers, address and priority filtering',()=>{
 const t=thread('r',{locationReport:{reason:'radius',snapshot:{callId:'school-17',datasetId:'city-dataset',question:{address:'1175 Brealey Drive',crossStreets:['Cherry Lane']}}}});
 for(const search of ['school-17','brealey','cherry','city-dataset'])assert.equal(filterThreads([t],{search},'dev',true).length,1);
 assert.equal(filterThreads([t],{priority:'high'},'dev',true).length,0);
});

test('reading an older scanned conversation refreshes its row and unread filter without a top-page update',async()=>{
 const g=setup({readUpdatesThread:true,pages:[{rows:[thread('older')],more:false,cursor:'page1'}]});await g.show();g.service.emit(thread('report',{developerRead:1}));await g.openThread('older');
 assert.equal(document.querySelector('[data-thread-id="older"]').dataset.unread,'false');assert.equal(document.querySelector('#ptbo-feedback-entry').dataset.unread,'false');g.close();
});

test('new feedback keeps game context collapsed and submits its automatically filled values',async()=>{
 const g=setup({admin:false});await g.show();document.querySelector('#feedback-new').click();
 const details=document.querySelector('.fb-message-context');assert.ok(details);assert.equal(details.open,false);
 const city=document.querySelector('#feedback-city').value,mode=document.querySelector('#feedback-mode').value,department=document.querySelector('#feedback-department').value;
 document.querySelector('#feedback-title').value='Training idea';document.querySelector('#feedback-body').value='Please add more locations.';
 document.querySelector('.fb-new-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(g.sends.length,1);assert.equal(g.sends[0].newThread.city,city);assert.equal(g.sends[0].newThread.mode,mode);assert.equal(g.sends[0].newThread.department,department);assert.equal(g.sends[0].body,'Please add more locations.');g.close();
});

test('demo requests use existing inbox, timestamps, identity labels and category filters',async()=>{
 const g=setup();await g.api.requestDemo({city:'oshawa',cityName:'Oshawa',mode:'route'});assert.equal(g.sends[0].newThread.category,'demo');
 await g.api.openDemoConversation('oshawa','route');await tick();assert.match(document.querySelector('.fb-detail-header').textContent,/your account|You/i);assert.equal(document.querySelector('time').getAttribute('datetime'),'1970-01-01T00:00:00.001Z');
 const filter=document.querySelector('[data-filter="category"]');assert.ok([...filter.options].some(x=>x.value==='demo'));
 g.service.change('other');assert.equal(g.api.demoRequestStatus('oshawa','route').remoteSaved,false);await assert.rejects(g.api.openDemoConversation('oshawa','route'));g.close();
});

test('all feedback categories share one queue with collapsed secondary controls and clearable filters',async()=>{
 const rows=['bug','map','idea','question','demo'].map((category,i)=>thread('category-'+i,{category}));
 const g=setup({pages:[{rows,more:false,cursor:'page1'}]});await g.show();
 assert.equal(document.querySelectorAll('[data-thread-id]').length,6);
 assert.equal(document.querySelector('.fb-inbox-filters').open,false);assert.equal(document.querySelector('.fb-inbox-tools').open,false);
 const category=document.querySelector('[data-filter="category"]');category.value='demo';category.dispatchEvent(new window.Event('input'));assert.equal(document.querySelectorAll('[data-thread-id]').length,1);assert.equal(document.querySelector('#feedback-clear-filters').hidden,false);
 document.querySelector('#feedback-clear-filters').click();assert.equal(document.querySelectorAll('[data-thread-id]').length,6);
 document.querySelector('#feedback-unread').click();assert.equal(document.querySelector('#feedback-unread').getAttribute('aria-pressed'),'true');g.close();
});
test('large queues render in batches but search still finds all older matching messages',async()=>{
 const rows=Array.from({length:120},(_,i)=>thread('older-'+i,{title:i===119?'Oldest demo request':'Feedback '+i,category:'demo'}));
 const g=setup({pages:[{rows,more:false,cursor:'page1'}]});await g.show();assert.equal(document.querySelectorAll('[data-thread-id]').length,40);
 document.querySelector('#feedback-more-results').click();assert.equal(document.querySelectorAll('[data-thread-id]').length,80);
 const search=document.querySelector('input[type="search"]');search.value='Oldest demo';search.dispatchEvent(new window.Event('input'));assert.equal(document.querySelectorAll('[data-thread-id]').length,1);assert.ok(document.querySelector('[data-thread-id="older-119"]'));g.close();
});
test('players and guests never receive developer controls and identity changes clear prior filters',async()=>{
 const g=setup();await g.show();document.querySelector('#feedback-unread').click();g.service.change('player');await g.show();
 assert.equal(document.querySelector('#feedback-heading').textContent,'Feedback & messages');assert.equal(document.querySelector('#feedback-new').hidden,false);assert.equal(document.querySelector('#feedback-unread'),null);assert.equal(document.querySelector('.fb-inbox-tools'),null);assert.ok(document.querySelector('[data-thread-id="report"]'));g.close();
});
