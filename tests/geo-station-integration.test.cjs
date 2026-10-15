'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {game}=require('./helpers/geo-game.cjs');
async function started(){const g=await game();g.api.chooseService('fire');g.api.chooseDifficulty('easy');g.api.start(0);return g;}
test('review draws the address, submitted guess and connecting miss line',async()=>{
 const g=await started();g.api.check();
 assert.equal(g.api.state.review.outcome,'incorrect');
 assert.ok(g.layers.some(l=>l.label==='Address location'));assert.ok(g.layers.some(l=>l.label==='Your guess'));
 assert.equal(g.layers.filter(l=>l.kind==='line').length,1);assert.equal(g.node('reticle').hidden,true);
 assert.ok(g.fits.length);assert.equal(g.fits[0].options.animate,false);
});
test('retry removes review layers, retains the target and restores the submitted view',async()=>{
 const g=await started(),target=g.api.state.target,view=g.map.getCenter(),zoom=g.map.getZoom();
 g.api.check();const misses=g.api.state.session.stats.misses;g.api.check();
 assert.equal(g.api.state.review,null);assert.equal(g.api.state.target,target);assert.equal(g.api.state.session.stats.misses,misses);
 assert.equal(g.map.getCenter().lat,view.lat);assert.equal(g.map.getZoom(),zoom);assert.equal(g.node('reticle').hidden,false);assert.ok(g.removed.length);
});
test('correct review persists until Next Call, and Finish removes all review layers',async()=>{
 const g=await started(),target=g.api.state.target;g.map.center={lat:target.lat,lng:target.lng};g.api.check();
 assert.equal(g.api.state.review.outcome,'correct');assert.equal(g.node('confirm').hidden,true);assert.equal(g.node('practice-continue').hidden,false);
 g.api.finish();assert.equal(g.api.state.layers,null);assert.equal(g.api.state.review,null);assert.equal(g.node('game').hidden,true);
});
test('returning to base during retry clears the review and keeps the same target',async()=>{
 const g=await started(),target=g.api.state.target;g.api.check();g.api.returnToBase();
 assert.equal(g.api.state.target,target);assert.equal(g.api.state.review,null);assert.equal(g.map.center.lat,g.api.state.base.lat);assert.equal(g.map.zoom,18);
});
test('result framing reserves positive map area on short landscape screens',async()=>{
 const g=await started();g.node('map').getBoundingClientRect=()=>({top:0,left:0,right:844,bottom:390,width:844,height:390});
 g.node('header').getBoundingClientRect=()=>({top:12,left:80,right:440,bottom:290,width:360,height:278});
 g.api.check();const p=g.fits.at(-1).options;
 assert.ok(390-p.paddingTopLeft[1]-p.paddingBottomRight[1]>=95);
});
