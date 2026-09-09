/* Shared map-provider attribution controller for Emergency Games v1.6.35. */
(() => {
  'use strict';
  const VERSION = '1.6.35';
  if (window.PTBO_MAP_ATTRIBUTION?.version === VERSION) return;

  const PROVIDERS = Object.freeze({
    esri: Object.freeze({
      id:'esri',
      label:'Esri World Imagery',
      html:'Sources: <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a>, Maxar, Earthstar Geographics, GIS User Community · Labels © Esri',
    }),
    carto: Object.freeze({
      id:'carto',
      label:'CARTO basemap',
      html:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · © <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>',
    }),
    osm: Object.freeze({
      id:'osm',
      label:'OpenStreetMap',
      html:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    }),
  });

  const installedDocuments = new WeakMap();
  const wiredFrames = new WeakSet();

  function visibleTileUrls(doc) {
    try {
      return [...doc.querySelectorAll('.leaflet-tile[src], .leaflet-tile-layer img[src]')]
        .filter(tile => {
          const style = doc.defaultView?.getComputedStyle?.(tile);
          return !style || (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0);
        })
        .map(tile => String(tile.currentSrc || tile.src || ''))
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function providerForDocument(doc) {
    const urls = visibleTileUrls(doc);
    if (urls.some(url => /arcgisonline\.com|arcgis\.com/i.test(url))) return PROVIDERS.esri;
    if (urls.some(url => /cartocdn\.com/i.test(url))) return PROVIDERS.carto;
    if (urls.some(url => /tile\.openstreetmap\.org/i.test(url))) return PROVIDERS.osm;

    const existing = doc.querySelector('.leaflet-control-attribution')?.textContent || '';
    if (/\bEsri\b|Maxar|Earthstar/i.test(existing)) return PROVIDERS.esri;
    if (/\bCARTO\b/i.test(existing)) return PROVIDERS.carto;
    if (/OpenStreetMap/i.test(existing)) return PROVIDERS.osm;
    return null;
  }

  function ensureStyle(doc) {
    if (doc.getElementById('ptbo-map-attribution-style')) return;
    const style = doc.createElement('style');
    style.id = 'ptbo-map-attribution-style';
    style.textContent = `
      .leaflet-control-attribution{
        pointer-events:auto!important;user-select:text!important;max-width:min(74vw,560px)!important;
        padding:3px 6px!important;border-radius:4px 0 0 0!important;
        background:rgba(255,255,255,.90)!important;color:#1f2937!important;
        font:600 10px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif!important;
        white-space:normal!important;text-align:right!important;
      }
      .leaflet-control-attribution a{
        pointer-events:auto!important;color:#075985!important;text-decoration:underline!important;
        text-underline-offset:2px!important;cursor:pointer!important;
      }
      .leaflet-control-attribution a:hover,.leaflet-control-attribution a:focus-visible{
        color:#0c4a6e!important;outline:2px solid #38bdf8;outline-offset:1px;
      }
      @media(max-width:520px){.leaflet-control-attribution{max-width:82vw!important;font-size:8px!important;padding:2px 4px!important}}
    `;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function syncAttribution(doc) {
    const control = doc.querySelector('.leaflet-control-attribution');
    if (!control) return false;
    const provider = providerForDocument(doc);
    if (!provider) return false;
    ensureStyle(doc);
    if (control.dataset.ptboProvider !== provider.id || control.dataset.ptboAttributionVersion !== VERSION) {
      control.innerHTML = provider.html;
      control.dataset.ptboProvider = provider.id;
      control.dataset.ptboAttributionVersion = VERSION;
      control.setAttribute('aria-label', `Map attribution: ${provider.label}`);
      control.title = `Map attribution — ${provider.label}`;
    }
    return true;
  }

  function wireFrame(frame) {
    if (!frame || wiredFrames.has(frame)) return;
    wiredFrames.add(frame);
    const scan = () => {
      try { installDocument(frame.contentDocument); } catch (_) {}
    };
    frame.addEventListener('load', scan);
    scan();
  }

  function scanFrames(doc) {
    try { doc.querySelectorAll('iframe').forEach(wireFrame); } catch (_) {}
  }

  function installDocument(doc) {
    if (!doc?.documentElement) return false;
    if (installedDocuments.has(doc)) {
      syncAttribution(doc);
      scanFrames(doc);
      return true;
    }

    ensureStyle(doc);
    let queued = false;
    const scan = () => {
      queued = false;
      syncAttribution(doc);
      scanFrames(doc);
    };
    const queueScan = () => {
      if (queued) return;
      queued = true;
      (doc.defaultView || window).requestAnimationFrame(scan);
    };
    const observer = new MutationObserver(queueScan);
    observer.observe(doc.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['src','style','class'] });
    installedDocuments.set(doc, observer);
    scan();
    return true;
  }

  window.PTBO_MAP_ATTRIBUTION = Object.freeze({
    version:VERSION,
    providers:PROVIDERS,
    refresh:() => installDocument(document),
    provider:() => providerForDocument(document)?.id || null,
  });

  if (document.documentElement) installDocument(document);
  else document.addEventListener('DOMContentLoaded', () => installDocument(document), { once:true });
})();
