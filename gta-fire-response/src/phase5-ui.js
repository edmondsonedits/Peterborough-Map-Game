import { DIFFICULTY_PRESETS, MEDALS, TUTORIAL_STEPS } from './phase5-data.js';
import { serviceRecordSummary } from './phase5-math.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);

export class Phase5UI {
  constructor(controller) {
    this.controller = controller;
    this.panel = null;
    this.open = false;
    this.tab = 'briefing';
    this.resetArmed = false;
    this.lastSignature = '';
  }

  install() {
    const button = document.createElement('button');
    button.id = 'phase5-open';
    button.className = 'phase5-open show';
    button.type = 'button';
    button.innerHTML = '<span>OPS</span><small>Centre</small>';
    button.setAttribute('aria-label', 'Open operations centre');
    document.body.appendChild(button);

    const panel = document.createElement('section');
    panel.id = 'phase5-panel';
    panel.className = 'phase5-panel';
    panel.setAttribute('aria-label', 'Phase 5 operations centre');
    panel.innerHTML = `
      <header class="phase5-header">
        <div><small>Complete release · v1.0</small><h2>Operations Centre</h2></div>
        <button data-phase5="close" aria-label="Close operations centre">×</button>
      </header>
      <div class="phase5-tabs">
        <button class="active" data-phase5-tab="briefing">Briefing</button>
        <button data-phase5-tab="career">Career</button>
        <button data-phase5-tab="medals">Medals</button>
        <button data-phase5-tab="records">Records</button>
        <button data-phase5-tab="options">Options</button>
      </div>
      <div class="phase5-pane active" data-phase5-pane="briefing"><div id="phase5-briefing"></div></div>
      <div class="phase5-pane" data-phase5-pane="career"><div id="phase5-career"></div></div>
      <div class="phase5-pane" data-phase5-pane="medals"><div id="phase5-medals"></div></div>
      <div class="phase5-pane" data-phase5-pane="records"><div id="phase5-records"></div></div>
      <div class="phase5-pane" data-phase5-pane="options"><div id="phase5-options"></div></div>`;
    document.body.appendChild(panel);
    this.panel = panel;

    const briefing = document.createElement('aside');
    briefing.id = 'phase5-call-briefing';
    briefing.className = 'phase5-call-briefing';
    briefing.innerHTML = '<small>Dispatch update</small><strong id="phase5-briefing-title">Incident conditions</strong><p id="phase5-briefing-copy"></p><button data-phase5="dismiss-briefing">Acknowledge</button>';
    document.body.appendChild(briefing);

    const tutorial = document.createElement('section');
    tutorial.id = 'phase5-tutorial';
    tutorial.className = 'phase5-tutorial';
    tutorial.innerHTML = '<div class="phase5-tutorial-card"><small id="phase5-tutorial-count">1/6</small><h2 id="phase5-tutorial-title"></h2><p id="phase5-tutorial-copy"></p><div><button data-phase5="skip-tutorial">Skip</button><button data-phase5="next-tutorial">Next</button></div></div>';
    document.body.appendChild(tutorial);

    const medal = document.createElement('div');
    medal.id = 'phase5-medal-toast';
    medal.className = 'phase5-medal-toast';
    medal.innerHTML = '<span>★</span><div><small>Career medal</small><strong id="phase5-medal-title"></strong><p id="phase5-medal-copy"></p></div>';
    document.body.appendChild(medal);

    const resultCard = document.querySelector('.result-card');
    if (resultCard && !document.getElementById('phase5-debrief')) {
      const debrief = document.createElement('div');
      debrief.id = 'phase5-debrief';
      debrief.className = 'phase5-debrief';
      debrief.innerHTML = '<h3>After-action breakdown</h3><div id="phase5-debrief-grid"></div><p id="phase5-debrief-note"></p>';
      resultCard.insertBefore(debrief, document.getElementById('result-return'));
    }

    button.addEventListener('click', () => this.show(true));
    panel.addEventListener('click', event => this.handleClick(event));
    panel.addEventListener('change', event => this.handleChange(event));
    briefing.addEventListener('click', event => {
      if (event.target.closest('[data-phase5="dismiss-briefing"]')) briefing.classList.remove('show');
    });
    tutorial.addEventListener('click', event => {
      if (event.target.closest('[data-phase5="skip-tutorial"]')) this.controller.dismissTutorial();
      if (event.target.closest('[data-phase5="next-tutorial"]')) this.controller.nextTutorial();
    });
    this.update(true);
  }

  handleClick(event) {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.phase5 === 'close') this.show(false);
    if (target.dataset.phase5Tab) this.selectTab(target.dataset.phase5Tab);
    if (target.dataset.difficulty) this.controller.setDifficulty(target.dataset.difficulty);
    if (target.dataset.phase5 === 'tutorial') this.controller.restartTutorial();
    if (target.dataset.phase5 === 'export') this.controller.exportSave();
    if (target.dataset.phase5 === 'import') this.controller.importSave(document.getElementById('phase5-save-text')?.value || '');
    if (target.dataset.phase5 === 'copy') this.controller.copySave();
    if (target.dataset.phase5 === 'reset') {
      if (!this.resetArmed) {
        this.resetArmed = true;
        target.textContent = 'Press again to erase career';
        setTimeout(() => { this.resetArmed = false; this.update(true); }, 5000);
      } else {
        this.resetArmed = false;
        this.controller.resetCareer();
      }
    }
  }

  handleChange(event) {
    const target = event.target;
    if (target.dataset.accessibility) this.controller.setAccessibility(target.dataset.accessibility, target.checked);
    if (target.dataset.performance) this.controller.setPerformanceMode(target.value);
  }

  show(show) {
    this.open = Boolean(show);
    this.panel?.classList.toggle('show', this.open);
    document.getElementById('phase5-open')?.classList.toggle('active', this.open);
    if (this.open) this.update(true);
  }

  selectTab(name) {
    this.tab = name;
    this.panel?.querySelectorAll('[data-phase5-tab]').forEach(button => button.classList.toggle('active', button.dataset.phase5Tab === name));
    this.panel?.querySelectorAll('[data-phase5-pane]').forEach(pane => pane.classList.toggle('active', pane.dataset.phase5Pane === name));
  }

  signature() {
    const c = this.controller;
    const data = c.save.data;
    return JSON.stringify([
      c.game.state.current,c.game.activeCall?.id,c.variant?.id,c.performanceTier,data.difficulty,data.tutorialComplete,
      data.completedCalls,data.completedShifts,data.medals,data.records.length,data.accessibility,data.performance,
      c.phase3.progression.data.xp,c.phase3.progression.data.level,c.phase4.save.data.credits,c.phase4.save.data.shiftNumber
    ]);
  }

  update(force = false) {
    const signature = this.signature();
    if (!force && signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.renderBriefing();
    this.renderCareer();
    this.renderMedals();
    this.renderRecords();
    this.renderOptions();
    document.getElementById('phase5-open')?.classList.toggle('show', this.controller.game.state.current !== 'CALL_COMPLETE');
  }

  renderBriefing() {
    const root = document.getElementById('phase5-briefing');
    if (!root) return;
    const c = this.controller;
    const call = c.game.activeCall;
    const difficulty = c.difficulty();
    if (!call) {
      root.innerHTML = `
        <div class="phase5-hero"><small>Complete release</small><strong>Ready for a full street shift</strong><p>${escapeHtml(difficulty.description)}</p></div>
        <div class="phase5-brief-grid">
          <div><small>Incident roster</small><strong>${c.allCalls().length}</strong><span>locations and call types</span></div>
          <div><small>Difficulty</small><strong>${escapeHtml(difficulty.label)}</strong><span>${Math.round(difficulty.payout * 100)}% career payout</span></div>
          <div><small>Performance</small><strong>${escapeHtml(c.performanceTier)}</strong><span>${c.performanceFps ? Math.round(c.performanceFps) + ' FPS' : 'adaptive protection ready'}</span></div>
          <div><small>Career medals</small><strong>${c.save.data.medals.length}/${MEDALS.length}</strong><span>earned service awards</span></div>
        </div>
        <p class="phase5-note">Use HQ for station, apparatus, service and shift challenges. Use Operations Centre for difficulty, records, medals, onboarding and save management.</p>`;
      return;
    }
    const variant = c.variant;
    const recommended = (call.recommendedSupport || []).length ? call.recommendedSupport.join(' + ') : 'single-company response';
    root.innerHTML = `
      <div class="phase5-hero incident"><small>${escapeHtml(call.label)}</small><strong>${escapeHtml(call.title)}</strong><p>${escapeHtml(call.address)}</p></div>
      <div class="phase5-condition"><span>${escapeHtml(variant?.label || 'Standard conditions')}</span><p>${escapeHtml(variant?.brief || call.notes)}</p></div>
      <div class="phase5-brief-grid">
        <div><small>District</small><strong>${escapeHtml(call.district)}</strong><span>city coverage assignment</span></div>
        <div><small>Support</small><strong>${escapeHtml(recommended)}</strong><span>recommended response</span></div>
        <div><small>Risk modifier</small><strong>${variant?.risk > 0 ? '+' : ''}${variant?.risk || 0}</strong><span>incident pressure</span></div>
        <div><small>Difficulty</small><strong>${escapeHtml(difficulty.label)}</strong><span>${difficulty.hints ? 'guided hints' : 'minimal hints'}</span></div>
      </div>
      <p class="phase5-note">${escapeHtml(call.task)}</p>`;
  }

  renderCareer() {
    const root = document.getElementById('phase5-career');
    if (!root) return;
    const c = this.controller;
    const progression = c.phase3.progression.data;
    const city = c.phase4.save.data;
    const summary = serviceRecordSummary(c.save.data.records);
    root.innerHTML = `
      <div class="phase5-career-hero"><small>Current rank</small><strong>${escapeHtml(progression.rank)}</strong><span>Level ${progression.level} · ${progression.xp} XP</span><i style="--value:${Math.min(100, progression.level / 6 * 100)}%"></i></div>
      <div class="phase5-stat-grid">
        <div><small>Incidents</small><strong>${summary.completed}</strong></div>
        <div><small>Average score</small><strong>${summary.averageScore}</strong></div>
        <div><small>Clean calls</small><strong>${summary.cleanRate}%</strong></div>
        <div><small>S ranks</small><strong>${summary.sRanks}</strong></div>
        <div><small>Shifts</small><strong>${c.save.data.completedShifts}</strong></div>
        <div><small>Credits</small><strong>¢${Math.round(city.credits)}</strong></div>
      </div>
      <h3>Functional career perks</h3>
      <div class="phase5-perks">
        ${[
          ['thermal-camera','Thermal Camera','Faster search, overhaul, metering and investigation tasks.'],
          ['rescue-saw','Rescue Tools','Faster vehicle stabilization, access and debris control.'],
          ['foam-kit','Foam Kit','Improved vehicle-fire attack effectiveness.'],
          ['acting-officer','Acting Officer','Additional command scoring and difficult call variants.'],
          ['legend-radio','Shift Legend','Expanded veteran radio chatter and final commendation.']
        ].map(([id,label,description]) => `<div class="${progression.unlocks.includes(id) ? 'unlocked' : ''}"><span>${progression.unlocks.includes(id) ? '✓' : '○'}</span><div><strong>${label}</strong><small>${description}</small></div></div>`).join('')}
      </div>`;
  }

  renderMedals() {
    const root = document.getElementById('phase5-medals');
    if (!root) return;
    root.innerHTML = this.controller.save.medalStatus(this.controller.phase3.progression.data.level).map(medal => `
      <div class="phase5-medal ${medal.unlocked ? 'unlocked' : ''}">
        <span>${medal.unlocked ? '★' : '☆'}</span><div><strong>${escapeHtml(medal.label)}</strong><small>${escapeHtml(medal.description)}</small><em>${medal.value}/${medal.target}</em></div><i style="--value:${medal.ratio*100}%"></i>
      </div>`).join('');
  }

  renderRecords() {
    const root = document.getElementById('phase5-records');
    if (!root) return;
    const records = this.controller.save.data.records;
    if (!records.length) {
      root.innerHTML = '<div class="phase5-empty"><strong>No completed incidents yet</strong><p>Your after-action records will appear here after the first call.</p></div>';
      return;
    }
    root.innerHTML = records.slice(0, 30).map(record => `
      <article class="phase5-record">
        <span class="rank-${escapeHtml(record.rank)}">${escapeHtml(record.rank)}</span>
        <div><strong>${escapeHtml(record.title)}</strong><small>${escapeHtml(record.station)} · ${escapeHtml(record.apparatus)} · ${escapeHtml(record.difficulty)}</small><em>${Math.round(record.score)} points · ${Math.round(record.responseSeconds)} sec · ${record.collisions} collision${record.collisions === 1 ? '' : 's'}</em></div>
        <time>${new Date(record.completedAt).toLocaleDateString()}</time>
      </article>`).join('');
  }

  renderOptions() {
    const root = document.getElementById('phase5-options');
    if (!root) return;
    const c = this.controller;
    const data = c.save.data;
    root.innerHTML = `
      <h3>Difficulty</h3>
      <div class="phase5-difficulties">${DIFFICULTY_PRESETS.map(item => `<button data-difficulty="${item.id}" class="${data.difficulty === item.id ? 'selected' : ''}" ${c.canChangeDifficulty() ? '' : 'disabled'}><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)}</small><em>Risk ×${item.risk.toFixed(2)} · payout ×${item.payout.toFixed(2)}</em></button>`).join('')}</div>
      <h3>Accessibility</h3>
      <div class="phase5-toggle-list">
        ${[['highContrast','High-contrast interface'],['largeText','Larger interface text'],['simplifiedHud','Simplified gameplay HUD'],['showHints','Contextual objective hints']].map(([key,label]) => `<label><span>${label}</span><input type="checkbox" data-accessibility="${key}" ${data.accessibility[key] ? 'checked' : ''}></label>`).join('')}
      </div>
      <h3>Performance protection</h3>
      <label class="phase5-select"><span>City detail</span><select data-performance="mode"><option value="auto" ${data.performance.mode === 'auto' ? 'selected' : ''}>Automatic</option><option value="high" ${data.performance.mode === 'high' ? 'selected' : ''}>High</option><option value="medium" ${data.performance.mode === 'medium' ? 'selected' : ''}>Medium</option><option value="low" ${data.performance.mode === 'low' ? 'selected' : ''}>Low</option></select></label>
      <h3>Tutorial and save data</h3>
      <div class="phase5-option-actions"><button data-phase5="tutorial">Replay tutorial</button><button data-phase5="export">Download backup</button><button data-phase5="copy">Copy backup</button><button data-phase5="import">Import text below</button></div>
      <textarea id="phase5-save-text" placeholder="Paste a Peterborough Fire Response Phase 5 backup here"></textarea>
      <button class="phase5-reset" data-phase5="reset">Reset final-release career</button>`;
  }

  showCallBriefing(call, variant) {
    const element = document.getElementById('phase5-call-briefing');
    const title = document.getElementById('phase5-briefing-title');
    const copy = document.getElementById('phase5-briefing-copy');
    if (!element || !call) return;
    if (title) title.textContent = variant?.label || call.title;
    if (copy) copy.textContent = `${variant?.brief || call.notes} ${call.task}`;
    element.classList.add('show');
    clearTimeout(this.briefingTimer);
    this.briefingTimer = setTimeout(() => element.classList.remove('show'), 9000);
  }

  showTutorial(stepIndex) {
    const step = TUTORIAL_STEPS[stepIndex];
    const overlay = document.getElementById('phase5-tutorial');
    if (!overlay || !step) { overlay?.classList.remove('show'); return; }
    document.getElementById('phase5-tutorial-count').textContent = `${stepIndex + 1}/${TUTORIAL_STEPS.length}`;
    document.getElementById('phase5-tutorial-title').textContent = step.title;
    document.getElementById('phase5-tutorial-copy').textContent = step.text;
    const next = overlay.querySelector('[data-phase5="next-tutorial"]');
    if (next) next.textContent = stepIndex === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next';
    overlay.classList.add('show');
  }

  hideTutorial() { document.getElementById('phase5-tutorial')?.classList.remove('show'); }

  showMedal(medal) {
    const toast = document.getElementById('phase5-medal-toast');
    if (!toast || !medal) return;
    document.getElementById('phase5-medal-title').textContent = medal.label;
    document.getElementById('phase5-medal-copy').textContent = medal.description;
    toast.classList.add('show');
    clearTimeout(this.medalTimer);
    this.medalTimer = setTimeout(() => toast.classList.remove('show'), 4800);
  }

  renderDebrief(record) {
    const grid = document.getElementById('phase5-debrief-grid');
    const note = document.getElementById('phase5-debrief-note');
    const root = document.getElementById('phase5-debrief');
    if (!grid || !record) return;
    root?.classList.add('show');
    const labels = { response:'Response', tactics:'Tactics', safety:'Safety', completion:'Objectives', water:'Water supply', coordination:'Coordination', equipment:'Equipment' };
    grid.innerHTML = Object.entries(labels).map(([key,label]) => `<div><small>${label}</small><strong>${record.breakdown[key] >= 0 ? '+' : ''}${Math.round(record.breakdown[key] || 0)}</strong></div>`).join('') + `<div class="total"><small>Final score</small><strong>${Math.round(record.score)}</strong></div>`;
    if (note) note.textContent = `${record.variant} · ${record.difficulty} · best for this call ${Math.round(this.controller.save.data.bestByCall[record.callId] || record.score)}.`;
  }
}
