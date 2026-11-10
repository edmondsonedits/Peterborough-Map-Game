'use strict';

// Bounded, reproducible camera evidence. A successful run means actual scene
// frames were captured; it deliberately does not claim a visual-quality pass.
// Run against an untouched baseline and the current checkout with this same
// harness. Each plan declares whether its frozen baseline supports cab views.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const SOURCE_IDS = ['176908280','755556771','176908281','446343896','383393878','446339024','77717331','446339099','446343895','176910551','1002815290','446366842','1002815291','1002815295','1002815296','1002815324','446339087','1002680974','1002680975','1002680782','1005415712','1002680800','1006594206','1006575786','1006575766','1006594188','1006575767','1006594168','1006575755','755554888','1006243552','1006243558','1006243559','1006243553','1006243555','1006243541','1031042883','1015118634','755554027','755554019','1015118609','1015118646','1015118647','1015118648','1015118656','1015118657','1015118659','1015118660','1015118662','1015118649','1015118651'].map(id => `way/${id}`);
const WALMART_FACILITY_ID = 'reconstruction-way-176908280';
SOURCE_IDS.push('way/446339023');
// Targets are mapped frontage midpoints from map-match-register.csv. Camera
// positions are nearest points on the repository's named OSM road centerlines.
// Walmart is an explicitly approximate parking-lot viewpoint. No geographic
// camera assignment is a claim that a target is unobscured in the rendered view.
const SITES = [
  ['chemong-r014-176908280','Walmart Supercentre','way/176908280',44.32449705,-78.33384195,44.3239,-78.3347,45.7,95],
  ['chemong-r026-755556771','Starbucks','way/755556771',44.32236895,-78.33511875,44.3225759,-78.3349805,205.55,25.5],
  ['chemong-r026-176908281','Shoppers Drug Mart','way/176908281',44.32303745,-78.3357265,44.323136,-78.335533,234.57,18.9],
  ['chemong-r033-446343896','Chemong Family Dentistry','way/446343896',44.32051075,-78.33245555,44.3203399,-78.332801,55.36,33.4],
  ['chemong-r037-383393878','Pizza Pizza and Tim Hortons','way/383393878',44.3191713,-78.33214035,44.3193323,-78.3318211,234.82,31.1],
  ['chemong-r041-446339024','Garage behind Bellevue Ultramar','way/446339024',44.3189806,-78.33100535,44.3188223,-78.331316,54.54,30.4],
  ['chemong-r048-77717331','Brookdale Plaza','way/77717331',44.318856,-78.33232675,44.3191845,-78.3316755,234.82,63.5],
  ['chemong-r053-446339099','Dairy Queen','way/446339099',44.31827575,-78.3301999,44.3180748,-78.3305896,54.23,38.3],
  ['chemong-r053-446343895','Little Caesars','way/446343895',44.3177471,-78.3298896,44.3176222,-78.3301387,54.98,24.2],
  ['chemong-r055-176910551','806 Chemong storefronts','way/176910551',44.31737565,-78.329452,44.3172293,-78.3297493,55.47,28.7],
  ['chemong-r056-1002815290','Twin-dormer house','way/1002815290',44.31671525,-78.3297722,44.3168942,-78.3294205,234.58,34.4],
  ['chemong-r057-446366842','KFC','way/446366842',44.3168931,-78.3290643,44.3167731,-78.3293001,54.58,23.1],
  ['chemong-r058-1002815291','Red brick house','way/1002815291',44.3165585,-78.32944045,44.316678,-78.3292056,234.58,23],
  ['chemong-r059-1002815295','Pale gable house','way/1002815295',44.31597175,-78.32885875,44.3160895,-78.328624,234.96,22.8],
  ['chemong-r061-1002815296','Mason north corner house','way/1002815296',44.31575715,-78.3286427,44.315873,-78.3284118,234.95,22.5],
  ['chemong-r061-1002815324','Mason south corner house','way/1002815324',44.3154,-78.3284729,44.3155236,-78.3281334,243.03,30.3],
  // Reid poses use the independently checked qa-camera-table.json. These are
  // mapped street viewpoints, not reconstructed recording camera poses.
  ['reid-r074-446339087','Jiffy Lube at Edinburgh','way/446339087',44.3133562,-78.3281465,44.3133462,-78.3284428,87.3,23.6],
  ['reid-r073-1002680974','Sage house south of Parkhill','way/1002680974',44.3135218,-78.3285738,44.3135245,-78.3284523,268.2,9.7],
  ['reid-r073-1002680975','Pale enclosed-porch house','way/1002680975',44.313406,-78.3285617,44.3134098,-78.3284469,267.3,9.2],
  ['reid-r077-1002680782','Tan bungalow at Edinburgh','way/1002680782',44.3132004,-78.3285504,44.3132043,-78.3284334,267.3,9.3],
  ['reid-r078-1005415712','Raised brick house at Edinburgh','way/1005415712',44.3129814,-78.3281827,44.3129734,-78.3284179,87.3,18.8],
  ['reid-r083-1002680800','Brick gable north of McDonnel','way/1002680800',44.3119843,-78.3286115,44.311993,-78.328353,267.3,20.6],
  ['sherbrooke-r137-1006594206','Dominion frontage at Rubidge','way/1006594206',44.30057235,-78.32664635,44.3004911,-78.326638,355.8,9.1],
  ['sherbrooke-r138-1006575786','Laundromat at Rubidge','way/1006575786',44.3004277,-78.3262328,44.3005075,-78.3262398,176.4,8.9],
  ['sherbrooke-r141-1006575766','Pale sidewall southwest of Stewart','way/1006575766',44.30046225,-78.32543445,44.3005437,-78.3254416,176.4,9.1],
  ['sherbrooke-r142-1006594188','Pale gable-end house northwest of Stewart','way/1006594188',44.300632,-78.32551635,44.3005407,-78.3255083,356.4,10.2],
  ['sherbrooke-r143-1006575767','Low brick house southeast of Stewart','way/1006575767',44.3004558,-78.32505605,44.3005618,-78.3250665,176,11.8],
  ['sherbrooke-r157-1006594168','Thrive Health west of Aylmer','way/1006594168',44.3007395,-78.32369505,44.3006331,-78.3236848,356,11.9],
  ['sherbrooke-r159-1006575755','Arched brick block southwest of Aylmer','way/1006575755',44.30055025,-78.3232368,44.3006549,-78.3232469,176,11.7],
  ['sherbrooke-r190-755554888','No Frills eastern loading return','way/755554888',44.3006507,-78.31897605,44.3008214,-78.3189883,177,19],
  ['water-r228-1006243552','Lime-fronted shop row on Water','way/1006243552',44.30512025,-78.31873525,44.3051161,-78.3188765,87.7,11.3],
  ['water-r231-1006243558','Southern cream enclosed-bay building','way/1006243558',44.30520605,-78.31900745,44.3052097,-78.3188818,267.7,10],
  ['water-r231-1006243559','Northern cream enclosed-bay building','way/1006243559',44.305283,-78.31901065,44.3052866,-78.3188861,267.7,9.9],
  ['water-r232-1006243553','Six-arch brick shopfront on Water','way/1006243553',44.30523625,-78.3187452,44.3052323,-78.3188831,87.7,11],
  ['water-r235-1006243555','Scotiabank Water return','way/1006243555',44.30573775,-78.3187722,44.3057337,-78.3189114,87.7,11.1],
  ['water-r248-1006243541','Smiles to You Hunter storefront','way/1006243541',44.30593115,-78.31726555,44.3060233,-78.3172751,175.8,10.3],
  ['water-nordia-west-main','Nordia main Water face','way/1031042883',44.30497125,-78.31873015,44.3049672,-78.318868,87.7,11],
  ['water-nordia-west-short','Nordia short west corner face','way/1031042883',44.30484605,-78.31872795,44.3048422,-78.318861,87.7,10.6],
  ['water-nordia-south-short','Nordia short south corner face','way/1031042883',44.30481825,-78.31868855,44.3047338,-78.3186786,355.2,9.4],
  ['water-nordia-south-main','Nordia main Simcoe face','way/1031042883',44.30482505,-78.3184978,44.3047452,-78.3184884,355.2,8.9],
  // Bridge camera coordinates are exact road-centreline interpolation; targets
  // are approximate points across the south parapet, not surveyed lamp bases.
  ['bridge-r253-west','Hunter bridge western lamps','12/73',44.3060142,-78.31605,44.3060742,-78.31605,180,6.7],
  ['bridge-r257-middle','Hunter bridge central lamps','12/73',44.3058924,-78.3148,44.3059524,-78.3148,180,6.7],
  // New208 poses retain the historical cross-parapet/close-wall views above.
  // The bridge eye is on way177049271, aimed toward the second south lamp.
  ['bridge-r253-east-looking','Hunter bridge lamps looking east','12/73',44.3060213224,-78.3157872958,44.3060673605,-78.31625,97.861166,37.208],
  ['canopy-r041-front','Ultramar southwest fascia','way/446339023',44.31894355,-78.33120465,44.31886410,-78.33135769,54.43,15.06],
  ['canopy-r049-southeast','Ultramar southeast return','way/446339023',44.31894795,-78.33111770,44.3188522928,-78.3310227634,324.42755,13],
  ['canopy-underpass','Ultramar central underpass','way/446339023',44.319002355,-78.33108951,44.318959025,-78.33117435,54.674017,8.283],
  ['east-r262-1015118634-f0','Kawartha building on Hunter Street East','way/1015118634',44.30603935,-78.31242715,44.305813456667735,-78.31231559726204,340.537,26.67],
  ['east-r265-755554027-f0','Tan building on Driscoll Terrace','way/755554027',44.3063443,-78.3113836,44.30627139964086,-78.31169717116182,72.002,26.26],
  ['east-r265-755554027-f1','Tan building on Driscoll Terrace return','way/755554027',44.3065283,-78.31152635,44.306467757408086,-78.31178633039072,71.974,21.78],
  ['east-r264-755554019-f0','Circle K on Hunter Street East','way/755554019',44.3058769,-78.3113994,44.306006216094104,-78.31145848474303,161.894,15.15],
  ['east-r270-1015118609-f0','Pale house at Cricket and Driscoll','way/1015118609',44.306903,-78.31179535,44.30702202826866,-78.3118482722131,162.35,13.9],
  ['east-r270-1015118609-f1','Pale house at Cricket and Driscoll return','way/1015118609',44.30684205,-78.3118557,44.30682198768867,-78.31194823962772,73.146,7.7],
  ['east-r270-1015118609-street-angle-f1','Driscoll corner return from farther along street','way/1015118609',44.30684205,-78.3118557,44.30695376,-78.312004025,136.263772,17.09053],
  ['east-r273-1015118646-f0','Red side wall at Cricket and Driscoll','way/1015118646',44.30711015,-78.31191765,44.30701578472078,-78.31187569341715,342.35,11.02],
  ['east-r275-1015118647-f0','Red house with white gable, north Cricket','way/1015118647',44.30723845,-78.31156955,44.307099552071385,-78.31150779336134,342.35,16.23],
  ['east-r276-1015118648-f0','Red hip-roof house, north Cricket','way/1015118648',44.30728195,-78.31147725,44.30712263485252,-78.31140641548077,342.35,18.61],
  ['east-r274-1015118656-f0','Taupe hip-roof house, south Cricket','way/1015118656',44.30695275,-78.3115852,44.30707005217125,-78.31163735475764,162.35,13.7],
  ['east-r274-1015118657-f0','Pale shuttered house porch, south Cricket','way/1015118657',44.30699485,-78.3114466,44.30710257920012,-78.31149449843413,162.35,12.58],
  ['east-r296-1015118659-f0','Upper-balcony house, south Cricket','way/1015118659',44.30702105,-78.31129415,44.3071365081718,-78.3113454848807,162.35,13.49],
  ['east-r277-1015118660-f0','Green-trimmed brick house, south Cricket','way/1015118660',44.30705225,-78.31114725,44.3071697492753,-78.31119949239381,162.35,13.73],
  ['east-r277-1015118662-f0','Pale hip-roof house east of green gable','way/1015118662',44.3070879,-78.31100235,44.30720298594464,-78.31105351938149,162.35,13.44],
  ['cricket-22-1015118649','22 Cricket Place corrected frontage','way/1015118649',44.3072964,-78.31131415,44.30715767,-78.31125256,342.362,16.21],
  ['cricket-24-1015118651','24 Cricket Place corrected frontage','way/1015118651',44.3073328,-78.3111666,44.30719152,-78.31110388,342.362,16.5],
  // These camera positions lie inside municipal lot10/1429, outside all holes.
  // Their framing remains an estimate to inspect in the resulting PNGs.
  ['walmart-ground-h1','Walmart H1 northwest tree cap','10/1429',44.32352368,-78.33443304,44.323426,-78.33448,18.98,11.5],
  ['walmart-ground-rows','Walmart southwest parking rows','10/1429',44.323815,-78.334405,44.32368,-78.33473,59.86,29.93],
  ['generic-residential','576 Stewart Street generic house','way/1005416086',44.311073914,-78.325782836,44.3110668,-78.3260183,87.57,18.8],
  ['generic-commercial','166 McDonnel Street generic commercial','way/1005415935',44.3097383,-78.321056125,44.3095889,-78.3210452,357,16.7],
  ['station-1','Station 1 control','way/1009651229',44.300893,-78.322265,44.30069675,-78.32224908,356.68,21.9],
  ['sherbrooke','Sherbrooke blue-house control','way/1006575702',44.30062,-78.32122,44.30073974,-78.32122964,176.7,13.4],
].map(([id,name,sourceId,lat,lon,eyeLat,eyeLon,bearing,distance]) => ({
  id,name,sourceIds:[sourceId],target:{lat,lon},eye:{lat:eyeLat,lon:eyeLon,bearing},distance,
  frontageIndex:/-f\d+$/.test(id)?Number(id.match(/-f(\d+)$/)[1]):undefined,
  locationBasis:id.includes('r014')?'approximate Walmart lot position':id.startsWith('walmart-ground-')||id.startsWith('canopy-')?'mapped municipal parking footprint; estimated framing':'mapped road centerline',
}));
Object.assign(SITES.find(site=>site.id==='canopy-underpass'),{cabPitch:.12,baselineEnclosed:true,
  locationBasis:'Reviewed support-frame centre lane u=.25,v=.5 inside municipal parking10/99; actual contact/visibility require runtime proof'});
SITES.find(site=>site.id==='canopy-r041-front').locationBasis='Mapped Chemong road centreline; estimated framing';
// Retain the middle-bridge oblique that actually showed lamps in204; its new
// cab pose looks east. The old western oblique was occluded by Quaker.
Object.assign(SITES.find(site=>site.id==='bridge-r253-east-looking'),{
  oblique:{lat:44.3058924,lon:-78.3148,bearing:25,altitude:12,distance:42,pitch:-.22}});
const COHORTS = ['chemong-north','chemong-south','reid-controls','sherbrooke','water-hunter','east-north','east-south'];
const PROCEDURAL_CONTROLS = ['chemong-r058-1002815291','generic-residential','generic-commercial','station-1','sherbrooke'];
const CHANGED_POSES_205 = SITES.filter(site=>/^(?:east-|cricket-)/.test(site.id) && !site.id.includes('-street-angle-')).map(site=>site.id);
const REGRESSION_POSES_205 = ['generic-residential','generic-commercial','station-1','sherbrooke','chemong-r026-176908281',
  'chemong-r014-176908280','walmart-ground-h1','walmart-ground-rows','water-r231-1006243558'];
for(const site of SITES){
  const chemongIndex=SITES.filter(item=>item.id.startsWith('chemong-')).findIndex(item=>item.id===site.id);
  const changedIndex=CHANGED_POSES_205.indexOf(site.id);
  site.cohort=site.id.startsWith('walmart-ground-')||site.id.startsWith('canopy-')?'chemong-north':chemongIndex>=0?(chemongIndex<8?'chemong-north':'chemong-south')
    :changedIndex>=0?(changedIndex<8?'east-north':'east-south'):site.id.startsWith('sherbrooke-r')?'sherbrooke':/^(?:water-|bridge-)/.test(site.id)?'water-hunter':'reid-controls';
}
function capturePlan(id=process.env.PTBO_CAPTURE_PLAN || 'full') {
  assert.ok(['full','route-205','review-206','review-208'].includes(id),'Unknown capture plan');
  if(id==='review-208')return {id,cohorts:{
    'canopy-ground':['canopy-r041-front','canopy-r049-southeast','canopy-underpass','generic-commercial'],
    'sherbrooke-envelope':['sherbrooke-r141-1006575766','sherbrooke-r142-1006594188','sherbrooke-r143-1006575767','sherbrooke-r157-1006594168','sherbrooke-r159-1006575755'],
    'water-bridge':['water-r231-1006243558','water-r231-1006243559','bridge-r253-east-looking','east-r270-1015118609-street-angle-f1'],
    'east-envelope':['east-r264-755554019-f0','east-r273-1015118646-f0','east-r276-1015118648-f0','east-r265-755554027-f0','east-r265-755554027-f1']},
    views:['oblique','cab'],baselineRevision:'496849126466f24e8e832f95e3878910524d3e45',baselineCab:true,materialControls:'before-after',
    driveSmoke:{cohort:'canopy-ground',siteId:'canopy-underpass',minimumDistance:12,surfaceId:'10/99'},
    reviewedFeatures:{lettering:[{sourceId:'way/1006594168',frontageIndex:0,name:'Thrive Health',texts:['THRIVE','HEALTH','PTBO']}],
      markers:[{sourceId:'way/1006243558',id:'osm:node/7854664939',bottom:2.55,top:2.95},{sourceId:'way/1006243559',id:'osm:node/7854664940',bottom:2.60,top:3.00}]},
    materialReference:{revision:'496849126466f24e8e832f95e3878910524d3e45',version:'1.6.207',runId:42865124695,
      url:'https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42865124695',
      status:'Targeted scene comparison against exact207. Material implementation/source hashes are recorded; no new same-head procedural A/B is claimed.'}};
  if(id==='review-206')return {id,cohorts:{
    'signs-north':['chemong-r014-176908280','chemong-r026-755556771','chemong-r057-446366842','chemong-r053-446343895'],
    'frontage-controls':['east-r264-755554019-f0','sherbrooke','generic-commercial','station-1'],
    'masonry-reid':['chemong-r058-1002815291','reid-r083-1002680800','reid-r077-1002680782','reid-r078-1005415712']},
    views:['oblique','cab'],baselineRevision:'1311f758366b1031b10a287cdf473a27b8bfd678',baselineCab:true,materialControls:'before-after',
    photoExpectation:{sourceId:'way/1006575702',assetPath:'/assets/sherbrooke-frontages/s10.jpg',currentBalanced:'loaded',currentLite:'omitted-optional-group',baseline:'record-only'},
    materialReference:{revision:'1311f758366b1031b10a287cdf473a27b8bfd678',version:'1.6.205',runId:42859272929,
      url:'https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42859272929',
      status:'Changed reviewed-brick shader is evaluated with matched before/current scene frames; no same-head procedural A/B or unchanged-shader claim.'}};
  if(id==='route-205')return {id,cohorts:{'east-north':CHANGED_POSES_205.slice(0,8),'east-south':CHANGED_POSES_205.slice(8),regression:REGRESSION_POSES_205},
    views:['eye','oblique','cab'],baselineRevision:'f7d96109db18058c425a767976899a5f34a5f55c',baselineCab:true,materialControls:'prior-revision',
    materialReference:{revision:'f7d96109db18058c425a767976899a5f34a5f55c',version:'1.6.204',runId:42855146899,
      url:'https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42855146899',
      status:'Separate prior-revision artifact review required; no fresh procedural A/B is claimed by this run.'}};
  return {id,cohorts:Object.fromEntries(COHORTS.map(cohort=>[cohort,SITES.filter(site=>site.cohort===cohort).map(site=>site.id)])),views:['eye','oblique','cab'],baselineCab:false,materialControls:'fresh'};
}
const planSiteIds=plan=>Object.values(plan.cohorts).flat();

const json = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value,null,2)}\n`);
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const percentile = (values, fraction) => [...values].sort((a,b) => a-b)[Math.floor((values.length-1)*fraction)] ?? null;
const root = path.resolve(process.env.PTBO_QA_ARTIFACT_DIR || 'artifacts/visual-refresh');
const criticalError = /\b(?:uncaught|typeerror|referenceerror|syntaxerror|rangeerror|webgl|shader|context\s*lost|failed to load module)\b/i;

function validateConfiguration(sourceRoot=process.cwd()) {
  const catalog=JSON.parse(fs.readFileSync(path.join(sourceRoot,'city-explorer/assets/building-reconstruction/batch-001/catalog.json'),'utf8'));
  const walmart=catalog.entries.find(entry=>entry.sourceIds?.includes('way/176908280'));
  assert.equal(walmart?.id,WALMART_FACILITY_ID,'Walmart readiness must use the runtime catalog ID, not the GLB/layout filename');
  assert.equal(new Set(SITES.map(site=>site.id)).size,SITES.length,'Duplicate camera IDs');
  const covered=new Set(SITES.flatMap(site=>site.sourceIds));
  assert.ok(SOURCE_IDS.every(id=>covered.has(id)),'Every enabled route source needs a dedicated camera');
  const registryIds=[];
  for(const name of ['landmark','corner','street','reid','sherbrooke','water','east-city']){
    const file=path.join(sourceRoot,`city-explorer/route-${name}-appearances.js`);
    if(fs.existsSync(file))for(const match of fs.readFileSync(file,'utf8').matchAll(/^  ['"](way\/\d+)['"]:\s*\{/gm))registryIds.push(match[1]);
  }
  assert.ok(registryIds.every(id=>SOURCE_IDS.includes(id) && covered.has(id)),'An active route registry record lacks required camera coverage');
  for(const site of SITES)assert.ok([site.target.lat,site.target.lon,site.eye.lat,site.eye.lon,site.eye.bearing,site.distance].every(Number.isFinite),`Invalid camera: ${site.id}`);
  assert.equal(COHORTS.flatMap(cohort=>SITES.filter(site=>site.cohort===cohort)).length,SITES.length,'Every site must have exactly one capture cohort');
  assert.ok(PROCEDURAL_CONTROLS.every(id=>SITES.some(site=>site.id===id)),'Missing procedural control');
  assert.equal(CHANGED_POSES_205.length,16,'205 requires14 supplied East City faces plus two corrected Cricket poses');
  for(const id of ['full','route-205','review-206','review-208']){
    const plan=capturePlan(id),ids=planSiteIds(plan);assert.equal(new Set(ids).size,ids.length,`${id}: duplicate plan poses`);
    assert.ok(ids.every(key=>SITES.some(site=>site.id===key)),`${id}: unknown plan pose`);
    assert.ok(plan.views.includes('cab') && plan.views.every(kind=>['eye','oblique','cab'].includes(kind)),`${id}: invalid view plan`);
  }
  const plan=capturePlan();
  return {sites:SITES.length,routeSources:SOURCE_IDS.length,registrySources:new Set(registryIds).size,walmartRuntimeId:walmart.id,
    plan:plan.id,selectedSites:planSiteIds(plan).length,cohorts:Object.fromEntries(Object.entries(plan.cohorts).map(([name,ids])=>[name,ids.length]))};
}

function materialComparisonProof(plan) {
  const files=['city-explorer/station2-neighborhood-facades.mjs','city-explorer/city-material-library.js','city-explorer/vertical-slice-quality.js',
    'city-explorer/assets/shared-wall-materials/manifest.json','city-explorer/assets/shared-wall-materials/Bricks101_1K-JPG_Color.jpg',
    'city-explorer/assets/shared-wall-materials/Concrete034_1K-JPG_Color.jpg'];
  const normalized=(file,data)=>/\.(?:mjs|js)$/.test(file)?data.toString('utf8').replace(/\?v=\d+\.\d+\.\d+/g,'?v=BUILD'):data;
  const proof=files.map(file=>{
    const before=execFileSync('git',['show',`${plan.baselineRevision}:${file}`],{maxBuffer:8*1024*1024});
    const current=fs.readFileSync(path.join(process.cwd(),file));
    const beforeHash=sha256(normalized(file,before)),currentHash=sha256(normalized(file,current));
    return {file,beforeSha256:beforeHash,currentSha256:currentHash,unchanged:beforeHash===currentHash,
      normalization:/\.(?:mjs|js)$/.test(file)?'Version query strings only':'None'};
  });
  if(plan.materialControls==='prior-revision')assert.ok(proof.every(item=>item.unchanged),'Shared wall source/shader changed: prior-revision material A/B cannot be reused');
  return {...plan.materialReference,mode:plan.materialControls,files:proof,scope:'Material implementation/source hashes, not a claim that scene visibility or draw cost is unchanged.'};
}

function sourceIdentity(sourceRoot) {
  validateConfiguration(sourceRoot);
  const revision = process.env.PTBO_QA_REVISION || execFileSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const files = fs.readdirSync(path.join(sourceRoot,'city-explorer')).filter(name => /\.(?:js|mjs|html|css)$/.test(name)).map(name => `city-explorer/${name}`);
  for (const name of ['manifest.json','editor/peterborough-details.json']) files.push(`city-explorer/data/${name}`);
  for(const file of ['city-explorer/data/road-pack/manifest.json','city-explorer/multiplayer/world-data/v1/world-manifest.json']){
    if(fs.existsSync(path.join(sourceRoot,file)))files.push(file);
  }
  const materials = path.join(sourceRoot,'city-explorer/assets/shared-wall-materials');
  if (fs.existsSync(materials)) for (const name of fs.readdirSync(materials)) {
    if (fs.statSync(path.join(materials,name)).isFile()) files.push(`city-explorer/assets/shared-wall-materials/${name}`);
  }
  const sources = files.sort().map(file => ({file,sha256:sha256(fs.readFileSync(path.join(sourceRoot,file)))}));
  return {revision,sourceHash:sha256(JSON.stringify(sources)),sources,scope:'Top-level runtime modules, HTML/CSS, data/road-pack/world manifests, published editor data, and shared-wall source assets; immutable checkout SHA identifies other assets.'};
}

function flyView(site, kind) {
  if (kind === 'eye') return {...site.eye,bearing:(site.eye.bearing+180)%360,altitude:2.5,distance:.01,pitch:.015};
  if(site.oblique)return {...site.oblique};
  return {...site.target,bearing:(site.eye.bearing+180+25)%360,altitude:Math.max(12,site.distance*.32),distance:Math.max(42,site.distance*1.15),pitch:-.22};
}

// Count real WebGL draw invocations without changing arguments, shaders or scene
// state. The overhead is identical for every variant; frame timings are rAF wall
// intervals and are never labelled GPU execution time or hardware benchmarks.
function installRenderProbe() {
  const state = {draws:0,contexts:0};
  let activeContext = null;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type,...args) {
    const context = Reflect.apply(originalGetContext,this,[type,...args]);
    if (context && /^(?:webgl2?|experimental-webgl)$/.test(type)) {
      if (activeContext !== context) state.contexts++;
      activeContext = context;
    }
    return context;
  };
  for (const proto of [globalThis.WebGLRenderingContext?.prototype,globalThis.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    for (const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
      if (!Object.hasOwn(proto,name) || typeof proto[name] !== 'function') continue;
      const original = proto[name];
      proto[name] = function(...args) { state.draws++; return Reflect.apply(original,this,args); };
    }
  }
  globalThis.__PTBO_VISUAL_RENDER_PROBE__ = () => {
    const gl = activeContext;
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {...state,contextLost:gl?.isContextLost() ?? true,version:gl?.getParameter(gl.VERSION) ?? null,
      gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
      drawingBuffer:gl?[gl.drawingBufferWidth,gl.drawingBufferHeight]:null};
  };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const data = document.documentElement.dataset;
    const qa = globalThis.__PTBO_CITY_QA__;
    const gameplay = globalThis.__PTBO_GAMEPLAY__?.state();
    const input = qa?.input();
    const metrics = qa?.metrics();
    const map = globalThis.__PTBO_MAP_VIEW__?.state();
    return {build:{shared:globalThis.PTBO_BUILD?.version,explorer:globalThis.PTBO_CITY_EXPLORER_BUILD?.version},
      input,metrics,gameplay,probe:globalThis.__PTBO_VISUAL_RENDER_PROBE__?.(),
      camera:metrics?.renderState?.camera ?? {position:input?.position,yaw:input?.yaw,pitch:input?.pitch,
        fov:gameplay?.camera?.fov,near:gameplay?.camera?.near,agl:map?.altitudeAGL,measurement:'public input/gameplay/map state'},
      readiness:{fullCityReady:data.cityFullReady==='true',loadingHidden:document.querySelector('#loading-screen')?.classList.contains('is-hidden')===true,
        graphicsQuality:data.graphicsQuality,stationOneModel:data.stationOneModel,roadTiles:JSON.parse(data.roadTiles || 'null'),
        roadStreaming:data.roadStreaming,lod:data.cityDetailLod,readyMs:Number(data.cityFullReadyMs)},
      viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},userAgent:navigator.userAgent};
  });
}

async function prefetch(page, position) {
  await page.evaluate(async ({lat,lon}) => {
    const point = globalThis.__PTBO_MAP_VIEW__.project(lat,lon);
    const prefetcher = globalThis.__PTBO_MULTIPLAYER_WORLD_SOURCE__;
    if (!prefetcher?.prefetch) throw new Error('Existing QA road prefetch API missing');
    prefetcher.beginProbe();
    try {
      const result = await prefetcher.prefetch(point.x,point.z);
      if (!result.ready) throw new Error('Required road tiles did not become ready');
    } finally { prefetcher.endProbe(); }
  },position);
}

async function settle(page) {
  await page.waitForFunction(() => {
    const data = document.documentElement.dataset;
    const metrics = globalThis.__PTBO_CITY_QA__?.metrics();
    const roads = JSON.parse(data.roadTiles || 'null');
    return data.cityFullReady==='true' && document.querySelector('#loading-screen')?.classList.contains('is-hidden')
      && metrics?.drawCalls>0 && metrics?.triangles>0 && globalThis.__PTBO_VISUAL_RENDER_PROBE__?.().draws>0
      && (!roads || (roads.pendingCount===0 && roads.failures===0))
      && metrics?.renderState?.roadReady !== false;
  },null,{timeout:120000});
  await page.evaluate(() => new Promise(resolve => {
    let count=0; const frame=()=>{if(++count>=6)resolve();else requestAnimationFrame(frame);}; requestAnimationFrame(frame);
  }));
}

async function sampleFrames(page) {
  return page.evaluate(() => new Promise((resolve,reject) => {
    const started=performance.now(),drawsBefore=globalThis.__PTBO_VISUAL_RENDER_PROBE__().draws;
    const intervals=[];let previous=0;
    const timeout=setTimeout(()=>reject(new Error('Timed out sampling actual rendered frames')),120000);
    const frame=now=>{
      if(previous)intervals.push(now-previous);previous=now;
      if(intervals.length>=12 && now-started>=1000){
        clearTimeout(timeout);resolve({intervals,drawsBefore,drawsAfter:globalThis.__PTBO_VISUAL_RENDER_PROBE__().draws,durationMs:now-started});
      }else requestAnimationFrame(frame);
    };requestAnimationFrame(frame);
  }));
}

async function waitForWalmartGround(page) {
  await page.waitForFunction(()=>{
    const ground=globalThis.__PTBO_CITY_QA__.metrics().routeGround;
    return ground?.paint?.ready && ground.paint.vertices>0 && ground.paint.rows.length===2
      && ground.paint.rows.every(row=>row.sourceId==='10/1429' && row.status==='ready' && row.emittedLines===15 && !row.retryable)
      && ground.tree?.status==='ready';
  },null,{timeout:120000});
  return page.evaluate(()=>globalThis.__PTBO_CITY_QA__.metrics().routeGround);
}

async function auditRenderedSigns(page,requiredSourceIds=SOURCE_IDS) {
  return page.evaluate(required=>{
    const qa=globalThis.__PTBO_CITY_QA__,footage=qa.metrics().footage;
    const normalized=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const directorySamples=qa.businessSigns(),claims=directorySamples.filter(sample=>sample.existingProfileSign);
    const renderedSigns=footage.flatMap(front=>front.renderedSigns);
    const unmatchedClaims=claims.filter(claim=>!renderedSigns.some(sign=>sign.sourceId===claim.buildingSourceId
      && sign.frontageIndex===claim.frontageIndex && Number.isInteger(sign.frontageIndex) && sign.text?.trim()
      && [sign.name,sign.text].some(value=>normalized(value)===normalized(claim.name))));
    return {claims,renderedSigns,unmatchedClaims,
      educationalMarkers:directorySamples.filter(sample=>sample.placementEvidence?.kind==='estimated-educational-marker'),
      canopyDirectorySigns:directorySamples.filter(sample=>sample.buildingSourceId==='way/446339023'),
      missingRouteFrontages:required.filter(id=>!footage.some(front=>front.sourceId===id && front.objects>0)),
      unsettledPhotos:footage.filter(front=>required.includes(front.sourceId) && [front.photoStatus,front.facadePhotoStatus].includes('loading')),
      failedPhotos:footage.filter(front=>required.includes(front.sourceId) && [front.photoStatus,front.facadePhotoStatus].includes('failed')),
      meaning:'Created signage after photo readiness, not proof that lettering is unoccluded/readable in every image.'};
  },requiredSourceIds.filter(id=>id!=='way/176908280'));
}

function verifyReviewedFeatures(report,plan,sites,label) {
  const required=new Set(sites.flatMap(site=>site.sourceIds)),expectations=plan.reviewedFeatures;
  if(!expectations)return null;
  const signs=report.signage.renderedSigns,metrics=report.final.metrics;
  const result={mode:label==='baseline'?'record-only':'assert-current',
    canopy:required.has('way/446339023')?metrics.reviewedCanopy:null,
    lettering:signs.filter(sign=>required.has(sign.sourceId) && sign.kind==='applied-lettering-group'),
    educationalMarkers:report.signage.educationalMarkers.filter(marker=>required.has(marker.buildingSourceId))};
  report.reviewedFeatures=result;
  if(label==='baseline')return result;
  if(required.has('way/446339023')){
    const canopy=result.canopy;
    assert.equal(canopy?.state,'rendered','Reviewed canopy was not emitted');
    assert.equal(canopy.sourceId,'way/446339023');assert.equal(canopy.parkingFeatureId,'10/99');
    assert.equal(canopy.triangleCount,48);assert.equal(canopy.supportCount,4);assert.equal(canopy.sampleCount,25);
    assert.equal(canopy.groundStage,'final-packed-triangles','Canopy must use verified final packed ground');
    assert.ok(typeof canopy.roadPackBuildId==='string' && canopy.roadPackBuildId.length>0,'Missing canopy pack provenance');
    assert.ok(signs.some(sign=>sign.sourceId==='way/446339023' && sign.frontageIndex===0 && sign.name==='Ultramar' && sign.text==='Ultramar'),'Canopy lacks its actual applied Ultramar sign');
    assert.ok(![...signs,...report.signage.canopyDirectorySigns].some(sign=>(sign.sourceId||sign.buildingSourceId)==='way/446339023' && /husky/i.test(`${sign.name} ${sign.text}`)),'Conflicting Husky canopy identity rendered');
  }
  for(const expected of expectations.lettering||[]){
    if(!required.has(expected.sourceId))continue;
    const record=result.lettering.find(sign=>sign.sourceId===expected.sourceId && sign.frontageIndex===expected.frontageIndex && sign.name===expected.name);
    assert.ok(record,'Declared applied-lettering group did not attach');
    assert.deepEqual(record.fragments.map(fragment=>fragment.text),expected.texts,'Applied lettering is missing a declared fragment');
    assert.equal(record.text,expected.texts.join(' '));
    assert.ok(record.fragments.every(fragment=>[fragment.fraction,fragment.heightMetres,fragment.widthMetres,fragment.panelHeightMetres,fragment.outsetMetres].every(Number.isFinite) && fragment.textFit),'Applied lettering lacks actual geometry/text-fit receipts');
  }
  for(const expected of expectations.markers||[]){
    if(!required.has(expected.sourceId))continue;
    const marker=result.educationalMarkers.find(item=>item.buildingSourceId===expected.sourceId && item.id===expected.id);
    assert.ok(marker,`Reviewed Water marker missing: ${expected.id}`);
    assert.equal(marker.placementEvidence.observedSign,false,'Educational marker must not claim observed physical signage');
    assert.equal(marker.placementEvidence.reviewedDirectoryId,expected.id);
    assert.equal(marker.placementEvidence.bandBottomMetres,expected.bottom);assert.equal(marker.placementEvidence.bandTopMetres,expected.top);
    assert.equal(marker.placementEvidence.style,'standard-directory-blue');
  }
  return result;
}

function verifyReviewedPhoto({sourceId,expected,state,imageRequests}) {
  const receipt={sourceId,expected,state:state||null,imageRequests,
    actual:state?.objects>0?'group-present':'omitted-optional-group'};
  if(expected==='record-only')return receipt;
  if(expected==='omitted-optional-group'){
    assert.ok(!state || state.objects===0,'Optional S10 group unexpectedly rendered in Lite');
    assert.equal(imageRequests.length,0,'Lite downloaded the omitted S10 photograph');
  }else{
    assert.ok(state?.objects>0,'S10 photo group is absent');
    assert.equal(state.photoStatus,expected,'S10 photo readiness status');
  }
  return receipt;
}

async function imagePixels(page, png) {
  return page.evaluate(async encoded => {
    const picture = new Image(); picture.src=`data:image/png;base64,${encoded}`; await picture.decode();
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;
    const context=canvas.getContext('2d');
    context.drawImage(picture,picture.width*.15,picture.height*.15,picture.width*.7,picture.height*.7,0,0,96,64);
    const pixels=context.getImageData(0,0,96,64).data,colors=new Set();let minimum=255,maximum=0;
    for(let i=0;i<pixels.length;i+=4){
      colors.add(`${pixels[i]>>4},${pixels[i+1]>>4},${pixels[i+2]>>4}`);
      const luminance=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
      minimum=Math.min(minimum,luminance);maximum=Math.max(maximum,luminance);
    }
    return {sampledRegion:'central 70% of screenshot',uniqueQuantizedColors:colors.size,luminanceRange:maximum-minimum};
  },png.toString('base64'));
}

async function capture(page, out, site, kind, {baselineEnclosed=false}={}) {
  await prefetch(page,site.eye);
  const request = kind==='cab'?{...site.eye,pitch:site.cabPitch??.015}:flyView(site,kind);
  const accepted = await page.evaluate(({kind,request}) => kind==='cab'
    ? globalThis.__PTBO_CITY_QA__.setDriverView(request)
    : globalThis.__PTBO_CITY_QA__.setView(request),{kind,request});
  assert.equal(accepted,true,`${site.id} ${kind}: camera request rejected`);
  await settle(page);
  if(site.sourceIds.includes('way/176908280')){
    // Full city readiness does not await the facility GLB layer. A successful
    // generic city frame is not evidence of the intended Walmart replacement.
    await page.waitForFunction(facilityId=>{
      const entry=globalThis.__PTBO_GAMEPLAY__.state().emergencyFacilities[facilityId];
      return entry && entry.status!=='loading';
    },WALMART_FACILITY_ID,{timeout:180000});
    const facility=await page.evaluate(facilityId=>({entry:globalThis.__PTBO_GAMEPLAY__.state().emergencyFacilities[facilityId],
      current:typeof globalThis.__PTBO_CITY_QA__.setDriverView==='function',quality:document.documentElement.dataset.graphicsQuality}),WALMART_FACILITY_ID);
    assert.equal(facility.entry.status,'ready',`Walmart replacement failed: ${JSON.stringify(facility.entry)}`);
    if(facility.current)assert.equal(facility.entry.decoration,'ready','Walmart essential route frontage decoration did not load');
  }
  if(site.id==='station-1')await page.waitForFunction(()=>globalThis.__PTBO_MULTIPLAYER_WORLD_SOURCE__.stationReady(1)
    || globalThis.__PTBO_GAMEPLAY__.state().emergencyFacilities.station1?.status==='ready',null,{timeout:180000});
  if(site.id.startsWith('walmart-ground-') && await page.evaluate(()=>typeof globalThis.__PTBO_CITY_QA__.setDriverView==='function'))await waitForWalmartGround(page);
  const frames = await sampleFrames(page);
  const state = await snapshot(page);
  assert.ok(frames.drawsAfter>frames.drawsBefore,'No actual WebGL draws during frame sample');
  assert.equal(state.probe.contextLost,false,'WebGL context was lost');
  assert.ok(state.metrics.drawCalls>0 && state.metrics.triangles>0,'No scene geometry rendered');
  assert.equal(state.readiness.fullCityReady,true,'Full scene did not load');
  assert.equal(state.input.mode,kind==='cab'?'driving':'fly','Wrong camera mode');
  if(kind==='cab')assert.equal(state.gameplay.camera.view,'cab','Actual gameplay cab camera not active');
  const key=`${site.id}-${kind}`;
  const png=await page.screenshot({path:path.join(out,`${key}.png`),timeout:60000});
  const pixels=await imagePixels(page,png);
  const record={key,site,kind,request,viewSemantics:kind==='cab'?'stationary gameplay cab camera':kind==='eye'
    ?`raised fly camera at ${Number(state.camera.agl).toFixed(2)} metres measured AGL (requested ${request.altitude} metres; runtime clearance applies)`:'oblique fly camera',
    state,performance:{sampleCount:frames.intervals.length,durationMs:frames.durationMs,medianFrameMs:percentile(frames.intervals,.5),
      p95FrameMs:percentile(frames.intervals,.95),p99FrameMs:percentile(frames.intervals,.99),actualWebglDraws:frames.drawsAfter-frames.drawsBefore,
      frameIntervalsMs:frames.intervals,measurement:'requestAnimationFrame wall intervals; not GPU timing or a hardware benchmark'},
    evidence:{png:`${key}.png`,pngSha256:sha256(png),bytes:png.length,pixels},visualReview:baselineEnclosed?'diagnostic-baseline-enclosed-shell':'pending',
    baselineDiagnostic:baselineEnclosed?'The unchanged baseline is a solid building shell at this underpass pose. Its wall view is expected diagnostic evidence; actual WebGL/scene readiness checks still apply.':undefined};
  json(path.join(out,`${key}.json`),record);
  if(!baselineEnclosed && !(pixels.uniqueQuantizedColors>8 && pixels.luminanceRange>10)){
    const error=new Error('Screenshot appears blank or uniform; preserved as a failed framing diagnostic');
    error.captureRecord=record;throw error;
  }
  console.log(`${key}: ${state.metrics.drawCalls} draws, ${state.metrics.triangles} triangles, ${record.performance.medianFrameMs.toFixed(1)} ms median rAF`);
  return record;
}

async function captureAttempt(page,out,site,kind,report) {
  try{report.views.push(await capture(page,out,site,kind,{baselineEnclosed:report.label==='baseline' && site.baselineEnclosed===true && kind==='cab'}));}
  catch(error){
    const key=`${site.id}-${kind}`,state=error.captureRecord?.state || await snapshot(page).catch(()=>null);
    const pngName=error.captureRecord?.evidence.png || `${key}-failure.png`;
    if(!error.captureRecord)await page.screenshot({path:path.join(out,pngName),timeout:10000}).catch(()=>{});
    const failure={key,site,kind,message:error.message,state,
      diagnosticRecord:error.captureRecord?`${key}.json`:null,
      png:fs.existsSync(path.join(out,pngName))?pngName:null,
      meaning:'Failed capture/framing evidence; not included in successful camera coverage.'};
    report.captureFailures.push(failure);json(path.join(out,`${key}-failure.json`),failure);
    console.error(`${key}: ${error.message}`);
    // A bad viewpoint must not discard later sites. A lost browser/context
    // cannot produce valid later frames, so preserve the failure and stop.
    if(page.isClosed() || state?.probe?.contextLost){json(path.join(out,'report.json'),report);throw error;}
  }
  json(path.join(out,'report.json'),report);
}

async function driveSmoke(page,out,options={}) {
  // Straight Chemong segment south of Wolsely. Only the initial placement uses
  // QA; ordinary W/S keyboard input must drive and brake the actual truck.
  const request=options.request || {lat:44.316678,lon:-78.3292056,bearing:145.4,pitch:0};
  const minimumDistance=options.minimumDistance??5,basename=options.basename || 'chemong-cab-drive';
  await prefetch(page,request);
  assert.equal(await page.evaluate(view=>globalThis.__PTBO_CITY_QA__.setDriverView(view),request),true);
  await settle(page);
  const start=await snapshot(page);
  assert.equal(start.gameplay.onRoad,true,'Cab drive start is not on rendered drivable road');
  if(options.surfaceId)assert.equal(start.metrics.reviewedCanopy?.state,'rendered','Underpass drive requires accepted canopy and packed ground first');
  await page.evaluate(()=>{
    const samples=[],started=performance.now();let running=true,previous=0;
    const sample=now=>{
      if(!running)return;
      if(now-previous>=200 && samples.length<2000){
        const state=globalThis.__PTBO_GAMEPLAY__.state(),truck=state.truck;
        samples.push({elapsedMs:now-started,x:truck.x,y:truck.y,z:truck.z,speed:truck.speed,onRoad:state.onRoad,mode:state.mode,view:state.camera.view,
          roadWheelCount:truck.lastRoadWheelCount,surface:globalThis.__PTBO_MULTIPLAYER_WORLD_SOURCE__.surface(truck.x,truck.z,truck.y)});
        previous=now;
      }
      requestAnimationFrame(sample);
    };
    globalThis.__PTBO_CAPTURE_DRIVE_TRACE__={stop(){running=false;return samples;}};
    requestAnimationFrame(sample);
  });
  await page.locator('canvas').first().focus();
  await page.keyboard.down('KeyW');
  let forward,end,samples;
  try{
    await page.waitForFunction(({pose,distance})=>{const truck=globalThis.__PTBO_GAMEPLAY__.state().truck;return truck.speed>=1 && Math.hypot(truck.x-pose.x,truck.z-pose.z)>distance;},{pose:start.gameplay.truck,distance:minimumDistance},{timeout:240000});
    forward=await snapshot(page);
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS');
    await page.waitForFunction(()=>Math.abs(globalThis.__PTBO_GAMEPLAY__.state().truck.speed)<=.04,null,{timeout:90000});
    await page.keyboard.up('KeyS');
    end=await snapshot(page);
  }finally{
    await page.keyboard.up('KeyW');await page.keyboard.up('KeyS');
    samples=await page.evaluate(()=>globalThis.__PTBO_CAPTURE_DRIVE_TRACE__.stop());
    json(path.join(out,`${basename}-trace.json`),{request,minimumDistance,expectedSurfaceId:options.surfaceId,start,forward,end,samples});
  }
  const distance=Math.hypot(forward.gameplay.truck.x-start.gameplay.truck.x,forward.gameplay.truck.z-start.gameplay.truck.z);
  assert.equal(forward.gameplay.mode,'driving');assert.equal(forward.gameplay.camera.view,'cab');assert.ok(distance>minimumDistance,`Ordinary input did not drive farther than ${minimumDistance} metres`);
  assert.ok(samples.length>=3 && samples.every(sample=>sample.mode==='driving' && sample.view==='cab' && sample.onRoad),'Drive left its actual cab or drivable road');
  if(options.surfaceId)assert.ok(samples.every(sample=>sample.surface.ready && sample.surface.onRoad && sample.surface.surfaceId===options.surfaceId && sample.roadWheelCount===4),'Underpass lost verified parking support or four-wheel road contact');
  assert.equal(end.probe.contextLost,false);assert.ok(Math.abs(end.gameplay.truck.speed)<=.04,'Brake did not stop the truck');
  const png=await page.screenshot({path:path.join(out,`${basename}.png`)});
  const result={status:'passed',request,start,forward,end,samples,distanceMetres:distance,expectedSurfaceId:options.surfaceId,pngSha256:sha256(png),
    scope:options.surfaceId?'More than twelve metres of ordinary W input and S braking through the reviewed canopy centre lane, with parking10/99 and four-wheel road contact throughout. This does not prove real pump/island clearance.':'More than five metres of ordinary W input and S braking on one straight Chemong segment. QA only places the initial truck; this is not a whole-route or physical-device test.'};
  json(path.join(out,`${basename}.json`),result);return result;
}

async function groundStreamSmoke(page,out) {
  const lot=SITES.find(site=>site.id==='walmart-ground-rows'),station=SITES.find(site=>site.id==='station-1');
  const place=async site=>{
    assert.equal(await page.evaluate(view=>globalThis.__PTBO_CITY_QA__.setDriverView(view),{...site.eye,pitch:.015}),true);
    await settle(page);
  };
  await place(lot);
  const initial=await waitForWalmartGround(page);
  await place(station);
  let evictionObserved=true;
  try{
    await page.waitForFunction(()=>{
      const paint=globalThis.__PTBO_CITY_QA__.metrics().routeGround?.paint;
      return paint && paint.vertices===0 && paint.rows.length===2 && paint.rows.every(row=>row.status==='pending' && row.emittedLines===0);
    },null,{timeout:45000});
  }catch(error){if(error.name==='TimeoutError')evictionObserved=false;else throw error;}
  const away=await snapshot(page);
  await place(lot);
  const returned=await waitForWalmartGround(page);
  const png=await page.screenshot({path:path.join(out,'walmart-ground-stream-return.png')});
  const result={status:evictionObserved?'passed':'return-ready-eviction-not-observed',evictionObserved,initial,away,returned,
    scope:'Normal streamer updates after actual truck/camera placement at Station1 and return to Walmart; no direct tile or mesh mutation.',
    limitation:evictionObserved?null:'The trip did not produce observed pending/zero-geometry diagnostics; unload/retry is unverified in this browser run.',
    pngSha256:sha256(png)};
  json(path.join(out,'walmart-ground-stream-return.json'),result);return result;
}

async function run(base,label,profile) {
  assert.ok(['balanced','lite'].includes(profile),'Profile must be balanced or lite');
  assert.match(label,/^[a-zA-Z0-9_-]+$/,'Artifact label must be a plain filename');
  const plan=capturePlan(),expectedSiteIds=planSiteIds(plan);
  const cohort=process.env.PTBO_CAPTURE_COHORT;
  if(cohort)assert.ok([...Object.keys(plan.cohorts),...(plan.materialControls==='fresh'?['procedural-controls']:[])].includes(cohort),'Unknown capture cohort for this plan');
  const selected = process.env.PTBO_CAPTURE_SITES?.split(',').filter(Boolean);
  assert.ok(!cohort || !selected,'Choose a cohort or explicit sites, not both');
  const sites = selected?SITES.filter(site=>selected.includes(site.id)):cohort==='procedural-controls'?SITES.filter(site=>PROCEDURAL_CONTROLS.includes(site.id))
    :SITES.filter(site=>(cohort?plan.cohorts[cohort]:expectedSiteIds).includes(site.id));
  assert.ok(sites.length>0,'No capture sites selected');
  if(selected)assert.equal(sites.length,new Set(selected).size,'Unknown or duplicate selected site');
  const cab = process.env.PTBO_CAPTURE_DRIVER !== '0';
  const out=path.join(root,label,profile,...(cohort?[cohort]:[]));fs.mkdirSync(out,{recursive:true});
  const identity=sourceIdentity(path.resolve(process.env.PTBO_QA_SOURCE_ROOT || '.'));
  const report={schemaVersion:3,status:'running',capturedAt:new Date().toISOString(),base,label,profile,cohort,identity,capturePlan:plan,
    viewport:{width:1280,height:800},requestedSites:sites,requiredSourceIds:SOURCE_IDS,
    coverageSemantics:'Each selected pose receives the views declared by its capture plan. Only actual gameplay cab views prove driver-seat framing; target visibility/occlusion must be inspected in the PNGs.',
    limitations:['Fly views obey the runtime minimum clearance (5 metres in the baseline), even when 2.5 metres is requested. They are raised fly views, not driver-height proof.',
      plan.baselineCab?'Before and current variants support actual cab placement; matched cab transforms are checked in the comparison.':'Baseline lacks QA truck placement, so its cab images are intentionally absent.',
      plan.materialControls==='prior-revision'?'This targeted run reuses separately identified prior-revision material A/B; it contains no new procedural-wall control captures.'
        :plan.materialControls==='before-after'?'Changed materials are compared between the stated revisions; no same-head procedural A/B or unchanged-material claim is made.':'Same-head source/procedural material controls are required.',
      'Stationary cab viewpoints face frontages; these are not a replay of the reference drive.','Browser automation is not physical-phone certification.','Timing samples are rAF wall intervals, not measured GPU execution time.'],
    errors:{page:[],console:[],failedRequests:[],http:[]},views:[],captureFailures:[]};
  json(path.join(out,'report.json'),report);
  let browser,page;
  try{
    if(label==='baseline' && plan.baselineRevision)assert.equal(identity.revision,plan.baselineRevision,'Targeted baseline must be the frozen reviewed checkpoint');
    if(plan.materialControls!=='fresh')report.materialEvidence=materialComparisonProof(plan);
    const {chromium}=require('playwright');
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),
      args:process.platform==='win32'?['--use-angle=d3d11']:[]});
    page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1});
    page.setDefaultTimeout(120000);
    const origin=new URL(base).origin;
    page.on('pageerror',error=>report.errors.page.push(error.message));
    page.on('console',message=>{if(message.type()==='error')report.errors.console.push(message.text());});
    page.on('requestfailed',request=>report.errors.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
    page.on('response',response=>{if(response.status()>=400 && new URL(response.url()).origin===origin && !response.url().endsWith('/favicon.ico'))report.errors.http.push({url:response.url(),status:response.status()});});
    await page.addInitScript(installRenderProbe);
    const url=new URL(`${base.replace(/\/$/,'')}/city-explorer/`);
    url.search=new URLSearchParams({qa:'1',qaMultiplayerWorld:'1',progressive:'0',quality:profile,analytics:'off',revision:identity.revision});
    const extras=new URLSearchParams(process.env.PTBO_CAPTURE_QUERY || '');
    for(const [key,value]of extras){assert.ok(!['quality','qa','qaMultiplayerWorld','progressive'].includes(key),'Capture query may not override readiness/profile settings');url.searchParams.set(key,value);}
    report.url=url.href;
    await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>document.documentElement.dataset.cityFullReady==='true' && globalThis.__PTBO_CITY_QA__?.setView && globalThis.__PTBO_GAMEPLAY__?.state,null,{timeout:300000});
    if(cab){
      report.wallMaterials=await page.evaluate(()=>globalThis.__PTBO_CITY_QA__.materialsReady());
      const expected=profile==='lite' || extras.get('wallMaterials')==='procedural'?'procedural':'source';
      report.wallMaterialExpectation={requested:extras.get('wallMaterials') || 'source',effective:expected,
        reason:profile==='lite'?'Lite disables optional scenery; shared photographic wall assets must remain unused.':'Requested shared-wall mode.'};
      assert.equal(report.wallMaterials.ready,true,'Shared wall materials did not settle');
      assert.equal(report.wallMaterials.sources.length,2,'Both shared wall source families must report readiness');
      assert.ok(report.wallMaterials.sources.every(source=>source.status===expected),`Expected ${expected} wall materials: ${JSON.stringify(report.wallMaterials)}`);
    }
    await settle(page);
    if(cab)assert.equal(await page.evaluate(()=>typeof globalThis.__PTBO_CITY_QA__.setDriverView),'function','Current checkout must expose the actual driver-camera QA hook');
    await page.addStyleTag({content:'#app > :not(canvas):not(#cab-view-frame), #ptbo-build-badge {visibility:hidden!important}'});
    report.initial=await snapshot(page);
    assert.equal(report.initial.readiness.graphicsQuality,profile,'Requested graphics profile was not applied');
    // Keep all fly captures before cab views: older setView intentionally retains
    // the current FOV, and the gameplay cab has a different 68-degree FOV.
    for(const site of sites)for(const kind of plan.views.filter(kind=>kind!=='cab')){
      await captureAttempt(page,out,site,kind,report);
    }
    if(cab && plan.views.includes('cab'))for(const site of sites)await captureAttempt(page,out,site,'cab',report);
    assert.equal(report.captureFailures.length,0,`Capture/framing failures (later sites preserved): ${report.captureFailures.map(failure=>failure.key).join(', ')}`);
    if(process.env.PTBO_CAPTURE_DRIVE_SMOKE==='1')report.driveSmoke=await driveSmoke(page,out);
    if(label==='current' && plan.driveSmoke && sites.some(site=>site.id===plan.driveSmoke.siteId)){
      const site=SITES.find(site=>site.id===plan.driveSmoke.siteId);
      report.canopyDriveSmoke=await driveSmoke(page,out,{...plan.driveSmoke,request:{...site.eye,pitch:site.cabPitch??.015},basename:'canopy-cab-drive'});
    }
    if(process.env.PTBO_CAPTURE_GROUND_STREAM==='1')report.groundStreamSmoke=await groundStreamSmoke(page,out);
    report.final=await snapshot(page);
    if(plan.photoExpectation && sites.some(site=>site.sourceIds.includes(plan.photoExpectation.sourceId))){
      const state=report.final.metrics.footage.find(front=>front.sourceId===plan.photoExpectation.sourceId);
      const expected=label==='baseline'?'record-only':profile==='balanced'?plan.photoExpectation.currentBalanced:plan.photoExpectation.currentLite;
      const imageRequests=await page.evaluate(assetPath=>performance.getEntriesByType('resource')
        .filter(entry=>entry.name.includes(assetPath)).map(entry=>({url:entry.name,transferSize:entry.transferSize})),plan.photoExpectation.assetPath);
      report.reviewedPhoto=verifyReviewedPhoto({sourceId:plan.photoExpectation.sourceId,expected,state,imageRequests});
    }
    if(cab){
      report.signage=await auditRenderedSigns(page,label==='baseline'?[]:SOURCE_IDS);
      assert.equal(report.signage.unmatchedClaims.length,0,`Directory names suppressed without matching created sign: ${JSON.stringify(report.signage.unmatchedClaims)}`);
      assert.equal(report.signage.missingRouteFrontages.length,0,`Essential route fronts absent: ${report.signage.missingRouteFrontages.join(', ')}`);
      assert.equal(report.signage.unsettledPhotos.length,0,'Route frontage photo readiness still pending');
      assert.equal(report.signage.failedPhotos.length,0,'Route frontage photo failed to load');
      verifyReviewedFeatures(report,plan,sites,label);
    }
    report.sharedWallImageRequests=await page.evaluate(()=>performance.getEntriesByType('resource')
      .filter(entry=>entry.name.includes('/assets/shared-wall-materials/') && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(entry.name))
      .map(entry=>({url:entry.name,transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,decodedBodySize:entry.decodedBodySize})));
    if(cab)assert.equal(report.sharedWallImageRequests.length,report.wallMaterialExpectation.effective==='source'?2:0,'Unexpected shared-wall source image downloads');
    report.errors.criticalConsole=report.errors.console.filter(message=>criticalError.test(message));
    report.errors.criticalRequests=report.errors.failedRequests.filter(item=>new URL(item.url).origin===origin && item.error!=='net::ERR_ABORTED');
    assert.equal(report.errors.page.length,0,report.errors.page.join('\n'));
    assert.equal(report.errors.criticalConsole.length,0,report.errors.criticalConsole.join('\n'));
    assert.equal(report.errors.criticalRequests.length,0,JSON.stringify(report.errors.criticalRequests));
    assert.equal(report.errors.http.length,0,JSON.stringify(report.errors.http));
    const coverageKind=plan.views.find(kind=>kind!=='cab') || 'cab';
    const covered=new Set(report.views.filter(view=>view.kind===coverageKind).flatMap(view=>view.site.sourceIds));
    const planSources=[...new Set(SITES.filter(site=>expectedSiteIds.includes(site.id)).flatMap(site=>site.sourceIds))];
    report.requestedCoverage={capturedSourceIds:[...covered],missingPlanSourceIds:planSources.filter(id=>!covered.has(id)),partialSelection:Boolean(selected || cohort),
      retainedPriorEvidence:plan.id!=='full'?'Views outside this targeted plan retain their original source-revision attribution and are not claimed as fresh captures.':null};
    const required=sites.flatMap(site=>site.sourceIds);
    assert.ok(required.every(id=>covered.has(id)),`A selected source lacks its required ${coverageKind} view`);
    if(cab){const drivers=new Set(report.views.filter(view=>view.kind==='cab').flatMap(view=>view.site.sourceIds));
      assert.ok(required.every(id=>drivers.has(id)),'A selected source lacks an actual cab view');}
    report.status='captured-awaiting-visual-review';
  }catch(error){
    report.status='failed';report.failure={message:error.message,stack:error.stack};
    if(page && !report.captureFailures.length){report.failure.state=await snapshot(page).catch(()=>null);await page.screenshot({path:path.join(out,'failure.png'),timeout:10000}).catch(()=>{});}
    throw error;
  }finally{
    report.finishedAt=new Date().toISOString();json(path.join(out,'report.json'),report);await browser?.close();
  }
  console.log(JSON.stringify({status:report.status,label,profile,views:report.views.length,revision:identity.revision,out}));
}

function cameraQuaternion(camera) {
  if(camera.quaternion)return camera.quaternion;
  // Baseline exposes yaw/pitch for its YXZ Euler camera instead of quaternion.
  const sx=Math.sin(camera.pitch/2),cx=Math.cos(camera.pitch/2),sy=Math.sin(camera.yaw/2),cy=Math.cos(camera.yaw/2);
  return [sx*cy,cx*sy,-sx*sy,cx*cy];
}

function readVariant(label,profile) {
  const directory=path.join(root,label,profile);
  if(!fs.existsSync(directory))return null;
  const direct=path.join(directory,'report.json');
  const files=fs.existsSync(direct)?[direct]:fs.readdirSync(directory).map(cohort=>path.join(directory,cohort,'report.json')).filter(file=>fs.existsSync(file));
  const parts=files.map(file=>{
    const report=JSON.parse(fs.readFileSync(file,'utf8'));
    const prefix=path.relative(root,path.dirname(file)).split(path.sep).join('/');
    return {...report,views:report.views.map(view=>({...view,artifactPrefix:prefix})),
      captureFailures:(report.captureFailures||[]).map(failure=>({...failure,artifactPrefix:prefix}))};
  });
  if(!parts.length)return null;
  const identity=parts[0].identity;
  assert.ok(parts.every(part=>part.identity.revision===identity.revision && part.identity.sourceHash===identity.sourceHash),'A variant mixes different source revisions');
  assert.ok(parts.every(part=>part.capturePlan?.id===parts[0].capturePlan?.id),'A variant mixes capture plans');
  const views=parts.flatMap(part=>part.views);
  assert.equal(new Set(views.map(view=>view.key)).size,views.length,'Duplicate camera key across capture cohorts');
  return {label,profile,identity,capturePlan:parts[0].capturePlan,materialEvidence:parts[0].materialEvidence,
    parts:parts.map(part=>({cohort:part.cohort,status:part.status,viewCount:part.views.length,failure:part.failure?.message,
      failedCameraKeys:part.captureFailures.map(failure=>failure.key)})),captureFailures:parts.flatMap(part=>part.captureFailures),
    status:parts.every(part=>part.status==='captured-awaiting-visual-review')?'captured-awaiting-visual-review':'incomplete-or-failed',views};
}

function compare(labels) {
  const plan=capturePlan(),expectedSiteIds=planSiteIds(plan),expectedSites=SITES.filter(site=>expectedSiteIds.includes(site.id));
  assert.equal(labels.length,plan.materialControls==='fresh'?3:2,'Provide the artifact labels required by this capture plan');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rows=[];const comparison={labels,capturePlan:plan,profiles:{},visualReview:'pending'};
  for(const profile of ['balanced','lite']){
    const reports=labels.map(label=>readVariant(label,profile));
    if(!reports.some(Boolean))continue;
    const pairs=[];
    for(const before of reports[0]?.views || []){
      const after=reports[1]?.views.find(view=>view.key===before.key);if(!after)continue;
      const beforePosition=before.state.camera.position || before.state.input.position;
      const afterPosition=after.state.camera.position || after.state.input.position;
      const positionDelta=Math.hypot(...beforePosition.map((value,index)=>value-afterPosition[index]));
      const fovDelta=Math.abs(before.state.camera.fov-after.state.camera.fov);
      const nearDelta=Math.abs(before.state.camera.near-after.state.camera.near);
      const beforeQuaternion=cameraQuaternion(before.state.camera),afterQuaternion=cameraQuaternion(after.state.camera);
      const quaternionDelta=Math.min(Math.hypot(...beforeQuaternion.map((value,index)=>value-afterQuaternion[index])),
        Math.hypot(...beforeQuaternion.map((value,index)=>value+afterQuaternion[index])));
      const viewportIdentical=JSON.stringify(before.state.viewport)===JSON.stringify(after.state.viewport);
      const requestIdentical=JSON.stringify(before.request)===JSON.stringify(after.request);
      pairs.push({key:before.key,requestIdentical,positionDeltaMetres:positionDelta,fovDeltaDegrees:fovDelta,nearDeltaMetres:nearDelta,quaternionDelta,viewportIdentical,
        measuredAglMetres:{before:before.state.camera.agl,after:after.state.camera.agl},
        camerasMatch:requestIdentical && positionDelta<.02 && fovDelta<.01 && nearDelta<.001 && quaternionDelta<.0001 && viewportIdentical,
        drawCalls:{before:before.state.metrics.drawCalls,after:after.state.metrics.drawCalls,
          changePercent:(after.state.metrics.drawCalls/before.state.metrics.drawCalls-1)*100},
        triangles:{before:before.state.metrics.triangles,after:after.state.metrics.triangles},
        medianRafMs:{before:before.performance.medianFrameMs,after:after.performance.medianFrameMs}});
    }
    const requiredStaticKeys=expectedSites.flatMap(site=>plan.views.filter(kind=>kind!=='cab'||plan.baselineCab).map(kind=>`${site.id}-${kind}`));
    const currentCabSources=new Set(reports[1]?.views.filter(view=>view.kind==='cab').flatMap(view=>view.site.sourceIds));
    comparison.profiles[profile]={variants:reports.map(report=>report?{label:report.label,status:report.status,revision:report.identity.revision,viewCount:report.views.length,parts:report.parts}:null),pairs,
      capturePlansMatch:reports.every(report=>report?.capturePlan?.id===plan.id),
      baselineRevisionMatches:!plan.baselineRevision || reports[0]?.identity.revision===plan.baselineRevision,
      missingStaticPairs:requiredStaticKeys.filter(key=>!pairs.some(pair=>pair.key===key)),
      missingCurrentCabKeys:expectedSites.map(site=>`${site.id}-cab`).filter(key=>!reports[1]?.views.some(view=>view.key===key)),
      missingCurrentCabSources:[...new Set(expectedSites.flatMap(site=>site.sourceIds))].filter(id=>!currentCabSources.has(id)),
      missingProceduralKeys:plan.materialControls==='fresh'?PROCEDURAL_CONTROLS.flatMap(id=>['eye','oblique','cab'].map(kind=>`${id}-${kind}`))
        .filter(key=>!reports[2]?.views.some(view=>view.key===key)):[],
      materialEvidence:plan.materialControls!=='fresh'?reports.map(report=>report?.materialEvidence):undefined,
      unmatchedCameras:pairs.filter(pair=>!pair.camerasMatch).map(pair=>pair.key)};
    const keys=[...new Set(reports.flatMap(report=>report?.views.map(view=>view.key)||[]))];
    rows.push(`<h2>${escape(profile)}</h2>`);
    for(const key of keys){
      const cells=reports.map((report,index)=>{
        const view=report?.views.find(item=>item.key===key);if(!view)return `<div><h3>${escape(labels[index])}</h3><p>Not captured for this variant.</p></div>`;
        const file=`${view.artifactPrefix}/${view.evidence.png}`,m=view.state.metrics;
        return `<div><h3>${escape(labels[index])} · ${escape(report.identity.revision.slice(0,8))}</h3><a href="${escape(file)}"><img loading="lazy" src="${escape(file)}" alt="${escape(key)}"></a><p>${m.drawCalls} draws · ${m.triangles} triangles · ${view.performance.medianFrameMs.toFixed(1)} ms rAF · ${m.textures} textures</p><a href="${escape(`${view.artifactPrefix}/${key}.json`)}">Camera and render receipt</a></div>`;
      });rows.push(`<section><h3>${escape(key)}</h3><p>${escape(reports.map(report=>report?.views.find(view=>view.key===key)?.viewSemantics).find(Boolean)||'')}</p><div class="row">${cells.join('')}</div></section>`);
    }
    for(const report of reports.filter(Boolean))for(const failure of report.captureFailures){
      const file=failure.png?`${failure.artifactPrefix}/${failure.png}`:null;
      rows.push(`<section><h3>Failed diagnostic · ${escape(report.label)} · ${escape(failure.key)}</h3><p>${escape(failure.message)} This frame does not count toward successful coverage.</p>${file?`<a href="${escape(file)}"><img loading="lazy" src="${escape(file)}" alt="Failed viewpoint ${escape(failure.key)}"></a>`:''}<a href="${escape(`${failure.artifactPrefix}/${failure.key}-failure.json`)}">Failure receipt</a></section>`);
    }
  }
  fs.mkdirSync(root,{recursive:true});
  const viewNames=plan.views.map(kind=>({eye:'raised-fly',oblique:'oblique',cab:'actual cab'}[kind])).join(', ');
  const scope=plan.baselineCab?`Matched before/current ${viewNames} cameras.`:'Matched raised-fly and oblique cameras; this baseline has no cab-placement API.';
  const materialScope=plan.materialControls==='fresh'?'Procedural is the same current code with wallMaterials=procedural.':
    plan.materialControls==='prior-revision'?`No new procedural A/B was captured. Material implementation/source hashes are checked against <a href="${plan.materialReference.url}">v${plan.materialReference.version} material evidence</a>; that separate evidence still requires its own artifact review. Unchanged views outside this targeted plan remain attributed to their earlier revision.`
      :`Changed materials are compared against exact v${plan.materialReference.version} before frames. The JSON records implementation/source hash differences; no same-head procedural A/B or unchanged-shader claim is made. Views outside this targeted plan remain attributed to their earlier revision.`;
  fs.writeFileSync(path.join(root,'comparison.html'),`<!doctype html><meta charset="utf-8"><title>Visual refresh capture evidence</title><style>body{font:15px system-ui;background:#12161d;color:#eef2f6;margin:24px}a{color:#a8d5ff}.row{display:grid;grid-template-columns:repeat(${labels.length},minmax(0,1fr));gap:16px}img{width:100%;display:block}section{border-top:1px solid #52606e;padding:16px 0}h3{font-size:15px}p{line-height:1.5}@media(max-width:900px){.row{grid-template-columns:1fr}}</style><h1>Visual refresh camera evidence</h1><p>Actual browser render captures, awaiting visual review. ${scope} Fly cameras obey the runtime minimum clearance and do not prove driver-seat framing. ${materialScope} Source and measured camera receipts accompany every image. rAF intervals are not GPU timings; narrow or Lite rendering is not physical-phone testing.</p>${rows.join('\n')}`);
  json(path.join(root,'comparison.json'),comparison);
  for(const [profile,result]of Object.entries(comparison.profiles)){
    assert.equal(result.missingStaticPairs.length,0,`${profile}: missing baseline/current static camera pairs`);
    assert.equal(result.missingCurrentCabKeys.length,0,`${profile}: missing actual cab camera views`);
    assert.equal(result.missingCurrentCabSources.length,0,`${profile}: missing actual cab source coverage`);
    assert.equal(result.missingProceduralKeys.length,0,`${profile}: missing matched procedural-wall controls`);
    assert.equal(result.unmatchedCameras.length,0,`${profile}: before/after cameras do not match`);
    assert.ok(result.variants.every(variant=>variant?.status==='captured-awaiting-visual-review'),`${profile}: a capture variant failed or is incomplete`);
    assert.equal(result.capturePlansMatch,true,`${profile}: evidence came from a different capture plan`);
    assert.equal(result.baselineRevisionMatches,true,`${profile}: evidence used the wrong baseline revision`);
    if(plan.materialControls==='prior-revision')assert.ok(result.materialEvidence.every(proof=>proof?.files.length===6 && proof.files.every(file=>file.unchanged)),`${profile}: reused material evidence lacks matching implementation/source hashes`);
    if(plan.materialControls==='before-after')assert.ok(result.materialEvidence.every(proof=>proof?.mode==='before-after' && proof.files.length===6),`${profile}: before/after material hash receipts are missing`);
  }
  assert.deepEqual(Object.keys(comparison.profiles).sort(),['balanced','lite'],'Both graphics profiles require render evidence');
}

if(require.main===module){
  const [first='http://127.0.0.1:4174',label='current',profile='balanced',...rest]=process.argv.slice(2);
  if(first==='--validate-config')console.log(JSON.stringify(validateConfiguration()));
  else if(first==='--describe')console.log(JSON.stringify({sites:SITES,sourceIds:SOURCE_IDS,capturePlan:capturePlan(),cohorts:COHORTS,proceduralControls:PROCEDURAL_CONTROLS,views:['eye','oblique','cab']},null,2));
  else if(first==='--compare')compare([label,profile,...rest]);
  else run(first,label,profile).catch(error=>{console.error(error);process.exitCode=1;});
}
