import test from 'node:test';
import assert from 'node:assert/strict';
import { createStationTransition } from '../city-explorer/station-transition.mjs';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ prepare = async number => number, initial = 1 } = {}) {
  let active = initial;
  const commits = [];
  const states = [];
  const transition = createStationTransition({
    getActive: () => active,
    prepare,
    commit: (number, prepared) => { commits.push([number, prepared]); active = number; },
    onState: state => states.push(state),
  });
  return { transition, commits, states, active: () => active };
}

test('latest request wins when readiness promises finish out of order', async () => {
  const loads = new Map();
  const h = harness({ prepare: number => {
    const load = deferred(); loads.set(number, load); return load.promise;
  }});
  const two = h.transition.switchTo(2);
  const three = h.transition.switchTo(3);
  loads.get(3).resolve('ready-3');
  assert.equal((await three).stationNumber, 3);
  loads.get(2).resolve('ready-2');
  await two;
  assert.deepEqual(h.commits, [[3, 'ready-3']]);
  assert.equal(h.active(), 3);
});

test('earlier readiness finishing first cannot commit while the newest request is pending', async () => {
  const loads = new Map();
  const h = harness({ prepare: number => {
    const load = deferred(); loads.set(number, load); return load.promise;
  }});
  const two = h.transition.switchTo(2);
  const three = h.transition.switchTo(3);
  loads.get(2).resolve('ready-2');
  await two;
  assert.deepEqual(h.commits, []);
  loads.get(3).resolve('ready-3');
  assert.equal((await three).stationNumber, 3);
  assert.deepEqual(h.commits, [[3, 'ready-3']]);
});

test('same target shares work and selecting the active station cancels pending work', async () => {
  const load = deferred(); let prepares = 0;
  const h = harness({ prepare: () => { prepares++; return load.promise; } });
  const first = h.transition.switchTo(2);
  const duplicate = h.transition.switchTo(2);
  assert.equal(first, duplicate);
  assert.equal(prepares, 1);
  const back = await h.transition.switchTo(1);
  assert.equal(back.ok, true);
  assert.equal(h.transition.getStatus().busy, false);
  load.resolve('late'); await first;
  assert.deepEqual(h.commits, []);
  assert.equal(h.active(), 1);
});

test('rapid 1 to 2 to 3 to 1 selection cancels both stale preparations', async () => {
  const loads = new Map();
  const h = harness({ prepare: number => {
    const load = deferred(); loads.set(number, load); return load.promise;
  }});
  const toTwo = h.transition.switchTo(2);
  const toThree = h.transition.switchTo(3);
  const backToOne = await h.transition.switchTo(1);
  assert.equal(backToOne.ok, true);
  assert.equal((await toTwo).ok, false);
  assert.equal((await toThree).ok, false);
  loads.get(3).resolve('late-3');
  loads.get(2).resolve('late-2');
  assert.deepEqual(h.commits, []);
  assert.equal(h.active(), 1);
});

test('failed target retains active station, clears busy, and permits retry', async () => {
  let attempts = 0;
  const h = harness({ prepare: async number => {
    if (++attempts === 1) throw new Error('load failed');
    return `ready-${number}`;
  }});
  const failed = await h.transition.switchTo(2);
  assert.equal(failed.ok, false);
  assert.equal(failed.stationNumber, 1);
  assert.match(failed.error, /load failed/);
  assert.equal(failed.status.busy, false);
  const retried = await h.transition.switchTo(2);
  assert.equal(retried.ok, true);
  assert.equal(retried.stationNumber, 2);
});

test('invalid values do not prepare or commit; same active station is a no-op', async () => {
  const h = harness();
  const invalid = await h.transition.switchTo(4);
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /invalid station/i);
  const same = await h.transition.switchTo(1);
  assert.equal(same.ok, true);
  assert.deepEqual(h.commits, []);
});

test('stale prepare rejection is handled without replacing newer success state', async () => {
  const old = deferred();
  const h = harness({ prepare: number => number === 2 ? old.promise : Promise.resolve('ready') });
  const stale = h.transition.switchTo(2);
  const latest = await h.transition.switchTo(3);
  old.reject(new Error('stale failure'));
  await stale;
  await tick();
  assert.equal(latest.ok, true);
  assert.equal(h.transition.getStatus().stationNumber, 3);
  assert.equal(h.transition.getStatus().error, null);
});
