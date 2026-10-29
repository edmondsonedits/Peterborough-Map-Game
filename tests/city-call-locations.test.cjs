'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {normalizeStreet,parseAddress,addressKey,isDuplicate,classifyRecognition,incidentProfiles,facilityType,sourceReviewProblem,baselineForServices,matchStreet,validateAccess,buildTopology,findCrossStreets,selectCandidates,prepareRegeneration,loadEmergencyPolicy,emergencyRole,roadMetadata,readTargetedCandidates,isolatedIslandException,islandIsolationSlot,parseOptions}=require('../tools/build-city-call-locations.cjs');

test('civic normalization retains direction and strips only explicit unit/city suffixes',()=>{
 assert.equal(normalizeStreet('Église Rd. N'),normalizeStreet('Eglise Road North'));
 assert.notEqual(normalizeStreet('Main Street North'),normalizeStreet('Main Street South'));
 assert.equal(addressKey('Unit 3, 12 Main St N, Ajax, ON','Ajax'),'12 main street north');
 assert.equal(addressKey('12 Main Street North #4','Ajax'),'12 main street north');
 assert.equal(parseAddress('123-125 Main Street'),null);
 assert.equal(parseAddress('Main Street'),null);
});
test('same civic address is one site; adjacent residential numbers remain distinct',()=>{
 const a={id:'a',addr:'12 Main St',name:'A',lat:43,lng:-79};
 assert.equal(isDuplicate({...a,id:'b',addr:'12 Main Street #2'},[a],'Ajax'),true);
 assert.equal(isDuplicate({...a,id:'b',addr:'14 Main Street',lng:-79.0002,name:'14 Main Street'},[a],'Ajax'),false);
 assert.equal(isDuplicate({...a,id:'b',addr:'20 Other Street',name:'Other'},[a],'Ajax'),true);
 assert.equal(isDuplicate({...a,id:'b',addr:'20 Side Street',name:'A',lng:-79.0002},[a],'Ajax'),true);
});
test('suffix omission requires a single local mapped street and never drops directions',()=>{
 assert.equal(matchStreet('Harkins',['Harkins Drive']).normalization,'unambiguous-mapped-suffix');
 assert.equal(matchStreet('Harkins',['Harkins Drive','Harkins Road']),null);
 assert.equal(matchStreet('Main St N',['Main Street South']),null);
});
test('recognition uses road prominence and facility identity rather than scenario severity',()=>{
 assert.equal(classifyRecognition({name:'Central Hospital',category:'hospital'},'residential').difficulty,'easy');
 assert.equal(classifyRecognition({name:'Little School',category:'school'},'residential').difficulty,'medium');
 assert.equal(classifyRecognition({name:'12 Main Street',tags:{}},'residential').difficulty,'hard');
 assert.equal(classifyRecognition({name:'12 Main Street',tags:{}},'primary').difficulty,'easy');
});
test('outdoor venues get plausible fictional scenarios without asserting a building',()=>{
 assert.equal(incidentProfiles('recreation').fire.sub,'Fire Investigation');
 assert.equal(incidentProfiles('park').fire.sub,'Fire Investigation');
 assert.equal(incidentProfiles('parking').fire.sub,'Vehicle Fire');
 assert.equal(incidentProfiles('school').fire.sub,'Structure Fire');
 assert.equal(incidentProfiles('letter_box').fire.sub,'Fire Investigation');
 assert.equal(incidentProfiles('bicycle_parking').fire.sub,'Structure Fire');
 assert.equal(incidentProfiles('toilets').fire.sub,'Structure Fire');
 assert.equal(incidentProfiles('park').ems.sub,'Medical Assistance');
});
test('ordinary house building tags do not gain priority-facility weighting',()=>{
 for(const building of ['house','detached','residential','yes','semidetached_house','terrace'])assert.equal(facilityType({tags:{building}}),'residential-address');
 assert.equal(facilityType({tags:{building:'apartments'}}),'apartments');
 assert.equal(facilityType({tags:{building:'house',amenity:'clinic'}}),'clinic');
});
test('unresolved stale, coordinate-conflicting, and independently rejected sources stay quarantined',()=>{
 assert.equal(sourceReviewProblem({reviewFlags:['source-data-2020-currentness-review-required']}),'unresolved-2020-source-currentness');
 assert.equal(sourceReviewProblem({reviewFlags:['source-data-2020-currentness-review-required'],verifiedcurrentness:{method:'independent-official-operator-or-public-body-web-review',sourceUrls:['https://example.test/current'],retrievedAt:'2026-10-29'}}),null);
 for(const flag of ['same-address-source-coordinate-conflict-over-200m','same-address-coordinate-spread-over-200m'])assert.equal(sourceReviewProblem({reviewFlags:[flag]}),'unresolved-official-coordinate-or-current-address-conflict');
 assert.equal(sourceReviewProblem({reviewFlags:['independent-source-review-rejected']}),'independent-source-review-rejected');
 assert.equal(sourceReviewProblem({reviewFlags:['source-currentness-not-individually-checked']}),null);
});
test('actual production snap must match civic street, be ground level, and be within 80m',()=>{
 const graph={segments:[{id:0,name:'Main Street',highway:'residential',layer:'0',bridge:false}]};
 const api={state:{graph,traceCore:{snap:()=>({segmentId:0,distance:12,lat:1,lng:2})}}};
 assert.equal(validateAccess({lat:1,lng:2},'Wrong Street',api,['Main Street']).reason,'production-snap-wrong-street');
 assert.equal(validateAccess({lat:1,lng:2},'Main St',api,['Main Street']).ok,true);
 graph.segments[0].bridge=true;
 assert.equal(validateAccess({lat:1,lng:2},'Main St',api,['Main Street']).reason,'production-snap-not-ground-public-road');
 graph.segments[0].bridge=false;api.state.traceCore.snap=()=>({segmentId:0,distance:81});
 assert.equal(validateAccess({},'Main St',api,['Main Street']).ok,false);
});
function fixture(){
 const nodes=[{id:0,lat:0,lng:0},{id:1,lat:0,lng:1},{id:2,lat:0,lng:2},{id:3,lat:1,lng:0},{id:4,lat:1,lng:2},{id:5,lat:1,lng:1},{id:6,lat:-1,lng:0},{id:7,lat:-1,lng:2}];
 const segments=[['Main Street',0,1],['Main Street',1,2],['West Road',0,3],['East Road',2,4],['Parallel Road',3,5],['Bridge Road',1,5],['West Road',0,6],['East Road',2,7]].map(([name,from,to],id)=>({id,name,from,to,length:100,highway:'residential',bridge:id===5,layer:id===5?'1':'0'}));
 return {nodes,segments};
}
test('cross streets follow both same-street directions, ignore parallel and bridge roads',()=>{
 const graph=fixture(),topology=buildTopology(graph);
 const result=findCrossStreets({segmentId:0,t:.5},graph,topology,1500);
 assert.deepEqual(result.crossStreets,['West Road','East Road']);
 assert.deepEqual(result.evidence.map(x=>x.nodeId),[0,2]);
 assert.equal(result.oneStreetException,false);
 graph.segments=graph.segments.filter(s=>s.name!=='East Road');
 const one=findCrossStreets({segmentId:0,t:.5},graph,buildTopology(graph),1500);
 assert.deepEqual(one.crossStreets,['West Road']);assert.equal(one.oneStreetException,true);
});
test('a two-arm street-name change is not invented as a cross street',()=>{
 const graph=fixture();graph.segments=graph.segments.filter(s=>!['West Road','East Road'].includes(s.name)||s.to<6);
 assert.equal(findCrossStreets({segmentId:0,t:.5},graph,buildTopology(graph)).missing,true);
});
test('direction changes and divided-road name splits are continuations, not cross clues',()=>{
 const graph=fixture();graph.segments[0].name='Main Street North';graph.segments[1].name='Main Street South';
 Object.assign(graph.segments[5],{name:'Kingston Road West',bridge:false,layer:'0'});
 const result=findCrossStreets({segmentId:0,t:.5},graph,buildTopology(graph));
 assert.deepEqual(result.crossStreets,['West Road','Kingston Road West']);
 graph.segments[5].name='Main Street';
 const split=findCrossStreets({segmentId:0,t:.5},graph,buildTopology(graph));
 assert.deepEqual(split.crossStreets,['West Road','East Road']);
});
test('an unnamed source road with a numeric ref is not a named cross-street clue',()=>{
 const graph=fixture();Object.assign(graph.segments[5],{name:'28',bridge:false,layer:'0',sourceNamePresent:false});
 assert.deepEqual(findCrossStreets({segmentId:0,t:.5},graph,buildTopology(graph)).crossStreets,['West Road','East Road']);
});
test('selection reports genuine difficulty deficits and covers geographic base strata',()=>{
 const candidates=Array.from({length:6},(_,i)=>({id:'c'+i,lat:43,lng:-79+i*.01,recognitionDifficulty:i<2?'easy':'hard',facilityType:'residential-address',_street:'street'+i}));
 const result=selectCandidates(candidates,[],[{id:'west',lat:43,lng:-79},{id:'east',lat:43,lng:-78.95}],{easy:3,medium:1,hard:2},2);
 assert.equal(result.coverage.deficits.easy,1);assert.equal(result.coverage.deficits.medium,1);
 assert.equal(result.coverage.selectedByDifficulty.easy,2);
 assert.equal(result.coverage.baseStrata.every(x=>x.selected>=2),true);
 assert.equal(new Set(result.selected.map(x=>x.id)).size,result.selected.length);
});
test('EMS-only care homes do not fill shared or Fire recognition quotas',()=>{
 const geo=Array.from({length:20},(_,i)=>({id:'seed'+i,addr:(i+1)+' Seed Road',lat:43+i*.001,lng:-79,recognitionDifficulty:i<10?'easy':i<15?'medium':'hard',incidentProfiles:{fire:{sub:'Structure Fire'},ems:{sub:'Medical Assistance'}}}));
 const care=Array.from({length:3},(_,i)=>({id:'care'+i,addr:(100+i)+' Care Road',lat:44+i*.001,lng:-79,recognitionDifficulty:'medium',trainingServices:['ems'],incidentProfiles:{fire:{sub:'Structure Fire'},ems:{sub:'Medical Assistance'}}}));
 const baseline=baselineForServices([...geo,...care],'Ajax');
 assert.equal(baseline.shared.length,20);assert.equal(baseline.byService.fire.length,20);assert.equal(baseline.byService.ems.length,23);
 const source=Array.from({length:180},(_,i)=>({id:'new'+i,lat:45+i*.001,lng:-79,recognitionDifficulty:i<90?'easy':i<135?'medium':'hard',facilityType:'residential-address'}));
 const chosen=selectCandidates(source,baseline.shared,[],{easy:100,medium:50,hard:50});
 assert.equal(chosen.selected.length,180);assert.deepEqual(chosen.coverage.selectedByDifficulty,{easy:90,medium:45,hard:45});
});
test('current descriptor round trip regenerates identical IDs and counts without treating its prior supplement as legacy seed',()=>{
 const seed={id:'original-seed',addr:'1 Main St',lat:43,lng:-79,recognitionDifficulty:'easy'};
 const source=Array.from({length:8},(_,i)=>({id:'source-'+i,addr:(10+i)+' Main Street',lat:43+i*.001,lng:-79,recognitionDifficulty:i<4?'easy':i<6?'medium':'hard',_street:'Main Street'}));
 const target={easy:4,medium:2,hard:2},first=selectCandidates(source,[seed],[],target).selected;
 const descriptor={sharedLocations:first},roundtrip=prepareRegeneration([seed,...descriptor.sharedLocations],descriptor.sharedLocations,source,'Ajax');
 const second=selectCandidates(roundtrip.candidates,roundtrip.baseline,[],target).selected;
 assert.deepEqual(second.map(c=>c.id),first.map(c=>c.id));assert.equal(second.length,first.length);
 const changedIdentity=prepareRegeneration([seed,...first],first,[{...first[0],id:'new-source-id',addr:first[0].addr.replace('Street','St')}],'Ajax');
 assert.equal(changedIdentity.candidates[0].id,first[0].id);
 assert.equal(changedIdentity.candidates[0]._originalSourceId,'new-source-id');
});
test('an existing exact source ID wins over a second tenant at the same normalized civic address',()=>{
 const preserved={id:'source-a',name:'Pharmacy',addr:'1223 St. Clair Avenue West',lat:43.677423,lng:-79.445008};
 const alternate={id:'source-b',name:'Lab',addr:'1223 St Clair Ave W',lat:43.677233,lng:-79.445008};
 const prepared=prepareRegeneration([preserved],[preserved],[alternate,preserved],'Toronto');
 assert.equal(prepared.candidates[0].id,'source-b');assert.equal(prepared.candidates[1].id,'source-a');
 const winner=prepared.candidates.slice().sort((a,b)=>a.id.localeCompare(b.id))[0];assert.deepEqual([winner.lat,winner.lng],[preserved.lat,preserved.lng]);
});
function islandPolicyFixture(){
 const root=path.resolve(__dirname,'..'),training=JSON.parse(fs.readFileSync(path.join(root,'cities/toronto/training-data.json')));
 const feature=JSON.parse(fs.readFileSync(path.join(root,'cities/toronto/emergency-access-roads.geojson'))).features[0];
 return {feature,policy:loadEmergencyPolicy({id:'toronto'},training,root)};
}
test('only exact approved Island source geometry grants the emergency-road exception',()=>{
 const {feature,policy}=islandPolicyFixture();assert.equal(policy.approvedWays.size,33);
 assert.equal(emergencyRole(feature,policy).approach,true);
 assert.equal(emergencyRole({...feature,id:'way/999999999999'},policy).approach,false);
 const unapproved={...feature,properties:{...feature.properties,trainingEmergencyAccess:true,access:'private'},id:'way/999999999998'};
 assert.equal(emergencyRole(unapproved,policy).approach,false);
 const mainland=JSON.parse(JSON.stringify(feature));mainland.geometry.coordinates[0]=[-79.38,43.70];
 assert.equal(emergencyRole(mainland,policy).approach,false);
 assert.equal(emergencyRole({...feature,properties:{...feature.properties,trainingEmergencyAccess:false}},policy).approach,false);
});
test('Island annotation never inserts graph connections and retains private access and source points',()=>{
 const {feature,policy}=islandPolicyFixture(),coordinates=feature.geometry.coordinates;
 const graph={nodes:coordinates.map(([lng,lat],id)=>({id,lat,lng,edges:[]})),segments:coordinates.slice(1).map((_,i)=>({id:i,from:i,to:i+1,length:10,name:feature.properties.name,highway:'service',bridge:false,layer:'0'}))};
 const originalNodes=JSON.stringify(graph.nodes),originalConnections=graph.segments.map(s=>[s.from,s.to]);
 roadMetadata({features:[feature]},graph,policy);
 assert.equal(JSON.stringify(graph.nodes),originalNodes);assert.deepEqual(graph.segments.map(s=>[s.from,s.to]),originalConnections);
 const point={lat:coordinates[0][1],lng:coordinates[0][0]},originalPoint={...point};
 const api={state:{graph,traceCore:{snap:()=>({segmentId:0,t:0,distance:12,lat:point.lat+.0001,lng:point.lng})}}};
 const result=validateAccess(point,feature.properties.name,api,[feature.properties.name]);assert.equal(result.ok,true);assert.equal(result.emergencyAccess,true);
 assert.equal(graph.segments[0].sourceAccessRestrictions.motor_vehicle,'private');assert.deepEqual(point,originalPoint);
 graph.segments[0].designatedEmergencyAccess=false;
 assert.equal(validateAccess(point,feature.properties.name,api,[feature.properties.name]).ok,false);
});
test('the three approved Island reference clues do not grant vehicle approaches',()=>{
 const {policy}=islandPolicyFixture(),reference={id:'way/100974747',properties:{name:'Withrow Street',highway:'service',motor_vehicle:'private'},geometry:{type:'LineString',coordinates:[[-79.3560012,43.6312046],[-79.3569499,43.6313512]]}};
 const role=emergencyRole(reference,policy);assert.equal(role.referenceOnly,true);assert.equal(role.approach,false);
 assert.equal(emergencyRole({...reference,id:'way/999999999997'},policy).referenceOnly,false);
 assert.equal(emergencyRole({...reference,properties:{...reference.properties,bridge:'yes'}},policy).referenceOnly,false);
 const graph=fixture();Object.assign(graph.segments[5],{name:'Withrow Street',highway:'service',bridge:false,layer:'0',accessExcluded:true,referenceOnlyClue:true,sourceWayId:'way/100974747',sourceAccessRestrictions:{motor_vehicle:'private'}});
 const clues=findCrossStreets({segmentId:0,t:.5},graph,buildTopology(graph));assert.deepEqual(clues.crossStreets,['West Road','Withrow Street']);
 const evidence=clues.evidence[1].crossStreetAccessEvidence[0];assert.equal(evidence.role,'reference-only');assert.equal(evidence.vehicleEntryClaim,false);assert.equal(evidence.sourceAccessRestrictions.motor_vehicle,'private');
});
test('optional targeted bundles retain civic/source/provenance fields without moving points',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'city-call-targeted-'));
 try{const row={id:'toronto-osm-node-1',cityId:'toronto',name:'One',addr:'1 Cibola Avenue',lat:43.63,lng:-79.36,sourceGeometry:{type:'Point',coordinates:[-79.36,43.63]},provenance:{license:'ODbL-1.0'},selectionPurpose:{target:'Island',vehicleAccessAsserted:false}};
 fs.writeFileSync(path.join(directory,'toronto.targeted-candidates.json'),JSON.stringify({cityId:'toronto',locations:[row]}));
 const loaded=readTargetedCandidates({id:'toronto'},{osmDir:directory});assert.deepEqual({...loaded[0],_targetedInputs:undefined},{...row,_targeted:true,_targetedInputs:undefined});assert.equal(loaded[0]._targetedInputs[0].file,'toronto.targeted-candidates.json');assert.match(loaded[0]._targetedInputs[0].sha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(readTargetedCandidates({id:'ajax'},{osmDir:directory}),[]);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('zero-clue Island exceptions require the explicitly reviewed bundle and exact approved Lakeshore approach',()=>{
 const {policy}=islandPolicyFixture(),reviewed='a'.repeat(64),sourceWayId=[...policy.approvedWays.keys()].find(id=>id==='way/7779083');
 const purpose={target:'Toronto Island source civic enrichment',approvedRoadsPath:policy.sourceUrl,approvedRoadsSha256:policy.sourceSha256,sourceCivicStreetMatchesNearestApprovedRoadName:true},candidate={cityId:'toronto',_targeted:true,_reviewedIslandBundleSha256:reviewed,_reviewedIslandSelectionPurpose:purpose,selectionPurpose:purpose};
 const civic={number:'575',street:'Lakeshore Avenue'},access={ok:true,emergencyAccess:true,anchor:{distance:25},segment:{name:'Lakeshore Avenue',highway:'service',layer:'0',bridge:false,designatedEmergencyAccess:true,sourceWayId}},cross={missing:true,crossStreets:[],evidence:[],maxDistanceMetres:1500};
 assert.equal(isolatedIslandException(candidate,civic,access,cross,policy,reviewed).isolatedStreetException,true);
 assert.equal(isolatedIslandException(candidate,civic,access,cross,policy,null),null);
 assert.equal(isolatedIslandException({...candidate,_targeted:false},civic,access,cross,policy,reviewed),null);
 assert.equal(isolatedIslandException({...candidate,cityId:'ajax'},civic,access,cross,policy,reviewed),null);
 assert.equal(isolatedIslandException(candidate,{...civic,street:'Cibola Avenue'},access,cross,policy,reviewed),null);
 assert.equal(isolatedIslandException(candidate,civic,{...access,emergencyAccess:false},cross,policy,reviewed),null);
 assert.equal(isolatedIslandException(candidate,civic,{...access,segment:{...access.segment,sourceWayId:'way/999999999996'}},cross,policy,reviewed),null);
 assert.equal(isolatedIslandException(candidate,civic,{...access,anchor:{distance:81}},cross,policy,reviewed),null);
});
test('reviewed-bundle checksum cannot be spoofed by source fields or survive a file change',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'city-call-reviewed-'));
 try{const file=path.join(directory,'toronto.targeted-candidates.json'),row={id:'toronto-osm-node-2',cityId:'toronto',_reviewedIslandBundleSha256:'forged'};fs.writeFileSync(file,JSON.stringify({cityId:'toronto',locations:[row]}));
 assert.equal(readTargetedCandidates({id:'toronto'},{osmDir:directory})[0]._reviewedIslandBundleSha256,undefined);
 const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 assert.equal(readTargetedCandidates({id:'toronto'},{osmDir:directory,reviewedIslandBundleSha256:hash})[0]._reviewedIslandBundleSha256,hash);
 fs.appendFileSync(file,'\n');assert.throws(()=>readTargetedCandidates({id:'toronto'},{osmDir:directory,reviewedIslandBundleSha256:hash}),/checksum/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('isolated Island proposals are limited to eight source points at least150m apart',()=>{
 const chosen=[];for(let i=0;i<8;i++){const c={lat:43.61+i*.002,lng:-79.38};assert.equal(islandIsolationSlot(c,chosen),true);chosen.push(c);}
 assert.equal(islandIsolationSlot({lat:43.64,lng:-79.38},chosen),false);
 assert.equal(islandIsolationSlot({lat:43.6101,lng:-79.38},[chosen[0]]),false);
});
test('repeatable targeted-file flags preserve single-file and automatic modes',()=>{
 assert.equal(parseOptions(['--targeted-file','one.json']).targetedFile,'one.json');
 assert.deepEqual(parseOptions(['--targeted-file','one.json','--targeted-file','two.json']).targetedFile,['one.json','two.json']);
 assert.equal(parseOptions(['--city','toronto']).targetedFile,undefined);
});
test('multi-file targeting safely deduplicates identical facts and retains every file hash and purpose',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'city-call-multi-'));
 try{const row={id:'toronto-osm-node-3',cityId:'toronto',name:'Three',addr:'3 Main Street',lat:43.7,lng:-79.4,tags:{'addr:housenumber':'3','addr:street':'Main Street'},sourceGeometry:{type:'Point',coordinates:[-79.4,43.7]},provenance:{license:'ODbL-1.0'}};
 const one=path.join(directory,'one.json'),two=path.join(directory,'two.json');fs.writeFileSync(one,JSON.stringify({cityId:'toronto',locations:[{...row,selectionPurpose:{target:'one'}}]}));fs.writeFileSync(two,JSON.stringify({cityId:'toronto',locations:[{...row,selectionPurpose:{target:'two'}},{...row,id:'toronto-osm-node-4',addr:'4 Main Street',lat:43.701,sourceGeometry:{type:'Point',coordinates:[-79.4,43.701]}}]}));
 const loaded=readTargetedCandidates({id:'toronto'},{osmDir:directory,targetedFile:[one,two]});assert.equal(loaded.length,2);assert.deepEqual(loaded[0]._targetedInputs.map(c=>c.file),['one.json','two.json']);assert.deepEqual(loaded[0]._targetedInputs.map(c=>c.selectionPurpose.target),['one','two']);
 assert.equal(loaded[0]._targetedInputs[0].sha256,crypto.createHash('sha256').update(fs.readFileSync(one)).digest('hex'));assert.equal(loaded[0].lat,row.lat);assert.deepEqual(loaded[0].tags,row.tags);
 const prepared=prepareRegeneration([row],[row],loaded,'Toronto');assert.equal(prepared.candidates.find(c=>c.id===row.id).lat,row.lat);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('multi-file same-ID factual conflicts are rejected before any geometry or provenance is replaced',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'city-call-conflict-'));
 try{const row={id:'toronto-osm-node-5',cityId:'toronto',name:'Five',addr:'5 Main Street',lat:43.7,lng:-79.4,tags:{building:'house'},sourceGeometry:{type:'Point',coordinates:[-79.4,43.7]},provenance:{license:'ODbL-1.0'}};
 const one=path.join(directory,'one.json'),two=path.join(directory,'two.json');fs.writeFileSync(one,JSON.stringify({cityId:'toronto',locations:[row]}));
 for(const changed of [{...row,lat:43.71},{...row,addr:'6 Main Street'},{...row,tags:{building:'apartments'}},{...row,sourceGeometry:{type:'Point',coordinates:[-79.41,43.7]}},{...row,provenance:{license:'different'}}]){fs.writeFileSync(two,JSON.stringify({cityId:'toronto',locations:[changed]}));assert.throws(()=>readTargetedCandidates({id:'toronto'},{osmDir:directory,targetedFile:[one,two]}),/Conflicting targeted source facts/);}
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('only records in the hash-matching reviewed file can receive the Island exception context',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'city-call-review-scope-'));
 try{const {policy}=islandPolicyFixture(),purpose={target:'Toronto Island source civic enrichment',approvedRoadsPath:policy.sourceUrl,approvedRoadsSha256:policy.sourceSha256,sourceCivicStreetMatchesNearestApprovedRoadName:true},row={id:'toronto-osm-node-6',cityId:'toronto',name:'Six',addr:'6 Lakeshore Avenue',lat:43.62,lng:-79.38,selectionPurpose:purpose};
 const reviewed=path.join(directory,'reviewed.json'),ordinary=path.join(directory,'ordinary.json');fs.writeFileSync(reviewed,JSON.stringify({cityId:'toronto',locations:[row]}));const hash=crypto.createHash('sha256').update(fs.readFileSync(reviewed)).digest('hex');fs.writeFileSync(ordinary,JSON.stringify({cityId:'toronto',locations:[{...row,id:'toronto-osm-node-7',_reviewedIslandBundleSha256:hash,_reviewedIslandSelectionPurpose:purpose}]}));
 const loaded=readTargetedCandidates({id:'toronto'},{osmDir:directory,targetedFile:[ordinary,reviewed],reviewedIslandBundleSha256:hash});assert.equal(loaded[0]._reviewedIslandBundleSha256,undefined);assert.equal(loaded[1]._reviewedIslandBundleSha256,hash);assert.deepEqual(loaded[1]._reviewedIslandSelectionPurpose,purpose);
 const access={ok:true,emergencyAccess:true,anchor:{distance:10},segment:{name:'Lakeshore Avenue',highway:'service',layer:'0',designatedEmergencyAccess:true,sourceWayId:'way/7779083'}},cross={missing:true,crossStreets:[],evidence:[],maxDistanceMetres:1500};assert.equal(isolatedIslandException(loaded[0],{street:'Lakeshore Avenue'},access,cross,policy,hash),null);assert(isolatedIslandException(loaded[1],{street:'Lakeshore Avenue'},access,cross,policy,hash));
 assert.throws(()=>readTargetedCandidates({id:'toronto'},{osmDir:directory,targetedFile:ordinary,reviewedIslandBundleSha256:hash}),/checksum/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
