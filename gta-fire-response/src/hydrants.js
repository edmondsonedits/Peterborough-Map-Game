import { HYDRANTS } from './config.js';
import { meters } from './math.js';

export class HydrantSystem {
  constructor({ entities, game, renderer }) {
    this.entities = entities;
    this.game = game;
    this.renderer = renderer;
    this.connected = null;
    this.engineTank = 750;
    this.maxTank = 750;
  }
  initialize() {
    if (this.entities.count('hydrant')) return;
    for (const data of HYDRANTS) this.entities.acquire('hydrant', {
      id:data.id, kind:'hydrant', label:data.label, flow:data.flow, available:data.available,
      position:{ lat:data.lat, lng:data.lng }, heading:0, state:data.available?'available':'unavailable',
      spawnSource:'hydrant-data'
    });
  }
  nearestAvailable(point, maxDistance = 90) {
    let nearest = null;
    for (const hydrant of this.entities.active('hydrant')) {
      if (!hydrant.available) continue;
      const distance = meters(point.position || point, hydrant.position);
      if (distance <= maxDistance && (!nearest || distance < nearest.distance)) nearest = { entity:hydrant, distance };
    }
    return nearest?.entity || null;
  }
  connect(player, equipment) {
    if (this.connected) return { ok:false, message:'Water supply already established.' };
    if (!equipment?.has('hydrantBag')) return { ok:false, message:'Retrieve the hydrant bag first.' };
    const hydrant = this.nearestAvailable(player, 13);
    if (!hydrant) return { ok:false, message:'Move closer to an available hydrant.' };
    if (meters(hydrant.position, this.game.truck) > 95) return { ok:false, message:'The supply line is too long.' };
    this.connected = hydrant;
    hydrant.state = 'connected';
    this.renderer.setSupplyLine(hydrant, this.game.truck, true);
    this.game.ui.toast(`WATER SUPPLY · ${hydrant.label.toUpperCase()}`);
    this.game.phase2.save.data.shift.hydrantsUsed += 1;
    this.game.phase2.save.persist();
    return { ok:true, message:`Connected ${hydrant.label}.` };
  }
  connectNearestByCrew(member) {
    const hydrant = this.nearestAvailable(this.game.truck, 95);
    if (!hydrant || this.connected) return false;
    this.connected = hydrant;
    hydrant.state = 'connected';
    member.position = { ...hydrant.position };
    this.renderer.setSupplyLine(hydrant, this.game.truck, true);
    this.game.phase2.save.data.shift.hydrantsUsed += 1;
    this.game.phase2.save.persist();
    return true;
  }
  consumeWater(amount) {
    if (this.connected) return true;
    if (this.engineTank <= 0) return false;
    const used = Math.min(this.engineTank, amount);
    this.engineTank -= used;
    this.game.phase2.save.data.shift.waterUsed += used;
    return this.engineTank > 0;
  }
  reset() {
    if (this.connected) this.connected.state = 'available';
    this.connected = null;
    this.engineTank = this.maxTank;
    this.renderer.setSupplyLine(null, this.game.truck, false);
  }
}
