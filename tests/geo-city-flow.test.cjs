'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {game}=require('./helpers/geo-game.cjs'),root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('Geo setup identifies the selected city and starts every eligible base/tier through the same engine',async()=>{
 const dirs=fs.readdirSync(path.join(root,'cities')).filter(id=>!['belleville','scarborough'].includes(id)&&fs.existsSync(path.join(root,'cities',id,'geo-data.json')));assert.equal(dirs.length,30);let starts=0;
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
