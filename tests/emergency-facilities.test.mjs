import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createEmergencyFacilityLayer, suppressFacilitySource } from '../city-explorer/emergency-facilities.js';

import { makeGeneratedId } from '../city-explorer/editor/generated-registry.js';
import { applyOverrides } from '../city-explorer/editor/override-runtime.js';

const entry = { id: 'test', assetUrl: 'test.glb', rootName: 'Test_Root', sourceIds: ['way/123'], origin: { lat: 1, lon: 2, yawDegrees: 90 }, footprint: [[-5,0],[5,0],[5,10],[-5,10]], maxHeight: 12 };
function fixture(loadAsync, entryOptions={}, surface=()=>({height:10})) {
  const scene = new THREE.Group();
  const records = [{id:'station',sourceType:'building',sourceId:'way/123'}, {id:'neighbor',sourceType:'building',sourceId:'way/124'}, {id:'road',sourceType:'road',sourceId:'way/123'}];
  const hidden = [], authoredObjects = new Map();
  const registry = {records:new Map(records.map(r=>[r.id,r])), appliedReplacementIds:new Set(), makeGeneratedId,
    hide:id=>hidden.push(id), restore:()=>{}, getEditableRecord:id=>records.find(r=>r.id===id)};
  const authoredRuntime = {upsert:r=>authoredObjects.set(r.id,r),remove:id=>authoredObjects.delete(id)};
  const layer = createEmergencyFacilityLayer({ THREE, scene, loader: { loadAsync }, entries: [{...entry,...entryOptions}], project: () => ({x:100,y:200}), baseSurface: surface, records: () => records, hide: id => suppressFacilitySource(registry, authoredRuntime, id) });
  return {layer,scene,hidden,registry,authoredRuntime,authoredObjects};
}
function model(name='Test_Root') { const root=new THREE.Group();root.name=name;const box=new THREE.Mesh(new THREE.BoxGeometry(10,5,10),new THREE.MeshStandardMaterial());box.position.set(0,2.5,5);root.add(box);return {scene:root}; }

test('facility geometry is loaded once, placed in metres and suppresses only its exact building', async () => {
  let loads=0; const f=fixture(async()=>{loads++;return model();});
  await Promise.all([f.layer.load(),f.layer.load()]);
  assert.equal(loads,1); assert.equal(f.scene.children.length,1);
  const root=f.scene.children[0]; assert.equal(root.position.x,100);assert.equal(root.position.z,200);assert.ok(Math.abs(root.rotation.y-Math.PI/2)<1e-9);assert.ok(root.position.y>=10);
  assert.deepEqual(f.hidden,['station']);assert.equal(f.layer.getStatus().test.status,'ready');
  f.layer.reapplyReplacements();assert.deepEqual(f.hidden,['station','station']);
});
test('missing GLB and wrong model identity preserve existing scenery', async () => {
  for(const loader of [async()=>{throw Error('missing');},async()=>model('Wrong_Root')]) {
    const f=fixture(loader);await f.layer.load();f.layer.reapplyReplacements();assert.equal(f.scene.children.length,0);assert.deepEqual(f.hidden,[]);assert.equal(f.layer.getStatus().test.status,'error');
  }
});
test('distant or oversized geometry is rejected before source suppression', async () => {
  const f=fixture(async()=>{const m=model();m.scene.children[0].position.x=500;return m;});
  await f.layer.load();assert.equal(f.scene.children.length,0);assert.deepEqual(f.hidden,[]);
});
test('late loading cannot hide a source before its replacement is ready', async () => {
  let resolve;const f=fixture(()=>new Promise(r=>{resolve=r;}));const pending=f.layer.load();f.layer.reapplyReplacements();assert.deepEqual(f.hidden,[]);
  resolve(model());await pending;assert.deepEqual(f.hidden,['station']);
});

test('ready facility takes precedence over authored replacement in either load order', async () => {
  for(const authoredFirst of [true,false]) {
    const f=fixture(async()=>model());
    const document={objects:[],overrides:[{id:'station',operation:'replace',assetKey:'test-asset'}]};
    const replace=()=>applyOverrides(document,{registry:f.registry,authoredRuntime:f.authoredRuntime});
    if(authoredFirst) replace();
    await f.layer.load();
    if(!authoredFirst) { replace(); f.layer.reapplyReplacements(); }
    assert.equal(f.authoredObjects.size,0);
    assert.equal(f.layer.getStatus().test.status,'ready');
    assert.equal(f.scene.children.length,1);
  }
});

test('failed facility preserves authored replacement as well as generated fallback', async () => {
  const f=fixture(async()=>{throw Error('missing');});
  applyOverrides({objects:[],overrides:[{id:'station',operation:'replace',assetKey:'test-asset'}]},
    {registry:f.registry,authoredRuntime:f.authoredRuntime});
  await f.layer.load();f.layer.reapplyReplacements();
  assert.equal(f.authoredObjects.size,1);
  assert.equal(f.layer.getStatus().test.status,'error');
});
test('static station foundations reach sloped terrain without moving the model datum', async () => {
  const volume={minX:-5,maxX:5,frontZ:0,rearZ:10};
  const f=fixture(async()=>model(),{foundationVolumes:[volume]},(x)=>({height:x<105?5:10}));
  await f.layer.load();
  const wrapper=f.scene.children[0],foundation=wrapper.getObjectByName('Facility_test_foundation_0');
  assert.ok(foundation);
  assert.equal(wrapper.position.y,10.06);
  wrapper.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(foundation);
  assert.ok(bounds.min.y<5);
  assert.ok(bounds.max.y<=wrapper.position.y);
  assert.equal(f.layer.getStatus().test.status,'ready');
});