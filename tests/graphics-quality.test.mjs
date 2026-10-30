import test from 'node:test';import assert from 'node:assert/strict';
import {resolveGraphicsQuality} from '../city-explorer/graphics-quality.js';
test('balanced is the default on an average phone and leaves a bounded road budget',()=>{const p=resolveGraphicsQuality({search:'',saved:null});assert.equal(p.name,'balanced');assert.ok(p.roadRadius<=1000);assert.ok(p.pixelRatio<=1.5);assert.equal(p.shadows,false);});
test('explicit low and high override saved quality while all retain canonical roads',()=>{for(const name of ['low','balanced','high']){const p=resolveGraphicsQuality({search:'?quality='+name,saved:'low'});assert.equal(p.name,name);assert.equal(p.roadSurface,'canonical');}assert.equal(resolveGraphicsQuality({search:'?lite=1',saved:'high'}).name,'low');assert.equal(resolveGraphicsQuality({search:'',saved:'high'}).name,'high');});


test('canonical road profiles share the same physical terrain mesh',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
 const body=source.match(/function configureTerrainMeshResolution\(\) \{([\s\S]*?)\n\}/)[1];
 const configure=new Function('terrain','CITY','THREE','document','lowPowerProfile','CONNECTED_ROADS_ENABLED',body+';return CITY.terrainSegments;');
 const run=(lowPower,connected=true)=>configure({source:'ontario-lidar-2025'},{terrainSize:18000},{MathUtils:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v))}},{documentElement:{dataset:{}}},lowPower,connected);
 assert.equal(run(true),run(false),'a shared road pack cannot fit different rendered ground meshes');
 assert.ok(run(false)<=340,'canonical terrain keeps the average-phone geometry budget');
 assert.equal(run(false,false),530,'explicit legacy rollback preserves its former full terrain');
});

test('balanced smooths phone edges with bounded multisampling and pixel density',()=>{const balanced=resolveGraphicsQuality({});assert.equal(balanced.antialias,true);assert.ok(balanced.pixelRatio>=1.25&&balanced.pixelRatio<=1.5);assert.equal(resolveGraphicsQuality({search:'?quality=low'}).antialias,false);assert.equal(resolveGraphicsQuality({search:'?quality=high'}).antialias,true);});
