'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {game}=require('./helpers/geo-game.cjs');

async function started(){
 const g=await game();g.api.chooseService('fire');g.api.chooseDifficulty('easy');g.api.start(0);return g;
}

test('Next Call returns keyboard focus to the map after revealing an answer',async()=>{
 const g=await started();g.api.reveal();g.node('practice-continue').focus();g.api.next();
 assert.equal(g.activeElement.id,'map');
});

test('Try again returns keyboard focus to the map after a miss',async()=>{
 const g=await started();g.api.check();g.node('confirm').focus();g.api.check();
 assert.equal(g.activeElement.id,'map');
});

test('choosing a base returns keyboard focus to the map',async()=>{
 const g=await started();g.node('practice-bases-toggle').focus();g.api.chooseBase(0);
 assert.equal(g.activeElement.id,'map');
});

test('Finish focuses the selected base when it remains available',async()=>{
 const g=await started();g.node('practice-finish').focus();g.api.finish();
 assert.equal(g.activeElement,g.node('practice-stations').children[0]);
});

test('Finish falls back to the service choice when the selected base is removed or disabled',async()=>{
 const removed=await started();removed.node('practice-stations').replaceChildren();removed.api.finish();
 assert.equal(removed.activeElement,removed.node('service-fire'));
 const disabled=await started();disabled.node('practice-stations').children[0].disabled=true;disabled.api.finish();
 assert.equal(disabled.activeElement,disabled.node('service-fire'));
});

test('Settings open and Back move focus to visible controls',async()=>{
 const g=await game();g.node('settings-link').focus();g.api.openSettings();
 assert.equal(g.activeElement.id,'show-cross-streets');
 g.node('settings-back').focus();g.api.closeSettings();
 assert.equal(g.activeElement.id,'settings-link');
});
