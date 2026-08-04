import { CALLS, GAME_STATES } from './config.js';
import { FINAL_CALLS, DIFFICULTY_PRESETS, FINAL_RADIO, INCIDENT_VARIANTS, TUTORIAL_STEPS } from './phase5-data.js';
import { adaptiveScale, debriefBreakdown, effectiveRisk, gradeForScore, performanceTier, perkTaskRate, pickVariant, weightedCall } from './phase5-math.js';
import { migratePhase4Save } from './phase4-save.js';
import { distanceMeters } from './phase4-math.js';
import { Phase5SaveStore } from './phase5-save.js';
import { Phase5UI } from './phase5-ui.js';

export class Phase5Controller {
  constructor(game, phase2, phase3, phase4, { seed = 1 } = {}) {
    this.game = game;
    this.phase2 = phase2;
    this.phase3 = phase3;
    this.phase4 = phase4;
    this.seed = seed;
    this.save = new Phase5SaveStore();
    this.ui = new Phase5UI(this);
    this.variant = null;
    this.performanceTier = this.save.data.performance.lastTier || 'high';
    this.performanceFps = 0;
    this.performanceElapsed = 0;
    this.performanceFrames = 0;
    this.baseTrafficCount = game.traffic.maxVehicles;
    this.basePedestrianBudget = phase2.entities.budgets.pedestrian || 18;
    this.recordedCallId = null;
    this.secondAlarmCounted = false;
    this.radioCursor = 0;
  }

  install() {
    this.game.phase5 = this;
    this.decorateRelease();
    this.installHooks();
    this.ui.install();
    this.applyAccessibility();
    this.applyPerformanceDetail(true);
    if (!this.save.data.tutorialComplete && !this.save.data.tutorialDismissed) setTimeout(() => this.ui.showTutorial(this.save.data.tutorialStep), 450);
  }

  decorateRelease() {
    const eyebrow = document.querySelector('.start-card .eyebrow');
    const intro = document.querySelector('.start-card > p');
    const features = document.querySelector('.start-card .feature-grid');
    if (eyebrow) eyebrow.textContent = 'Complete release · Phase 5';
    if (intro) intro.textContent = 'A fully fleshed-out Peterborough fire-response game with 23 incident locations, randomized conditions, tactical operations, three stations, four apparatus, persistent career progression, medals, records, service management and adaptive mobile performance.';
    if (features) features.innerHTML = '<div><b>Complete incident roster</b><span>Fire, medical, rescue, collision and alarm calls with changing conditions.</span></div><div><b>Full career loop</b><span>Ranks, functional perks, medals, records, credits, apparatus service and shift challenges.</span></div><div><b>Release-grade polish</b><span>Guided onboarding, detailed debriefs, difficulty modes, accessibility, save tools and browser QA.</span></div>';
    const version = document.getElementById('version-text');
    if (version) version.textContent = 'Complete release 1.0.0-phase5';
    document.title = 'Peterborough Fire Response: Street Shift — Complete Release';
  }

  allCalls() { return [...CALLS, ...FINAL_CALLS]; }
  difficulty() { return DIFFICULTY_PRESETS.find(item => item.id === this.save.data.difficulty) || DIFFICULTY_PRESETS[1]; }
  canChangeDifficulty() { return [GAME_STATES.START_SCREEN, GAME_STATES.AVAILABLE].includes(this.game.state.current) && !this.game.activeCall; }

  installHooks() {
    const originalSelectCall = this.game.selectCall.bind(this.game);
    this.game.selectCall = () => {
      const forced = this.game.options.forcedCall;
      if (forced) {
        const match = this.allCalls().find(call => call.id === forced || call.type === forced || call.id.includes(forced));
        if (match) return { ...match };
        return originalSelectCall();
      }
      const selected = weightedCall(this.allCalls(), {
        lastId:this.game.lastCallId,
        districtReputation:this.phase4.save.data.districtReputation,
        station:this.phase4.selectedStation(),
        distance:distanceMeters,
        random:() => this.game.random()
      });
      return selected ? { ...selected } : originalSelectCall();
    };

    const originalTemplateFor = this.phase3.templateFor.bind(this.phase3);
    this.phase3.templateFor = call => {
      const base = originalTemplateFor(call);
      const difficulty = this.difficulty();
      const unlocks = this.phase3.progression.data.unlocks || [];
      const apparatusId = this.phase4.selectedProfile().id;
      return {
        ...base,
        baseRisk:effectiveRisk(base.baseRisk, this.variant?.risk || 0, difficulty.risk),
        objectives:base.objectives.map(objective => {
          const perk = perkTaskRate(1, { unlocks, objectiveId:objective.id, callType:call?.type, apparatusId });
          const duration = objective.duration ? Math.max(1, objective.duration * difficulty.fatigue / perk) : objective.duration;
          return { ...objective, duration, hint:(difficulty.hints && this.save.data.accessibility.showHints) ? objective.hint : '' };
        })
      };
    };

    const originalDispatch = this.game.dispatchCall.bind(this.game);
    this.game.dispatchCall = call => {
      this.variant = pickVariant(call, INCIDENT_VARIANTS, () => this.game.random());
      this.recordedCallId = null;
      this.secondAlarmCounted = false;
      const cleanCall = { ...call, notes:String(call.notes || '') };
      const result = originalDispatch(cleanCall);
      if (this.game.activeCall) {
        this.game.activeCall.variant = this.variant?.id || 'standard';
        this.game.activeCall.variantLabel = this.variant?.label || 'Standard conditions';
        if (this.game.activeCall.type.includes('fire')) {
          const multiplier = Math.max(.7, this.difficulty().risk * (1 + (this.variant?.risk || 0) / 100));
          this.game.incident.fireIntensity = Math.min(100, Math.max(18, this.game.incident.fireIntensity * multiplier));
        }
        this.ui.showCallBriefing(this.game.activeCall, this.variant);
        this.say('briefing');
      }
      this.ui.update(true);
      return result;
    };

    const originalMaybeFinalize = this.phase3.maybeFinalize.bind(this.phase3);
    this.phase3.maybeFinalize = reason => {
      const completed = originalMaybeFinalize(reason);
      if (completed && this.game.state.current === GAME_STATES.CALL_COMPLETE) this.recordCompletedCall();
      return completed;
    };

    const originalCompleteCall = this.game.completeCall.bind(this.game);
    this.game.completeCall = reason => {
      const result = originalCompleteCall(reason);
      if (this.game.state.current === GAME_STATES.CALL_COMPLETE) this.recordCompletedCall();
      return result;
    };

    const originalSecondAlarm = this.phase4.requestSecondAlarm.bind(this.phase4);
    this.phase4.requestSecondAlarm = automatic => {
      const result = originalSecondAlarm(automatic);
      if (result && !this.secondAlarmCounted) {
        this.secondAlarmCounted = true;
        const medals = this.save.recordSecondAlarm();
        this.showNewMedals(medals);
      }
      return result;
    };

    const originalEndShift = this.phase4.endShift.bind(this.phase4);
    this.phase4.endShift = () => {
      const statuses = this.phase4.save.challengeStatus();
      const perfect = statuses.length >= 3 && statuses.every(challenge => challenge.complete);
      const before = this.phase4.save.data.shiftNumber;
      const result = originalEndShift();
      if (this.phase4.save.data.shiftNumber > before) {
        const medals = this.save.recordShift({ perfect });
        this.showNewMedals(medals);
        this.ui.update(true);
      }
      return result;
    };

    const originalSimulate = this.game.simulate.bind(this.game);
    this.game.simulate = dt => {
      originalSimulate(dt);
      this.updatePerformance(dt);
    };

    const originalRender = this.game.render.bind(this.game);
    this.game.render = dt => {
      originalRender(dt);
      this.ui.update();
    };
  }

  recordCompletedCall() {
    const call = this.game.activeCall;
    if (!call || this.recordedCallId === call.id) return null;
    this.recordedCallId = call.id;
    const operation = this.phase3.operation;
    const responseSeconds = Math.max(0, ((this.phase2.callMetrics.arrivedAt || performance.now()) - (this.phase2.callMetrics.dispatchedAt || performance.now())) / 1000);
    const completionRatio = operation?.completionRatio?.() ?? 1;
    const support = this.phase2.entities.active('supportVehicle').filter(unit => unit.state === 'arrived').length;
    const equipmentLeft = this.phase2.equipment.leftBehindCount();
    const difficulty = this.difficulty();
    const breakdown = debriefBreakdown({
      tacticalScore:Math.max(150, Math.round(this.game.score * .38)),
      responseSeconds,
      collisions:this.phase2.callMetrics.collisions,
      escalations:this.phase3.escalations,
      completionRatio,
      waterSupply:Boolean(this.phase2.hydrants.connected),
      support,
      equipmentLeft,
      difficulty:difficulty.payout,
      variant:this.variant?.payout || 1
    });
    const tacticalRank = document.getElementById('result-rank')?.textContent || gradeForScore(breakdown.total);
    const record = {
      id:`${call.id}-${Date.now()}`,
      callId:call.id,
      title:call.title,
      type:call.type,
      district:call.district,
      station:this.phase4.selectedStation().id,
      apparatus:this.phase4.selectedProfile().id,
      variant:this.variant?.label || 'Standard conditions',
      difficulty:difficulty.label,
      rank:tacticalRank,
      score:breakdown.total,
      responseSeconds,
      collisions:this.phase2.callMetrics.collisions,
      escalations:this.phase3.escalations,
      completedAt:Date.now(),
      breakdown
    };
    const result = this.save.record(record);
    const extraMedals = this.save.refreshMedals(this.phase3.progression.data.level);
    const medals = [...result.unlocked, ...extraMedals].filter((medal, index, list) => list.findIndex(item => item.id === medal.id) === index);
    const score = document.getElementById('result-score');
    if (score) score.textContent = String(Math.round(record.score)).padStart(4, '0');
    const copy = document.getElementById('result-copy');
    if (copy) copy.textContent += ` · ${this.variant?.label || 'Standard conditions'} · complete-release score ${Math.round(record.score)}.`;
    this.ui.renderDebrief(record);
    this.ui.update(true);
    this.showNewMedals(medals);
    return record;
  }

  showNewMedals(medals = []) {
    if (!medals.length) return;
    this.ui.showMedal(medals[0]);
    this.say('medal');
  }

  updatePerformance(dt) {
    this.performanceElapsed += Math.max(0, Number(dt) || 0);
    this.performanceFrames += 1;
    if (this.performanceElapsed < 2) return;
    this.performanceFps = this.performanceFrames / this.performanceElapsed;
    this.performanceElapsed = 0;
    this.performanceFrames = 0;
    const mode = this.save.data.performance.mode;
    const next = mode === 'auto' ? performanceTier(this.performanceFps, this.performanceTier) : mode;
    if (next !== this.performanceTier) {
      const previous = this.performanceTier;
      this.performanceTier = next;
      this.save.data.performance.lastTier = next;
      this.save.persist();
      this.applyPerformanceDetail();
      if (next === 'low' && previous !== 'low') this.say('lowPerformance');
      this.ui.update(true);
    }
    this.game.traffic.setPerformance(this.performanceFps);
  }

  applyPerformanceDetail(force = false) {
    const mode = this.save.data.performance.mode;
    const tier = mode === 'auto' ? this.performanceTier : mode;
    const scale = adaptiveScale(tier);
    const trafficFactor = this.difficulty().traffic;
    this.game.traffic.maxVehicles = Math.max(4, Math.round(this.baseTrafficCount * scale * trafficFactor));
    this.phase2.entities.budgets.pedestrian = Math.max(4, Math.round(this.basePedestrianBudget * scale));
    document.body.dataset.performance = tier;
    if (force) this.ui?.update?.(true);
  }

  setDifficulty(id) {
    if (!this.canChangeDifficulty()) { this.game.ui.toast('DIFFICULTY CAN BE CHANGED ONLY BETWEEN CALLS'); return; }
    if (!this.save.setDifficulty(id)) return;
    this.applyPerformanceDetail();
    this.game.ui.toast(`DIFFICULTY · ${this.difficulty().label.toUpperCase()}`);
    this.ui.update(true);
  }

  setAccessibility(key, value) {
    if (!this.save.setAccessibility(key, value)) return;
    this.applyAccessibility();
    this.ui.update(true);
  }

  applyAccessibility() {
    const settings = this.save.data.accessibility;
    document.body.classList.toggle('phase5-high-contrast', settings.highContrast);
    document.body.classList.toggle('phase5-large-text', settings.largeText);
    document.body.classList.toggle('phase5-simple-hud', settings.simplifiedHud);
  }

  setPerformanceMode(mode) {
    if (!this.save.setPerformance(mode)) return;
    if (mode !== 'auto') this.performanceTier = mode;
    this.applyPerformanceDetail();
    this.game.ui.toast(`CITY DETAIL · ${mode.toUpperCase()}`);
    this.ui.update(true);
  }

  nextTutorial() {
    const next = this.save.data.tutorialStep + 1;
    if (next >= TUTORIAL_STEPS.length) {
      this.save.tutorialFinish();
      this.ui.hideTutorial();
      this.game.ui.toast('FIRST-SHIFT ORIENTATION COMPLETE');
      return;
    }
    this.save.tutorialNext();
    this.ui.showTutorial(this.save.data.tutorialStep);
  }

  dismissTutorial() {
    this.save.tutorialDismiss();
    this.ui.hideTutorial();
    this.game.ui.toast('TUTORIAL DISMISSED · REPLAY IT FROM OPERATIONS CENTRE');
  }

  restartTutorial() {
    this.save.tutorialRestart();
    this.ui.show(false);
    this.ui.showTutorial(0);
  }

  bundle() {
    return this.save.exportBundle({
      phase4:this.phase4.save.data,
      phase3:this.phase3.progression.data,
      phase2:this.phase2.save.data
    });
  }

  exportSave() {
    const blob = new Blob([this.bundle()], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `peterborough-fire-response-save-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.game.ui.toast('CAREER BACKUP DOWNLOADED');
  }

  async copySave() {
    const text = this.bundle();
    try {
      await navigator.clipboard.writeText(text);
      this.game.ui.toast('CAREER BACKUP COPIED');
    } catch {
      const field = document.getElementById('phase5-save-text');
      if (field) { field.value = text; field.select(); }
      this.game.ui.toast('BACKUP PLACED IN THE TEXT BOX');
    }
  }

  importSave(text) {
    const result = this.save.importBundle(text);
    if (!result.ok) { this.game.ui.toast(result.message.toUpperCase(), 3200); return; }
    try {
      const bundle = JSON.parse(text);
      if (bundle.phase4) {
        this.phase4.save.data = migratePhase4Save(bundle.phase4);
        this.phase4.save.persist();
      }
      if (bundle.phase3 && typeof bundle.phase3 === 'object') {
        this.phase3.progression.data = { ...this.phase3.progression.data, ...bundle.phase3 };
        this.phase3.progression.persist();
      }
      if (bundle.phase2 && typeof bundle.phase2 === 'object') {
        this.phase2.save.data = { ...this.phase2.save.data, ...bundle.phase2 };
        this.phase2.save.persist();
      }
    } catch {}
    this.applyAccessibility();
    this.phase4.applyDeployment(true);
    this.ui.update(true);
    this.game.ui.toast('CAREER IMPORTED SUCCESSFULLY');
  }

  resetCareer() {
    for (const key of ['pfr-phase5-final-release','pfr-phase4-city-career','pfr-phase3-progression','pfr-street-shift-save']) {
      try { localStorage.removeItem(key); } catch {}
    }
    this.game.ui.toast('CAREER RESET · RELOADING');
    setTimeout(() => location.reload(), 450);
  }

  say(category) {
    if (this.game.ui.settings.radioHumour === false) return;
    const lines = FINAL_RADIO[category] || [];
    if (!lines.length) return;
    const line = lines[(this.seed + this.radioCursor) % lines.length];
    this.radioCursor += 1;
    this.phase3.ui.radio(line);
  }
}
