(() => {
  'use strict';

  if (window.PTBO_ROUTE_REVEAL) return;

  const CONFIG = Object.freeze({
    dataUrl: '../city-explorer/data/osm-public-roads.geojson',
    centerLat: 44.3091,
    centerLng: -78.3197,
    gridSize: 120,
    startSnapRadius: 180,
    destinationSnapRadius: 500,
    startCandidates: 8,
    destinationCandidates: 10,
    rerouteDistance: 45,
    rerouteIntervalMs: 1800,
    maxVisitedNodes: 120000,
  });

  const METERS_PER_LAT = 110540;
  const METERS_PER_LNG = 111320 * Math.cos(CONFIG.centerLat * Math.PI / 180);

  const ROAD_PROFILE = Object.freeze({
    motorway: { speed: 100, priority: 0.86 },
    motorway_link: { speed: 55, priority: 0.94 },
    trunk: { speed: 80, priority: 0.88 },
    trunk_link: { speed: 50, priority: 0.96 },
    primary: { speed: 65, priority: 0.88 },
    primary_link: { speed: 45, priority: 0.96 },
    secondary: { speed: 55, priority: 0.92 },
    secondary_link: { speed: 40, priority: 0.98 },
    tertiary: { speed: 45, priority: 1.0 },
    tertiary_link: { speed: 35, priority: 1.04 },
    unclassified: { speed: 35, priority: 1.18 },
    residential: { speed: 32, priority: 1.32 },
    living_street: { speed: 18, priority: 1.62 },
    service: { speed: 18, priority: 1.82 },
    road: { speed: 28, priority: 1.28 },
  });

  const state = {
    status: 'loading',
    graph: null,
    routeVisible: false,
    currentIncidentKey: null,
    routeCasing: null,
    routeLine: null,
    lastRouteOrigin: null,
    lastRoute: null,
    button: null,
    card: null,
    rerouteTimer: null,
    calculating: false,
  };

  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  function toXY(lat, lng) {
    return {
      x: (lng - CONFIG.centerLng) * METERS_PER_LNG,
      y: (lat - CONFIG.centerLat) * METERS_PER_LAT,
    };
  }

  function distanceMeters(aLat, aLng, bLat, bLng) {
    const a = toXY(aLat, aLng);
    const b = toXY(bLat, bLng);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function coordinateKey(lng, lat) {
    return `${Number(lng).toFixed(7)},${Number(lat).toFixed(7)}`;
  }

  function routeProfile(properties = {}) {
    const highway = String(properties.highway || 'road').toLowerCase();
    return { highway, ...(ROAD_PROFILE[highway] || ROAD_PROFILE.road) };
  }

  function isForwardOnly(properties = {}) {
    const value = String(properties.oneway || '').toLowerCase();
    return value === 'yes' || value === 'true' || value === '1';
  }

  function isReverseOnly(properties = {}) {
    return String(properties.oneway || '').toLowerCase() === '-1';
  }

  function edgeLabel(properties = {}) {
    return String(properties.name || properties.ref || '').trim() || 'Unnamed road';
  }

  function buildGraph(geojson) {
    const nodes = [];
    const nodeByCoordinate = new Map();
    const grid = new Map();
    let directedEdges = 0;

    function registerNode(coordinate) {
      if (!Array.isArray(coordinate) || coordinate.length < 2) return -1;
      const lng = Number(coordinate[0]);
      const lat = Number(coordinate[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return -1;
      const key = coordinateKey(lng, lat);
      const existing = nodeByCoordinate.get(key);
      if (existing !== undefined) return existing;
      const xy = toXY(lat, lng);
      const id = nodes.length;
      nodes.push({ id, lat, lng, x: xy.x, y: xy.y, edges: [] });
      nodeByCoordinate.set(key, id);
      const cellKey = `${Math.floor(xy.x / CONFIG.gridSize)},${Math.floor(xy.y / CONFIG.gridSize)}`;
      const bucket = grid.get(cellKey);
      if (bucket) bucket.push(id);
      else grid.set(cellKey, [id]);
      return id;
    }

    function addDirectedEdge(from, to, properties) {
      if (from < 0 || to < 0 || from === to) return;
      const a = nodes[from];
      const b = nodes[to];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (distance < 0.2) return;
      const profile = routeProfile(properties);
      const duration = distance / (profile.speed / 3.6);
      a.edges.push({
        to,
        distance,
        duration,
        weight: duration * profile.priority,
        highway: profile.highway,
        name: edgeLabel(properties),
        ref: String(properties.ref || '').trim(),
      });
      directedEdges += 1;
    }

    function addLine(coordinates, properties) {
      if (!Array.isArray(coordinates) || coordinates.length < 2) return;
      const ids = coordinates.map(registerNode);
      for (let index = 1; index < ids.length; index += 1) {
        const from = ids[index - 1];
        const to = ids[index];
        if (isReverseOnly(properties)) addDirectedEdge(to, from, properties);
        else {
          addDirectedEdge(from, to, properties);
          if (!isForwardOnly(properties)) addDirectedEdge(to, from, properties);
        }
      }
    }

    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    features.forEach(feature => {
      const geometry = feature?.geometry;
      const properties = feature?.properties || {};
      if (geometry?.type === 'LineString') addLine(geometry.coordinates, properties);
      if (geometry?.type === 'MultiLineString') geometry.coordinates.forEach(line => addLine(line, properties));
    });

    if (!nodes.length || !directedEdges) throw new Error('The routing graph did not contain any usable roads.');
    return { nodes, grid, directedEdges };
  }

  function nearestNodes(lat, lng, count, maxRadius) {
    if (!state.graph) return [];
    const point = toXY(lat, lng);
    const radiusCells = Math.max(1, Math.ceil(maxRadius / CONFIG.gridSize));
    const centerX = Math.floor(point.x / CONFIG.gridSize);
    const centerY = Math.floor(point.y / CONFIG.gridSize);
    const found = [];
    const seen = new Set();

    for (let offsetX = -radiusCells; offsetX <= radiusCells; offsetX += 1) {
      for (let offsetY = -radiusCells; offsetY <= radiusCells; offsetY += 1) {
        const bucket = state.graph.grid.get(`${centerX + offsetX},${centerY + offsetY}`);
        if (!bucket) continue;
        bucket.forEach(id => {
          if (seen.has(id)) return;
          seen.add(id);
          const node = state.graph.nodes[id];
          const distance = Math.hypot(node.x - point.x, node.y - point.y);
          if (distance <= maxRadius) found.push({ id, distance });
        });
      }
    }

    return found.sort((a, b) => a.distance - b.distance).slice(0, count);
  }

  class MinHeap {
    constructor() {
      this.items = [];
    }

    get size() {
      return this.items.length;
    }

    push(item) {
      const items = this.items;
      items.push(item);
      let index = items.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (items[parent].score <= item.score) break;
        items[index] = items[parent];
        index = parent;
      }
      items[index] = item;
    }

    pop() {
      const items = this.items;
      if (!items.length) return null;
      const root = items[0];
      const tail = items.pop();
      if (items.length && tail) {
        let index = 0;
        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          if (left >= items.length) break;
          let child = left;
          if (right < items.length && items[right].score < items[left].score) child = right;
          if (items[child].score >= tail.score) break;
          items[index] = items[child];
          index = child;
        }
        items[index] = tail;
      }
      return root;
    }
  }

  function heuristic(node, destination) {
    const straightDistance = Math.hypot(destination.x - node.x, destination.y - node.y);
    return straightDistance / (112 / 3.6) * 0.82;
  }

  function calculateRoute(startLat, startLng, endLat, endLng) {
    if (!state.graph) return null;
    const startCandidates = nearestNodes(startLat, startLng, CONFIG.startCandidates, CONFIG.startSnapRadius);
    const endCandidates = nearestNodes(endLat, endLng, CONFIG.destinationCandidates, CONFIG.destinationSnapRadius);
    if (!startCandidates.length || !endCandidates.length) return null;

    const { nodes } = state.graph;
    const destinationXY = toXY(endLat, endLng);
    const destinationSet = new Map(endCandidates.map(candidate => [candidate.id, candidate.distance / 9]));
    const scores = new Float64Array(nodes.length);
    const previous = new Int32Array(nodes.length);
    const previousEdge = new Array(nodes.length);
    scores.fill(Infinity);
    previous.fill(-1);
    const heap = new MinHeap();

    startCandidates.forEach(candidate => {
      const connectorCost = candidate.distance / 12;
      if (connectorCost < scores[candidate.id]) {
        scores[candidate.id] = connectorCost;
        heap.push({ id: candidate.id, score: connectorCost + heuristic(nodes[candidate.id], destinationXY) });
      }
    });

    let bestDestination = -1;
    let bestTotal = Infinity;
    let visited = 0;

    while (heap.size && visited < CONFIG.maxVisitedNodes) {
      const current = heap.pop();
      if (!current) break;
      const currentNode = nodes[current.id];
      const expected = scores[current.id] + heuristic(currentNode, destinationXY);
      if (current.score > expected + 1e-7) continue;
      if (current.score >= bestTotal) break;
      visited += 1;

      const terminalCost = destinationSet.get(current.id);
      if (terminalCost !== undefined) {
        const total = scores[current.id] + terminalCost;
        if (total < bestTotal) {
          bestTotal = total;
          bestDestination = current.id;
        }
      }

      for (const edge of currentNode.edges) {
        const nextScore = scores[current.id] + edge.weight;
        if (nextScore + 1e-7 >= scores[edge.to]) continue;
        scores[edge.to] = nextScore;
        previous[edge.to] = current.id;
        previousEdge[edge.to] = edge;
        heap.push({ id: edge.to, score: nextScore + heuristic(nodes[edge.to], destinationXY) });
      }
    }

    if (bestDestination < 0) return null;

    const nodeIds = [];
    const edges = [];
    let cursor = bestDestination;
    while (cursor >= 0) {
      nodeIds.push(cursor);
      if (previousEdge[cursor]) edges.push(previousEdge[cursor]);
      cursor = previous[cursor];
    }
    nodeIds.reverse();
    edges.reverse();

    const coordinates = [[startLat, startLng]];
    nodeIds.forEach(id => coordinates.push([nodes[id].lat, nodes[id].lng]));
    coordinates.push([endLat, endLng]);

    const connectorDistance = startCandidates.find(candidate => candidate.id === nodeIds[0])?.distance || 0;
    const destinationDistance = endCandidates.find(candidate => candidate.id === bestDestination)?.distance || 0;
    const distance = connectorDistance + destinationDistance + edges.reduce((sum, edge) => sum + edge.distance, 0);
    const duration = connectorDistance / 12 + destinationDistance / 9 + edges.reduce((sum, edge) => sum + edge.duration, 0);
    return {
      coordinates,
      edges,
      distance,
      duration,
      visited,
      mainRoads: summarizeRoads(edges),
    };
  }

  function summarizeRoads(edges) {
    const roads = [];
    edges.forEach(edge => {
      const name = edge.name === 'Unnamed road' ? edge.ref : edge.name;
      if (!name) return;
      const last = roads[roads.length - 1];
      if (last?.name === name) last.distance += edge.distance;
      else roads.push({ name, distance: edge.distance, highway: edge.highway });
    });
    return roads
      .filter(road => road.distance >= 35)
      .slice(0, 6)
      .map(road => road.name);
  }

  function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
    return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
  }

  function formatDuration(seconds) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `about ${minutes} min`;
  }

  function installStyles() {
    if (document.getElementById('route-reveal-styles')) return;
    const style = document.createElement('style');
    style.id = 'route-reveal-styles';
    style.textContent = `
      #route-answer-btn{margin-top:6px;background:#0369a1;border:1px solid #38bdf8;color:#fff}
      #route-answer-btn:hover{background:#075985}
      #route-answer-btn.is-visible{background:#6b21a8;border-color:#c084fc}
      #route-answer-btn:disabled{cursor:not-allowed;opacity:.48}
      #route-answer-card{position:absolute;left:15px;bottom:38px;z-index:1200;width:min(370px,calc(100vw - 30px));padding:12px 14px;color:#f8fafc;border:1px solid rgba(56,189,248,.55);border-radius:10px;background:rgba(8,18,32,.94);box-shadow:0 8px 28px rgba(0,0,0,.42);pointer-events:none}
      #route-answer-card.hidden{display:none}
      #route-answer-card .route-kicker{color:#67e8f9;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
      #route-answer-card .route-title{margin-top:3px;font-size:15px;font-weight:850}
      #route-answer-card .route-meta{margin-top:5px;color:#cbd5e1;font-size:11px;line-height:1.4}
      #route-answer-card .route-roads{margin-top:6px;color:#f8fafc;font-size:11px;font-weight:750;line-height:1.45}
      @media(max-width:900px),(pointer:coarse){#route-answer-card{bottom:calc(186px + env(safe-area-inset-bottom));left:10px;width:min(360px,calc(100vw - 20px));padding:10px 12px}#route-answer-btn{font-size:10px!important;padding:7px 5px!important}}
      @media(orientation:landscape) and (max-height:560px){#route-answer-card{bottom:calc(142px + env(safe-area-inset-bottom));max-width:330px}}
    `;
    document.head.appendChild(style);
  }

  function installUi() {
    if (state.button) return;
    installStyles();
    const timerBlock = document.querySelector('.hud-timer-block');
    if (!timerBlock) return;

    const button = document.createElement('button');
    button.id = 'route-answer-btn';
    button.className = 'hud-btn';
    button.type = 'button';
    button.textContent = 'Reveal Route';
    button.disabled = true;
    button.title = 'Reveal the suggested response route from the truck to the active call';
    button.addEventListener('click', toggleRoute);
    timerBlock.appendChild(button);

    const card = document.createElement('section');
    card.id = 'route-answer-card';
    card.className = 'hidden';
    card.setAttribute('aria-live', 'polite');
    document.body.appendChild(card);

    state.button = button;
    state.card = card;
    updateButton();
  }

  function incidentKey(incident) {
    if (!incident) return null;
    return incident.id || `${incident.name}|${incident.addr}|${incident.lat}|${incident.lng}`;
  }

  function updateButton(message) {
    if (!state.button) return;
    const active = simulationState === STATES.ENROUTE && activeIncident;
    state.button.disabled = !active || state.status !== 'ready' || state.calculating;
    state.button.classList.toggle('is-visible', state.routeVisible);
    state.button.textContent = message || (state.routeVisible ? 'Hide Route' : state.status === 'loading' ? 'Loading Route…' : 'Reveal Route');
    state.button.style.display = active ? '' : 'none';
  }

  function clearRouteLayers() {
    if (state.routeCasing && mapInstance) mapInstance.removeLayer(state.routeCasing);
    if (state.routeLine && mapInstance) mapInstance.removeLayer(state.routeLine);
    state.routeCasing = null;
    state.routeLine = null;
  }

  function drawRoute(route, fit = true) {
    clearRouteLayers();
    state.routeCasing = L.polyline(route.coordinates, {
      color: '#07111f',
      weight: 10,
      opacity: 0.82,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
    }).addTo(mapInstance);
    state.routeLine = L.polyline(route.coordinates, {
      color: '#22d3ee',
      weight: 6,
      opacity: 0.96,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
    }).addTo(mapInstance);
    if (fit) mapInstance.fitBounds(state.routeLine.getBounds(), { padding: [45, 45], maxZoom: 16, animate: true });
  }

  function updateCard(route) {
    if (!state.card || !activeIncident) return;
    const roads = route.mainRoads.length ? route.mainRoads.join(' → ') : 'Follow the highlighted route';
    state.card.innerHTML = `
      <div class="route-kicker">Answer revealed · suggested response route</div>
      <div class="route-title">${escapeHtml(activeIncident.name)}</div>
      <div class="route-meta">${formatDistance(route.distance)} · ${formatDuration(route.duration)} · favours arterial and collector roads</div>
      <div class="route-roads">${escapeHtml(roads)}</div>
    `;
    state.card.classList.remove('hidden');
  }

  function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
  }

  function showRoute(fit = true) {
    if (state.calculating || state.status !== 'ready' || !activeIncident || simulationState !== STATES.ENROUTE) return false;
    state.calculating = true;
    updateButton('Routing…');
    try {
      const route = calculateRoute(simLat, simLng, activeIncident.lat, activeIncident.lng);
      if (!route) {
        state.routeVisible = false;
        if (state.card) {
          state.card.innerHTML = '<div class="route-kicker">Route unavailable</div><div class="route-meta">No connected road route could be calculated from the truck’s current position.</div>';
          state.card.classList.remove('hidden');
        }
        return false;
      }
      state.routeVisible = true;
      state.lastRouteOrigin = { lat: simLat, lng: simLng };
      state.lastRoute = route;
      drawRoute(route, fit);
      updateCard(route);
      startRerouting();
      return true;
    } finally {
      state.calculating = false;
      updateButton();
    }
  }

  function hideRoute({ recenter = false } = {}) {
    state.routeVisible = false;
    state.lastRoute = null;
    state.lastRouteOrigin = null;
    clearRouteLayers();
    stopRerouting();
    if (state.card) state.card.classList.add('hidden');
    if (recenter && mapInstance) mapInstance.setView([simLat, simLng], mapInstance.getZoom(), { animate: true });
    updateButton();
  }

  function toggleRoute() {
    if (state.routeVisible) hideRoute({ recenter: true });
    else showRoute(true);
  }

  function startRerouting() {
    stopRerouting();
    state.rerouteTimer = setInterval(() => {
      if (!state.routeVisible || !activeIncident || simulationState !== STATES.ENROUTE) {
        hideRoute();
        return;
      }
      if (!state.lastRouteOrigin) return;
      const moved = distanceMeters(state.lastRouteOrigin.lat, state.lastRouteOrigin.lng, simLat, simLng);
      if (moved >= CONFIG.rerouteDistance) showRoute(false);
    }, CONFIG.rerouteIntervalMs);
  }

  function stopRerouting() {
    if (state.rerouteTimer) clearInterval(state.rerouteTimer);
    state.rerouteTimer = null;
  }

  function syncIncidentState() {
    installUi();
    const key = simulationState === STATES.ENROUTE ? incidentKey(activeIncident) : null;
    if (key !== state.currentIncidentKey) {
      state.currentIncidentKey = key;
      hideRoute();
    }
    updateButton();
  }

  async function initialize() {
    installUi();
    setInterval(syncIncidentState, 300);
    try {
      const response = await fetch(CONFIG.dataUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Routing data request failed: ${response.status}`);
      const geojson = await response.json();
      state.graph = buildGraph(geojson);
      state.status = 'ready';
      readyResolve({ nodes: state.graph.nodes.length, edges: state.graph.directedEdges });
      updateButton();
      window.dispatchEvent?.(new CustomEvent('ptbo-route-reveal-ready', { detail: { nodes: state.graph.nodes.length, edges: state.graph.directedEdges } }));
    } catch (error) {
      console.error('Route answer system could not start.', error);
      state.status = 'failed';
      readyReject(error);
      updateButton('Route Unavailable');
    }
  }

  window.PTBO_ROUTE_REVEAL = Object.freeze({
    ready,
    state,
    calculateRoute,
    showRoute,
    hideRoute,
  });

  initialize();
})();
