export const RELEASE = Object.freeze({
  version: '1.1.2',
  id: 'architecture-foundation',
  label: 'Architecture foundation'
});

export function applyReleaseIdentity(root = document) {
  const version = root?.getElementById?.('version-text');
  const eyebrow = root?.querySelector?.('.start-card .eyebrow');
  if (version) version.textContent = `${RELEASE.label} ${RELEASE.version}`;
  if (eyebrow) eyebrow.textContent = `${RELEASE.label} · v${RELEASE.version}`;
  if (root?.documentElement) root.documentElement.dataset.release = `${RELEASE.version}-${RELEASE.id}`;
  if (root && 'title' in root) root.title = 'Peterborough Fire Response: Street Shift — Architecture Foundation';
}
