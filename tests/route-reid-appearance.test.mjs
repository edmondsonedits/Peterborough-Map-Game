import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createFootageFacade,frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {resolveReviewedBuildingEnvelope} from '../city-explorer/reviewed-building-envelope.js';
import {installCityMaterialDetail} from '../city-explorer/city-material-library.js';
import {addRouteLandmarkAppearances} from '../city-explorer/route-landmark-appearances.js';

const expected=['way/446339087','way/1002680974','way/1002680975','way/1002680782','way/1005415712','way/1002680800'];
const center={lat:44.3091,lon:-78.3197};
const project=(lat,lon)=>({x:(lon-center.lon)*111320*Math.cos(center.lat*Math.PI/180),z:-(lat-center.lat)*110540});
const data=JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url),'utf8'));
const ways=new Map(data.elements.filter(value=>value.type==='way').map(value=>['way/'+value.id,value]));
async function registry(){
 const module=await import('../city-explorer/route-reid-appearances.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return null;throw error;});
 assert.ok(module,'the six verified Reid profiles are available');
 return module.ROUTE_REID_APPEARANCES;
}
function displayEnvelope(profile){const source=ways.get(profile.id),ring=source.geometry.slice(0,-1).map(({lat,lon})=>project(lat,lon));return resolveReviewedBuildingEnvelope({profile,sourceId:profile.id,ring,groundHeights:ring.map(()=>100),dimensions:mappedBuildingDimensions(source.tags,profile.id),tags:source.tags,project});}
function render(profile){const source=ways.get(profile.id),ring=source.geometry.slice(0,-1).map(({lat,lon})=>project(lat,lon)),envelope=displayEnvelope(profile);return createFootageFacade({THREE,profile,ring,base:envelope.foundationTop,top:envelope.wallTop,project});}
function instances(group,name){const mesh=group.getObjectByName(name);if(!mesh)return[];const matrix=new THREE.Matrix4();return Array.from({length:mesh.count},(_,i)=>{mesh.getMatrixAt(i,matrix);const position=new THREE.Vector3(),scale=new THREE.Vector3();matrix.decompose(position,new THREE.Quaternion(),scale);return{position,scale};});}

test('Reid composition adds only six verified sources and preserves existing source geometry/default opt-out',async()=>{
 const records=await registry();assert.deepEqual(Object.keys(records).sort(),[...expected].sort());
 const original={id:'way/1002680974',frontLatLon:[{lat:1,lon:2},{lat:1,lon:3}],eaveHeight:7.2,roofRise:2.1,roof:'hip',massing:{existing:true}};
 const base={'way/1002680974':original},snapshot=structuredClone(base),result=addRouteLandmarkAppearances(base);
 assert.equal(addRouteLandmarkAppearances(base,false),base);assert.deepEqual(base,snapshot);
 assert.equal(result[original.id].eaveHeight,7.2);assert.equal(result[original.id].roofRise,2.1);assert.equal(result[original.id].roof,'hip');assert.equal(result[original.id].massing,original.massing);assert.deepEqual(result[original.id].frontLatLon,original.frontLatLon);
 for(const id of expected.filter(id=>id!==original.id)){assert.ok(result[id],`${id} included in production composition`);assert.equal(result[id].appearanceOnly,true);assert.equal(result[id].preserveMappedMassing,true);assert.equal(result[id].eaveHeight,undefined);assert.equal(result[id].massing,undefined);}
 for(const id of ['way/1002680794','way/1002681002','way/1005416166','6/20155'])assert.equal(result[id],undefined,`${id} remains unresolved/excluded`);
});

test('Reid faces follow exact current ring edges toward the street and emit finite bounded display geometry',async()=>{
 const records=await registry(),profiles=addRouteLandmarkAppearances({});
 for(const id of expected){
  const profile=profiles[id],source=ways.get(id),coords=source.geometry.slice(0,-1),ring=coords.map(({lat,lon})=>project(lat,lon));
  for(const face of [profile,...(profile.additionalFrontages||[])]){
   const indices=face.frontLatLon.map(end=>coords.findIndex(p=>p.lat===end.lat&&p.lon===end.lon));
   assert.ok(indices.every(index=>index>=0),id);assert.ok(Math.abs(indices[0]-indices[1])===1||Math.abs(indices[0]-indices[1])===coords.length-1,`${id} adjacent ring vertices`);
   const frame=frontageFrame({profile:face,ring,project});
   assert.ok((id==='way/446339087'||id==='way/1005415712')?frame.outward.x<-.9:frame.outward.x>.9,`${id} Reid-facing normal`);
  }
  const group=render(profile);assert.equal(group.userData.collision,false);
  group.traverse(node=>{if(node.isInstancedMesh)assert.ok([...node.instanceMatrix.array].every(Number.isFinite),id);if(node.geometry)assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite),id);});
  group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(group);const envelope=displayEnvelope(profile);assert.ok(bounds.min.y>=envelope.foundationTop-.01&&bounds.max.y<=envelope.wallTop+.01,`${id} details stay within the actual resolved visual wall`);
  const material=new THREE.MeshStandardMaterial({color:profile.wallColor});assert.equal(installCityMaterialDetail(material,{kind:profile.wallSurface,quality:'full'}),true,`${id} uses supported surface`);
  assert.ok(records[id].observation&&records[id].estimated&&records[id].photoIds.length);
 }
});

test('Jiffy west facade contains two service bays and one entry, without copying the south garage onto it',async()=>{
 await registry();const profile=addRouteLandmarkAppearances({})['way/446339087'],group=render(profile);
 assert.equal(profile.groundWindows.length,2);assert.ok(profile.groundWindows.every(window=>window.t<.65));
 assert.ok(profile.entryDoor.fraction>.65);assert.equal(profile.additionalFrontages,undefined);
 assert.equal(instances(group,'frontage-glass').length,3,'two garage panes plus the glazed entry');
 assert.equal(profile.signText,'JIFFY LUBE');assert.equal(profile.signBusinessName,'Jiffy Lube');
});

test('the enclosed Parkhill porch does not receive the default open posts or a guessed centered door',async()=>{
 await registry();const profile=addRouteLandmarkAppearances({})['way/1002680975'],group=render(profile);
 assert.equal(profile.porch,false);assert.equal(profile.entryDoor,null);
 assert.equal(group.getObjectByName('frontage-supported-depth-details'),undefined);
 assert.equal(group.getObjectByName('frontage-door'),undefined);
 assert.equal(instances(group,'frontage-glass').length,4,'one upper sash and three bounded porch panes');
});

test('the Dublin approach duplex has two separate pale door panels and no third generic entry',async()=>{
 await registry();const profile=addRouteLandmarkAppearances({})['way/1002680800'],group=render(profile);
 const doors=instances(group,'frontage-#e2dac7');assert.equal(doors.length,2);assert.equal(group.getObjectByName('frontage-door'),undefined);
 assert.ok(doors.every(door=>door.scale.y>1.9&&door.scale.y<2.4));
 assert.ok(doors[0].position.distanceTo(doors[1].position)>2,'two distinct entries across the frontage');
 assert.equal(instances(group,'frontage-glass').length,3,'two upper sashes and one lower sash');
});
