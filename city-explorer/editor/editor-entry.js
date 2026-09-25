const PRIVATE_EDITOR_URL = 'https://peterborough-3d-map-editor-preview.dans-host.chatgpt.site/city-explorer/?editor=1';

export async function authorizeEditorEntry({
  pageUrl = globalThis.location.href,
  publisherUrl,
  fetchImpl = globalThis.fetch,
  redirect = (url) => globalThis.location.assign(url),
} = {}) {
  if (publisherUrl?.trim()) {
    try {
      const base = publisherUrl.trim().replace(/\/$/, '');
      const response = await fetchImpl(`${base}/auth/status`, { credentials: 'include' });
      if (response.status === 401) { redirect(`${base}/auth/github`); return false; }
      if (!response.ok) return false;
      if ((await response.json()).authenticated === true) return true;
      redirect(`${base}/auth/github`);
      return false;
    } catch {
      return false;
    }
  }

  const page = new URL(pageUrl);
  const privateEditor = new URL(PRIVATE_EDITOR_URL);
  if (page.origin === privateEditor.origin && page.pathname === privateEditor.pathname && page.searchParams.get('editor') === '1') return true;
  if (page.hostname === 'edmondsonedits.github.io') redirect(PRIVATE_EDITOR_URL);
  return false;
}
