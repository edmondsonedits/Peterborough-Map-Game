import test from 'node:test';
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION, validateInput, validateAction, validateSnapshot } from '../city-explorer/multiplayer/protocol.mjs';
const pose={x:1,y:2,z:3,heading:.4,vx:0,vz:0,speed:0,steering:0};
const player={id:'p1',name:'Player 1',entityGeneration:1,mode:'onFoot',pose,vehicleId:null};
test('validates bounded input and rejects invalid yaw, controls, mode, or version',()=>{
 const input={protocolVersion:PROTOCOL_VERSION,epoch:2,sequence:9,mode:'driving',controls:{forward:0,strafe:0,sprint:false,throttle:1,steering:-.5,viewYaw:0}};
 assert.equal(validateInput(input),true);assert.equal(validateInput({...input,sequence:-1}),false);assert.equal(validateInput({...input,protocolVersion:99}),false);assert.equal(validateInput({...input,controls:{...input.controls,viewYaw:NaN}}),false);assert.equal(validateInput({...input,controls:{...input.controls,throttle:8}}),false);assert.equal(validateInput({...input,mode:'fly'}),false);
});
test('validates per-action vehicle ids and bounded authoritative snapshot entities',()=>{
 const action={protocolVersion:PROTOCOL_VERSION,epoch:2,sequence:10,type:'enterVehicle',vehicleId:'pump-1'};
 assert.equal(validateAction(action),true);const{sequence,...missingSequence}=action;assert.equal(validateAction(missingSequence),false);const{vehicleId,...missingVehicle}=action;assert.equal(validateAction(missingVehicle),false);assert.equal(validateAction({...action,type:'setPose'}),false);
 const snapshot={protocolVersion:PROTOCOL_VERSION,worldVersion:'world-v1',tick:3,serverTime:4,epoch:2,ackInputSequence:9,player,players:[],vehicles:[{id:'pump-1',pose,driverPlayerId:null,entityGeneration:1}]};
 assert.equal(validateSnapshot(snapshot),true);assert.equal(validateSnapshot({...snapshot,players:[{...player,name:'A'}]}),false);assert.equal(validateSnapshot({...snapshot,players:Array(9).fill(player)}),false);assert.equal(validateSnapshot({...snapshot,vehicles:Array(13).fill(snapshot.vehicles[0])}),false);assert.equal(validateSnapshot({...snapshot,player:{...player,entityGeneration:undefined}}),false);assert.equal(validateSnapshot({...snapshot,protocolVersion:99}),false);
});
