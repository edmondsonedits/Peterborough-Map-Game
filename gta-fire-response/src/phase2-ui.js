import { EQUIPMENT_CATALOG } from './config.js';

export class Phase2UI {
  constructor(controller) {
    this.controller = controller;
    this.panel = null;
  }
  install() {
    const panel = document.createElement('section');
    panel.id = 'phase2-panel';
    panel.className = 'phase2-panel';
    panel.innerHTML = `
      <div class="phase2-tabs">
        <button data-tab="equipment" class="active">Equipment</button><button data-tab="crew">Crew</button><button data-tab="support">Support</button><button data-tab="shift">Shift</button>
      </div>
      <div class="phase2-pane active" data-pane="equipment">
        <div class="phase2-equipment-grid">${Object.values(EQUIPMENT_CATALOG).map(item=>`<button data-equipment="${item.id}">${item.label}<small>${item.compartment}</small></button>`).join('')}</div>
        <div class="phase2-actions"><button data-phase2="deploy">Deploy carried tool</button><button data-phase2="hydrant">Connect hydrant</button></div>
        <div id="phase2-equipment-status"></div>
      </div>
      <div class="phase2-pane" data-pane="crew">
        <div class="phase2-command-grid">
          <button data-crew="follow">Follow me</button><button data-crew="pullHose">Pull attack line</button><button data-crew="waterSupply">Establish water supply</button><button data-crew="retrieveExtinguisher">Retrieve extinguisher</button><button data-crew="assistPatient">Assist patient</button><button data-crew="controlTraffic">Control traffic</button><button data-crew="returnApparatus">Return to apparatus</button>
        </div><div id="phase2-crew-status"></div>
      </div>
      <div class="phase2-pane" data-pane="support">
        <div class="phase2-actions"><button data-support="police">Request police</button><button data-support="ambulance">Request ambulance</button></div>
        <div id="phase2-support-status"></div>
      </div>
      <div class="phase2-pane" data-pane="shift"><div id="phase2-shift-status"></div></div>`;
    document.body.appendChild(panel);
    this.panel = panel;

    const strip = document.createElement('div');
    strip.id = 'mobile-status-strip';
    strip.className = 'mobile-status-strip';
    strip.innerHTML = '<span id="mobile-speed">ON FOOT</span><span id="mobile-score">0000</span><span id="mobile-siren">SIREN OFF</span><span id="mobile-tool">NO TOOL</span><span id="mobile-condition">BODY 100%</span>';
    document.body.appendChild(strip);

    panel.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.tab) {
        panel.querySelectorAll('[data-tab]').forEach(item=>item.classList.toggle('active',item===button));
        panel.querySelectorAll('[data-pane]').forEach(item=>item.classList.toggle('active',item.dataset.pane===button.dataset.tab));
      }
      if (button.dataset.equipment) this.controller.takeEquipment(button.dataset.equipment);
      if (button.dataset.crew) this.controller.commandCrew(button.dataset.crew);
      if (button.dataset.support) this.controller.requestSupport(button.dataset.support);
      if (button.dataset.phase2 === 'deploy') this.controller.deployEquipment();
      if (button.dataset.phase2 === 'hydrant') this.controller.connectHydrant();
    });
    this.updateEquipment();
    this.updateShift();
  }
  show(show) { this.panel?.classList.toggle('show', show); }
  update() {
    const c = this.controller;
    const game = c.game;
    const set = (id,text)=>{ const el=document.getElementById(id); if(el) el.textContent=text; };
    set('mobile-speed', game.mode === 'truck' ? `${Math.round(Math.abs(game.truck.speed)*3.6)} KM/H` : 'ON FOOT');
    set('mobile-score', String(Math.max(0,Math.round(game.score))).padStart(4,'0'));
    set('mobile-siren', game.equipment.siren ? `SIREN ${game.audio.sirenMode.toUpperCase()}` : 'SIREN OFF');
    const carried = c.equipment.primary || c.equipment.small || game.incident.tool;
    set('mobile-tool', carried && carried !== 'none' ? String(EQUIPMENT_CATALOG[carried]?.label || carried).toUpperCase() : 'NO TOOL');
    set('mobile-condition', `BODY ${Math.round(c.condition.body)}%`);
    set('phase2-support-status', `${c.entities.active('supportVehicle').map(v=>`${v.kind}: ${v.state}`).join(' · ') || 'No support units assigned'}${c.support.trafficControl?' · Traffic control active':''}`);
    set('phase2-crew-status', c.crew.status().map(member=>`${member.name}: ${member.task==='idle'?member.state:member.task}`).join(' · ') || 'Crew aboard Engine 1');
    this.updateEquipment();
    if (game.options.debug) {
      const debug = game.ui.elements['debug-overlay'];
      debug.textContent += `\nphase2 ${JSON.stringify(c.entities.summary())}\ncondition body ${c.condition.body.toFixed(0)} steering ${c.condition.steering.toFixed(0)} engine ${c.condition.engine.toFixed(0)} pump ${c.condition.pump.toFixed(0)}\nwater ${Math.round(c.hydrants.engineTank)}L supply ${c.hydrants.connected?.label || 'tank'} time ${c.currentTimeVisual}`;
    }
  }
  updateEquipment() {
    const c = this.controller;
    const element = document.getElementById('phase2-equipment-status');
    if (!element) return;
    const active = [...c.equipment.items.values()].filter(item=>item.state!=='stored');
    element.textContent = `Primary: ${c.equipment.primary ? EQUIPMENT_CATALOG[c.equipment.primary].label : 'empty'} · Small: ${c.equipment.small ? EQUIPMENT_CATALOG[c.equipment.small].label : 'empty'} · Tank: ${Math.round(c.hydrants.engineTank)} L${c.hydrants.connected ? ` · ${c.hydrants.connected.label} connected` : ''}${active.length ? ` · Active: ${active.map(item=>`${item.label} ${item.state}`).join(', ')}` : ''}`;
  }
  updateShift() {
    const element = document.getElementById('phase2-shift-status');
    if (!element) return;
    const shift = this.controller.save.data.shift;
    const average = values => values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length/1000) : 0;
    element.innerHTML = `<div class="shift-grid"><span>Calls<strong>${shift.callsCompleted}</strong></span><span>Score<strong>${Math.round(shift.totalScore)}</strong></span><span>Avg response<strong>${average(shift.responseTimes)}s</strong></span><span>Distance<strong>${(shift.distanceDriven/1000).toFixed(1)} km</strong></span><span>Collisions<strong>${shift.collisions}</strong></span><span>Damage<strong>${Math.round(shift.apparatusDamage)}</strong></span><span>Hydrants<strong>${shift.hydrantsUsed}</strong></span><span>Patients<strong>${shift.patientsAssisted}</strong></span><span>Best rank<strong>${shift.bestRank || '—'}</strong></span></div>`;
  }
}
