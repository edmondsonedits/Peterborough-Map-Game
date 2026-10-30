import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createRoadMarkingContext,roadMarkingIntervals,roadCurbIntervals} from '../city-explorer/road-appearance-rules.js';
const app=fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
function run(enabled,lite=false){
 const roads=[];const profile={renderClass:'local'};
 for(let i=-20;i<20;i+=2)roads.push({a:{x:i,y:0},b:{x:i+2,y:0},aY:2,bY:2,lineId:'main',chainStart:i+20,width:8,aSourceVertex:i===-20||i===0,bSourceVertex:i===-2||i===18,profile});
 roads.push({a:{x:0,y:0},b:{x:0,y:25},aY:2,bY:2,lineId:'side',chainStart:0,width:8,aSourceVertex:true,bSourceVertex:true,profile});
 const group=new THREE.Group(),state={objectCount:0},dataset={};
 const env={roads,THREE,state,roadTileLayer:null,roadAppearanceEnabled:enabled,lowPowerProfile:lite,createRoadMarkingContext,roadMarkingIntervals,roadCurbIntervals,shouldRenderUrbanCurb:()=>true,stableHash:()=>0,roadRenderTileCoordinates:()=>({x:0,z:0}),materials:{curbConcrete:new THREE.MeshBasicMaterial()},streetscapeGroup:group,document:{documentElement:{dataset}},ROAD_RENDER_TILE_SIZE:400,appendRoadTriangle:(out,...values)=>out.push(...values)};
 const fn=app.match(/^function buildUrbanCurbs\([^]*?^\}/m)[0];
 Function(...Object.keys(env),fn+';buildUrbanCurbs(roads);')(...Object.values(env));
 return group;
}
for(const lite of [false,true])test(`generated curbs leave connected T opening clear (${lite?'lite':'full'})`,()=>{
 const group=run(true,lite);assert.ok(group.children.length);
 const points=group.children.flatMap(mesh=>Array.from(mesh.geometry.attributes.position.array));
 for(let i=0;i<points.length;i+=3)assert.ok(!(Math.abs(points[i])<6&&points[i+2]>0&&points[i+2]<6),'branch-facing curb leaves the T mouth open');
 assert.ok(points.some((x,i)=>i%3===0&&Math.abs(x)<1&&points[i+2]<-4&&points[i+2]>-4.3),'far-side curb remains continuous across T');
 const legacy=run(false,lite).children.flatMap(mesh=>Array.from(mesh.geometry.attributes.position.array));
 assert.ok(legacy.some((value,i)=>i%3===0&&Math.abs(value)<6&&Math.abs(legacy[i+2])<6),'fixture exposes old barrier');
});
