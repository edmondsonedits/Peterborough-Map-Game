import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCitywideFacadeEligibility,
  cityFacadePanelBudget,
  cityFacadeCoverageInvariant,
  cityFacadeEdgeSegments,
  cityFacadeAppearanceTags,
  cityFacadeWindowMaterialKey,
  cityFacadeUsesRepeatedWindowStrip,
  shouldFlattenInferredCommercialRoof,
  cityBuildingRoofGeometryPlan,
  isConvexCityFootprint,
  isOpenSidedRoofShell,
  selectCityFacadeEntranceEdge,
  createCityRoadSegmentIndex,
  shouldBuildIrregularGableRoof,
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
  assert.ok(first.length<=16);
  assert.deepEqual(first,second);
  assert.deepEqual(new Set(first.map(panel=>panel.edge)),new Set([0,1,2,3,4]));
  assert.equal(new Set(first.map(panel=>panel.lowerY)).size,2,'selected windows span multiple floors');
  assert.ok(selectFacadePanelsByBudget(faces,16).length<=16,'a new building receives its own budget');
});

test('small homes stay restrained while larger and taller facades receive adaptive bounded detail',()=>{
  const small=Array.from({length:4},(_,edge)=>({edge,role:edge===0?'front':'side',panels:[{kind:'door',lowerY:0},{kind:'window',lowerY:1},{kind:'window',lowerY:4}]}));
  const large=Array.from({length:10},(_,edge)=>({edge,role:edge===0?'front':'side',panels:Array.from({length:35},(_,index)=>({kind:'window',lowerY:1+Math.floor(index/7)*3.1}))}));
  assert.equal(cityFacadePanelBudget('balanced',small),12);
  assert.equal(cityFacadePanelBudget('low',large),50);
  assert.equal(cityFacadePanelBudget('balanced',large),100);
  assert.equal(cityFacadePanelBudget('high',large),100);
  assert.equal(cityFacadePanelBudget('high',Array.from({length:20},(_,edge)=>({edge,panels:Array.from({length:80},(_,index)=>({kind:'window',lowerY:index*3.1}))}))),384);
});

test('long facade edges split into bounded plans without dropping their endpoints',()=>{
  assert.deepEqual(cityFacadeEdgeSegments(30),[{index:0,count:1,start:0,end:30,length:30}]);
  const parts=cityFacadeEdgeSegments(181);
  assert.equal(parts.length,4);
  assert.equal(parts[0].start,0);
  assert.equal(parts.at(-1).end,181);
  assert.ok(parts.every(part=>part.length<=48));
  assert.ok(Math.abs(parts.reduce((sum,part)=>sum+part.length,0)-181)<1e-8);
});

test('very large anonymous building shells get an inferred facade archetype without mutating source tags',()=>{
  const tags=Object.freeze({building:'yes',name:'unresolved shell'});
  assert.equal(cityFacadeAppearanceTags(tags,90000,7,'way/large').building,'industrial');
  assert.equal(cityFacadeAppearanceTags(tags,45000,18,'way/civic').building,'civic');
  assert.equal(cityFacadeAppearanceTags(tags,700,7,'way/small'),tags);
  assert.equal(tags.building,'yes');
});

test('large shells retain explicit amenity, shop, and office appearance cues',()=>{
  for(const tags of [
    {building:'yes',amenity:'school'},
    {building:'yes',shop:'supermarket'},
    {building:'yes',office:'government'},
  ]) assert.equal(cityFacadeAppearanceTags(tags,90000,7),tags);
});

test('roof shelters and carports are recognized as open-sided ancillary structures',()=>{
  assert.equal(isOpenSidedRoofShell({building:'roof'}),true);
  assert.equal(isOpenSidedRoofShell({building:'carport'}),true);
  assert.equal(isOpenSidedRoofShell({building:'house'}),false);
  assert.equal(isOpenSidedRoofShell({building:'warehouse'}),false);
});

test('panel budget always retains the street entry and samples tall facade floors',()=>{
  const faces=[
    {edge:0,role:'front',panels:[{kind:'door',t:.5,lowerY:0},{kind:'window',t:.25,lowerY:1},{kind:'window',t:.75,lowerY:4},{kind:'window',t:.25,lowerY:7},{kind:'window',t:.75,lowerY:10}]},
    {edge:1,role:'side',panels:[{kind:'window',t:.5,lowerY:1},{kind:'window',t:.5,lowerY:4},{kind:'window',t:.5,lowerY:7},{kind:'window',t:.5,lowerY:10}]},
  ];
  const selected=selectFacadePanelsByBudget(faces,6);
  assert.ok(selected.some(panel=>panel.kind==='door'&&panel.edge===0));
  assert.deepEqual(new Set(selected.map(panel=>panel.edge)),new Set([0,1]));
  assert.ok(new Set(selected.filter(panel=>panel.edge===0&&panel.kind==='window').map(panel=>panel.lowerY)).size>=2);
});

test('a too-short street face gets one planned entry on a viable side without changing roles',()=>{
  const edges=[
    {index:0,role:'front',length:2.6},
    {index:1,role:'side',length:8.4},
    {index:2,role:'rear',length:2.6},
    {index:3,role:'side',length:8.4},
  ];
  const roles=edges.map(edge=>edge.role);
  assert.equal(selectCityFacadeEntranceEdge(edges),1);
  assert.equal(selectCityFacadeEntranceEdge([
    {index:0,role:'front',length:8,captured:true},
    {index:1,role:'side',length:7,captured:false},
  ],3.1,edge=>edge.captured),1,'entry selection skips captured faces that emission also skips');
  assert.deepEqual(edges.map(edge=>edge.role),roles);
  const selected=selectFacadePanelsByBudget([
    {edge:0,role:'side',panels:[{kind:'window',lowerY:1}]},
    {edge:1,role:'side',panels:[{kind:'door',lowerY:0},{kind:'window',lowerY:1}]},
  ],1);
  assert.deepEqual(selected.map(panel=>panel.kind),['door']);
  assert.equal(selected[0].edge,1);
});

test('curtain glazing is limited to residential and apartment facades',()=>{
  for(const archetype of ['storefront','industrial','civic','ancillary']) {
    assert.equal(cityFacadeWindowMaterialKey(archetype,'way/42',1,.5),'station2-window');
  }
  for(const archetype of ['residential','apartment']) {
    assert.ok(['station2-window','station2-window-curtain'].includes(cityFacadeWindowMaterialKey(archetype,'way/42',1,.5)));
  }
});

test('low-profile tall apartments use shared repeated window texture bands',()=>{
  assert.equal(cityFacadeUsesRepeatedWindowStrip('apartment','low',44.1),true);
  assert.equal(cityFacadeUsesRepeatedWindowStrip('apartment','balanced',44.1),false);
  assert.equal(cityFacadeUsesRepeatedWindowStrip('residential','low',44.1),false);
  assert.equal(cityFacadeUsesRepeatedWindowStrip('apartment','low',8),false);
});

test('only eligible inferred low-pitch commercial roofs flatten for shared rooftop equipment',()=>{
  const inferred={eligible:true,wallKey:'industrial',footprintArea:920,wallHeight:8,roofRise:2.04};
  assert.equal(shouldFlattenInferredCommercialRoof(inferred),true);
  assert.equal(shouldFlattenInferredCommercialRoof({...inferred,explicitRoofShape:true}),false);
  assert.equal(shouldFlattenInferredCommercialRoof({...inferred,wallKey:'residential'}),false);
  assert.equal(shouldFlattenInferredCommercialRoof({...inferred,roofRise:2.41}),false);
  assert.equal(shouldFlattenInferredCommercialRoof({...inferred,footprintArea:319}),false);
});

test('intentional roof flattening bypasses pitched/ring-wall helpers and emits a cap',()=>{
  assert.deepEqual(cityBuildingRoofGeometryPlan({roofHeight:1.8,flattenedCommercialRoof:true}),{tryPitched:false,raisedRingWalls:false,flatCap:true});
  assert.deepEqual(cityBuildingRoofGeometryPlan({roofHeight:1.8}),{tryPitched:true,raisedRingWalls:true,flatCap:false});
  assert.deepEqual(cityBuildingRoofGeometryPlan({roofHeight:.2}),{tryPitched:false,raisedRingWalls:true,flatCap:true});
});

test('rooftop rectangles accept only convex footprints',()=>{
  assert.equal(isConvexCityFootprint([{x:0,y:0},{x:4,y:0},{x:4,y:3},{x:0,y:3}]),true);
  assert.equal(isConvexCityFootprint([{x:0,y:0},{x:4,y:0},{x:2,y:1},{x:4,y:3},{x:0,y:3}]),false);
  assert.equal(isConvexCityFootprint([{x:0,y:0},{x:4,y:0},{x:2,y:0},{x:0,y:3}]),false);
});

test('tall balanced facades keep four aligned columns across every floor within a hard cap',()=>{
  const faces=Array.from({length:4},(_,edge)=>({edge,role:edge===0?'front':'side',panels:Array.from({length:14},(_,floor)=>[
    ...Array.from({length:8},(_,column)=>({kind:'window',lowerY:floor*3.1+1,t:(column+1)/10})).filter(panel=>!(edge===0&&floor===0&&panel.t===.4)),
    ...(edge===0&&floor===0?[{kind:'door',lowerY:0,t:.4}]:[]),
  ]).flat()}));
  const budget=cityFacadePanelBudget('balanced',faces);
  assert.equal(budget,225);
  const selected=selectFacadePanelsByBudget(faces,budget);
  assert.equal(selected.filter(panel=>panel.kind==='door').length,1);
  assert.equal(selected.filter(panel=>panel.kind==='window').length,223);
  for(let edge=0;edge<4;edge++) for(let floor=0;floor<14;floor++) {
    const row=selected.filter(panel=>panel.edge===edge&&Math.round(panel.lowerY/3.1)===Math.round((floor*3.1+1)/3.1));
    assert.ok(row.length===4||(edge===0&&floor===0&&row.length===3));
    const columns=row.map(panel=>panel.t).sort();
    if(row.length===4)assert.deepEqual(columns,[.2,.4,.6,.8]);
  }
});

test('over-cap low facades sample evenly from every face and the full floor range',()=>{
  const faces=Array.from({length:8},(_,edge)=>({edge,role:edge===0?'front':'side',panels:Array.from({length:14},(_,floor)=>[
    ...[.2,.4,.6].filter(t=>!(edge===0&&floor===0&&t===.4)).map(t=>({kind:'window',lowerY:floor*3.1+1,t})),
    ...(edge===0&&floor===0?[{kind:'door',lowerY:0,t:.4}]:[]),
  ]).flat()}));
  const selected=selectFacadePanelsByBudget(faces,64);
  assert.ok(selected.length<=64);
  assert.equal(selected.filter(panel=>panel.kind==='door').length,1);
  const perFaceCounts=[];
  for(let edge=1;edge<8;edge++) {
    const rows=selected.filter(panel=>panel.edge===edge&&panel.kind==='window');
    const floors=rows.map(panel=>Math.round((panel.lowerY-1)/3.1)).sort((a,b)=>a-b);
    perFaceCounts.push(floors.length);
    assert.ok(floors.length===7||floors.length===8);
    assert.equal(floors[0],0);
    assert.equal(floors.at(-1),13);
    assert.equal(new Set(rows.map(panel=>panel.t)).size,1,'each face keeps one consistent vertical column');
  }
  assert.ok(Math.max(...perFaceCounts)-Math.min(...perFaceCounts)<=1,'row slots are shared evenly across faces');
});

test('bounded irregular roofs preserve explicit shape and admit courtyard and large footprints',()=>{
  const eligible={ringVertexCount:6,hasHoles:false,roofHeight:1.8,roofShape:'gabled',footprintArea:120};
  assert.equal(shouldBuildIrregularGableRoof(eligible),true);
  assert.equal(shouldBuildIrregularGableRoof({...eligible,roofShape:'flat'}),false);
  assert.equal(shouldBuildIrregularGableRoof({...eligible,roofShape:'hipped'}),true,'an inferred hip may use the bounded gable visual fallback');
  assert.equal(shouldBuildIrregularGableRoof({...eligible,roofShape:'hipped',explicitRoofShape:true}),true,'explicit hip gets a shape-appropriate bounded roof');
  assert.equal(shouldBuildIrregularGableRoof({...eligible,roofShape:'flat',explicitRoofShape:true}),false);
  assert.equal(shouldBuildIrregularGableRoof({...eligible,hasHoles:true}),true,'courtyard roofs can triangulate around source holes');
  assert.equal(shouldBuildIrregularGableRoof({...eligible,footprintArea:45000}),true);
  assert.equal(shouldBuildIrregularGableRoof({...eligible,footprintArea:45001}),false,'large complexes remain behind a hard geometry bound');
  assert.equal(shouldBuildIrregularGableRoof({...eligible,ringVertexCount:4}),true);
  assert.equal(shouldBuildIrregularGableRoof({...eligible,roofShape:'round'}),true);
  assert.equal(shouldBuildIrregularGableRoof({...eligible,roofShape:''}),true,'an untagged raised roof can receive a conservative inferred shape');
  assert.equal(shouldBuildIrregularGableRoof({...eligible,ringVertexCount:16,footprintArea:11.57,roofHeight:2.04,roofShape:'gabled'}),true,'the tall Thom Tower roof receives a bounded cap despite its tiny footprint');
});

test('coverage accounting detects missing or misclassified source parts',()=>{
  assert.deepEqual(cityFacadeCoverageInvariant({consideredParts:100,eligibleParts:92,coveredParts:92,excludedParts:8}),{sourcePartsAccounted:true,eligiblePartsCovered:true,unresolvedPartCount:0,overaccountedPartCount:0});
  assert.deepEqual(cityFacadeCoverageInvariant({consideredParts:100,eligibleParts:92,coveredParts:91,excludedParts:8}),{sourcePartsAccounted:false,eligiblePartsCovered:false,unresolvedPartCount:1,overaccountedPartCount:0});
});
