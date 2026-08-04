import { RANKS, UNLOCKS, XP_THRESHOLDS } from './phase3-data.js';
import { levelForXp } from './phase3-math.js';

const SAVE_KEY = 'pfr-phase3-progression';
const VERSION = 1;

function defaults() {
  return { version:VERSION, xp:0, level:1, rank:RANKS[0], reputation:0, streak:0, bestStreak:0, operations:0, sRanks:0, unlocks:['command-board'], achievements:[] };
}

export class ProgressionStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
  }
  load() {
    try {
      const parsed = JSON.parse(this.storage?.getItem(SAVE_KEY) || 'null');
      return { ...defaults(), ...(parsed && parsed.version === VERSION ? parsed : {}) };
    } catch { return defaults(); }
  }
  persist() {
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch {}
  }
  record({ score = 0, rank = 'C', noCollision = false, escalations = 0, completionRatio = 1 } = {}) {
    const xpGain = Math.max(75, Math.round(score * 0.55 + completionRatio * 120 - escalations * 15));
    this.data.xp += xpGain;
    this.data.operations += 1;
    this.data.reputation = Math.max(0, this.data.reputation + (rank === 'S' ? 4 : rank === 'A' ? 3 : rank === 'B' ? 2 : 1) - escalations);
    this.data.streak = rank === 'S' || rank === 'A' ? this.data.streak + 1 : 0;
    this.data.bestStreak = Math.max(this.data.bestStreak, this.data.streak);
    if (rank === 'S') this.data.sRanks += 1;
    if (noCollision && !this.data.achievements.includes('Still Has Mirrors')) this.data.achievements.push('Still Has Mirrors');
    if (this.data.streak >= 3 && !this.data.achievements.includes('Dispatch Cannot Break You')) this.data.achievements.push('Dispatch Cannot Break You');
    if (escalations === 0 && !this.data.achievements.includes('Boring Is Beautiful')) this.data.achievements.push('Boring Is Beautiful');
    const previousLevel = this.data.level;
    this.data.level = levelForXp(this.data.xp, XP_THRESHOLDS);
    this.data.rank = RANKS[Math.min(RANKS.length - 1, this.data.level - 1)];
    this.data.unlocks = UNLOCKS.filter(unlock => unlock.level <= this.data.level).map(unlock => unlock.id);
    this.persist();
    return { xpGain, leveledUp: this.data.level > previousLevel, level:this.data.level, rank:this.data.rank, unlocks:[...this.data.unlocks] };
  }
}
