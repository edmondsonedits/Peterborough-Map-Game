const scenePath = 'city-explorer/data/editor/peterborough-details.json';
const shaPattern = /^[0-9a-f]{40}$/i;
import { validateSceneDocument } from '../city-explorer/editor/scene-document.js';

export function createGithubPublisher({ config, fetchImpl }) {
  const repoUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  async function github(path, token, options = {}) {
    return fetchImpl(`${repoUrl}${path}`, {
      ...options,
      headers: {
        accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28', 'user-agent': 'city-editor-publisher',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });
  }

  async function currentSha(token) {
    const response = await github(`/contents/${scenePath}?ref=${encodeURIComponent(config.branch)}`, token);
    if (!response.ok) return { error: response.status };
    const data = await response.json();
    if (!shaPattern.test(data.sha || '') || data.encoding !== 'base64' || typeof data.content !== 'string') return { error: 502 };
    try {
      const decoded = JSON.parse(Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8'));
      const validated = validateSceneDocument(decoded);
      return validated.ok ? { sha: data.sha, document: validated.document } : { error: 502 };
    } catch { return { error: 502 }; }
  }

  async function publish(token, baseRevision, candidate) {
    const current = await currentSha(token);
    if (current.error) return { error: current.error };
    if (current.sha !== baseRevision) return { conflict: true, currentRevision: current.sha };
    const response = await github(`/contents/${scenePath}`, token, {
      method: 'PUT',
      body: JSON.stringify({ message: `Edit Peterborough city ${candidate.document.updatedAt}`, content: Buffer.from(candidate.serialized).toString('base64'), sha: baseRevision, branch: config.branch }),
    });
    if (response.status === 409) return { conflict: true };
    if (!response.ok) return { error: response.status };
    const data = await response.json();
    return shaPattern.test(data.commit?.sha || '') ? { commitSha: data.commit.sha, contentSha: data.content?.sha || null } : { error: 502 };
  }

  async function deployment(token, commitSha) {
    const response = await github(`/deployments?sha=${commitSha}&environment=github-pages&per_page=1`, token);
    if (!response.ok) return { error: response.status };
    const deployments = await response.json();
    const match = deployments.find((item) => item.sha === commitSha && item.environment === 'github-pages');
    if (!match) return { state: 'deploying' };
    const statuses = await github(`/deployments/${match.id}/statuses?per_page=1`, token);
    if (!statuses.ok) return { error: statuses.status };
    const latest = (await statuses.json())[0]?.state;
    if (latest === 'success') return { state: 'live' };
    if (latest === 'failure' || latest === 'error') return { state: 'failed' };
    return { state: 'deploying' };
  }

  return { currentSha, publish, deployment };
}
