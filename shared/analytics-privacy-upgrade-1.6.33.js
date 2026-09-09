/* Privacy and department-context upgrade layered on the existing analytics client. */
(() => {
  'use strict';
  const VERSION = '1.6.33';
  if (window.top !== window || window.PTBO_ANALYTICS_PRIVACY?.version === VERSION) return;

  const DEPARTMENT_KEY = 'ptbo-deployment-department-v1';
  const RECORDED_SESSION_KEY = 'ptbo-department-recorded-session-v1';
  const LEGACY_PERSISTENT_KEYS = [
    'ptbo-site-visitor-id-v1',
    'ptbo-site-visitor-first-v2',
    'ptbo-site-visitor-sessions-v2',
  ];
  const slug = value => String(value || 'public_demo').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'public_demo';
  const safeGet = (storage, key) => { try { return storage.getItem(key); } catch (_) { return null; } };
  const safeSet = (storage, key, value) => { try { storage.setItem(key, String(value)); } catch (_) {} };
  const safeRemove = (storage, key) => { try { storage.removeItem(key); } catch (_) {} };

  function department() {
    const params = new URLSearchParams(location.search);
    const requested = params.get('dept') || params.get('department');
    if (requested) safeSet(localStorage, DEPARTMENT_KEY, slug(requested));
    return slug(requested || safeGet(localStorage, DEPARTMENT_KEY) || window.PTBO_DEPLOYMENT?.department || 'public_demo');
  }

  function purgePersistentPlayerIdentity() {
    LEGACY_PERSISTENT_KEYS.forEach(key => safeRemove(localStorage, key));
  }

  function registerDepartment() {
    const api = window.PTBO_SITE_ANALYTICS;
    if (!api?.trackingAllowed?.()) return;
    const health = api.health?.() || {};
    const sessionId = String(health.sessionId || '');
    const marker = safeGet(sessionStorage, RECORDED_SESSION_KEY);
    if (sessionId && marker === sessionId) return;
    api.recordLaunch?.(`department_${department()}`);
    if (sessionId) safeSet(sessionStorage, RECORDED_SESSION_KEY, sessionId);
  }

  function install() {
    purgePersistentPlayerIdentity();
    registerDepartment();
    addEventListener('pagehide', purgePersistentPlayerIdentity, { once:true });
    return true;
  }

  window.PTBO_ANALYTICS_PRIVACY = Object.freeze({
    version:VERSION,
    department,
    purgePersistentPlayerIdentity,
    persistentCrossVisitPlayerId:false,
    note:'Department is retained as deployment context; player/browser identity is not retained in localStorage between visits.',
  });

  if (window.PTBO_SITE_ANALYTICS) install();
  else {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.PTBO_SITE_ANALYTICS) { clearInterval(timer); install(); }
      else if (attempts >= 40) clearInterval(timer);
    }, 100);
  }
})();
