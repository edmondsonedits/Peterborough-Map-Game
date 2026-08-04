import { bearing, meters, pointFrom } from './math.js';

export class SupportSystem {
  constructor({ entities, roads, game }) {
    this.entities = entities;
    this.roads = roads;
    this.game = game;
    this.requests = new Map();
    this.trafficControl = false;
  }
  request(kind) {
    if (!['police','ambulance'].includes(kind)) return { ok:false, message:'Unsupported unit.' };
    if (this.requests.has(kind) || this.entities.active('supportVehicle').some(v => v.kind === kind)) return { ok:false, message:`${kind === 'police' ? 'Police' : 'Ambulance'} already assigned.` };
    if (!this.game.activeCall) return { ok:false, message:'No active call.' };
    const spawn = this.spawnPoint(this.game.activeCall);
    if (!spawn) return { ok:false, message:'No safe support-unit spawn was found.' };
    const unit = this.entities.acquire('supportVehicle', {
      kind, position: spawn, heading: bearing(spawn, this.game.activeCall), state:'responding',
      speed: kind === 'ambulance' ? 12 : 10.5, elapsed:0, stuck:0, spawnSource:'support-request'
    });
    if (!unit) return { ok:false, message:'Support-unit limit reached.' };
    this.requests.set(kind, unit.id);
    return { ok:true, message:`${kind === 'police' ? 'Police unit' : 'Ambulance'} responding.` };
  }
  spawnPoint(call) {
    const callXY = this.roads.xy(call.lat, call.lng);
    let best = null;
    for (const index of this.roads.nearbyIndexes(callXY.x, callXY.y, 600)) {
      const segment = this.roads.segments[index];
      for (const t of [.05,.95,.25,.75]) {
        const point = this.roads.latLng(segment.ax + segment.dx*t, segment.ay + segment.dy*t);
        const distance = meters(point, call);
        if (distance < 180 || distance > 520) continue;
        if (!best || distance > best.distance) best = { ...point, distance };
      }
    }
    return best || pointFrom(call, 180, 260);
  }
  update(dt) {
    const call = this.game.activeCall;
    for (const unit of this.entities.active('supportVehicle')) {
      unit.elapsed += dt;
      if (!call) { this.entities.release(unit); continue; }
      if (unit.state === 'responding') {
        const distance = meters(unit.position, call);
        if (distance <= 24 || unit.elapsed > 35) {
          unit.state = 'arrived';
          unit.position = this.roads.nearestRoadPosition(call.lat, call.lng, 80) || call;
          this.onArrive(unit);
          continue;
        }
        const desired = bearing(unit.position, call);
        unit.heading = desired;
        const candidate = pointFrom(unit.position, desired, Math.min(unit.speed*dt, distance));
        const snapped = this.roads.nearestRoadPosition(candidate.lat, candidate.lng, 28);
        unit.position = snapped && meters(candidate, snapped) < 18 ? snapped : candidate;
      }
    }
  }
  onArrive(unit) {
    if (unit.kind === 'police') {
      this.establishTrafficControl(true);
      for (let i=0;i<2;i+=1) this.entities.acquire('supportPerson', {
        kind:'police', position:pointFrom(unit.position, unit.heading+(i?90:-90),3+i), heading:unit.heading,
        state:'controlling', spawnSource:'police-unit'
      });
    }
    if (unit.kind === 'ambulance') {
      for (let i=0;i<2;i+=1) this.entities.acquire('supportPerson', {
        kind:'paramedic', position:pointFrom(unit.position, unit.heading+(i?90:-90),3+i), heading:unit.heading,
        state:'available', spawnSource:'ambulance'
      });
      if (this.game.phase2?.patientAssisted) this.transferPatient();
    }
  }
  establishTrafficControl(active) {
    this.trafficControl = Boolean(active);
    this.game.phase2?.renderer?.setTrafficZone(this.game.activeCall, this.trafficControl);
  }
  transferPatient() {
    const ambulance = this.entities.active('supportVehicle').find(v => v.kind === 'ambulance' && v.state === 'arrived');
    const patient = this.game.phase2?.patient;
    if (!ambulance || !patient || !this.game.phase2.patientAssisted) return false;
    patient.state = 'transferred';
    patient.position = { ...ambulance.position };
    this.game.phase2.patientTransferred = true;
    return true;
  }
  leave() {
    this.establishTrafficControl(false);
    this.entities.clear('supportVehicle');
    this.entities.clear('supportPerson');
    this.requests.clear();
  }
  reset() { this.leave(); }
}
