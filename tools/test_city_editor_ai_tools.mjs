import assert from 'node:assert/strict';
import { createAIEditorTools } from '../city-explorer/editor/ai-editor-tools.js';
import { createCommandHistory } from '../city-explorer/editor/command-history.js';
import { createEmptySceneDocument } from '../city-explorer/editor/scene-document.js';

const roadId = '00000000-0000-4000-8000-000000000001';
const buildingId = '00000000-0000-4000-8000-000000000002';
const authoredId = '00000000-0000-4000-8000-000000000003';
const transform = { longitude: -78.32, latitude: 44.30, elevation: 0, rotation: {x:0,y:0,z:0}, scale:{x:1,y:1,z:1} };
const history = createCommandHistory({ initialDocument: { ...createEmptySceneDocument(), objects: [{ id: authoredId, assetKey:'bench', label:'My bench', visible:true, properties:{}, transform }] } });
let active = false, blocked = false, selected = null, commits = 0;
const records = [
  { id:roadId, kind:'generated', sourceType:'road', sourceId:'way/1', label:'Hunter Street', batchBinding:{}, canTransform:false, transform, properties:{ highway:'residential' } },
  { id:buildingId, kind:'generated', sourceType:'building', sourceId:'way/2', label:'Hunter building', batchBinding:{}, canTransform:true, transform, properties:{} },
];
const getRecord = id => history.current.objects.find(x=>x.id===id) ? { ...history.current.objects.find(x=>x.id===id), kind:'authored' } : records.find(x=>x.id===id);
const tools = createAIEditorTools({
  isActive:()=>active, isBlocked:()=>blocked, getDocument:()=>history.current,
  listRecords:()=>[...records,...history.current.objects.map(x=>({...x,kind:'authored'}))], getRecord,
  selectedId:()=>selected, select:id=>{selected=id;return true;},
  commit:(doc,label)=>{ commits++;return history.execute(label,doc); },
  undo:()=>history.undo(), redo:()=>history.redo(),
  camera:{ inspect:()=>({position:[1,2,3]}), run:command=>({op:command.op}) },
  metadata:()=>({version:'test'}),
});
assert.equal(tools.run({op:'help'}).ok,true);
assert.equal(tools.run({op:'status'}).data.active,false);
assert.equal(tools.run({op:'list'}).error.code,'EDITOR_INACTIVE');
active=true;
const list=tools.run({op:'list',query:'hunter',limit:1});
assert.equal(list.data.total,2);assert.equal(list.data.items.length,1);assert.equal(list.data.nextOffset,1);
assert.equal(tools.run({op:'list',type:'road'}).data.items[0].id,roadId);
assert.equal(tools.run({op:'list',query:'way/2'}).data.total,1);
assert.equal(tools.run({op:'list',near:{latitude:44.30,longitude:-78.32,radius:10}}).data.total,3);
assert.equal(tools.run({op:'list',limit:Infinity}).ok,false);
assert.equal(tools.run({op:'select',id:roadId}).data.id,roadId);
const inspected=tools.run({op:'inspect'});
assert.deepEqual(inspected.data.capabilities.appearance,['color']);
assert.equal(inspected.data.capabilities.transform,false);
assert.equal(JSON.stringify(inspected).includes('batchBinding'),false);
assert.equal(tools.run({op:'edit',changes:[{id:roadId,transform:{elevation:1}}]}).error.code,'UNSUPPORTED');
assert.equal(tools.run({op:'edit',changes:[{id:roadId,appearance:{opacity:0.5}}]}).error.code,'UNSUPPORTED');
assert.equal(tools.run({op:'edit',changes:[{id:roadId,appearance:{color:'red'}}]}).ok,false);
assert.equal(tools.run({op:'edit',changes:[{id:roadId,appearance:{color:'#556677'}},{id:'missing',visible:false}]}).ok,false);
assert.equal(commits,0,'batch failure must not write');
const revision=tools.run({op:'status'}).revision;
const edited=tools.run({op:'edit',expectedRevision:revision,changes:[{id:roadId,appearance:{color:'#556677'}},{id:authoredId,appearance:{color:'#aabbcc',opacity:0.8},transform:{elevation:2}}]});
assert.equal(edited.ok,true,JSON.stringify(edited));assert.equal(commits,1);
assert.equal(history.current.overrides[0].appearance.color,'#556677');
assert.equal(history.current.objects[0].properties.editorAppearance.opacity,0.8);
assert.equal(history.current.objects[0].transform.elevation,2);
assert.equal(tools.run({op:'edit',expectedRevision:revision,changes:[{id:roadId,visible:false}]}).error.code,'STALE_REVISION');
assert.equal(tools.run({op:'undo'}).ok,true);assert.deepEqual(history.current.overrides,[]);
assert.equal(history.current.objects[0].transform.elevation,0,'one undo reverses whole batch');
assert.equal(tools.run({op:'redo'}).ok,true);
assert.equal(tools.run({op:'edit',changes:[{id:authoredId,transform:{scale:{x:0}}}]}).ok,false);
assert.equal(tools.run({op:'edit',changes:[{id:authoredId,transform:{rotation:{x:Infinity}}}]}).ok,false);
assert.equal(tools.run({op:'edit',changes:[{id:authoredId,foo:1}]}).ok,false);
for(const bad of [null,false,0,'']) {
  const before=JSON.stringify(history.current);
  assert.equal(tools.run({op:'edit',changes:[{id:roadId,appearance:{color:'#112233'}},{id:authoredId,transform:bad,visible:false}]}).ok,false,'malformed supplied transform must reject the whole batch');
  assert.equal(JSON.stringify(history.current),before);
}
assert.equal(tools.run({op:'edit',changes:[{id:authoredId,visible:false},{id:authoredId,visible:true}]}).ok,false);
tools.run({op:'select',id:buildingId});
const replacement=tools.run({op:'edit',changes:[{id:buildingId,transform:{elevation:3}}]});
assert.equal(replacement.ok,true,JSON.stringify(replacement));
assert.equal(history.current.objects.find(x=>x.assetKey==='generated-source-clone').transform.elevation,3);
assert.equal(selected,history.current.objects.find(x=>x.assetKey==='generated-source-clone').id,'selection must follow the authored replacement');
assert.equal(tools.run({op:'edit',changes:[{id:buildingId,appearance:{color:'#ffffff'}}]}).error.code,'REPLACED_TARGET');
assert.equal(tools.run({op:'inspect',id:buildingId}).data.replacementId,history.current.objects.find(x=>x.assetKey==='generated-source-clone').id);
blocked=true;assert.equal(tools.run({op:'edit',changes:[{id:roadId,visible:false}]}).error.code,'EDITOR_BUSY');
assert.equal(tools.run({op:'view.save',name:'a'}).error.code,'EDITOR_BUSY');blocked=false;
assert.equal(tools.run({op:'context'}).data.units.rotation,'radians');
const exported=tools.run({op:'export'}).data;exported.scene.objects.length=0;
assert.ok(history.current.objects.length>0,'exports must not leak mutable state');
assert.equal(tools.run({op:'eval',code:'alert(1)'}).error.code,'UNKNOWN_COMMAND');
assert.equal(tools.run(null).ok,false);
console.log('AI editor discovery, atomic edits, capabilities, history, stale state and access gates passed.');
