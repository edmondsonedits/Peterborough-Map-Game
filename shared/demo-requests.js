/* Explicit demo requests use the private feedback inbox. Retire obsolete device counts. */
(() => {
  'use strict';
  // Delete only this retired feature's data when an updated page is loaded.
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const storage = window[name];
      storage.removeItem('ptbo-demo-requests-v1');
      storage.removeItem('ptbo-demo-request-session-v1');
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key?.startsWith('ptbo-device-demo-request-v1:') || key?.startsWith('ptbo-demo-request-v1:')) storage.removeItem(key);
      }
    } catch (_) { /* Private feedback does not depend on browser counters. */ }
  }
  if (window.PTBO_DEMO_REQUESTS) return;
  const modes = ['geo', 'route', 'dispatch', 'explorer'];
  const cityFor = city => window.PTBO_CITIES?.find(item => item.id === city);
  const feedback = async () => window.PTBO_FEEDBACK || await window.PTBO_FEEDBACK_READY;
  function requestStatus(city, mode, requestType = 'demo') {
    return window.PTBO_FEEDBACK?.demoRequestStatus?.(city, mode, ...(requestType === 'full-version' ? [requestType] : [])) || { remoteSaved:false };
  }
  async function recordDemoRequest(city, mode, requestType = 'demo') {
    const entry = cityFor(city);
    if (!entry || !modes.includes(mode) || !['demo','full-version'].includes(requestType)) return false;
    const api = await feedback();
    if (!api?.requestDemo) return false;
    return Boolean(await api.requestDemo({ city, cityName:entry.name, mode, ...(requestType === 'full-version' ? {requestType} : {}) }));
  }
  async function openConversation(city, mode, requestType = 'demo') {
    const api = await feedback();
    if (!api?.openDemoConversation) throw new Error('Feedback is unavailable. Please try again.');
    return api.openDemoConversation(city, mode, ...(requestType === 'full-version' ? [requestType] : []));
  }
  window.PTBO_DEMO_REQUESTS = Object.freeze({ recordDemoRequest, requestStatus, openConversation });
})();
