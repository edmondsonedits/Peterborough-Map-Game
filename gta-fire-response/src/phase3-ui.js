export class Phase3UI {
  constructor(controller) {
    this.controller = controller;
    this.panel = null;
    this.open = false;
    this.lastRadio = '';
  }

  install() {
    const openButton = document.createElement('button');
    openButton.id = 'phase3-open';
    openButton.className = 'phase3-open';
    openButton.type = 'button';
    openButton.setAttribute('aria-label', 'Open incident command panel');
    openButton.innerHTML = '<span>IC</span><small>Operations</small>';
    document.body.appendChild(openButton);

    const root = document.createElement('section');
    root.id = 'phase3-panel';
    root.className = 'phase3-panel';
    root.setAttribute('aria-label', 'Incident command and tactical objectives');
    root.innerHTML = `
      <header class="phase3-header">
        <div><small>Phase 3 · tactical operations</small><h2 id="phase3-title">No active operation</h2></div>
        <button data-phase3="close" aria-label="Close operations panel">×</button>
      </header>
      <div class="phase3-vitals">
        <span>Risk<strong id="phase3-risk">0%</strong></span>
        <span>Stamina<strong id="phase3-stamina">100%</strong></span>
        <span>Air<strong id="phase3-air">100%</strong></span>
        <span>Rank<strong id="phase3-rank">Recruit</strong></span>
      </div>
      <div class="phase3-tabs">
        <button class="active" data-phase3-tab="objectives">Objectives</button>
        <button data-phase3-tab="actions">Actions</button>
        <button data-phase3-tab="career">Career</button>
      </div>
      <div class="phase3-pane active" data-phase3-pane="objectives">
        <ol id="phase3-objectives" class="phase3-objectives"><li class="empty">Awaiting dispatch.</li></ol>
      </div>
      <div class="phase3-pane" data-phase3-pane="actions">
        <div id="phase3-actions" class="phase3-action-grid"></div>
        <div class="phase3-utility-grid">
          <button data-operation-action="toggle-mask">Toggle SCBA mask</button>
          <button data-operation-action="rehab">Quick rehab at Engine 1</button>
        </div>
        <p id="phase3-action-hint" class="phase3-action-hint">Select an available objective.</p>
      </div>
      <div class="phase3-pane" data-phase3-pane="career">
        <div id="phase3-career" class="phase3-career"></div>
      </div>`;
    document.body.appendChild(root);
    this.panel = root;

    const hud = document.createElement('div');
    hud.id = 'phase3-hud';
    hud.className = 'phase3-hud';
    hud.innerHTML = '<span id="phase3-hud-stage">AVAILABLE</span><span id="phase3-hud-risk">RISK 0%</span><span id="phase3-hud-vitals">STAMINA 100 · AIR 100</span>';
    document.body.appendChild(hud);

    const radio = document.createElement('div');
    radio.id = 'phase3-radio';
    radio.className = 'phase3-radio';
    radio.setAttribute('aria-live', 'polite');
    document.body.appendChild(radio);

    openButton.addEventListener('click', () => this.show(true));
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.phase3 === 'close') this.show(false);
      if (button.dataset.phase3Tab) this.selectTab(button.dataset.phase3Tab);
      if (button.dataset.operationAction) this.controller.performAction(button.dataset.operationAction);
    });
    const firstFieldset = document.querySelector('#settings-panel fieldset');
    if (firstFieldset && !document.getElementById('radio-humour-setting')) {
      const label = document.createElement('label');
      label.className = 'toggle';
      label.innerHTML = '<span>First-responder radio humour</span><input id="radio-humour-setting" type="checkbox">';
      const input = label.querySelector('input');
      input.checked = this.controller.game.ui.settings.radioHumour !== false;
      input.addEventListener('change', () => {
        this.controller.game.ui.settings.radioHumour = input.checked;
        this.controller.game.ui.saveSettings();
      });
      firstFieldset.appendChild(label);
    }
    this.updateCareer();
  }

  show(show) {
    this.open = Boolean(show);
    this.panel?.classList.toggle('show', this.open);
    document.getElementById('phase3-open')?.classList.toggle('active', this.open);
  }

  selectTab(name) {
    this.panel?.querySelectorAll('[data-phase3-tab]').forEach(button => button.classList.toggle('active', button.dataset.phase3Tab === name));
    this.panel?.querySelectorAll('[data-phase3-pane]').forEach(pane => pane.classList.toggle('active', pane.dataset.phase3Pane === name));
  }

  radio(text, duration = 4300) {
    if (!text || text === this.lastRadio) return;
    this.lastRadio = text;
    const element = document.getElementById('phase3-radio');
    if (!element) return;
    element.textContent = text;
    element.classList.add('show');
    clearTimeout(this.radioTimer);
    this.radioTimer = setTimeout(() => element.classList.remove('show'), duration);
  }

  update() {
    const c = this.controller;
    const operation = c.operation;
    const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    set('phase3-title', operation?.template.label || 'No active operation');
    set('phase3-risk', `${Math.round(c.risk)}%`);
    set('phase3-stamina', `${Math.round(c.stamina)}%`);
    set('phase3-air', c.maskOn ? `${Math.round(c.air)}% MASKED` : `${Math.round(c.air)}% READY`);
    set('phase3-rank', c.progression.data.rank);
    set('phase3-hud-stage', operation?.next()?.label || (operation?.essentialComplete() ? 'OBJECTIVES COMPLETE' : 'AVAILABLE'));
    set('phase3-hud-risk', `RISK ${Math.round(c.risk)}%`);
    set('phase3-hud-vitals', `STAMINA ${Math.round(c.stamina)} · AIR ${Math.round(c.air)}`);
    document.getElementById('phase3-hud')?.classList.toggle('show', Boolean(operation));
    document.getElementById('phase3-open')?.classList.toggle('show', Boolean(operation) && c.game.state.current !== 'START_SCREEN');
    this.renderObjectives();
    this.renderActions();
    this.updateCareer();
  }

  renderObjectives() {
    const list = document.getElementById('phase3-objectives');
    if (!list) return;
    if (!this.controller.operation) { list.innerHTML = '<li class="empty">Awaiting dispatch.</li>'; return; }
    list.innerHTML = this.controller.operation.objectives.map(item => `
      <li class="${item.status}" data-objective="${item.id}">
        <span class="phase3-check">${item.status === 'complete' ? '✓' : item.status === 'failed' ? '!' : item.index + 1}</span>
        <div><strong>${item.label}${item.essential === false ? ' · bonus' : ''}</strong><small>${item.status === 'active' ? `${Math.round(item.progress)}% · hold Interact near scene` : item.status.replace('-', ' ')}</small></div>
        ${item.status === 'active' ? `<i style="--progress:${item.progress}%"></i>` : ''}
      </li>`).join('');
  }

  renderActions() {
    const grid = document.getElementById('phase3-actions');
    if (!grid) return;
    const actions = this.controller.availableActions();
    grid.innerHTML = actions.length ? actions.map(action => `<button data-operation-action="${action.action}" ${action.disabled ? 'disabled' : ''}><strong>${action.label}</strong><small>${action.hint || (action.duration ? `Hold Interact · ${action.duration}s` : 'Immediate command')}</small></button>`).join('') : '<p>No tactical action is available yet. Complete the current objective first.</p>';
    const active = this.controller.activeTask ? this.controller.operation?.get(this.controller.activeTask) : null;
    const hint = document.getElementById('phase3-action-hint');
    if (hint) hint.textContent = active ? `${active.label}: move near the incident and hold Interact.` : 'Select an available tactical objective.';
  }

  updateCareer() {
    const element = document.getElementById('phase3-career');
    if (!element) return;
    const data = this.controller.progression.data;
    element.innerHTML = `
      <div class="phase3-career-rank"><small>Current rank</small><strong>${data.rank}</strong><span>Level ${data.level} · ${data.xp} XP · reputation ${data.reputation}</span></div>
      <div class="phase3-career-grid">
        <span>Operations<strong>${data.operations}</strong></span><span>S ranks<strong>${data.sRanks}</strong></span><span>Current streak<strong>${data.streak}</strong></span><span>Best streak<strong>${data.bestStreak}</strong></span>
      </div>
      <h3>Unlocked</h3><p>${data.unlocks.join(' · ') || 'Command board'}</p>
      <h3>Achievements</h3><p>${data.achievements.join(' · ') || 'Complete tactical operations to earn achievements.'}</p>`;
  }
}
