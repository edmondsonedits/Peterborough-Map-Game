import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublisherServer, loadConfig } from '../city-editor-publisher/server.mjs';
import { createAuth } from '../city-editor-publisher/auth.mjs';

const origin = 'https://edmondsonedits.github.io';
const config = {
  clientId: 'test-client', clientSecret: 'test-secret', sessionSecret: 'session-secret-at-least-32-bytes-long',
  origin, callbackUrl: 'https://publisher.example/auth/callback', owner: 'edmondsonedits',
  repo: 'Peterborough-Map-Game', branch: 'main',
  returnUrl: `${origin}/Peterborough-Map-Game/city-explorer/`,
};
const scene = { schemaVersion: 1, city: 'peterborough-on', revision: null, updatedAt: '2026-09-25T12:00:00.000Z', objects: [], overrides: [] };
const currentSha = 'a'.repeat(40);
const commitSha = 'b'.repeat(40);

test('deployment config requires GitHub App credentials and same-origin return URL', () => {
  const env = {
    CITY_EDITOR_GITHUB_APP_CLIENT_ID: 'client', CITY_EDITOR_GITHUB_APP_CLIENT_SECRET: 'secret',
    CITY_EDITOR_SESSION_SECRET: 'session-secret-at-least-32-bytes-long', CITY_EDITOR_ORIGIN: origin,
    CITY_EDITOR_CALLBACK_URL: 'https://publisher.example/auth/callback',
    CITY_EDITOR_RETURN_URL: `${origin}/Peterborough-Map-Game/city-explorer/`,
  };
  assert.equal(loadConfig(env).clientId, 'client');
  assert.throws(() => loadConfig({ ...env, CITY_EDITOR_RETURN_URL: 'https://attacker.example/' }), /CITY_EDITOR_RETURN_URL/);
});

function githubMock({ login = 'edmondsonedits', current = currentSha, putStatus = 200, currentStatus = 200, deploymentStatus = 'success' } = {}) {
  const calls = [];
  async function fetchImpl(url, options = {}) {
    const pathname = new URL(url).pathname;
    calls.push({ pathname, options });
    let status = 200;
    let body;
    if (pathname === '/login/oauth/access_token') body = { access_token: 'private-user-token', token_type: 'bearer', scope: 'repo' };
    else if (pathname === '/user') body = { login };
    else if (pathname.endsWith('/contents/city-explorer/data/editor/peterborough-details.json')) {
      if (options.method === 'PUT') { status = putStatus; body = status === 200 ? { commit: { sha: commitSha }, content: { sha: 'c'.repeat(40) } } : { message: 'GitHub write failed' }; }
      else { status = typeof currentStatus === 'function' ? currentStatus() : currentStatus; body = status === 200 ? { sha: current, path: 'city-explorer/data/editor/peterborough-details.json', encoding: 'base64', content: Buffer.from(`${JSON.stringify(scene, null, 2)}\n`).toString('base64') } : { message: 'Bad credentials' }; }
    } else if (pathname.endsWith('/deployments')) body = [{ id: 42, sha: commitSha, environment: 'github-pages' }];
    else if (pathname.endsWith('/deployments/42/statuses')) body = [{ state: deploymentStatus }];
    else throw new Error(`Unexpected GitHub request: ${pathname}`);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }
  return { fetchImpl, calls };
}

async function fixture(mock = githubMock(), options = {}) {
  const logs = [];
  const server = createPublisherServer({ config, fetchImpl: mock.fetchImpl, now: options.now,
    sourceKeyForRequest: options.sourceKeyForRequest,
    logger: { error: (...args) => logs.push(args.join(' ')) } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, options = {}) { return fetch(`${base}${path}`, { redirect: 'manual', ...options }); }
  async function login() {
    const start = await request('/auth/github');
    assert.equal(start.status, 302);
    const stateCookie = start.headers.get('set-cookie').split(';')[0];
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const callback = await request(`/auth/callback?code=sample-code&state=${encodeURIComponent(state)}`, { headers: { cookie: stateCookie } });
    assert.equal(callback.status, 302);
    const sessionCookie = callback.headers.get('set-cookie').split(';')[0];
    const status = await request('/auth/status', { headers: { cookie: sessionCookie, origin } });
    return { sessionCookie, status: await status.json(), callback };
  }
  async function close() { await new Promise((resolve) => server.close(resolve)); }
  return { request, login, close, mock, logs };
}

test('unauthenticated writes are rejected before contacting GitHub', async () => {
  const f = await fixture();
  try {
    const response = await f.request('/api/scene/versions', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ baseRevision: currentSha, document: scene }) });
    assert.equal(response.status, 401);
    assert.equal(f.mock.calls.length, 0);
  } finally { await f.close(); }
});

test('OAuth requires exact owner and secure session cookie', async () => {
  const f = await fixture(githubMock({ login: 'someone-else' }));
  try {
    const start = await f.request('/auth/github');
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const response = await f.request(`/auth/callback?code=sample-code&state=${state}`, { headers: { cookie: start.headers.get('set-cookie').split(';')[0] } });
    assert.equal(response.status, 403);
    assert.doesNotMatch(response.headers.get('set-cookie') || '', /publisher_session=/);
  } finally { await f.close(); }
  const owner = await fixture();
  try {
    const { callback, status } = await owner.login();
    assert.match(callback.headers.get('set-cookie'), /HttpOnly/);
    assert.match(callback.headers.get('set-cookie'), /Secure/);
    assert.match(callback.headers.get('set-cookie'), /SameSite=None/);
    assert.equal(callback.headers.get('location'), config.returnUrl);
    const exchange = owner.mock.calls.find(({ pathname }) => pathname === '/login/oauth/access_token');
    assert.match(exchange.options.headers['content-type'], /application\/x-www-form-urlencoded/);
    assert.equal(new URLSearchParams(exchange.options.body).get('client_id'), config.clientId);
    assert.equal(status.authenticated, true);
    assert.equal(status.baseRevision, currentSha);
    assert.deepEqual(status.publishedDocument, scene);
    assert.match(status.csrfToken, /^[0-9a-f]{64}$/);
  } finally { await owner.close(); }
});

test('OAuth state cannot be forged', async () => {
  const f = await fixture();
  try {
    const response = await f.request('/auth/callback?code=sample-code&state=forged');
    assert.equal(response.status, 403);
    assert.equal(f.mock.calls.length, 0);
  } finally { await f.close(); }
});

test('writes require exact Origin and session CSRF', async () => {
  const f = await fixture();
  try {
    const { sessionCookie, status } = await f.login();
    const body = JSON.stringify({ baseRevision: currentSha, document: scene });
    for (const headers of [
      { cookie: sessionCookie, origin: 'https://attacker.example', 'x-csrf-token': status.csrfToken },
      { cookie: sessionCookie, origin, 'x-csrf-token': 'wrong' },
    ]) {
      const response = await f.request('/api/scene/versions', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body });
      assert.equal(response.status, 403);
    }
    assert.equal(f.mock.calls.filter(({ options }) => options.method === 'PUT').length, 0);
  } finally { await f.close(); }
});

test('invalid document and stale SHA never write', async () => {
  const f = await fixture();
  try {
    const { sessionCookie, status } = await f.login();
    const headers = { cookie: sessionCookie, origin, 'x-csrf-token': status.csrfToken, 'content-type': 'application/json' };
    let response = await f.request('/api/scene/versions', { method: 'POST', headers, body: JSON.stringify({ baseRevision: currentSha, document: { ...scene, city: 'elsewhere' } }) });
    assert.equal(response.status, 422);
    response = await f.request('/api/scene/versions', { method: 'POST', headers, body: JSON.stringify({ baseRevision: 'd'.repeat(40), document: scene }) });
    assert.equal(response.status, 409);
    assert.equal(f.mock.calls.filter(({ options }) => options.method === 'PUT').length, 0);
  } finally { await f.close(); }
});

test('publisher rejects unknown assets and unlinked generated clones before commit', async () => {
  const f = await fixture();
  try {
    const { sessionCookie, status } = await f.login();
    const headers = { cookie: sessionCookie, origin, 'x-csrf-token': status.csrfToken, 'content-type': 'application/json' };
    const transform = { longitude: -78.3, latitude: 44.3, elevation: 0, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
    const id = '00000000-0000-4000-8000-000000000001';
    const bad = [
      { ...scene, objects: [{ id, assetKey: 'unknown', transform }] },
      { ...scene, objects: [{ id, assetKey: 'generated-source-clone', properties: { sourceTargetId: id }, transform }] },
      { ...scene, overrides: [{ id, operation: 'replace', assetKey: 'unknown' }] },
    ];
    for (const document of bad) {
      const response = await f.request('/api/scene/versions', { method: 'POST', headers, body: JSON.stringify({ baseRevision: currentSha, document }) });
      assert.equal(response.status, 422);
    }
    assert.equal(f.mock.calls.filter(({ options }) => options.method === 'PUT').length, 0);
  } finally { await f.close(); }
});

test('successful commit serializes deterministically and status follows deployment', async () => {
  const f = await fixture();
  try {
    const { sessionCookie, status } = await f.login();
    const headers = { cookie: sessionCookie, origin, 'x-csrf-token': status.csrfToken, 'content-type': 'application/json' };
    const response = await f.request('/api/scene/versions', { method: 'POST', headers, body: JSON.stringify({ baseRevision: currentSha, document: scene }) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).commitSha, commitSha);
    const write = f.mock.calls.find(({ options }) => options.method === 'PUT');
    const payload = JSON.parse(write.options.body);
    assert.equal(payload.sha, currentSha);
    assert.equal(Buffer.from(payload.content, 'base64').toString('utf8'), `${JSON.stringify(scene, null, 2)}\n`);
    assert.match(payload.message, /2026-09-25T12:00:00.000Z/);
    const deployment = await f.request(`/api/scene/versions/${commitSha}/status`, { headers: { cookie: sessionCookie, origin } });
    assert.equal(deployment.status, 200);
    assert.equal((await deployment.json()).state, 'live');
  } finally { await f.close(); }
});

test('GitHub failure is mapped safely and credentials never appear in response or logs', async () => {
  const f = await fixture(githubMock({ putStatus: 500 }));
  try {
    const { sessionCookie, status } = await f.login();
    const response = await f.request('/api/scene/versions', { method: 'POST', headers: { cookie: sessionCookie, origin, 'x-csrf-token': status.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify({ baseRevision: currentSha, document: scene }) });
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text() + f.logs.join(' '), /private-user-token|test-secret|session-secret/);
  } finally { await f.close(); }
});

test('GitHub validation error is not misreported as a stale SHA', async () => {
  const f = await fixture(githubMock({ putStatus: 422 }));
  try {
    const { sessionCookie, status } = await f.login();
    const response = await f.request('/api/scene/versions', { method: 'POST', headers: { cookie: sessionCookie, origin, 'x-csrf-token': status.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify({ baseRevision: currentSha, document: scene }) });
    assert.equal(response.status, 502);
  } finally { await f.close(); }
});

test('expired GitHub token is reported as auth expiry', async () => {
  let reads = 0;
  const mock = githubMock({ currentStatus: () => ++reads === 1 ? 200 : 401 });
  const f = await fixture(mock);
  try {
    const { sessionCookie } = await f.login();
    const status = await f.request('/auth/status', { headers: { cookie: sessionCookie, origin } });
    assert.equal(status.status, 401);
  } finally { await f.close(); }
});

test('write rate limit returns 429', async () => {
  const f = await fixture();
  try {
    const { sessionCookie, status } = await f.login();
    const headers = { cookie: sessionCookie, origin, 'x-csrf-token': status.csrfToken, 'content-type': 'application/json' };
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await f.request('/api/scene/versions', { method: 'POST', headers, body: JSON.stringify({ baseRevision: currentSha, document: scene }) })).status);
    assert.equal(statuses.at(-1), 429);
  } finally { await f.close(); }
});

test('OAuth starts have a hard cap and expired states release capacity', async () => {
  let time = 1_000;
  const f = await fixture(githubMock(), { now: () => time });
  try {
    const statuses = [];
    for (let i = 0; i < 129; i++) statuses.push((await f.request('/auth/github')).status);
    assert.ok(statuses.includes(429), 'a flood of pending login starts must be bounded');
    time += 11 * 60 * 1_000;
    assert.equal((await f.request('/auth/github')).status, 302, 'expired starts should release capacity');
  } finally { await f.close(); }
});

test('one saturated OAuth source cannot deny a different owner source', async () => {
  const f = await fixture(githubMock(), { sourceKeyForRequest: (req) => req.headers['x-test-source'] });
  try {
    const starts = [];
    for (let i = 0; i < 9; i++) starts.push((await f.request('/auth/github', { headers: { 'x-test-source': 'attacker' } })).status);
    assert.equal(starts.at(-1), 429);
    assert.equal((await f.request('/auth/github', { headers: { 'x-test-source': 'owner' } })).status, 302);
  } finally { await f.close(); }
});

test('forwarded address is ignored unless the socket peer is explicitly trusted', async () => {
  const { resolveAuthSource } = await import('../city-editor-publisher/server.mjs');
  const req = { socket: { remoteAddress: '203.0.113.5' }, headers: { 'x-forwarded-for': '198.51.100.7' } };
  assert.equal(resolveAuthSource(req, { trustedProxyAddresses: [] }), '203.0.113.5');
  assert.equal(resolveAuthSource(req, { trustedProxyAddresses: ['192.0.2.10'] }), '203.0.113.5');
});

test('trusted proxy uses only the nearest valid forwarded peer', async () => {
  const { resolveAuthSource } = await import('../city-editor-publisher/server.mjs');
  const req = { socket: { remoteAddress: '192.0.2.10' }, headers: { 'x-forwarded-for': '198.51.100.7, 203.0.113.8' } };
  assert.equal(resolveAuthSource(req, { trustedProxyAddresses: ['192.0.2.10'] }), '203.0.113.8');
  req.headers['x-forwarded-for'] = '198.51.100.7, invalid';
  assert.equal(resolveAuthSource(req, { trustedProxyAddresses: ['192.0.2.10'] }), '192.0.2.10');
});

test('trusted proxy list is explicit validated deployment configuration', () => {
  const env = {
    CITY_EDITOR_GITHUB_APP_CLIENT_ID: 'client', CITY_EDITOR_GITHUB_APP_CLIENT_SECRET: 'secret',
    CITY_EDITOR_SESSION_SECRET: 'session-secret-at-least-32-bytes-long', CITY_EDITOR_ORIGIN: origin,
    CITY_EDITOR_CALLBACK_URL: 'https://publisher.example/auth/callback',
    CITY_EDITOR_RETURN_URL: `${origin}/Peterborough-Map-Game/city-explorer/`,
    CITY_EDITOR_TRUSTED_PROXY_ADDRESSES: '192.0.2.10,203.0.113.9',
  };
  assert.deepEqual(loadConfig(env).trustedProxyAddresses, ['192.0.2.10', '203.0.113.9']);
  assert.throws(() => loadConfig({ ...env, CITY_EDITOR_TRUSTED_PROXY_ADDRESSES: '0.0.0.0/0' }), /CITY_EDITOR_TRUSTED_PROXY_ADDRESSES/);
});

test('expiry sweep removes states and session tokens without another request', async () => {
  let time = 1_000;
  let sweep;
  const mock = githubMock();
  const auth = createAuth({ config, fetchImpl: mock.fetchImpl, now: () => time,
    scheduleInterval: (callback) => { sweep = callback; return { unref() {} }; }, cancelInterval: () => {} });
  try {
    const abandoned = auth.begin();
    const abandonedState = new URL(abandoned.location).searchParams.get('state');
    const valid = auth.begin();
    const validState = new URL(valid.location).searchParams.get('state');
    const loggedIn = await auth.complete({ headers: { cookie: valid.cookie.split(';')[0] } }, validState, 'code');
    assert.ok(auth.session({ headers: { cookie: loggedIn.cookie.split(';')[0] } }));
    time += 8 * 60 * 60 * 1_000 + 1;
    sweep();
    time = 1_000; // Rewind the injected clock: rejection now proves deletion, not only time checking.
    assert.equal(auth.session({ headers: { cookie: loggedIn.cookie.split(';')[0] } }), null);
    assert.equal(await auth.complete({ headers: { cookie: abandoned.cookie.split(';')[0] } }, abandonedState, 'code'), null);
    assert.equal(mock.calls.filter(({ pathname }) => pathname === '/login/oauth/access_token').length, 1);
  } finally { auth.dispose(); }
});

test('session storage evicts the oldest owner login when its hard cap is reached', async () => {
  const mock = githubMock();
  const auth = createAuth({ config, fetchImpl: mock.fetchImpl });
  try {
    const cookies = [];
    for (let i = 0; i < 65; i++) {
      const started = auth.begin();
      const state = new URL(started.location).searchParams.get('state');
      const completed = await auth.complete({ headers: { cookie: started.cookie.split(';')[0] } }, state, 'code');
      cookies.push(completed.cookie.split(';')[0]);
    }
    assert.equal(auth.session({ headers: { cookie: cookies[0] } }), null);
    assert.equal(auth.session({ headers: { cookie: cookies[32] } }), null);
    assert.ok(auth.session({ headers: { cookie: cookies[33] } }));
    assert.ok(auth.session({ headers: { cookie: cookies.at(-1) } }));
  } finally { auth.dispose(); }
});
