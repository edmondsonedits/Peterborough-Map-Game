import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {appendFootageMassing} from '../city-explorer/footage-building-massing.js';
const project=(lat,lon)=>new THREE.Vector2(lon,-lat);
const ring=points=>points.map(([x,z])=>new THREE.Vector2(x,z));
const outer=ring([[0,0],[10,0],[10,10],[6,10],[6,6],[0,6]]);
const hole=ring([[7,2],[9,2],[9,4],[7,4]]);
const profile={massing:{defaultHeight:4,zones:[{bounds:[-10,5,0,10],height:12}]}};
const area=a=>{let n=0;for(let i=0;i<a.length;i+=9)n+=Math.abs((a[i+3]-a[i])*(a[i+8]-a[i+2])-(a[i+6]-a[i])*(a[i+5]-a[i+2]))/2;return n};
function build(p=profile,o=outer,holes=[hole]){const walls=[],roof=[];const result=appendFootageMassing({THREE,wallPositions:walls,roofPositions:roof,outer:o,holes,foundationTop:100,profile:p,project,groundHeights:o.concat(...holes).map(()=>99)});return{walls,roof,result}}
test('stepped mass follows a concave source outline and leaves its courtyard open',()=>{
 const {walls,roof,result}=build();assert.ok(result);assert.equal(result.maxHeight,12);assert.ok([...walls,...roof].every(Number.isFinite));assert.equal(walls.length%9,0);assert.ok(Math.abs(area(roof)-(76-4))<1e-6);
 for(let i=0;i<roof.length;i+=9){const x=(roof[i]+roof[i+3]+roof[i+6])/3,z=(roof[i+2]+roof[i+5]+roof[i+8])/3;assert.ok(!(x<6&&z>6));assert.ok(!(x>7&&x<9&&z>2&&z<4));assert.ok(Math.abs(roof[i+1]-(x<5?104.2:112.2))<1e-6)}
 assert.ok(walls.some((n,i)=>i%3===0&&Math.abs(n-5)<1e-6&&walls[i+1]>111),'real internal step wall exists');
 for(let i=0;i<walls.length;i+=9){const xs=[walls[i],walls[i+3],walls[i+6]],zs=[walls[i+2],walls[i+5],walls[i+8]];assert.ok(Math.max(...xs)-Math.min(...xs)<1e-6||Math.max(...zs)-Math.min(...zs)<1e-6,'no wall along a triangulation diagonal')}
});
test('sloping ground is retained on the original boundary and invalid massing leaves buffers untouched',()=>{
 const {walls}=build();assert.ok(walls.includes(99));const bad=[{massing:{defaultHeight:4,zones:[{bounds:[-10,0,0,10],height:NaN}]}},{massing:{defaultHeight:-1,zones:[]}},{}];
 for(const p of bad){const x=build(p);assert.equal(x.result,false);assert.equal(x.walls.length,0);assert.equal(x.roof.length,0)}
});
test('zone precedence supports a lower frontage in front of an existing tall compound',()=>{
 const p={massing:{defaultHeight:30,zones:[{bounds:[-5,0,0,10],height:5},{bounds:[-5,0,0,3],height:15}]}};
 const {roof}=build(p,ring([[0,0],[10,0],[10,10],[0,10]]),[]);const heights=new Set(roof.filter((_,i)=>i%3===1));assert.deepEqual([...heights].sort((a,b)=>a-b),[105.2,115.2,130.2]);assert.ok(Math.abs(area(roof)-100)<1e-6);
});

test('zones aligned with concave boundaries do not raise an exterior wall or erase an internal step',()=>{
 const o=ring([[0,0],[10,0],[10,10],[5,10],[5,6],[0,6]]),p={massing:{defaultHeight:4,zones:[{bounds:[-10,0,0,5],height:12}]}};
 const {walls}=build(p,o,[]);let stepArea=0,exteriorTop=0;
 for(let i=0;i<walls.length;i+=9){const xs=[walls[i],walls[i+3],walls[i+6]],zs=[walls[i+2],walls[i+5],walls[i+8]],ys=[walls[i+1],walls[i+4],walls[i+7]];if(xs.some(x=>Math.abs(x-5)>1e-6))continue;
  if(Math.min(...zs)>=6-1e-6)exteriorTop=Math.max(exteriorTop,...ys);
  if(Math.max(...zs)<=6+1e-6&&Math.min(...ys)>104){const a={x:zs[0],y:ys[0]},b={x:zs[1],y:ys[1]},c={x:zs[2],y:ys[2]};stepArea+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2}
 }
 assert.ok(Math.abs(exteriorTop-104.2)<1e-6,'source wall samples its interior rather than an outside height zone');assert.ok(Math.abs(stepArea-48)<1e-6,'step stops at the aligned concave corner');
});

test('real compound footprints retain projected area at their reviewed heights',async()=>{
 const {readFileSync}=await import('node:fs'),{ROUTE_BUILDING_PROFILES}=await import('../city-explorer/route-building-profiles.js');const osm=JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url),'utf8'));
 const project=(lat,lon)=>new THREE.Vector2((lon+78.3197)*79600,-(lat-44.3091)*110540);
 for(const p of ROUTE_BUILDING_PROFILES.filter(p=>p.massing)){const o=osm.elements.find(e=>`way/${e.id}`===p.id).geometry.slice(0,-1).map(p=>project(p.lat,p.lon)),walls=[],roof=[];const result=appendFootageMassing({THREE,wallPositions:walls,roofPositions:roof,outer:o,foundationTop:100,profile:p,project});assert.ok(result,p.id);assert.ok(Math.abs(area(roof)-Math.abs(THREE.ShapeUtils.area(o)))<1e-4,p.id);assert.ok([...walls,...roof].every(Number.isFinite));assert.ok(roof.every((v,i)=>i%3!==1||v<=100+result.maxHeight+.20001))}
});
