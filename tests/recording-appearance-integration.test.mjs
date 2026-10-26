import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {FOOTAGE_PROFILES} from '../city-explorer/sherbrooke-footage-profiles.js';
import {applyRecordingAppearance,recordingReferencesEnabled} from '../city-explorer/recording-appearance.js';
import {createFootageFacade} from '../city-explorer/sherbrooke-footage.js';
test('recording opt-out and legacy return source profiles without appearance changes',()=>{
 assert.equal(recordingReferencesEnabled(''),true);assert.equal(recordingReferencesEnabled('?recordingReferences=off'),false);assert.equal(recordingReferencesEnabled('?visuals=legacy'),false);assert.equal(recordingReferencesEnabled('?lite=1'),true);
 for(const profile of Object.values(FOOTAGE_PROFILES))assert.equal(applyRecordingAppearance(profile,false),profile);
});
test('all integrated profiles preserve source identity, massing, roof and frontage endpoints',()=>{
 for(const profile of Object.values(FOOTAGE_PROFILES)){const before=structuredClone(profile),p=applyRecordingAppearance(profile);assert.deepEqual(profile,before);for(const key of ['id','name','height','eaveHeight','roof','roofRise','frontLatLon','reference','frontSource'])assert.deepEqual(p[key],profile[key],profile.id+' '+key);for(let i=0;i<(profile.additionalFrontages||[]).length;i++)assert.deepEqual(p.additionalFrontages[i].frontLatLon,profile.additionalFrontages[i].frontLatLon);}
});
test('Commerce photograph is attached only to the explicitly reviewed Water face',async()=>{
 const source=FOOTAGE_PROFILES['way/1006243562'],p=applyRecordingAppearance(source);assert.equal(p.facadePhoto,source.facadePhoto);assert.ok(p.additionalFrontages[0].facadePhoto);assert.equal(source.additionalFrontages[0].facadePhoto,undefined);
 const loads=[];class Loader{load(url,onLoad){loads.push({url,onLoad});}}
 const project=(lat,lon)=>({x:(lon+78.32)*80000,z:-(lat-44.3)*110540});
 const ring=[{x:0,z:0},{x:100,z:0},{x:100,z:100},{x:0,z:100}];
 const group=createFootageFacade({THREE:{...THREE,TextureLoader:Loader},profile:p,ring,base:0,top:11,project});assert.equal(loads.length,1);loads[0].onLoad(new THREE.Texture());await group.userData.photoReady;assert.equal(group.userData.photoStatus,'loaded');assert.equal(group.children[0].getObjectByName('reviewed-facade-photo'),undefined);const photo=group.children[1].getObjectByName('reviewed-facade-photo');assert.ok(photo);const pos=photo.geometry.getAttribute('position');const width=Math.hypot(pos.getX(1)-pos.getX(0),pos.getZ(1)-pos.getZ(0));assert.ok(width>1.3&&width<1.6,'narrow source sign is not stretched to the previous 5% minimum');assert.ok(group.children[1].getObjectByName('frontage-procedural-details').visible);
});


test('expansion opt-out restores the first recording pass while retaining its photographs',()=>{
 const source=FOOTAGE_PROFILES['way/1006243553'];
 assert.equal(applyRecordingAppearance(source,true,false).archedWindowLevels,source.archedWindowLevels);
 assert.deepEqual(applyRecordingAppearance(source,true,true).archedWindowLevels,[2]);
 const commerce=FOOTAGE_PROFILES['way/1006243562'];
 assert.ok(applyRecordingAppearance(commerce,true,false).additionalFrontages[0].facadePhoto);
});
