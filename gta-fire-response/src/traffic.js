import { bearing, meters, normalizeHeading, seededRandom } from './math.js';

export class TrafficSystem {
  constructor(roadSystem, renderer, seed = 1) {
    this.roads = roadSystem;
    this.renderer = renderer;
    this.random = seededRandom(seed + 77);
    this.vehicles = [];
    this.maxVehicles = matchMedia('(pointer: coarse)').matches ? 10 : 16;
    this.spawnAccumulator = 0;
    this.performanceScale = 1;
    this.collisionCooldown = 0;
  }

  setPerformance(fps) {
    if (fps < 34) this.performanceScale = Math.max(.45, this.performanceScale - .05);
    else if (fps > 52) this.performanceScale = Math.min(1, this.performanceScale + .015);
  }

  spawnAround(center, fireTruck) {
    const targetCount = Math.max(4, Math.floor(this.maxVehicles * this.performanceScale));
    if (this.vehicles.filter(v => v.active).length >= targetCount || !this.roads.segments.length) return;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const segment = this.roads.segments[Math.floor(this.random() * this.roads.segments.length)];
      const t = this.random();
      const point = this.roads.latLng(segment.ax + segment.dx * t, segment.ay + segment.dy * t);
      const distance = meters(center, point);
      if (distance < 120 || distance > 520 || meters(point, fireTruck) < 30) continue;
      if (this.vehicles.some(vehicle => vehicle.active && meters(vehicle, point) < 12)) continue;
      const direction = this.random() < .5 ? 1 : -1;
      const vehicle = this.vehicles.find(item => !item.active) || {};
      Object.assign(vehicle, {
        active: true, segmentId: segment.id, t, direction,
        speed: 5 + this.random() * 5, targetSpeed: 7 + this.random() * 4,
        lat: point.lat, lng: point.lng,
        heading: normalizeHeading(Math.atan2(segment.dx * direction, segment.dy * direction) * 180 / Math.PI),
        state: 'driving', stuckFor: 0, routeMemory: [segment.id]
      });
      if (!this.vehicles.includes(vehicle)) this.vehicles.push(vehicle);
      return;
    }
  }

  chooseNextSegment(vehicle, atEnd) {
    const current = this.roads.segments[vehicle.segmentId];
    const options = this.roads.adjacency.get(current.id) || [];
    const candidates = options.filter(id => !vehicle.routeMemory.slice(-2).includes(id));
    const pool = candidates.length ? candidates : options;
    if (!pool.length) { vehicle.direction *= -1; vehicle.t = atEnd ? .999 : .001; return; }
    const next = this.roads.segments[pool[Math.floor(this.random() * pool.length)]];
    const endX = atEnd ? current.bx : current.ax;
    const endY = atEnd ? current.by : current.ay;
    const distanceToA = Math.hypot(next.ax - endX, next.ay - endY);
    const distanceToB = Math.hypot(next.bx - endX, next.by - endY);
    vehicle.segmentId = next.id;
    vehicle.direction = distanceToA <= distanceToB ? 1 : -1;
    vehicle.t = vehicle.direction === 1 ? .001 : .999;
    vehicle.routeMemory.push(next.id);
    if (vehicle.routeMemory.length > 5) vehicle.routeMemory.shift();
  }

  update(dt, center, fireTruck, emergencyActive, onCollision) {
    this.spawnAccumulator += dt;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    if (this.spawnAccumulator > .6) { this.spawnAccumulator = 0; this.spawnAround(center, fireTruck); }

    for (const vehicle of this.vehicles) {
      if (!vehicle.active) continue;
      if (meters(vehicle, center) > 700) { vehicle.active = false; continue; }
      const distanceToTruck = meters(vehicle, fireTruck);
      const truckApproaching = Math.abs(((bearing(vehicle, fireTruck) - vehicle.heading + 540) % 360) - 180) < 105;
      if (emergencyActive && distanceToTruck < 72 && truckApproaching) {
        vehicle.state = 'yielding';
        vehicle.targetSpeed = distanceToTruck < 38 ? .7 : 2.6;
      } else {
        vehicle.state = 'driving';
        vehicle.targetSpeed = 6.5 + (vehicle.segmentId % 5) * .55;
      }
      vehicle.speed += (vehicle.targetSpeed - vehicle.speed) * Math.min(1, dt * 2.8);
      const segment = this.roads.segments[vehicle.segmentId];
      if (!segment) { vehicle.active = false; continue; }
      const delta = (vehicle.speed * dt / segment.length) * vehicle.direction;
      vehicle.t += delta;
      if (vehicle.t >= 1) this.chooseNextSegment(vehicle, true);
      else if (vehicle.t <= 0) this.chooseNextSegment(vehicle, false);
      const activeSegment = this.roads.segments[vehicle.segmentId];
      const point = this.roads.latLng(activeSegment.ax + activeSegment.dx * vehicle.t, activeSegment.ay + activeSegment.dy * vehicle.t);
      vehicle.lat = point.lat;
      vehicle.lng = point.lng;
      vehicle.heading = normalizeHeading(Math.atan2(activeSegment.dx * vehicle.direction, activeSegment.dy * vehicle.direction) * 180 / Math.PI);

      if (distanceToTruck < 4.8 && this.collisionCooldown <= 0) {
        this.collisionCooldown = 1.25;
        vehicle.speed *= .25;
        onCollision?.(vehicle);
      }
    }
    this.renderer.updateTraffic(this.vehicles.filter(vehicle => vehicle.active));
  }

  reset() {
    this.vehicles.forEach(vehicle => { vehicle.active = false; });
    this.renderer.updateTraffic([]);
  }

  activeCount() { return this.vehicles.filter(vehicle => vehicle.active).length; }
}
