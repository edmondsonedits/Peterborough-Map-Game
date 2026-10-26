import test from 'node:test';
import assert from 'node:assert/strict';
import {RECORDING_SURFACE_PALETTE,recordingExpansionEnabled,applyRecordingSurfacePalette} from '../city-explorer/recording-surface-appearance.js';
const color = hex => ({hex,getHex(){return this.hex},setHex(value){this.hex=value}});
test('surface pass changes only known palette colours and leaves material/geometry properties alone',()=>{
 const materials=Object.fromEntries(Object.entries(RECORDING_SURFACE_PALETTE).map(([key,p])=>[key,{color:color(p.previous),roughness:.9,userData:{source:key}}]));
 const refs=Object.fromEntries(Object.entries(materials).map(([key,m])=>[key,{m,data:m.userData}]));
 assert.deepEqual(applyRecordingSurfacePalette(materials).sort(),Object.keys(RECORDING_SURFACE_PALETTE).sort());
 for(const [key,p]of Object.entries(RECORDING_SURFACE_PALETTE)){assert.equal(materials[key],refs[key].m);assert.equal(materials[key].color.getHex(),p.color);assert.equal(materials[key].roughness,.9);assert.equal(materials[key].userData,refs[key].data);}
 assert.deepEqual(applyRecordingSurfacePalette(materials),[]);
});
test('explicit colours, unavailable materials and opt-outs preserve the old result',()=>{
 const m={parking:{color:color(0x123456)},grass:{color:color(RECORDING_SURFACE_PALETTE.grass.previous)}};
 assert.deepEqual(applyRecordingSurfacePalette(m,false),[]);assert.equal(m.grass.color.getHex(),RECORDING_SURFACE_PALETTE.grass.previous);
 applyRecordingSurfacePalette(m);assert.equal(m.parking.color.getHex(),0x123456);
 for(const query of ['?recordingExpansion=off','?recordingReferences=off','?visuals=legacy'])assert.equal(recordingExpansionEnabled(query),false);
 assert.equal(recordingExpansionEnabled('?lite=1'),true);
});
