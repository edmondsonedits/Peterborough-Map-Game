import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createWalmartGroundPlan,buildRouteParkingPaint,createWalmartTreeIsland} from '../city-explorer/route-open-ground.js';

test('real app ground integration replaces paint after streamed support arrives and removes it when support leaves',()=>{
  const app=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
  const extract=name=>{const start=app.indexOf(`function ${name}(`);assert.ok(start>=0);return app.slice(start,app.indexOf('\n}',start)+2);};
  let support=false;
  const context={THREE,createWalmartGroundPlan,buildRouteParkingPaint,createWalmartTreeIsland,
    routeGroundPlan:null,routeGroundPaint:null,routeGroundDirty:false,routeGroundTileIds:new Set(),
    routeGroundStatus:{paint:{ready:false,rows:[]},tree:{status:'not-built'}},
    recordingReferences:true,recordingExpansion:true,lowPowerProfile:true,
    project:(lat,lon)=>({x:(lon+78.3344)*79500,y:-(lat-44.3235)*111200}),
    terrainHeightAtWorld:()=>200,streetscapeGroup:new THREE.Group(),
    materials:{roadPaintWhite:new THREE.MeshBasicMaterial()},
    roadTileManifest:{tiles:[{id:'relevant',bounds:{minX:-300,maxX:300,minZ:-300,maxZ:300}},
      {id:'elsewhere',bounds:{minX:5000,maxX:6000,minZ:5000,maxZ:6000}}]},
    state:{renderedPavementIndex:{sample:(x,z,y,options)=>!support||options?.includeParking===false?null:
      {height:200,layer:'parking_surfaces',sourceId:'10/1429',heightSource:'rendered-pavement-triangle'}}},
  };
  vm.createContext(context);
  vm.runInContext(['refreshRouteGround','initializeRouteGround'].map(extract).join('\n'),context);
  context.initializeRouteGround();
  assert.equal(context.routeGroundStatus.tree.status,'ready');
  assert.equal(context.routeGroundStatus.paint.retryable,true);
  assert.equal(context.routeGroundPaint,null);
  assert.deepEqual([...context.routeGroundTileIds],['relevant']);
  const treeCount=context.streetscapeGroup.children.length;
  support=true;context.routeGroundDirty=true;context.refreshRouteGround();
  assert.equal(context.routeGroundStatus.paint.ready,true);
  assert.equal(context.routeGroundStatus.paint.rows.reduce((sum,row)=>sum+row.emittedLines,0),30);
  assert.equal(context.streetscapeGroup.children.length,treeCount+1);
  const previous=context.routeGroundPaint;let disposed=0;
  previous.geometry.addEventListener('dispose',()=>disposed++);
  context.refreshRouteGround();
  assert.equal(context.routeGroundPaint,previous,'unchanged pavement does not allocate duplicate paint');
  support=false;context.routeGroundDirty=true;context.refreshRouteGround();
  assert.equal(context.routeGroundPaint,null);
  assert.equal(disposed,1);
  assert.equal(previous.parent,null);
  assert.equal(context.streetscapeGroup.children.length,treeCount);
  assert.equal(context.routeGroundStatus.paint.retryable,true);
  support=true;context.routeGroundDirty=true;context.refreshRouteGround();
  assert.equal(context.routeGroundStatus.paint.ready,true,'a later reload recovers without a sticky checked flag');
  assert.equal(context.streetscapeGroup.children.length,treeCount+1);
});
