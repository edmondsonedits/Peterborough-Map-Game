import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCitywideFacadeEligibility,
  cityFacadeCoverageInvariant,
  createCityRoadSegmentIndex,
  selectFacadePanelsByBudget,
} from '../city-explorer/citywide-building-facades.mjs';

const pilot = { center:{x:0,z:0}, radius:10 };

test('citywide eligibility covers buildings outside the pilot and excludes only authored or captured facades',()=>{
  assert.equal(classifyCitywideFacadeEligibility({featureId:'generic',anchor:{x:500,z:0},mode:'all',pilot}).eligible,true);
  assert.equal(classifyCitywideFacadeEligibility({featureId:'generic',anchor:{x:500,z:0},mode:'pilot',pilot}).eligible,false);
  assert.equal(classifyCitywideFacadeEligibility({featureId:'generic',anchor:{x:500,z:0},mode:'all',pilot,profile:{appearanceOnly:true,confidence:'inferred'}}).eligible,true);
  assert.equal(classifyCitywideFacadeEligibility({featureId:'custom',anchor:{x:500,z:0},mode:'all',pilot,reviewedStyle:{customFacade:true}}).reason,'reviewed-custom-facade');
  assert.equal(classifyCitywideFacadeEligibility({featureId:'replacement',anchor:{x:500,z:0},mode:'all',pilot,reviewedReplacement:true}).reason,'reviewed-station-replacement');
  assert.equal(classifyCitywideFacadeEligibility({featureId:'photo',anchor:{x:500,z:0},mode:'all',pilot,profile:{appearanceOnly:false,confidence:'reviewed',style:'residential'}}).reason,'captured-footage-facade');
  assert.equal(classifyCitywideFacadeEligibility({featureId:'station-photo',anchor:{x:500,z:0},mode:'all',pilot,profile:{appearanceOnly:false,confidence:'reviewed',style:'station'}}).reason,'captured-footage-facade');
  assert.equal(classifyCitywideFacadeEligibility({featureId:'prototype',anchor:{x:1,z:1},mode:'all',pilot}).eligible,true,'generic facade coverage includes the former prototype area');
  assert.equal(classifyCitywideFacadeEligibility({featureId:'glb',anchor:{x:500,z:0},mode:'all',pilot,glbReplacement:true}).reason,'authored-glb-replacement');
});

test('road grid returns every nearby segment while excluding remote road cells',()=>{
  const segments=[
    {id:'near',a:{x:-30,z:6},b:{x:30,z:6}},
    {id:'crossing',a:{x:12,z:-20},b:{x:12,z:20}},
    {id:'remote',a:{x:1000,z:1000},b:{x:1040,z:1000}},
  ];
  const index=createCityRoadSegmentIndex(segments,{cellSize:40});
  const found=index.query({minX:-5,maxX:5,minZ:-5,maxZ:5},{padding:8});
  assert.deepEqual(found.map(segment=>segment.id).sort(),['crossing','near']);
});

test('panel limits are per-building and distribute bounded detail across complex faces',()=>{
  const faces=Array.from({length:5},(_,edge)=>({edge,role:edge===0?'front':'side',panels:Array.from({length:10},(_,index)=>({edge,index,lowerY:index<5?1:4,t:index%5}))}));
  const first=selectFacadePanelsByBudget(faces,16);
  const second=selectFacadePanelsByBudget(faces,16);
  assert.equal(first.length,16);
  assert.deepEqual(first,second);
  assert.deepEqual(new Set(first.map(panel=>panel.edge)),new Set([0,1,2,3,4]));
  assert.equal(new Set(first.map(panel=>panel.lowerY)).size,2,'selected windows span multiple floors');
  assert.equal(selectFacadePanelsByBudget(faces,16).length,16,'a new building receives its own budget');
});

test('coverage accounting detects missing or misclassified source parts',()=>{
  assert.deepEqual(cityFacadeCoverageInvariant({consideredParts:100,eligibleParts:92,coveredParts:92,excludedParts:8}),{sourcePartsAccounted:true,eligiblePartsCovered:true,unresolvedPartCount:0,overaccountedPartCount:0});
  assert.deepEqual(cityFacadeCoverageInvariant({consideredParts:100,eligibleParts:92,coveredParts:91,excludedParts:8}),{sourcePartsAccounted:false,eligiblePartsCovered:false,unresolvedPartCount:1,overaccountedPartCount:0});
});
