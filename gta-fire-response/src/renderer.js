import { STATION } from './config.js';

function truckMarkup() {
  return `<div class="truck-visual" data-testid="fire-truck">
    <svg viewBox="0 0 100 30" aria-hidden="true">
      <rect x="2" y="3" width="96" height="24" rx="4" fill="#d9534f" stroke="#741b1b" stroke-width="1.4"/>
      <rect x="72" y="4" width="26" height="22" rx="2" fill="#c9302c"/>
      <rect x="89" y="5" width="4" height="20" rx="1" fill="#dff8ff" opacity=".92"/>
      <rect x="78" y="3.5" width="7" height="2" fill="#dff8ff" opacity=".9"/>
      <rect x="78" y="24.5" width="7" height="2" fill="#dff8ff" opacity=".9"/>
      <rect class="light-blue" x="74" y="1" width="4" height="11" rx="1"/>
      <rect class="light-red" x="74" y="18" width="4" height="11" rx="1"/>
      <rect x="30" y="5" width="38" height="20" fill="#62666b" rx="1"/>
      <line x1="40" y1="5" x2="40" y2="25" stroke="#373a3e" stroke-width="2"/>
      <line x1="50" y1="5" x2="50" y2="25" stroke="#373a3e" stroke-width="2"/>
      <line x1="60" y1="5" x2="60" y2="25" stroke="#373a3e" stroke-width="2"/>
      <g fill="none" stroke="#ececec" stroke-width="1.5">
        <rect x="4" y="4.5" width="22" height="6"/><rect x="4" y="19.5" width="22" height="6"/>
        <path d="M9 4.5v6m5-6v6m5-6v6M9 19.5v6m5-6v6m5-6v6"/>
      </g>
      <rect x="67" y="6" width="4" height="18" rx="1" fill="#e8e8e8" opacity=".75"/>
    </svg>
  </div>`;
}

function firefighterMarkup() {
  return `<div class="firefighter-visual" data-testid="firefighter">
    <span class="ff-helmet"></span><span class="ff-head"></span><span class="ff-pack"></span>
    <span class="ff-body"></span><span class="ff-arm left"></span><span class="ff-arm right"></span>
    <span class="ff-leg left"></span><span class="ff-leg right"></span>
  </div>`;
}

function trafficMarkup(index) {
  const hue = [205, 45, 280, 125, 12, 190][index % 6];
  return `<div class="traffic-visual" style="--traffic-hue:${hue}" aria-hidden="true"><span></span></div>`;
}

export class MapRenderer {
  constructor({ disableTiles = false, reducedFlashing = false } = {}) {
    this.disableTiles = disableTiles;
    this.reducedFlashing = reducedFlashing;
    this.map = null;
    this.playerMarker = null;
    this.truckMarker = null;
    this.stationMarker = null;
    this.incidentMarker = null;
    this.routeLine = null;
    this.hoseLine = null;
    this.streamLine = null;
    this.trafficMarkers = [];
    this.tileLoads = 0;
    this.tileLoadingElement = document.getElementById('tile-loading');
  }

  init(player, truck) {
    this.map = L.map('map', {
      zoomControl: false, attributionControl: true, preferCanvas: true,
      zoomSnap: .25, zoomDelta: .25, inertia: false, minZoom: 12, maxZoom: 20
    }).setView([STATION.lat, STATION.lng], 19);

    if (!this.disableTiles) {
      const imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 20, maxNativeZoom: 19, keepBuffer: 4, updateWhenIdle: true,
        updateWhenZooming: false, attribution: 'Tiles © Esri'
      });
      const labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 20, keepBuffer: 3, updateWhenIdle: true, updateWhenZooming: false,
        opacity: .78, attribution: 'Labels © Esri'
      });
      const begin = () => { this.tileLoads += 1; this.tileLoadingElement?.classList.add('show'); };
      const end = () => { this.tileLoads = Math.max(0, this.tileLoads - 1); if (!this.tileLoads) this.tileLoadingElement?.classList.remove('show'); };
      imagery.on?.('loading', begin).on?.('load', end).on?.('tileerror', end).addTo(this.map);
      labels.on?.('loading', begin).on?.('load', end).on?.('tileerror', end).addTo(this.map);
    } else {
      document.getElementById('map')?.classList.add('test-map');
    }

    this.stationMarker = L.marker([STATION.lat, STATION.lng], {
      interactive: false,
      icon: L.divIcon({ className: 'game-marker', html: '<div class="station-marker"><span>1</span></div>', iconSize: [42, 42], iconAnchor: [21, 21] })
    }).addTo(this.map);
    this.playerMarker = L.marker([player.lat, player.lng], {
      zIndexOffset: 1300, interactive: false,
      icon: L.divIcon({ className: 'game-marker', html: firefighterMarkup(), iconSize: [22, 28], iconAnchor: [11, 14] })
    }).addTo(this.map);
    this.truckMarker = L.marker([truck.lat, truck.lng], {
      zIndexOffset: 1200, interactive: false,
      icon: L.divIcon({ className: 'truck-marker', html: truckMarkup(), iconSize: [48, 48], iconAnchor: [24, 24] })
    }).addTo(this.map);

    this.map.dragging.disable();
    this.map.doubleClickZoom.disable();
    this.map.scrollWheelZoom.disable();
    this.map.touchZoom.disable();
    this.map.boxZoom.disable();
    this.map.keyboard.disable();
  }

  updatePlayer(player, visible = true) {
    this.playerMarker?.setLatLng([player.lat, player.lng]).setOpacity(visible ? 1 : 0);
    const visual = this.playerMarker?.getElement()?.querySelector('.firefighter-visual');
    if (visual) visual.style.transform = `rotate(${player.heading}deg)`;
  }

  updateTruck(truck, equipment) {
    this.truckMarker?.setLatLng([truck.lat, truck.lng]);
    const visual = this.truckMarker?.getElement()?.querySelector('.truck-visual');
    if (visual) visual.style.transform = `translate(-50%, -50%) rotate(${truck.heading - 90}deg)`;
    const element = this.truckMarker?.getElement();
    element?.classList.toggle('lights-active', equipment.lights);
    element?.classList.toggle('siren-active', equipment.siren && !this.reducedFlashing);
  }

  showIncident(call) {
    this.clearIncident();
    this.incidentMarker = L.marker([call.lat, call.lng], {
      zIndexOffset: 900, interactive: false,
      icon: L.divIcon({
        className: 'game-marker', html: `<div class="incident-marker ${call.type}" data-testid="incident-marker">${call.icon}</div>`,
        iconSize: [48, 48], iconAnchor: [24, 24]
      })
    }).addTo(this.map);
  }

  setRoute(from, to, visible = true) {
    if (!visible) { this.routeLine?.remove(); this.routeLine = null; return; }
    const points = [[from.lat, from.lng], [to.lat, to.lng]];
    if (!this.routeLine) this.routeLine = L.polyline(points, { color: '#ffd43b', weight: 4, opacity: .75, dashArray: '8 10', interactive: false }).addTo(this.map);
    else this.routeLine.setLatLngs(points);
  }

  setFireIntensity(intensity) {
    const marker = this.incidentMarker?.getElement()?.querySelector('.incident-marker');
    if (!marker) return;
    marker.style.setProperty('--fire-intensity', Math.max(.12, intensity / 100));
    marker.classList.toggle('controlled', intensity <= 0);
  }

  setHose(truck, player, visible) {
    if (!visible) { this.hoseLine?.remove(); this.hoseLine = null; return; }
    const points = [[truck.lat, truck.lng], [player.lat, player.lng]];
    if (!this.hoseLine) this.hoseLine = L.polyline(points, { color: '#d9c39b', weight: 5, opacity: .9, interactive: false }).addTo(this.map);
    else this.hoseLine.setLatLngs(points);
  }

  setStream(from, to, visible, type = 'hose') {
    if (!visible) { this.streamLine?.remove(); this.streamLine = null; return; }
    const points = [[from.lat, from.lng], [to.lat, to.lng]];
    const style = type === 'extinguisher' ? { color: '#f5f5f5', weight: 8, opacity: .72, dashArray: '2 8' } : { color: '#71d4ff', weight: 5, opacity: .86 };
    if (!this.streamLine) this.streamLine = L.polyline(points, { ...style, interactive: false }).addTo(this.map);
    else { this.streamLine.setLatLngs(points); this.streamLine.setStyle?.(style); }
  }

  ensureTrafficMarker(index) {
    if (this.trafficMarkers[index]) return this.trafficMarkers[index];
    const marker = L.marker([0, 0], {
      zIndexOffset: 800, interactive: false,
      icon: L.divIcon({ className: 'traffic-marker', html: trafficMarkup(index), iconSize: [30, 30], iconAnchor: [15, 15] })
    }).addTo(this.map);
    marker.setOpacity(0);
    this.trafficMarkers[index] = marker;
    return marker;
  }

  updateTraffic(vehicles) {
    vehicles.forEach((vehicle, index) => {
      const marker = this.ensureTrafficMarker(index);
      marker.setLatLng([vehicle.lat, vehicle.lng]).setOpacity(vehicle.active ? 1 : 0);
      const visual = marker.getElement()?.querySelector('.traffic-visual');
      if (visual) {
        visual.style.transform = `translate(-50%, -50%) rotate(${vehicle.heading - 90}deg)`;
        visual.classList.toggle('yielding', vehicle.state === 'yielding');
      }
    });
    for (let index = vehicles.length; index < this.trafficMarkers.length; index += 1) this.trafficMarkers[index].setOpacity(0);
  }

  clearIncident() {
    this.incidentMarker?.remove(); this.incidentMarker = null;
    this.routeLine?.remove(); this.routeLine = null;
    this.hoseLine?.remove(); this.hoseLine = null;
    this.streamLine?.remove(); this.streamLine = null;
  }

  entityCount() {
    return 2 + (this.stationMarker ? 1 : 0) + (this.incidentMarker ? 1 : 0) + this.trafficMarkers.filter(marker => Number(marker.getElement()?.style.opacity || 1) > 0).length;
  }
}
