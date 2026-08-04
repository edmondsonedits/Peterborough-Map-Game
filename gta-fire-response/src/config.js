export const APP_VERSION = '0.7.0-phase4';

export const GAME_STATES = Object.freeze({
  START_SCREEN: 'START_SCREEN', AVAILABLE: 'AVAILABLE', DISPATCHED: 'DISPATCHED',
  ENROUTE: 'ENROUTE', ARRIVING: 'ARRIVING', ON_SCENE: 'ON_SCENE',
  RETURNING: 'RETURNING', CALL_COMPLETE: 'CALL_COMPLETE', PAUSED: 'PAUSED'
});

export const STATION = Object.freeze({
  id: 'station-1', name: 'Station 1', address: '210 Sherbrooke Street, Peterborough',
  lat: 44.300871, lng: -78.322206,
  playerSpawn: { lat: 44.300871, lng: -78.322206, heading: 180 },
  truckSpawn: { lat: 44.300901, lng: -78.322106, heading: 165 }
});

export const CALLS = Object.freeze([
  {
    id: 'structure-wellington', type: 'structure-fire', label: 'STRUCTURE FIRE',
    title: 'Residential Structure Fire', address: '465 Wellington Street',
    lat: 44.314737, lng: -78.336425, district: 'northwest',
    notes: 'Caller reports smoke showing from the rear of the residence.',
    task: 'Position Engine 1, deploy an attack line and control the exterior fire.',
    icon: '🔥', flagship: true, recommendedSupport: ['police'], hydrantId: 'hydrant-wellington'
  },
  {
    id: 'restaurant-alarm', type: 'structure-fire', label: 'COMMERCIAL FIRE',
    title: 'Restaurant Kitchen Fire', address: 'George Street North',
    lat: 44.30899, lng: -78.31982, district: 'central',
    notes: 'Staff report smoke from the rear kitchen. Everyone is believed outside.',
    task: 'Deploy a line, establish water and control the kitchen fire.', icon: '🔥',
    recurringKey: 'restaurant', recommendedSupport: ['police'], hydrantId: 'hydrant-george'
  },
  {
    id: 'vehicle-fire-parkway', type: 'vehicle-fire', label: 'VEHICLE FIRE',
    title: 'Vehicle Fire', address: '485 The Parkway',
    lat: 44.2855, lng: -78.3533, district: 'southwest',
    notes: 'An unoccupied vehicle is burning in a parking area. Fuel involvement is unknown.',
    task: 'Position safely, identify hazards and extinguish the vehicle fire.', icon: '🔥',
    recommendedSupport: ['police'], hydrantId: 'hydrant-lansdowne'
  },
  {
    id: 'medical-hospital', type: 'medical', label: 'MEDICAL AID',
    title: 'Difficulty Breathing', address: '26 Hospital Drive',
    lat: 44.301048, lng: -78.345609, district: 'west',
    notes: 'Patient is conscious. Paramedics are requested.',
    task: 'Bring the medical bag, assist the patient and transfer care.', icon: '✚',
    recommendedSupport: ['ambulance']
  },
  {
    id: 'lift-assist-simcoe', type: 'rescue', label: 'PUBLIC ASSIST',
    title: 'Lift Assist', address: '190 Simcoe Street',
    lat: 44.30471, lng: -78.321887, district: 'central',
    notes: 'An adult requires assistance from the floor. No reported injury.',
    task: 'Assess hazards, complete the assist and reassess the resident.', icon: '◆',
    recommendedSupport: ['ambulance']
  },
  {
    id: 'mvc-lansdowne', type: 'mvc', label: 'RESCUE RESPONSE',
    title: 'Two-Vehicle Collision', address: 'Lansdowne Street West & Monaghan Road',
    lat: 44.285888, lng: -78.329751, district: 'southwest',
    notes: 'Two vehicles are blocking one lane. One occupant requires assessment.',
    task: 'Protect the scene, deploy traffic control and assist the patient.', icon: '⚠',
    recommendedSupport: ['police', 'ambulance']
  },
  {
    id: 'automatic-alarm-water', type: 'alarm', label: 'AUTOMATIC ALARM',
    title: 'Commercial Fire Alarm', address: '470 Water Street',
    lat: 44.30958, lng: -78.31862, district: 'central',
    notes: 'Monitoring company reports a smoke detector activation. No caller on scene.',
    task: 'Investigate the alarm zone, meter conditions and reset the system.', icon: '◉',
    recommendedSupport: []
  },
  {
    id: 'co-alarm-park', type: 'alarm', label: 'CO ALARM',
    title: 'Carbon Monoxide Alarm', address: '610 Park Street North',
    lat: 44.31765, lng: -78.33135, district: 'northwest',
    notes: 'Occupants are outside. A detector has activated intermittently.',
    task: 'Investigate, meter the residence and advise the occupants.', icon: '◉',
    recommendedSupport: ['ambulance']
  }
]);

export const CREW_PROFILES = Object.freeze([
  { id: 'officer', name: 'Lt. Morgan', role: 'Officer', color: '#f4c542' },
  { id: 'driver', name: 'Alex', role: 'Driver/Operator', color: '#4ecdc4' },
  { id: 'firefighter', name: 'Riley', role: 'Firefighter', color: '#ff7b72' }
]);

export const HYDRANTS = Object.freeze([
  { id: 'hydrant-wellington', label: 'Wellington H-17', lat: 44.31456, lng: -78.33604, flow: 'high', available: true },
  { id: 'hydrant-george', label: 'George H-08', lat: 44.30882, lng: -78.31955, flow: 'medium', available: true },
  { id: 'hydrant-station', label: 'Station H-01', lat: 44.30078, lng: -78.32191, flow: 'high', available: true },
  { id: 'hydrant-lansdowne', label: 'Lansdowne H-22', lat: 44.28572, lng: -78.32942, flow: 'medium', available: true }
]);

export const EQUIPMENT_CATALOG = Object.freeze({
  hose: { id: 'hose', label: 'Attack hose', slot: 'primary', compartment: 'rear' },
  extinguisher: { id: 'extinguisher', label: 'Extinguisher', slot: 'primary', compartment: 'rear' },
  medicalBag: { id: 'medicalBag', label: 'Medical bag', slot: 'primary', compartment: 'curbside' },
  aed: { id: 'aed', label: 'AED', slot: 'small', compartment: 'curbside' },
  halligan: { id: 'halligan', label: 'Halligan', slot: 'primary', compartment: 'streetside' },
  cones: { id: 'cones', label: 'Traffic cones', slot: 'primary', compartment: 'rear' },
  hydrantBag: { id: 'hydrantBag', label: 'Hydrant bag', slot: 'small', compartment: 'rear' },
  thermalCamera: { id: 'thermalCamera', label: 'Thermal camera', slot: 'small', compartment: 'cab' }
});

export const ENTITY_BUDGETS = Object.freeze({
  trafficMobile: 8, trafficDesktop: 14, pedestriansMobile: 10, pedestriansDesktop: 18,
  bystanders: 6, crew: 3, supportVehicles: 6, supportPersonnel: 8, effects: 24
});

export const DEFAULT_TUNING = Object.freeze({
  acceleration: 17.5, coastingDrag: 7.5, brakingStrength: 31, reverseSpeed: 7,
  lowSpeedTurnRate: 300, highSpeedTurnRate: 88, steeringDamping: 12,
  headingAssistStrength: 0.18, laneAssistStrength: 0.08, collisionSpeedRetention: 0.42,
  maxNormalSpeed: 23, maxBoostedSpeed: 30, walkingSpeed: 3.4, runningSpeed: 5.8
});

export const DEFAULT_SETTINGS = Object.freeze({
  masterVolume: 0.72, sirenVolume: 0.72, dispatchVolume: 0.8, mute: false,
  reducedFlashing: false, reducedMotion: false, reducedCrowds: false,
  radioHumour: true, sirenMode: 'wail', showRoute: true, timeOfDay: 'auto',
  tuning: { ...DEFAULT_TUNING }
});

export const ROAD_CONFIG = Object.freeze({
  dataUrl: '../city-explorer/data/osm-public-roads.geojson', centerLat: 44.3091,
  centerLng: -78.3197, gridSize: 70, shoulderTolerance: 1.4, sweepStep: 0.7,
  searchRadius: 65, stationExitSearchDistance: 130, stationExitCorridorHalfWidth: 10,
  truckLength: 8.3, truckWidth: 2.75
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
    debug: params.get('debug') === '1', testMode: params.get('test') === '1', forcedCall,
    seed: Number.isFinite(Number(params.get('seed'))) ? Number(params.get('seed')) : 104729,
    disableTiles: params.get('tiles') === 'off' || params.get('test') === '1',
    forcedTime: params.get('time') || null,
    unlockAll: params.get('unlock') === 'all'
  };
}
