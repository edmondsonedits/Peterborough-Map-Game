(() => {
  const params = new URLSearchParams(location.search);
  if (window.L && params.get('test') !== '1') return;

  class MiniLayer {
    constructor(element = null) { this.element = element; this.map = null; this.latlng = null; }
    addTo(map) { this.map = map; if (this.element) map.overlay.appendChild(this.element); return this; }
    remove() { this.element?.remove(); return this; }
    setLatLng(latlng) { this.latlng = Array.isArray(latlng) ? { lat: latlng[0], lng: latlng[1] } : latlng; this.render(); return this; }
    getLatLng() { return this.latlng; }
    setOpacity(value) { if (this.element) this.element.style.opacity = value; return this; }
    getElement() { return this.element; }
    render() {
      if (!this.element || !this.map || !this.latlng) return;
      const p = this.map.project(this.latlng);
      this.element.style.transform = `translate(${p.x}px, ${p.y}px)`;
    }
  }

  class MiniMap {
    constructor(id) {
      this.root = document.getElementById(id);
      this.root.classList.add('leaflet-fallback-map');
      this.center = { lat: 44.300871, lng: -78.322206 };
      this.zoom = 18;
      this.overlay = document.createElement('div');
      this.overlay.className = 'leaflet-fallback-overlay';
      this.root.appendChild(this.overlay);
      this.handlers = new Map();
      this.dragging = this.doubleClickZoom = this.scrollWheelZoom = this.touchZoom = this.boxZoom = this.keyboard = { disable() {} };
    }
    setView(latlng, zoom) { this.center = { lat: latlng[0], lng: latlng[1] }; if (zoom != null) this.zoom = zoom; this.redraw(); return this; }
    panTo(latlng) { this.center = { lat: latlng[0], lng: latlng[1] }; this.redraw(); return this; }
    setZoom(zoom) { this.zoom = zoom; this.redraw(); this.emit('zoomend'); return this; }
    getZoom() { return this.zoom; }
    getCenter() { return this.center; }
    stop() { return this; }
    invalidateSize() { this.redraw(); return this; }
    on(name, handler) { if (!this.handlers.has(name)) this.handlers.set(name, new Set()); this.handlers.get(name).add(handler); return this; }
    off(name, handler) { this.handlers.get(name)?.delete(handler); return this; }
    emit(name) { this.handlers.get(name)?.forEach(handler => handler()); }
    project(latlng) {
      const ll = Array.isArray(latlng) ? { lat: latlng[0], lng: latlng[1] } : latlng;
      const scale = 34000 * Math.pow(2, this.zoom - 18);
      return {
        x: this.root.clientWidth / 2 + (ll.lng - this.center.lng) * scale,
        y: this.root.clientHeight / 2 - (ll.lat - this.center.lat) * scale
      };
    }
    redraw() { this.overlay.querySelectorAll('.leaflet-marker-icon').forEach(element => element.__layer?.render()); }
  }

  function divIcon(options) { return options; }
  function marker(latlng, options = {}) {
    const element = document.createElement('div');
    element.className = `leaflet-marker-icon ${options.icon?.className || ''}`;
    element.innerHTML = options.icon?.html || '';
    element.style.position = 'absolute';
    element.style.left = '0';
    element.style.top = '0';
    const size = options.icon?.iconSize || [24, 24];
    const anchor = options.icon?.iconAnchor || [size[0] / 2, size[1] / 2];
    element.style.width = `${size[0]}px`;
    element.style.height = `${size[1]}px`;
    element.style.marginLeft = `${-anchor[0]}px`;
    element.style.marginTop = `${-anchor[1]}px`;
    const layer = new MiniLayer(element).setLatLng(latlng);
    element.__layer = layer;
    return layer;
  }
  function polyline(latlngs, options = {}) {
    const element = document.createElement('div');
    element.className = 'fallback-polyline';
    element.style.cssText = `position:absolute;pointer-events:none;border-top:${options.weight || 3}px ${options.dashArray ? 'dashed' : 'solid'} ${options.color || '#fff'};opacity:${options.opacity ?? 1}`;
    const layer = new MiniLayer(element);
    layer.setLatLngs = points => { layer.points = points; if (layer.map && points.length > 1) {
      const a = layer.map.project(points[0]); const b = layer.map.project(points.at(-1));
      const length = Math.hypot(b.x - a.x, b.y - a.y); const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      element.style.width = `${length}px`; element.style.transformOrigin = '0 0'; element.style.transform = `translate(${a.x}px, ${a.y}px) rotate(${angle}deg)`;
    } return layer; };
    layer.setStyle = style => { Object.assign(element.style, style); return layer; };
    layer.setLatLngs(latlngs);
    const originalAdd = layer.addTo.bind(layer);
    layer.addTo = map => { originalAdd(map); layer.setLatLngs(layer.points); return layer; };
    return layer;
  }
  function circleMarker(latlng, options = {}) {
    const size = (options.radius || 8) * 2;
    return marker(latlng, { icon: divIcon({ className: 'fallback-circle', html: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] }) });
  }
  function tileLayer() {
    const handlers = new Map();
    return { addTo() { queueMicrotask(() => handlers.get('load')?.()); return this; }, on(name, fn) { handlers.set(name, fn); return this; }, remove() { return this; } };
  }
  function layerGroup() { return { addTo() { return this; }, clearLayers() {}, addLayer() {}, remove() {} }; }

  window.L = { map: id => new MiniMap(id), divIcon, marker, polyline, circleMarker, circle: circleMarker, tileLayer, layerGroup };
  window.__LEAFLET_FALLBACK__ = true;
})();
