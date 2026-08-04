import { readRuntimeOptions } from './config.js';
import { InputController } from './input.js';
import { RoadSystem } from './road.js';
import { MapRenderer } from './renderer.js';
import { CameraController } from './camera.js';
import { TrafficSystem } from './traffic.js';
import { AudioManager } from './audio.js';
import { UIController } from './ui.js';
import { FireResponseGame } from './game.js';
import { Phase2Controller } from './phase2.js';
import { Phase3Controller } from './phase3.js';

const options = readRuntimeOptions();
const ui = new UIController(options);
ui.setRoadStatus('loading', 'Loading indexed Peterborough road geometry…');

const input = new InputController({
  joystick: document.getElementById('joystick'), stick: document.getElementById('stick'),
  action: document.getElementById('action-button'), brake: document.getElementById('brake-button'),
  boost: document.getElementById('boost-button'), lights: document.getElementById('lights-button'),
  siren: document.getElementById('siren-button'), sirenMode: document.getElementById('siren-mode-button'),
  horn: document.getElementById('horn-button'), pause: document.getElementById('pause-button')
});
const roads = new RoadSystem({ testMode: options.testMode });
const renderer = new MapRenderer({ disableTiles: options.disableTiles, reducedFlashing: ui.settings.reducedFlashing });
const audio = new AudioManager(ui.settings);

const loaded = await roads.load();
ui.setRoadStatus(loaded ? 'ready' : 'failed', loaded
  ? `Road network ready · ${roads.segments.length.toLocaleString()} indexed segments`
  : 'Road network failed. Tap Retry Road Data.');

const camera = new CameraController({ getZoom: () => 19 }, ui.settings);
const traffic = new TrafficSystem(roads, renderer, options.seed);
const game = new FireResponseGame({ options, ui, input, roads, renderer, camera, traffic, audio });
window.__PFR_PHASE1_GAME__ = game;
window.__PFR_GAME__ = game;
game.init();

const phase2 = new Phase2Controller(game, { seed: options.seed, forcedTime: options.forcedTime });
phase2.install();
window.__PFR_PHASE2__ = phase2;

const phase3 = new Phase3Controller(game, phase2, { seed: options.seed });
phase3.install();
window.__PFR_PHASE3__ = phase3;
