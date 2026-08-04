export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.context = null;
    this.master = null;
    this.sirenGain = null;
    this.dispatchGain = null;
    this.sirenNodes = [];
    this.sirenMode = settings.sirenMode || 'wail';
    this.unlocked = false;
  }

  async unlock() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.sirenGain = this.context.createGain();
      this.dispatchGain = this.context.createGain();
      this.sirenGain.connect(this.master);
      this.dispatchGain.connect(this.master);
      this.master.connect(this.context.destination);
      this.applySettings();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.unlocked = true;
    return true;
  }

  applySettings() {
    if (!this.master) return;
    const muted = this.settings.mute ? 0 : 1;
    this.master.gain.value = this.settings.masterVolume * muted;
    this.sirenGain.gain.value = this.settings.sirenVolume;
    this.dispatchGain.gain.value = this.settings.dispatchVolume;
  }

  tone(frequency, duration, gain = .08, target = 'dispatch', type = 'sine', delay = 0) {
    if (!this.context || !this.unlocked || this.settings.mute) return;
    const bus = target === 'siren' ? this.sirenGain : this.dispatchGain;
    const oscillator = this.context.createOscillator();
    const amp = this.context.createGain();
    const start = this.context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + .015);
    amp.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(amp); amp.connect(bus);
    oscillator.start(start); oscillator.stop(start + duration + .03);
  }

  playStationAlert() {
    this.tone(880, .24, .11, 'dispatch', 'square', 0);
    this.tone(660, .24, .1, 'dispatch', 'square', .3);
    this.tone(880, .35, .11, 'dispatch', 'square', .6);
  }

  startSiren(mode = this.sirenMode) {
    this.stopSiren();
    if (!this.context || !this.unlocked || this.settings.mute) return;
    this.sirenMode = mode;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = mode === 'yelp' ? 760 : 650;
    lfo.type = 'sine';
    lfo.frequency.value = mode === 'yelp' ? 3.8 : .48;
    lfoGain.gain.value = mode === 'yelp' ? 220 : 310;
    gain.gain.value = .055;
    lfo.connect(lfoGain); lfoGain.connect(oscillator.frequency);
    oscillator.connect(gain); gain.connect(this.sirenGain);
    oscillator.start(); lfo.start();
    this.sirenNodes = [oscillator, lfo, gain, lfoGain];
  }

  stopSiren() {
    for (const node of this.sirenNodes) { try { node.stop?.(); } catch {} try { node.disconnect?.(); } catch {} }
    this.sirenNodes = [];
  }

  cycleSiren(active) {
    this.sirenMode = this.sirenMode === 'wail' ? 'yelp' : 'wail';
    this.settings.sirenMode = this.sirenMode;
    if (active) this.startSiren(this.sirenMode);
    return this.sirenMode;
  }

  horn() {
    this.tone(195, .28, .15, 'siren', 'square', 0);
    this.tone(245, .28, .11, 'siren', 'square', 0);
  }

  pause() { this.context?.suspend?.(); }
  resume() { if (this.unlocked) this.context?.resume?.(); }
  destroy() { this.stopSiren(); this.context?.close?.(); }
}
