/* =========================================================
   BEGINNER CODE GUIDE — 3D EXPLORER DATA LOADER

   PURPOSE:
   Prefer prepared Peterborough map and terrain files stored with the deployment,
   while preserving the explorer's original live-network requests as fallbacks.

   WHAT THE PLAYER EXPERIENCES:
   The 3D city can load faster and more reliably from cached assets. Missing local
   data does not automatically break the explorer because remote services are
   still attempted.

   IMPORTANT DESIGN RULE:
   This file intercepts only two known request patterns. Every unrelated fetch or
   image URL is passed through unchanged.

   Comments are ignored by the browser and do not affect loading.
   ========================================================= */

/*
ORIGINAL FETCH REFERENCE:
window.fetch will be replaced later in this file. Saving a bound copy first gives
the replacement a way to make ordinary requests without calling itself forever.
*/
const nativeFetch = window.fetch.bind(window);

async function nativeFetchWithTimeout(input, init = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await nativeFetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

// import.meta.url is this module's full URL; './' becomes its folder.
const moduleBase = new URL('./', import.meta.url);

/*
CACHED ASSET PROMISE:
This asynchronous task starts immediately and runs once.

WHAT IT DOES:
1. Requests data/manifest.json without accepting a stale manifest.
2. Reads the prepared OSM filename from manifest.osm.file.
3. Requests that OSM data with the manifest generation value in its URL, so a
   refreshed city cannot be mistaken for a same-named stale cache entry.
4. Stores the manifest publicly for diagnostics.
5. Keeps the raw OSM text only until the explorer's first map request, then
   releases the duplicate string after constructing the response body.

FALLBACK:
Any missing field, unsuccessful response, or thrown error returns null. The custom
fetch below then lets the original live service handle the request.
*/
let cachedOsmText = null;
const cachedAssetPromise = (async () => {
  try {
    window.__PTBO_EXPLORER_BOOTSTRAP__?.touch?.('checking packaged city data');
    const manifestResponse = await nativeFetchWithTimeout(new URL('data/manifest.json', moduleBase), { cache: 'no-store' }, 15000);
    if (!manifestResponse.ok) return null;

    const manifest = await manifestResponse.json();
    const osmFile = manifest?.osm?.file;
    if (!osmFile) return null;

    const osmUrl = new URL(`data/${osmFile}`, moduleBase);
    osmUrl.searchParams.set('v', String(manifest.generated_at || 'current'));
    window.__PTBO_EXPLORER_BOOTSTRAP__?.touch?.('downloading packaged street and building geometry');
    const osmResponse = await nativeFetchWithTimeout(osmUrl, { cache: 'force-cache' }, 60000);
    if (!osmResponse.ok) return null;

    cachedOsmText = await osmResponse.text();
    window.__PTBO_EXPLORER_BOOTSTRAP__?.touch?.('packaged city geometry ready');
    window.PETERBOROUGH_DATA_MANIFEST = manifest;
    return { manifest };
  } catch (error) {
    console.info('Deployment-time Peterborough assets are not available yet; live services will be used.', error);
    return null;
  }
})();

/*
CUSTOM FETCH WRAPPER:
The explorer's city-data code makes a POST request whose URL ends with
/api/interpreter. That request normally reaches a live geospatial interpreter.

When prepared OSM text exists, this wrapper returns a synthetic successful
Response containing the local text. The calling code receives the same kind of
object it expected from the network and does not need separate cached/live paths.

All other requests go directly to nativeFetch with their original arguments.
*/
window.fetch = async (input, init = {}) => {
  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input?.url;

  const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

  if (method === 'POST' && rawUrl && /\/api\/interpreter(?:$|\?)/.test(rawUrl)) {
    const cached = await cachedAssetPromise;
    if (cached && cachedOsmText) {
      // A Response owns its body after construction, so release our duplicate
      // ~25 MB JavaScript string immediately. This materially lowers city-load
      // peak memory on laptops and mobile devices.
      const responseText = cachedOsmText;
      cachedOsmText = null;
      return new Response(responseText, {
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

/*
TERRAIN IMAGE INTERCEPTION:
Terrarium elevation tiles are loaded through normal HTML Image elements rather
than fetch(). To prefer local terrain without rewriting the larger explorer, this
code wraps the built-in HTMLImageElement.src property.

TECHNICAL TERM — PROPERTY DESCRIPTOR:
A descriptor contains the browser's original getter and setter functions for a
property. The wrapper calls those original functions after deciding which URL to
use.
*/
const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');

if (srcDescriptor?.get && srcDescriptor?.set) {
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: srcDescriptor.configurable,
    enumerable: srcDescriptor.enumerable,

    // Reading image.src should continue using the browser's original behaviour.
    get() {
      return srcDescriptor.get.call(this);
    },

    /*
    WRAPPED SETTER:
    1. Convert the requested value to text.
    2. Look for a URL ending in /terrarium/zoom/x/y.png.
    3. If it is not a terrain tile, set the original URL immediately.
    4. For terrain, try data/terrain/zoom/x/y.png first.
    5. Attach a one-time error handler that restores the original remote URL if
       the local file is missing or invalid.

    PLAYER CONNECTION:
    Local files improve predictable startup; remote fallback prevents a missing
    prepared tile from becoming a permanent hole in the terrain.
    */
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
        if (srcDescriptor.get.call(this) !== original) {
          srcDescriptor.set.call(this, original);
        }
      };

      this.addEventListener('error', useRemoteFallback, { once: true });
      srcDescriptor.set.call(this, localUrl);
    },
  });
}
