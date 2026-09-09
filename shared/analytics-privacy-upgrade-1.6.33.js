/* Privacy, department-context, and secure-stats policy for Emergency Games v1.6.40. */
(() => {
  'use strict';
  const VERSION = '1.6.40';
  if (window.top !== window || window.PTBO_ANALYTICS_PRIVACY?.version === VERSION) return;

  const DEPARTMENT_KEY = 'ptbo-deployment-department-v1';
  const RECORDED_SESSION_KEY = 'ptbo-department-recorded-session-v1';
  const BASE_TRACKING_BLOCK_KEY = 'ptbo-emergency-stats-mode';
  const PRIVACY_BLOCK_MARKER = 'ptbo-privacy-blocked-base-analytics-v1';
  const LEGACY_PERSISTENT_KEYS = [
    'ptbo-site-visitor-id-v1',
    'ptbo-site-visitor-first-v2',
    'ptbo-site-visitor-sessions-v2',
  ];
  const TRACKING_METHOD = /^(?:record|track)/i;
  const RETENTION_DAYS = 180;

  const slug = value => String(value || 'public_demo').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'public_demo';
  const safeGet = (storage, key) => { try { return storage.getItem(key); } catch (_) { return null; } };
  const safeSet = (storage, key, value) => { try { storage.setItem(key, String(value)); return true; } catch (_) { return false; } };
  const safeRemove = (storage, key) => { try { storage.removeItem(key); } catch (_) {} };

  function deploymentConfig() {
    return window.PTBO_DEPLOYMENT && typeof window.PTBO_DEPLOYMENT === 'object' ? window.PTBO_DEPLOYMENT : {};
  }

  function department() {
    // Department identity is trusted deployment context, never a browser URL or
    // previously persisted local value. Clear the old client-controlled value
    // so v1.6.33-v1.6.39 spoofed labels cannot carry into new sessions.
    safeRemove(localStorage, DEPARTMENT_KEY);
    return slug(deploymentConfig().department || 'public_demo');
  }

  function departmentDeployment() {
    const deployment = deploymentConfig();
    const mode = String(deployment.mode || '').toLowerCase();
    return deployment.commercial === true || deployment.private === true || mode === 'department' || mode === 'commercial' || mode === 'private';
  }

  function deploymentAnalyticsPermitted() {
    const deployment = deploymentConfig();
    if (typeof deployment.analyticsEnabled === 'boolean') return deployment.analyticsEnabled;
    return !departmentDeployment();
  }

  function userOptedOut() {
    const query = new URLSearchParams(location.search).get('analytics');
    if (/^(?:off|false|0)$/i.test(String(query || ''))) return true;
    if (window.PTBO_ANALYTICS_CONFIG?.enabled === false) return true;
    return false;
  }

  function analyticsEnabled() {
    return deploymentAnalyticsPermitted() && !userOptedOut();
  }

  function purgePersistentPlayerIdentity() {
    LEGACY_PERSISTENT_KEYS.forEach(key => safeRemove(localStorage, key));
    safeRemove(localStorage, DEPARTMENT_KEY);
  }

  function setBaseTrackingBlock(blocked) {
    const marker = safeGet(sessionStorage, PRIVACY_BLOCK_MARKER);
    if (blocked) {
      if (!marker) safeSet(sessionStorage, PRIVACY_BLOCK_MARKER, safeGet(localStorage, BASE_TRACKING_BLOCK_KEY) ?? '__absent__');
      safeSet(localStorage, BASE_TRACKING_BLOCK_KEY, 'enabled');
      return;
    }
    if (!marker) return;
    if (marker === '__absent__') safeRemove(localStorage, BASE_TRACKING_BLOCK_KEY);
    else safeSet(localStorage, BASE_TRACKING_BLOCK_KEY, marker);
    safeRemove(sessionStorage, PRIVACY_BLOCK_MARKER);
  }

  function secureStatsLoader() {
    const secure = window.PTBO_SECURE_ANALYTICS;
    if (secure && typeof secure.loadStats === 'function') return secure.loadStats.bind(secure);
    return async () => {
      throw new Error('Secure analytics backend is not configured. Direct browser Firestore reads are disabled by the privacy policy.');
    };
  }

  function summarizeDepartments(stats) {
    const departments = {};
    for (const [key, value] of Object.entries(stats?.launches || {})) {
      if (!key.startsWith('department_')) continue;
      const name = key.slice('department_'.length) || 'public_demo';
      departments[name] = (departments[name] || 0) + Number(value || 0);
    }
    return departments;
  }

  function enhanceAnalyticsApi() {
    const base = window.PTBO_SITE_ANALYTICS;
    if (!base || base.privacyUpgradeVersion === VERSION) return base;

    const guardedMethods = {};
    for (const [name, value] of Object.entries(base)) {
      if (typeof value === 'function' && TRACKING_METHOD.test(name)) {
        guardedMethods[name] = (...args) => analyticsEnabled() ? value(...args) : false;
      }
    }

    const loadSecureStats = secureStatsLoader();
    const enhanced = Object.freeze({
      ...base,
      ...guardedMethods,
      version:VERSION,
      privacyUpgradeVersion:VERSION,
      trackingAllowed:() => analyticsEnabled() && Boolean(base.trackingAllowed?.()),
      loadStats:async () => {
        const stats = await loadSecureStats();
        const departments = summarizeDepartments(stats);
        const publicDemoSessions = Number(departments.public_demo || 0);
        const departmentSessions = Object.entries(departments).filter(([key]) => key !== 'public_demo').reduce((sum, [, value]) => sum + Number(value || 0), 0);
        return Object.freeze({
          ...stats,
          departments:Object.freeze(departments),
          departmentCount:Object.keys(departments).filter(key => key !== 'public_demo').length,
          departmentSessions,
          publicDemoSessions,
          playerSessions:Number(stats?.sessions || 0),
          persistentCrossVisitPlayerId:false,
          privacyUpgradeVersion:VERSION,
        });
      },
      health:() => Object.freeze({
        ...(base.health?.() || {}),
        version:VERSION,
        department:department(),
        departmentSource:deploymentConfig().department ? 'deployment' : 'public_demo',
        departmentDeployment:departmentDeployment(),
        analyticsPermitted:deploymentAnalyticsPermitted(),
        analyticsEnabled:analyticsEnabled(),
        browserCanEnableAnalytics:false,
        browserCanOverrideDepartment:false,
        persistentCrossVisitPlayerId:false,
        retentionDays:RETENTION_DAYS,
        secureStatsBackend:Boolean(window.PTBO_SECURE_ANALYTICS?.loadStats),
      }),
    });
    window.PTBO_SITE_ANALYTICS = enhanced;
    return enhanced;
  }

  function registerDepartment() {
    const api = window.PTBO_SITE_ANALYTICS;
    if (!analyticsEnabled() || !api?.trackingAllowed?.()) return;
    const health = api.health?.() || {};
    const sessionId = String(health.sessionId || '');
    const marker = safeGet(sessionStorage, RECORDED_SESSION_KEY);
    if (sessionId && marker === sessionId) return;
    api.recordLaunch?.(`department_${department()}`);
    if (sessionId) safeSet(sessionStorage, RECORDED_SESSION_KEY, sessionId);
  }

  function applyPolicy() {
    purgePersistentPlayerIdentity();
    setBaseTrackingBlock(!analyticsEnabled());
    enhanceAnalyticsApi();
    registerDepartment();
    return true;
  }

  function setEnabled(enabled) {
    // Browser/runtime controls are allowed to reduce collection, never to exceed
    // the deployment policy. A department deployment configured with analytics
    // disabled remains disabled even if code or a URL attempts to turn it on.
    window.PTBO_ANALYTICS_CONFIG = Object.freeze({ ...(window.PTBO_ANALYTICS_CONFIG || {}), enabled:Boolean(enabled) });
    setBaseTrackingBlock(!analyticsEnabled());
    applyPolicy();
    return analyticsEnabled();
  }

  /* Run before the base client when possible. In department/private mode this
     prevents the legacy analytics client from emitting its initial visitor/session write. */
  purgePersistentPlayerIdentity();
  setBaseTrackingBlock(!analyticsEnabled());

  window.PTBO_ANALYTICS_PRIVACY = Object.freeze({
    version:VERSION,
    department,
    departmentDeployment,
    deploymentAnalyticsPermitted,
    analyticsEnabled,
    setEnabled,
    purgePersistentPlayerIdentity,
    persistentCrossVisitPlayerId:false,
    browserCanEnableAnalytics:false,
    browserCanOverrideDepartment:false,
    retentionDays:RETENTION_DAYS,
    collected:'trusted department/deployment context, session duration, surface/browser buckets, city/service use, calls, aggregate response timing, feature/control use, driving totals, and reliability events',
    excluded:'names, emails, exact routes/coordinates, prompts, room codes, browser-supplied department identity, and cross-visit player/browser identity',
    note:'Deployment policy is authoritative. Browser/query input may opt out of analytics but cannot enable collection beyond deployment policy or change the trusted department.',
  });

  if (window.PTBO_SITE_ANALYTICS) applyPolicy();
  else {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.PTBO_SITE_ANALYTICS) { clearInterval(timer); applyPolicy(); }
      else if (attempts >= 120) clearInterval(timer);
    }, 100);
  }

  addEventListener('pagehide', () => {
    purgePersistentPlayerIdentity();
    if (!departmentDeployment()) setBaseTrackingBlock(false);
  }, { once:true });
})();
