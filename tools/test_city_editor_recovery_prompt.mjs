import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryPrompt } from '../city-explorer/editor/recovery-prompt.js';

for (const action of ['recover', 'discard']) {
  test(`${action} dismisses recovery so a later editor entry does not reopen it`, () => {
    const prompt = createRecoveryPrompt('recovered');
    assert.equal(prompt.pending, true);
    prompt.dismiss();
    assert.equal(prompt.pending, false);
  });
}

for (const status of ['base-revision-mismatch', 'base-content-mismatch', 'base-content-unverified']) {
  test(`${status} retains an explicit recovery choice`, () => {
    const prompt = createRecoveryPrompt(status);
    assert.equal(prompt.pending, true);
    prompt.dismiss();
    assert.equal(prompt.pending, false);
  });
}
