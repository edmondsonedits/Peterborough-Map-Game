import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FOOTAGE_PROFILES} from '../city-explorer/sherbrooke-footage-profiles.js';
import {createGardenClearance} from '../city-explorer/sherbrooke-garden-clearance.js';
import {frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {SHERBROOKE_SOURCE} from '../city-explorer/sherbrooke-source.js';
const project=(lat,lon)=>({x:(lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),y:-(lat-44.3091)*110540});
test('six source-photo crops have matching hashes and a small mobile texture budget',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../city-explorer/assets/sherbrooke-frontages/manifest.json',import.meta.url)));
 assert.equal(manifest.records.length,6);assert.ok(manifest.totalBytes<350000);assert.ok(manifest.decodedTextureBytesWithMipmaps<8*1024*1024);
 for(const r of manifest.records){const b=await readFile(new URL('../city-explorer/assets/sherbrooke-frontages/'+r.file,import.meta.url));assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256);const p=Object.values(FOOTAGE_PROFILES).find(p=>p.label===r.label);assert.equal(p.facadePhoto.sha256,r.sha256);assert.ok(r.quad.flat().every(Number.isFinite));}
});
test('revised house identities and roof forms follow ordered footage evidence',()=>{
 const ps=Object.fromEntries(Object.values(FOOTAGE_PROFILES).map(p=>[p.label,p]));
 assert.ok(ps.S03.features.includes('white-upper-balcony'));assert.ok(!ps.S05.features.includes('white-upper-balcony'));
 assert.equal(ps.S04.roof,'hip');assert.equal(ps.S08.roof,'hip');assert.equal(ps.S10.style,'house');assert.equal(ps.S10.roof,'gable');
 for(const p of Object.values(ps).filter(p=>p.frontGarden)){assert.match(p.frontageReview.sha256,/^[a-f0-9]{64}$/);assert.ok(p.frontGarden.depthMetres<=9);}
});
test('garden clearance rejects building interiors and leaves real safe setbacks',()=>{
 let usable=0;
 for(const p of Object.values(FOOTAGE_PROFILES).filter(p=>p.frontGarden)){
  const src=SHERBROOKE_SOURCE.buildings.find(b=>b.id===p.id);const ring=src.ring.map(([lon,lat])=>{const v=project(lat,lon);return {x:v.x,z:v.y};});
  const f=frontageFrame({profile:p,ring,project}),clear=createGardenClearance(project,f.midpoint);
  assert.equal(clear(NaN,0),false);assert.equal(clear(f.midpoint.x-f.outward.x*.4,f.midpoint.z-f.outward.z*.4),false);
  if(clear(f.midpoint.x+f.outward.x*2,f.midpoint.z+f.outward.z*2))usable++;
 }
 assert.ok(usable>=8,`expected at least eight safe front setbacks, got ${usable}`);
});

// The capture record stores wallTop, not roofTop: retain the roof envelope at the runtime boundary.
test('runtime passes the wall plus roof envelope to photographed gables', async()=>{
 const app=await readFile(new URL('../city-explorer/app.js',import.meta.url),'utf8');
 assert.match(app,/top:\s*captured\.top\s*\+\s*\(profile\.appearanceOnly\s*\?\s*0\s*:\s*buildingDimensions\(\{\},\s*feature\.sourceId\)\.roofHeight\)/);
});
