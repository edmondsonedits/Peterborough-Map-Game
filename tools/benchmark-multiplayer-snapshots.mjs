import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { createExplorerServer } from '../city-explorer/multiplayer/server/src/index.mjs';
import { createExplorerWorld } from '../city-explorer/multiplayer/server/src/world-config.mjs';
import { Client } from '../city-explorer/multiplayer/server/node_modules/@colyseus/sdk/build/index.mjs';
import assert from 'node:assert/strict';

const count = Number(process.argv.find(value => value.startsWith('--players='))?.split('=')[1] ?? 8);
assert.ok([2, 4, 8].includes(count), 'Use --players=2, 4, or 8');
const output = process.argv.find(value => value.startsWith('--out='))?.slice(6);
const config = await createExplorerWorld();
const app = createExplorerServer({ ...config, nodeEnv: 'development' });
const clients = [];
let timer;
const percentile = (values, fraction) => [...values].sort((a,b) => a-b)[Math.min(values.length-1, Math.floor(values.length*fraction))] ?? 0;
try {
  const address = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${address.port}`;
  const post = async (route, body) => {
    const response = await fetch(base+route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.ok(response.ok, `HTTP ${response.status} at ${route}`);
    return response.json();
  };
  const created = await post('/api/rooms', {});
  for (let i=0; i<count; i++) {
    const auth = await post('/api/join', { code: created.roomCode, ...(i===0 ? { adminCredential: created.adminCredential } : {}) });
    const room = await new Client(base).joinById(auth.roomId, { playerCredential: auth.playerCredential });
    room.reconnection.enabled = false;
    const sample = { bytes: 0, snapshots: 0, gaps: [], lastAt: null, fullBaseline: false, compactSeen: false, lastAck: 0, firstTick: null, lastTick: null, firstTickAt: null, lastTickAt: null, errors: [] };
    const item = { room, auth, sample, sequence: 0 };
    clients.push(item);
    room.onMessage('snapshot', frame => {
      const time = performance.now();
      if (sample.lastAt !== null) sample.gaps.push(time-sample.lastAt);
      sample.lastAt = time;
      if (sample.firstTick === null) { sample.firstTick=frame.tick; sample.firstTickAt=time; }
      sample.lastTick=frame.tick; sample.lastTickAt=time;
      if (!sample.fullBaseline) {
        if (!frame.vehicles.every(vehicle => vehicle.tuning && vehicle.dimensions)) sample.errors.push('First frame missing catalog');
        sample.fullBaseline = true;
      } else if (frame.vehicles.every(vehicle => !vehicle.tuning && !vehicle.dimensions)) sample.compactSeen = true;
      if (frame.ackInputSequence < sample.lastAck) sample.errors.push('Input ACK regressed');
      sample.lastAck = frame.ackInputSequence;
      sample.snapshots++;
    });
    room.onMessage('ack', result => { if (!result.ok) sample.errors.push(result.error ?? 'Input rejected'); });
    room.onMessage('admin-credential', () => {});
    room.connection.transport.ws.addEventListener('message', event => {
      const data = event.data;
      sample.bytes += typeof data === 'string' ? Buffer.byteLength(data) : (data.byteLength ?? data.size ?? 0);
    });
    room.send('subscribe', {});
  }
  await new Promise(resolve => setTimeout(resolve, 250));
  for (const { sample } of clients) { sample.bytes=0; sample.snapshots=0; sample.gaps=[]; sample.lastAt=null; sample.firstTick=null; sample.lastTick=null; sample.firstTickAt=null; sample.lastTickAt=null; }
  const start=performance.now();
  timer=setInterval(() => {
    for (const item of clients) item.room.send('input', { input: { protocolVersion: 1, epoch: item.auth.epoch, sequence: ++item.sequence, mode: 'onFoot', controls: { forward: .25, strafe: 0, run: false, sprint: false, throttle: 0, steering: 0, viewYaw: 0 } } });
  }, 1000/30);
  await new Promise(resolve => setTimeout(resolve, 5000));
  clearInterval(timer); timer=null;
  const seconds=(performance.now()-start)/1000;
  for (const { sample } of clients) { assert.ok(sample.fullBaseline && sample.compactSeen); assert.ok(sample.lastAck>0); assert.deepEqual(sample.errors, []); }
  const result={ players: count, worldVersion: config.world.worldVersion ?? config.world.version, seconds,
    clients: clients.map(({sample}) => ({ bytesPerSecond: Math.round(sample.bytes/seconds), snapshotsPerSecond: +(sample.snapshots/seconds).toFixed(1), gapP95Ms: +percentile(sample.gaps,.95).toFixed(1), maxGapMs: +Math.max(...sample.gaps).toFixed(1), simulationTicksPerSecond: +((sample.lastTick-sample.firstTick)/((sample.lastTickAt-sample.firstTickAt)/1000)).toFixed(1), simulatedInputAck: sample.lastAck })),
    limitations: 'Local real-city Node/SDK test; no rendering, TLS overhead, network impairment, WAN or physical phones.' };
  for (const { auth } of clients) await post('/api/rooms/'+auth.roomId+'/leave', { playerCredential: auth.playerCredential });
  result.explicitHttpLeaves = clients.length;
  if(output) await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {
  if(timer) clearInterval(timer);
  await Promise.allSettled(clients.map(({room})=>room.leave()));
  await app.close();
}
