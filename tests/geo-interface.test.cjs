'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'geo-guesser/index.html'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function screens(){
 const nodes=new Map(),tasks=[];let active;
 function node(id){if(nodes.has(id))return nodes.get(id);const values=new Set(id==='menu'?[]:['hidden']);const n={id,isConnected:true,attrs:{},classList:{add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x)},setAttribute(k,v){this.attrs[k]=v},focus(){active=this},querySelector(){return node(id+'-heading')}};nodes.set(id,n);return n}
 ['menu','modes','practice-modes','how-to','stations','settings','game'].forEach(node);
 const context=vm.createContext({document:{getElementById:node,querySelectorAll:()=>[...nodes.values()].filter(n=>!n.id.endsWith('-heading')),get activeElement(){return active}},setTimeout:fn=>tasks.push(fn),map:null,editorMap:null});
 const source=html.slice(html.indexOf('    const $=id=>'),html.indexOf('    function callStyle'));
 vm.runInContext(source,context);
 return {node,context,run:s=>vm.runInContext(s,context),tick(){while(tasks.length)tasks.shift()()},focus(n){active=n},active:()=>active};
}
test('screen entry focuses its heading and Back restores the initiating control',()=>{
 const h=screens(),button=h.node('settings-button');h.focus(button);h.run("show('settings')");h.tick();assert.equal(h.active(),h.node('settings-heading'));
 h.run("show('menu')");h.tick();assert.equal(h.active(),button);
});
test('a superseded view cannot steal focus after a rapid navigation',()=>{
 const h=screens();h.run("show('settings');show('modes')");h.tick();assert.equal(h.active(),h.node('modes-heading'));
});
test('Practice and Timed Games open accurately grouped modes directly with replayable instructions',()=>{
 const sections=Object.fromEntries([...html.matchAll(/<section id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)].map(m=>[m[1],m[2]]));
 assert.match(sections.menu,/onclick="show\('practice-modes'\)"[^>]*>Practice/);
 assert.match(sections.menu,/onclick="show\('modes'\)"[^>]*>Timed Games/);
 assert.match(sections['practice-modes'],/selectMode\('practice'\)/);assert.match(sections['practice-modes'],/selectMode\('open'\)/);assert.doesNotMatch(sections['practice-modes'],/selectMode\('random'\)/);
 assert.match(sections.modes,/selectMode\('city-ten'\)/);assert.match(sections.modes,/selectMode\('random'\)/);assert.doesNotMatch(sections.modes,/selectMode\('open'\)|selectMode\('practice'\)/);assert.match(sections.menu,/How to Play/);
});
function wrapper({core=false,store=Promise.resolve()}={}){
 const timers=new Map(),events={},listeners={},nodes=new Map();let seq=0,clients=0;
 const node=id=>{if(nodes.has(id))return nodes.get(id);const n={id,hidden:false,textContent:'',classList:{add(){},remove(){}},setAttribute(){},focus(){n.focused=true},addEventListener(name,fn){listeners[id+':'+name]=fn}};nodes.set(id,n);return n};
 const doc=()=>({readyState:'complete',URL:'https://example.test/geo-guesser/index.html',body:{appendChild(){clients++}},head:{appendChild(){}},createElement:()=>({dataset:{},remove(){}})});
 const game={show:core?()=>{}:undefined,__ptboGeoCoreReady:core};const frame=node('game-frame');frame.contentDocument=doc();frame.contentWindow=game;frame.src='../index.html';frame.addEventListener=(name,fn)=>events[name]=fn;
 const context=vm.createContext({URL,console:{error(){},warn(){}},location:{href:'https://example.test/geo-guesser/desktop/'},document:{currentScript:{dataset:{geoSurface:'desktop'}},getElementById:node},setTimeout(fn,delay){const id=++seq;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),setInterval(){},clearInterval(){},PTBO_DISPATCH_STORE:{ready:()=>store},addEventListener:(name,fn)=>events['window:'+name]=fn});context.window=context;
 vm.runInContext(fs.readFileSync(path.join(root,'geo-guesser/wrapper.js'),'utf8'),context);
 return {frame,game,nodes,node,timers,events,listeners,clients:()=>clients,doc,tick(delay){for(const[id,t]of [...timers])if(t.delay===delay){timers.delete(id);t.fn()}}};
}
test('missing core reaches a bounded recoverable state and retry waits for a replacement document',async()=>{
 const h=wrapper();h.tick(20000);await flush();assert.equal(h.node('startup-recovery').hidden,false);assert.match(h.node('startup-status').textContent,/could not|couldn’t|unable/i);assert.equal(h.frame.inert,true);
 h.listeners['startup-retry:click']();assert.equal(h.node('startup-recovery').hidden,true);h.game.show=()=>{};h.game.__ptboGeoCoreReady=true;h.frame.contentDocument=h.doc();h.events.load();await flush();assert.equal(h.frame.inert,false);assert.equal(h.clients(),1);
});
test('duplicate load signals share client installation and pagehide cancels late startup',async()=>{
 let resolve;const store=new Promise(r=>resolve=r);const h=wrapper({core:true,store});h.events.load();h.events.load();h.events['window:pagehide']();resolve();await flush();assert.equal(h.clients(),0);
});
test('old document startup cannot reveal a replacement document',async()=>{
 let resolve;const h=wrapper({core:true,store:new Promise(r=>resolve=r)});h.frame.contentDocument=h.doc();h.game.show=undefined;h.events.load();resolve();await flush();assert.equal(h.frame.inert,true);assert.equal(h.clients(),0);
});

test('ready game installs optional clients once despite duplicate load signals',async()=>{
 const h=wrapper({core:true});h.events.load();h.events.load();await flush();assert.equal(h.clients(),1);assert.equal(h.frame.inert,false);
});
test('hung shared data reaches recovery without installing optional clients',async()=>{
 const h=wrapper({core:true,store:new Promise(()=>{})});h.tick(20000);await flush();assert.equal(h.node('startup-recovery').hidden,false);assert.equal(h.frame.inert,true);assert.equal(h.clients(),0);
});
test('a partial core with a show function remains covered until its completed initialization signal',async()=>{
 const h=wrapper();h.game.show=()=>{};h.tick(100);await flush();assert.equal(h.clients(),0);assert.equal(h.frame.inert,true);
 h.game.__ptboGeoCoreReady=true;h.tick(100);await flush();assert.equal(h.frame.inert,false);assert.equal(h.clients(),1);
});

test('a later iframe reload also gets its own bounded deadline',async()=>{
 const h=wrapper({core:true});await flush();assert.equal(h.frame.inert,false);
 h.frame.contentDocument=h.doc();h.game.show=undefined;h.events.load();h.tick(20000);await flush();assert.equal(h.node('startup-recovery').hidden,false);assert.equal(h.frame.inert,true);
});
test('local save retains its record schema and uses the local scoreboard even when online handlers differ',()=>{
 const functions=['readLocalScores','saveScore'].map(name=>html.split(/\r?\n/).find(line=>line.trimStart().startsWith(`function ${name}(`))).join('\n');
 let saved,local=0,online=0;const nodes={player:{value:'Learner'},'score-status':{textContent:''}};
 const context=vm.createContext({console,Number,JSON,String,sessionEnded:true,gameMode:'random',history:[{}],elapsed:17.5,scoreSaved:false,$:id=>nodes[id],modeName:()=> 'Random Shift',localStorage:{getItem:()=>null,setItem(k,v){saved={k,value:JSON.parse(v)}}},showScores:()=>online++,showLocalScores:()=>local++});context.window=context;
 vm.runInContext(functions,context);vm.runInContext('saveScore();saveScore()',context);
 assert.deepEqual(saved,{k:'geoScores',value:[{name:'Learner',time:17.5,mode:'Random Shift'}]});assert.equal(local,1);assert.equal(online,0);
});
test('denied local score storage keeps the results and exposes the associated status',()=>{
 const functions=['readLocalScores','saveScore'].map(name=>html.split(/\r?\n/).find(line=>line.trimStart().startsWith(`function ${name}(`))).join('\n');
 const status={textContent:''};let navigated=false;
 const context=vm.createContext({console:{warn(){}},Number,JSON,String,sessionEnded:true,gameMode:'random',history:[{}],elapsed:17.5,scoreSaved:false,$:id=>id==='player'?{value:'Learner'}:status,modeName:()=> 'Random Shift',localStorage:{getItem:()=>null,setItem(){throw Error('denied')}},showLocalScores:()=>{navigated=true}});context.window=context;
 vm.runInContext(functions,context);vm.runInContext('saveScore()',context);
 assert.equal(navigated,false);assert.match(status.textContent,/could not be saved/);assert.equal(context.scoreSaved,false);
});

test('retry returns keyboard input to the active map after clearing the review',()=>{
 let focused=false;
 const node={classList:{add(){},remove(){}},focus(){focused=true}};
 const context=vm.createContext({$ :()=>node,practiceReview:{outcome:'incorrect',center:{lat:1,lng:2},zoom:16},clearPracticeResultReview(){},map:{stop(){return this},setView(){return this}},practiceFeedback(){}});
 const source=html.split(/\r?\n/).find(line=>line.trimStart().startsWith('function resumePracticeReview('));
 vm.runInContext(source,context);context.resumePracticeReview();assert.equal(focused,true);
});
test('a new practice location restores map focus after the previous action is hidden',()=>{
 let focused=false;
 const node={classList:{add(){},remove(){}},focus(){focused=true}};
 const context=vm.createContext({$ :()=>node,clearPracticeResultReview(){},applyCallTheme(){},practiceService:'fire',practiceSession:{stats:{}},practiceStatsText:()=>'',practiceFeedback(){},station:{lat:1,lng:2},map:{stop(){return this},setView(){return this}}});
 const source=html.split(/\r?\n/).find(line=>line.trimStart().startsWith('function loadPracticeTarget('));
 vm.runInContext(source,context);context.loadPracticeTarget({name:'Example',addr:'Example address'});assert.equal(focused,true);
});

// Execute the injected bridge and the real guarded compat client in their child
// document. Counting appendChild alone cannot detect overwritten live handlers.
test('BFCache restore keeps live scoreboard handlers and shares the installed client',async()=>{
 const events={},timers=new Map(),nodes=new Map();let sequence=0,bridgeExecutions=0,clientExecutions=0,writes=0,visible='results';
 const node=id=>{if(nodes.has(id))return nodes.get(id);const n={id,hidden:true,textContent:'',innerHTML:'',value:'Learner',classList:{add(){},remove(){},contains:()=>id==='results'&&visible!=='results'},setAttribute(){},focus(){},querySelector:()=>node('online-save'),replaceChildren(p){this.textContent=p.textContent},addEventListener(){}};nodes.set(id,n);return n};
 const collection={limit(){return{get:async()=>({docs:[]})}},doc(){return{set:async()=>{writes++}}}};
 const firebase={apps:[],initializeApp:()=>({firestore:()=>({settings(){},collection:()=>collection})}),firestore:Object.assign(()=>{}, {FieldValue:{serverTimestamp:()=>0}})};
 const childDoc={readyState:'complete',createElement:()=>({textContent:'',get innerHTML(){return this.textContent},remove(){}}),documentElement:{dataset:{}},getElementById:node,querySelectorAll:()=>[],querySelector:selector=>node(selector.includes('city-ten')?'city-ten-list':'score-list')};
 const child=vm.createContext({console:{warn(){},error(){}},document:childDoc,firebase,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem(){}},alert(){},show:id=>{visible=id},elapsed:20,station:{name:'Station 1'},modeName:()=> 'Random Shift',sessionEnded:true,gameMode:'random',history:[{}],targets:[{}],scoreSessionId:1,__ptboGeoCoreReady:true});child.window=child;
 childDoc.body={appendChild(script){bridgeExecutions++;vm.runInContext(script.textContent,child)}};
 childDoc.head={appendChild(script){clientExecutions++;vm.runInContext(fs.readFileSync(path.join(root,'geo-guesser/firebase-scoreboard-compat.js'),'utf8'),child);script.onload?.()}};
 const frame=node('game-frame');frame.src='../index.html';frame.contentDocument=childDoc;frame.contentWindow=child;frame.addEventListener=(name,fn)=>events[name]=fn;
 const context=vm.createContext({URL,console:{warn(){},error(){}},location:{href:'https://example.test/geo-guesser/desktop/'},document:{currentScript:{dataset:{geoSurface:'desktop'}},getElementById:node},PTBO_DISPATCH_STORE:{ready:async()=>{}},setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>events[name]=fn});context.window=context;
 vm.runInContext(fs.readFileSync(path.join(root,'geo-guesser/wrapper.js'),'utf8'),context);await flush();await child.__geoScoreboardReadyPromise;
 const handlers={personal:child.showPersonalScores,city:child.showCityTenScores,save:child.saveScore};
 events.pagehide({persisted:true});events.pageshow({persisted:true});await flush();
 assert.equal(child.showPersonalScores,handlers.personal,'restore must preserve the real Personal Scores handler');
 assert.equal(child.showCityTenScores,handlers.city,'restore must preserve the real City Ten handler');
 assert.equal(child.saveScore,handlers.save,'restore must preserve the guarded upload handler');
 await child.showPersonalScores('Station 1');assert.match(node('score-list').innerHTML,/No online scores/);
 await child.showCityTenScores();assert.match(node('city-ten-list').innerHTML,/No online scores/);
 visible='results';await child.shareOnlineScore();assert.equal(writes,1,'restored explicit sharing still uploads once');
 assert.equal(bridgeExecutions,1);assert.equal(clientExecutions,1);assert.equal(frame.inert,false);
});
