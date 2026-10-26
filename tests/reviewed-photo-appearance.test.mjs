import test from 'node:test';import assert from 'node:assert/strict';
import { applyReviewedPhotoAppearance, REVIEWED_PHOTO_APPEARANCES } from '../city-explorer/reviewed-photo-appearance.js';
test('photo appearance adjusts only display fields and never mutates source profiles',()=>{
 const source={id:'way/1006575704',wallColor:'#fff',eaveHeight:6.3,roofRise:2.3,frontLatLon:[{lat:1,lon:2},{lat:3,lon:4}],facadePhoto:{file:'s03.jpg',heightMetres:6.3,gableHeightMetres:2.3}};
 const before=structuredClone(source),result=applyReviewedPhotoAppearance(source,'improved');
 assert.deepEqual(source,before);assert.equal(result.eaveHeight,source.eaveHeight);assert.equal(result.roofRise,source.roofRise);assert.equal(result.facadePhoto.file,source.facadePhoto.file);assert.deepEqual(result.frontLatLon,source.frontLatLon);
 assert.ok(result.facadePhoto.silhouette.length>=3);assert.equal(result.hidePhotoDuplicatedMembers,true);assert.equal(source.hidePhotoDuplicatedMembers,undefined);assert.equal(applyReviewedPhotoAppearance(source,'legacy'),source);
 assert.equal(applyReviewedPhotoAppearance({id:'unreviewed'}).id,'unreviewed');
});
test('every photographic display override identifies its inspected source and confidence',()=>{
 for(const value of Object.values(REVIEWED_PHOTO_APPEARANCES)){assert.ok(value.source.endsWith('.jpg'));assert.equal(value.confidence,'visual-estimate');assert.ok(value.limitations.length>0);for(const p of value.silhouette)assert.ok(p.every(v=>v>=0&&v<=1));}
});
