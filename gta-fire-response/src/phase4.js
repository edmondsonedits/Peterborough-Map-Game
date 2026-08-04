import { CALLS, GAME_STATES } from './config.js';
import { bearing, meters, pointFrom } from './math.js';
import { APPARATUS_PROFILES, CITY_DISTRICTS, CITY_STATIONS, MUTUAL_AID_UNITS, PHASE4_RADIO, SHIFT_MODIFIERS } from './phase4-data.js';
import { callPayout, coverageGrade, distanceMeters, districtReputationDelta, fuelUse, readinessScore } from './phase4-math.js';
import { Phase4SaveStore } from './phase4-save.js';
import { Phase4UI } from './phase4-ui.js';

const DEPLOYMENT_STATES = new Set([GAME_STATES.START_SCREEN, GAME_STATES.AVAILABLE]);

export class Phase4Controller {
  constructor(game, phase2, phase3, { seed = 1 } = {}) {
    this.game = game;
    this.phase2 = phase2;
    this.phase3 = phase3;
    this.seed = seed;
    this.save = new Phase4SaveStore();
    this.ui = new Phase4UI(this);
    this.waitingForReady = false;
    this.secondAlarmRequested = false;
    this.processedMutualAid = new Set();
    this.currentCallDistance = 0;
    this.currentCallFuelUsed = 0;
    this.callDistanceBaseline = 0;
    this.recordedCall = false;
    this.fuelWarningCooldown = 0;
    this.originalTuning = null;
    this.radioCursor = 0;
  }

  install() {
    this.game.phase4 = this;
    this.decorateStartScreen();
    this.ui.install();
    this.installHooks();
    this.applyDeployment(true);
  }

  decorateStartScreen() {
    const eyebrow = document.querySelector('.start-card .eyebrow');
    const intro = document.querySelector('.start-card > p');
    const features = document.querySelector('.start-card .feature-grid');
    if (eyebrow) eyebrow.textContent = 'Phase 4 · citywide deployment and career';
    if (intro) intro.textContent = 'Choose a station and apparatus, protect coverage across Peterborough, manage fuel, water and repairs, complete rotating shift challenges, request additional alarms and build a citywide fire-service career.';
    if (features) features.innerHTML = '<div><b>Three stations</b><span>Deploy from central, north-end or southwest quarters.</span></div><div><b>Apparatus readiness</b><span>Fuel, water, damage and service decisions carry between calls.</span></div><div><b>Citywide career</b><span>Coverage, credits, challenges, district reputation and larger alarms persist.</span></div>';
    const version = document.getElementById('version-text');
    if (version) version.textContent = 'Phase 4 build 0.7.0-phase4';
  }

  selectedStation() { return CITY_STATIONS.find(station => station.id === this.save.data.selectedStation) || CITY_STATIONS[0]; }
  selectedProfile() { return APPARATUS_PROFILES.find(profile => profile.id === this.save.data.selectedApparatus) || APPARATUS_PROFILES[0]; }
  selectedApparatusState() { return this.save.apparatus(this.selectedProfile().id); }
  selectedModifier() { return SHIFT_MODIFIERS.find(modifier => modifier.id === this.save.data.modifierId) || SHIFT_MODIFIERS[0]; }
  progressionLevel() { return this.game.options.unlockAll || this.game.options.testMode ? 6 : Math.max(1, this.phase3?.progression?.data?.level || 1); }
  canChangeDeployment() { return DEPLOYMENT_STATES.has(this.game.state.current) && !this.game.activeCall; }
  canService() { return this.canChangeDeployment() && this.game.mode === 'foot'; }
  canEndShift() { return this.canChangeDeployment() && this.save.data.callsThisShift > 0; }
  canRequestSecondAlarm() { return Boolean(this.game.activeCall && this.game.state.current === GAME_STATES.ON_SCENE && !this.secondAlarmRequested); }

  installHooks() {
    const game = this.game;

    const startShift = game.startShift.bind(game);
    game.startShift = () => {
      this.applyDeployment(true);
      this.waitingForReady = false;
      const result = startShift();
      game.ui.toast(`${this.selectedProfile().callSign} · ${this.selectedStation().name.toUpperCase()} · SHIFT ${this.save.data.shiftNumber}`);
      return result;
    };

    const selectCall = game.selectCall.bind(game);
    game.selectCall = () => {
      if (game.options.forcedCall) return selectCall();
      return this.selectCityCall() || selectCall();
    };

    const dispatchCall = game.dispatchCall.bind(game);
    game.dispatchCall = call => {
      const result = dispatchCall(call);
      if (game.activeCall) this.beginCallTracking();
      return result;
    };

    const simulate = game.simulate.bind(game);
    game.simulate = dt => {
      this.beforeSimulation(dt);
      simulate(dt);
      this.afterSimulation(dt);
    };

    const render = game.render.bind(game);
    game.render = dt => {
      render(dt);
      this.ui.update();
    };

    const completeCall = game.completeCall.bind(game);
    game.completeCall = reason => {
      const before = game.state.current;
      const result = completeCall(reason);
      if (before === GAME_STATES.ON_SCENE && game.state.current === GAME_STATES.CALL_COMPLETE && !this.recordedCall) this.finalizeCityCall();
      return result;
    };

    const resetAtStation = game.resetAtStation.bind(game);
    game.resetAtStation = clearCall => {
      this.captureApparatusState();
      const result = resetAtStation(clearCall);
      this.applyDeployment(true);
      this.cleanupMutualAid();
      return result;
    };

    const returnToStation = game.returnToStation.bind(game);
    game.returnToStation = () => {
      const result = returnToStation();
      if (game.state.current === GAME_STATES.AVAILABLE) {
        game.dispatchCountdown = null;
        this.waitingForReady = true;
        game.ui.setMission(null, `${this.selectedProfile().callSign} is in quarters. Service the unit or mark ready for the next call.`);
        this.ui.show(true);
        this.say('ready');
      }
      return result;
    };

    const uiSetMission = game.ui.setMission.bind(game.ui);
    game.ui.setMission = (call, objective) => {
      uiSetMission(call, String(objective || '').replaceAll('Engine 1', this.selectedProfile().label));
      if (!call) {
        game.ui.elements['call-id'].textContent = this.selectedProfile().callSign;
        game.ui.elements['mission-title'].textContent = `${this.selectedProfile().label} available`;
        game.ui.elements['mission-address'].textContent = `${this.selectedStation().address}, Peterborough`;
      }
    };

    const enterTruck = game.enterTruck.bind(game);
    game.enterTruck = () => {
      const before = game.mode;
      const result = enterTruck();
      if (before === 'foot' && game.mode === 'truck') game.ui.toast(`${this.selectedProfile().callSign} · ${this.selectedProfile().role.toUpperCase()}`);
      return result;
    };

    const phase3Escalate = this.phase3.escalate.bind(this.phase3);
    this.phase3.escalate = threshold => {
      const result = phase3Escalate(threshold);
      if (threshold >= 70 && this.game.activeCall?.type.includes('fire')) this.requestSecondAlarm(true);
      return result;
    };
  }

  selectCityCall() {
    const station = this.selectedStation();
    const modifier = this.selectedModifier();
    const choices = CALLS.filter(call => call.id !== this.game.lastCallId);
    const weighted = [];
    for (const call of choices) {
      let weight = 3;
      const distance = distanceMeters(station, call);
      if (distance < 2200) weight += 3;
      else if (distance < 4200) weight += 1;
      const reputation = this.save.data.districtReputation[call.district] ?? 50;
      if (reputation < 45) weight += 2;
      if (modifier.id === 'festival' && ['central','medical','rescue'].includes(call.district) || modifier.id === 'festival' && ['medical','rescue'].includes(call.type)) weight += 2;
      if (modifier.id === 'hydrant-testing' && call.type.includes('fire')) weight += 2;
      for (let index = 0; index < Math.max(1, Math.round(weight * modifier.callPressure)); index += 1) weighted.push(call);
    }
    return weighted[Math.floor(this.game.random() * weighted.length)] || choices[0] || CALLS[0];
  }

  beginCallTracking() {
    this.currentCallDistance = 0;
    this.currentCallFuelUsed = 0;
    this.recordedCall = false;
    this.secondAlarmRequested = false;
    this.processedMutualAid.clear();
    this.waitingForReady = false;
    this.ui.show(false);
    const profile = this.selectedProfile();
    const apparatus = this.selectedApparatusState();
    this.phase2.condition = { ...apparatus.condition };
    this.phase2.hydrants.maxTank = profile.tank;
    this.phase2.hydrants.engineTank = Math.min(profile.tank, apparatus.water);
  }

  beforeSimulation(dt) {
    this.fuelWarningCooldown = Math.max(0, this.fuelWarningCooldown - dt);
    const profile = this.selectedProfile();
    const apparatus = this.selectedApparatusState();
    if (this.game.mode === 'truck' && Math.abs(this.game.truck.speed) > .05) {
      const distance = Math.abs(this.game.truck.speed) * dt;
      this.currentCallDistance += distance;
      const used = fuelUse(distance, profile);
      this.currentCallFuelUsed += used;
      apparatus.fuel = Math.max(0, apparatus.fuel - used);
    }
    const tuning = this.game.ui.settings.tuning;
    this.originalTuning = {
      acceleration:tuning.acceleration, brakingStrength:tuning.brakingStrength,
      lowSpeedTurnRate:tuning.lowSpeedTurnRate, highSpeedTurnRate:tuning.highSpeedTurnRate,
      maxNormalSpeed:tuning.maxNormalSpeed, maxBoostedSpeed:tuning.maxBoostedSpeed,
      collisionSpeedRetention:tuning.collisionSpeedRetention
    };
    const factors = profile.factors;
    tuning.acceleration *= factors.acceleration;
    tuning.brakingStrength *= factors.braking;
    tuning.lowSpeedTurnRate *= factors.lowTurn;
    tuning.highSpeedTurnRate *= factors.highTurn;
    tuning.maxNormalSpeed *= factors.maxSpeed;
    tuning.maxBoostedSpeed *= factors.maxSpeed;
    tuning.collisionSpeedRetention = Math.max(.12, Math.min(.82, tuning.collisionSpeedRetention * factors.collisionRetention));
    if (apparatus.fuel <= 0) {
      tuning.maxNormalSpeed = Math.min(tuning.maxNormalSpeed, 2.8);
      tuning.maxBoostedSpeed = Math.min(tuning.maxBoostedSpeed, 2.8);
      if (this.fuelWarningCooldown <= 0) {
        this.fuelWarningCooldown = 4;
        this.game.ui.toast('FUEL EMPTY · APPARATUS LIMITED TO EMBARRASSING CRAWL SPEED');
      }
    }
  }

  afterSimulation() {
    if (this.originalTuning) Object.assign(this.game.ui.settings.tuning, this.originalTuning);
    this.originalTuning = null;
    this.updateMutualAid();
  }

  captureApparatusState() {
    const profile = this.selectedProfile();
    const apparatus = this.selectedApparatusState();
    apparatus.stationId = this.save.data.selectedStation;
    apparatus.condition = { ...this.phase2.condition };
    apparatus.water = Math.max(0, Math.min(profile.tank, this.phase2.hydrants.engineTank));
    this.save.persist();
  }

  applyDeployment(force = false) {
    if (!force && !this.canChangeDeployment()) return false;
    const station = this.selectedStation();
    const profile = this.selectedProfile();
    const apparatus = this.selectedApparatusState();
    apparatus.stationId = station.id;
    this.game.mode = 'foot';
    Object.assign(this.game.player, station.playerSpawn, { speed:0 });
    Object.assign(this.game.truck, station.truckSpawn, { speed:0, desiredHeading:station.truckSpawn.heading });
    this.game.roads.stationExit = null;
    this.game.roads.createStationExit(this.game.truck);
    this.phase2.condition = { ...apparatus.condition };
    this.phase2.hydrants.maxTank = profile.tank;
    this.phase2.hydrants.engineTank = Math.min(profile.tank, apparatus.water);
    this.game.renderer.updatePlayer(this.game.player, true);
    this.game.renderer.updateTruck(this.game.truck, this.game.equipment);
    this.game.camera.reset('foot');
    this.game.ui.setMission(null, `${profile.callSign} is assigned to ${station.name}. Start or mark ready when prepared.`);
    this.save.persist();
    this.ui.update(true);
    return true;
  }

  selectStation(id) {
    if (!this.canChangeDeployment() || !CITY_STATIONS.some(station => station.id === id)) return;
    this.captureApparatusState();
    this.save.selectStation(id);
    this.applyDeployment(true);
    this.game.ui.toast(`${this.selectedStation().name.toUpperCase()} SELECTED`);
  }

  selectApparatus(id) {
    if (!this.canChangeDeployment()) return;
    const profile = APPARATUS_PROFILES.find(item => item.id === id);
    if (!profile) return;
    if (this.progressionLevel() < profile.unlockLevel) {
      this.game.ui.toast(`${profile.label.toUpperCase()} UNLOCKS AT CAREER LEVEL ${profile.unlockLevel}`);
      return;
    }
    this.captureApparatusState();
    this.save.selectApparatus(id);
    this.applyDeployment(true);
    this.game.ui.toast(`${profile.callSign} ASSIGNED`);
  }

  selectModifier(id) {
    if (!this.canChangeDeployment() || !SHIFT_MODIFIERS.some(item => item.id === id)) return;
    this.save.data.modifierId = id;
    this.save.persist();
    this.game.ui.toast(`SHIFT CONDITION · ${this.selectedModifier().label.toUpperCase()}`);
    this.ui.update(true);
  }

  serviceSelected(kind) {
    if (!this.canService()) { this.game.ui.toast('RETURN TO QUARTERS BEFORE SERVICING THE UNIT'); return; }
    this.captureApparatusState();
    const result = this.save.service(this.selectedProfile().id, kind, this.selectedProfile());
    this.game.ui.toast(result.message.toUpperCase());
    if (result.ok) {
      this.applyDeployment(true);
      this.say('service');
    }
    this.ui.update(true);
  }

  markReady() {
    if (!this.canChangeDeployment()) return;
    const readiness = readinessScore(this.selectedApparatusState());
    if (readiness < 18 || this.selectedApparatusState().fuel <= 1) {
      this.game.ui.toast('UNIT NOT READY · SERVICE FUEL AND CRITICAL SYSTEMS');
      this.ui.selectTab('apparatus');
      return;
    }
    this.waitingForReady = false;
    this.ui.show(false);
    this.game.ui.setMission(null, `${this.selectedProfile().callSign} available at ${this.selectedStation().name}. Await dispatch.`);
    this.game.dispatchCountdown = this.game.options.testMode ? .25 : 2.8;
    this.say('ready');
  }

  finalizeCityCall() {
    this.recordedCall = true;
    const history = this.phase2.save.data.callHistory.at(-1) || {};
    const rank = document.getElementById('result-rank')?.textContent || history.rank || 'C';
    const call = this.game.activeCall;
    const apparatus = this.selectedApparatusState();
    const profile = this.selectedProfile();
    const turnoutSeconds = this.phase2.callMetrics.enteredTruckAt ? (this.phase2.callMetrics.enteredTruckAt - this.phase2.callMetrics.dispatchedAt) / 1000 : 0;
    const responseMinutes = Math.max(.1, Number(history.responseTime || performance.now() - this.game.callStartedAt) / 60000);
    const readiness = readinessScore(apparatus);
    const payout = callPayout({ score:history.score || 500, tacticalRank:rank, responseMinutes, modifier:this.selectedModifier().payout, readiness });
    const equipmentLeftBehind = this.phase2.equipment.leftBehindCount();
    this.save.recordCall({
      distance:this.currentCallDistance,
      fuelUsed:0,
      waterRemaining:this.phase2.hydrants.engineTank,
      condition:this.phase2.condition,
      collisions:this.phase2.callMetrics.collisions,
      waterSupply:Boolean(this.phase2.hydrants.connected),
      crewCommands:this.phase2.callMetrics.crewCommands,
      turnoutSeconds,
      district:call?.district || 'central',
      equipmentLeftBehind
    });
    this.save.earn(payout);
    const district = call?.district || 'central';
    this.save.data.districtReputation[district] = Math.max(0, Math.min(100, (this.save.data.districtReputation[district] ?? 50) + districtReputationDelta({ rank, collisions:this.phase2.callMetrics.collisions, escalations:this.phase3.escalations, completed:true })));
    if (rank === 'S' && this.phase2.callMetrics.collisions === 0 && !this.save.data.cityCommendations.includes('Golden Halligan')) this.save.data.cityCommendations.push('Golden Halligan');
    apparatus.calls += 0;
    apparatus.distance += 0;
    apparatus.water = Math.max(0, Math.min(profile.tank, this.phase2.hydrants.engineTank));
    this.save.persist();
    const copy = document.getElementById('result-copy');
    if (copy) copy.textContent += ` · City payout ¢${payout} · ${coverageGrade(this.coverageForDistrict(district))} district coverage.`;
    this.ui.update(true);
  }

  requestSecondAlarm(automatic = false) {
    if (!this.canRequestSecondAlarm()) return false;
    const call = this.game.activeCall;
    const stations = CITY_STATIONS.filter(station => station.id !== this.save.data.selectedStation).sort((a,b) => distanceMeters(a,call)-distanceMeters(b,call));
    let spawned = 0;
    MUTUAL_AID_UNITS.forEach((template, index) => {
      const station = stations[index % stations.length] || CITY_STATIONS[0];
      const position = { ...station.truckSpawn };
      const unit = this.phase2.entities.acquire('supportVehicle', {
        kind:template.kind, label:template.label, symbol:template.symbol,
        position, heading:bearing(position,call), state:'responding', speed:template.speed,
        elapsed:0, stuck:0, phase4RiskReduction:template.riskReduction,
        spawnSource:'phase4-mutual-aid'
      });
      if (unit) spawned += 1;
    });
    if (!spawned) {
      if (!automatic) this.game.ui.toast('NO ADDITIONAL UNITS AVAILABLE');
      return false;
    }
    this.secondAlarmRequested = true;
    this.save.data.secondAlarms += 1;
    this.save.persist();
    this.say('mutualAid');
    this.game.ui.toast(`SECOND ALARM · ${spawned} ADDITIONAL UNIT${spawned === 1 ? '' : 'S'} RESPONDING`, 2600);
    this.ui.update(true);
    return true;
  }

  updateMutualAid() {
    for (const unit of this.phase2.entities.active('supportVehicle')) {
      if (unit.spawnSource !== 'phase4-mutual-aid' || unit.state !== 'arrived' || this.processedMutualAid.has(unit.id)) continue;
      this.processedMutualAid.add(unit.id);
      this.phase3.operationElapsed = Math.max(0, this.phase3.operationElapsed - (unit.phase4RiskReduction || 8));
      this.game.ui.toast(`${String(unit.label || unit.kind).toUpperCase()} ON SCENE · COMMAND SUPPORT ACTIVE`);
    }
  }

  cleanupMutualAid() {
    for (const unit of [...this.phase2.entities.active('supportVehicle')]) if (unit.spawnSource === 'phase4-mutual-aid') this.phase2.entities.release(unit);
    this.secondAlarmRequested = false;
    this.processedMutualAid.clear();
  }

  coverageForStation(stationId) {
    const station = CITY_STATIONS.find(item => item.id === stationId) || CITY_STATIONS[0];
    const readiness = readinessScore(this.selectedApparatusState());
    const averageDistance = CITY_DISTRICTS.reduce((sum,district) => sum + distanceMeters(station,district),0) / CITY_DISTRICTS.length;
    return Math.max(0, Math.min(100, 105 - averageDistance / 90)) * (.58 + readiness / 240);
  }

  coverageForDistrict(districtId) {
    const district = CITY_DISTRICTS.find(item => item.id === districtId) || CITY_DISTRICTS[0];
    const distance = distanceMeters(this.selectedStation(), district);
    const readiness = readinessScore(this.selectedApparatusState());
    return Math.max(0, Math.min(100, 110 - distance / 55)) * (.55 + readiness / 220);
  }

  endShift() {
    if (!this.canEndShift()) return;
    const reward = this.save.claimChallenges();
    const nextModifier = SHIFT_MODIFIERS[(this.save.data.shiftNumber + this.seed) % SHIFT_MODIFIERS.length];
    this.save.nextShift(nextModifier.id);
    this.waitingForReady = true;
    this.game.dispatchCountdown = null;
    this.game.ui.toast(`SHIFT CLOSED · CHALLENGE BONUS ¢${reward} · NEXT: ${nextModifier.label.toUpperCase()}`, 3800);
    this.ui.update(true);
    this.ui.selectTab('deployment');
  }

  say(category) {
    if (this.game.ui.settings.radioHumour === false) return;
    const lines = PHASE4_RADIO[category] || [];
    if (!lines.length) return;
    const line = lines[(this.seed + this.radioCursor) % lines.length];
    this.radioCursor += 1;
    this.phase3.ui.radio(line);
  }
}
