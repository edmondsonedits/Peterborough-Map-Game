/* Dispatch editor truck spawn box — v1.6.37. */
(() => {
  'use strict';

  const VERSION = '1.6.37';
  if (window.PTBO_SPAWN_BOX_EDITOR?.version === VERSION) return;
  if (!window.L || !window.PTBO_BASE_STORE) return;

  const bases = window.PTBO_BASE_STORE;
  const nativeMapFactory = L.map;
  let editorMap = null;
  let spawnMarker = null;
  let loadedId = null;
  let lastValidLatLng = null;
  let pendingSave = null;
  let applyingSpawnSave = false;

  L.map = function ptboSpawnAwareMapFactory(...args) {
    const map = nativeMapFactory.apply(this, args);
    editorMap = map;
    queueMicrotask(syncFromEditor);
    return map;
  };
  Object.assign(L.map, nativeMapFactory);

  const $ = id => document.getElementById(id);
  const normalizeHeading = value => ((Number(value) % 360) + 360) % 360;
  const numeric = (id, fallback = NaN) => {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  };
  const setStatus = message => { const element = $('save-status'); if (element) element.textContent = message; };

  function installStyle() {
    if ($('ptbo-spawn-box-editor-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-spawn-box-editor-style';
    style.textContent = `
      .ptbo-spawn-editor-fields{grid-column:1/-1!important;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;border:1px solid rgba(52,211,153,.38);border-radius:12px;background:rgba(52,211,153,.07)}
      .ptbo-spawn-editor-fields[hidden]{display:none!important}.ptbo-spawn-editor-fields h3{grid-column:1/-1;margin:0;color:#a7f3d0;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase}.ptbo-spawn-editor-fields p{grid-column:1/-1;margin:0;color:#b8c7d9;font-size:.7rem;line-height:1.4}
      .ptbo-spawn-editor-fields label{min-width:0}.ptbo-spawn-heading{grid-column:1/-1}.ptbo-spawn-heading-row{display:grid;grid-template-columns:1fr 74px;gap:8px;align-items:center}.ptbo-spawn-heading-row input[type=range]{width:100%;accent-color:#34d399}.ptbo-spawn-heading-row input[type=number]{width:100%;min-height:42px;padding:8px;color:#f8fafc;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#0c1728}
      .ptbo-spawn-box-icon{background:transparent!important;border:0!important}.ptbo-spawn-box-body{position:relative;width:48px;height:26px;display:grid;place-items:center;border:2px solid #ecfdf5;border-radius:6px;background:rgba(5,150,105,.94);box-shadow:0 0 0 3px rgba(52,211,153,.28),0 4px 12px rgba(0,0,0,.55);transform-origin:50% 50%;cursor:grab;color:white;font:900 7px/1 system-ui;letter-spacing:.06em}.ptbo-spawn-box-body:active{cursor:grabbing}.ptbo-spawn-box-arrow{position:absolute;top:-14px;left:50%;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:13px solid #34d399;transform:translateX(-50%);filter:drop-shadow(0 1px 1px #000)}
      @media(max-width:760px){.ptbo-spawn-editor-fields{grid-template-columns:1fr 1fr;padding:10px}.ptbo-spawn-box-body{width:44px;height:24px}}
    `;
    document.head.appendChild(style);
  }

  function installFields() {
    const form = $('base-editor');
    const grid = form?.querySelector('.form-grid');
    if (!form || !grid) return false;
    if ($('ptbo-spawn-editor-fields')) return true;

    const section = document.createElement('div');
    section.id = 'ptbo-spawn-editor-fields';
    section.className = 'base-only ptbo-spawn-editor-fields';
    section.innerHTML = `
      <h3>Truck Spawn Box</h3>
      <p>Drag the green truck box inside the station square. The arrow shows the direction the truck will face when it spawns.</p>
      <label><span>Spawn latitude</span><input class="field-control" id="b-spawn-lat" type="number" step="0.000001" inputmode="decimal"></label>
      <label><span>Spawn longitude</span><input class="field-control" id="b-spawn-lng" type="number" step="0.000001" inputmode="decimal"></label>
      <label class="ptbo-spawn-heading"><span>Truck direction</span><div class="ptbo-spawn-heading-row"><input id="b-spawn-heading-range" type="range" min="0" max="359" step="1"><input id="b-spawn-heading" type="number" min="0" max="359" step="1" inputmode="numeric" aria-label="Truck spawn direction in degrees"></div></label>`;

    const actions = form.querySelector('.editor-actions');
    if (actions?.parentElement === grid) grid.insertBefore(section, actions);
    else grid.appendChild(section);

    const latInput = $('b-spawn-lat');
    const lngInput = $('b-spawn-lng');
    const headingInput = $('b-spawn-heading');
    const headingRange = $('b-spawn-heading-range');

    const syncMarkerFromFields = () => renderMarker(false);
    latInput.addEventListener('change', syncMarkerFromFields);
    lngInput.addEventListener('change', syncMarkerFromFields);
    latInput.addEventListener('input', syncMarkerFromFields);
    lngInput.addEventListener('input', syncMarkerFromFields);
    headingInput.addEventListener('input', () => {
      const heading = Math.round(normalizeHeading(headingInput.value));
      headingInput.value = heading;
      headingRange.value = heading;
      renderMarker(false);
    });
    headingRange.addEventListener('input', () => {
      headingInput.value = headingRange.value;
      renderMarker(false);
    });

    form.addEventListener('submit', event => {
      if (section.hidden || $('b-service')?.disabled) return;
      const spawnLat = numeric('b-spawn-lat');
      const spawnLng = numeric('b-spawn-lng');
      const spawnHeading = normalizeHeading(numeric('b-spawn-heading', 180));
      const yard = currentYard();
      if (!Number.isFinite(spawnLat) || !Number.isFinite(spawnLng) || !yard || !bases.contains(yard, spawnLat, spawnLng)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus('Move the truck spawn box inside the base square before saving.');
        return;
      }
      pendingSave = {
        id: $('base-id')?.textContent?.trim(),
        spawnLat,
        spawnLng,
        spawnHeading,
      };
      setTimeout(() => { pendingSave = null; }, 750);
    }, true);

    return true;
  }

  function currentYard() {
    const lat = numeric('b-lat');
    const lng = numeric('b-lng');
    const yardSize = numeric('b-size');
    const yardRotation = numeric('b-rotation', 0);
    if (![lat,lng,yardSize,yardRotation].every(Number.isFinite)) return null;
    return {lat,lng,yardSize,yardRotation};
  }

  function currentBase() {
    const id = $('base-id')?.textContent?.trim();
    return bases.getAll().find(base => base.id === id) || null;
  }

  function isBaseEditorOpen() {
    const form = $('base-editor');
    return Boolean(form && !form.classList.contains('hidden') && !$('b-service')?.disabled);
  }

  function spawnIcon(heading) {
    return L.divIcon({
      className:'ptbo-spawn-box-icon',
      iconSize:[48,40],
      iconAnchor:[24,20],
      html:`<div class="ptbo-spawn-box-body" style="transform:rotate(${normalizeHeading(heading)}deg)"><span class="ptbo-spawn-box-arrow"></span><b>TRUCK</b></div>`,
    });
  }

  function removeMarker() {
    if (spawnMarker) spawnMarker.remove();
    spawnMarker = null;
    lastValidLatLng = null;
  }

  function renderMarker(ensureValid = true) {
    if (!editorMap || !isBaseEditorOpen()) { removeMarker(); return; }
    const lat = numeric('b-spawn-lat');
    const lng = numeric('b-spawn-lng');
    const heading = normalizeHeading(numeric('b-spawn-heading', 180));
    const yard = currentYard();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !yard) return;

    if (ensureValid && !bases.contains(yard, lat, lng)) {
      const base = currentBase();
      const fallbackLat = Number(base?.lat ?? yard.lat);
      const fallbackLng = Number(base?.lng ?? yard.lng);
      $('b-spawn-lat').value = fallbackLat.toFixed(6);
      $('b-spawn-lng').value = fallbackLng.toFixed(6);
      return renderMarker(false);
    }

    const position = [numeric('b-spawn-lat'), numeric('b-spawn-lng')];
    if (!spawnMarker) {
      spawnMarker = L.marker(position,{draggable:true,icon:spawnIcon(heading),zIndexOffset:1600,keyboard:true,title:'Truck spawn position'}).addTo(editorMap);
      spawnMarker.bindTooltip('Truck spawn · drag to move',{direction:'top',offset:[0,-16]});
      spawnMarker.on('dragstart',() => { lastValidLatLng = spawnMarker.getLatLng(); });
      spawnMarker.on('drag',event => {
        const p = event.target.getLatLng();
        const shape = currentYard();
        if (shape && bases.contains(shape,p.lat,p.lng)) lastValidLatLng = L.latLng(p.lat,p.lng);
      });
      spawnMarker.on('dragend',event => {
        const p = event.target.getLatLng();
        const shape = currentYard();
        if (!shape || !bases.contains(shape,p.lat,p.lng)) {
          const fallback = lastValidLatLng || L.latLng(numeric('b-spawn-lat'),numeric('b-spawn-lng'));
          event.target.setLatLng(fallback);
          setStatus('The truck spawn box must stay inside the station square.');
          return;
        }
        $('b-spawn-lat').value = p.lat.toFixed(6);
        $('b-spawn-lng').value = p.lng.toFixed(6);
        lastValidLatLng = L.latLng(p.lat,p.lng);
        setStatus('Truck spawn moved. Save on This Device to keep it.');
      });
    } else {
      spawnMarker.setLatLng(position);
      spawnMarker.setIcon(spawnIcon(heading));
    }
    lastValidLatLng = L.latLng(position[0],position[1]);
  }

  function populateFields(base) {
    const yardLat = numeric('b-lat', Number(base?.lat));
    const yardLng = numeric('b-lng', Number(base?.lng));
    const spawnLat = Number.isFinite(Number(base?.spawnLat)) ? Number(base.spawnLat) : yardLat;
    const spawnLng = Number.isFinite(Number(base?.spawnLng)) ? Number(base.spawnLng) : yardLng;
    const heading = Math.round(normalizeHeading(base?.spawnHeading ?? 180));
    if ($('b-spawn-lat')) $('b-spawn-lat').value = Number(spawnLat).toFixed(6);
    if ($('b-spawn-lng')) $('b-spawn-lng').value = Number(spawnLng).toFixed(6);
    if ($('b-spawn-heading')) $('b-spawn-heading').value = heading;
    if ($('b-spawn-heading-range')) $('b-spawn-heading-range').value = heading;
  }

  function syncFromEditor() {
    installStyle();
    if (!installFields()) return;
    if (!isBaseEditorOpen()) {
      loadedId = null;
      removeMarker();
      return;
    }
    const id = $('base-id')?.textContent?.trim() || '';
    if (id !== loadedId) {
      loadedId = id;
      populateFields(currentBase());
    }
    renderMarker(true);
  }

  window.addEventListener('ptbo-bases-updated', () => {
    if (applyingSpawnSave || !pendingSave?.id) {
      queueMicrotask(syncFromEditor);
      return;
    }
    const next = bases.getAll();
    const index = next.findIndex(base => base.id === pendingSave.id);
    if (index < 0) return;
    next[index] = {...next[index],...pendingSave};
    pendingSave = null;
    applyingSpawnSave = true;
    try { bases.replaceAll(next); }
    finally { applyingSpawnSave = false; }
    setStatus('Base and truck spawn saved on this device.');
  });

  const observer = new MutationObserver(() => queueMicrotask(syncFromEditor));
  const start = () => {
    installStyle();
    installFields();
    const form = $('base-editor');
    if (form) observer.observe(form,{attributes:true,subtree:true,childList:true,characterData:true});
    for (const id of ['b-lat','b-lng','b-size','b-rotation']) {
      $(id)?.addEventListener('input',() => renderMarker(true));
      $(id)?.addEventListener('change',() => renderMarker(true));
    }
    syncFromEditor();
  };

  window.PTBO_SPAWN_BOX_EDITOR = Object.freeze({version:VERSION,sync:syncFromEditor});
  start();
})();
