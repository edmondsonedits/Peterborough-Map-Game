import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createAuth } from './auth.mjs';
import { createGithubPublisher } from './github-publisher.mjs';
import { validateCandidate } from './scene-validation.mjs';

const shaPattern = /^[0-9a-f]{40}$/i;

export function loadConfig(env = process.env) {
  const names = ['CITY_EDITOR_GITHUB_APP_CLIENT_ID', 'CITY_EDITOR_GITHUB_APP_CLIENT_SECRET', 'CITY_EDITOR_SESSION_SECRET', 'CITY_EDITOR_ORIGIN', 'CITY_EDITOR_CALLBACK_URL', 'CITY_EDITOR_RETURN_URL'];
  for (const name of names) if (!env[name]) throw new Error(`Missing ${name}`);
  if (env.CITY_EDITOR_SESSION_SECRET.length < 32) throw new Error('CITY_EDITOR_SESSION_SECRET must contain at least 32 characters');
  const origin = new URL(env.CITY_EDITOR_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.CITY_EDITOR_ORIGIN || origin.username || origin.password) throw new Error('CITY_EDITOR_ORIGIN must be an exact HTTPS origin');
  const callback = new URL(env.CITY_EDITOR_CALLBACK_URL);
  if (callback.protocol !== 'https:' || callback.pathname !== '/auth/callback') throw new Error('CITY_EDITOR_CALLBACK_URL must be HTTPS /auth/callback');
  const returnUrl = new URL(env.CITY_EDITOR_RETURN_URL);
  if (returnUrl.origin !== origin.origin || returnUrl.search || returnUrl.hash) throw new Error('CITY_EDITOR_RETURN_URL must be within CITY_EDITOR_ORIGIN');
  return {
    clientId: env.CITY_EDITOR_GITHUB_APP_CLIENT_ID, clientSecret: env.CITY_EDITOR_GITHUB_APP_CLIENT_SECRET,
    sessionSecret: env.CITY_EDITOR_SESSION_SECRET, origin: env.CITY_EDITOR_ORIGIN,
    callbackUrl: env.CITY_EDITOR_CALLBACK_URL, returnUrl: env.CITY_EDITOR_RETURN_URL, owner: 'edmondsonedits',
    repo: 'Peterborough-Map-Game', branch: 'main',
  };
}

export function createPublisherServer({ config = loadConfig(), fetchImpl = fetch, logger = console, now } = {}) {
  if (!config?.clientId || !config?.clientSecret || !config?.sessionSecret || !config?.origin || !config?.callbackUrl || !config?.returnUrl) throw new Error('Publisher configuration is incomplete');
  if (config.owner !== 'edmondsonedits') throw new Error('Publisher owner must be edmondsonedits');
  const auth = createAuth({ config, fetchImpl, now });
  const publisher = createGithubPublisher({ config, fetchImpl });

  function json(res, status, body, headers = {}) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }
  function cors(req) {
    return req.headers.origin === config.origin ? { 'access-control-allow-origin': config.origin, 'access-control-allow-credentials': 'true', vary: 'Origin' } : {};
  }
  function error(res, status, code, req) { json(res, status, { error: code }, cors(req)); }
  async function body(req) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 1024 * 1024) throw Object.assign(new Error('Too large'), { status: 413 });
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      if (req.headers.origin !== config.origin) return error(res, 403, 'origin_rejected', req);
      res.writeHead(204, { ...cors(req), 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, x-csrf-token', 'cache-control': 'no-store' });
      return res.end();
    }
    try {
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/auth/github') {
        const started = auth.begin();
        if (!started) return error(res, 429, 'auth_rate_limited', req);
        res.writeHead(302, { location: started.location, 'set-cookie': started.cookie, 'cache-control': 'no-store' });
        return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/auth/callback') {
        const result = await auth.complete(req, url.searchParams.get('state'), url.searchParams.get('code'));
        if (result?.forbidden) return error(res, 403, 'owner_required', req);
        if (!result) return error(res, 403, 'oauth_rejected', req);
        res.writeHead(302, { location: config.returnUrl, 'set-cookie': [result.cookie, 'publisher_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None'], 'cache-control': 'no-store' });
        return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/auth/status') {
        const active = auth.session(req);
        if (!active) return json(res, 200, { authenticated: false }, cors(req));
        const current = await publisher.currentSha(active.token);
        if (current.error) return error(res, current.error === 401 ? 401 : 502, current.error === 401 ? 'auth_required' : 'github_unavailable', req);
        return json(res, 200, { authenticated: true, csrfToken: active.csrfToken, baseRevision: current.sha, publishedDocument: current.document, expiresAt: new Date(active.expires).toISOString() }, cors(req));
      }
      if (req.method === 'POST' && url.pathname === '/api/scene/versions') {
        const active = auth.session(req);
        if (!active) return error(res, 401, 'auth_required', req);
        if (!auth.allowWrite(req, active)) return error(res, 403, 'write_rejected', req);
        if (!auth.consumeWrite(active)) return error(res, 429, 'rate_limited', req);
        let value;
        try { value = await body(req); } catch (cause) { return error(res, cause.status || 400, 'invalid_json', req); }
        if (!value || !shaPattern.test(value.baseRevision || '')) return error(res, 422, 'invalid_base_revision', req);
        const candidate = validateCandidate(value.document);
        if (!candidate.ok) return json(res, 422, { error: 'invalid_document', details: candidate.errors }, cors(req));
        const result = await publisher.publish(active.token, value.baseRevision, candidate);
        if (result.conflict) return json(res, 409, { error: 'stale_revision', currentRevision: result.currentRevision || null }, cors(req));
        if (result.error) return error(res, result.error === 401 ? 401 : 502, result.error === 401 ? 'auth_required' : 'github_unavailable', req);
        return json(res, 201, { commitSha: result.commitSha, state: 'saved' }, cors(req));
      }
      const statusMatch = url.pathname.match(/^\/api\/scene\/versions\/([0-9a-f]{40})\/status$/i);
      if (req.method === 'GET' && statusMatch) {
        const active = auth.session(req);
        if (!active) return error(res, 401, 'auth_required', req);
        if (req.headers.origin !== config.origin) return error(res, 403, 'origin_rejected', req);
        const result = await publisher.deployment(active.token, statusMatch[1]);
        if (result.error) return error(res, result.error === 401 ? 401 : 502, result.error === 401 ? 'auth_required' : 'github_unavailable', req);
        return json(res, 200, result, cors(req));
      }
      return error(res, 404, 'not_found', req);
    } catch {
      logger.error('City editor publisher request failed');
      return error(res, 502, 'publisher_failure', req);
    }
  });
  server.on('close', auth.dispose);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPublisherServer();
  server.listen(Number(process.env.PORT || 8787), '0.0.0.0');
}
