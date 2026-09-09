/* Dispatch editor base-area + vehicle spawn editor — v1.6.48. */
(() => {
  'use strict';

  const VERSION = '1.6.48';
  if (window.PTBO_SPAWN_BOX_EDITOR?.version === VERSION) return;
  if (!window.L || !window.PTBO_BASE_STORE) return;

  const bases = window.PTBO_BASE_STORE;
  const nativeMapFactory = L.map;
  let editorMap = null;
  let spawnMarker = null;
  let areaPolygon = null;
  let areaHandles = [];
  let loadedId = null;
  let lastValidLatLng = null;
  let pendingSave = null;
  let applyingSave = false;
  let movingArea = null;

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
  const metresLat = 110540;
  const metresLngAt = lat => 111320 * Math.cos(Number(lat || 44.3) * Math.PI / 180);

  function installStyle() {
    if ($('ptbo-spawn-box-editor-style')) $('ptbo-spawn-box-editor-style').remove();
    const style = document.createElement('style');
    style.id = 'ptbo-spawn-box-editor-style';
    style.textContent = `
      .ptbo-area-editor-fields,.ptbo-spawn-editor-fields{grid-column:1/-1!important;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;border-radius:12px}
      .ptbo-area-editor-fields{border:1px solid rgba(251,191,36,.42);background:rgba(251,191,36,.07)}
      .ptbo-spawn-editor-fields{border:1px solid rgba(52,211,153,.38);background:rgba(52,211,153,.07)}
      .ptbo-area-editor-fields[hidden],.ptbo-spawn-editor-fields[hidden]{display:none!important}
      .ptbo-area-editor-fields h3,.ptbo-spawn-editor-fields h3{grid-column:1/-1;margin:0;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase}
      .ptbo-area-editor-fields h3{color:#fde68a}.ptbo-spawn-editor-fields h3{color:#a7f3d0}
      .ptbo-area-editor-fields p,.ptbo-spawn-editor-fields p{grid-column:1/-1;margin:0;color:#b8c7d9;font-size:.7rem;line-height:1.4}
      .ptbo-area-editor-fields label,.ptbo-spawn-editor-fields label{min-width:0}
      .ptbo-spawn-heading{grid-column:1/-1}.ptbo-spawn-heading-row{display:grid;grid-template-columns:1fr 74px;gap:8px;align-items:center}.ptbo-spawn-heading-row input[type=range]{width:100%;accent-color:#34d399}.ptbo-spawn-heading-row input[type=number]{width:100%;min-height:42px;padding:8px;color:#f8fafc;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#0c1728}
      .ptbo-spawn-box-icon,.ptbo-area-handle-icon{background:transparent!important;border:0!important;display:grid!important;place-items:center!important;overflow:visible!important}
      .ptbo-spawn-box-body{position:relative;width:30px;height:54px;display:grid;place-items:center;border:2px solid #ecfdf5;border-radius:7px;background:rgba(5,150,105,.94);box-shadow:0 0 0 3px rgba(52,211,153,.28),0 4px 12px rgba(0,0,0,.55);transform-origin:50% 50%;cursor:grab;color:white}
      .ptbo-spawn-box-body:active{cursor:grabbing}.ptbo-spawn-box-label{display:block;white-space:nowrap;pointer-events:none;transform-origin:50% 50%;font:900 7px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.04em;text-shadow:0 1px 2px #0008}
      .ptbo-spawn-box-arrow{position:absolute;top:-13px;left:50%;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:13px solid #34d399;transform:translateX(-50%);filter:drop-shadow(0 1px 1px #000)}
      .ptbo-spawn-box-body.ptbo-ems{background:rgba(3,105,161,.95);box-shadow:0 0 0 3px rgba(56,189,248,.28),0 4px 12px rgba(0,0,0,.55)}.ptbo-spawn-box-body.ptbo-ems .ptbo-spawn-box-arrow{border-bottom-color:#38bdf8}
      .ptbo-area-drag-surface{cursor:move}.ptbo-area-handle{width:13px;height:13px;border:2px solid #fff;border-radius:3px;background:#fbbf24;box-shadow:0 2px 7px #0009}.ptbo-area-handle.corner{width:15px;height:15px;border-radius:2px}.ptbo-area-handle.width{cursor:ew-resize}.ptbo-area-handle.length{cursor:ns-resize}.ptbo-area-handle.corner{cursor:nwse-resize}
      @media(max-width:760px){.ptbo-area-editor-fields,.ptbo-spawn-editor-fields{grid-template-columns:1fr 1fr;padding:10px}.ptbo-spawn-box-body{width:27px;height:48px}.ptbo-spawn-box-label{font-size:6px}.ptbo-area-handle{width:16px;height:16px}.ptbo-area-handle.corner{width:18px;height:18px}}
    `;
    document.head.appendChild(style);
  }

  function installFields() {
    const form = $('base-editor');
    const grid = form?.querySelector('.form-grid');
    if (!form || !grid) return false;

    $('ptbo-area-editor-fields')?.remove();
    $('ptbo-spawn-editor-fields')?.remove();

    const legacySize = $('b-size');
    const legacyLabel = legacySize?.closest('label');
    if (legacyLabel) legacyLabel.hidden = true;
    const rotationLabel = $('b-rotation')?.closest('label')?.querySelector('span');
    if (rotationLabel) rotationLabel.textContent = 'Area rotation (°)';

    const areaSection = document.createElement('div');
    areaSection.id = 'ptbo-area-editor-fields';
    areaSection.className = 'base-only ptbo-area-editor-fields';
    areaSection.innerHTML = `
      <h3>Drivable Area Box</h3>
      <p>Drag the amber box on the map to move it. Drag a side or corner handle to resize the width and length independently, like an editing box.</p>
      <label><span>Area width (m)</span><input class="field-control" id="b-area-width" type="number" min="10" max="600" step="1" inputmode="numeric"></label>
      <label><span>Area length (m)</span><input class="field-control" id="b-area-length" type="number" min="10" max="600" step="1" inputmode="numeric"></label>`;

    const spawnSection = document.createElement('div');
    spawnSection.id = 'ptbo-spawn-editor-fields';
    spawnSection.className = 'base-only ptbo-spawn-editor-fields';
    spawnSection.innerHTML = `
      <h3>Vehicle Spawn Box</h3>
      <p>Drag the vehicle box inside the station area. Its long side and arrow point in the direction the vehicle will face when it spawns.</p>
      <label><span>Spawn latitude</span><input class="field-control" id="b-spawn-lat" type="number" step="0.000001" inputmode="decimal"></label>
      <label><span>Spawn longitude</span><input class="field-control" id="b-spawn-lng" type="number" step="0.000001" inputmode="decimal"></label>
      <label class="ptbo-spawn-heading"><span>Vehicle direction</span><div class="ptbo-spawn-heading-row"><input id="b-spawn-heading-range" type="range" min="0" max="359" step="1"><input id="b-spawn-heading" type="number" min="0" max="359" step="1" inputmode="numeric" aria-label="Vehicle spawn direction in degrees"></div></label>`;

    grid.append(areaSection, spawnSection);

    for (const id of ['b-area-width','b-area-length']) {
      $(id).addEventListener('input', () => { syncLegacySize(); renderAreaControls(); renderMarker(true); });
      $(id).addEventListener('change', () => { syncLegacySize(); renderAreaControls(); renderMarker(true); });
    }

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
      if (areaSection.hidden || $('b-service')?.disabled) return;
      syncLegacySize();
      const spawnLat = numeric('b-spawn-lat');
      const spawnLng = numeric('b-spawn-lng');
      const spawnHeading = normalizeHeading(numeric('b-spawn-heading', 180));
      const yard = currentYard();
      if (!yard || ![yard.yardWidth,yard.yardLength].every(value => Number.isFinite(value) && value >= 10 && value <= 600)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus('Use an area width and length between 10 and 600 metres.');
        return;
      }
      if (!Number.isFinite(spawnLat) || !Number.isFinite(spawnLng) || !bases.contains(yard, spawnLat, spawnLng)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus('Move the vehicle spawn box inside the base area before saving.');
        return;
      }
      pendingSave = {
        id: $('base-id')?.textContent?.trim(),
        yardWidth:yard.yardWidth,
        yardLength:yard.yardLength,
        yardSize:Math.max(yard.yardWidth,yard.yardLength),
        spawnLat,
        spawnLng,
        spawnHeading,
      };
      setTimeout(() => { pendingSave = null; }, 1000);
    }, true);

    return true;
  }

  function syncLegacySize() {
    const width = numeric('b-area-width');
    const length = numeric('b-area-length');
    if ($('b-size') && Number.isFinite(width) && Number.isFinite(length)) $('b-size').value = Math.max(width,length);
  }

  function currentYard() {
    const lat = numeric('b-lat');
    const lng = numeric('b-lng');
    const legacy = numeric('b-size',160);
    const yardWidth = numeric('b-area-width',legacy);
    const yardLength = numeric('b-area-length',legacy);
    const yardRotation = numeric('b-rotation', 0);
    if (![lat,lng,yardWidth,yardLength,yardRotation].every(Number.isFinite)) return null;
    return {lat,lng,yardSize:Math.max(yardWidth,yardLength),yardWidth,yardLength,yardRotation};
  }

  function currentBase() {
    const id = $('base-id')?.textContent?.trim();
    return bases.getAll().find(base => base.id === id) || null;
  }

  function currentService() {
    const value = String($('b-service')?.value || currentBase()?.service || 'fire').toLowerCase();
    return value === 'ems' ? 'ems' : 'fire';
  }

  function isBaseEditorOpen() {
    const form = $('base-editor');
    return Boolean(form && !form.classList.contains('hidden') && !$('b-service')?.disabled);
  }

  function localToLatLng(yard,x,y) {
    const angle = Number(yard.yardRotation || 0) * Math.PI / 180;
    const east = x*Math.cos(angle)-y*Math.sin(angle);
    const north = x*Math.sin(angle)+y*Math.cos(angle);
    return L.latLng(yard.lat+north/metresLat,yard.lng+east/metresLngAt(yard.lat));
  }

  function latLngToLocal(yard,latlng) {
    const angle = Number(yard.yardRotation || 0) * Math.PI / 180;
    const east = (latlng.lng-yard.lng)*metresLngAt(yard.lat);
    const north = (latlng.lat-yard.lat)*metresLat;
    return {x:east*Math.cos(angle)+north*Math.sin(angle),y:-east*Math.sin(angle)+north*Math.cos(angle)};
  }

  function handleIcon(kind) {
    return L.divIcon({className:'ptbo-area-handle-icon',iconSize:[22,22],iconAnchor:[11,11],html:`<span class="ptbo-area-handle ${kind}"></span>`});
  }

  function removeAreaControls() {
    areaPolygon?.remove();
    areaPolygon = null;
    for (const marker of areaHandles) marker.remove();
    areaHandles = [];
    movingArea = null;
  }

  function setAreaCenter(lat,lng) {
    if ($('b-lat')) $('b-lat').value = Number(lat).toFixed(6);
    if ($('b-lng')) $('b-lng').value = Number(lng).toFixed(6);
  }

  function beginAreaMove(event) {
    if (!isBaseEditorOpen() || !editorMap) return;
    const yard = currentYard();
    if (!yard) return;
    L.DomEvent.stop(event.originalEvent || event);
    editorMap.dragging?.disable?.();
    movingArea = {
      start:event.latlng,
      lat:yard.lat,
      lng:yard.lng,
      spawnLat:numeric('b-spawn-lat',yard.lat),
      spawnLng:numeric('b-spawn-lng',yard.lng),
    };
    editorMap.on('mousemove', moveArea);
    editorMap.once('mouseup', endAreaMove);
  }

  function moveArea(event) {
    if (!movingArea) return;
    const deltaLat = event.latlng.lat-movingArea.start.lat;
    const deltaLng = event.latlng.lng-movingArea.start.lng;
    setAreaCenter(movingArea.lat+deltaLat,movingArea.lng+deltaLng);
    if ($('b-spawn-lat')) $('b-spawn-lat').value = (movingArea.spawnLat+deltaLat).toFixed(6);
    if ($('b-spawn-lng')) $('b-spawn-lng').value = (movingArea.spawnLng+deltaLng).toFixed(6);
    updateAreaGeometry();
    renderMarker(false);
  }

  function endAreaMove() {
    if (!movingArea) return;
    movingArea = null;
    editorMap?.off('mousemove',moveArea);
    editorMap?.dragging?.enable?.();
    setStatus('Drivable area moved. Save on This Device to keep it.');
  }

  function resizeFromHandle(marker,axes,event) {
    const yard = currentYard();
    if (!yard) return;
    const local = latLngToLocal(yard,event.target.getLatLng());
    if (axes.includes('x')) $('b-area-width').value = Math.round(Math.max(10,Math.min(600,Math.abs(local.x)*2)));
    if (axes.includes('y')) $('b-area-length').value = Math.round(Math.max(10,Math.min(600,Math.abs(local.y)*2)));
    syncLegacySize();
    updateAreaGeometry();
    renderMarker(true);
  }

  function createHandle(xFactor,yFactor,kind,axes) {
    const yard = currentYard();
    if (!yard) return null;
    const marker = L.marker(localToLatLng(yard,yard.yardWidth/2*xFactor,yard.yardLength/2*yFactor),{
      draggable:true,keyboard:false,zIndexOffset:1800,icon:handleIcon(kind),title:'Drag to resize drivable area',
    }).addTo(editorMap);
    marker._ptboFactors = {xFactor,yFactor,kind,axes};
    marker.on('drag',event => resizeFromHandle(marker,axes,event));
    marker.on('dragend',() => setStatus('Drivable area resized. Save on This Device to keep it.'));
    return marker;
  }

  function updateAreaGeometry() {
    if (!editorMap || !isBaseEditorOpen()) return;
    const yard = currentYard();
    if (!yard) return;
    if (areaPolygon) areaPolygon.setLatLngs(bases.corners(yard));
    for (const marker of areaHandles) {
      const f = marker._ptboFactors;
      if (!f) continue;
      marker.setLatLng(localToLatLng(yard,yard.yardWidth/2*f.xFactor,yard.yardLength/2*f.yFactor));
    }
  }

  function renderAreaControls() {
    if (!editorMap || !isBaseEditorOpen()) { removeAreaControls(); return; }
    const yard = currentYard();
    if (!yard) return;
    if (!areaPolygon) {
      areaPolygon = L.polygon(bases.corners(yard),{color:'#fbbf24',weight:3,fillColor:'#fbbf24',fillOpacity:.09,interactive:true,className:'ptbo-area-drag-surface'}).addTo(editorMap);
      areaPolygon.bindTooltip('Drag box to move · drag handles to resize',{sticky:true});
      areaPolygon.on('mousedown',beginAreaMove);
      areaHandles = [
        createHandle(1,0,'width','x'),createHandle(-1,0,'width','x'),
        createHandle(0,1,'length','y'),createHandle(0,-1,'length','y'),
        createHandle(1,1,'corner','xy'),createHandle(-1,1,'corner','xy'),
        createHandle(1,-1,'corner','xy'),createHandle(-1,-1,'corner','xy'),
      ].filter(Boolean);
    } else updateAreaGeometry();
  }

  function spawnIcon(heading) {
    const normalized = normalizeHeading(heading);
    const service = currentService();
    const label = service === 'ems' ? 'AMB' : 'TRUCK';
    const serviceClass = service === 'ems' ? ' ptbo-ems' : '';
    return L.divIcon({
      className:'ptbo-spawn-box-icon',
      iconSize:[72,72],
      iconAnchor:[36,36],
      html:`<div class="ptbo-spawn-box-body${serviceClass}" style="transform:rotate(${normalized}deg)"><span class="ptbo-spawn-box-arrow"></span><b class="ptbo-spawn-box-label" style="transform:rotate(${-normalized}deg)">${label}</b></div>`,
    });
  }

  function removeMarker() {
    spawnMarker?.remove();
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
      $('b-spawn-lat').value = Number(yard.lat).toFixed(6);
      $('b-spawn-lng').value = Number(yard.lng).toFixed(6);
      return renderMarker(false);
    }

    const position = [numeric('b-spawn-lat'), numeric('b-spawn-lng')];
    const service = currentService();
    const vehicleName = service === 'ems' ? 'Ambulance' : 'Fire truck';
    if (!spawnMarker) {
      spawnMarker = L.marker(position,{draggable:true,icon:spawnIcon(heading),zIndexOffset:2000,keyboard:false,title:`${vehicleName} spawn position`}).addTo(editorMap);
      spawnMarker.bindTooltip(`${vehicleName} spawn · drag to move`,{direction:'top',offset:[0,-31]});
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
          setStatus('The vehicle spawn box must stay inside the drivable area.');
          return;
        }
        $('b-spawn-lat').value = p.lat.toFixed(6);
        $('b-spawn-lng').value = p.lng.toFixed(6);
        lastValidLatLng = L.latLng(p.lat,p.lng);
        setStatus('Vehicle spawn moved. Save on This Device to keep it.');
      });
    } else {
      spawnMarker.setLatLng(position);
      spawnMarker.setIcon(spawnIcon(heading));
      if (spawnMarker.options) spawnMarker.options.title = `${vehicleName} spawn position`;
      spawnMarker.unbindTooltip();
      spawnMarker.bindTooltip(`${vehicleName} spawn · drag to move`,{direction:'top',offset:[0,-31]});
    }
    lastValidLatLng = L.latLng(position[0],position[1]);
  }

  function populateFields(base) {
    const yardLat = numeric('b-lat', Number(base?.lat));
    const yardLng = numeric('b-lng', Number(base?.lng));
    const legacy = Number(base?.yardSize ?? numeric('b-size',160));
    const width = Number(base?.yardWidth ?? legacy);
    const length = Number(base?.yardLength ?? legacy);
    const spawnLat = Number.isFinite(Number(base?.spawnLat)) ? Number(base.spawnLat) : yardLat;
    const spawnLng = Number.isFinite(Number(base?.spawnLng)) ? Number(base.spawnLng) : yardLng;
    const heading = Math.round(normalizeHeading(base?.spawnHeading ?? 180));
    if ($('b-area-width')) $('b-area-width').value = Math.round(width);
    if ($('b-area-length')) $('b-area-length').value = Math.round(length);
    syncLegacySize();
    if ($('b-spawn-lat')) $('b-spawn-lat').value = Number(spawnLat).toFixed(6);
    if ($('b-spawn-lng')) $('b-spawn-lng').value = Number(spawnLng).toFixed(6);
    if ($('b-spawn-heading')) $('b-spawn-heading').value = heading;
    if ($('b-spawn-heading-range')) $('b-spawn-heading-range').value = heading;
  }

  function polishEditorText() {
    const help = $('base-help');
    if (help && isBaseEditorOpen()) help.textContent = 'The amber box is the drivable station area. Drag the box to move it, drag its handles to resize width/length, and use Area rotation to turn it.';
    const review = $('review-count');
    if (review && isBaseEditorOpen()) review.textContent = 'Box = drivable area';
    for (const button of document.querySelectorAll('#call-list [data-id]')) {
      const base = bases.getAll().find(item => item.id === button.dataset.id);
      if (!base) continue;
      const spans = button.querySelectorAll('span');
      if (!spans.length) continue;
      const width = Math.round(Number(base.yardWidth ?? base.yardSize ?? 160));
      const length = Math.round(Number(base.yardLength ?? base.yardSize ?? 160));
      spans[spans.length-1].textContent = `${base.service==='ems'?'EMS':'Fire'} · ${width} × ${length} m area`;
    }
  }

  function syncFromEditor() {
    installStyle();
    if (!$('ptbo-area-editor-fields') && !installFields()) return;
    if (!isBaseEditorOpen()) {
      loadedId = null;
      removeMarker();
      removeAreaControls();
      return;
    }
    const id = $('base-id')?.textContent?.trim() || '';
    if (id !== loadedId) {
      loadedId = id;
      populateFields(currentBase());
      removeAreaControls();
    }
    polishEditorText();
    renderAreaControls();
    renderMarker(true);
  }

  window.addEventListener('ptbo-bases-updated', () => {
    if (applyingSave || !pendingSave?.id) {
      queueMicrotask(syncFromEditor);
      return;
    }
    const next = bases.getAll();
    const index = next.findIndex(base => base.id === pendingSave.id);
    if (index < 0) return;
    next[index] = {...next[index],...pendingSave};
    pendingSave = null;
    applyingSave = true;
    try { bases.replaceAll(next); }
    finally { applyingSave = false; }
    setStatus('Base area and vehicle spawn saved on this device.');
  });

  const observer = new MutationObserver(() => queueMicrotask(syncFromEditor));
  const start = () => {
    installStyle();
    installFields();
    const form = $('base-editor');
    if (form) observer.observe(form,{attributes:true,subtree:true,childList:true,characterData:true});
    for (const id of ['b-lat','b-lng','b-rotation']) {
      $(id)?.addEventListener('input',() => { renderAreaControls(); renderMarker(true); });
      $(id)?.addEventListener('change',() => { renderAreaControls(); renderMarker(true); });
    }
    $('b-service')?.addEventListener('change',() => renderMarker(false));
    addEventListener('mouseup',endAreaMove);
    syncFromEditor();
  };

  window.PTBO_SPAWN_BOX_EDITOR = Object.freeze({version:VERSION,sync:syncFromEditor});
  start();
})();