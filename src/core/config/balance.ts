/**
 * Global tuning knobs. Every number the economy depends on lives in config/,
 * so balancing never requires touching the formulas in economy.ts.
 *
 * References (see docs/balance.md):
 * - cost growth 1.15 per unit: Cookie Clicker buildings
 * - x2 at owned thresholds: AdVenture Capitalist milestones
 * - cube-root prestige currency: Cookie Clicker heavenly chips
 * - softcapped prestige bonus: Antimatter Dimensions softcaps
 */
export const BALANCE = {
  costGrowth: 1.15,
  /** Owned counts at which a creature's output doubles. */
  milestones: [10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500],
  milestoneMult: 2,

  click: {
    base: 1,
  },

  breeding: {
    /** Bred units per second, per bought insect, per queen. */
    ratePerQueen: 0.0002,
    queenBaseCost: 2_000,
    queenCostGrowth: 6,
  },

  tide: {
    /** Seconds for one full low → high → low cycle. */
    period: 120,
    /** Ocean output is multiplied by 1 + amp * level, level ∈ [0, 1]. */
    baseAmp: 1,
    surgeMult: 2,
    surgeDuration: 30,
    surgeCooldown: 180,
  },

  genes: {
    /** Lifetime damage needed for the first gene; genes = cbrt(lifetime / base). */
    base: 1e10,
    /** Production bonus per gene. */
    power: 0.05,
    /** Genes beyond this count are worth less: effective = cap × (genes / cap)^softcapExp. */
    softcap: 1_000,
    softcapExp: 0.5,
  },

  /** Simulation chunking for long catch-up ticks (seconds). */
  maxChunk: 30,
  maxChunks: 2_000,
} as const;
