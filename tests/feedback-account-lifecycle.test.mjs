import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const user = (uid, getClaims = async () => ({ claims: {} })) => ({ uid, isAnonymous: false, getIdTokenResult: getClaims });

async function harness() {
  let tokenChanged, stopped = 0;
  const auth = { currentUser: user('initial'), authStateReady: async () => {} };
  const sdk = {
    getApps: () => [{ name: 'ptbo-feedback' }], getAuth: () => auth, getFirestore: () => ({}),
    onIdTokenChanged: (_, listener) => { tokenChanged = listener; },
    doc: () => ({}), onSnapshot: () => () => { stopped++; },
  };
  // Exercise the complete service with only the remote SDK/module boundary replaced.
  const source = readFileSync(new URL('../feedback/service.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('export function createFeedbackService', 'function createFeedbackService')
    .replace(/\bimport\(/g, 'loadSdk(');
  const context = { loadSdk: async () => sdk, resumeGuestTransfers: async () => {}, config: { enabled: true, firebase: { apiKey: 'fixture', projectId: 'fixture' } } };
  const service = runInNewContext(`${source}\ncreateFeedbackService(config);`, context);
  await service.ready;
  const accounts = []; service.subscribeAccount(account => accounts.push(account));
  return { service, accounts, get stopped() { return stopped; }, change(next) { auth.currentUser = next; tokenChanged(next); } };
}

test('retired account refresh rejection cannot clear the newer account or its subscriptions', async () => {
  const h = await harness(), old = deferred();
  h.change(user('old', () => old.promise));
  h.change(user('current')); await tick();
  h.service.watchThread('thread', () => {}, () => {});
  old.reject(new Error('old token failed')); await tick();
  assert.equal(h.service.account?.uid, 'current'); assert.equal(h.stopped, 0);
  assert.equal(h.accounts.at(-1)?.uid, 'current');
});
test('retired same-account token rejection cannot undo fresher role claims', async () => {
  const h = await harness(), old = deferred();
  h.change(user('initial', () => old.promise));
  h.change(user('initial', async () => ({ claims: { feedbackAdmin: true } }))); await tick();
  old.reject(new Error('old token failed')); await tick();
  assert.equal(h.service.account?.uid, 'initial'); assert.equal(h.service.account?.isDeveloper, true);
});
test('current token refresh failure clears account and subscriptions', async () => {
  const h = await harness(); h.service.watchThread('thread', () => {}, () => {});
  h.change(user('initial', async () => { throw new Error('current token failed'); })); await tick();
  assert.equal(h.service.account, null); assert.equal(h.stopped, 1);
});
test('late successful refresh cannot undo sign-out', async () => {
  const h = await harness(), old = deferred();
  h.change(user('initial', () => old.promise)); h.change(null);
  old.resolve({ claims: { feedbackAdmin: true } }); await tick();
  assert.equal(h.service.account, null);
});
