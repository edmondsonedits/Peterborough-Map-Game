import { serializeSceneDocument, validatePublishableSceneDocument } from './scene-document.js';

export function createVersionSaver({ serviceUrl, publishedDocument, draftStore, fetchImpl = fetch, onState = () => {}, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), maxPolls = 5 }) {
  const base = serviceUrl?.replace(/\/$/, '');
  let baseline = publishedDocument;
  function state(name, extra = {}) { const value = { name, ...extra }; onState(value); return { state: name, ...extra }; }

  async function save(document) {
    const scheduled = draftStore.saveDraft(document, { baseRevision: baseline.revision, baseDocument: baseline });
    const local = scheduled.status === 'scheduled' ? draftStore.flush() : scheduled;
    if (local.status !== 'saved') return state('failed', { reason: 'local-draft' });
    if (!base) return state('failed', { reason: 'unconfigured' });
    if (!validatePublishableSceneDocument(document).ok) return state('failed', { reason: 'invalid-document' });
    try {
      const statusResponse = await fetchImpl(`${base}/auth/status`, { credentials: 'include' });
      if (statusResponse.status === 401) return state('auth-expired');
      if (!statusResponse.ok) return state('failed');
      const status = await statusResponse.json();
      if (!status.authenticated) return state('auth-expired');
      if (serializeSceneDocument(status.publishedDocument) !== serializeSceneDocument(baseline)) return state('conflict');
      const response = await fetchImpl(`${base}/api/scene/versions`, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': status.csrfToken },
        body: JSON.stringify({ baseRevision: status.baseRevision, document }),
      });
      if (response.status === 401) return state('auth-expired');
      if (response.status === 409) return state('conflict');
      if (!response.ok) return state('failed');
      const { commitSha } = await response.json();
      if (!/^[0-9a-f]{40}$/i.test(commitSha || '')) return state('failed');
      baseline = document;
      const rebased = draftStore.setBaseDocument?.(baseline, { rebaseDraft: true });
      const recoveryState = rebased && !['saved', 'base-updated'].includes(rebased.status)
        ? { localDraftRecoveryUnavailable: true } : {};
      state('saved', { commitSha, ...recoveryState });
      try {
        for (let index = 0; index < maxPolls; index++) {
          if (index) await wait(Math.min(1000 * 2 ** (index - 1), 8000));
          const deployment = await fetchImpl(`${base}/api/scene/versions/${commitSha}/status`, { credentials: 'include' });
          if (deployment.status === 401) return state('auth-expired', { commitSha, ...recoveryState });
          if (!deployment.ok) return state('saved', { commitSha, deploymentStatus: 'unavailable', ...recoveryState });
          const { state: deploymentState } = await deployment.json();
          if (deploymentState === 'live') return state('live', { commitSha, ...recoveryState });
          if (deploymentState === 'failed') return state('failed', { commitSha, ...recoveryState });
          state('deploying', { commitSha, ...recoveryState });
        }
      } catch {
        return state('saved', { commitSha, deploymentStatus: 'unavailable', ...recoveryState });
      }
      return state('deploying', { commitSha, ...recoveryState });
    } catch {
      return state('failed');
    }
  }

  return { save };
}
