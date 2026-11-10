import {
  authoredSceneDiagnostics,
  initializeAuthoredScene,
} from './authored-scene-runtime.js?v=1.6.206';

function authoredSceneStartupReady({ gameplayReady, bridgeReady }) {
  return gameplayReady === true && bridgeReady === true;
}

function authoredEnabled() {
  try { return new URLSearchParams(globalThis.location?.search || '').get('authored') === '1'; }
  catch { return false; }
}

if (authoredEnabled() && globalThis.document?.documentElement) {
  const root = document.documentElement;
  let started = false;
  const startWhenGameplayReady = () => {
    if (started) return;
    const bridgeReady = globalThis.__PTBO_AUTHORED_SCENE__?.status?.().bridgeReady === true;
    if (!authoredSceneStartupReady({ gameplayReady: root.dataset.gameplayReady === 'true', bridgeReady })) return;
    started = true;
    observer.disconnect();
    initializeAuthoredScene().then(status => {
      if (status.status === 'ready') console.info(`Editor-authored detail layer ready: ${status.count} proxy object(s).`);
    });
  };
  const observer = new MutationObserver(startWhenGameplayReady);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['data-gameplay-ready', 'data-firefighter-asset', 'data-pumper-asset'],
  });
  startWhenGameplayReady();
  globalThis.addEventListener?.('pagehide', () => globalThis.__PTBO_AUTHORED_SCENE__?.dispose?.(), { once: true });
} else {
  authoredSceneDiagnostics();
}
