import { CALLS, ENTITY_BUDGETS, EQUIPMENT_CATALOG, GAME_STATES } from './config.js';
import { EntityManager } from './entities.js';
import { EntityRenderer } from './entity-renderer.js';
import { PedestrianSystem } from './pedestrians.js';
import { CrewSystem } from './crew.js';
import { SupportSystem } from './support.js';
import { HydrantSystem } from './hydrants.js';
import { EquipmentSystem } from './equipment.js';
import { SaveStore } from './save.js';
import { clamp, meters, pointFrom, seededRandom } from './math.js';
import { applyConditionDamage, buildWeightedCallPool, calculateCallScore } from './phase2-math.js';
import { Phase2UI } from './phase2-ui.js';
import { installPhase2Hooks } from './phase2-hooks.js';

export class Phase2Controller {
  constructor(game, { seed = 1, forcedTime = null } = {}) {
    this.game = game;
    this.random = seededRandom(seed + 911);
    this.baseCallNotes = new Map(CALLS.map(call => [call.id, call.notes]));
    this.save = new SaveStore();
    this.entities = new EntityManager({
      pedestrian: ENTITY_BUDGETS.pedestriansDesktop,
      crew: ENTITY_BUDGETS.crew,
      supportVehicle: ENTITY_BUDGETS.supportVehicles,
      supportPerson: ENTITY_BUDGETS.supportPersonnel,
      hydrant: 16, patient: 2, prop: 16
    });
    this.renderer = new EntityRenderer(game.renderer);
    this.pedestrians = new PedestrianSystem({ entities:this.entities, roads:game.roads, budgets:ENTITY_BUDGETS, seed });
    this.crew = new CrewSystem({ entities:this.entities, game });
    this.support = new SupportSystem({ entities:this.entities, roads:game.roads, game });
    this.hydrants = new HydrantSystem({ entities:this.entities, game, renderer:this.renderer });
    this.equipment = new EquipmentSystem(game);
    this.condition = { body:100, steering:100, engine:100, lights:100, pump:100 };
    this.callMetrics = this.newCallMetrics();
    this.patient = null;
    this.patientAssisted = false;
    this.patientTransferred = false;
    this.careProgress = 0;
    this.sceneCones = false;
    this.timeOfDay = forcedTime || game.ui.settings.timeOfDay || 'auto';
    this.currentTimeVisual = 'day';
    this.shiftElapsed = 0;
    this.damageCooldown = 0;
    this.autoSupportTimer = 0;
    this.installed = false;
    this.panel = new Phase2UI(this);
  }

  newCallMetrics() {
    return {
      dispatchedAt:0, enteredTruckAt:0, arrivedAt:0, collisions:0, roadHits:0,
      crewCommands:0, supportRequests:0, correctEquipment:false, positioned:false,
      waterSupply:false, startScore:0, completionReason:'', damageStart:0
    };
  }

  install() {
    if (this.installed) return;
    this.installed = true;
    this.game.phase2 = this;
    this.hydrants.initialize();
    this.panel.install();
    installPhase2Hooks(this);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.game.audio.pause();
      else if (this.game.state.current !== GAME_STATES.PAUSED) this.game.audio.resume();
    });
    this.renderer.setTimeOfDay(this.resolveTimeVisual());
  }

  beforeSimulation(dt) {
    this.shiftElapsed += dt;
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    if (this.game.mode === 'truck') {
      this.save.data.shift.distanceDriven += Math.abs(this.game.truck.speed) * dt;
      const tuning = this.game.ui.settings.tuning;
      if (!this.originalTuning) this.originalTuning = {};
      this.originalTuning.lowSpeedTurnRate = tuning.lowSpeedTurnRate;
      this.originalTuning.highSpeedTurnRate = tuning.highSpeedTurnRate;
      this.originalTuning.maxNormalSpeed = tuning.maxNormalSpeed;
      this.originalTuning.maxBoostedSpeed = tuning.maxBoostedSpeed;
      const steeringFactor = .62 + .38 * this.condition.steering / 100;
      const engineFactor = .68 + .32 * this.condition.engine / 100;
      tuning.lowSpeedTurnRate *= steeringFactor;
      tuning.highSpeedTurnRate *= steeringFactor;
      tuning.maxNormalSpeed *= engineFactor;
      tuning.maxBoostedSpeed *= engineFactor;
    }
  }

  afterSimulation(dt) {
    if (this.originalTuning) {
      Object.assign(this.game.ui.settings.tuning, this.originalTuning);
      this.originalTuning = null;
    }
    const center = this.game.mode === 'truck' ? this.game.truck : this.game.player;
    const emergency = this.game.equipment.lights && this.game.equipment.siren;
    const fireIntensity = this.game.incident.call?.type.includes('fire') ? this.game.incident.fireIntensity : 0;
    this.pedestrians.setPerformance(this.game.fps);
    this.pedestrians.update(dt, center, this.game.truck, emergency, this.game.activeCall, fireIntensity, this.game.ui.settings.reducedCrowds);
    this.crew.update(dt);
    this.support.update(dt);
    if (this.patientAssisted) this.support.transferPatient();
    if (this.game.activeCall && this.game.state.current === GAME_STATES.ON_SCENE) {
      this.autoSupportTimer += dt;
      if (this.autoSupportTimer > 5) { this.autoSupportTimer = -999; this.requestRecommendedSupport(); }
    }
    const visual = this.resolveTimeVisual();
    if (visual !== this.currentTimeVisual) { this.currentTimeVisual = visual; this.renderer.setTimeOfDay(visual); }
  }

  prepareCall(call) {
    this.cleanupCall(false);
    this.callMetrics = this.newCallMetrics();
    this.callMetrics.dispatchedAt = performance.now();
    this.callMetrics.startScore = this.game.score;
    this.callMetrics.damageStart = this.totalDamage();
    this.autoSupportTimer = 0;
    const repeats = this.save.data.callHistory.filter(item => item.callId === call.id).length;
    call.repetition = repeats;
    if (repeats > 0) call.notes = `${call.notes} Dispatch notes this address has appeared ${repeats + 1} times in recent shifts.`;
    if (call.type === 'medical' || call.type === 'mvc') {
      this.patient = this.entities.acquire('patient', {
        kind:'patient', position:pointFrom(call, 135, 8), heading:0, state:'waiting',
        spawnSource:call.id
      });
    }
    if (call.type === 'mvc') {
      this.entities.acquire('prop', { kind:'wreck', symbol:'◆', position:pointFrom(call, 65, 5), heading:65, state:'hazard', spawnSource:call.id });
      this.entities.acquire('prop', { kind:'wreck', symbol:'◆', position:pointFrom(call, 245, 5), heading:245, state:'hazard', spawnSource:call.id });
    }
  }

  updatePatientIncident(dt, input) {
    if (!this.patient || this.game.state.current !== GAME_STATES.ON_SCENE) return;
    const correctTool = this.equipment.has('medicalBag');
    const near = meters(this.game.player, this.patient.position) < 6.5;
    if (near && correctTool && input.actionHeld && !this.patientAssisted) {
      this.careProgress = clamp(this.careProgress + 20 * dt, 0, 100);
      this.patient.state = 'treated';
      this.game.ui.pulseFeedback(`Patient assistance ${Math.floor(this.careProgress)}%`);
      if (this.careProgress >= 100) this.markPatientAssisted('player');
    }
    if (!this.patientAssisted) {
      this.game.ui.setObjective(correctTool ? 'Approach the patient and hold Interact to provide assistance.' : 'Retrieve the medical bag from the curbside compartment.');
      return;
    }
    const ambulanceArrived = this.entities.active('supportVehicle').some(unit => unit.kind === 'ambulance' && unit.state === 'arrived');
    if (!ambulanceArrived) this.game.ui.setObjective('Patient assisted. Await the ambulance and protect the scene.');
    if (this.game.activeCall.type === 'mvc' && !this.sceneCones) this.game.ui.setObjective('Deploy traffic cones and establish a protected work area.');
    const ready = ambulanceArrived && this.patientTransferred && (this.game.activeCall.type !== 'mvc' || this.sceneCones || this.support.trafficControl);
    if (ready) this.game.completeCall('Patient transferred to paramedics');
  }

  markPatientAssisted(source = 'player') {
    if (this.patientAssisted) return;
    this.patientAssisted = true;
    this.patient.state = 'treated';
    this.save.data.shift.patientsAssisted += 1;
    this.game.ui.toast(`PATIENT ASSISTED · ${source === 'crew' ? 'CREW TASK COMPLETE' : 'READY FOR TRANSFER'}`);
    this.support.transferPatient();
  }

  requestRecommendedSupport() {
    for (const kind of this.game.activeCall?.recommendedSupport || []) this.requestSupport(kind, true);
  }

  requestSupport(kind, automatic = false) {
    const result = this.support.request(kind);
    if (result.ok && !automatic) this.callMetrics.supportRequests += 1;
    this.game.ui.toast(result.message.toUpperCase(), 1800);
    return result;
  }

  selectWeightedCall() {
    const weighted = buildWeightedCallPool(CALLS, this.save.data.callHistory);
    return weighted[Math.floor(this.random()*weighted.length)] || CALLS[0];
  }

  applyDamage(amount, reason) {
    const impact = clamp(amount, 0, 15);
    this.condition = applyConditionDamage(this.condition, impact);
    this.save.data.shift.apparatusDamage += impact;
    this.game.ui.toast(`APPARATUS DAMAGE · ${reason.toUpperCase()} · BODY ${Math.round(this.condition.body)}%`, 1500);
  }

  totalDamage() { return 500 - Object.values(this.condition).reduce((sum,value)=>sum+value,0); }

  finalizeCall() {
    const now = performance.now();
    const elapsed = now - this.game.callStartedAt;
    const turnout = this.callMetrics.enteredTruckAt ? this.callMetrics.enteredTruckAt - this.callMetrics.dispatchedAt : elapsed;
    const calculated = calculateCallScore({
      collisions:this.callMetrics.collisions, roadHits:this.callMetrics.roadHits,
      positioned:this.callMetrics.positioned, correctEquipment:this.correctEquipmentForCall(),
      waterSupply:Boolean(this.hydrants.connected), crewCommands:this.callMetrics.crewCommands,
      damageDelta:this.totalDamage()-this.callMetrics.damageStart,
      isFire:this.game.activeCall.type.includes('fire')
    });
    const { score, rank, breakdown } = calculated;
    const { safeDriving, positioning, equipment, supply, crew, completion } = breakdown;
    this.game.score = this.callMetrics.startScore + score;
    this.save.recordCall({ callId:this.game.activeCall.id, type:this.game.activeCall.type, score, rank, responseTime:elapsed, turnoutTime:turnout, collisions:this.callMetrics.collisions });
    this.save.persist();
    this.game.ui.showResult(true, {
      title: this.game.activeCall.type.includes('fire') ? 'Fire Control Confirmed' : 'Incident Objectives Complete',
      copy: `Safe driving ${safeDriving} · Position ${positioning} · Equipment ${equipment} · Supply ${supply} · Crew ${crew} · Completion ${completion}`,
      time:elapsed, score:this.game.score, rank
    });
    this.panel.updateShift();
  }

  correctEquipmentForCall() {
    const type = this.game.activeCall?.type;
    if (type?.includes('fire')) return this.game.incident.tool === 'hose' || this.game.incident.tool === 'extinguisher';
    if (type === 'medical') return this.equipment.has('medicalBag') || this.patientAssisted;
    if (type === 'mvc') return this.sceneCones && this.patientAssisted;
    return true;
  }

  resolveTimeVisual() {
    const setting = this.game.ui.settings.timeOfDay;
    if (setting && setting !== 'auto') return setting;
    if (this.timeOfDay && this.timeOfDay !== 'auto') return this.timeOfDay;
    const cycle = this.shiftElapsed % 360;
    if (cycle < 170) return 'day';
    if (cycle < 235) return 'dusk';
    return 'night';
  }

  cleanupCall(clearHydrants = true) {
    this.crew.reset();
    this.support.reset();
    this.pedestrians.reset();
    this.entities.clear('patient');
    this.entities.clear('prop');
    this.patient = null;
    this.patientAssisted = false;
    this.patientTransferred = false;
    this.careProgress = 0;
    this.sceneCones = false;
    this.equipment.restoreAll();
    if (clearHydrants) this.hydrants.reset();
    this.panel.show(false);
  }

  commandCrew(task) {
    const result = this.crew.command(task);
    if (result.ok) this.callMetrics.crewCommands += 1;
    this.game.ui.toast(result.message.toUpperCase(), 1800);
  }

  takeEquipment(id) {
    const result = this.equipment.take(id);
    if (result.ok) {
      if (id === 'medicalBag' && ['medical','mvc'].includes(this.game.activeCall?.type)) this.callMetrics.correctEquipment = true;
      if (id === 'cones') this.game.ui.setObjective('Deploy the traffic cones near the collision scene.');
    }
    this.game.ui.toast(result.message.toUpperCase(), 1500);
    this.panel.updateEquipment();
  }

  deployEquipment() {
    const id = this.equipment.primary;
    if (!id) { this.game.ui.toast('NO PRIMARY TOOL TO DEPLOY'); return; }
    if (id === 'cones') {
      if (!this.game.activeCall || meters(this.game.player, this.game.activeCall) > 35) { this.game.ui.toast('MOVE CLOSER TO THE INCIDENT BEFORE DEPLOYING CONES'); return; }
      this.equipment.deploy(id);
      this.sceneCones = true;
      this.entities.acquire('prop', { kind:'cones', symbol:'▲', position:pointFrom(this.game.activeCall,225,18), heading:0, state:'deployed', spawnSource:'player' });
      this.entities.acquire('prop', { kind:'cones', symbol:'▲', position:pointFrom(this.game.activeCall,45,18), heading:0, state:'deployed', spawnSource:'player' });
      this.support.establishTrafficControl(true);
      this.game.ui.toast('TRAFFIC CONTROL DEPLOYED');
    } else this.game.ui.toast(`${EQUIPMENT_CATALOG[id]?.label || id} REMAINS CARRIED`);
    this.panel.updateEquipment();
  }

  connectHydrant() {
    const result = this.hydrants.connect(this.game.player, this.equipment);
    if (result.ok) this.callMetrics.waterSupply = true;
    this.game.ui.toast(result.message.toUpperCase(), 1700);
  }
}
