/* Dispatch Editor hospital drivable-area + ambulance checkpoint editor — v1.6.49. */
(() => {
  'use strict';

  const VERSION = '1.6.49';
  if (window.PTBO_HOSPITAL_DROPOFF_EDITOR?.version === VERSION) return;
  if (!window.L || !window.PTBO_HOSPITAL_DROPOFF || !window.PTBO_BASE_STORE) return;

  const store = window.PTBO_HOSPITAL_DROPOFF;
  const bases = window.PTBO_BASE_STORE;
  const nativeMapFactory = L.map;
  const $ = id => document.getElementById(id);
  const metresLat = 110540;
  const metresLngAt = lat => 111320 * Math.cos(Number(lat || 44.3) * Math.PI / 180);
  let editorMap = null;
  let polygon = null;
  let handles = [];
  let checkpointMarker = null;
  let movingArea = null;
  let loadedHospital = false;
  let lastCheckpoint = null;
  let roads = null;
  let syncQueued = false;

  // Observe editor selection only, never the labels/fields written by sync.
  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      syncFromEditor();
    });
  }

  L.map = function ptboHospitalAreaMapFactory(...args) {
    const map = nativeMapFactory.apply(this,args);
    editorMap = map;
    scheduleSync();
    return map;
  };
  Object.assign(L.map,nativeMapFactory);

  const numeric = (id,fallback=NaN) => {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  };
  const setStatus = message => { if ($('save-status')) $('save-status').textContent = message; };

  function isHospitalOpen() {
    const form = $('base-editor');
    return Boolean(form && !form.classList.contains('hidden') && $('b-service')?.disabled);
  }

  function installStyle() {
    if ($('ptbo-hospital-dropoff-editor-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-hospital-dropoff-editor-style';
    style.textContent = `
      .ptbo-hospital-area-fields{grid-column:1/-1!important;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;border:1px solid rgba(96,165,250,.44);border-radius:12px;background:linear-gradient(145deg,rgba(59,130,246,.08),rgba(192,132,252,.06))}
      .ptbo-hospital-area-fields[hidden]{display:none!important}.ptbo-hospital-area-fields h3{grid-column:1/-1;margin:0;color:#bfdbfe;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase}.ptbo-hospital-area-fields p{grid-column:1/-1;margin:0;color:#b8c7d9;font-size:.7rem;line-height:1.42}.ptbo-hospital-area-fields label{min-width:0}
      .ptbo-hospital-handle-icon,.ptbo-hospital-checkpoint-icon{background:transparent!important;border:0!important;display:grid!important;place-items:center!important;overflow:visible!important}
      .ptbo-hospital-handle{width:14px;height:14px;border:2px solid #fff;border-radius:3px;background:#60a5fa;box-shadow:0 2px 8px #000a}.ptbo-hospital-handle.corner{width:16px;height:16px;background:#c084fc}.ptbo-hospital-handle.width{cursor:ew-resize}.ptbo-hospital-handle.length{cursor:ns-resize}.ptbo-hospital-handle.corner{cursor:nwse-resize}
      .ptbo-hospital-area-surface{cursor:move}.ptbo-hospital-checkpoint{position:relative;width:34px;height:34px;display:grid;place-items:center;border:3px solid white;border-radius:50%;background:#0284c7;color:white;box-shadow:0 0 0 4px rgba(56,189,248,.28),0 4px 13px #0009;cursor:grab;font:900 9px/1 system-ui,sans-serif}.ptbo-hospital-checkpoint:active{cursor:grabbing}.ptbo-hospital-checkpoint:after{position:absolute;inset:50% auto auto 50%;width:48px;height:2px;content:"";background:rgba(125,211,252,.9);transform:translate(-50%,-50%);z-index:-1}.ptbo-hospital-checkpoint:before{position:absolute;inset:50% auto auto 50%;width:2px;height:48px;content:"";background:rgba(125,211,252,.9);transform:translate(-50%,-50%);z-index:-1}
      @media(max-width:760px){.ptbo-hospital-area-fields{grid-template-columns:1fr 1fr;padding:10px}.ptbo-hospital-handle{width:17px;height:17px}.ptbo-hospital-handle.corner{width:19px;height:19px}.ptbo-hospital-checkpoint{width:38px;height:38px}}
    `;
    document.head.appendChild(style);
  }

  function installFields() {
    const form = $('base-editor');
    const grid = form?.querySelector('.form-grid');
    if (!grid) return false;
    if ($('ptbo-hospital-area-fields')) return true;

    const section = document.createElement('div');
    section.id = 'ptbo-hospital-area-fields';
    section.className = 'hospital-only ptbo-hospital-area-fields';
    section.hidden = true;
    section.innerHTML = `
      <h3>Hospital Drivable Area</h3>
      <p>Drag the blue rectangle to move it. Drag a side or corner handle to resize it. The ambulance can drive anywhere inside this area, including over the hospital footprint.</p>
      <label><span>Area centre latitude</span><input id="h-area-lat" class="field-control" type="number" min="-85" max="85" step="0.000001"></label>
      <label><span>Area centre longitude</span><input id="h-area-lng" class="field-control" type="number" min="-180" max="180" step="0.000001"></label>
      <label><span>Area width (m)</span><input id="h-area-width" class="field-control" type="number" min="10" max="600" step="1"></label>
      <label><span>Area length (m)</span><input id="h-area-length" class="field-control" type="number" min="10" max="600" step="1"></label>
      <label class="full"><span>Area rotation (°)</span><input id="h-area-rotation" class="field-control" type="number" min="0" max="359" step="1"></label>`;
    grid.appendChild(section);

    for (const id of ['h-area-lat','h-area-lng','h-area-width','h-area-length','h-area-rotation']) {
      $(id).addEventListener('input',() => updateFromFields(true));
      $(id).addEventListener('change',() => updateFromFields(true));
    }
    for (const id of ['b-lat','b-lng','b-radius']) {
      $(id)?.addEventListener('input',() => { if (isHospitalOpen()) updateFromFields(false); });
      $(id)?.addEventListener('change',() => { if (isHospitalOpen()) updateFromFields(false); });
    }

    form.addEventListener('submit',event => {
      if (!isHospitalOpen()) return;
      try {
        const area = stageFromFields();
        if (!store.contains(area.checkpointLat,area.checkpointLng)) throw new Error('Keep the ambulance checkpoint inside the hospital drivable area.');
        if (roads && !store.roadAccess(roads)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setStatus('Move or resize the hospital drivable area so it connects to a mapped road.');
        }
      } catch (error) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(error.message || String(error));
      }
    },true);
    return true;
  }

  function readFields() {
    const hospital = store.get();
    return {
      areaLat:numeric('h-area-lat',hospital.areaLat),
      areaLng:numeric('h-area-lng',hospital.areaLng),
      areaWidth:numeric('h-area-width',hospital.areaWidth),
      areaLength:numeric('h-area-length',hospital.areaLength),
      areaRotation:numeric('h-area-rotation',hospital.areaRotation),
      checkpointLat:numeric('b-lat',hospital.checkpointLat),
      checkpointLng:numeric('b-lng',hospital.checkpointLng),
      checkpointRadius:numeric('b-radius',hospital.checkpointRadius),
    };
  }

  function stageFromFields() { return store.stage(readFields()); }

  function populate() {
    const hospital = store.get();
    $('h-area-lat').value = Number(hospital.areaLat).toFixed(6);
    $('h-area-lng').value = Number(hospital.areaLng).toFixed(6);
    $('h-area-width').value = Math.round(hospital.areaWidth);
    $('h-area-length').value = Math.round(hospital.areaLength);
    $('h-area-rotation').value = Math.round(hospital.areaRotation);
    $('b-lat').value = Number(hospital.checkpointLat).toFixed(6);
    $('b-lng').value = Number(hospital.checkpointLng).toFixed(6);
    $('b-radius').value = Math.round(hospital.checkpointRadius);
    store.stage(hospital);
  }

  function localToLatLng(area,x,y) {
    const angle = Number(area.areaRotation || 0) * Math.PI / 180;
    const east = x*Math.cos(angle)-y*Math.sin(angle);
    const north = x*Math.sin(angle)+y*Math.cos(angle);
    return L.latLng(area.areaLat+north/metresLat,area.areaLng+east/metresLngAt(area.areaLat));
  }

  function latLngToLocal(area,latlng) {
    const angle = Number(area.areaRotation || 0) * Math.PI / 180;
    const east = (latlng.lng-area.areaLng)*metresLngAt(area.areaLat);
    const north = (latlng.lat-area.areaLat)*metresLat;
    return {x:east*Math.cos(angle)+north*Math.sin(angle),y:-east*Math.sin(angle)+north*Math.cos(angle)};
  }

  function handleIcon(kind) {
    return L.divIcon({className:'ptbo-hospital-handle-icon',iconSize:[24,24],iconAnchor:[12,12],html:`<span class="ptbo-hospital-handle ${kind}"></span>`});
  }
  function checkpointIcon() {
    return L.divIcon({className:'ptbo-hospital-checkpoint-icon',iconSize:[52,52],iconAnchor:[26,26],html:'<span class="ptbo-hospital-checkpoint">DROP</span>'});
  }

  function removeLayers() {
    polygon?.remove(); polygon = null;
    checkpointMarker?.remove(); checkpointMarker = null;
    handles.forEach(marker => marker.remove()); handles = [];
    movingArea = null; lastCheckpoint = null;
  }

  function beginMove(event) {
    if (!isHospitalOpen()) return;
    const area = readFields();
    L.DomEvent.stop(event.originalEvent || event);
    editorMap.dragging?.disable?.();
    movingArea = {
      start:event.latlng,
      areaLat:area.areaLat,areaLng:area.areaLng,
      checkpointLat:area.checkpointLat,checkpointLng:area.checkpointLng,
    };
    editorMap.on('mousemove',moveArea);
    editorMap.once('mouseup',endMove);
  }

  function moveArea(event) {
    if (!movingArea) return;
    const dLat = event.latlng.lat-movingArea.start.lat;
    const dLng = event.latlng.lng-movingArea.start.lng;
    $('h-area-lat').value = (movingArea.areaLat+dLat).toFixed(6);
    $('h-area-lng').value = (movingArea.areaLng+dLng).toFixed(6);
    $('b-lat').value = (movingArea.checkpointLat+dLat).toFixed(6);
    $('b-lng').value = (movingArea.checkpointLng+dLng).toFixed(6);
    updateFromFields(false);
  }

  function endMove() {
    if (!movingArea) return;
    movingArea = null;
    editorMap?.off('mousemove',moveArea);
    editorMap?.dragging?.enable?.();
    setStatus('Hospital drivable area moved. Save on This Device to keep it.');
  }

  function resizeHandle(marker,axes,event) {
    const area = readFields();
    const local = latLngToLocal(area,event.target.getLatLng());
    if (axes.includes('x')) $('h-area-width').value = Math.round(Math.max(10,Math.min(600,Math.abs(local.x)*2)));
    if (axes.includes('y')) $('h-area-length').value = Math.round(Math.max(10,Math.min(600,Math.abs(local.y)*2)));
    updateFromFields(true);
  }

  function createHandle(xFactor,yFactor,kind,axes) {
    const area = readFields();
    const marker = L.marker(localToLatLng(area,area.areaWidth/2*xFactor,area.areaLength/2*yFactor),{
      draggable:true,keyboard:false,zIndexOffset:1850,icon:handleIcon(kind),title:'Drag to resize hospital drivable area',
    }).addTo(editorMap);
    marker._ptboHospitalHandle = {xFactor,yFactor,kind,axes};
    marker.on('drag',event => resizeHandle(marker,axes,event));
    marker.on('dragend',() => setStatus('Hospital drivable area resized. Save on This Device to keep it.'));
    return marker;
  }

  function ensureCheckpointInside() {
    const area = readFields();
    try {
      store.stage(area);
      return true;
    } catch (_) {
      $('b-lat').value = Number(area.areaLat).toFixed(6);
      $('b-lng').value = Number(area.areaLng).toFixed(6);
      store.stage(readFields());
      setStatus('Checkpoint moved to the centre because the resized hospital area no longer contained it.');
      return false;
    }
  }

  function updateGeometry() {
    if (!editorMap || !isHospitalOpen()) return;
    const area = readFields();
    const stagedArea = store.getAreaRecord ? null : null;
    const corners = [
      localToLatLng(area,-area.areaWidth/2,-area.areaLength/2),
      localToLatLng(area, area.areaWidth/2,-area.areaLength/2),
      localToLatLng(area, area.areaWidth/2, area.areaLength/2),
      localToLatLng(area,-area.areaWidth/2, area.areaLength/2),
    ];
    polygon?.setLatLngs(corners);
    handles.forEach(marker => {
      const h = marker._ptboHospitalHandle;
      if (h) marker.setLatLng(localToLatLng(area,area.areaWidth/2*h.xFactor,area.areaLength/2*h.yFactor));
    });
    checkpointMarker?.setLatLng([numeric('b-lat'),numeric('b-lng')]);
  }

  function renderLayers() {
    if (!editorMap || !isHospitalOpen()) { removeLayers(); return; }
    const area = readFields();
    if (!polygon) {
      const corners = [
        localToLatLng(area,-area.areaWidth/2,-area.areaLength/2),
        localToLatLng(area, area.areaWidth/2,-area.areaLength/2),
        localToLatLng(area, area.areaWidth/2, area.areaLength/2),
        localToLatLng(area,-area.areaWidth/2, area.areaLength/2),
      ];
      polygon = L.polygon(corners,{color:'#60a5fa',weight:3,fillColor:'#3b82f6',fillOpacity:.14,interactive:true,className:'ptbo-hospital-area-surface'}).addTo(editorMap);
      polygon.bindTooltip('Hospital drivable area · drag box to move · handles resize',{sticky:true});
      polygon.on('mousedown',beginMove);
      handles = [
        createHandle(1,0,'width','x'),createHandle(-1,0,'width','x'),
        createHandle(0,1,'length','y'),createHandle(0,-1,'length','y'),
        createHandle(1,1,'corner','xy'),createHandle(-1,1,'corner','xy'),
        createHandle(1,-1,'corner','xy'),createHandle(-1,-1,'corner','xy'),
      ];
    }
    if (!checkpointMarker) {
      checkpointMarker = L.marker([area.checkpointLat,area.checkpointLng],{draggable:true,keyboard:false,zIndexOffset:2100,icon:checkpointIcon(),title:'Ambulance hospital drop-off checkpoint'}).addTo(editorMap);
      checkpointMarker.bindTooltip('Ambulance drop-off checkpoint · drag to move',{direction:'top',offset:[0,-28]});
      checkpointMarker.on('dragstart',() => { lastCheckpoint = checkpointMarker.getLatLng(); });
      checkpointMarker.on('drag',event => {
        const p = event.target.getLatLng();
        const draft = readFields();
        try { store.stage({...draft,checkpointLat:p.lat,checkpointLng:p.lng}); lastCheckpoint = L.latLng(p.lat,p.lng); } catch (_) {}
      });
      checkpointMarker.on('dragend',event => {
        const p = event.target.getLatLng();
        const draft = readFields();
        try {
          store.stage({...draft,checkpointLat:p.lat,checkpointLng:p.lng});
          $('b-lat').value = p.lat.toFixed(6); $('b-lng').value = p.lng.toFixed(6);
          lastCheckpoint = L.latLng(p.lat,p.lng);
          setStatus('Hospital checkpoint moved. Save on This Device to keep it.');
        } catch (_) {
          const fallback = lastCheckpoint || L.latLng(draft.checkpointLat,draft.checkpointLng);
          event.target.setLatLng(fallback);
          setStatus('The ambulance drop-off checkpoint must stay inside the hospital drivable area.');
        }
      });
    }
    updateGeometry();
  }

  function updateAccess() {
    if (!isHospitalOpen()) return;
    const node = $('access-check');
    if (!node) return;
    if (!roads) { node.textContent = 'Road access check is loading…'; return; }
    node.textContent = store.roadAccess(roads)
      ? '✓ Hospital drivable area connects to the mapped road network.'
      : 'Hospital drivable area does not meet a mapped road. Move or resize it before saving.';
  }

  function updateFromFields(resizeMayMoveCheckpoint) {
    if (!isHospitalOpen()) return;
    try {
      if (resizeMayMoveCheckpoint) ensureCheckpointInside();
      else store.stage(readFields());
      renderLayers();
      updateAccess();
    } catch (error) {
      setStatus(error.message || String(error));
    }
  }

  function polishLabels() {
    if (!isHospitalOpen()) return;
    const labelText = (id,text) => { const span=$(id)?.closest('label')?.querySelector('span'); if (span) span.textContent=text; };
    labelText('b-lat','Checkpoint latitude');
    labelText('b-lng','Checkpoint longitude');
    labelText('b-radius','Checkpoint radius (m)');
    if ($('base-help')) $('base-help').textContent = 'The blue rectangle is the hospital drivable area. Resize or move it, then place the ambulance drop-off checkpoint anywhere inside it.';
    if ($('move-base')) $('move-base').textContent = 'Move Checkpoint on Map';
    if ($('review-count')) $('review-count').textContent = 'Box = EMS drivable area';
  }

  function syncFromEditor() {
    installStyle();
    installFields();
    if (!isHospitalOpen()) {
      loadedHospital = false;
      store.clearStage();
      removeLayers();
      return;
    }
    if (!loadedHospital) {
      loadedHospital = true;
      populate();
      removeLayers();
    }
    polishLabels();
    renderLayers();
    updateAccess();
  }

  const observer = new MutationObserver(scheduleSync);
  const start = () => {
    installStyle(); installFields();
    const form = $('base-editor');
    if (form) observer.observe(form,{attributes:true,attributeFilter:['class']});
    const baseId = document.getElementById('base-id');
    if (baseId) observer.observe(baseId,{childList:true,characterData:true,subtree:true});
    addEventListener('mouseup',endMove);
    fetch('../city-explorer/data/osm-public-roads.geojson',{cache:'force-cache'})
      .then(response => { if (!response.ok) throw new Error('Road data unavailable'); return response.json(); })
      .then(data => { roads=data; updateAccess(); })
      .catch(() => { roads=null; updateAccess(); });
    window.addEventListener('ptbo-hospital-dropoff-updated',() => { loadedHospital=false; scheduleSync(); });
    syncFromEditor();
  };

  window.PTBO_HOSPITAL_DROPOFF_EDITOR = Object.freeze({version:VERSION,sync:syncFromEditor});
  start();
})();
