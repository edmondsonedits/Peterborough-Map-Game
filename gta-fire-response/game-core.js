'use strict';

const STATION = { lat: 44.300871, lng: -78.322206, name: 'Station 1', address: '210 Sherbrooke Street' };
const CALLS = [
  { type: 'fire', label: 'STRUCTURE FIRE', title: 'Residential Structure Fire', address: '465 Wellington Street', lat: 44.314737, lng: -78.336425, icon: '🔥', task: 'Deploy a hose line and extinguish the fire.' },
  { type: 'medical', label: 'MEDICAL AID', title: 'Difficulty Breathing', address: '26 Hospital Drive', lat: 44.301048, lng: -78.345609, icon: '✚', task: 'Assess the patient and provide oxygen.' },
  { type: 'mvc', label: 'RESCUE RESPONSE', title: 'Motor Vehicle Collision', address: 'Lansdowne Street West & Monaghan Road', lat: 44.285888, lng: -78.329751, icon: '⚠', task: 'Stabilize the vehicle and check occupants.' },
  { type: 'fire', label: 'VEHICLE FIRE', title: 'Vehicle Fire', address: '485 The Parkway', lat: 44.2855, lng: -78.3533, icon: '🔥', task: 'Advance the line and knock down the fire.' },
  { type: 'medical', label: 'MEDICAL AID', title: 'Unconscious Patient', address: '190 Simcoe Street', lat: 44.30471, lng: -78.321887, icon: '✚', task: 'Check airway, breathing, and circulation.' },
  { type: 'mvc', label: 'RESCUE RESPONSE', title: 'Collision with Entrapment', address: 'George Street North & Rink Street', lat: 44.295884, lng: -78.319339, icon: '⚠', task: 'Stabilize the scene and begin extrication.' }
];

const ROAD_CONFIG = Object.freeze({
  dataUrl: '../city-explorer/data/osm-public-roads.geojson',
  centerLat: 44.3091,
  centerLng: -78.3197,
  gridSize: 80,
  sweepStep: 1.35,
  shoulderTolerance: 1.35,
  spawnSnapDistance: 120,
  stationExitSearchDistance: 120,
  stationExitCorridorHalfWidth: 8,
  stationExitStartPadding: 4,
  laneAssist: 0.58,
  collisionSpeedRetention: 0.26
});
const METERS_PER_LAT = 110540;
const METERS_PER_LNG = 111320 * Math.cos(ROAD_CONFIG.centerLat * Math.PI / 180);
const ROAD_WIDTHS = Object.freeze({
  motorway: 16, motorway_link: 10, trunk: 15, trunk_link: 9,
  primary: 13, primary_link: 8.5, secondary: 11, secondary_link: 8,
  tertiary: 9, tertiary_link: 7.5, residential: 7, living_street: 6.5,
  unclassified: 6.5, service: 6, road: 6
});

const $ = id => document.getElementById(id);
const ui = {
  start: $('start-screen'), startButton: $('start-button'), loadStatus: $('load-status'),
  kicker: $('mission-kicker'), title: $('mission-title'), address: $('mission-address'),
  objective: $('mission-objective'), timer: $('timer'), progress: $('task-progress'),
  speed: $('speed'), score: $('score'), roadLock: $('road-lock'), prompt: $('prompt'),
  promptKey: $('prompt-key'), promptText: $('prompt-text'), toast: $('toast'),
  joystick: $('joystick'), stick: $('stick'), joystickLabel: $('joystick-label'),
  boost: $('gas-btn'), brake: $('brake-btn'), action: $('action-btn'), end: $('end-screen'),
  endTitle: $('end-title'), endCopy: $('end-copy'), endTime: $('end-time'),
  endScore: $('end-score'), endRank: $('end-rank'), next: $('next-call')
};

let map, playerMarker, truckMarker, incidentMarker, stationMarker, routeLine, hoseLine;
let player = { lat: STATION.lat - .00016, lng: STATION.lng - .00008, heading: 0, speed: 0 };
let truck = { lat: STATION.lat + .00003, lng: STATION.lng + .00010, heading: 165, speed: 0 };
let mode = 'foot';
let mission = 'idle';
let activeCall = null;
let score = 0;
let taskProgress = 0;
let startedAt = 0;
let callStartedAt = 0;
let lastTime = performance.now();
let cameraCooldown = 0;
let promptAction = null;
let actionHeld = false;
const keys = { up: false, down: false, left: false, right: false, boost: false, brake: false, action: false };
const analog = { x: 0, y: 0 };

const roads = {
  status: 'loading',
  segments: [],
  grid: new Map(),
  stationExit: null,
  collisions: 0
};

function initMap() {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
    zoomSnap: .25,
    zoomDelta: .25,
    inertia: true,
    minZoom: 12,
    maxZoom: 20
  }).setView([STATION.lat, STATION.lng], 19);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    maxNativeZoom: 19,
    keepBuffer: 5,
    updateWhenIdle: false,
    updateWhenZooming: false,
    attribution: 'Tiles © Esri'
  }).addTo(map);
  L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    opacity: .78,
    keepBuffer: 5,
    updateWhenIdle: false,
    updateWhenZooming: false,
    attribution: 'Labels © Esri'
  }).addTo(map);

  stationMarker = L.marker([STATION.lat, STATION.lng], {
    interactive: false,
    icon: L.divIcon({ className: 'game-marker', html: '<div class="station-ring"></div>', iconSize: [46, 46], iconAnchor: [23, 23] })
  }).addTo(map);
  playerMarker = L.marker([player.lat, player.lng], {
    zIndexOffset: 1200,
    interactive: false,
    icon: L.divIcon({ className: 'game-marker', html: '<div class="entity player"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })
  }).addTo(map);
  truckMarker = L.marker([truck.lat, truck.lng], {
    zIndexOffset: 1100,
    interactive: false,
    icon: truckIcon()
  }).addTo(map);

  map.dragging.disable();
  map.doubleClickZoom.disable();
  map.scrollWheelZoom.disable();
  map.touchZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
}

function truckSvg() {
  return `
    <div class="truck-rotation-wrapper" style="width:72px;height:22px;transform:rotate(${truck.heading - 90}deg)">
      <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none" style="display:block">
        <rect x="2" y="3" width="96" height="24" rx="4" fill="#d9534f" stroke="#992222" stroke-width="1"/>
        <rect x="72" y="4" width="26" height="22" rx="2" fill="#c9302c"/>
        <rect x="89" y="5" width="4" height="20" rx="1" fill="#e0f7fa" opacity="0.9"/>
        <rect x="78" y="3.5" width="7" height="1.5" fill="#e0f7fa" opacity="0.9"/>
        <rect x="78" y="25" width="7" height="1.5" fill="#e0f7fa" opacity="0.9"/>
        <rect class="svg-light-blue" x="75" y="2" width="3" height="11" fill="#0022ff"/>
        <rect class="svg-light-red" x="75" y="17" width="3" height="11" fill="#ff0000"/>
        <rect x="30" y="5" width="38" height="20" fill="#666666" rx="1"/>
        <line x1="40" y1="5" x2="40" y2="25" stroke="#444" stroke-width="2"/>
        <line x1="50" y1="5" x2="50" y2="25" stroke="#444" stroke-width="2"/>
        <line x1="60" y1="5" x2="60" y2="25" stroke="#444" stroke-width="2"/>
        <rect x="4" y="4.5" width="22" height="6" fill="none" stroke="#dddddd" stroke-width="1.5"/>
        <line x1="9" y1="4.5" x2="9" y2="10.5" stroke="#dddddd"/>
        <line x1="14" y1="4.5" x2="14" y2="10.5" stroke="#dddddd"/>
        <line x1="19" y1="4.5" x2="19" y2="10.5" stroke="#dddddd"/>
        <rect x="4" y="19.5" width="22" height="6" fill="none" stroke="#dddddd" stroke-width="1.5"/>
        <line x1="9" y1="19.5" x2="9" y2="25.5" stroke="#dddddd"/>
        <line x1="14" y1="19.5" x2="14" y2="25.5" stroke="#dddddd"/>
        <line x1="19" y1="19.5" x2="19" y2="25.5" stroke="#dddddd"/>
      </svg>
    </div>`;
}

function truckIcon() {
  const active = mission === 'enroute' || mission === 'arrival' || mission === 'onscene';
  return L.divIcon({
    className: active ? 'truck-container siren-active' : 'truck-container',
    html: truckSvg(),
    iconSize: [72, 72],
    iconAnchor: [36, 36]
  });
}

function incidentIcon(call) {
  return L.divIcon({
    className: 'game-marker',
    html: `<div class="incident ${call.type}">${call.icon}</div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23]
  });
}

function meters(a, b) {
  const R = 6371000;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pointFrom(origin, heading, distanceMeters) {
  const radians = heading * Math.PI / 180;
  const lngMeters = 111320 * Math.cos(origin.lat * Math.PI / 180);
  return {
    lat: origin.lat + Math.cos(radians) * distanceMeters / 111320,
    lng: origin.lng + Math.sin(radians) * distanceMeters / lngMeters
  };
}

function movePoint(origin, heading, distanceMeters) {
  const next = pointFrom(origin, heading, distanceMeters);
  origin.lat = next.lat;
  origin.lng = next.lng;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function normalizeHeading(heading) { return (heading % 360 + 360) % 360; }
function angleDifference(from, to) { return ((to - from + 540) % 360) - 180; }
function approach(current, target, amount) {
  if (current < target) return Math.min(target, current + amount);
  if (current > target) return Math.max(target, current - amount);
  return current;
}
