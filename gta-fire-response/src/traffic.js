import { approach, bearing, meters, normalizeHeading, seededRandom } from './math.js';
import { followingGap, followingSpeedLimit, laneOffsetMeters } from './player-benefit-math.js';

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

  positionVehicle(vehicle, segment) {
    const x = segment.ax + segment.dx * vehicle.t;
    const y = segment.ay + segment.dy * vehicle.t;
    const travelX = segment.dx / segment.length * vehicle.direction;
    const travelY = segment.dy / segment.length * vehicle.direction;
    // Peterborough traffic keeps right. Offsetting the marker from the source
    // road centreline separates opposing cars and gives yielding vehicles room
    // to move visibly toward the shoulder instead of stopping in the lane.
    const rightX = travelY;
    const rightY = -travelX;
    const point = this.roads.latLng(
      x + rightX * vehicle.lateralOffset,
      y + rightY * vehicle.lateralOffset
    );
    vehicle.lat = point.lat;
    vehicle.lng = point.lng;
    vehicle.heading = normalizeHeading(Math.atan2(segment.dx * vehicle.direction, segment.dy * vehicle.direction) * 180 / Math.PI);
  }

  spawnAround(center, fireTruck) {
    const targetCount = Math.max(4, Math.floor(this.maxVehicles * this.performanceScale));
    if (this.vehicles.filter(vehicle => vehicle.active).length >= targetCount || !this.roads.segments.length) return;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const segment = this.roads.segments[Math.floor(this.random() * this.roads.segments.length)];
      const t = this.random();
      const centrePoint = this.roads.latLng(segment.ax + segment.dx * t, segment.ay + segment.dy * t);
      const distance = meters(center, centrePoint);
      if (distance < 120 || distance > 520 || meters(centrePoint, fireTruck) < 30) continue;
      if (this.vehicles.some(vehicle => vehicle.active && meters(vehicle, centrePoint) < 12)) continue;
      const direction = this.random() < .5 ? 1 : -1;
      const vehicle = this.vehicles.find(item => !item.active) || {};
      Object.assign(vehicle, {
        active: true,
        segmentId: segment.id,
        t,
        direction,
        speed: 5 + this.random() * 5,
        targetSpeed: 7 + this.random() * 4,
        heading: normalizeHeading(Math.atan2(segment.dx * direction, segment.dy * direction) * 180 / Math.PI),
        state: 'driving',
        stuckFor: 0,
        routeMemory: [segment.id],
        lateralOffset: laneOffsetMeters(segment, false),
        targetLateralOffset: laneOffsetMeters(segment, false)
      });
      this.positionVehicle(vehicle, segment);
      if (!this.vehicles.includes(vehicle)) this.vehicles.push(vehicle);
      return;
    }
  }

  chooseNextSegment(vehicle, atEnd) {
    const current = this.roads.segments[vehicle.segmentId];
    const options = this.roads.adjacency.get(current.id) || [];
    const candidates = options.filter(id => !vehicle.routeMemory.slice(-2).includes(id));
    const pool = candidates.length ? candidates : options;
    if (!pool.length) {
      vehicle.direction *= -1;
      vehicle.t = atEnd ? .999 : .001;
      return;
    }
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

  closestFollowingGap(vehicle, segment) {
    let nearest = Infinity;
    for (const other of this.vehicles) {
      if (!other.active || other === vehicle) continue;
      nearest = Math.min(nearest, followingGap(vehicle, other, segment.length));
    }
    return nearest;
  }

  update(dt, center, fireTruck, emergencyActive, onCollision) {
    this.spawnAccumulator += dt;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    if (this.spawnAccumulator > .6) {
      this.spawnAccumulator = 0;
      this.spawnAround(center, fireTruck);
    }

    for (const vehicle of this.vehicles) {
      if (!vehicle.active) continue;
      if (meters(vehicle, center) > 700) {
        vehicle.active = false;
        continue;
      }

      let segment = this.roads.segments[vehicle.segmentId];
      if (!segment) {
        vehicle.active = false;
        continue;
      }

      const distanceToTruck = meters(vehicle, fireTruck);
      const truckApproaching = Math.abs(((bearing(vehicle, fireTruck) - vehicle.heading + 540) % 360) - 180) < 105;
      const shouldYield = emergencyActive && distanceToTruck < 82 && truckApproaching;
      const cruiseSpeed = 6.5 + (vehicle.segmentId % 5) * .55;

      if (shouldYield) {
        vehicle.state = 'yielding';
        vehicle.targetSpeed = distanceToTruck < 34 ? .45 : 2.2;
        vehicle.targetLateralOffset = laneOffsetMeters(segment, true);
      } else {
        vehicle.state = 'driving';
        vehicle.targetSpeed = cruiseSpeed;
        vehicle.targetLateralOffset = laneOffsetMeters(segment, false);
      }

      // Vehicles now maintain a real following gap. Previously cars could
      // overlap after spawning because spacing was checked only at creation.
      const gap = this.closestFollowingGap(vehicle, segment);
      vehicle.targetSpeed = Math.min(vehicle.targetSpeed, followingSpeedLimit(gap, cruiseSpeed));
      vehicle.speed += (vehicle.targetSpeed - vehicle.speed) * Math.min(1, dt * 2.8);
      vehicle.lateralOffset = approach(
        Number(vehicle.lateralOffset) || laneOffsetMeters(segment, false),
        vehicle.targetLateralOffset,
        4.2 * dt
      );

      const delta = (vehicle.speed * dt / segment.length) * vehicle.direction;
      vehicle.t += delta;
      if (vehicle.t >= 1) this.chooseNextSegment(vehicle, true);
      else if (vehicle.t <= 0) this.chooseNextSegment(vehicle, false);

      segment = this.roads.segments[vehicle.segmentId];
      if (!segment) {
        vehicle.active = false;
        continue;
      }
      this.positionVehicle(vehicle, segment);

      const collisionDistance = meters(vehicle, fireTruck);
      if (collisionDistance < 4.8 && this.collisionCooldown <= 0) {
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

  activeCount() {
    return this.vehicles.filter(vehicle => vehicle.active).length;
  }
}
