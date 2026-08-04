import { GAME_STATES } from './config.js';
import { meters } from './math.js';
import { OPERATION_TEMPLATES, RADIO_LINES } from './phase3-data.js';
import { OperationEngine } from './operation-engine.js';
import { calculateEscalation, operationGrade, staminaStep, airStep } from './phase3-math.js';
import { ProgressionStore } from './progression.js';
import { Phase3UI } from './phase3-ui.js';

const IMMEDIATE_ACTIONS = new Set(['sizeup', 'command', 'scene-safety', 'accountability', 'documentation']);
const TASK_ACTIONS = new Set(['search', 'overhaul', 'stabilize', 'access', 'debris', 'investigate', 'meter', 'reset', 'assist', 'reassess']);

export class Phase3Controller {
  constructor(game, phase2, { seed = 1 } = {}) {
    this.game = game;
    this.phase2 = phase2;
    this.seed = seed;
    this.progression = new ProgressionStore();
    this.ui = new Phase3UI(this);
    this.operation = null;
    this.operationCallId = null;
    this.operationStartedAt = 0;
    this.activeTask = null;
    this.risk = 0;
    this.stamina = 100;
    this.air = 100;
    this.maskOn = false;
    this.escalations = 0;
    this.escalationThresholds = new Set();
    this.finishing = false;
    this.radioCursor = 0;
  }

  install() {
    this.game.phase3 = this;
    this.ui.install();
    this.decorateStartScreen();
    this.installHooks();
  }

  decorateStartScreen() {
    const eyebrow = document.querySelector('.start-card .eyebrow');
    const intro = document.querySelector('.start-card > p');
    const features = document.querySelector('.start-card .feature-grid');
    if (eyebrow) eyebrow.textContent = 'Phase 3 · tactical operations and progression';
    if (intro) intro.textContent = 'Respond through a living Peterborough, manage incident command, complete ordered tactical objectives, control escalating hazards, protect your crew and build a persistent firefighter career.';
    if (features) features.innerHTML = '<div><b>Tactical calls</b><span>Size-up, command, search, rescue, overhaul and investigation objectives.</span></div><div><b>Changing incidents</b><span>Delay and weak mitigation increase scene risk and complications.</span></div><div><b>Career progression</b><span>Earn XP, ranks, unlocks, streaks and first-responder achievements.</span></div>';
    const version = document.getElementById('version-text');
    if (version) version.textContent = 'Phase 3 build 0.6.0-phase3';
  }

  templateFor(call) {
    return OPERATION_TEMPLATES[call?.type] || (call?.type?.includes('fire') ? OPERATION_TEMPLATES['structure-fire'] : OPERATION_TEMPLATES.rescue);
  }

  installHooks() {
    const game = this.game;
    const dispatch = game.dispatchCall.bind(game);
    game.dispatchCall = call => {
      const result = dispatch(call);
      if (game.activeCall) this.startOperation(game.activeCall);
      return result;
    };

    const exitTruck = game.exitTruck.bind(game);
    game.exitTruck = () => {
      const result = exitTruck();
      if (game.state.current === GAME_STATES.ON_SCENE && this.operation) {
        this.complete('arrival', 'arrival');
        game.ui.setObjective(this.operation.next()?.label || 'Open incident command.');
        this.ui.show(true);
        this.say('arrival');
      }
      return result;
    };

    const simulate = game.simulate.bind(game);
    game.simulate = dt => { simulate(dt); this.update(dt); };

    const render = game.render.bind(game);
    game.render = dt => { render(dt); this.ui.update(); };

    this.baseCompleteCall = game.completeCall.bind(game);
    game.completeCall = reason => this.requestCompletion(reason);

    const reset = game.resetAtStation.bind(game);
    game.resetAtStation = clearCall => {
      reset(clearCall);
      this.resetOperation();
    };

    const commandCrew = this.phase2.commandCrew.bind(this.phase2);
    this.phase2.commandCrew = task => {
      const result = commandCrew(task);
      if (task === 'waterSupply') this.complete('water', 'crew');
      if (task === 'controlTraffic') this.complete('traffic', 'crew');
      if (task === 'assistPatient') this.complete('assessment', 'crew');
      return result;
    };

    const takeEquipment = this.phase2.takeEquipment.bind(this.phase2);
    this.phase2.takeEquipment = id => {
      const result = takeEquipment(id);
      if (id === 'thermalCamera' && this.operation?.get('meter')?.status === 'locked') this.game.ui.toast('THERMAL CAMERA READY FOR INVESTIGATION');
      return result;
    };
  }

  startOperation(call) {
    const template = this.templateFor(call);
    this.operation = new OperationEngine(template, performance.now());
    this.operationCallId = call.id;
    this.operationStartedAt = performance.now();
    this.activeTask = null;
    this.risk = template.baseRisk;
    this.stamina = 100;
    this.air = 100;
    this.maskOn = false;
    this.escalations = 0;
    this.escalationThresholds.clear();
    this.finishing = false;
    this.ui.update();
    this.say('dispatch');
  }

  resetOperation() {
    this.operation = null;
    this.operationCallId = null;
    this.activeTask = null;
    this.maskOn = false;
    this.risk = 0;
    this.ui.show(false);
    this.ui.update();
  }

  update(dt) {
    if (!this.operation || !this.game.activeCall || this.finishing || this.game.state.current === GAME_STATES.PAUSED) return;
    const onScene = this.game.state.current === GAME_STATES.ON_SCENE;
    const moving = this.game.mode === 'foot' && this.game.player.speed > .2;
    const running = moving && this.game.input.boostHeld;
    const working = Boolean(this.activeTask && this.game.input.actionHeld);
    const nearHazard = onScene && this.game.activeCall.type.includes('fire') && meters(this.game.player, this.game.activeCall) < 30;
    const resting = this.game.mode === 'foot' && meters(this.game.player, this.game.truck) < 8 && !moving && !working;
    this.stamina = staminaStep(this.stamina, { moving, running, working, resting }, dt);
    this.air = airStep(this.air, { maskOn:this.maskOn, nearHazard, working }, dt);

    this.syncAutomaticObjectives();
    this.updateActiveTask(dt);
    this.updateRisk();
    this.maybeFinalize();
  }

  syncAutomaticObjectives() {
    const call = this.game.activeCall;
    if (this.game.state.current === GAME_STATES.ON_SCENE) this.complete('arrival', 'system');
    if (this.phase2.callMetrics.positioned) this.complete('arrival', 'positioning');
    if (this.phase2.hydrants.connected) this.complete('water', 'hydrant');
    if (this.phase2.sceneCones || this.phase2.support.trafficControl) this.complete('traffic', 'traffic-control');
    if (call.type.includes('fire') && this.game.incident.fireIntensity <= 0) this.complete('attack', 'suppression');
    if (['medical', 'mvc'].includes(call.type)) {
      if (this.phase2.careProgress >= 25 || this.phase2.patientAssisted) this.complete('assessment', 'patient-care');
      if (this.phase2.patientAssisted) this.complete('treatment', 'patient-care');
      if (this.phase2.patientTransferred) this.complete('handoff', 'paramedics');
    }
  }

  updateActiveTask(dt) {
    if (!this.activeTask) return;
    const objective = this.operation.get(this.activeTask);
    if (!objective || objective.status === 'complete') { this.activeTask = null; return; }
    const nearScene = this.game.mode === 'foot' && meters(this.game.player, this.game.activeCall) < 48;
    if (!nearScene || !this.game.input.actionHeld) return;
    if (this.stamina <= 3 || (this.maskOn && this.air <= 1)) {
      this.game.ui.setObjective('Return to Engine 1 for rehab before continuing.');
      return;
    }
    const rate = 100 / Math.max(1, objective.duration || 4);
    const fatigueFactor = .45 + .55 * this.stamina / 100;
    this.operation.advance(objective.id, rate * dt * fatigueFactor, 'player', performance.now());
    this.game.ui.pulseFeedback(`${objective.label} ${Math.round(objective.progress)}%`);
    if (objective.status === 'complete') {
      this.activeTask = null;
      if (['reset', 'assist', 'reassess'].includes(objective.id)) this.game.ui.toast(`${objective.label.toUpperCase()} COMPLETE`);
      this.game.ui.setObjective(this.operation.next()?.label || 'All tactical objectives complete.');
    }
  }

  updateRisk() {
    const elapsedSeconds = (performance.now() - this.operationStartedAt) / 1000;
    const supportOnScene = this.phase2.entities.active('supportVehicle').filter(unit => unit.state === 'arrived').length;
    this.risk = calculateEscalation({
      elapsedSeconds,
      baseRisk:this.operation.template.baseRisk,
      completedRatio:this.operation.completionRatio(),
      supportOnScene,
      waterSupply:Boolean(this.phase2.hydrants.connected)
    });
    for (const threshold of [45, 70, 88]) {
      if (this.risk >= threshold && !this.escalationThresholds.has(threshold)) {
        this.escalationThresholds.add(threshold);
        this.escalate(threshold);
      }
    }
  }

  escalate(threshold) {
    this.escalations += 1;
    if (this.game.activeCall.type.includes('fire')) this.game.incident.fireIntensity = Math.min(100, this.game.incident.fireIntensity + (threshold >= 70 ? 16 : 8));
    if (['medical', 'mvc'].includes(this.game.activeCall.type) && !this.phase2.patientAssisted) this.phase2.careProgress = Math.max(0, this.phase2.careProgress - 12);
    this.game.score = Math.max(0, this.game.score - 35);
    this.say('escalation');
    this.game.ui.toast(`INCIDENT ESCALATION · RISK ${Math.round(this.risk)}%`, 2200);
  }

  complete(id, source = 'system') {
    if (!this.operation?.get(id)) return false;
    const changed = this.operation.complete(id, source, performance.now());
    if (changed) this.game.ui.setObjective(this.operation.next()?.label || 'All tactical objectives complete.');
    return changed;
  }

  availableActions() {
    if (!this.operation) return [];
    return this.operation.objectives
      .filter(objective => ['available', 'active'].includes(objective.status) && objective.action)
      .map(objective => ({ ...objective, disabled: this.activeTask && this.activeTask !== objective.id }));
  }

  performAction(action) {
    if (!this.operation || !this.game.activeCall) return;
    if (action === 'toggle-mask') {
      this.maskOn = !this.maskOn;
      this.game.ui.toast(this.maskOn ? 'SCBA MASK ON · AIR SUPPLY ACTIVE' : 'SCBA MASK OFF');
      return;
    }
    if (action === 'rehab') {
      if (meters(this.game.player, this.game.truck) > 10) { this.game.ui.toast('RETURN TO ENGINE 1 FOR REHAB'); return; }
      this.stamina = Math.min(100, this.stamina + 35);
      this.air = Math.min(100, this.air + 45);
      this.game.ui.toast('QUICK REHAB COMPLETE · WATER BOTTLE MYSTERIOUSLY LUKEWARM');
      return;
    }
    const objective = this.operation.objectives.find(item => item.action === action && ['available', 'active'].includes(item.status));
    if (!objective) { this.game.ui.toast('THAT OPERATION IS NOT AVAILABLE YET'); return; }
    if (this.game.state.current !== GAME_STATES.ON_SCENE) { this.game.ui.toast('ARRIVE ON SCENE BEFORE STARTING TACTICAL OPERATIONS'); return; }
    if (action === 'meter' && !this.phase2.equipment.has('thermalCamera')) { this.game.ui.toast('RETRIEVE THE THERMAL CAMERA FROM THE CAB'); return; }
    if (action === 'access' && !this.phase2.equipment.has('halligan')) { this.game.ui.toast('RETRIEVE THE HALLIGAN FOR PATIENT ACCESS'); return; }
    if (IMMEDIATE_ACTIONS.has(action)) {
      this.complete(objective.id, 'command');
      this.game.ui.toast(`${objective.label.toUpperCase()} COMPLETE`);
      this.say('arrival');
      this.maybeFinalize();
      return;
    }
    if (TASK_ACTIONS.has(action)) {
      this.operation.begin(objective.id);
      this.activeTask = objective.id;
      if (action === 'search' && !this.maskOn) this.maskOn = true;
      this.game.ui.setObjective(`${objective.label}: move near the incident and hold Interact.`);
      this.ui.selectTab('objectives');
    }
  }

  requestCompletion(reason) {
    if (!this.operation) return this.baseCompleteCall(reason);
    if (this.game.activeCall?.type.includes('fire')) this.complete('attack', 'suppression');
    if (['medical', 'mvc'].includes(this.game.activeCall?.type)) {
      this.complete('treatment', 'patient-care');
      this.complete('handoff', 'paramedics');
    }
    this.game.ui.setObjective(this.operation.next()?.label || 'All tactical objectives complete.');
    this.maybeFinalize(reason);
  }

  maybeFinalize(reason = 'Tactical objectives complete') {
    if (!this.operation || this.finishing || this.game.state.current !== GAME_STATES.ON_SCENE || !this.operation.essentialComplete()) return false;
    this.finishing = true;
    const elapsedSeconds = (performance.now() - this.operationStartedAt) / 1000;
    const optionalCompleted = this.operation.objectives.filter(item => item.essential === false && item.status === 'complete').length;
    const grade = operationGrade({
      completionRatio:this.operation.completionRatio(),
      failedEssential:this.operation.failedEssentialCount(),
      elapsedSeconds,
      collisions:this.phase2.callMetrics.collisions,
      escalations:this.escalations,
      optionalCompleted
    });
    const career = this.progression.record({
      score:grade.score,
      rank:grade.rank,
      noCollision:this.phase2.callMetrics.collisions === 0,
      escalations:this.escalations,
      completionRatio:this.operation.completionRatio()
    });
    this.baseCompleteCall(reason);
    const tacticalBonus = Math.round(grade.score * .35);
    this.game.score += tacticalBonus;
    if (this.phase2.save?.data?.shift) this.phase2.save.data.shift.totalScore += tacticalBonus;
    this.phase2.save?.persist?.();
    const scoreElement = document.getElementById('result-score');
    if (scoreElement) scoreElement.textContent = String(Math.round(this.game.score)).padStart(4, '0');
    const rankElement = document.getElementById('result-rank');
    if (rankElement) rankElement.textContent = grade.rank;
    const copy = document.getElementById('result-copy');
    if (copy) copy.textContent = `Tactical ${grade.rank} · +${tacticalBonus} score · +${career.xpGain} XP · risk escalations ${this.escalations}${career.leveledUp ? ` · promoted to ${career.rank}` : ''}.`;
    this.say('completion');
    this.ui.updateCareer();
    this.ui.show(false);
    return true;
  }

  say(category) {
    if (this.game.ui.settings.radioHumour === false) return;
    const lines = RADIO_LINES[category] || [];
    if (!lines.length) return;
    const line = lines[(this.radioCursor + this.seed) % lines.length];
    this.radioCursor += 1;
    this.ui.radio(line);
  }
}
