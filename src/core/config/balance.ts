import type { Difficulty } from '../types.ts';

/**
 * Global tuning knobs. Every number the simulation depends on lives in config/.
 * See docs/balance.md for how they play out in bot runs (npm run report).
 */
export const BALANCE = {
  /** Seconds in one game day, and the hour a run starts at. */
  day: 240,
  startHour: 6,
  /** Simulation step (seconds) and the most a single advance() may catch up. */
  step: 0.1,
  maxCatchUp: 120,

  territory: {
    /** Control runs from −100 (human) to +100 (nature); a cell changes hands past ±flip. */
    flip: 50,
    max: 100,
    /** Points per second a held cell drifts back to its holder while nobody works it. */
    recover: 0.8,
    /** Seconds after the last work before a cell starts drifting back. */
    recoverDelay: 6,
    /** Dense forest and dunes resist being taken. */
    neutralResist: 0.5,
    /** A finished building claims its own cell this fast. */
    buildingClaim: 8,
    /** Nature units foraging on neutral ground slowly make it theirs. */
    forageClaim: 0.8,
    /** How hard each side's units work the ground, on top of their own convert rate. */
    work: { nature: 0.8, human: 1 },
    /** Wild ground fights back against clearing; machines get better at it each era. */
    wildResist: 0.7,
    humanWorkByEra: [0.8, 1, 1.15, 1.3],
    /** Share of the open, holdable ground nature must hold in the modern era to win. */
    winShare: 0.65,
  },

  economy: {
    natureStart: 160,
    humanStart: 100,
    /** 自然之元 per second for every cell held. */
    naturePerCell: 0.05,
    humanPerCell: 0.006,
    /** The humans' trade and taxes, whatever ground they hold, by era. */
    humanBase: [1.2, 1.8, 2.6, 3.4],
    /** Humans draw this from each resource point they hold. */
    humanPerNode: 0.15,
    /** The humans dig in as they lose ground: income × (1 + weight × (nature's share − from)). */
    panicFrom: 0.15,
    panicWeight: 1.5,
    /** Grazing pigs, and planes in the air. */
    pigIncome: 0.12,
    planeIncome: 0.5,
    /** Each further building of a kind costs this much more. */
    costGrowth: 1.22,
    bubble: {
      /** Value of one bubble by era. */
      value: [5, 7, 10, 14],
      /** Seconds before an uncollected bubble fades. */
      life: 14,
      /** Seconds between bubbles at one resource point. */
      gap: [16, 26],
    },
  },

  caps: {
    /** Building slots: base + one per this many cells held. */
    natureBase: 3,
    naturePerCells: 7,
    humanBase: 8,
    humanPerCells: 14,
    /** Living units per side, for the phone's sake. */
    naturePop: 140,
    humanPop: 110,
  },

  build: {
    /** Seconds to build at full speed: base + cost / perCost. */
    base: 6,
    perCost: 25,
    /** Speed on neutral ground and (with a skill) on enemy ground. */
    wild: 0.2,
    enemy: 0.35,
  },

  units: {
    /** Seconds out of combat before wounds start to close. */
    regenDelay: 6,
    /** Share of max HP healed per second: out of combat, resting, foraging. */
    regen: 0.012,
    restRegen: 0.05,
    forageRegen: 0.035,
    /** Share of damage healed back when the target is a meal. */
    lifesteal: 0.5,
    /** Lifespans vary ±this share between individuals. */
    lifeJitter: 0.15,
    /** Day-to-day wobble of habits (hours). */
    habitJitter: 0.5,
    /** A unit in a fight keeps going this many seconds before it can be pulled off by a need. */
    combatGrace: 3,
  },

  research: {
    /** Research runs 0 → 4: each whole step is a new human era; 4 means the act passes. */
    base: 0.00095,
    /** Per level of each standing lab. */
    perLab: 0.00048,
    /** Per living shaman, scholar or researcher. */
    perScholar: 0.00012,
    /** Each step costs this much more than the one before. */
    eraCost: [1, 1.3, 1.6, 1.9],
    /**
     * The more ground nature holds, the harder the humans work on it (Plague Inc.'s cure):
     * research × (floor + weight × nature's share).
     */
    pressureFloor: 0.5,
    pressureWeight: 1.3,
    /** Nature already past the win share before the modern era: the humans rush their research. */
    rush: 4,
    /** Countermeasures land half way through each step. */
    countermeasureAt: 0.5,
    /** Attack a targeted class loses, before resistance. */
    countermeasure: 0.4,
  },

  domestication: {
    /** Taming meter per animal captured, and per one killed by hunters. */
    capture: 0.08,
    kill: 0.025,
  },

  actives: {
    rescue: { cooldown: 90, amount: 0.35 },
    rampage: { cooldown: 150, duration: 20, mult: 3 },
    sabotage: { cooldown: 200, amount: 0.12 },
  },

  tide: {
    period: 120,
    baseAmp: 0.6,
    surgeMult: 2,
    surgeDuration: 30,
    surgeCooldown: 180,
  },

  disasters: {
    /** Disasters start in this era; the ice age stays quiet. */
    fromEra: 2,
    /** Seconds from the first eligible moment to the first warning. */
    first: 150,
    gap: [300, 480],
    /** Share of max HP lost per second by whatever stands in the zone (the boosted class is spared). */
    damage: 0.035,
  },

  ai: {
    /** Seconds between the humans' decisions. */
    think: 3,
    /** The share of income the humans spend on upgrades rather than new buildings. */
    upgradeShare: 0.3,
  },

  difficulty: {
    normal: { income: 1, research: 1, hp: 1, points: 1 },
    hard: { income: 1.4, research: 1.3, hp: 1.2, points: 1.6 },
    brutal: { income: 1.7, research: 1.5, hp: 1.35, points: 2.4 },
  } satisfies Record<Difficulty, { income: number; research: number; hp: number; points: number }>,

  meta: {
    /** Points for a run: (base + perProgress × progress) × difficulty, plus a win bonus. */
    base: 4,
    perProgress: 26,
    winBonus: 20,
  },
} as const;

export const HOUR = BALANCE.day / 24;
