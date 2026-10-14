'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../tools/check-road-preview-smoke.cjs'), 'utf8');

// Model Playwright's (predicate, argument, options) contract with virtual time.
// The actual smoke script decides success from its own predicate and snapshot.
async function runSmoke({ readyAt = Infinity, errorAt = Infinity } = {}) {
  let elapsed = 0;
  let closed = false;
  const errors = [];
  const waits = [];
  const dataset = { explorerBootPhase: 'Adding official parks...' };
  const loading = { className: 'loading-screen', innerText: 'Building Peterborough' };
  const errorCard = { innerText: 'Simulator needs a restart' };
  const document = {
    documentElement: { dataset },
    scripts: [],
    querySelector(selector) {
      if (selector === '#loading-screen') return loading;
      return elapsed >= errorAt ? errorCard : null;
    },
    querySelectorAll() { return elapsed >= errorAt ? [errorCard] : []; },
  };
  const page = {
    on() {},
    async goto() { return { status: () => 200 }; },
    async waitForFunction(predicate, argument, options) {
      const timeout = options?.timeout ?? 30000;
      waits.push({ argument, timeout });
      elapsed = Math.min(readyAt, errorAt, timeout);
      if (elapsed >= readyAt) dataset.gameplayReady = 'true';
      if (elapsed >= errorAt) {
        dataset.explorerBootPhase = 'failed';
        loading.className += ' has-error';
      }
      if (!predicate(argument)) throw new Error(`Timeout ${timeout}ms exceeded`);
    },
    async evaluate(callback) { return callback(); },
  };
  const process = { argv: ['node', 'check-road-preview-smoke.cjs', 'http://example.test'] };
  const context = {
    document,
    process,
    console: { log() {}, error: error => errors.push(String(error)) },
    require(name) {
      assert.equal(name, 'playwright');
      return { chromium: { launch: async () => ({ newPage: async () => page, close: async () => { closed = true; } }) } };
    },
  };
  await vm.runInNewContext(source, context, { filename: 'check-road-preview-smoke.cjs' });
  return { elapsed, closed, errors, waits, exitCode: process.exitCode };
}

test('road smoke accepts startup at 45 seconds within its existing 65 second budget', async () => {
  const result = await runSmoke({ readyAt: 45000 });
  assert.equal(result.exitCode, undefined, result.errors.join('\n'));
  assert.equal(result.elapsed, 45000);
  assert.equal(result.waits[0].argument, null);
  assert.equal(result.waits[0].timeout, 65000);
  assert.equal(result.closed, true);
});

test('road smoke fails when startup never becomes playable within 65 seconds', async () => {
  const result = await runSmoke();
  assert.equal(result.exitCode, 1);
  assert.equal(result.elapsed, 65000);
  assert.match(result.errors.join('\n'), /did not become playable/);
  assert.equal(result.closed, true);
});

test('road smoke fails immediately when a startup error panel appears', async () => {
  const result = await runSmoke({ readyAt: 45000, errorAt: 5000 });
  assert.equal(result.exitCode, 1);
  assert.equal(result.elapsed, 5000);
  assert.match(result.errors.join('\n'), /did not become playable/);
  assert.equal(result.closed, true);
});
