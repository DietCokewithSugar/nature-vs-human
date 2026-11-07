import { ZERO, type Decimal } from './bignum.ts';
import { BALANCE } from './config/balance.ts';
import { CREATURE_IDS } from './config/creatures.ts';
import { randomSeed } from './rng.ts';
import type { ActiveId, CreatureId, Difficulty, DisasterId, EraId, RouteId, UnitClass } from './types.ts';

export const SAVE_VERSION = 3;

export interface CreatureState {
  /** Units bought with money. Drives cost and milestones. */
  bought: number;
  /** Free units (bred or converted). Add output, never cost. */
  bred: number;
}

export interface TideState {
  clock: number;
  surgeLeft: number;
}

export interface Countermeasure {
  cls: UnitClass;
  era: EraId;
  /** Run time when it landed. */
  at: number;
}

/** A human party marching to wreck a lair. */
export interface RaidState {
  target: CreatureId;
  /** Seconds until it arrives. */
  left: number;
  /** Seconds the whole march takes. */
  total: number;
}

export interface DisasterState {
  id: DisasterId;
  phase: 'warning' | 'active';
  /** Seconds left in this phase. */
  left: number;
  /** Lairs it wrecked when it hit (empty during the warning). */
  wrecked: CreatureId[];
}

export interface RunResult {
  won: boolean;
  time: number;
  points: number;
  earnedLog10: number;
}

export interface RunState {
  route: RouteId;
  difficulty: Difficulty;
  money: Decimal;
  earned: Decimal;
  creatures: Record<CreatureId, CreatureState>;
  upgrades: Record<string, true>;
  skills: Record<string, true>;
  /** Breeding nests for the swarm class. */
  nests: number;
  tide: TideState;
  era: EraId;
  /** Human research meter, 0..1. Reaching 1 loses the run. */
  research: number;
  countermeasures: Countermeasure[];
  /** Taming progress per tameable species, 0..1. */
  taming: Partial<Record<CreatureId, number>>;
  /** Species that defected, with how many units went over. */
  defected: Partial<Record<CreatureId, number>>;
  cooldowns: Partial<Record<ActiveId, number>>;
  rampageLeft: number;
  /** Wrecked lairs: seconds until each grows back. */
  lairs: Partial<Record<CreatureId, number>>;
  /** Fills with research; a raid sets out when it reaches 1. */
  raidMeter: number;
  raid: RaidState | null;
  disaster: DisasterState | null;
  /** Seconds until the next disaster warning (counts down from BALANCE.disasters.fromEra). */
  nextDisaster: number;
  lastDisaster: DisasterId | null;
  /** Seeded random state for disasters. */
  rng: number;
  clicks: number;
  /** Seconds of play in this run. */
  time: number;
  result: RunResult | null;
}

export interface MetaState {
  points: number;
  spent: number;
  levels: Record<string, number>;
  wins: Record<Difficulty, number>;
  /** Fastest win per difficulty, seconds. */
  fastest: Record<Difficulty, number | null>;
  lifetime: Decimal;
  bestRunLog10: number;
  runs: number;
  playTime: number;
}

export interface GameState {
  version: number;
  meta: MetaState;
  run: RunState;
}

export function emptyCreatures(): Record<CreatureId, CreatureState> {
  return Object.fromEntries(CREATURE_IDS.map((id) => [id, { bought: 0, bred: 0 }])) as Record<
    CreatureId,
    CreatureState
  >;
}

export function createMeta(): MetaState {
  return {
    points: 0,
    spent: 0,
    levels: {},
    wins: { normal: 0, hard: 0, brutal: 0 },
    fastest: { normal: null, hard: null, brutal: null },
    lifetime: ZERO,
    bestRunLog10: 0,
    runs: 0,
    playTime: 0,
  };
}

export function createRun(route: RouteId = 'beasts', difficulty: Difficulty = 'normal', seed: number = randomSeed()): RunState {
  return {
    route,
    difficulty,
    money: ZERO,
    earned: ZERO,
    creatures: emptyCreatures(),
    upgrades: {},
    skills: {},
    nests: 0,
    tide: { clock: 0, surgeLeft: 0 },
    era: 1,
    research: 0,
    countermeasures: [],
    taming: {},
    defected: {},
    cooldowns: {},
    rampageLeft: 0,
    lairs: {},
    raidMeter: 0,
    raid: null,
    disaster: null,
    nextDisaster: BALANCE.disasters.first,
    lastDisaster: null,
    rng: seed >>> 0,
    clicks: 0,
    time: 0,
    result: null,
  };
}

export function createState(): GameState {
  return { version: SAVE_VERSION, meta: createMeta(), run: createRun() };
}
