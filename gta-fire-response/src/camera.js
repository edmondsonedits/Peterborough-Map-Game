import { clamp, pointFrom, meters } from './math.js';

export class CameraController {
  constructor(map, settings) {
    this.map = map;
    this.settings = settings;
    this.followAccumulator = 0;
    this.zoomAccumulator = 0;
    this.currentZoom = map.getZoom();
    this.targetZoom = this.currentZoom;
    this.lastFastAt = 0;
    this.lastTarget = null;
  }

  desiredZoom(mode, speed) {
    if (mode === 'foot') return 19.1;
    const kmh = Math.abs(speed) * 3.6;
    if (kmh < 20) return 18.7;
    if (kmh < 45) return 18.25;
    if (kmh < 75) return 17.75;
    return 17.25;
  }

  update(dt, mode, entity, speed, now = performance.now()) {
    this.followAccumulator += dt;
    this.zoomAccumulator += dt;
    const absSpeed = Math.abs(speed);
    if (absSpeed > 5) this.lastFastAt = now;

    if (this.followAccumulator >= .11) {
      this.followAccumulator = 0;
      const lookAhead = mode === 'truck' ? clamp(absSpeed * .42, 4, 26) : 2.2;
      const target = pointFrom(entity, entity.heading, lookAhead);
      if (!this.lastTarget || meters(this.lastTarget, target) > 1.2) {
        this.map.stop?.();
        const animate = !this.settings.reducedMotion && !globalThis.__LEAFLET_FALLBACK__;
        this.map.panTo([target.lat, target.lng], { animate, duration: .11, easeLinearity: .9, noMoveStart: true });
        this.lastTarget = target;
      }
    }

    let desired = this.desiredZoom(mode, speed);
    if (desired > this.currentZoom && now - this.lastFastAt < 2400) desired = this.currentZoom;
    if (Math.abs(desired - this.targetZoom) >= .24) this.targetZoom = desired;

    if (this.zoomAccumulator >= 1.05 && Math.abs(this.currentZoom - this.targetZoom) >= .24) {
      this.zoomAccumulator = 0;
      const step = this.targetZoom > this.currentZoom ? .25 : -.25;
      this.currentZoom = Number(clamp(this.currentZoom + step, 16.75, 19.25).toFixed(2));
      this.map.stop?.();
      this.map.setZoom(this.currentZoom, { animate: false });
    }
  }

  reset(mode = 'foot') {
    this.currentZoom = mode === 'foot' ? 19 : 18.5;
    this.targetZoom = this.currentZoom;
    this.map.setZoom(this.currentZoom, { animate: false });
  }
}
