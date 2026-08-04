import { bearing, meters, normalizeHeading, pointFrom, seededRandom } from './math.js';

export class PedestrianSystem {
  constructor({ entities, roads, budgets, seed = 1 }) {
    this.entities = entities;
    this.roads = roads;
    this.random = seededRandom(seed + 151);
    this.max = matchMedia('(pointer: coarse)').matches ? budgets.pedestriansMobile : budgets.pedestriansDesktop;
    this.spawnTimer = 0;
    this.performanceScale = 1;
  }
  setPerformance(fps) {
    if (fps < 34) this.performanceScale = Math.max(.35, this.performanceScale - .06);
    else if (fps > 52) this.performanceScale = Math.min(1, this.performanceScale + .015);
  }
  spawn(center, incident) {
    const cap = Math.max(4, Math.floor(this.max * this.performanceScale));
    if (this.entities.count('pedestrian') >= cap || !this.roads.segments.length) return;
    const xy = this.roads.xy(center.lat, center.lng);
    const nearby = [...this.roads.nearbyIndexes(xy.x, xy.y, 520)];
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const segment = this.roads.segments[nearby[Math.floor(this.random() * nearby.length)]];
      if (!segment) continue;
      const t = .08 + this.random() * .84;
      const base = this.roads.latLng(segment.ax + segment.dx * t, segment.ay + segment.dy * t);
      const distance = meters(center, base);
      if (distance < 70 || distance > 430) continue;
      const roadHeading = normalizeHeading(Math.atan2(segment.dx, segment.dy) * 180 / Math.PI);
      const side = this.random() < .5 ? -1 : 1;
      const position = pointFrom(base, roadHeading + side * 90, Math.min(7, segment.allowed + 1.2));
      if (incident && meters(position, incident) < 24) continue;
      const entity = this.entities.acquire('pedestrian', {
        position, heading: side > 0 ? roadHeading : normalizeHeading(roadHeading + 180),
        state: 'walking', speed: 1 + this.random() * .55, segmentId: segment.id,
        direction: side > 0 ? 1 : -1, t, side, life: 0, reactionTimer: 0,
        spawnSource: 'street-bubble'
      });
      if (entity) return;
    }
  }
  update(dt, center, truck, emergencyActive, incident, fireIntensity, reducedCrowds = false) {
    this.spawnTimer += dt;
    const interval = reducedCrowds ? 2.4 : 1.15;
    if (this.spawnTimer >= interval) { this.spawnTimer = 0; this.spawn(center, incident); }
    for (const person of this.entities.active('pedestrian')) {
      person.life += dt;
      const distanceToCenter = meters(person.position, center);
      if (distanceToCenter > 620 || person.life > 95) { this.entities.release(person); continue; }
      const distanceToTruck = meters(person.position, truck);
      const distanceToIncident = incident ? meters(person.position, incident) : Infinity;
      if (incident && fireIntensity > 10 && distanceToIncident < 46) {
        person.state = 'fleeing';
        person.heading = bearing(incident, person.position);
        person.speed = 2.2;
      } else if (emergencyActive && distanceToTruck < 52) {
        person.state = 'yielding';
        person.heading = bearing(truck, person.position);
        person.speed = .45;
      } else if (incident && distanceToIncident < 88 && this.random() < dt * .035) {
        person.state = this.random() < .32 ? 'filming' : 'watching';
        person.heading = bearing(person.position, incident);
        person.speed = 0;
        person.reactionTimer = 3 + this.random() * 6;
      } else if (person.reactionTimer > 0) {
        person.reactionTimer -= dt;
      } else {
        person.state = 'walking';
        person.speed = 1 + (person.id.charCodeAt(person.id.length - 1) % 5) * .1;
      }
      if (person.speed <= 0) continue;
      const segment = this.roads.segments[person.segmentId];
      if (!segment) { this.entities.release(person); continue; }
      if (person.state === 'fleeing' || person.state === 'yielding') {
        person.position = pointFrom(person.position, person.heading, person.speed * dt);
        continue;
      }
      const delta = person.speed * dt / Math.max(1, segment.length) * person.direction;
      person.t += delta;
      if (person.t >= 1 || person.t <= 0) {
        const options = this.roads.adjacency.get(segment.id) || [];
        const next = options.length ? this.roads.segments[options[Math.floor(this.random() * options.length)]] : null;
        if (!next) { person.direction *= -1; person.t = Math.max(.01, Math.min(.99, person.t)); }
        else {
          const end = person.t >= 1 ? { x:segment.bx,y:segment.by } : { x:segment.ax,y:segment.ay };
          const toA = Math.hypot(next.ax-end.x,next.ay-end.y);
          const toB = Math.hypot(next.bx-end.x,next.by-end.y);
          person.segmentId = next.id; person.direction = toA <= toB ? 1 : -1; person.t = person.direction === 1 ? .01 : .99;
        }
      }
      const active = this.roads.segments[person.segmentId];
      const base = this.roads.latLng(active.ax + active.dx * person.t, active.ay + active.dy * person.t);
      const roadHeading = normalizeHeading(Math.atan2(active.dx * person.direction, active.dy * person.direction) * 180 / Math.PI);
      person.heading = roadHeading;
      person.position = pointFrom(base, roadHeading + person.side * 90, Math.min(7, active.allowed + 1.2));
    }
  }
  reset() { this.entities.clear('pedestrian'); }
}
