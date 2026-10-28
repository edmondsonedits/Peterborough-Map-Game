'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {game}=require('./helpers/geo-game.cjs'),root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const {runtime}=require('./helpers/city-runtime.cjs');
test('all 31 Geo cities share the compact call card, return flow and answer feedback on desktop and phones',async()=>{
 const ids=['peterborough',...fs.readdirSync(path.join(root,'cities')).filter(id=>fs.existsSync(path.join(root,'cities',id,'geo-data.json')))];
 assert.equal(ids.length,31);let sessions=0;
 for(const id of ids){
  const pack=id==='peterborough'?undefined:JSON.parse(read(`cities/${id}/geo-data.json`)),loaded=runtime({search:'?city='+id,pack});
  Object.assign(loaded.c,{atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array,Response,Blob,DecompressionStream});
  await loaded.c.PTBO_GEO_CITY_READY;
  const cityPackage=loaded.c.PTBO_CITY_PACKAGE,locations=loaded.c.PTBO_DISPATCH_STORE.getAll(),baseRecords=['fire','ems'].flatMap(service=>loaded.c.PTBO_BASE_STORE.getBases(service));
  for(const mobile of [false,true])for(const service of ['fire','ems']){
   const label=`${id} ${service} ${mobile?'phone':'desktop'}`,g=await game({cityPackage,locations,baseRecords,mobile}),available=baseRecords.filter(b=>b.service===service);
   g.api.chooseService(service);g.api.chooseDifficulty('easy');assert.equal(g.api.start(0),true,label);sessions++;
   assert.equal(g.node('body').classList.contains('ptbo-geo-compact'),true,label);
   assert.equal(g.node('practice-feedback').textContent,'',label);
   assert.equal(g.node('call-address').textContent,g.api.state.target.addr,label);
   assert.equal(g.node('call-cross-streets').hidden,false,label);assert.match(g.node('call-cross-streets').textContent,/^Cross: /,label);
   assert.equal(g.node('call-toggle')['aria-expanded'],'true',label);g.map.fire('dragstart');assert.equal(g.node('call-toggle')['aria-expanded'],'false',label);
   g.api.finish();assert.equal(g.node('base-step').hidden,false,label);assert.equal(g.api.state.service,service,label);assert.equal(g.api.state.difficulty,'easy',label);
   assert.equal(g.api.start(available.length-1),true,label);const target=g.api.state.target;
   g.map.setView([target.lat+.05,target.lng+.05],18);assert.equal(g.api.check(),false,label);
   assert.equal(g.node('game').dataset.feedback,'incorrect',label);assert.equal(g.node('guess-effect-label').textContent,'Incorrect',label);
   assert.equal(g.api.retry(),true,label);assert.equal(g.api.state.target,target,label);assert.equal(g.node('guess-effect').hidden,true,label);
   g.map.setView([target.lat,target.lng],18);assert.equal(g.api.check(),true,label);
   assert.equal(g.node('game').dataset.feedback,'correct',label);assert.equal(g.node('guess-effect-label').textContent,'Correct',label);
   const markers=g.layers.filter(l=>l.kind==='marker').slice(-2);assert.equal(markers[0].options.fillColor,markers[1].options.fillColor,label);
   g.api.next();assert.equal(g.node('game').dataset.feedback,undefined,label);assert.equal(g.node('call-cross-streets').hidden,false,label);
   assert.equal(g.map.getCenter().lat,available.at(-1).lat,label);assert.equal(g.map.getZoom(),18,label);
   g.api.reveal();assert.equal(g.node('game').dataset.feedback,'revealed',label);assert.equal(g.node('guess-effect').hidden,true,label);
   g.api.finish();assert.equal(g.node('game').dataset.feedback,undefined,label);
  }
 }assert.equal(sessions,124);
});
test('Geo setup identifies the selected city and starts every eligible base/tier through the same engine',async()=>{
 const dirs=fs.readdirSync(path.join(root,'cities')).filter(id=>fs.existsSync(path.join(root,'cities',id,'geo-data.json')));assert.equal(dirs.length,30);let starts=0;
 for(const id of dirs){const pack=JSON.parse(read(`cities/${id}/geo-data.json`)),bases=pack.bases.filter(b=>b.status==='active'&&b.selectionEligible),g=await game({cityPackage:pack,locations:pack.locations,baseRecords:bases});
  assert.match(g.node('geo-city-label').textContent,new RegExp(pack.name));
  for(const tier of ['easy','medium','hard']){assert.equal(g.node('count-'+tier).textContent,tier==='easy'?'10':'5');
   for(const service of ['fire','ems']){g.api.chooseService(service);g.api.chooseDifficulty(tier);const pool=g.api.state.locations.filter(l=>l.recognitionDifficulty===tier).map(l=>l.id).sort();
    for(let i=0;i<bases.filter(b=>b.service===service).length;i++){assert.equal(g.api.start(i),true);starts++;assert.equal(g.map.getCenter().lat,g.api.state.base.lat);assert.equal(g.map.getZoom(),18);assert.equal(g.api.state.target.recognitionDifficulty,tier);assert.deepEqual(g.api.state.pool.map(l=>l.id).sort(),pool);
     g.api.reveal();assert.equal(g.node('practice-continue').hidden,false);g.api.next();assert.equal(g.map.getCenter().lng,g.api.state.base.lng);assert.equal(g.map.getZoom(),18);g.api.finish();}
   }
  }
 }assert.equal(starts,1746);
});
test('readiness failure leaves Start unavailable with an explicit city error and retry',async()=>{
 const g=await game({cityReady:Promise.reject(new Error('Geo Guesser demo is not available for this city.'))});
 assert.equal(g.api.state.ready,false);assert.match(g.node('practice-setup-status').textContent,/not available for this city/);assert.equal(g.node('load-retry').hidden,false);g.api.chooseService('fire');g.api.chooseDifficulty('easy');assert.equal(g.api.start(0),false);
});
test('wrapper forwards selected city/version for every surface without an early Peterborough navigation',async()=>{
 for(const surface of ['desktop','mobile','online']){
  const html=read(`geo-guesser/${surface}/index.html`);assert.doesNotMatch(html,/<iframe[^>]+\ssrc=/);
  for(const city of ['toronto','ottawa','not-a-city']){const frame={dataset:{gameSrc:'../index.html'},src:'',addEventListener(){},contentDocument:null},loading={classList:{add(){}},remove(){}};
   const c=vm.createContext({URL,URLSearchParams,setTimeout,location:{href:`https://example.test/game/geo-guesser/${surface}/?city=${city}&v=preview`},localStorage:{getItem:()=> 'peterborough'},document:{getElementById:id=>id==='game-frame'?frame:loading,querySelector:()=>null,querySelectorAll:()=>[]}});c.window=c;vm.runInContext(read('cities/city-registry.js'),c);vm.runInContext(read('geo-guesser/wrapper.js'),c);
   const url=new URL(frame.src);assert.equal(url.pathname,'/game/geo-guesser/index.html');assert.equal(url.searchParams.get('city'),city);assert.equal(url.searchParams.get('v'),'preview');
  }
 }
});
test('future bases are visible as unavailable information without becoming starting buttons',async()=>{
 const pack={id:'demo-city',name:'Demo City',futureBases:[{id:'future-fire',service:'fire',name:'Station 9',address:'Future Road',status:'planned',constructionStage:'under-construction',expectedOpening:'2027'},{id:'future-ems',service:'ems',name:'EMS 9',address:'Future Lane',status:'needs-review'}]},g=await game({cityPackage:pack});
 g.api.chooseService('fire');g.api.chooseDifficulty('easy');assert.equal(g.node('future-base-details').hidden,false);assert.equal(g.node('future-base-list').children.length,1);assert.match(g.node('future-base-list').children[0].textContent,/Station 9.*under construction.*2027/i);assert.equal(g.node('practice-stations').children.length,1);
 g.api.chooseService('ems');g.api.chooseDifficulty('easy');assert.match(g.node('future-base-list').children[0].textContent,/EMS 9.*unconfirmed/i);
});
test('unlocked Geo settings open the selected demo city in the shared editor',async()=>{
 const g=await game({cityPackage:{id:'toronto',name:'Toronto'},developerMode:true});assert.equal(g.node('developer-settings').hidden,false);assert.match(g.node('developer-settings').href,/dispatch-editor\/\?city=toronto/);
});
