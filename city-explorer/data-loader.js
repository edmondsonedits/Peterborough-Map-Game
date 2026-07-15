const nativeFetch = window.fetch.bind(window);
const moduleBase = new URL('./', import.meta.url);

const cachedAssetPromise = (async () => {
  try {
    const manifestResponse = await nativeFetch(new URL('data/manifest.json', moduleBase), { cache: 'no-store' });
    if (!manifestResponse.ok) return null;
    const manifest = await manifestResponse.json();
    const osmFile = manifest?.osm?.file;
    if (!osmFile) return null;
    const osmResponse = await nativeFetch(new URL(`data/${osmFile}`, moduleBase), { cache: 'force-cache' });
    if (!osmResponse.ok) return null;
    const osmText = await osmResponse.text();
    window.PETERBOROUGH_DATA_MANIFEST = manifest;
    return { manifest, osmText };
  } catch (error) {
    console.info('Deployment-time Peterborough assets are not available yet; live services will be used.', error);
    return null;
  }
})();

window.fetch = async (input, init = {}) => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
  const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method === 'POST' && rawUrl && /\/api\/interpreter(?:$|\?)/.test(rawUrl)) {
    const cached = await cachedAssetPromise;
    if (cached?.osmText) {
      return new Response(cached.osmText, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Peterborough-Data-Source': 'deployment-cache',
        },
      });
    }
  }
  return nativeFetch(input, init);
};

const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
if (srcDescriptor?.get && srcDescriptor?.set) {
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: srcDescriptor.configurable,
    enumerable: srcDescriptor.enumerable,
    get() {
      return srcDescriptor.get.call(this);
    },
    set(value) {
      const original = String(value);
      const match = original.match(/\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png(?:\?.*)?$/);
      if (!match) {
        srcDescriptor.set.call(this, value);
        return;
      }

      const localUrl = new URL(`data/terrain/${match[1]}/${match[2]}/${match[3]}.png`, moduleBase).href;
      const useRemoteFallback = () => {
        this.removeEventListener('error', useRemoteFallback);
        if (srcDescriptor.get.call(this) !== original) srcDescriptor.set.call(this, original);
      };
      this.addEventListener('error', useRemoteFallback, { once: true });
      srcDescriptor.set.call(this, localUrl);
    },
  });
}
