import { BALANCE } from './config/balance.ts';
import { randomSeed } from './rng.ts';
import type {
  ActiveId,
  BuildingId,
  CreatureId,
  Difficulty,
  DisasterId,
  EraId,
  Side,
  UnitClass,
  UnitId,
  UnitTask,
} from './types.ts';

export const SAVE_VERSION = 4;

export interface Unit {
  id: number;
  kind: UnitId;
  side: Side;
  x: number;
  z: number;
  /** Facing (radians around +y, 0 = +z). */
  dir: number;
  hp: number;
  /** Seconds lived, and seconds it will live. */
  age: number;
  life: number;
  /** The building that made it (0 once that is gone). */
  home: number;
  task: UnitTask;
  /** Target entity (unit or building id), or cell for ground work; -1 for none. */
  target: number;
  /** Where it is heading. */
  tx: number;
  tz: number;
  /** Seconds until the next hit. */
  cd: number;
  /** Seconds since it last dealt or took damage. */
  calm: number;
  /** Seconds until it reconsiders what to do. */
  think: number;
  /** Personal habits, sampled at birth: hour of day it forages and rests. */
  forageAt: number;
  restAt: number;
  /** The day it last foraged and last rested. */
  fedDay: number;
  restDay: number;
  /** Seconds left of the forage or rest it is doing. */
  needLeft: number;
  /** Its last hit was on a meal (wolf on a human, hunter on an animal, ant on a wooden house). */
  feeding: boolean;
  /** Last frame it actually landed a hit (for the scene's attack animation). */
  hitAt: number;
  /** Drawn in by a lamp or a zapper right now. */
  dazed: boolean;
}

export interface Building {
  id: number;
  kind: BuildingId;
  side: Side;
  cell: number;
  x: number;
  z: number;
  hp: number;
  /** 1 … 4. */
  level: number;
  /** Construction progress, 0 … 1. */
  build: number;
  /** Seconds until the next birth. */
  timer: number;
  /** Last time something hit it (scene shake). */
  hitAt: number;
}

export interface Bubble {
  id: number;
  /** Index into NODES. */
  node: number;
  value: number;
  /** Seconds before it fades. */
  left: number;
  /** A pollinator has claimed it. */
  claimed: number;
}

export interface Countermeasure {
  cls: UnitClass;
  era: EraId;
  at: number;
}

export interface DisasterState {
  id: DisasterId;
  phase: 'warning' | 'active';
  left: number;
}

export interface TideState {
  clock: number;
  surgeLeft: number;
}

export interface RunStats {
  /** Enemy units killed, and own units lost (in fights, not old age). */
  kills: number;
  lost: number;
  /** Own units that died of old age. */
  aged: number;
  built: number;
  /** Human buildings destroyed, and own buildings lost. */
  razed: number;
  wrecked: number;
  captured: number;
  bubbles: number;
}

export interface RunResult {
  won: boolean;
  time: number;
  points: number;
  /** Nature's share of the open ground at the end, and the best it reached. */
  territory: number;
  best: number;
}

export interface RunState {
  route: import('./types.ts').RouteId;
  difficulty: Difficulty;
  /** 自然之元 in hand, and collected over the run. */
  essence: number;
  earned: number;
  humanEssence: number;
  skills: Record<string, true>;
  era: EraId;
  /** 0 … 4: each whole step is a human era; 4 means the act passes. */
  research: number;
  countermeasures: Countermeasure[];
  taming: Partial<Record<CreatureId, number>>;
  /** Species that defected, with how many went over. */
  defected: Partial<Record<CreatureId, number>>;
  cooldowns: Partial<Record<ActiveId, number>>;
  rampageLeft: number;
  tide: TideState;
  disaster: DisasterState | null;
  nextDisaster: number;
  lastDisaster: DisasterId | null;
  /** Cell control (−100 human … +100 nature) and holder (0 neutral, 1 nature, 2 human). */
  control: number[];
  owner: number[];
  /** Seconds since each cell was last worked by someone. */
  worked: number[];
  units: Unit[];
  buildings: Building[];
  bubbles: Bubble[];
  /** Seconds until each resource point wells up again. */
  nodeTimers: number[];
  nextId: number;
  /** Nature's rally flag. */
  rally: { x: number; z: number } | null;
  humanThink: number;
  /** Best share of the open ground nature has held this run. */
  best: number;
  stats: RunStats;
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
  /** Best territory share ever reached (0 … 1). */
  bestTerritory: number;
  /** 自然之元 collected over all runs. */
  lifetime: number;
  runs: number;
  playTime: number;
}

export interface GameState {
  version: number;
  meta: MetaState;
  run: RunState;
}

export function createMeta(): MetaState {
  return {
    points: 0,
    spent: 0,
    levels: {},
    wins: { normal: 0, hard: 0, brutal: 0 },
    fastest: { normal: null, hard: null, brutal: null },
    bestTerritory: 0,
    lifetime: 0,
    runs: 0,
    playTime: 0,
  };
}

export function emptyStats(): RunStats {
  return { kills: 0, lost: 0, aged: 0, built: 0, razed: 0, wrecked: 0, captured: 0, bubbles: 0 };
}

/**
 * A bare run: no map yet. Game.startRun lays out the cells, presets and timers (see sim/setup.ts).
 */
export function createRun(route: import('./types.ts').RouteId = 'beasts', difficulty: Difficulty = 'normal', seed: number = randomSeed()): RunState {
  return {
    route,
    difficulty,
    essence: BALANCE.economy.natureStart,
    earned: 0,
    humanEssence: BALANCE.economy.humanStart,
    skills: {},
    era: 1,
    research: 0,
    countermeasures: [],
    taming: {},
    defected: {},
    cooldowns: {},
    rampageLeft: 0,
    tide: { clock: 0, surgeLeft: 0 },
    disaster: null,
    nextDisaster: BALANCE.disasters.first,
    lastDisaster: null,
    control: [],
    owner: [],
    worked: [],
    units: [],
    buildings: [],
    bubbles: [],
    nodeTimers: [],
    nextId: 1,
    rally: null,
    humanThink: 1,
    best: 0,
    stats: emptyStats(),
    rng: seed >>> 0,
    clicks: 0,
    time: 0,
    result: null,
  };
}

export function createState(): GameState {
  return { version: SAVE_VERSION, meta: createMeta(), run: createRun() };
}
