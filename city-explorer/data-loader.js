const nativeFetch = window.fetch.bind(window);
const moduleBase = new URL('./', import.meta.url);
let manifest = null;
let cachedOsmText = null;

try {
  const manifestResponse = await nativeFetch(new URL('data/manifest.json', moduleBase), { cache: 'no-store' });
  if (manifestResponse.ok) {
    manifest = await manifestResponse.json();
    const osmFile = manifest?.osm?.file;
    if (osmFile) {
      const osmResponse = await nativeFetch(new URL(`data/${osmFile}`, moduleBase), { cache: 'force-cache' });
      if (osmResponse.ok) cachedOsmText = await osmResponse.text();
    }
  }
} catch (error) {
  console.info('Deployment-time Peterborough assets are not available yet; live services will be used.', error);
}

if (manifest && cachedOsmText) {
  window.PETERBOROUGH_DATA_MANIFEST = manifest;

  window.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method === 'POST' && rawUrl && /\/api\/interpreter(?:$|\?)/.test(rawUrl)) {
      return new Response(cachedOsmText, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Peterborough-Data-Source': 'deployment-cache',
        },
      });
    }
    return nativeFetch(input, init);
  };

  const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (srcDescriptor?.get && srcDescriptor?.set && manifest?.terrain?.files?.length) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: srcDescriptor.configurable,
      enumerable: srcDescriptor.enumerable,
      get() {
        return srcDescriptor.get.call(this);
      },
      set(value) {
        let rewritten = value;
        const match = String(value).match(/\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png(?:\?.*)?$/);
        if (match) {
          rewritten = new URL(`data/terrain/${match[1]}/${match[2]}/${match[3]}.png`, moduleBase).href;
        }
        srcDescriptor.set.call(this, rewritten);
      },
    });
  }
}
