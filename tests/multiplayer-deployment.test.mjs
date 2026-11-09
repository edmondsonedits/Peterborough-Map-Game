import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDeployedWorld } from '../tools/check-multiplayer-deployment.mjs';
const base = { serverUrl: 'https://game.example', expectedWorldVersion: 'world-a', attempts: 2, wait: async () => {} };
test('deployment gate waits through a waking response and requires matching ready world', async () => {
  let calls = 0;
  const result = await verifyDeployedWorld({ ...base, fetchImpl: async () => ++calls === 1 ? { ok: false, json: async () => { throw new Error('HTML wake page'); } } : { ok: true, json: async () => ({ status: 'ready', protocolVersion: 2, worldVersion: 'world-a' }) } });
  assert.equal(calls, 2); assert.equal(result.status, 'matched');
});
test('deployment gate blocks mismatched backend without publishing a frontend', async () => {
  await assert.rejects(verifyDeployedWorld({ ...base, fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'ready', protocolVersion: 2, worldVersion: 'world-b' }) }) }), /does not match/);
});
test('deployment gate rejects a non-HTTPS endpoint', async () => {
  await assert.rejects(verifyDeployedWorld({ ...base, serverUrl: 'http://game.example' }), /HTTPS/);
});

test('deployment gate rejects old and missing protocol versions even when the world matches', async () => {
 for(const protocolVersion of [1,undefined]){
  await assert.rejects(verifyDeployedWorld({...base,fetchImpl:async()=>({ok:true,json:async()=>({status:'ready',worldVersion:'world-a',protocolVersion})})}),/protocol/i);
 }
});
