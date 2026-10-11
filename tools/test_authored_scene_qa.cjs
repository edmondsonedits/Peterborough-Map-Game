'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { waitForAuthoredScene } = require('./authored-scene-qa.cjs');

function pageAt(dataset, api = null, timeout = false) {
  return {
    async waitForFunction(predicate, expected) {
      global.document = { documentElement: { dataset } };
      if (timeout || !predicate(expected)) throw new Error('Timeout 30ms exceeded');
    },
    async evaluate(fn) {
      global.document = { documentElement: { dataset } };
      global.__PTBO_AUTHORED_SCENE__ = { status: () => api };
      return fn();
    },
  };
}

test('ready waits stop immediately on terminal failure with bridge and actor evidence', async () => {
  const page = pageAt({ authoredSceneStatus: 'failed', authoredSceneError: 'bridge missing', gameplayReady: 'true', firefighterAsset: 'ready', pumperAsset: 'ready' }, { bridgeReady: false });
  await assert.rejects(waitForAuthoredScene(page, 'ready', 30), error => {
    assert.match(error.message, /expected ready/);
    assert.match(error.message, /bridge missing/);
    assert.match(error.message, /"bridgeReady":false/);
    assert.match(error.message, /"firefighterAsset":"ready"/);
    return true;
  });
});

test('timeout reports actor gates and current state', async () => {
  await assert.rejects(waitForAuthoredScene(pageAt({ authoredSceneStatus: 'disabled', gameplayReady: 'true' }, { bridgeReady: true }, true), 'ready', 30), error => {
    assert.match(error.message, /Timeout/);
    assert.match(error.message, /"pumperAsset":""/);
    assert.match(error.message, /"status":"disabled"/);
    return true;
  });
});

test('expected ready and injected failure states succeed', async () => {
  for (const status of ['ready', 'failed']) {
    await waitForAuthoredScene(pageAt({ authoredSceneStatus: status }), status, 30);
  }
});
