import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import * as facades from '../city-explorer/station2-neighborhood-facades.mjs';

// Only the browser canvas and image-fetch boundary are replaced. Texture,
// material, repeat transforms, and the wall-family selector are production code.
function canvasDocument({drawError=false}={}) {
  return {createElement(tag) {
    assert.equal(tag,'canvas');
    const operations=[];
    const ctx={operations};
    for(const method of ['fillRect','beginPath','moveTo','lineTo','stroke']) {
      ctx[method]=(...args)=>operations.push([method,...args]);
    }
    ctx.drawImage=(...args)=>{
      if(drawError)throw new Error('image cannot be drawn');
      operations.push(['drawImage',...args]);
    };
    return {width:0,height:0,getContext:()=>ctx};
  }};
}

function imageRequests() {
  const pending=[];
  class ImageLoader {
    load(url,success,progress,error){pending.push({url,success,error});}
  }
  return {THREE:{...THREE,ImageLoader},pending};
}

async function withCanvas(run,options) {
  const previous=globalThis.document;
  globalThis.document=canvasDocument(options);
  try{return await run();}
  finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}

test('explicit wall material overrides only the family choice, including concrete on a brick-coloured building',()=>{
  assert.equal(typeof facades.station2WallPatternForTags,'function');
  for(const [tag,expected] of [
    ['brick','brick'],[' BRICKS ','brick'],['plaster','render'],['render','render'],
    ['concrete','render'],['stucco','render'],['wood','siding'],['timber','siding'],
    ['stone','stone'],['sandstone','stone'],['limestone','stone'],
  ]) {
    const tags=Object.freeze({'building:material':tag,'roof:material':'tile'});
    assert.equal(facades.station2WallPatternForTags('residentialBrick','way/1',tags),`station2-wall-${expected}`);
    assert.equal(tags['roof:material'],'tile');
  }
});

test('absent, unknown, and mixed wall tags retain the original deterministic family',()=>{
  assert.equal(typeof facades.station2WallPatternForTags,'function');
  for(const key of ['residentialBrick','residentialPale','industrialMetal','industrial','residential']) {
    for(const tags of [{},{'building:material':'glass'},{'building:material':'brick;stone'},{'building:material':'toString'},{'roof:material':'brick'}]) {
      assert.equal(facades.station2WallPatternForTags(key,'way/42',tags),facades.station2WallPattern(key,'way/42'));
    }
  }
});

test('offline facade review reflects explicit plaster without moving walls or openings',()=>{
  const input={id:'way/42',wallMaterialKey:'residentialBrick',ring:[[0,0],[8,0],[8,10],[0,10]],tags:{building:'house'}};
  const baseline=facades.station2FacadeLayout(input);
  const selected=facades.station2FacadeLayout({...input,tags:{...input.tags,'building:material':'plaster'}});
  assert.ok(selected.faces.every(face=>face.wall.materialKey==='station2-wall-render'));
  assert.deepEqual(selected.faces.map(face=>face.wall.positions),baseline.faces.map(face=>face.wall.positions));
  assert.deepEqual(selected.faces.map(face=>face.quads),baseline.faces.map(face=>face.quads));
  assert.equal(input.wallMaterialKey,'residentialBrick');
});

test('procedural opt-out starts no image loads and retains four mipmapped 256-square maps',()=>withCanvas(async()=>{
  const images=imageRequests();
  const materials=facades.createStation2WallMaterials(images.THREE,{sourceMode:'procedural'});
  assert.ok(materials.ready instanceof Promise,'the factory exposes an async completion signal');
  const report=await materials.ready;
  assert.equal(report.mode,'procedural');
  assert.equal(images.pending.length,0);
  assert.equal(materials.size,4);
  assert.equal(new Set([...materials.values()].map(material=>material.map)).size,4);
  for(const material of materials.values()) {
    assert.deepEqual([material.map.image.width,material.map.image.height],[256,256]);
    assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);
    assert.equal(material.map.generateMipmaps,true);
    assert.equal(material.map.minFilter,THREE.LinearMipmapLinearFilter);
    assert.equal(material.map.wrapS,THREE.RepeatWrapping);
    assert.equal(material.map.wrapT,THREE.RepeatWrapping);
    assert.deepEqual(material.map.repeat.toArray(),[1,1]);
  }
}));

test('successful sources reuse the four textures and apply physical repeats without invalidating baked UVs',()=>withCanvas(async()=>{
  const images=imageRequests();
  const materials=facades.createStation2WallMaterials(images.THREE);
  assert.ok(materials.ready instanceof Promise,'the factory exposes an async completion signal');
  assert.equal(images.pending.length,2,'only the two colour sources are fetched');
  const original=new Map([...materials].map(([key,material])=>[key,{map:material.map,image:material.map.image,repeat:[...material.userData.station2RepeatMetres]}]));
  const sizes={'Bricks101':[1024,1024],'Concrete034':[1024,512]};
  for(const request of images.pending) {
    const id=Object.keys(sizes).find(id=>request.url.includes(id));
    assert.ok(id,`unexpected colour source ${request.url}`);
    const [width,height]=sizes[id];
    request.success({width,height,naturalWidth:width,naturalHeight:height});
  }
  const report=await materials.ready;
  assert.equal(report.mode,'source');
  assert.deepEqual(report.sources.map(source=>source.status),['source','source']);
  for(const [key,material] of materials) {
    assert.equal(material.map,original.get(key).map,'GPU texture identities stay shared');
    assert.deepEqual(material.userData.station2RepeatMetres,original.get(key).repeat,'geometry UV periods do not change after async load');
    assert.deepEqual([material.map.image.width,material.map.image.height],[256,256]);
  }
  for(const [family,metres] of [['brick',[1.8,1.8]],['render',[1.1,.55]]]) {
    const material=materials.get(`station2-wall-${family}`);
    assert.notEqual(material.map.image,original.get(`station2-wall-${family}`).image);
    assert.ok(material.map.image.getContext('2d').operations.some(operation=>operation[0]==='drawImage'&&operation.at(-2)===256&&operation.at(-1)===256));
    for(let axis=0;axis<2;axis++)assert.ok(Math.abs(material.userData.station2RepeatMetres[axis]/material.map.repeat.toArray()[axis]-metres[axis])<1e-12);
  }
  for(const family of ['siding','stone'])assert.equal(materials.get(`station2-wall-${family}`).map.image,original.get(`station2-wall-${family}`).image);
}));

test('image request failures settle readiness and preserve exact existing procedural maps and repeats',()=>withCanvas(async()=>{
  const images=imageRequests();
  const materials=facades.createStation2WallMaterials(images.THREE);
  assert.ok(materials.ready instanceof Promise,'the factory exposes an async completion signal');
  const original=new Map([...materials].map(([key,material])=>[key,{image:material.map.image,version:material.map.version}]));
  for(const request of images.pending)request.error(new Error('404 missing source'));
  const report=await materials.ready;
  assert.deepEqual(report.sources.map(source=>source.status),['fallback','fallback']);
  for(const [key,material] of materials) {
    assert.equal(material.map.image,original.get(key).image);
    assert.equal(material.map.version,original.get(key).version);
    assert.deepEqual(material.map.repeat.toArray(),[1,1]);
  }
}));

test('a single failed source does not prevent the other shared family from loading',()=>withCanvas(async()=>{
  const images=imageRequests();
  const materials=facades.createStation2WallMaterials(images.THREE);
  assert.ok(materials.ready instanceof Promise,'the factory exposes an async completion signal');
  images.pending.find(request=>request.url.includes('Bricks101')).error(new Error('brick missing'));
  images.pending.find(request=>request.url.includes('Concrete034')).success({width:1024,height:512,naturalWidth:1024,naturalHeight:512});
  const report=await materials.ready;
  assert.deepEqual(report.sources.map(source=>source.status),['fallback','source']);
  assert.deepEqual(materials.get('station2-wall-brick').map.repeat.toArray(),[1,1]);
  assert.notDeepEqual(materials.get('station2-wall-render').map.repeat.toArray(),[1,1]);
}));

test('synchronous loader and source draw errors also settle as unchanged procedural fallbacks',()=>withCanvas(async()=>{
  for(const Loader of [class{load(){throw new Error('loader unavailable');}},class{load(url,success){success({width:1024,height:1024,naturalWidth:1024,naturalHeight:1024});}}]) {
    const materials=facades.createStation2WallMaterials({...THREE,ImageLoader:Loader});
    assert.ok(materials.ready instanceof Promise,'the factory exposes an async completion signal');
    const report=await materials.ready;
    assert.deepEqual(report.sources.map(source=>source.status),['fallback','fallback']);
    for(const material of materials.values()) {
      assert.deepEqual(material.map.repeat.toArray(),[1,1]);
      assert.ok(material.map.image.getContext('2d').operations.some(operation=>operation[0]==='fillRect'));
    }
  }
},{drawError:true}));

test('the two packaged colour sources match their provenance hashes and download budget',()=>{
  const root=new URL('../city-explorer/assets/shared-wall-materials/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
  assert.equal(manifest.assets.length,2);
  let total=0;
  for(const source of manifest.assets) {
    const bytes=readFileSync(new URL(source.file,root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
    assert.equal(bytes.length,source.size_bytes);
    assert.equal(source.licence,'CC0 1.0 Universal');
    total+=bytes.length;
  }
  assert.equal(total,manifest.total_source_bytes);
  assert.ok(total<2_000_000,'only the two small source colour maps are shipped');
});
