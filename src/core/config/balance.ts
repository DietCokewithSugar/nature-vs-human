import type { Difficulty } from '../types.ts';

/**
 * Global tuning knobs. Every number the economy depends on lives in config/.
 *
 * References (see docs/balance.md):
 * - cost growth 1.15 per unit: Cookie Clicker buildings
 * - x2 at owned thresholds: AdVenture Capitalist milestones
 * - a cure meter racing your spread, countermeasures, run-based meta unlocks: Plague Inc.
 */
export const BALANCE = {
  costGrowth: 1.15,
  /** Owned counts at which a creature's output doubles. */
  milestones: [10, 25, 50, 100, 150, 200, 250, 300, 400, 500],
  milestoneMult: 2,

  /** Tier i costs costBase × costStep^i and makes prodBase × prodStep^i per second. */
  tiers: { costBase: 15, costStep: 8, prodBase: 0.2, prodStep: 7.2 },

  /** Ancient megafauna lose this factor of output for every era they fall behind. */
  obsolete: 0.5,

  click: { base: 1 },

  breeding: {
    /** Bred units per second, per bought unit, per nest. */
    ratePerNest: 0.0012,
    nestBaseCost: 2_000,
    nestCostGrowth: 7,
  },

  tide: {
    period: 120,
    baseAmp: 1,
    surgeMult: 2,
    surgeDuration: 30,
    surgeCooldown: 180,
  },

  research: {
    /** Fraction of the meter per second at the very start of a run, before modifiers. */
    base: 0.00018,
    /** Multiplier per era the humans have reached. */
    eraMult: [1, 1.3, 1.65, 2.05],
    /** How strongly progress on the bill speeds research up: × (floor + weight × progress). */
    progressFloor: 0.4,
    progressWeight: 1.6,
    /** A countermeasure lands each time the meter crosses one of these. */
    thresholds: [0.2, 0.4, 0.6, 0.8],
    /** Output lost by the targeted class before resistance. */
    countermeasure: 0.5,
    /** Each domesticated pig herd speeds research up by this much. */
    pigBoost: 0.2,
  },

  domestication: {
    /** Meter per second at full exposure in the first era. */
    base: 0.0022,
    eraMult: [1, 1.25, 1.55, 1.9],
    /** Owning this many of a species counts as full exposure. */
    fullExposure: 60,
    /** Dogs make hunters this much faster. */
    dogBoost: 0.6,
  },

  actives: {
    rescue: { cooldown: 90, amount: 0.35 },
    rampage: { cooldown: 150, duration: 20, mult: 3 },
    sabotage: { cooldown: 240, amount: 0.03 },
  },

  /** Humans march out to wreck the lair of your best earner. */
  raids: {
    /** Raid meter gained per unit of research gained: raids speed up with research. */
    perResearch: 30,
    /** Seconds to reach a lair at distance 1 (see ZONES). */
    march: 25,
  },

  lairs: {
    /** Output a species loses while its lair is wrecked. */
    loss: 0.5,
    /** Seconds a wrecked lair takes to grow back. */
    regrow: 90,
  },

  disasters: {
    /** Disasters start in this era; the ice age stays quiet. */
    fromEra: 2,
    /** Seconds from opening that era to the first warning. */
    first: 150,
    /** Seconds between one disaster ending and the next warning. */
    gap: [300, 480],
  },

  difficulty: {
    normal: { bill: 1e21, research: 1, hunters: 1, points: 1 },
    hard: { bill: 1e23, research: 1.25, hunters: 1.25, points: 1.6 },
    brutal: { bill: 1e24, research: 1.3, hunters: 1.5, points: 2.4 },
  } satisfies Record<Difficulty, { bill: number; research: number; hunters: number; points: number }>,

  meta: {
    /** Points for a run: (base + perProgress × billProgress) × difficulty, plus a win bonus. */
    base: 4,
    perProgress: 26,
    winBonus: 20,
  },

  /** Catch-up chunking for long background ticks (seconds). */
  maxChunks: 2_000,
} as const;
