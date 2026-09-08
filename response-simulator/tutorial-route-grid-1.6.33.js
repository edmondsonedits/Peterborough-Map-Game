/* Tutorial route-comparison mini-map upgrade — v1.6.33. */
(() => {
  'use strict';

  const VERSION = '1.6.33';

  function hostDocument() {
    try {
      if (window.parent !== window && window.parent.document?.getElementById('simulator')) return window.parent.document;
    } catch (_) {}
    return document;
  }

  function installStyles(doc) {
    if (!doc?.head || doc.getElementById('ptbo-tutorial-route-grid-style')) return;
    const style = doc.createElement('style');
    style.id = 'ptbo-tutorial-route-grid-style';
    style.textContent = `
      .ptbo-route-map.ptbo-route-map-grid{min-height:142px;background:radial-gradient(circle at 73% 23%,rgba(34,197,94,.08),transparent 25%),linear-gradient(180deg,#26364a,#1a2739)}
      .ptbo-route-map-grid .city-block{fill:#182437;stroke:#52657a;stroke-width:1;opacity:.96}.ptbo-route-map-grid .city-park{fill:#183b35;stroke:#3f8068;stroke-width:1}.ptbo-route-map-grid .city-tree{fill:#2f855a;stroke:#8ad1a7;stroke-width:.5;opacity:.92}
      .ptbo-route-map-grid .street{fill:none;stroke:#718197;stroke-width:13;stroke-linecap:butt;opacity:.42}.ptbo-route-map-grid .street-edge{fill:none;stroke:#a9b7c8;stroke-width:1;stroke-linecap:butt;opacity:.34}
      .ptbo-route-map-grid .route{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.ptbo-route-map-grid .route-driven{stroke-width:5.5;stroke-dasharray:10 6;opacity:.9}.ptbo-route-map-grid .route-recommended{stroke-width:6.5;opacity:1;filter:drop-shadow(0 0 3px currentColor)}
      .ptbo-route-map-grid .player{stroke:#2563eb;color:#2563eb}.ptbo-route-map-grid .recommended{stroke:#22c55e;color:#22c55e}.ptbo-route-map-grid .hospital-player{stroke:#f97316;color:#f97316}.ptbo-route-map-grid .hospital-recommended{stroke:#c084fc;color:#c084fc}
      .ptbo-route-map-grid .route-node circle{stroke:#fff;stroke-width:2.2;filter:drop-shadow(0 1px 2px #000)}.ptbo-route-map-grid .route-node text{fill:#fff;font:900 8px system-ui,-apple-system,"Segoe UI",sans-serif;text-anchor:middle;dominant-baseline:central}.ptbo-route-map-grid .start-node circle{fill:#0f172a}.ptbo-route-map-grid .call-node circle{fill:#dc2626}.ptbo-route-map-grid .hospital-node circle{fill:#f97316}
      .ptbo-route-legend.ptbo-route-legend-grid{align-content:start;gap:6px;padding:9px}.ptbo-route-legend-grid .ptbo-route-legend-item{display:grid;grid-template-columns:23px minmax(0,1fr);gap:6px;align-items:center;min-width:0;padding:7px 0;border-bottom:1px solid #ffffff0c}.ptbo-route-legend-grid .ptbo-route-legend-item:last-child{border-bottom:0}.ptbo-route-legend-grid .ptbo-route-legend-item>i{margin:0}.ptbo-route-legend-grid strong{display:block;min-width:0;color:#e5edf7;font-size:8px;line-height:1.1}.ptbo-route-legend-grid .blue.dashed{background:repeating-linear-gradient(90deg,#2563eb 0 7px,transparent 7px 10px)}.ptbo-route-legend-grid .orange.dashed{background:repeating-linear-gradient(90deg,#f97316 0 7px,transparent 7px 10px)}
      @media(max-width:600px){.ptbo-route-map.ptbo-route-map-grid{min-height:116px}.ptbo-route-legend.ptbo-route-legend-grid{grid-template-columns:1fr 1fr;align-content:center}.ptbo-route-legend-grid .ptbo-route-legend-item{border-bottom:0;padding:3px 0}}
      @media(max-height:520px) and (orientation:landscape){.ptbo-route-map.ptbo-route-map-grid{min-height:96px}}
    `;
    doc.head.appendChild(style);
  }

  function markup() {
    const blocks = [
      [47,31,36,19],[101,31,38,19],[157,31,44,19],[219,31,48,19],[349,31,34,19],
      [47,66,36,19],[101,66,38,19],[219,66,48,19],[285,66,46,19],[349,66,34,19],
      [47,101,36,17],[101,101,38,17],[157,101,44,17],[219,101,48,17],[285,101,46,17],[349,101,34,17],
      [47,134,36,12],[101,134,38,12],[157,134,44,12],[219,134,48,12],[285,134,46,12],[349,134,34,12],
    ].map(([x,y,w,h]) => `<rect class="city-block" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`).join('');

    return `<div class="ptbo-route-map ptbo-route-map-grid" aria-label="Example route comparison map">
      <svg viewBox="0 0 420 150" preserveAspectRatio="none" aria-hidden="true">
        <g>${blocks}<rect class="city-park" x="285" y="31" width="46" height="19" rx="3"/><circle class="city-tree" cx="296" cy="39" r="3"/><circle class="city-tree" cx="309" cy="43" r="3.2"/><circle class="city-tree" cx="321" cy="37" r="2.8"/><rect class="city-park" x="157" y="66" width="44" height="19" rx="3"/><circle class="city-tree" cx="170" cy="75" r="3"/><circle class="city-tree" cx="186" cy="77" r="3.3"/></g>
        <path class="street" d="M0 24H420M0 58H420M0 93H420M0 126H420M38 0V150M92 0V150M148 0V150M210 0V150M276 0V150M340 0V150M392 0V150"/><path class="street-edge" d="M0 24H420M0 58H420M0 93H420M0 126H420M38 0V150M92 0V150M148 0V150M210 0V150M276 0V150M340 0V150M392 0V150"/>
        <path class="route player route-driven" d="M38 126V93H92V24H210V58"/><path class="route recommended route-recommended" d="M38 126H148V93H210V58"/><path class="route hospital-player route-driven" d="M210 58V24H340V126H392V93"/><path class="route hospital-recommended route-recommended" d="M210 58H276V93H392"/>
        <g class="route-node start-node"><circle cx="38" cy="126" r="9"/><text x="38" y="126">S</text></g><g class="route-node call-node"><circle cx="210" cy="58" r="9"/><text x="210" y="58">C</text></g><g class="route-node hospital-node"><circle cx="392" cy="93" r="9"/><text x="392" y="93">H</text></g>
      </svg>
    </div><div class="ptbo-route-legend ptbo-route-legend-grid" aria-label="Route comparison legend"><div class="ptbo-route-legend-item"><i class="blue dashed"></i><div><strong>Your drive</strong></div></div><div class="ptbo-route-legend-item"><i class="green"></i><div><strong>Recommended route</strong></div></div><div class="ptbo-route-legend-item"><i class="orange dashed"></i><div><strong>EMS to hospital</strong></div></div><div class="ptbo-route-legend-item"><i class="purple"></i><div><strong>Recommended to hospital</strong></div></div></div>`;
  }

  function upgrade(doc = hostDocument()) {
    if (!doc) return;
    installStyles(doc);
    doc.querySelectorAll('.ptbo-route-example').forEach(example => {
      if (example.dataset.ptboRouteGridVersion === VERSION) return;
      example.dataset.ptboRouteGridVersion = VERSION;
      example.innerHTML = markup();
    });
  }

  function install() {
    const doc = hostDocument();
    installStyles(doc);
    upgrade(doc);
    if (!doc?.documentElement) return;
    const Observer = doc.defaultView?.MutationObserver || MutationObserver;
    const observer = new Observer(() => upgrade(doc));
    observer.observe(doc.documentElement, {childList:true, subtree:true});
    addEventListener('pagehide', () => observer.disconnect(), {once:true});
  }

  window.PTBO_TUTORIAL_ROUTE_GRID = Object.freeze({version:VERSION, upgrade});
  install();
})();