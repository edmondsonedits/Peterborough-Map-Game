import { APP_VERSION, DEFAULT_SETTINGS, DEFAULT_TUNING, GAME_STATES } from './config.js';
import { bearing, formatTime } from './math.js';

function deepMergeSettings(saved = {}) {
  return { ...DEFAULT_SETTINGS, ...saved, tuning: { ...DEFAULT_TUNING, ...(saved.tuning || {}) } };
}

export class UIController {
  constructor(options) {
    this.options = options;
    this.elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
    this.settings = this.loadSettings();
    this.errorLog = [];
    this.dispatchExpanded = true;
    this.dispatchTimer = 0;
    this.lastUiUpdate = 0;
    this.feedbackTimer = 0;
    this.setupPanels();
    this.setupDebugCapture();
    document.documentElement.classList.toggle('reduced-motion', this.settings.reducedMotion);
    document.documentElement.classList.toggle('reduced-flashing', this.settings.reducedFlashing);
    this.elements['version-text'].textContent = `Phase 2 build ${APP_VERSION}`;
  }
  loadSettings() {
    try { return deepMergeSettings(JSON.parse(localStorage.getItem('pfr-phase1-settings') || '{}')); }
    catch { return deepMergeSettings(); }
  }
  saveSettings() {
    localStorage.setItem('pfr-phase1-settings', JSON.stringify(this.settings));
    document.documentElement.classList.toggle('reduced-motion', this.settings.reducedMotion);
    document.documentElement.classList.toggle('reduced-flashing', this.settings.reducedFlashing);
  }
  setupPanels() {
    this.elements['dispatch-toggle']?.addEventListener('click', () => this.setDispatchExpanded(!this.dispatchExpanded));
    this.elements['repeat-dispatch']?.addEventListener('click', () => this.onRepeatDispatch?.());
    this.elements['settings-button']?.addEventListener('click', () => this.showSettings(true));
    this.elements['settings-close']?.addEventListener('click', () => this.showSettings(false));
    this.elements['pause-button']?.addEventListener('click', () => this.onPause?.());
    this.elements['resume-button']?.addEventListener('click', () => this.onResume?.());
    this.elements['restart-call']?.addEventListener('click', () => this.onRestart?.());
    this.elements['return-station']?.addEventListener('click', () => this.onReturn?.());
    this.elements['result-return']?.addEventListener('click', () => this.onReturn?.());
    this.elements['tool-hose']?.addEventListener('click', () => this.onTool?.('hose'));
    this.elements['tool-extinguisher']?.addEventListener('click', () => this.onTool?.('extinguisher'));
    for (const input of document.querySelectorAll('[data-setting]')) {
      const path = input.dataset.setting.split('.');
      const value = path.reduce((object, key) => object?.[key], this.settings);
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = value;
      input.addEventListener('input', () => {
        let object = this.settings;
        for (let index = 0; index < path.length - 1; index += 1) object = object[path[index]];
        object[path.at(-1)] = input.type === 'checkbox' ? input.checked : input.tagName === 'SELECT' ? input.value : Number(input.value);
        this.saveSettings();
        this.onSettings?.(this.settings);
        const output = document.querySelector(`[data-output="${input.dataset.setting}"]`);
        if (output) output.textContent = input.type === 'range' ? Number(input.value).toFixed(2) : String(input.value);
      });
      const output = document.querySelector(`[data-output="${input.dataset.setting}"]`);
      if (output) output.textContent = input.type === 'range' ? Number(input.value).toFixed(2) : String(input.value);
    }
  }
  setupDebugCapture() {
    window.addEventListener('error', event => this.errorLog.push(`${event.message} @ ${event.filename}:${event.lineno}`));
    window.addEventListener('unhandledrejection', event => this.errorLog.push(`Promise: ${event.reason?.message || event.reason}`));
  }
  bindGame(game) {
    this.onPause = () => game.togglePause();
    this.onResume = () => game.resume();
    this.onRestart = () => game.restartCall();
    this.onReturn = () => game.returnToStation();
    this.onTool = tool => game.incident.selectTool(tool);
    this.onRepeatDispatch = () => game.repeatDispatch();
    this.onSettings = settings => game.applySettings(settings);
  }
  setRoadStatus(status, text) {
    const chip = this.elements['road-status'];
    chip.textContent = text;
    chip.dataset.status = status;
    const start = this.elements['start-button'];
    start.disabled = status === 'loading';
    start.textContent = status === 'ready' ? 'Start Shift' : status === 'failed' ? 'Retry Road Data' : 'Loading Roads…';
    this.elements['load-status'].textContent = text;
    this.elements['load-status'].classList.toggle('failed', status === 'failed');
  }
  setState(state) { document.body.dataset.gameState = state; this.elements['state-label'].textContent = state.replaceAll('_', ' '); }
  setMission(call, objective) {
    if (!call) {
      this.elements['call-id'].textContent = 'ENGINE 1';
      this.elements['mission-title'].textContent = 'Engine 1 available';
      this.elements['mission-address'].textContent = '210 Sherbrooke Street, Peterborough';
      this.elements['dispatch-notes'].textContent = 'Awaiting assignment.';
    } else {
      this.elements['call-id'].textContent = call.label;
      this.elements['mission-title'].textContent = call.title;
      this.elements['mission-address'].textContent = call.address;
      this.elements['dispatch-notes'].textContent = call.notes;
    }
    this.setObjective(objective);
    this.dispatchExpanded = true;
    this.dispatchTimer = 6;
    this.setDispatchExpanded(true);
  }
  setObjective(text) { this.elements['mission-objective'].textContent = text; }
  setDispatchExpanded(expanded) {
    this.dispatchExpanded = expanded;
    this.elements['dispatch-card'].classList.toggle('collapsed', !expanded);
    document.body.classList.toggle('dispatch-expanded', expanded);
    this.elements['dispatch-toggle'].textContent = expanded ? 'Minimize' : 'Expand';
  }
  showToolSelector(show) { this.elements['tool-selector'].classList.toggle('show', show); }
  setPrompt(prompt) {
    const element = this.elements['prompt'];
    if (!prompt) { element.classList.add('hidden'); return; }
    this.elements['prompt-key'].textContent = prompt.key || 'E';
    this.elements['prompt-text'].textContent = prompt.text;
    element.classList.remove('hidden');
  }
  toast(text, duration = 2500) {
    const element = this.elements['toast'];
    element.textContent = text;
    element.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => element.classList.remove('show'), duration);
  }
  pulseFeedback(text) {
    if (this.feedbackTimer > 0) return;
    this.feedbackTimer = .35;
    this.elements['feedback'].textContent = text;
    this.elements['feedback'].classList.add('show');
  }
  setTool(tool, capacity = null) {
    this.elements['tool-status'].textContent = !tool || tool === 'none' ? 'NO TOOL' : String(tool).toUpperCase();
    this.elements['capacity-status'].textContent = capacity == null ? '' : `${Math.round(capacity)}%`;
  }
  setFireStatus(intensity, capacity) {
    this.elements['fire-status'].textContent = `FIRE ${Math.ceil(intensity)}%`;
    if (capacity != null) this.elements['capacity-status'].textContent = `${Math.ceil(capacity)}%`;
  }
  setEquipment(equipment, sirenMode) {
    this.elements['lights-state'].textContent = equipment.lights ? 'LIGHTS ON' : 'LIGHTS OFF';
    this.elements['siren-state'].textContent = equipment.siren ? `SIREN ${sirenMode.toUpperCase()}` : 'SIREN OFF';
    this.elements['lights-button'].classList.toggle('active', equipment.lights);
    this.elements['siren-button'].classList.toggle('active', equipment.siren);
  }
  showSettings(show) { this.elements['settings-panel'].classList.toggle('show', show); }
  showPause(show) { this.elements['pause-panel'].classList.toggle('show', show); }
  showResult(show, result = {}) {
    this.elements['result-panel'].classList.toggle('show', show);
    if (show) {
      this.elements['result-title'].textContent = result.title || 'Call Complete';
      this.elements['result-copy'].textContent = result.copy || 'The incident is under control.';
      this.elements['result-time'].textContent = formatTime(result.time || 0);
      this.elements['result-score'].textContent = String(result.score || 0).padStart(4, '0');
      this.elements['result-rank'].textContent = result.rank || 'B';
    }
  }
  update(dt, game) {
    this.dispatchTimer = Math.max(0, this.dispatchTimer - dt);
    this.feedbackTimer = Math.max(0, this.feedbackTimer - dt);
    if (!this.feedbackTimer) this.elements['feedback'].classList.remove('show');
    if (this.dispatchTimer === 0 && this.dispatchExpanded && game.state.current !== GAME_STATES.START_SCREEN) this.setDispatchExpanded(false);
    const now = performance.now();
    if (now - this.lastUiUpdate < 90) return;
    this.lastUiUpdate = now;
    this.elements['speed'].textContent = game.mode === 'truck' ? `${Math.round(Math.abs(game.truck.speed) * 3.6)} km/h` : 'ON FOOT';
    this.elements['score'].textContent = String(Math.max(0, Math.round(game.score))).padStart(4, '0');
    this.elements['timer'].textContent = formatTime(game.callStartedAt ? now - game.callStartedAt : now - game.startedAt);
    this.setState(game.state.current);
    this.setEquipment(game.equipment, game.audio.sirenMode);
    if (game.activeCall) {
      const arrow = this.elements['direction-arrow'];
      arrow.classList.add('show');
      arrow.style.transform = `rotate(${bearing(game.mode === 'truck' ? game.truck : game.player, game.activeCall)}deg)`;
    } else this.elements['direction-arrow'].classList.remove('show');
    if (this.options.debug) this.updateDebug(game);
  }
  updateDebug(game) {
    const road = game.roads.debugInfo(game.truck);
    const debug = this.elements['debug-overlay'];
    debug.classList.add('show');
    debug.textContent = [
      `state ${game.state.current}`, `mode ${game.mode}`,
      `player ${game.player.lat.toFixed(6)}, ${game.player.lng.toFixed(6)}`,
      `truck ${game.truck.lat.toFixed(6)}, ${game.truck.lng.toFixed(6)}`,
      `speed ${(game.truck.speed * 3.6).toFixed(1)} km/h`, `heading ${game.truck.heading.toFixed(1)}°`,
      `desired ${game.truck.desiredHeading.toFixed(1)}°`, `road ${road.segment} #${road.segmentId}`,
      `road offset ${Number.isFinite(road.distanceFromCenter) ? road.distanceFromCenter.toFixed(2) : '∞'}m`,
      `footprint ${road.footprintValid ? 'valid' : 'blocked'}`, `entities ${game.renderer.entityCount()} traffic ${game.traffic.activeCount()}`,
      `fps ${game.fps.toFixed(1)}`, `zoom ${game.camera.currentZoom.toFixed(2)} -> ${game.camera.targetZoom.toFixed(2)}`,
      `incident ${game.incident.stage}`, `errors ${this.errorLog.length}`,
      ...this.errorLog.slice(-3)
    ].join('\n');
  }
}
