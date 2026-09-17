/* Live current-street HUD for the response simulator v1.6.68. */
(() => {
  'use strict';

  const VERSION = '1.6.68';
  if (window.PTBO_CURRENT_STREET_HUD?.version === VERSION) return;

  let timer = 0;
  let lastName = '';

  function vehiclePosition() {
    try {
      const lat = Number(simLat);
      const lng = Number(simLng);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch (_) {
      const lat = Number(window.simLat);
      const lng = Number(window.simLng);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    }
  }

  function streetName() {
    const roads = window.PTBO_ROAD_COLLISION;
    if (!roads || roads.state?.status === 'loading') return 'Loading street…';
    if (roads.state?.status !== 'ready' || typeof roads.nearestRoad !== 'function') return 'Street unavailable';

    const position = vehiclePosition();
    if (!position) return 'Street unavailable';

    const nearest = roads.nearestRoad(position.lat, position.lng, 32);
    if (!nearest || !Number.isFinite(Number(nearest.distance)) || Number(nearest.distance) > 16) return 'Off street';

    const name = String(nearest.road || '').trim();
    return name || 'Unnamed road';
  }

  function installStyle() {
    if (document.getElementById('ptbo-current-street-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-current-street-style';
    style.textContent = `
      #ptbo-current-street-hud{
        position:fixed;left:50%;bottom:24px;z-index:1460;
        min-width:190px;max-width:min(360px,70vw);padding:7px 13px 8px;
        display:grid;gap:2px;transform:translateX(-50%);
        color:#f8fafc;border:1px solid rgba(255,255,255,.2);
        border-left:3px solid #38bdf8;border-radius:9px;
        background:rgba(8,13,24,.90);box-shadow:0 7px 22px rgba(0,0,0,.38);
        -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
        text-align:center;pointer-events:none;
      }
      #ptbo-current-street-hud .street-kicker{
        color:#94a3b8;font-size:7px;font-weight:850;letter-spacing:.14em;text-transform:uppercase;
      }
      #ptbo-current-street-name{
        overflow:hidden;color:#fff;font-size:12px;font-weight:850;line-height:1.2;
        letter-spacing:.015em;text-overflow:ellipsis;white-space:nowrap;
      }
      @media(max-width:760px),(pointer:coarse){
        #ptbo-current-street-hud{
          bottom:calc(190px + env(safe-area-inset-bottom));min-width:150px;
          max-width:min(250px,72vw);padding:6px 10px 7px;border-radius:8px;
        }
        #ptbo-current-street-hud .street-kicker{font-size:6px}
        #ptbo-current-street-name{font-size:10px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureHud() {
    installStyle();
    let hud = document.getElementById('ptbo-current-street-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'ptbo-current-street-hud';
      hud.setAttribute('role', 'status');
      hud.setAttribute('aria-label', 'Current street');
      hud.innerHTML = '<span class="street-kicker">Current street</span><strong id="ptbo-current-street-name">Loading street…</strong>';
      document.body.appendChild(hud);
    }
    return hud;
  }

  function update() {
    const hud = ensureHud();
    const node = document.getElementById('ptbo-current-street-name');
    if (!node) return;
    const nextName = streetName();
    if (nextName !== lastName) {
      lastName = nextName;
      node.textContent = nextName;
      hud.title = nextName;
    }
    window.PTBO_MOBILE_UI_LAYOUT?.refresh?.();
  }

  function install() {
    ensureHud();
    update();
    clearInterval(timer);
    timer = setInterval(update, 250);
    addEventListener('ptbo-road-collision-ready', update);
    addEventListener('ptbo-bases-updated', update);
    addEventListener('ptbo-service-change', update);
  }

  window.PTBO_CURRENT_STREET_HUD = Object.freeze({
    version: VERSION,
    refresh: update,
    streetName,
  });

  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
})();
