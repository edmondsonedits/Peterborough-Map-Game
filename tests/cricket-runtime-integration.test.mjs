import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {recordSherbrookeBuilding,sherbrookeBuildings} from '../city-explorer/sherbrooke-plan.js';
const app=fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
function isolated(name,next,deps){
 const code=app.slice(app.indexOf(`function ${name}(`),app.indexOf(`function ${next}(`));
 return new Function(...Object.keys(deps),`${code}; return ${name};`)(...Object.values(deps));
}
test('appearance-only references cannot override mapped dimensions even if future data supplies massing estimates',()=>{
 const id='way/1015118649',tags={building:'house','height':'9','roof:height':'2','roof:shape':'hipped'};
 const source={appearanceOnly:true,style:'house',eaveHeight:99,roof:'flat',roofRise:19};
 const dimensions=isolated('buildingDimensions','buildingMaterialKey',{FOOTAGE_PROFILES:{[id]:source},REVIEWED_BUILDING_STYLES:{},LANDMARK_BUILDING_HEIGHT_OVERRIDES:{},mappedBuildingDimensions});
 assert.deepEqual(dimensions(tags,id),mappedBuildingDimensions(tags,id));
});
test('appearance-only references keep the original footprint simplification path',()=>{
 const id='way/1015118649';let calls=0;const simplified=[{x:3,y:4}];
 const convert=isolated('coordinatesToRing','shapeFromRings',{FOOTAGE_PROFILES:{[id]:{appearanceOnly:true}},project:(lat,lon)=>({x:lon,y:lat}),simplifyRing:(ring,tolerance,cap)=>{calls++;assert.equal(tolerance,.72);assert.equal(cap,110);assert.deepEqual(ring,[{x:1,y:2},{x:3,y:4}]);return simplified;}});
 assert.equal(convert([[1,2],[3,4]],id),simplified);assert.equal(calls,1);
});
test('runtime capture accepts only explicitly reviewed matching appearance profiles and copies source rings',()=>{
 const id='test/cricket-reviewed',ring=[{x:0,y:0},{x:6,y:0},{x:6,y:9}];
 for(const p of [undefined,{id,appearanceOnly:true,confidence:'inferred'},{id:'wrong',appearanceOnly:true,preserveMappedMassing:true,confidence:'observed'}]){recordSherbrookeBuilding(id,ring,1,7,p);assert.equal(sherbrookeBuildings.has(id),false);}
 recordSherbrookeBuilding(id,ring,1,7,{id,appearanceOnly:true,preserveMappedMassing:true,confidence:'observed'});
 assert.deepEqual(sherbrookeBuildings.get(id),{id,ring:ring.map(p=>({x:p.x,z:p.y})),base:1,top:7});ring[0].x=99;assert.equal(sherbrookeBuildings.get(id).ring[0].x,0);sherbrookeBuildings.delete(id);
});
