import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const lifetimeMs = 8 * 60 * 60 * 1000;
const random = () => randomBytes(32).toString('hex');

export function createAuth({ config, fetchImpl, now = () => Date.now() }) {
  const sessions = new Map();
  const pendingStates = new Map();
  const secret = config.sessionSecret;
  const sign = (value) => createHmac('sha256', secret).update(value).digest('hex');
  const cookie = (name, value, maxAge) => `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;

  function begin() {
    const state = random();
    pendingStates.set(state, now() + 10 * 60 * 1000);
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.callbackUrl);
    url.searchParams.set('state', state);
    return { location: url.href, cookie: cookie('publisher_oauth_state', `${state}.${sign(state)}`, 600) };
  }

  function readCookie(req, name) {
    const raw = req.headers.cookie || '';
    const item = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return item?.slice(name.length + 1) || null;
  }

  function validSignature(value, signature) {
    if (!/^[0-9a-f]{64}$/.test(signature || '')) return false;
    return timingSafeEqual(Buffer.from(sign(value), 'hex'), Buffer.from(signature, 'hex'));
  }

  async function complete(req, state, code) {
    const [cookieState, signature] = (readCookie(req, 'publisher_oauth_state') || '').split('.');
    const expiry = pendingStates.get(state);
    if (!state || !code || state !== cookieState || !validSignature(state, signature) || !expiry || expiry < now()) return null;
    pendingStates.delete(state);
    const tokenResponse = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.callbackUrl }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenResponse.ok) return null;
    const data = await tokenResponse.json();
    if (typeof data.access_token !== 'string' || !data.access_token) return null;
    const userResponse = await fetchImpl('https://api.github.com/user', {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${data.access_token}`, 'user-agent': 'city-editor-publisher' },
      signal: AbortSignal.timeout(10000),
    });
    if (!userResponse.ok) return null;
    const user = await userResponse.json();
    if (typeof user.login !== 'string' || user.login.toLowerCase() !== 'edmondsonedits') return { forbidden: true };
    const id = random();
    const expires = now() + lifetimeMs;
    const csrfToken = random();
    sessions.set(id, { token: data.access_token, csrfToken, expires, writes: [] });
    return { cookie: cookie('publisher_session', `${id}.${sign(`${id}.${expires}`)}.${expires}`, lifetimeMs / 1000), expires };
  }

  function session(req) {
    const [id, signature, rawExpiry] = (readCookie(req, 'publisher_session') || '').split('.');
    const expires = Number(rawExpiry);
    if (!/^[0-9a-f]{64}$/.test(id || '') || !Number.isSafeInteger(expires) || expires <= now() || !validSignature(`${id}.${expires}`, signature)) return null;
    const stored = sessions.get(id);
    if (!stored || stored.expires !== expires) return null;
    return { id, ...stored };
  }

  function allowWrite(req, active) {
    if (req.headers.origin !== config.origin) return false;
    const provided = req.headers['x-csrf-token'];
    return typeof provided === 'string' && /^[0-9a-f]{64}$/.test(provided)
      && timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(active.csrfToken, 'hex'));
  }

  function consumeWrite(active) {
    const stored = sessions.get(active.id);
    stored.writes = stored.writes.filter((when) => when > now() - 60 * 1000);
    if (stored.writes.length >= 6) return false;
    stored.writes.push(now());
    return true;
  }

  return { begin, complete, session, allowWrite, consumeWrite };
}
