import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {planBusinessWallSigns, signVisibilityChanged, wrapSignText} from '../city-explorer/business-sign-layout.js';
const project=(lat,lon)=>({x:lon,z:-lat});
const building={sourceId:'way/1',polygons:[{rings:[[{x:0,z:0},{x:20,z:0},{x:20,z:10},{x:0,z:10}]],base:100,wallTop:108}]};
const business=(id,name,fraction=.5)=>({id,name,buildingSourceId:'way/1',placementStatus:'approved',placementMode:'street-facing-wall',frontage:[{lat:0,lon:0},{lat:0,lon:20}],fraction,nameEvidence:[{sourceUrl:'https://www.openstreetmap.org/node/'+id}],address:'1 Test Street'});
test('wall names face outside and sit above the opening band below the roof',()=>{
 const r=planBusinessWallSigns({building,businesses:[business('1','First Business')],project});assert.equal(r.signs.length,1);assert.equal(r.rejected.length,0);const s=r.signs[0];assert.ok(s.center.z<0);assert.ok(s.normal.z<-.99);assert.ok(s.bottom>=102.2);assert.ok(s.top<108);assert.ok(s.left>=0&&s.right<=20);assert.equal(s.buildingSourceId,'way/1');
});
test('multiple adjacent tenants do not overlap or extend past a short source wall',()=>{
 const r=planBusinessWallSigns({building,businesses:[business('1','One',.16),business('2','Two',.48),business('3','Three',.82)],project});assert.equal(r.signs.length,3);const a=r.signs.sort((x,y)=>x.left-y.left);for(let i=1;i<a.length;i++)assert.ok(a[i].left>a[i-1].right);for(const s of a)assert.ok(s.left>=.15&&s.right<=19.85);
});
test('unmatched, wrong-source, floating, degenerate, courtyard and low-roof placements fail closed',()=>{
 const cases=[{...business('1','X'),buildingSourceId:'way/other'},{...business('1','X'),placementStatus:'needs-review'},{...business('1','X'),frontage:[{lat:-3,lon:0},{lat:-3,lon:20}]},{...business('1','X'),frontage:[{lat:0,lon:0},{lat:0,lon:0}]}];for(const b of cases)assert.equal(planBusinessWallSigns({building,businesses:[b],project}).signs.length,0);
 const low={...building,polygons:[{...building.polygons[0],wallTop:102.3}]};assert.equal(planBusinessWallSigns({building:low,businesses:[business('1','Low')],project}).signs.length,0);
 const courtyard={...building,polygons:[{...building.polygons[0],rings:[...building.polygons[0].rings,[{x:5,z:3},{x:10,z:3},{x:10,z:8},{x:5,z:8}]]}]};assert.equal(planBusinessWallSigns({building:courtyard,businesses:[{...business('1','Inside'),frontage:[{lat:-3,lon:5},{lat:-3,lon:10}]}],project}).signs.length,0);
});
test('coincident tenants are explicitly unresolved rather than placed on one another',()=>{
 const r=planBusinessWallSigns({building,businesses:Array.from({length:30},(_,i)=>business(String(i),'Tenant '+i,.5)),project});for(const s of r.signs)for(const other of r.signs)if(s!==other)assert.ok(s.right<=other.left||other.right<=s.left);assert.ok(r.rejected.length>0);
});
test('sign visibility responds within one city LOD cell and text wraps without dropping names',()=>{
 assert.equal(signVisibilityChanged({x:0,z:0},{x:25,z:0}),true);assert.equal(signVisibilityChanged({x:0,z:0},{x:1,z:0}),false);
 const name='Peterborough Professional Business Services';const lines=wrapSignText(name,s=>s.length*12,260);assert.equal(lines.join(' '),name);assert.ok(lines.every(l=>l.length*12<=260));
});

test('a low single-storey wall fits a smaller readable sign above a 2.2 metre opening',()=>{const row={id:'low',name:'Low Shop',buildingSourceId:'low',placementStatus:'approved',frontage:[{lat:0,lon:0},{lat:0,lon:10}],fraction:.5};const result=planBusinessWallSigns({building:{sourceId:'low',polygons:[{rings:[[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}]],base:100,wallTop:102.6}]},businesses:[row],project:(lat,lon)=>({x:lon,z:-lat})});assert.equal(result.signs.length,1);assert.ok(result.signs[0].bottom>=102.2-1e-7);assert.ok(result.signs[0].top<102.6);assert.ok(result.signs[0].height>=.34999)});

test('approved placements remain valid after unresolved neighbours are pruned',()=>{const building={sourceId:'crowd',polygons:[{rings:[[{x:0,z:0},{x:12,z:0},{x:12,z:10},{x:0,z:10}]],base:0,wallTop:8}]};const rows=Array.from({length:20},(_,i)=>({id:String(i),name:'Business '+i,buildingSourceId:'crowd',placementStatus:'approved',frontage:[{lat:0,lon:0},{lat:0,lon:12}],fraction:.5}));const options={building,businesses:rows,project:(lat,lon)=>({x:lon,z:-lat})},first=planBusinessWallSigns(options),ids=new Set(first.signs.map(s=>s.id)),second=planBusinessWallSigns({...options,businesses:rows.filter(r=>ids.has(r.id))});assert.equal(second.rejected.length,0);assert.deepEqual(second.signs.map(s=>s.id),first.signs.map(s=>s.id))});

test('directory panels retain their physical reading width on crowded walls',()=>{const building={sourceId:'mall',polygons:[{rings:[[{x:0,z:0},{x:12,z:0},{x:12,z:10},{x:0,z:10}]],base:0,wallTop:6}]};const rows=Array.from({length:3},(_,i)=>({id:String(i),name:'Building directory',members:['Tenant'],buildingSourceId:'mall',placementStatus:'approved',placementMode:'shared-entrance-directory',frontage:[{lat:0,lon:0},{lat:0,lon:12}],fraction:.5,maxShiftMetres:7}));const result=planBusinessWallSigns({building,businesses:rows,project:(lat,lon)=>({x:lon,z:-lat})});assert.ok(result.rejected.length>=1);assert.ok(result.signs.every(s=>s.width>=4.8));});

test('signs clear the actual generated ground-floor glass rather than a fixed opening assumption',()=>{const result=planBusinessWallSigns({building,businesses:[{...business('glass','Shop'),openingTopMetres:2.72}],project});assert.equal(result.rejected.length,0);assert.ok(result.signs[0].bottom>=102.72-1e-7)});
test('a roof with no readable sign band above its actual opening remains unresolved',()=>{const low={...building,polygons:[{...building.polygons[0],wallTop:102.95}]};const result=planBusinessWallSigns({building:low,businesses:[{...business('lowglass','Shop'),openingTopMetres:2.72}],project});assert.equal(result.signs.length,0);assert.equal(result.rejected[0].reason,'insufficient-height-above-opening')});

test('the catalogue uses the same roof and minimum-level subtraction as actual rendered walls',()=>{assert.equal(mappedBuildingDimensions({height:'8','roof:height':'2',min_height:'1'},'height').height,5);assert.equal(mappedBuildingDimensions({'building:levels':'1',building:'yes'},'low-house').height,2.6);assert.equal(mappedBuildingDimensions({'building:levels':'1',building:'retail'},'flat-shop').height,3.15);assert.equal(mappedBuildingDimensions({'building:levels':'1',shop:'mall'},'mall').height,4.8)});
