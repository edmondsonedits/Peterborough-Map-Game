import { validateSceneDocument } from './scene-document.js';
import { makeGeneratedId } from './generated-registry.js';
import { createGeneratedReplacementDocument } from './city-editor-selection.js';

const copy = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const requireKeys = (value, keys) => {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) fail('INVALID_INPUT', `Expected only: ${keys.join(', ')}.`);
};
const commands = ['help','status','list','inspect','select','focus','camera','view.save','view.restore','view.list','view.delete','edit','undo','redo','context','export'];

function capabilities(record) {
  const batched = Boolean(record.batchBinding || record.instanceIndex != null || record.parts?.some(part => part.instanceIndex != null));
  return { transform: record.kind === 'authored' || record.canTransform !== false, appearance: batched ? ['color'] : ['color','opacity'], visibility: true };
}

function appearancePatch(value, supported) {
  requireKeys(value, supported);
  if (!Object.keys(value).length) fail('INVALID_INPUT','Appearance patch is empty.');
  if (value.color !== undefined && (typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color))) fail('INVALID_INPUT','color must be #RRGGBB.');
  if (value.opacity !== undefined && (typeof value.opacity !== 'number' || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1)) fail('INVALID_INPUT','opacity must be within [0, 1].');
  return { ...value };
}

function transformPatch(current, patch) {
  requireKeys(patch,['longitude','latitude','elevation','rotation','scale']);
  if (!Object.keys(patch).length) fail('INVALID_INPUT','Transform patch is empty.');
  for (const group of ['rotation','scale']) if (patch[group] !== undefined) requireKeys(patch[group],['x','y','z']);
  return { ...current, ...patch, rotation:{...current?.rotation,...patch.rotation}, scale:{...current?.scale,...patch.scale} };
}

/** Bounded, JSON-only commands. Mutations share the ordinary editor history. */
export function createAIEditorTools(adapter) {
  let revision = 0, lastDocument = JSON.stringify(adapter.getDocument());
  function currentRevision() {
    const serialized = JSON.stringify(adapter.getDocument());
    if (serialized !== lastDocument) { revision++; lastDocument = serialized; }
    return revision;
  }
  function recordAt(id) {
    const record = typeof id === 'string' && adapter.getRecord(id.toLowerCase());
    if (!record) fail('NOT_FOUND','Unknown feature ID. Search with list first.');
    return record;
  }
  function describe(record, detailed = false) {
    const document = adapter.getDocument();
    const override = document.overrides.find(item => item.id === record.id);
    const replacementId = override?.operation === 'replace'
      ? document.objects.find(item => item.properties?.sourceTargetId === record.id)?.id || null : null;
    return {
      id:record.id, label:record.label, kind:record.kind, type:record.sourceType || record.assetKey,
      sourceId:record.sourceId || null, transform:record.transform ? copy(record.transform) : null,
      visible:record.visible !== false && override?.operation !== 'hide' && override?.operation !== 'replace',
      capabilities:capabilities(record), replacementId,
      ...(detailed ? {properties:copy(record.properties || {}),override:override ? copy(override) : null,
        appearance:copy(record.properties?.editorAppearance || override?.appearance || {}), bounds:adapter.bounds?.(record) || null} : {}),
    };
  }
  function available() {
    if (!adapter.isActive()) fail('EDITOR_INACTIVE','Enter the existing authorized editor before using scene commands.');
    if (adapter.isBlocked?.()) fail('EDITOR_BUSY','Finish recovery or the current placement/transform gesture first.');
  }
  function list(command) {
    const {query = '', type, offset = 0, limit = 20, near} = command;
    if (typeof query !== 'string' || query.length > 200 || (type !== undefined && typeof type !== 'string') || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('INVALID_INPUT','Use a text query, nonnegative offset and limit 1–100.');
    if (near && (![near.latitude,near.longitude,near.radius].every(Number.isFinite) || near.radius <= 0 || near.radius > 30000)) fail('INVALID_INPUT','near requires finite latitude, longitude and radius in metres (0–30000).');
    const needle = query.toLowerCase();
    const found = [];
    for (const record of adapter.listRecords()) {
      if (type && (record.sourceType || record.assetKey) !== type) continue;
      if (needle && ![record.id,record.label,record.sourceId,record.assetKey,record.sourceType].some(value=>String(value || '').toLowerCase().includes(needle))) continue;
      let distance = null;
      if (near) {
        if (!record.transform) continue;
        const north = (record.transform.latitude - near.latitude) * 111320;
        const east = (record.transform.longitude - near.longitude) * 111320 * Math.cos(near.latitude*Math.PI/180);
        distance = Math.hypot(north,east);
        if (distance > near.radius) continue;
      }
      found.push({record,distance});
    }
    found.sort((a,b)=>near ? a.distance-b.distance || a.record.id.localeCompare(b.record.id) : String(a.record.label).localeCompare(String(b.record.label)) || a.record.id.localeCompare(b.record.id));
    return {total:found.length,offset,nextOffset:offset+limit<found.length?offset+limit:null,
      items:found.slice(offset,offset+limit).map(({record,distance})=>({...describe(record),...(near?{distanceMetres:Number(distance.toFixed(2))}:{})}))};
  }
  function edit(command) {
    if (command.expectedRevision !== undefined && (!Number.isInteger(command.expectedRevision) || command.expectedRevision !== currentRevision())) fail('STALE_REVISION','Scene changed. Read status/inspect and retry with its revision.');
    if (!Array.isArray(command.changes) || command.changes.length < 1 || command.changes.length > 50) fail('INVALID_INPUT','changes must contain 1–50 feature patches.');
    let document = copy(adapter.getDocument());
    const seen = new Set(), editedIds = [];
    for (const patch of command.changes) {
      requireKeys(patch,['id','appearance','transform','visible']);
      const record = recordAt(patch.id);
      if (seen.has(record.id)) fail('INVALID_INPUT','Use one patch per feature in a batch.');
      seen.add(record.id);
      if (Object.keys(patch).length === 1) fail('INVALID_INPUT','Feature patch is empty.');
      const currentOverride = document.overrides.find(item=>item.id===record.id);
      if (currentOverride?.operation === 'replace') fail('REPLACED_TARGET',`Edit the replacement object instead: ${describe(record,true).replacementId || 'inspect target'}.`);
      const supported = capabilities(record);
      if (patch.transform !== undefined && !supported.transform) fail('UNSUPPORTED','Connected roads, instanced assets and protected landmarks cannot be transformed.');
      const transformed = patch.transform === undefined ? null : transformPatch(record.transform, patch.transform);
      if (patch.visible !== undefined && typeof patch.visible !== 'boolean') fail('INVALID_INPUT','visible must be boolean.');
      if (patch.appearance && Object.keys(patch.appearance).some(key=>!supported.appearance.includes(key))) fail('UNSUPPORTED',`This feature supports appearance: ${supported.appearance.join(', ')}.`);
      const appearance = patch.appearance === undefined ? null : appearancePatch(patch.appearance,supported.appearance);
      if (patch.visible === false && appearance) fail('INVALID_INPUT','Hide and appearance changes must be separate edits.');
      if (record.kind === 'authored') {
        document.objects = document.objects.map(item=>item.id!==record.id?item:{...item,
          ...(patch.visible!==undefined?{visible:patch.visible}:{}),
          ...(transformed?{transform:transformed}:{}),
          ...(appearance?{properties:{...item.properties,editorAppearance:{...item.properties?.editorAppearance,...appearance}}}:{})});
      } else if (transformed) {
        if (patch.visible !== undefined) fail('INVALID_INPUT','Transform and visibility changes must be separate edits.');
        const replacementId=makeGeneratedId({sourceType:'authored-replacement',sourceId:record.id});
        document=createGeneratedReplacementDocument(document,record,transformed,replacementId);
        const inheritedAppearance={...currentOverride?.appearance,...appearance};
        if(Object.keys(inheritedAppearance).length) document.objects.find(item=>item.id===replacementId).properties.editorAppearance=inheritedAppearance;
        editedIds.push(replacementId);
      } else {
        if (currentOverride?.operation === 'hide' && patch.visible !== true && appearance) fail('UNSUPPORTED','Restore the hidden feature before changing appearance.');
        document.overrides=document.overrides.filter(item=>item.id!==record.id);
        if(patch.visible===false)document.overrides.push({id:record.id,operation:'hide'});
        else if(appearance)document.overrides.push({id:record.id,operation:'appearance',appearance:{...currentOverride?.appearance,...appearance}});
        else if(patch.visible!==true)fail('INVALID_INPUT','No supported change provided.');
      }
      editedIds.push(record.id);
    }
    const validated=validateSceneDocument(document);
    if(!validated.ok)fail('INVALID_INPUT',validated.errors.join(' '));
    const changed=adapter.commit(validated.document,`AI edit (${command.changes.length} features)`);
    const replacement=validated.document.objects.find(item=>item.properties?.sourceTargetId===adapter.selectedId());
    if(changed && replacement)adapter.select(replacement.id);
    return {changed:Boolean(changed),ids:editedIds};
  }
  function context() {
    const id=adapter.selectedId();
    return {apiVersion:1,...adapter.metadata?.(),revision:currentRevision(),
      units:{geographic:'WGS84 degrees',distance:'metres',rotation:'radians',world:'X east, Y up, Z south'},
      selected:id?describe(recordAt(id),true):null,camera:adapter.camera.inspect(),
      views:adapter.camera.run({op:'view.list'}),commands,
      notes:['Scene changes use ordinary undo and local drafts. Export and publish through the existing workflow.','Batched appearance is a colour tint, not a texture or geometry replacement.']};
  }
  function dispatch(command) {
    if(!object(command)||typeof command.op!=='string')fail('INVALID_INPUT','Expected a JSON object with an op.');
    if(!commands.includes(command.op))fail('UNKNOWN_COMMAND',`Unknown command. Use help. Supported: ${commands.join(', ')}.`);
    if(command.op==='help')return {apiVersion:1,commands,examples:[{op:'list',query:'Hunter',limit:10},{op:'inspect',id:'ID_FROM_LIST'},{op:'edit',expectedRevision:0,changes:[{id:'ID_FROM_LIST',appearance:{color:'#777777'}}]},{op:'view.save',name:'Bridge before'}],limits:{batch:50,page:100,views:20},transport:'window.PTBO_CITY_EDITOR.run(command) or Editor Tools JSON input'};
    if(command.op==='status')return {active:adapter.isActive(),blocked:Boolean(adapter.isBlocked?.()),selectedId:adapter.selectedId(),...adapter.metadata?.()};
    available();
    if(command.op==='list')return list(command);
    if(command.op==='inspect')return describe(recordAt(command.id||adapter.selectedId()),true);
    if(command.op==='select'){const record=recordAt(command.id);adapter.select(record.id);return describe(record,true);}
    if(command.op==='focus'){const record=recordAt(command.id||adapter.selectedId());adapter.focus?.(record);return describe(record);}
    if(command.op==='edit')return edit(command);
    if(command.op==='undo'||command.op==='redo')return {changed:Boolean(adapter[command.op]())};
    if(command.op==='context')return context();
    if(command.op==='export')return {scene:copy(adapter.getDocument()),context:context()};
    return adapter.camera.run(command);
  }
  return Object.freeze({run(input){
    try {
      if(typeof input==='string'){if(input.length>65536)fail('INVALID_INPUT','Command is too large.');input=JSON.parse(input);}
      const data=dispatch(input);
      return {ok:true,revision:currentRevision(),data};
    }catch(error){return {ok:false,revision:currentRevision(),error:{code:error.code||'INVALID_INPUT',message:String(error.message)}};}
  }});
}
