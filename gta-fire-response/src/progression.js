import { RANKS, UNLOCKS, XP_THRESHOLDS } from './phase3-data.js';
import { levelForXp } from './phase3-math.js';

const SAVE_KEY = 'pfr-phase3-progression';
const VERSION = 1;

export function defaultProgression() {
  return {
    version:VERSION,
    xp:0,
    level:1,
    rank:RANKS[0],
    reputation:0,
    streak:0,
    bestStreak:0,
    operations:0,
    sRanks:0,
    unlocks:['command-board'],
    achievements:[]
  };
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function migrateProgression(input) {
  const base = defaultProgression();
  if (!input || typeof input !== 'object') return base;
  const xp = Math.max(0, Math.min(1_000_000_000, finite(input.xp)));
  const level = levelForXp(xp, XP_THRESHOLDS);
  return {
    version:VERSION,
    xp,
    level,
    rank:RANKS[Math.min(RANKS.length - 1, level - 1)],
    reputation:Math.max(0, Math.min(1_000_000, finite(input.reputation))),
    streak:Math.max(0, Math.min(10_000, finite(input.streak))),
    bestStreak:Math.max(0, Math.min(10_000, finite(input.bestStreak))),
    operations:Math.max(0, Math.min(1_000_000, finite(input.operations))),
    sRanks:Math.max(0, Math.min(1_000_000, finite(input.sRanks))),
    // Unlocks are derived from validated XP. Imported text cannot grant an
    // arbitrary perk that the career has not actually earned.
    unlocks:UNLOCKS.filter(unlock => unlock.level <= level).map(unlock => unlock.id),
    achievements:Array.isArray(input.achievements)
      ? [...new Set(input.achievements.filter(value => typeof value === 'string').slice(0, 100))]
      : []
  };
}

export class ProgressionStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(this.storage?.getItem(SAVE_KEY) || 'null');
      return migrateProgression(parsed);
    } catch {
      return defaultProgression();
    }
  }

  persist() {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
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
    return {
      xpGain,
      leveledUp:this.data.level > previousLevel,
      level:this.data.level,
      rank:this.data.rank,
      unlocks:[...this.data.unlocks]
    };
  }
}
