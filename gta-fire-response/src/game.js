import { CALLS, GAME_STATES, STATION } from './config.js';
import { angleDifference, approach, clamp, dampHeading, headingFromVector, meters, pointFrom, seededRandom } from './math.js';
import { GameStateMachine } from './state.js';
import { IncidentController } from './incident.js';

export class FireResponseGame {
  constructor({ options, ui, input, roads, renderer, camera, traffic, audio }) {
    this.options = options;
    this.ui = ui;
    this.input = input;
    this.roads = roads;
    this.renderer = renderer;
    this.camera = camera;
    this.traffic = traffic;
    this.audio = audio;
    this.state = new GameStateMachine(GAME_STATES.START_SCREEN);
    this.mode = 'foot';
    this.player = { ...STATION.playerSpawn, speed: 0 };
    this.truck = { ...STATION.truckSpawn, speed: 0, desiredHeading: STATION.truckSpawn.heading };
    this.equipment = { lights: false, siren: false };
    this.activeCall = null;
    this.incident = new IncidentController(this);
    this.score = 0;
    this.startedAt = performance.now();
    this.callStartedAt = 0;
    this.dispatchCountdown = null;
    this.random = seededRandom(options.seed);
    this.lastCallId = null;
    this.lastFrameAt = performance.now();
    this.accumulator = 0;
    this.fixedStep = 1 / 60;
    this.fps = 60;
    this.frameSamples = [];
    this.roadPenaltyCooldown = 0;
    this.running = false;
    this.ui.bindGame(this);
    this.state.onChange(event => this.onStateChange(event));
  }

  init() {
    this.renderer.init(this.player, this.truck);
    this.camera.map = this.renderer.map;
    this.camera.currentZoom = this.renderer.map.getZoom();
    this.camera.targetZoom = this.camera.currentZoom;
    this.roads.createStationExit(this.truck);
    this.renderer.updatePlayer(this.player, true);
    this.renderer.updateTruck(this.truck, this.equipment);
    this.ui.setState(this.state.current);
    this.ui.setMission(null, 'Start the shift when the road network is ready.');
    document.getElementById('start-button').addEventListener('click', async () => {
      if (!this.options.testMode) { try { await this.audio.unlock(); } catch (error) { this.ui.errorLog.push(`Audio unlock: ${error?.message || error}`); } }
      if (this.roads.status === 'failed') await this.retryRoads();
      else this.startShift();
    });
    this.running = true;
    requestAnimationFrame(time => this.frame(time));
  }

  async retryRoads() {
    this.ui.setRoadStatus('loading', 'Retrying Peterborough road geometry…');
    const loaded = await this.roads.load();
    this.ui.setRoadStatus(loaded ? 'ready' : 'failed', loaded ? `Road network ready · ${this.roads.segments.length.toLocaleString()} segments` : 'Road network failed. Tap Retry Road Data.');
    if (loaded) { this.roads.createStationExit(this.truck); this.startShift(); }
  }

  startShift() {
    if (this.roads.status !== 'ready' || this.state.current !== GAME_STATES.START_SCREEN) return;
    document.getElementById('start-screen').classList.add('hidden');
    this.startedAt = performance.now();
    this.state.transition(GAME_STATES.AVAILABLE, 'shift-started');
    this.ui.setMission(null, 'Walk to Engine 1. Dispatch will assign a call shortly.');
    this.ui.toast('SHIFT STARTED · ENGINE 1 AVAILABLE');
    this.dispatchCountdown = this.options.testMode ? .25 : 2.8;
  }

  selectCall() {
    if (this.options.forcedCall) {
      return CALLS.find(call => call.id === this.options.forcedCall || call.type === this.options.forcedCall || (this.options.forcedCall === 'structure' && call.flagship)) || CALLS[0];
    }
    const choices = CALLS.filter(call => call.id !== this.lastCallId);
    return choices[Math.floor(this.random() * choices.length)] || CALLS[0];
  }

  dispatchCall(forced = null) {
    if (this.state.current !== GAME_STATES.AVAILABLE) return;
    const call = forced || this.selectCall();
    this.activeCall = call;
    this.lastCallId = call.id;
    this.callStartedAt = performance.now();
    this.incident.start(call);
    this.state.transition(GAME_STATES.DISPATCHED, 'dispatch-received', { callId: call.id });
    this.audio.playStationAlert();
    this.ui.setMission(call, 'Enter Engine 1 and respond to the address.');
    this.ui.toast(`DISPATCH · ${call.title.toUpperCase()} · ${call.address.toUpperCase()}`, 4300);
    this.renderer.setRoute(this.truck, call, this.ui.settings.showRoute);
    if (this.mode === 'truck') this.beginEnroute();
  }

  repeatDispatch() {
    if (!this.activeCall) return;
    this.audio.playStationAlert();
    this.ui.setMission(this.activeCall, this.ui.elements['mission-objective'].textContent);
    this.ui.toast(`${this.activeCall.label} · ${this.activeCall.address}`, 3400);
  }

  beginEnroute() {
    if (this.state.current === GAME_STATES.DISPATCHED) this.state.transition(GAME_STATES.ENROUTE, 'engine-moving');
    this.ui.setObjective('Use direct-stick control to drive toward the directional arrow.');
  }

  onStateChange({ to }) {
    this.ui.setState(to);
    if (to === GAME_STATES.PAUSED) this.audio.pause();
    if (to !== GAME_STATES.PAUSED) this.audio.resume();
  }

  frame(now) {
    if (!this.running) return;
    let frameDelta = Math.min(.18, Math.max(0, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    this.frameSamples.push(frameDelta);
    if (this.frameSamples.length > 45) this.frameSamples.shift();
    const average = this.frameSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, this.frameSamples.length);
    this.fps = average > 0 ? 1 / average : 60;
    this.traffic.setPerformance(this.fps);

    if (document.hidden) frameDelta = 0;
    this.accumulator = Math.min(.2, this.accumulator + frameDelta);
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < 8) {
      this.simulate(this.fixedStep);
      this.accumulator -= this.fixedStep;
      steps += 1;
    }
    if (steps === 8) this.accumulator = 0;
    this.render(frameDelta);
    requestAnimationFrame(time => this.frame(time));
  }

  simulate(dt) {
    if (this.state.current === GAME_STATES.PAUSED || this.state.current === GAME_STATES.START_SCREEN) return;
    this.roadPenaltyCooldown = Math.max(0, this.roadPenaltyCooldown - dt);
    if (this.dispatchCountdown != null) {
      this.dispatchCountdown -= dt;
      if (this.dispatchCountdown <= 0) { this.dispatchCountdown = null; this.dispatchCall(); }
    }

    this.handleEvents();
    if (this.mode === 'foot') this.updatePlayer(dt);
    else this.updateTruck(dt);

    if (this.activeCall && this.state.current !== GAME_STATES.CALL_COMPLETE) {
      this.renderer.setRoute(this.truck, this.activeCall, this.ui.settings.showRoute && [GAME_STATES.DISPATCHED, GAME_STATES.ENROUTE, GAME_STATES.ARRIVING].includes(this.state.current));
    }

    this.incident.update(dt, this.input);
    const center = this.mode === 'truck' ? this.truck : this.player;
    if (this.activeCall || this.state.current !== GAME_STATES.AVAILABLE) {
      this.traffic.update(dt, center, this.truck, this.equipment.lights && this.equipment.siren, () => this.onTrafficCollision());
    } else if (this.traffic.activeCount()) this.traffic.reset();
  }

  render(dt) {
    this.renderer.updatePlayer(this.player, this.mode === 'foot');
    this.renderer.updateTruck(this.truck, this.equipment);
    const target = this.mode === 'truck' ? this.truck : this.player;
    this.camera.update(dt, this.mode, target, this.mode === 'truck' ? this.truck.speed : this.player.speed);
    this.ui.update(dt, this);
  }

  handleEvents() {
    for (const event of this.input.consumeEvents()) {
      if (event === 'toggleLights') this.toggleLights();
      if (event === 'toggleSiren') this.toggleSiren();
      if (event === 'cycleSiren') { this.audio.cycleSiren(this.equipment.siren); this.ui.toast(`SIREN MODE · ${this.audio.sirenMode.toUpperCase()}`); }
      if (event === 'horn') this.audio.horn();
      if (event === 'pause') this.togglePause();
    }
  }

  updatePlayer(dt) {
    const movement = this.input.movement();
    const attacking = this.state.current === GAME_STATES.ON_SCENE && this.incident.tool !== 'none' && this.input.actionHeld;
    if (movement.magnitude > .08) {
      this.player.heading = headingFromVector(movement.x, movement.y);
      if (!attacking) {
        const speed = movement.magnitude < .58 ? this.ui.settings.tuning.walkingSpeed : this.ui.settings.tuning.runningSpeed;
        const next = pointFrom(this.player, this.player.heading, speed * movement.magnitude * dt);
        this.player.lat = next.lat;
        this.player.lng = next.lng;
        this.player.speed = speed * movement.magnitude;
      } else this.player.speed = 0;
    } else this.player.speed = 0;

    let prompt = null;
    const door = this.closestDoorPoint();
    if (door && meters(this.player, door) < 5.4 && this.state.current !== GAME_STATES.CALL_COMPLETE) prompt = { id: 'enter', text: 'Enter Engine 1', key: 'E' };
    const incidentPrompt = this.incident.promptFor(this.player);
    if (incidentPrompt && (!prompt || incidentPrompt.id === 'attack')) prompt = incidentPrompt;
    this.ui.setPrompt(prompt);

    if (this.input.consumeActionPressed()) {
      if (prompt?.id === 'enter') this.enterTruck();
      else this.incident.interact(this.player);
    }
  }

  closestDoorPoint() {
    const left = pointFrom(this.truck, this.truck.heading - 90, 3.1);
    const right = pointFrom(this.truck, this.truck.heading + 90, 3.1);
    return meters(this.player, left) <= meters(this.player, right) ? left : right;
  }

  enterTruck() {
    if (this.mode === 'truck') return;
    const door = this.closestDoorPoint();
    if (!door || meters(this.player, door) > 5.8) return;
    this.mode = 'truck';
    this.player.speed = 0;
    this.truck.speed = 0;
    this.input.releaseAll();
    this.ui.elements['joystick-label'].textContent = 'Point to drive';
    this.ui.toast('ENGINE 1 · DIRECT-STICK DRIVE ACTIVE');
    if (this.state.current === GAME_STATES.DISPATCHED) this.beginEnroute();
    this.roads.createStationExit(this.truck);
  }

  safeExitPoint() {
    const candidates = [90, -90, 180, 0].map(offset => pointFrom(this.truck, this.truck.heading + offset, offset === 0 || offset === 180 ? 5.3 : 4));
    const activeTraffic = this.traffic.vehicles.filter(vehicle => vehicle.active);
    return candidates.find(point => activeTraffic.every(vehicle => meters(point, vehicle) > 4.5) && (!this.activeCall || meters(point, this.activeCall) > 5)) || candidates[0];
  }

  exitTruck() {
    if (this.mode !== 'truck' || Math.abs(this.truck.speed) > 1.2) return;
    const exit = this.safeExitPoint();
    this.player.lat = exit.lat;
    this.player.lng = exit.lng;
    this.player.heading = this.truck.heading;
    this.player.speed = 0;
    this.mode = 'foot';
    this.input.releaseAll();
    this.ui.elements['joystick-label'].textContent = 'Move / Aim';
    this.ui.toast('ENGINE 1 · PARKED');
    if (this.activeCall && meters(this.truck, this.activeCall) < 90 && [GAME_STATES.ARRIVING, GAME_STATES.ENROUTE, GAME_STATES.DISPATCHED].includes(this.state.current)) this.incident.onExitTruck();
  }

  updateTruck(dt) {
    const movement = this.input.movement();
    const tuning = this.ui.settings.tuning;
    const hasDemand = movement.magnitude > .08;
    let targetSpeed = 0;
    let bodyHeadingTarget = this.truck.desiredHeading;
    let reverse = false;

    if (hasDemand) {
      const travelHeading = headingFromVector(movement.x, movement.y);
      const travelDifference = Math.abs(angleDifference(this.truck.heading, travelHeading));
      reverse = this.input.brakeHeld && Math.abs(this.truck.speed) < 3.2 && travelDifference > 118;
      bodyHeadingTarget = reverse ? (travelHeading + 180) % 360 : travelHeading;
      this.truck.desiredHeading = bodyHeadingTarget;
      const maxSpeed = this.input.boostHeld ? tuning.maxBoostedSpeed : tuning.maxNormalSpeed;
      targetSpeed = reverse ? -tuning.reverseSpeed * movement.magnitude : maxSpeed * (.2 + .8 * movement.magnitude);
      const bodyDifference = Math.abs(angleDifference(this.truck.heading, bodyHeadingTarget));
      if (!reverse && Math.abs(this.truck.speed) > 7 && bodyDifference > 95) targetSpeed = Math.min(targetSpeed, 2.5);
      else if (!reverse && bodyDifference > 55) targetSpeed *= .55;
    }

    const speedRatio = clamp(Math.abs(this.truck.speed) / Math.max(1, tuning.maxBoostedSpeed), 0, 1);
    const turnRate = tuning.lowSpeedTurnRate + (tuning.highSpeedTurnRate - tuning.lowSpeedTurnRate) * speedRatio;
    if (hasDemand) {
      const closeDifference = Math.abs(angleDifference(this.truck.heading, bodyHeadingTarget));
      const closeAssist = closeDifference < 28 ? 1 + tuning.headingAssistStrength * 3 : 1;
      this.truck.heading = dampHeading(this.truck.heading, bodyHeadingTarget, tuning.steeringDamping * closeAssist, dt, turnRate);
    }

    if (hasDemand) {
      const amount = (Math.sign(targetSpeed) === Math.sign(this.truck.speed) || Math.abs(this.truck.speed) < .1) ? tuning.acceleration : tuning.brakingStrength;
      this.truck.speed = approach(this.truck.speed, targetSpeed, amount * dt);
    } else this.truck.speed = approach(this.truck.speed, 0, tuning.coastingDrag * dt);

    if (this.input.brakeHeld && !reverse) this.truck.speed = approach(this.truck.speed, 0, tuning.brakingStrength * dt);
    if (Math.abs(this.truck.speed) < .035) this.truck.speed = 0;

    const fromPose = { lat: this.truck.lat, lng: this.truck.lng, heading: this.truck.heading };
    const candidatePoint = pointFrom(this.truck, this.truck.heading, this.truck.speed * dt);
    const candidatePose = { ...candidatePoint, heading: this.truck.heading };
    const result = this.roads.resolveMovement(fromPose, candidatePose, this.truck.speed, tuning.laneAssistStrength);
    this.truck.lat = result.pose.lat;
    this.truck.lng = result.pose.lng;
    this.truck.heading = result.pose.heading;
    if (result.blocked) {
      const retention = result.slid ? Math.max(.68, tuning.collisionSpeedRetention) : tuning.collisionSpeedRetention;
      this.truck.speed *= retention;
      if (this.roadPenaltyCooldown <= 0) {
        this.roadPenaltyCooldown = .8;
        this.score = Math.max(0, this.score - 5);
        this.ui.toast(result.slid ? 'ROAD EDGE · CONTROLLED SLIDE' : 'ROAD EDGE · SLOW DOWN', 850);
      }
    }

    if (this.activeCall && this.state.current === GAME_STATES.ENROUTE && meters(this.truck, this.activeCall) < 88) {
      this.state.transition(GAME_STATES.ARRIVING, 'entered-arrival-zone');
      this.incident.arrive();
      this.ui.toast('ARRIVING ON SCENE');
    }

    if (hasDemand && this.state.current === GAME_STATES.DISPATCHED) this.beginEnroute();
    const exitPrompt = Math.abs(this.truck.speed) < 1.2 ? { id: 'exit', text: 'Exit Engine 1', key: 'E' } : null;
    this.ui.setPrompt(exitPrompt);
    if (this.input.consumeActionPressed() && exitPrompt) this.exitTruck();
  }

  toggleLights() {
    this.equipment.lights = !this.equipment.lights;
    this.ui.toast(this.equipment.lights ? 'EMERGENCY LIGHTS ON' : 'EMERGENCY LIGHTS OFF');
  }

  toggleSiren() {
    this.equipment.siren = !this.equipment.siren;
    if (this.equipment.siren) { this.equipment.lights = true; this.audio.startSiren(); }
    else this.audio.stopSiren();
    this.ui.toast(this.equipment.siren ? `SIREN ${this.audio.sirenMode.toUpperCase()}` : 'SIREN OFF');
  }

  onTrafficCollision() {
    this.truck.speed *= .42;
    this.score = Math.max(0, this.score - 35);
    this.ui.toast('MINOR COLLISION · -35 SAFE DRIVING');
  }

  completeCall(reason) {
    if (this.state.current !== GAME_STATES.ON_SCENE) return;
    this.state.transition(GAME_STATES.CALL_COMPLETE, 'incident-complete', { reason });
    this.equipment.siren = false;
    this.audio.stopSiren();
    const elapsed = performance.now() - this.callStartedAt;
    const timeScore = Math.max(200, 1100 - Math.floor(elapsed / 1000) * 4);
    this.score += timeScore;
    const rank = elapsed < 130000 ? 'A' : elapsed < 220000 ? 'B' : 'C';
    this.ui.showResult(true, { title: 'Fire Control Confirmed', copy: 'The fire is knocked down and Engine 1 is ready to return to quarters.', time: elapsed, score: this.score, rank });
    this.ui.setObjective('Call complete. Return Engine 1 and crew to Station 1.');
  }

  restartCall() {
    if (!this.activeCall) return;
    const call = this.activeCall;
    if (this.state.current === GAME_STATES.PAUSED) this.state.resume('restart-call-resume');
    if (this.state.current !== GAME_STATES.RETURNING) this.state.transition(GAME_STATES.RETURNING, 'restart-call');
    this.resetAtStation(false);
    this.state.transition(GAME_STATES.AVAILABLE, 'restart-ready');
    this.dispatchCall(call);
    this.ui.showPause(false);
    this.ui.showResult(false);
  }

  returnToStation() {
    if (this.state.current === GAME_STATES.PAUSED) this.state.resume('return-command');
    if (![GAME_STATES.CALL_COMPLETE, GAME_STATES.ON_SCENE, GAME_STATES.ENROUTE, GAME_STATES.ARRIVING, GAME_STATES.DISPATCHED].includes(this.state.current)) return;
    this.state.transition(GAME_STATES.RETURNING, 'return-to-station');
    this.resetAtStation(true);
    this.state.transition(GAME_STATES.AVAILABLE, 'ready-at-station');
    this.ui.showPause(false);
    this.ui.showResult(false);
    this.ui.setMission(null, 'Engine 1 restored and available. Another call will follow.');
    this.ui.toast('ENGINE 1 · RETURNED TO SERVICE');
    this.dispatchCountdown = this.options.testMode ? .5 : 4;
  }

  resetAtStation(clearCall = true) {
    this.mode = 'foot';
    Object.assign(this.player, STATION.playerSpawn, { speed: 0 });
    Object.assign(this.truck, STATION.truckSpawn, { speed: 0, desiredHeading: STATION.truckSpawn.heading });
    this.equipment.siren = false;
    this.equipment.lights = false;
    this.audio.stopSiren();
    this.input.releaseAll();
    this.incident.reset();
    this.renderer.clearIncident();
    this.traffic.reset();
    this.roads.stationExit = null;
    this.roads.createStationExit(this.truck);
    this.camera.reset('foot');
    this.ui.setTool('none');
    this.ui.setPrompt(null);
    if (clearCall) { this.activeCall = null; this.callStartedAt = 0; }
  }

  togglePause() {
    if (this.state.current === GAME_STATES.START_SCREEN) return;
    if (this.state.current === GAME_STATES.PAUSED) this.resume();
    else {
      this.state.transition(GAME_STATES.PAUSED, 'pause-requested');
      this.input.releaseAll();
      this.ui.showPause(true);
    }
  }
  resume() {
    if (this.state.current !== GAME_STATES.PAUSED) return;
    this.state.resume('resume-requested');
    this.ui.showPause(false);
  }

  applySettings(settings) {
    this.audio.settings = settings;
    this.audio.applySettings();
    this.renderer.reducedFlashing = settings.reducedFlashing;
    this.camera.settings = settings;
    if (settings.mute) this.audio.stopSiren();
    else if (this.equipment.siren) this.audio.startSiren();
  }
}
