#!/usr/bin/env node
'use strict';
// Offline only: node tools/build-city-call-locations.cjs --city ajax \
//   --official-dir /cache/official/site-deduped --osm-dir /cache/osm/bundles --output-dir /scratch/catalogue
// Never changes production city data. Inputs retain actual source points, not guessed entrances.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const SUFFIX={st:'street',rd:'road',ave:'avenue',av:'avenue',dr:'drive',blvd:'boulevard',cres:'crescent',ct:'court',crt:'court',pl:'place',ln:'lane',pkwy:'parkway',hwy:'highway',terr:'terrace',ter:'terrace',cir:'circle',sq:'square',trl:'trail',gt:'gate'};
const DIRECTIONS={n:'north',s:'south',e:'east',w:'west',ne:'northeast',nw:'northwest',se:'southeast',sw:'southwest'};
const PUBLIC=new Set(['primary','secondary','tertiary','unclassified','residential','living_street','road']);
const TARGET={easy:100,medium:50,hard:50};
const ISLAND_REFERENCE_WAYS=new Map([['way/100882922','Pontiac Avenue'],['way/100974747','Withrow Street'],['way/442943456',"Ward's Island Trail"]]);
const featureSignature=f=>crypto.createHash('sha256').update(JSON.stringify({id:f.id,properties:f.properties,geometry:f.geometry})).digest('hex');
const text=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[.]/g,'').replace(/[^a-z0-9 -]/g,' ').replace(/\s+/g,' ').trim();
function normalizeStreet(value){return text(value).split(' ').map(t=>SUFFIX[t]||DIRECTIONS[t]||t).join(' ');}
// Topology only: a direction label changing at a junction does not make a new
// cross street. Address matching above/below always retains every direction.
function streetFamily(value){return normalizeStreet(value).replace(/\s+(north|south|east|west|northeast|northwest|southeast|southwest)$/,'');}
function withoutSuffix(value){return normalizeStreet(value).split(' ').filter(t=>!Object.values(SUFFIX).includes(t)).join(' ');}
function parseAddress(value,cityName=''){
 let addr=String(value||'').trim().replace(/^\s*(?:unit|suite|apt\.?|apartment)\s+[\w-]+\s*[,;]\s*/i,'');
 addr=addr.replace(/\s+(?:#\s*|unit\s+|suite\s+|apt\.?\s+)[\w-]+\s*$/i,'');
 // Municipality/province/postal suffixes do not form part of a civic street.
 addr=addr.split(',')[0].trim();
 if(cityName){const escaped=cityName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');addr=addr.replace(new RegExp('\\s+'+escaped+'(?:\\s+(?:ON|Ontario))?(?:\\s+[A-Z]\\d[A-Z]\\s?\\d[A-Z]\\d)?$','i'),'').trim();}
 if(/^\d+\s*[-/]\s*\d+\b/.test(addr))return null;
 const match=addr.match(/^(\d+[a-z]?)\s+([a-z].*)$/i);
 if(!match||/[;|]/.test(match[2]))return null;
 return {number:match[1].toLowerCase(),street:match[2].trim(),addr:match[1]+' '+match[2].trim()};
}
function addressKey(value,cityName){const p=parseAddress(value,cityName);return p?p.number+' '+normalizeStreet(p.street):'';}
function metres(a,b){return Math.hypot((a.lng-b.lng)*111320*Math.cos((a.lat+b.lat)*Math.PI/360),(a.lat-b.lat)*111320);}
function isDuplicate(candidate,existing,cityName){
 const key=candidate._addressKey??addressKey(candidate.addr||candidate.address,cityName),name=candidate._nameKey??text(candidate.name);
 return existing.some(other=>other.id===candidate.id||(key&&key===(other._addressKey??addressKey(other.addr||other.address,cityName)))||metres(candidate,other)<3||(name&&name===(other._nameKey??text(other.name))&&metres(candidate,other)<80));
}
function prepareRegeneration(calls,previous,candidates,cityName){
 const previousIds=new Set(previous.map(c=>c.id)),candidateIds=new Set(candidates.map(c=>c.id)),byAddress=new Map(previous.map(c=>[addressKey(c.addr,cityName),c]));
 return {baseline:calls.filter(c=>!previousIds.has(c.id)&&!c.id.startsWith('route-base-')),candidates:candidates.map(c=>{
  const prior=byAddress.get(addressKey(c.address||c.addr,cityName));
  // Do not remap another tenant over an exact source identity that still exists.
  if(prior&&c.id!==prior.id&&candidateIds.has(prior.id))return c;
  return prior?{...c,id:prior.id,_originalSourceId:c.id}:c;
 })};
}
function buildStreetIndex(mappedNames){
 const exact=new Map(),omitted=new Map();
 for(const name of mappedNames){const key=normalizeStreet(name);if(!exact.has(key))exact.set(key,name);}
 for(const [key,name] of exact){const base=withoutSuffix(key),group=omitted.get(base)||[];group.push(name);omitted.set(base,group);}
 return {exact,omitted};
}
function matchStreet(street,mappedNames){
 const index=Array.isArray(mappedNames)?buildStreetIndex(mappedNames):mappedNames,normalized=normalizeStreet(street),exact=index.exact.get(normalized);
 if(exact)return {road:exact,normalization:'suffix-abbreviation-case-accent'};
 // Only omit a suffix; a missing direction is never invented.
 if(normalized!==withoutSuffix(normalized))return null;
 const matches=index.omitted.get(normalized)||[];
 return matches.length===1?{road:matches[0],normalization:'unambiguous-mapped-suffix'}:null;
}
function classifyRecognition(candidate,highway){
 const tags=candidate.tags||{},category=candidate.category||tags.amenity||tags.healthcare||tags.leisure||tags.shop||tags.building||'';
 const distinct=String(candidate.name||'')&&!/^\d/.test(candidate.name);
 if(distinct&&/^(hospital|university|college|townhall|fire_station|police|community_centre|sports_centre|stadium|library|museum)$/.test(category))return {difficulty:'easy',reason:'Distinctive named '+category.replace(/_/g,' ')+' landmark.'};
 if(['primary','secondary'].includes(highway))return {difficulty:'easy',reason:'Exact civic address on a mapped '+highway+' road.'};
 if(distinct||highway==='tertiary')return {difficulty:'medium',reason:distinct?'Named local facility or business; recognition is not assumed citywide.':'Civic address on a mapped tertiary road.'};
 return {difficulty:'hard',reason:'Ordinary civic address on a smaller local road; no distinctive landmark is asserted.'};
}
function incidentProfiles(type){
 const fire=type==='parking'?'Vehicle Fire':/^(recreation|park|pitch|playground|golf_course|garden|cemetery|grave_yard|marina|beach|nature_reserve|dog_park|letter_box)$/.test(type)?'Fire Investigation':'Structure Fire';
 return {fire:{sub:fire},ems:{sub:'Medical Assistance'}};
}
const physicalGround=s=>s&&s.sourceNamePresent!==false&&!s.bridge&&!s.tunnel&&String(s.layer||'0')==='0'&&Boolean(s.name)&&s.name!=='Unnamed road'&&!/\b(service lane|service road|access lane|driveway|parking)\b/i.test(s.name);
const ground=s=>physicalGround(s)&&((!s.accessExcluded&&PUBLIC.has(s.highway))||(s.highway==='service'&&s.designatedEmergencyAccess===true));
const clueGround=s=>ground(s)||(physicalGround(s)&&s.referenceOnlyClue===true);
function validateAccess(point,street,api,mappedNames){
 const anchor=api.state.traceCore.snap(point,520),graph=api.state.graph;
 if(!anchor||!Number.isFinite(anchor.distance)||anchor.distance>80)return {ok:false,reason:'production-snap-over-80m-or-missing'};
 const segment=graph.segments[anchor.segmentId];
 if(!ground(segment))return {ok:false,reason:'production-snap-not-ground-public-road'};
 const match=matchStreet(street,mappedNames);
 if(!match||normalizeStreet(match.road)!==normalizeStreet(segment.name))return {ok:false,reason:'production-snap-wrong-street'};
 return {ok:true,anchor,segment,normalization:match.normalization,emergencyAccess:segment.designatedEmergencyAccess===true};
}
function buildTopology(graph){
 const atNode=new Map();
 for(const s of graph.segments)if(clueGround(s))for(const id of [s.from,s.to]){let list=atNode.get(id);if(!list)atNode.set(id,list=[]);list.push(s);}
 return atNode;
}
function findCrossStreets(anchor,graph,topology,maxDistance=1500){
 const start=graph.segments[anchor.segmentId],street=streetFamily(start.name),evidence=[];
 for(const [nodeId,gap,opposite] of [[start.from,start.length*anchor.t,start.to],[start.to,start.length*(1-anchor.t),start.from]]){
  const queue=[{nodeId,distance:gap}],best=new Map([[opposite,0]]);let found=null;
  while(queue.length){
   queue.sort((a,b)=>b.distance-a.distance);const current=queue.pop();
   if(current.distance>maxDistance||current.distance>=(best.get(current.nodeId)??Infinity))continue;
   best.set(current.nodeId,current.distance);
   const connected=topology.get(current.nodeId)||[],other=connected.filter(s=>streetFamily(s.name)!==street).sort((a,b)=>a.name.localeCompare(b.name));
   const arms=new Set(connected.map(s=>s.from===current.nodeId?s.to:s.from));
   if(other.length&&arms.size>=3){const node=graph.nodes[current.nodeId],crossing=other.filter(s=>s.name===other[0].name);found={name:other[0].name,nodeId:node.id,lat:node.lat,lng:node.lng,distanceAlongAddressStreetMetres:Math.round(current.distance),addressStreetWayIds:[...new Set(connected.filter(s=>streetFamily(s.name)===street).map(s=>s.sourceWayId).filter(Boolean))],crossStreetWayIds:[...new Set(crossing.map(s=>s.sourceWayId).filter(Boolean))]};
    const restricted=crossing.filter(s=>s.referenceOnlyClue||s.designatedEmergencyAccess);
    if(restricted.length)found.crossStreetAccessEvidence=[...new Map(restricted.map(s=>[s.sourceWayId,{sourceWayId:s.sourceWayId,role:s.referenceOnlyClue?'reference-only':'designated-emergency-road-clue',vehicleEntryClaim:false,sourceAccessRestrictions:s.sourceAccessRestrictions||{}}])).values()];
    break;}
   for(const s of connected)if(streetFamily(s.name)===street){const next=s.from===current.nodeId?s.to:s.from;if(next!==opposite)queue.push({nodeId:next,distance:current.distance+s.length});}
  }
  if(found&&!evidence.some(e=>streetFamily(e.name)===streetFamily(found.name)))evidence.push(found);
 }
 return {crossStreets:evidence.map(e=>e.name),evidence,oneStreetException:evidence.length===1,exceptionReason:evidence.length===1?'Only one distinct genuine named cross street found within the bounded same-street search.':null,missing:evidence.length===0,maxDistanceMetres:maxDistance,method:'nearest-named-connected-ground-level-junction-in-each-same-street-direction',directionalContinuationsExcluded:true};
}
function intersectApproach(point,access,api){
 if(access.anchor.distance<1)return null;
 const p=api.toXY(point.lat,point.lng),q=api.toXY(access.anchor.lat,access.anchor.lng),graph=api.state.graph;
 const cross=(a,b)=>a.x*b.y-a.y*b.x,r={x:q.x-p.x,y:q.y-p.y};
 for(const id of api.nearbySegments(p.x,p.y,100)){
  const s=graph.segments[id];if(s.id===access.segment.id)continue;
  const barrier=s.bridge||String(s.layer||'0')!=='0'||/^(motorway|trunk)/.test(s.highway)||normalizeStreet(s.name)===normalizeStreet(access.segment.name);
  if(!barrier)continue;
  const v={x:s.dx,y:s.dy},denom=cross(r,v);if(Math.abs(denom)<1e-8)continue;
  const d={x:s.ax-p.x,y:s.ay-p.y},t=cross(d,v)/denom,u=cross(d,r)/denom;
  if(t>.01&&t<.99&&u>0&&u<1)return s;
 }
 return null;
}
function countDifficulties(rows){const counts={easy:0,medium:0,hard:0};for(const r of rows)if(Object.hasOwn(counts,r.recognitionDifficulty))counts[r.recognitionDifficulty]++;return counts;}
function baselineForServices(existing,cityName){
 const eligible=(c,service)=>(!Array.isArray(c.trainingServices)||c.trainingServices.includes(service))&&(!c.incidentProfiles||Boolean(c.incidentProfiles[service]));
 const unique=rows=>{const out=[];for(const c of rows)if(!isDuplicate(c,out,cityName))out.push(c);return out;};
 return {shared:unique(existing.filter(c=>eligible(c,'fire')&&eligible(c,'ems'))),byService:Object.fromEntries(['fire','ems'].map(service=>[service,unique(existing.filter(c=>eligible(c,service)))]))};
}
function selectCandidates(candidates,existing,bases,target=TARGET,minPerBase=5){
 const chosen=[],selectedIds=new Set(),existingCounts=countDifficulties(existing),owners=new Map(),baseCounts=new Map(),cells=new Map(),streets=new Map();
 for(const c of candidates){let owner=null,gap=Infinity;for(const b of bases){const d=metres(c,b);if(d<gap){owner=b.id;gap=d;}}owners.set(c.id,owner);}
 const cell=c=>Math.floor(c.lat*111320/1000)+','+Math.floor(c.lng*111320*Math.cos(c.lat*Math.PI/180)/1000);
 const add=c=>{chosen.push(c);selectedIds.add(c.id);const owner=owners.get(c.id);baseCounts.set(owner,(baseCounts.get(owner)||0)+1);cells.set(cell(c),(cells.get(cell(c))||0)+1);streets.set(c._street,(streets.get(c._street)||0)+1);};
 const pick=pool=>pool.filter(c=>!selectedIds.has(c.id)).sort((a,b)=>{
  const score=c=>(baseCounts.get(owners.get(c.id))||0)*10+(cells.get(cell(c))||0)*5+(streets.get(c._street)||0)*2-(c.facilityType!=='residential-address'?1:0);
  return score(a)-score(b)||a.id.localeCompare(b.id);
 })[0];
 for(const difficulty of Object.keys(target)){
  const pool=candidates.filter(c=>c.recognitionDifficulty===difficulty),needed=Math.max(0,target[difficulty]-existingCounts[difficulty]);
  for(let n=0;n<needed;n++){const c=pick(pool);if(!c)break;add(c);}
 }
 // Geographic strata improve candidate coverage only. They are not first-due districts.
 for(const base of bases){const pool=candidates.filter(c=>owners.get(c.id)===base.id);while((baseCounts.get(base.id)||0)<minPerBase){const c=pick(pool);if(!c)break;add(c);}}
 const selectedByDifficulty=countDifficulties(chosen),totals=Object.fromEntries(Object.keys(target).map(k=>[k,existingCounts[k]+selectedByDifficulty[k]]));
 return {selected:chosen,coverage:{target,existingByDifficulty:existingCounts,selectedByDifficulty,totalByDifficulty:totals,deficits:Object.fromEntries(Object.keys(target).map(k=>[k,Math.max(0,target[k]-totals[k])])),baseStrata:bases.map(b=>({id:b.id,selected:baseCounts.get(b.id)||0,available:candidates.filter(c=>owners.get(c.id)===b.id).length,method:'nearest-geographic-base-for-selection-only'}))}};
}
function loadEmergencyPolicy(city,training,root){
 const descriptor=training.roadSource?.emergencyAccessSupplement;if(!descriptor)return null;
 const expected='cities/toronto/emergency-access-roads.geojson',policyUrl='https://www.toronto.ca/explore-enjoy/toronto-island-ferries/commercial-emergency-vehicles/';
 if(city.id!=='toronto'||descriptor.url!==expected||descriptor.wayCount!==33||descriptor.officialPolicyUrl!==policyUrl)throw Error('Unsupported designated emergency-road policy');
 const bytes=fs.readFileSync(path.join(root,expected)),source=JSON.parse(bytes),approvedWays=new Map(),excluded=new Set(descriptor.excludedWayIds||[]);
 if(source.type!=='FeatureCollection'||source.features.length!==33)throw Error('Invalid designated emergency-road source count');
 for(const f of source.features){const p=f.properties||{};
  if(!/^way\/\d+$/.test(f.id)||approvedWays.has(f.id)||p.trainingEmergencyAccess!==true||p.highway!=='service'||p.surface!=='asphalt'||!p.name||f.geometry?.type!=='LineString'||f.geometry.coordinates.some(c=>!Number.isFinite(c[0])||!Number.isFinite(c[1])))throw Error('Invalid designated emergency-road source feature');
  if(!excluded.has(f.id))approvedWays.set(f.id,featureSignature(f));
 }
 return {cityId:city.id,approvedWays,referenceWays:ISLAND_REFERENCE_WAYS,sourceUrl:expected,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),officialPolicyUrl:policyUrl};
}
function emergencyRole(feature,policy){
 const p=feature.properties||{},groundLevel=!p.bridge||['no','false','0'].includes(String(p.bridge)),noTunnel=!p.tunnel||['no','false','0'].includes(String(p.tunnel));
 if(!policy||!groundLevel||!noTunnel||String(p.layer||'0')!=='0'||p.highway!=='service'||!p.name||feature.geometry?.type!=='LineString')return {approach:false,referenceOnly:false};
 return {approach:p.trainingEmergencyAccess===true&&policy.approvedWays.get(feature.id)===featureSignature(feature),referenceOnly:policy.referenceWays.get(feature.id)===p.name};
}
function roadMetadata(roads,graph,policy=null){
 let index=0;
 for(const f of roads.features){const g=f.geometry,p=f.properties||{},role=emergencyRole(f,policy),lines=g?.type==='LineString'?[g.coordinates]:g?.type==='MultiLineString'?g.coordinates:[];
  for(const line of lines)for(let i=1;i<line.length;i++){
   if(line[i][0]===line[i-1][0]&&line[i][1]===line[i-1][1])continue;
   // Production graph rounds source node identities to seven decimal places.
   if(line[i].map(n=>Number(n).toFixed(7)).join(',')===line[i-1].map(n=>Number(n).toFixed(7)).join(','))continue;
   const s=graph.segments[index++];if(!s)throw Error('Source/production segment alignment changed');s.sourceWayId=f.id||('way/'+p.osm_id);s.sourceNamePresent=Boolean(String(p.name||'').trim());s.tunnel=p.tunnel&&!['no','false','0'].includes(String(p.tunnel));s.accessExcluded=[p.access,p.vehicle,p.motor_vehicle].some(v=>/^(private|no|customers|permit)$/.test(String(v||'')));s.sourceAccessRestrictions=Object.fromEntries(['access','vehicle','motor_vehicle'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));s.designatedEmergencyAccess=role.approach;s.referenceOnlyClue=role.referenceOnly;
  }
 }
 if(index!==graph.segments.length)throw Error('Source/production segment count mismatch');
}
const readJSON=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function readRows(file){if(!fs.existsSync(file))return [];const data=readJSON(file);return Array.isArray(data)?data:data.locations||[];}
const stableValue=value=>Array.isArray(value)?value.map(stableValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableValue(value[k])])):value;
const TARGET_AUGMENTATION=new Set(['selectionPurpose','priorityScore','independentSourceReview','verifiedcurrentness','reviewFlags','sources','sourceUrls','crossStreets']);
function targetedFacts(row){return JSON.stringify(stableValue(Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith('_')&&!TARGET_AUGMENTATION.has(key)))));}
function mergeTargetedRows(a,b){
 if(targetedFacts(a)!==targetedFacts(b))throw Error('Conflicting targeted source facts: '+a.id);
 const merged={...a,_targetedInputs:[...a._targetedInputs,...b._targetedInputs]};
 for(const key of ['sources','sourceUrls','reviewFlags'])if(a[key]||b[key])merged[key]=[...new Set([...(a[key]||[]),...(b[key]||[])])];
 for(const key of ['independentSourceReview','verifiedcurrentness'])if(!merged[key]&&b[key])merged[key]=b[key];
 if(b._reviewedIslandBundleSha256){merged._reviewedIslandBundleSha256=b._reviewedIslandBundleSha256;merged._reviewedIslandSelectionPurpose=b._reviewedIslandSelectionPurpose;}
 return merged;
}
function readTargetedCandidates(city,options){
 const files=[...new Set((options.targetedFile?[].concat(options.targetedFile):[path.join(options.osmDir,city.id+'.targeted-candidates.json')]).map(f=>path.resolve(f)))],expected=options.reviewedIslandBundleSha256,byId=new Map();let reviewedFound=false;
 if(expected&&(city.id!=='toronto'||!/^[a-f0-9]{64}$/.test(expected)))throw Error('Reviewed Island bundle checksum/city mismatch');
 for(const file of files){
  if(!fs.existsSync(file)){if(options.targetedFile)throw Error('Explicit targeted source file does not exist');continue;}
  const bytes=fs.readFileSync(file),data=JSON.parse(bytes),rows=Array.isArray(data)?data:data.locations||[],actual=crypto.createHash('sha256').update(bytes).digest('hex'),reviewed=Boolean(expected&&actual===expected);
  if(reviewed&&data.cityId!=='toronto')throw Error('Reviewed Island bundle checksum/city mismatch');
  reviewedFound||=reviewed;
  for(const c of rows){
   // File-scoped trust is computed here; source fields cannot grant it.
   const row={...Object.fromEntries(Object.entries(c).filter(([key])=>!key.startsWith('_'))),_targeted:true,_targetedInputs:[{file:path.basename(file),sha256:actual,selectionPurpose:c.selectionPurpose||null,reviewedIslandBundle:reviewed}]};
   if(reviewed){row._reviewedIslandBundleSha256=actual;row._reviewedIslandSelectionPurpose=c.selectionPurpose||null;}
   byId.set(row.id,byId.has(row.id)?mergeTargetedRows(byId.get(row.id),row):row);
  }
 }
 if(expected&&!reviewedFound)throw Error('Reviewed Island bundle checksum did not match any supplied file');
 return [...byId.values()];
}
function isolatedIslandException(c,civic,access,cross,policy,reviewedSha){
 const purpose=c._reviewedIslandSelectionPurpose||{};
 if(!reviewedSha||c._reviewedIslandBundleSha256!==reviewedSha||!c._targeted||c.cityId!=='toronto'||purpose.target!=='Toronto Island source civic enrichment'||purpose.approvedRoadsPath!==policy?.sourceUrl||purpose.approvedRoadsSha256!==policy?.sourceSha256||purpose.sourceCivicStreetMatchesNearestApprovedRoadName!==true)return null;
 if(!cross.missing||cross.crossStreets.length||cross.evidence.length||cross.maxDistanceMetres!==1500||!access.ok||!access.emergencyAccess||!ground(access.segment)||!policy.approvedWays.has(access.segment.sourceWayId)||access.anchor.distance>80||normalizeStreet(civic.street)!=='lakeshore avenue'||normalizeStreet(access.segment.name)!=='lakeshore avenue')return null;
 return {isolatedStreetException:true,reason:'Reviewed targeted Lakeshore Avenue civic point has no eligible genuine named connected ground-level cross street within 1500m in either direction under the public-road, 33 designated-way and three reference-way clue policy. Empty clues are retained; navigation complexity is limited. No street or vehicle connection is invented.',boundedSearchMetres:1500,sourceWayId:access.segment.sourceWayId,reviewedBundleSha256:reviewedSha,approvedRoadsSha256:policy.sourceSha256,maxSites:8,minimumSourcePointSpacingMetres:150};
}
function islandIsolationSlot(candidate,existing){return existing.length<8&&existing.every(c=>metres(candidate,c)>=150);}
function insideBounds(p,bounds){return Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=bounds[0][0]&&p.lat<=bounds[1][0]&&p.lng>=bounds[0][1]&&p.lng<=bounds[1][1];}
function facilityType(c){
 const tags=c.tags||{},building=/^(yes|house|detached|residential|semidetached_house|terrace|bungalow|cabin)$/.test(tags.building)?null:tags.building;
 return c.category||tags.amenity||tags.healthcare||tags.leisure||tags.shop||building||'residential-address';
}
function sourceReviewProblem(c){
 const flags=c.reviewFlags||[];
 if(flags.includes('independent-source-review-rejected'))return 'independent-source-review-rejected';
 const proof=c.verifiedcurrentness,proofUrls=proof?.sourceUrls||(proof?.rosterUrl?[proof.rosterUrl]:[]);
 const currentCorroboration=proof&&/official/.test(String(proof.method))&&proof.retrievedAt&&proofUrls.some(url=>/^https:\/\//.test(url));
 if(flags.includes('source-data-2020-currentness-review-required')&&!currentCorroboration)return 'unresolved-2020-source-currentness';
 if(flags.some(flag=>/coordinate-(?:conflict|spread)|address-differs/.test(flag)))return 'unresolved-official-coordinate-or-current-address-conflict';
 if(/odbus/i.test(c.dataset||''))return 'stale-business-source-not-independently-corroborated';
 return null;
}
function sanitized(c){return Object.fromEntries(Object.entries(c).filter(([key])=>!key.startsWith('_')));}
async function buildCity(city,options){
 const data=require('./route-response-data.cjs'),trace=require('../route-mapping/trace-core.js');
 const input=await data.loadCity(city),api=data.app(city,input.training,input.bases),emergencyPolicy=loadEmergencyPolicy(city,input.training,data.root);api.state.graph=api.buildGraph(input.roads);roadMetadata(input.roads,api.state.graph,emergencyPolicy);
 api.state.traceCore=trace.createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
 const topology=buildTopology(api.state.graph),mappedNames=buildStreetIndex([...new Set(api.state.graph.segments.filter(ground).map(s=>s.name))]);
 const boundaryFile=path.join(options.osmDir,'selected-boundaries.geojson'),boundaries=fs.existsSync(boundaryFile)?readJSON(boundaryFile).features.filter(f=>f.properties.cityId===city.id):[];
 const official=readRows(path.join(options.officialDir,city.id+'.json')),osm=readRows(path.join(options.osmDir,city.id+'.candidates.json')),majorRoad=readRows(path.join(options.osmDir,city.id+'.major-road-candidates.json')),targeted=readTargetedCandidates(city,options);
 const previous=input.training.sharedLocations||[],regeneration=prepareRegeneration(input.calls,previous,official.concat(osm,majorRoad,targeted),city.name);
 const existing=regeneration.baseline.map(c=>({...c,_addressKey:addressKey(c.addr||c.address,city.name),_nameKey:text(c.name)})),accepted=[],audit=[],records={},isolatedPoints=[],ids=new Set(existing.map(c=>c.id));
 const preservedIds=new Set(previous.map(c=>c.id));
 const ordered=regeneration.candidates.sort((a,b)=>Number(preservedIds.has(b.id))-Number(preservedIds.has(a.id))||(a.tags?1:0)-(b.tags?1:0)||String(a.id).localeCompare(String(b.id)));
 for(const c of ordered){
  const reject=reason=>audit.push({id:c.id,addr:c.addr||c.address,name:c.name,reason,sourceUrls:c.sourceUrls||c.sources||[],reviewFlags:c.reviewFlags||[],independentSourceReview:c.independentSourceReview||null});
  if(c.cityId!==city.id){reject('source-city-mismatch');continue;}
  if(!insideBounds(c,input.training.bounds)){reject('outside-game-bounds-or-invalid-coordinate');continue;}
  if(!boundaries.length||!boundaries.some(f=>data.inside(c,f.geometry))){reject('outside-verified-municipality-or-boundary-unavailable');continue;}
  const sourceProblem=sourceReviewProblem(c);if(sourceProblem){reject(sourceProblem);continue;}
  const licence=c.licence||c.provenance?.license,sourceUrls=c.sourceUrls||c.sources||[];
  if(!licence||!sourceUrls.length||sourceUrls.some(url=>!/^https:\/\//.test(url))){reject('missing-licence-or-source-url');continue;}
  const civic=parseAddress(c.address||c.addr,city.name);if(!civic){reject('not-one-exact-civic-number-and-street');continue;}
  const access=validateAccess(c,civic.street,api,mappedNames);if(!access.ok){reject(access.reason);continue;}
  const barrier=intersectApproach(c,access,api);if(barrier){reject('approach-crosses-bridge-highway-or-opposite-carriageway');continue;}
  const cross=findCrossStreets(access.anchor,api.state.graph,topology);
  const isolated=isolatedIslandException(c,civic,access,cross,emergencyPolicy,options.reviewedIslandBundleSha256);
  if(cross.missing&&!isolated){reject('no-genuine-connected-cross-street-within-1500m');continue;}
  if(isolated){cross.isolatedStreetException=true;cross.isolatedStreetExceptionReason=isolated.reason;cross.isolatedStreetExceptionEvidence=isolated;}
  const normalizedCivic=access.normalization==='unambiguous-mapped-suffix'?civic.number+' '+access.segment.name:civic.addr;
  const recognition=classifyRecognition(c,access.segment.highway),type=facilityType(c),profiles=incidentProfiles(type),row={id:c.id,
   cityId:city.id,
   name:c.name||normalizedCivic,
   addr:normalizedCivic,
   lat:c.lat,
   lng:c.lng,
   radius:Math.min(100,Math.max(type==='residential-address'?45:65,Math.ceil(access.anchor.distance+20))),
   recognitionDifficulty:recognition.difficulty,
   difficultyReason:recognition.reason,
   crossStreets:cross.crossStreets,
   main:'Fire',
   sub:profiles.fire.sub,
   incidentProfiles:profiles,
   facilityType:type,
   locationKind:'sourced-address',
   routeAccess:{lat:access.anchor.lat,
   lng:access.anchor.lng,
   road:access.segment.name,
   distanceMetres:Math.round(access.anchor.distance*10)/10,
   method:access.emergencyAccess?'modeled-designated-emergency-road-approach':'modeled-public-road-approach',...(access.emergencyAccess?{verifiedEntrance:false,publicRoad:false,designatedEmergencyRoad:true,sourceAccessRestrictions:access.segment.sourceAccessRestrictions,officialPolicyUrl:emergencyPolicy.officialPolicyUrl}:{} ),...(isolated?{isolatedStreetException:true,isolatedStreetExceptionReason:isolated.reason}:{})},
   geographicVerificationRef:`cities/${city.id}/call-provenance.json#${c.id}`,
   confirmed:false,
   custom:false,
   sources:sourceUrls,
   ...(isolated?{isolatedStreetException:true,isolatedStreetExceptionReason:isolated.reason}:{}),
   _street:normalizeStreet(access.segment.name),_addressKey:addressKey(normalizedCivic,city.name),_nameKey:text(c.name||normalizedCivic)};
  if(ids.has(row.id)){reject(existing.some(c=>c.id===row.id)?'existing-canonical-id-retained':'duplicate-existing-or-accepted-address-or-named-site');continue;}
  if(isDuplicate(row,existing.concat(accepted),city.name)){reject('duplicate-existing-or-accepted-address-or-named-site');continue;}
  if(isolated&&!islandIsolationSlot(row,isolatedPoints)){reject('isolated-island-spacing-or-max-eight');continue;}
  if(isolated)isolatedPoints.push(row);
  ids.add(row.id);accepted.push(row);
  records[row.id]={id:row.id,
   sourceRecordId:c._originalSourceId||c.id,
   sourceCanonicalId:c.sourceCanonicalId||null,
   sourceAliases:c.alternativeFacilityNames||[],
   sourceSelectionPurpose:c.selectionPurpose||null,
   sourceInputFiles:c._targetedInputs||[],
   independentSourceReview:c.independentSourceReview||null,
   currentness:c.verifiedcurrentness?{status:/roster/.test(c.verifiedcurrentness.method||'')?'official-roster-corroborated':'official-operator-or-public-body-corroborated',evidence:c.verifiedcurrentness}:{status:c.tags?'documented-in-osm-snapshot-not-open-status-verified':'source-currentness-not-individually-verified'},
   sourceFeatureId:c.sourceFeatureId||null,
   mergedSourceRecordIds:c.mergedSourceRecordIds||null,sourceUrls,
   retrievedAt:c.retrievedAt||c.provenance?.retrievedAt,licence,
   sourceMetadata:c.provenance||{dataset:c.dataset,
   verifiedcurrentness:c.verifiedcurrentness||null},
   sourcePoint:{lat:c.lat,
   lng:c.lng,
   method:c.coordinateMethod||c.sourceGeometryQuality||'source-point'},
   sourceGeometryType:c.sourceGeometry?.type||'Point',
   municipality:{method:'source-point-inside-selected-osm-boundary-and-game-bounds',
   sourceRelationIds:boundaries.map(f=>f.properties.osmId),
   sourceUrls:boundaries.map(f=>'https://www.openstreetmap.org/relation/'+f.properties.osmId),
   sourceEvidence:c.municipalityEvidence||c.cityMatchBasis,
   warning:c.municipalityEvidence?.warning||boundaries.map(f=>f.properties.tags?.fixme||f.properties.tags?.note).filter(Boolean).join('; ')||null},
   normalization:{originalAddress:c.addr||c.address,
   canonicalAddress:row.addr,
   streetMatch:access.normalization,
   directionsPreserved:true,
   civicNumberInvented:false},
   roadApproach:{...row.routeAccess,
   segmentId:access.anchor.segmentId,
   segmentT:access.anchor.t,
   sourceWayId:access.segment.sourceWayId,
   ...(access.emergencyAccess?{designatedEmergencyRoad:true,publicRoad:false,policySource:emergencyPolicy.sourceUrl,policySourceSha256:emergencyPolicy.sourceSha256,officialPolicyUrl:emergencyPolicy.officialPolicyUrl,sourceAccessRestrictions:access.segment.sourceAccessRestrictions}:{}),
   verifiedEntrance:false,
   productionSnapToleranceMetres:80},
   radiusReason:'At least '+(type==='residential-address'?45:65)+'m, enlarged to modeled road gap plus 20m where necessary, capped at 100m.',
   crossStreets:cross,recognition,
   sourceReviewFlags:c.reviewFlags||[],
   reviewFlags:(c.reviewFlags||[]).filter(flag=>flag!=='cross-streets-not-derived').concat(isolated?['isolated-street-zero-genuine-cross-clues']:[]),
   limitations:['Source location point retained; modeled road approach is not a surveyed or verified entrance.','Recognition labels are modeled from source landmark type and mapped road class.','No official response district or dispatch run card is inferred.']};
 }
 const missingPrevious=previous.filter(c=>!accepted.some(a=>a.id===c.id));
 if(missingPrevious.length)throw Error('Previous canonical supplements no longer source-validated; manual review required before replacing provenance: '+missingPrevious.map(c=>c.id).join(','));
 const movedPrevious=previous.filter(c=>{const current=accepted.find(a=>a.id===c.id);return current.lat!==c.lat||current.lng!==c.lng;});
 if(movedPrevious.length)throw Error('Previous canonical source points would move; explicit review required: '+movedPrevious.map(c=>c.id).join(','));
 const baseline=baselineForServices(existing,city.name),selection=selectCandidates(accepted,baseline.shared,input.bases,TARGET,5);
 for(const prior of previous){const current=accepted.find(c=>c.id===prior.id);if(!selection.selected.some(c=>c.id===prior.id))selection.selected.push(current);}
 const sharedLocations=selection.selected.map(sanitized);
 selection.coverage.selectedByDifficulty=countDifficulties(sharedLocations);
 selection.coverage.totalByDifficulty=Object.fromEntries(Object.keys(TARGET).map(k=>[k,selection.coverage.existingByDifficulty[k]+selection.coverage.selectedByDifficulty[k]]));
 selection.coverage.deficits=Object.fromEntries(Object.keys(TARGET).map(k=>[k,Math.max(0,TARGET[k]-selection.coverage.totalByDifficulty[k])]));
 selection.coverage.sharedBaseline=baseline.shared.length;
 selection.coverage.baselineByService=Object.fromEntries(['fire','ems'].map(service=>[service,countDifficulties(baseline.byService[service])]));
 selection.coverage.serviceTotalsByDifficulty=Object.fromEntries(['fire','ems'].map(service=>[service,countDifficulties(baseline.byService[service].concat(sharedLocations))]));
 selection.coverage.serviceDeficits=Object.fromEntries(['fire','ems'].map(service=>[service,Object.fromEntries(Object.keys(TARGET).map(k=>[k,Math.max(0,TARGET[k]-selection.coverage.serviceTotalsByDifficulty[service][k])]))]));
 const roadBytes=fs.readFileSync(path.join(data.root,input.training.roadsUrl));
 const provenance={schemaVersion:1,
  cityId:city.id,
  builtAt:new Date().toISOString(),
  roadSnapshot:{url:input.training.roadsUrl,packagedFileSha256:crypto.createHash('sha256').update(roadBytes).digest('hex'),
  roadSource:input.training.roadSource||null},
  municipalitySnapshot:{sourceFileSha256:crypto.createHash('sha256').update(fs.readFileSync(boundaryFile)).digest('hex'),
  relations:boundaries.map(f=>({id:f.properties.osmId,
  name:f.properties.tags?.name,
  warning:f.properties.tags?.fixme||f.properties.tags?.note||null,
  sourceUrl:'https://www.openstreetmap.org/relation/'+f.properties.osmId}))},
  method:'source-point-and-production-snap-with-source-node-cross-street-topology',
  records:Object.fromEntries(sharedLocations.map(c=>[c.id,records[c.id]])),
  limitations:['OSM administrative boundaries are source evidence, not an official cadastral survey.','Dataset presence does not verify that a facility is currently open; source age and currentness limitations remain per record.','Cross streets require actual shared ground-level source nodes and are searched along the address street for at most 1500m in each direction. One-street exceptions are disclosed per record.','Candidate selection base strata use geographic proximity only; production routing assigns training ownership separately.']};
 const coverage={cityId:city.id,
  inputOfficial:official.length,
  inputOsm:osm.length,
  inputMajorRoad:majorRoad.length,
  inputTargeted:targeted.length,
  existing:existing.length,
  accepted:accepted.length,
  selected:sharedLocations.length,...selection.coverage,
  rejected:audit.length,
  rejectionCounts:audit.reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{}),
  oneStreetExceptions:sharedLocations.filter(c=>records[c.id].crossStreets.oneStreetException).length,isolatedStreetExceptions:sharedLocations.filter(c=>c.isolatedStreetException).length,acceptedIsolatedStreetExceptions:isolatedPoints.length};
 const directory=path.join(options.outputDir,city.id);fs.mkdirSync(directory,{recursive:true});
 const write=(name,value)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n');
 write('call-locations.json',{sharedLocations,provenance,coverage});write('call-provenance.json',provenance);write('accepted-candidates.json',{sharedLocations:accepted.map(sanitized),provenance:{...provenance,records},coverage});write('rejected-candidates.json',audit);
 if(targeted.length){const targetIds=new Set(targeted.map(c=>c.id)),previousIds=new Set(previous.map(c=>c.id)),extras=accepted.filter(c=>targetIds.has(records[c.id].sourceRecordId)&&!previousIds.has(c.id)).map(sanitized);write('targeted-accepted-candidates.json',{sharedLocations:extras,provenance:{...provenance,records:Object.fromEntries(extras.map(c=>[c.id,records[c.id]]))},coverage});}
 return coverage;
}
function parseOptions(args){
 const options={};for(let i=0;i<args.length;i+=2){if(!/^--(city|official-dir|osm-dir|targeted-file|reviewed-island-bundle-sha256|output-dir)$/.test(args[i])||!args[i+1])throw Error('Usage: --city ajax,toronto --official-dir DIR --osm-dir DIR [--targeted-file FILE ...] [--reviewed-island-bundle-sha256 SHA256] --output-dir SCRATCH_DIR');const key=args[i].slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());options[key]=key==='targetedFile'&&options[key]!==undefined?[].concat(options[key],args[i+1]):args[i+1];}return options;
}
async function main(args=process.argv.slice(2)){
 const options=parseOptions(args);
 for(const key of ['officialDir','osmDir','outputDir'])if(!options[key])throw Error('Required --'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()));
 for(const key of ['officialDir','osmDir','outputDir'])options[key]=path.resolve(options[key]);
 const data=require('./route-response-data.cjs');if(options.outputDir===data.root||options.outputDir.startsWith(data.root+path.sep))throw Error('Output must be scratch, outside the production repository');
 const cities=data.registry.filter(c=>c.id!=='peterborough'&&(!options.city||options.city.split(',').includes(c.id)));
 if(!cities.length)throw Error('No supported city matched');
 for(const city of cities){const report=await buildCity(city,options);console.log(JSON.stringify({cityId:report.cityId,accepted:report.accepted,selected:report.selected,deficits:report.deficits,rejected:report.rejected}));}
 // A filtered regeneration updates the aggregate without erasing other cities.
 const reports=data.registry.filter(c=>c.id!=='peterborough').map(c=>path.join(options.outputDir,c.id,'call-locations.json')).filter(file=>fs.existsSync(file)).map(file=>readJSON(file).coverage);
 fs.writeFileSync(path.join(options.outputDir,'coverage.json'),JSON.stringify(reports,null,2)+'\n');
}
module.exports={normalizeStreet,streetFamily,parseAddress,addressKey,isDuplicate,classifyRecognition,incidentProfiles,facilityType,sourceReviewProblem,baselineForServices,buildStreetIndex,matchStreet,validateAccess,buildTopology,findCrossStreets,selectCandidates,prepareRegeneration,loadEmergencyPolicy,emergencyRole,roadMetadata,readTargetedCandidates,isolatedIslandException,islandIsolationSlot,parseOptions,buildCity,main};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
