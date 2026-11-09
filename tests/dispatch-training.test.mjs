import test from 'node:test';
import assert from 'node:assert/strict';
import {createDispatchTraining, collectMapEntities} from '../city-explorer/dispatch-training.mjs';

test('all halls respond to the same call and must stop a truck at the destination',()=>{
  for(const station of [1,2,3]){
    const call=createDispatchTraining({x:100,z:200,name:'City Hall'});
    assert.equal(call.state().status,'idle');
    call.start(station,1000);
    assert.equal(call.update({x:100,z:200,speed:0},false,2000).status,'responding');
    assert.equal(call.update({x:100,z:200,speed:4},true,3000).status,'responding');
    assert.equal(call.update({x:200,z:200,speed:0},true,4000).status,'responding');
    assert.equal(call.update({x:110,z:205,speed:.2},true,5000).status,'arrived');
    assert.equal(call.state().elapsedSeconds,4);
    call.start(station,7000);assert.equal(call.state().status,'responding');
    call.cancel();assert.equal(call.state().status,'idle');
  }
});
test('map entities use predicted local truck position and retain remote players and vehicles',()=>{
  const snapshot={player:{id:'me',mode:'driving',vehicleId:'pump-1',pose:{x:0,z:0}},players:[{id:'other',name:'Sam',mode:'onFoot',pose:{x:4,z:9}}],vehicles:[{id:'pump-1',pose:{x:1,z:1}},{id:'pump-2',pose:{x:3,z:3}}]};
  const markers=collectMapEntities({snapshot,localPose:{x:8,z:7},vehicleId:'pump-1'});
  assert.equal(markers.length,3);
  assert.equal(markers.find(m=>m.id==='vehicle:pump-1').pose.x,8);
  assert.equal(markers.find(m=>m.id==='player:other').label,'Sam');
  assert.equal(markers.filter(m=>m.local).length,1);
});
