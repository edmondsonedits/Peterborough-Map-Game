export const APP_VERSION = '0.4.0-phase1';

export const GAME_STATES = Object.freeze({
  START_SCREEN: 'START_SCREEN',
  AVAILABLE: 'AVAILABLE',
  DISPATCHED: 'DISPATCHED',
  ENROUTE: 'ENROUTE',
  ARRIVING: 'ARRIVING',
  ON_SCENE: 'ON_SCENE',
  RETURNING: 'RETURNING',
  CALL_COMPLETE: 'CALL_COMPLETE',
  PAUSED: 'PAUSED'
});

export const STATION = Object.freeze({
  id: 'station-1',
  name: 'Station 1',
  address: '210 Sherbrooke Street, Peterborough',
  lat: 44.300871,
  lng: -78.322206,
  playerSpawn: { lat: 44.300871, lng: -78.322206, heading: 180 },
  truckSpawn: { lat: 44.300901, lng: -78.322106, heading: 165 }
});

export const CALLS = Object.freeze([
  {
    id: 'structure-wellington',
    type: 'structure-fire',
    label: 'STRUCTURE FIRE',
    title: 'Residential Structure Fire',
    address: '465 Wellington Street',
    lat: 44.314737,
    lng: -78.336425,
    notes: 'Caller reports smoke showing from the rear of the residence.',
    task: 'Position the engine, deploy a line and extinguish the exterior fire.',
    icon: '🔥',
    flagship: true
  },
  {
    id: 'medical-hospital', type: 'medical', label: 'MEDICAL AID', title: 'Difficulty Breathing',
    address: '26 Hospital Drive', lat: 44.301048, lng: -78.345609,
    notes: 'Patient is conscious. Paramedics have been notified.', task: 'Approach the patient and provide support.', icon: '✚'
  },
  {
    id: 'mvc-lansdowne', type: 'mvc', label: 'RESCUE RESPONSE', title: 'Motor Vehicle Collision',
    address: 'Lansdowne Street West & Monaghan Road', lat: 44.285888, lng: -78.329751,
    notes: 'Two vehicles reported. Police are en route.', task: 'Position safely and stabilize the scene.', icon: '⚠'
  },
  {
    id: 'vehicle-fire-parkway', type: 'vehicle-fire', label: 'VEHICLE FIRE', title: 'Vehicle Fire',
    address: '485 The Parkway', lat: 44.2855, lng: -78.3533,
    notes: 'Vehicle is unoccupied in a parking area.', task: 'Deploy an extinguisher or hose line.', icon: '🔥'
  }
]);

export const DEFAULT_TUNING = Object.freeze({
  acceleration: 17.5,
  coastingDrag: 7.5,
  brakingStrength: 31,
  reverseSpeed: 7,
  lowSpeedTurnRate: 300,
  highSpeedTurnRate: 88,
  steeringDamping: 12,
  headingAssistStrength: 0.18,
  laneAssistStrength: 0.08,
  collisionSpeedRetention: 0.42,
  maxNormalSpeed: 23,
  maxBoostedSpeed: 30,
  walkingSpeed: 3.4,
  runningSpeed: 5.8
});

export const DEFAULT_SETTINGS = Object.freeze({
  masterVolume: 0.72,
  sirenVolume: 0.72,
  dispatchVolume: 0.8,
  mute: false,
  reducedFlashing: false,
  reducedMotion: false,
  sirenMode: 'wail',
  showRoute: true,
  tuning: { ...DEFAULT_TUNING }
});

export const ROAD_CONFIG = Object.freeze({
  dataUrl: '../city-explorer/data/osm-public-roads.geojson',
  centerLat: 44.3091,
  centerLng: -78.3197,
  gridSize: 70,
  shoulderTolerance: 1.4,
  sweepStep: 0.7,
  searchRadius: 65,
  stationExitSearchDistance: 130,
  stationExitCorridorHalfWidth: 10,
  truckLength: 8.3,
  truckWidth: 2.75
});

export const ROAD_WIDTHS = Object.freeze({
  motorway: 27, motorway_link: 17, trunk: 24, trunk_link: 16,
  primary: 20, primary_link: 15, secondary: 18, secondary_link: 14,
  tertiary: 16, tertiary_link: 13, residential: 13.5, living_street: 12.5,
  unclassified: 12, service: 11.5, road: 12
});

export function readRuntimeOptions(search = globalThis.location?.search || '') {
  const params = new URLSearchParams(search);
  const forcedCall = params.get('call');
  return {
    debug: params.get('debug') === '1',
    testMode: params.get('test') === '1',
    forcedCall,
    seed: Number.isFinite(Number(params.get('seed'))) ? Number(params.get('seed')) : 104729,
    disableTiles: params.get('tiles') === 'off' || params.get('test') === '1'
  };
}
