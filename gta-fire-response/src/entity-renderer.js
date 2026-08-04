function supportVehicleLabel(kind) {
  return ({ ambulance:'EMS', police:'POL', engine:'ENG', ladder:'LAD', rescue:'RES' })[kind] || String(kind || 'UNIT').slice(0,3).toUpperCase();
}

function markerMarkup(entity) {
  const kind = entity.kind || entity.type;
  if (entity.type === 'pedestrian') {
    const symbol = entity.state === 'filming' ? '▣' : entity.state === 'fleeing' ? '!' : '●';
    return `<div class="phase2-person ${entity.state || ''}" data-entity-id="${entity.id}"><span>${symbol}</span></div>`;
  }
  if (entity.type === 'crew') return `<div class="phase2-crew" style="--entity-color:${entity.color || '#f4c542'}" data-entity-id="${entity.id}"><span>${String(entity.role || 'FF').slice(0,1)}</span></div>`;
  if (entity.type === 'supportVehicle') return `<div class="phase2-support-vehicle ${kind}" data-entity-id="${entity.id}"><span>${entity.symbol || supportVehicleLabel(kind)}</span></div>`;
  if (entity.type === 'supportPerson') return `<div class="phase2-support-person ${kind}" data-entity-id="${entity.id}"><span>${kind === 'paramedic' ? '✚' : '◆'}</span></div>`;
  if (entity.type === 'hydrant') return `<div class="phase2-hydrant ${entity.state || ''}" data-entity-id="${entity.id}"><span>H</span></div>`;
  if (entity.type === 'patient') return `<div class="phase2-patient ${entity.state || ''}" data-entity-id="${entity.id}"><span>+</span></div>`;
  if (entity.type === 'prop') return `<div class="phase2-prop ${kind}" data-entity-id="${entity.id}"><span>${entity.symbol || '◆'}</span></div>`;
  return `<div class="phase2-generic" data-entity-id="${entity.id}"><span>•</span></div>`;
}

export class EntityRenderer {
  constructor(mapRenderer) {
    this.base = mapRenderer;
    this.map = mapRenderer.map;
    this.markers = new Map();
    this.supplyLine = null;
    this.dayOverlay = null;
    this.sceneZone = null;
  }
  ensureOverlay() {
    if (this.dayOverlay) return;
    this.dayOverlay = document.createElement('div');
    this.dayOverlay.className = 'phase2-day-overlay';
    document.body.appendChild(this.dayOverlay);
  }
  ensureMarker(entity) {
    let marker = this.markers.get(entity.id);
    if (marker) return marker;
    const sizes = { pedestrian: [22,22], crew: [24,24], supportVehicle: [42,42], supportPerson: [23,23], hydrant: [28,28], patient: [28,28], prop: [28,28] };
    const size = sizes[entity.type] || [24,24];
    marker = L.marker([entity.position.lat, entity.position.lng], {
      interactive: false,
      zIndexOffset: entity.type === 'crew' ? 1250 : entity.type === 'pedestrian' ? 760 : entity.type === 'supportVehicle' ? 1100 : 850,
      icon: L.divIcon({ className: `phase2-marker phase2-${entity.type}`, html: markerMarkup(entity), iconSize: size, iconAnchor: [size[0]/2,size[1]/2] })
    }).addTo(this.map);
    this.markers.set(entity.id, marker);
    entity.renderRef = marker;
    return marker;
  }
  update(entities) {
    const activeIds = new Set();
    for (const entity of entities) {
      activeIds.add(entity.id);
      const marker = this.ensureMarker(entity);
      marker.setLatLng([entity.position.lat, entity.position.lng]).setOpacity(entity.active === false ? 0 : 1);
      const element = marker.getElement()?.firstElementChild;
      if (element) {
        element.className = element.className.split(' ').filter(name => !['walking','waiting','yielding','watching','fleeing','filming','arrived','connected','treated','responding'].includes(name)).join(' ');
        if (entity.state) element.classList.add(entity.state);
        element.style.transform = `translate(-50%,-50%) rotate(${entity.heading || 0}deg)`;
      }
    }
    for (const [id, marker] of this.markers) {
      if (!activeIds.has(id)) { marker.remove(); this.markers.delete(id); }
    }
  }
  setSupplyLine(hydrant, truck, connected) {
    if (!connected || !hydrant) {
      this.supplyLine?.remove(); this.supplyLine = null; return;
    }
    const points = [[hydrant.position.lat, hydrant.position.lng], [truck.lat, truck.lng]];
    if (!this.supplyLine) this.supplyLine = L.polyline(points, { color:'#f4c542', weight:6, opacity:.88, dashArray:'12 5', interactive:false }).addTo(this.map);
    else this.supplyLine.setLatLngs(points);
  }
  setTrafficZone(center, active) {
    if (!active || !center) { this.sceneZone?.remove(); this.sceneZone = null; return; }
    if (!this.sceneZone) this.sceneZone = L.circle([center.lat, center.lng], { radius:42, color:'#3aa0ff', weight:2, opacity:.55, fillOpacity:.05, dashArray:'8 8', interactive:false }).addTo(this.map);
    else this.sceneZone.setLatLng([center.lat, center.lng]);
  }
  setTimeOfDay(mode) {
    this.ensureOverlay();
    this.dayOverlay.dataset.time = mode;
  }
  clear() {
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    this.supplyLine?.remove(); this.supplyLine = null;
    this.sceneZone?.remove(); this.sceneZone = null;
  }
}
