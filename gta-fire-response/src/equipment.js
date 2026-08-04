import { EQUIPMENT_CATALOG } from './config.js';
import { meters, pointFrom } from './math.js';

export class EquipmentSystem {
  constructor(game) {
    this.game = game;
    this.items = new Map(Object.values(EQUIPMENT_CATALOG).map(item => [item.id, { ...item, state:'stored', carrier:null, position:null }]));
    this.primary = null;
    this.small = null;
  }
  has(id) { return this.primary === id || this.small === id; }
  compartmentPoint(item) {
    const offset = item.compartment === 'rear' ? 180 : item.compartment === 'curbside' ? 90 : item.compartment === 'streetside' ? -90 : 0;
    return pointFrom(this.game.truck, this.game.truck.heading + offset, item.compartment === 'cab' ? 3.2 : 5.1);
  }
  take(id) {
    const item = this.items.get(id);
    if (!item) return { ok:false, message:'Unknown equipment.' };
    if (item.state === 'carried') return { ok:false, message:`${item.label} is already carried.` };
    if (item.state === 'deployed') return { ok:false, message:`${item.label} is already deployed.` };
    if (this.game.mode !== 'foot') return { ok:false, message:'Exit Engine 1 first.' };
    const point = this.compartmentPoint(item);
    if (meters(this.game.player, point) > 7) return { ok:false, message:`Move to the ${item.compartment} compartment.` };
    const slot = item.slot;
    const existing = slot === 'primary' ? this.primary : this.small;
    if (existing && existing !== id) this.return(existing, true);
    item.state = 'carried'; item.carrier = 'player'; item.position = null;
    if (slot === 'primary') this.primary = id; else this.small = id;
    if (id === 'hose' || id === 'extinguisher') {
      this.game.incident.compartmentOpen = true;
      this.game.incident.selectTool(id);
    }
    this.game.ui.setTool(item.label, null);
    return { ok:true, message:`Took ${item.label}.` };
  }
  deploy(id = this.primary) {
    const item = this.items.get(id);
    if (!item || item.state !== 'carried') return false;
    item.state='deployed'; item.carrier=null; item.position={ ...this.game.player };
    if (this.primary === id) this.primary=null;
    if (this.small === id) this.small=null;
    return true;
  }
  return(id, force = false) {
    const item = this.items.get(id);
    if (!item) return false;
    if (!force && this.game.mode !== 'foot') return false;
    item.state='stored'; item.carrier=null; item.position=null;
    if (this.primary === id) this.primary=null;
    if (this.small === id) this.small=null;
    if (id === 'hose' || id === 'extinguisher') { this.game.incident.tool='none'; this.game.renderer.setHose({}, {}, false); this.game.renderer.setStream({}, {}, false); }
    return true;
  }
  restoreAll() { for (const id of this.items.keys()) this.return(id, true); }
  leftBehindCount() { return [...this.items.values()].filter(item => item.state === 'deployed').length; }
  snapshot() { return [...this.items.values()].map(item => ({ id:item.id, label:item.label, state:item.state, carrier:item.carrier })); }
}
