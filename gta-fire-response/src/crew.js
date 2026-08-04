import { CREW_PROFILES } from './config.js';
import { bearing, meters, pointFrom } from './math.js';

const TASK_DURATIONS = Object.freeze({
  follow: 0, pullHose: 4.5, waterSupply: 7, retrieveExtinguisher: 3.5,
  assistPatient: 6, controlTraffic: 5, returnApparatus: 3
});

export class CrewSystem {
  constructor({ entities, game }) {
    this.entities = entities;
    this.game = game;
    this.deployed = false;
    this.lastMessage = '';
  }
  deploy() {
    if (this.deployed) return;
    this.deployed = true;
    CREW_PROFILES.forEach((profile, index) => {
      const position = pointFrom(this.game.truck, this.game.truck.heading + (index === 0 ? -90 : 90), 3.8 + index * .8);
      this.entities.acquire('crew', {
        kind: profile.id, profileId: profile.id, name: profile.name, role: profile.role,
        color: profile.color, position, heading: this.game.truck.heading, state: 'available',
        task: 'idle', progress: 0, target: null, speed: 2.4, spawnSource: 'engine-1'
      });
    });
  }
  availableCrew() { return this.entities.active('crew').find(member => !['working','returning'].includes(member.state)); }
  command(task) {
    if (!Object.prototype.hasOwnProperty.call(TASK_DURATIONS, task)) return { ok:false, message:'Unknown crew task.' };
    const member = this.availableCrew();
    if (!member) return { ok:false, message:'All crew members are already assigned.' };
    member.task = task;
    member.progress = 0;
    member.state = task === 'follow' ? 'following' : task === 'returnApparatus' ? 'returning' : 'working';
    member.target = this.targetFor(task);
    this.lastMessage = `${member.name}: ${labelTask(task)}`;
    return { ok:true, message:this.lastMessage, member };
  }
  targetFor(task) {
    if (task === 'waterSupply') return this.game.phase2?.hydrants?.nearestAvailable(this.game.truck) || this.game.truck;
    if (task === 'controlTraffic') return this.game.activeCall || this.game.truck;
    if (task === 'assistPatient') return this.game.phase2?.patient?.position || this.game.activeCall || this.game.player;
    if (task === 'returnApparatus') return this.game.truck;
    return this.game.player;
  }
  update(dt) {
    for (const member of this.entities.active('crew')) {
      if (member.state === 'available') continue;
      member.target = this.targetFor(member.task);
      const target = member.target?.position || member.target;
      if (!target?.lat) { member.state='available'; member.task='idle'; continue; }
      const distance = meters(member.position, target);
      if (distance > 2.3) {
        member.heading = bearing(member.position, target);
        member.position = pointFrom(member.position, member.heading, Math.min(distance, member.speed * dt));
        continue;
      }
      if (member.task === 'follow') continue;
      member.progress += dt;
      if (member.progress < TASK_DURATIONS[member.task]) continue;
      this.completeTask(member);
    }
  }
  completeTask(member) {
    const task = member.task;
    if (task === 'pullHose') {
      this.game.incident.compartmentOpen = true;
      this.game.incident.selectTool('hose');
    }
    if (task === 'retrieveExtinguisher') {
      this.game.incident.compartmentOpen = true;
      this.game.incident.selectTool('extinguisher');
    }
    if (task === 'waterSupply') this.game.phase2?.hydrants?.connectNearestByCrew(member);
    if (task === 'assistPatient') this.game.phase2?.markPatientAssisted('crew');
    if (task === 'controlTraffic') this.game.phase2?.support?.establishTrafficControl(true);
    if (task === 'returnApparatus') {
      member.state = 'stowed';
      this.entities.release(member);
      return;
    }
    member.state = 'available';
    member.task = 'idle';
    member.progress = 0;
    member.target = null;
  }
  status() {
    return this.entities.active('crew').map(member => ({ name:member.name, role:member.role, state:member.state, task:member.task, progress:member.progress }));
  }
  reset() { this.entities.clear('crew'); this.deployed = false; }
}

function labelTask(task) {
  return ({ follow:'Following.', pullHose:'Pulling the attack line.', waterSupply:'Establishing water supply.', retrieveExtinguisher:'Retrieving the extinguisher.', assistPatient:'Assisting the patient.', controlTraffic:'Setting traffic control.', returnApparatus:'Returning to Engine 1.' })[task] || task;
}
