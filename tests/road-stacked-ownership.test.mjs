import test from 'node:test';import assert from 'node:assert/strict';
import {OfficialDrivableSurfaceIndex} from '../city-explorer/official-road-surfaces.js';
test('municipal ground ownership can be queried beneath a vehicular bridge footprint',()=>{const index=new OfficialDrivableSurfaceIndex();const ring=[{x:-4,y:-4},{x:4,y:-4},{x:4,y:4},{x:-4,y:4}];index.add([ring],{id:'ground',layer:'road_surfaces'});index.add([ring],{id:'deck',layer:'bridges',properties:{BR_USE:'Vehicular'}});assert.equal(index.query(0,0).id,'deck');assert.equal(index.query(0,0,{includeBridges:false}).id,'ground');});
