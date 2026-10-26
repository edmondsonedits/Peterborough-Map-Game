import test from 'node:test';
import assert from 'node:assert/strict';
import { visualSettings, cityShadowSettings, glazingIntensity, CITY_DAYLIGHT } from '../city-explorer/city-visual-settings.js';
test('visual settings have deterministic explicit legacy and low-cost fallbacks',()=>{
 assert.equal(visualSettings('',false).mode,'improved');
 assert.equal(visualSettings('?visuals=legacy',false).mode,'legacy');
 assert.equal(visualSettings('?visuals=lite',false).quality,'lite');
 assert.equal(visualSettings('',true).quality,'lite');
 assert.equal(visualSettings('?visuals=unknown',false).mode,'improved');
});
test('street-height fly and driving use comparable local shadow resolution; map remains broad',()=>{
 const street=cityShadowSettings('fly',3),drive=cityShadowSettings('driving',3),overview=cityShadowSettings('map',800);
 assert.equal(street.extent,drive.extent);assert.ok(street.extent<=160);assert.ok(overview.extent>=1000);
 for(const height of [NaN,0,20,100,900]) {const result=cityShadowSettings('fly',height);assert.ok(Number.isFinite(result.extent));assert.ok(result.normalBias>0&&result.normalBias<=.5)}
});
test('neutral daylight and theme-aware glass do not retain daytime reflection intensity at night',()=>{
 assert.ok(CITY_DAYLIGHT.ground>0);assert.ok(CITY_DAYLIGHT.ambientIntensity>0);
 assert.ok(glazingIntensity('night')<glazingIntensity('dusk'));assert.ok(glazingIntensity('dusk')<glazingIntensity('day'));
});
