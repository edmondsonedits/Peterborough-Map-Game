'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p));
function scoreHarness(){
 let resolveUpload,rejectUpload,generated=0,writes=0,current={completed:true,sessionId:1,responseTimeSeconds:20,station:'Station 1',callType:'Random Shift'},visible='results';const screens=[];
 const refs=[],write=id=>{writes++;refs.push(id);return new Promise((r,j)=>{resolveUpload=r;rejectUpload=j;});};
 const button={},collection={limit(){return{get:async()=>({docs:[]})};},add(){return write('doc'+(++generated));},doc(){const id='doc'+(++generated);return{id,set(){return write(id);}};}};
 const nodes={player:{value:'QA',addEventListener(){}},'score-row':{querySelector:()=>button},results:{classList:{contains:()=>visible!=='results'}},'score-list':{}};
 const firebase={apps:[],initializeApp:()=>({firestore:()=>({settings(){},collection:()=>collection})}),firestore:Object.assign(()=>{}, {FieldValue:{serverTimestamp:()=>0}})};
 const c=vm.createContext({console:{error(){},warn(){}},setTimeout,clearTimeout,firebase,localStorage:{getItem:()=>null,setItem(){}},alert(){},document:{documentElement:{dataset:{}},getElementById:id=>nodes[id],querySelectorAll:()=>[],createElement:()=>({textContent:'',get innerHTML(){return this.textContent;}})},geoScoreContext:()=>current,show:id=>{visible=id;screens.push(id);}});
 c.window=c;vm.runInContext(read('geo-guesser/firebase-scoreboard-compat.js').toString(),c);
 return{c,button,screens,refs,reject(){rejectUpload(new Error('Unknown upload outcome'));},get writes(){return writes;},changeSession(){current={...current,sessionId:2,completed:false};visible='game';},incomplete(){current.completed=false;},resolve(){resolveUpload();}};
}
test('late score upload preserves the new game screen and save button',async()=>{
 const h=scoreHarness();await h.c.__geoScoreboardReadyPromise;const save=h.c.saveScore();await Promise.resolve();assert.equal(h.writes,1);
 h.changeSession();h.button.textContent='Save';h.button.disabled=false;h.resolve();await save;
 assert.deepEqual(h.screens,[]);assert.equal(h.button.textContent,'Save');assert.equal(h.button.disabled,false);
});
test('concurrent and repeated online saves write a completed session once',async()=>{
 const h=scoreHarness();await h.c.__geoScoreboardReadyPromise;const first=h.c.saveScore();await Promise.resolve();await h.c.saveScore();assert.equal(h.writes,1);h.resolve();await first;await h.c.saveScore();assert.equal(h.writes,1);assert.equal(h.button.disabled,true);
});
test('unfinished score contexts never write an online record',async()=>{
 const h=scoreHarness();await h.c.__geoScoreboardReadyPromise;h.incomplete();await h.c.saveScore();assert.equal(h.writes,0);
});
test('both current and cached Tunnel Break loaders retain matching immutable payloads',()=>{
 for(const old of [false,true]){
 const loader=old?'const fs='+JSON.stringify(Array.from({length:13},(_,i)=>`v31-${String(i+1).padStart(2,'0')}.b64`))+";digest!=='39c841919cc0a35d6413961ea9dd7a3560f216f38aeef9ebd8f70b669be45f5b'":read('tunnel-break/index.html').toString();
 const names=loader.match(/const fs=(\[[^\]]*\])/)[1].match(/v\d+-\d+\.b64/g);
 const html=zlib.gunzipSync(Buffer.from(names.map(n=>read('tunnel-break/'+n).toString().trim()).join(''),'base64'));
 assert.equal(crypto.createHash('sha256').update(html).digest('hex'),loader.match(/digest!=='([a-f0-9]{64})'/)[1]);
 if(!old)assert.deepEqual(html,read('tools/tunnel-break/game.html'));
 }
});

test('desktop drivetrain tolerates iframe reload before velocity is initialized',()=>{
 let frame;const c=vm.createContext({console,setTimeout,clearTimeout,performance:{now:()=>0},requestAnimationFrame:fn=>{frame=fn;},document:{documentElement:{dataset:{}}},addEventListener(){}});c.window=c;
 vm.runInContext(read('response-simulator/desktop-drivetrain-1.6.68.js').toString(),c);
 assert.doesNotThrow(()=>frame());c.velocity=.001;c.PTBO_DESKTOP_DRIVETRAIN.clamp();assert.ok(c.velocity<.001);
});


test('3D HUD leaves unchanged nodes intact across repeated gameplay frames',()=>{
 const source=read('city-explorer/app.js').toString(),a=source.indexOf('function updateGameplayHud()'),b=source.indexOf('function enterOrExitVehicle()',a);
 let writes=0;const node=()=>{let text='',html='';return{get textContent(){return text;},set textContent(v){text=v;writes++;},get innerHTML(){return html;},set innerHTML(v){html=v;writes++;},classList:{toggle(){writes++;}}};};
 const els=Object.fromEntries(['gameplayRoad','gameplayRole','gameplaySpeed','gameplayGear','interactionPrompt'].map(k=>[k,node()]));
 const dataset=new Proxy({}, {set(o,k,v){writes++;o[k]=v;return true;}});
 const c=vm.createContext({gameplayReady:true,state:{mode:'driving'},fireTruckActor:{position:{x:0,y:0,z:0}},playerActor:{position:{x:0,y:0,z:0}},truckState:{x:0,z:0,y:0,speed:0},fireStationWorld:{x:0,z:0},FIRE_STATION_ONE:{number:2},lastRoadLabel:'',els,document:{documentElement:{dataset}},pavementQA:false,PLAYER_TUNING:{enterDistance:4},TRUCK_TUNING:{exitSpeed:1},gameplaySurfaceAt:()=>({onRoad:false,name:'',height:0})});
 vm.runInContext(source.slice(a,b),c);c.updateGameplayHud();const initial=writes;
 for(let i=0;i<100;i++)c.updateGameplayHud();assert.equal(writes,initial);assert.match(els.gameplayRoad.textContent,/Station 2/);
 c.truckState.speed=3;c.updateGameplayHud();assert.equal(els.gameplaySpeed.textContent,'011');assert.equal(els.gameplayGear.textContent,'D');
});


test('retry after an uncertain upload outcome reuses the same score document',async()=>{
 const h=scoreHarness();await h.c.__geoScoreboardReadyPromise;const first=h.c.saveScore();await Promise.resolve();h.reject();await first;
 const retry=h.c.saveScore();await Promise.resolve();h.resolve();await retry;
 assert.equal(h.refs.length,2);assert.equal(h.refs[0],h.refs[1]);
});


test('low-power renderer keeps its pixel budget after window resizing',()=>{
 const source=read('city-explorer/app.js').toString();
 const calls=[...source.matchAll(/renderer\.setPixelRatio\([^;\n]+\);/g)].map(x=>x[0]);assert.ok(calls.length>=2);
 for(const width of [390,1440,2560]){
  const ratios=[],c=vm.createContext({devicePixelRatio:3,innerWidth:width,lowPowerProfile:true,renderer:{setPixelRatio:r=>ratios.push(r)}});
  for(const call of calls)vm.runInContext(call,c);
  assert.ok(ratios.every(r=>r===1.2),JSON.stringify(ratios));
 }
});


test('parser station loader inserts the alternate-city factory before its package',()=>{
 const writes=[],source=read('shared/stations.js').toString(),end=source.indexOf('  function loadDispatchStore()');
 const c=vm.createContext({URL,URLSearchParams,location:{search:'?city=oshawa'},localStorage:{getItem:()=>null},document:{currentScript:{src:'https://example.com/shared/stations.js?v=1.6.99'},readyState:'loading',write:s=>writes.push(s)}});c.window=c;
 vm.runInContext(source.slice(0,end)+'})();',c);
 const html=writes.join('');assert.ok(html.indexOf('preview-package-factory.js')>=0);assert.ok(html.indexOf('preview-package-factory.js')<html.indexOf('oshawa/package.js'));
 assert.equal((html.match(/v=1\.6\.99/g)||[]).length,2);
});
test('direct alternate-city packages defer creation until their parser-inserted factory runs',()=>{
 for(const city of ['oshawa','belleville','scarborough','pickering','markham','toronto']){
  const writes=[],created=[],c=vm.createContext({URL,location:{href:'https://example.com/?city='+city},console,document:{currentScript:{src:'https://example.com/cities/'+city+'/package.js?v=1.6.99'},readyState:'loading',write:s=>writes.push(s)}});c.window=c;
  assert.doesNotThrow(()=>vm.runInContext(read('cities/'+city+'/package.js').toString(),c));assert.equal(created.length,0);
  const scripts=[...writes.join('').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,2);
  assert.match(scripts[0][1],/preview-package-factory\.js\?v=1\.6\.99/);
  c.PTBO_PREVIEW_CITY_FACTORY={version:'1.6.13',create:config=>created.push(config)};
  vm.runInContext(scripts[1][2],c);assert.equal(created.length,1);assert.equal(created[0].id,city);
  assert.equal(new URL('./dispatch-data.js',created[0].sourceUrl).pathname,'/cities/'+city+'/dispatch-data.js');
 }
});
