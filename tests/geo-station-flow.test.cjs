'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const {game}=require('./helpers/geo-game.cjs');
test('Geo asks for service, difficulty and base, using the same ranked addresses for both services',async()=>{
 const g=await game();assert.ok(g.api,'application API initialized');
 g.api.chooseService('fire');g.api.chooseDifficulty('easy');assert.equal(g.api.start(0),true);const fire=g.api.state.pool.map(c=>c.id).sort();
 assert.equal(fire.length,100);assert.equal(g.map.zoom,18);assert.equal(g.map.center.lat,44.30102);
 g.api.finish();g.api.chooseService('ems');g.api.chooseDifficulty('easy');g.api.start(0);
 assert.deepEqual(g.api.state.pool.map(c=>c.id).sort(),fire);assert.equal(g.map.center.lat,44.304776);
 assert.equal(g.node('call-type').textContent,'Easy');assert.doesNotMatch(g.node('call-type').textContent,/Fire|EMS|Medical/);
});
test('EMS setup discloses all-tier care-home practice and displays the sourced target rank',async()=>{
 const care={id:'moh-ltc-9',name:'Sourced Care Home',addr:'9 Oak Road',lat:44.31,lng:-78.31,radius:65,recognitionDifficulty:'medium',facilityType:'long-term-care',trainingServices:['ems']};
 const g=await game({locations:[care]});assert.ok(g.api);
 g.node('ems-priority-note').hidden=true;g.api.chooseService('ems');
 assert.equal(g.node('ems-priority-note').hidden,false,'EMS selection should disclose care-home practice at every difficulty');
 g.api.chooseDifficulty('easy');assert.equal(g.api.start(0),true);
 assert.equal(g.node('call-type').textContent,'Care home · Medium','the card should show the care home’s actual rank, not the selected tier');
});
test('correct answers wait for Next Call and each call resets to the chosen base',async()=>{
 const g=await game();assert.ok(g.api);g.api.chooseService('ems');g.api.chooseDifficulty('hard');g.api.start(0);
 const first=g.api.state.target;g.map.center={lat:first.lat,lng:first.lng};g.api.check();assert.equal(g.api.state.target,first);
 assert.equal(g.node('practice-continue').hidden,false);g.api.next();assert.notEqual(g.api.state.target,first);
 assert.equal(g.map.center.lat,44.304776);assert.equal(g.map.zoom,18);
});
test('cross streets default visible, remain separate and honor the remembered hidden setting',async()=>{
 const g=await game({savedCross:'false'});assert.ok(g.api);g.api.chooseService('fire');g.api.chooseDifficulty('medium');g.api.start(0);
 assert.equal(g.node('call-cross-streets').hidden,true);assert.equal(g.node('show-cross-streets').checked,false);
 g.api.revealCrossStreets();assert.equal(g.node('call-cross-streets').hidden,false);g.api.reveal();g.api.next();assert.equal(g.node('call-cross-streets').hidden,true);
 g.api.setCrossStreets(true);assert.equal(g.storage.get('geoShowCrossStreets'),'true');assert.equal(g.node('call-cross-streets').hidden,false);
 assert.ok(g.node('call-cross-streets').textContent.includes(g.api.state.target.crossStreets[0]));
 assert.equal(g.node('call-address').textContent,g.api.state.target.addr);
});
test('wrong guesses retain the call for retry and Finish cancels the session',async()=>{
 const g=await game({storageDenied:true});assert.ok(g.api);g.api.chooseService('fire');g.api.chooseDifficulty('hard');g.api.start(0);
 const target=g.api.state.target;g.api.check();assert.equal(g.api.state.target,target);assert.equal(g.api.state.session.stats.completed,0);
 g.api.retry();g.api.reveal();assert.equal(g.node('practice-continue').hidden,false);g.api.finish();assert.equal(g.api.state.session,null);assert.equal(g.api.next(),false);
});
