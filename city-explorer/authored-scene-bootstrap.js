import { CitySplatLayer } from './city-splat-layer.js?v=1.5.5-hybrid1';
import {
  authoredSceneDiagnostics,
  initializeAuthoredScene,
  registerAuthoredSceneWorldBridge,
} from './authored-scene-runtime.js?v=1.6.79';

const PATCH_FLAG = Symbol.for('ptbo.authored-scene.city-splat-bridge.v1');

if (!CitySplatLayer.prototype[PATCH_FLAG]) {
  const originalInitialize = CitySplatLayer.prototype.initialize;
  CitySplatLayer.prototype.initialize = async function patchedInitialize(...args) {
    registerAuthoredSceneWorldBridge({
      THREE: this.THREE,
      scene: this.scene,
      project: this.project,
      terrainHeightAtWorld: this.terrainHeightAtWorld,
    });
    return originalInitialize.apply(this, args);
  };
  Object.defineProperty(CitySplatLayer.prototype, PATCH_FLAG, { value: true });
}

function authoredEnabled() {
  try { return new URLSearchParams(globalThis.location?.search || '').get('authored') === '1'; }
  catch { return false; }
}

if (authoredEnabled() && globalThis.document?.documentElement) {
  const root = document.documentElement;
  let started = false;
  const startWhenGameplayAssetsReady = () => {
    if (started) return;
    const actorsReady = root.dataset.gameplayReady === 'true'
      && Boolean(root.dataset.firefighterAsset)
      && Boolean(root.dataset.pumperAsset);
    if (!actorsReady) return;
    started = true;
    observer.disconnect();
    initializeAuthoredScene().then(status => {
      if (status.status === 'ready') console.info(`Editor-authored detail layer ready: ${status.count} proxy object(s).`);
    });
  };
  const observer = new MutationObserver(startWhenGameplayAssetsReady);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['data-gameplay-ready', 'data-firefighter-asset', 'data-pumper-asset'],
  });
  startWhenGameplayAssetsReady();
  globalThis.addEventListener?.('pagehide', () => globalThis.__PTBO_AUTHORED_SCENE__?.dispose?.(), { once: true });
} else {
  authoredSceneDiagnostics();
}
