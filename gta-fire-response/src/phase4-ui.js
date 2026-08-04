import { APPARATUS_PROFILES, CITY_DISTRICTS, CITY_STATIONS, SHIFT_MODIFIERS } from './phase4-data.js';
import { coverageGrade, readinessScore, serviceQuote } from './phase4-math.js';

export class Phase4UI {
  constructor(controller) {
    this.controller = controller;
    this.panel = null;
    this.open = false;
    this.lastSignature = '';
  }

  install() {
    const button = document.createElement('button');
    button.id = 'phase4-open';
    button.className = 'phase4-open';
    button.type = 'button';
    button.innerHTML = '<span>HQ</span><small>Citywide</small>';
    button.setAttribute('aria-label', 'Open citywide deployment board');
    document.body.appendChild(button);

    const panel = document.createElement('section');
    panel.id = 'phase4-panel';
    panel.className = 'phase4-panel';
    panel.setAttribute('aria-label', 'Citywide career and deployment board');
    panel.innerHTML = `
      <header class="phase4-header">
        <div><small>Phase 4 · citywide career</small><h2>Deployment Board</h2></div>
        <button data-phase4="close" aria-label="Close deployment board">×</button>
      </header>
      <div class="phase4-summary">
        <span>Shift<strong id="phase4-shift">1</strong></span>
        <span>Credits<strong id="phase4-credits">400</strong></span>
        <span>Unit<strong id="phase4-unit">Engine 1</strong></span>
        <span>Ready<strong id="phase4-ready">100%</strong></span>
      </div>
      <div class="phase4-tabs">
        <button class="active" data-phase4-tab="deployment">Deployment</button>
        <button data-phase4-tab="apparatus">Apparatus</button>
        <button data-phase4-tab="city">City</button>
        <button data-phase4-tab="challenges">Challenges</button>
      </div>
      <div class="phase4-pane active" data-phase4-pane="deployment">
        <h3>Choose station</h3><div id="phase4-stations" class="phase4-card-grid"></div>
        <h3>Choose apparatus</h3><div id="phase4-apparatus" class="phase4-card-grid apparatus"></div>
        <div class="phase4-ready-actions">
          <button data-phase4="ready">Mark unit ready</button>
          <button data-phase4="second-alarm">Request second alarm</button>
        </div>
        <p id="phase4-deployment-note" class="phase4-note"></p>
      </div>
      <div class="phase4-pane" data-phase4-pane="apparatus">
        <div id="phase4-service"></div>
      </div>
      <div class="phase4-pane" data-phase4-pane="city">
        <div id="phase4-modifier"></div>
        <h3>District coverage and reputation</h3><div id="phase4-districts" class="phase4-districts"></div>
      </div>
      <div class="phase4-pane" data-phase4-pane="challenges">
        <div id="phase4-challenges" class="phase4-challenges"></div>
        <button class="phase4-end-shift" data-phase4="end-shift">End shift and claim rewards</button>
      </div>`;
    document.body.appendChild(panel);
    this.panel = panel;

    const hud = document.createElement('div');
    hud.id = 'phase4-hud';
    hud.className = 'phase4-hud';
    hud.innerHTML = '<span id="phase4-hud-unit">ENGINE 1</span><span id="phase4-hud-fuel">FUEL 100%</span><span id="phase4-hud-water">WATER 750 L</span><span id="phase4-hud-credits">¢400</span>';
    document.body.appendChild(hud);

    button.addEventListener('click', () => this.show(true));
    panel.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (!target) return;
      if (target.dataset.phase4 === 'close') this.show(false);
      if (target.dataset.phase4Tab) this.selectTab(target.dataset.phase4Tab);
      if (target.dataset.station) this.controller.selectStation(target.dataset.station);
      if (target.dataset.apparatus) this.controller.selectApparatus(target.dataset.apparatus);
      if (target.dataset.service) this.controller.serviceSelected(target.dataset.service);
      if (target.dataset.modifier) this.controller.selectModifier(target.dataset.modifier);
      if (target.dataset.phase4 === 'ready') this.controller.markReady();
      if (target.dataset.phase4 === 'second-alarm') this.controller.requestSecondAlarm(false);
      if (target.dataset.phase4 === 'end-shift') this.controller.endShift();
    });
    this.update(true);
  }

  show(show) {
    this.open = Boolean(show);
    this.panel?.classList.toggle('show', this.open);
    document.getElementById('phase4-open')?.classList.toggle('active', this.open);
    if (this.open) this.update(true);
  }

  selectTab(name) {
    this.panel?.querySelectorAll('[data-phase4-tab]').forEach(button => button.classList.toggle('active', button.dataset.phase4Tab === name));
    this.panel?.querySelectorAll('[data-phase4-pane]').forEach(pane => pane.classList.toggle('active', pane.dataset.phase4Pane === name));
  }

  signature() {
    const c = this.controller;
    const data = c.save.data;
    const apparatus = c.selectedApparatusState();
    const condition = apparatus.condition || {};
    return JSON.stringify([
      data.shiftNumber,data.credits,data.selectedStation,data.selectedApparatus,data.modifierId,data.callsThisShift,
      apparatus.fuel,apparatus.water,condition.body,condition.steering,condition.engine,condition.lights,condition.pump,
      data.districtReputation,data.metrics,data.challenges,c.secondAlarmRequested,c.waitingForReady,
      c.game.state.current,c.phase3?.risk,c.progressionLevel()
    ]);
  }

  update(force = false) {
    const signature = this.signature();
    if (!force && signature === this.lastSignature) return;
    this.lastSignature = signature;
    const c = this.controller;
    const data = c.save.data;
    const profile = c.selectedProfile();
    const apparatus = c.selectedApparatusState();
    const readiness = readinessScore(apparatus);
    const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    set('phase4-shift', data.shiftNumber);
    set('phase4-credits', data.credits);
    set('phase4-unit', profile.label);
    set('phase4-ready', `${Math.round(readiness)}%`);
    set('phase4-hud-unit', profile.callSign);
    set('phase4-hud-fuel', `FUEL ${Math.round(apparatus.fuel / profile.fuelCapacity * 100)}%`);
    set('phase4-hud-water', `WATER ${Math.round(apparatus.water)} L`);
    set('phase4-hud-credits', `¢${Math.round(data.credits)}`);
    document.getElementById('phase4-hud')?.classList.toggle('show', c.game.state.current !== 'START_SCREEN');
    document.getElementById('phase4-open')?.classList.toggle('show', c.game.state.current !== 'CALL_COMPLETE');
    this.renderStations();
    this.renderApparatus();
    this.renderService();
    this.renderCity();
    this.renderChallenges();
    const note = document.getElementById('phase4-deployment-note');
    if (note) note.textContent = c.canChangeDeployment()
      ? `${profile.callSign} is assigned to ${c.selectedStation().name}. Readiness ${Math.round(readiness)}%.`
      : 'Deployment changes are locked while assigned to an active incident.';
    const second = this.panel?.querySelector('[data-phase4="second-alarm"]');
    if (second) {
      second.disabled = !c.canRequestSecondAlarm();
      second.textContent = c.secondAlarmRequested ? 'Second alarm responding' : 'Request second alarm';
    }
  }

  renderStations() {
    const c = this.controller;
    const root = document.getElementById('phase4-stations');
    if (!root) return;
    root.innerHTML = CITY_STATIONS.map(station => {
      const selected = c.save.data.selectedStation === station.id;
      const grade = c.coverageForStation(station.id);
      return `<button data-station="${station.id}" class="${selected ? 'selected' : ''}" ${c.canChangeDeployment() ? '' : 'disabled'}>
        <strong>${station.name}</strong><small>${station.address}</small><em>${coverageGrade(grade)} coverage</em>
      </button>`;
    }).join('');
  }

  renderApparatus() {
    const c = this.controller;
    const root = document.getElementById('phase4-apparatus');
    if (!root) return;
    const level = c.progressionLevel();
    root.innerHTML = APPARATUS_PROFILES.map(profile => {
      const state = c.save.data.apparatus[profile.id];
      const selected = c.save.data.selectedApparatus === profile.id;
      const locked = level < profile.unlockLevel;
      return `<button data-apparatus="${profile.id}" class="${selected ? 'selected' : ''}" ${locked || !c.canChangeDeployment() ? 'disabled' : ''}>
        <strong>${profile.label}</strong><small>${profile.role}</small><em>${locked ? `Unlocks at level ${profile.unlockLevel}` : `${Math.round(readinessScore(state))}% ready · ${profile.tank} L`}</em>
      </button>`;
    }).join('');
  }

  renderService() {
    const c = this.controller;
    const root = document.getElementById('phase4-service');
    if (!root) return;
    const profile = c.selectedProfile();
    const state = c.selectedApparatusState();
    const quote = serviceQuote(state, profile);
    const condition = state.condition;
    const systems = Object.entries(condition).map(([key,value]) => `<span>${key}<strong>${Math.round(value)}%</strong></span>`).join('');
    root.innerHTML = `
      <div class="phase4-service-hero"><small>Selected unit</small><strong>${profile.label}</strong><span>${profile.role}</span></div>
      <div class="phase4-system-grid">${systems}<span>fuel<strong>${Math.round(state.fuel/profile.fuelCapacity*100)}%</strong></span><span>water<strong>${Math.round(state.water)} L</strong></span></div>
      <div class="phase4-service-actions">
        <button data-service="repair" ${c.canService() ? '' : 'disabled'}>Repair · ¢${quote.repair}</button>
        <button data-service="refuel" ${c.canService() ? '' : 'disabled'}>Refuel · ¢${quote.refuel}</button>
        <button data-service="refill" ${c.canService() ? '' : 'disabled'}>Refill tank · ¢${quote.refill}</button>
        <button data-service="full" ${c.canService() ? '' : 'disabled'}>Full service · ¢${quote.full}</button>
      </div>
      <p class="phase4-note">Service is available only while the unit is at a station and not committed to a call.</p>`;
  }

  renderCity() {
    const c = this.controller;
    const data = c.save.data;
    const modifierRoot = document.getElementById('phase4-modifier');
    if (modifierRoot) modifierRoot.innerHTML = `<h3>Shift conditions</h3><div class="phase4-modifiers">${SHIFT_MODIFIERS.map(modifier => `<button data-modifier="${modifier.id}" class="${data.modifierId === modifier.id ? 'selected' : ''}" ${c.canChangeDeployment() ? '' : 'disabled'}><strong>${modifier.label}</strong><small>${modifier.description}</small></button>`).join('')}</div>`;
    const root = document.getElementById('phase4-districts');
    if (!root) return;
    root.innerHTML = CITY_DISTRICTS.map(district => {
      const reputation = data.districtReputation[district.id] ?? 50;
      const coverage = c.coverageForDistrict(district.id);
      return `<div style="--district-color:${district.color}"><strong>${district.label}</strong><span>Reputation ${Math.round(reputation)}</span><span>Coverage ${coverageGrade(coverage)}</span><i style="--value:${reputation}%"></i></div>`;
    }).join('');
  }

  renderChallenges() {
    const c = this.controller;
    const root = document.getElementById('phase4-challenges');
    if (!root) return;
    root.innerHTML = c.save.challengeStatus().map(challenge => `<div class="${challenge.complete ? 'complete' : ''}"><span>${challenge.complete ? '✓' : Math.round(challenge.ratio * 100) + '%'}</span><div><strong>${challenge.label}</strong><small>${challenge.description}</small><em>${challenge.value}/${challenge.target} · ¢${challenge.reward}${challenge.claimed ? ' claimed' : ''}</em></div><i style="--value:${challenge.ratio*100}%"></i></div>`).join('');
    const end = this.panel?.querySelector('[data-phase4="end-shift"]');
    if (end) end.disabled = !c.canEndShift();
  }
}
