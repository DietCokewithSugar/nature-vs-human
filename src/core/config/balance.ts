import type { LevelId } from '../types.ts';

/**
 * Global tuning knobs. Every number the simulation depends on lives in config/.
 * See docs/balance.md for how they play out in bot runs (npm run report).
 */
export const BALANCE = {
  /** Simulation step (seconds) and the most a single advance() may catch up. */
  step: 0.1,
  maxCatchUp: 60,

  /** How often a unit looks for a new target, seconds. */
  retarget: 0.3,
  /** How far units look for enemies, px (a cell is 32). */
  aggro: 72,
  /** Seconds a unit must go without fighting before a charge is ready again. */
  quiet: 3,

  territory: {
    /** Control runs −100 (human) … +100 (nature); past ±flip the cell changes hands. */
    flip: 50,
    max: 100,
    /** A cell with a building of one side can't be pushed past neutral by the other. */
    holdBuffer: 49,
    /** A building pulls its own cell back to its side this fast (per second) while no enemy stands on it. */
    buildingPull: 20,
    /** Each new stage the humans retake this many cells round the capital (radius, in cells). */
    capitalRadius: 2.5,
  },

  vision: {
    /** Sight in cells: nature's buildings, its main building, and the ground it holds. */
    building: 3,
    main: 5,
    ground: 1,
  },

  /** How nature's army picks where to go when there's nothing to fight. */
  march: {
    /** How far around itself a unit looks for ground to take, in cells. */
    scan: 9,
    /** Weight of being closer to the humans' capital (per cell of walking distance). */
    capitalPull: 0.9,
    /** Penalty per unit already heading for the same cell. */
    crowd: 0.9,
    /** Bonus for a cell with a human building nature has seen. */
    building: 4,
    /** Seconds between reconsidering the goal. */
    rethink: 3,
    /** Humans this close to one of nature's buildings (cells) are a threat; units this close to a threat (cells) come to help. */
    threatRange: 4,
    defendRange: 16,
  },

  flags: {
    /** Rally flags at most; a new one replaces the oldest. */
    max: 3,
    /** Units within this many cells of their flag take ground round it. */
    radius: 4,
  },

  nature: {
    start: 200,
    /** 生机 per second for each cell held, and for each resource site held. */
    perCell: 0.02,
    site: 0.8,
    /** Food stock buffer: this many seconds of production, at least `minStock`. */
    stockSeconds: 20,
    minStock: 10,
    /** Starving units lose this share of max health per second (scaled by how short food is). */
    starve: 0.04,
  },

  human: {
    start: 40,
    startPerStage: 60,
    perCell: 0.004,
    site: 0.8,
    /** Supplies a gatherer brings in per second while working the front. */
    gather: 0.2,
    /** Lodge income grows each stage. */
    incomePerStage: 0.75,
    /** Drying racks the AI keeps at most: base + one per stage. */
    racks: 0,
    /** The humans improve their tools every `researchPeriod` seconds: +1 level to every unit. */
    researchPeriod: 70,
    /** Every stage starts the humans this many levels higher. */
    levelsPerStage: 1.5,
    /** Main building health grows with the stage, ×growth per stage. */
    mainHpGrowth: 1.3,
    /** The AI thinks this often, seconds. */
    think: 2.5,
    /** Army camps the humans may keep: base + per stage. */
    campsBase: 0,
    campsPerStage: 1,
    /** Soldiers gather at home until there are waveBase + wavePerStage × stage of them, then attack together;
     * they fall back to regroup when fewer than `regroup` are left. */
    waveBase: 6,
    wavePerStage: 2,
    regroup: 2,
    /** No wave goes out in the first seconds of a stage: nature gets to settle in. */
    firstWave: 150,
  },

  /** Power per level: health and attack ×(1 + per)^(level − 1), for both sides. */
  levelPower: 0.15,

  /** Price of the first level-up of each thing nature levels, and the growth per level. */
  levelCost: {
    mothertree: 150,
    meadow: 80,
    ancient: 90,
    ant: 30,
    elk: 60,
    mammoth: 150,
    wolf: 80,
    sabertooth: 120,
    bear: 140,
  } satisfies Record<LevelId, number>,
  levelCostGrowth: 1.55,
  /** Per level: the mother tree's income +, the meadows' grass ×, the ancient trees' damage ×. */
  motherIncomePerLevel: 1.5,
  meadowPerLevel: 0.25,
  /** Mother tree health per level, ×. */
  motherHpPerLevel: 0.2,

  stage: {
    /** 生机 for winning a stage: base + per stage. */
    reward: 100,
    rewardPerStage: 80,
    /** Seconds between the lodge falling and the pick (the victory moment). */
    pickDelay: 2.5,
  },

  /** Genes for a run: per stage cleared (stage n pays base + n), plus the share of the current stage's lodge torn down. */
  genes: { base: 2 },

  picks: {
    /** Cards offered, and the extra weight for picks about species you're raising. */
    offer: 3,
    relevantWeight: 3,
  },
} as const;
