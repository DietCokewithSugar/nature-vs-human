import { BALANCE } from './config/balance.ts';
import { TALENT_IDS, type TalentId } from './config/talents.ts';
import { generateMap } from './map/generate.ts';
import { CELLS } from './map/grid.ts';
import { randomSeed } from './rng.ts';
import { LEVEL_IDS, type BuildingId, type Diet, type LevelId, type Phase, type ProjectileKind, type Side, type UnitId } from './types.ts';

export const SAVE_VERSION = 6;

export interface Unit {
  id: number;
  kind: UnitId;
  side: Side;
  x: number;
  y: number;
  /** The building that made it. */
  home: number;
  /** The cell it is heading for (−1: none yet), and when it next reconsiders. */
  goal: number;
  rethink: number;
  /** Where in a cell it likes to stand, px from the centre (so a crowd spreads out). */
  ox: number;
  oy: number;
  hp: number;
  maxHp: number;
  /** Entity id of what it's fighting (unit or building), 0 for none. */
  target: number;
  /** Seconds until the next hit, and until the next look for a target. */
  cd: number;
  look: number;
  /** Run time of its last hit given or taken (charges, regrouping). */
  fought: number;
  /** Run time it last took damage and last struck (for flashes and attack poses). */
  hitAt: number;
  struckAt: number;
  face: 1 | -1;
  /** Short of food: its layer of the food chain ran out, or (predators) no meal for a long while. */
  hungry: boolean;
  /** Predators: run time of the last meal (birth counts), and until when it's full. */
  fedAt: number;
  fullUntil: number;
  /** The prey it's chasing (0: none); while chasing, when it gives up; otherwise when it may look again. */
  hunt: number;
  huntUntil: number;
}

export interface Building {
  id: number;
  kind: BuildingId;
  side: Side;
  /** The cell it stands on (the top-left one of a main building's 2 × 2). */
  cell: number;
  /** Its foot on the map (bottom centre of the footprint, a little in from the edge). */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Construction 0 … 1; it works once it reaches 1. */
  progress: number;
  /** Spawners: seconds towards the next birth. */
  timer: number;
  /** Towers (and main buildings that shoot): seconds until the next shot. */
  shot: number;
  /** Spawners: the food that's holding the next birth back. */
  blocked: Diet | null;
  hitAt: number;
  /** The humans' buildings: nature has seen it, so it shows (greyed) under the fog. */
  seen: boolean;
}

/** A rally flag: nature's army heads for the nearest one and fights round it. */
export interface Flag {
  id: number;
  x: number;
  y: number;
}

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  side: Side;
  x: number;
  y: number;
  /** Where it set out from (for the arc). */
  x0: number;
  y0: number;
  target: number;
  /** Last known target position. */
  tx: number;
  ty: number;
  speed: number;
  /** Who threw it, for counters on impact (a unit kind or a building kind). */
  from: UnitId | BuildingId;
  dmg: number;
  splash: { radius: number; share: number } | null;
}

export interface HumanState {
  supplies: number;
  food: number;
  think: number;
  /** Research levels gained this stage (one every researchPeriod). */
  research: number;
  /** The soldiers are out on an attack (they gather at home until the wave is big enough). */
  attacking: boolean;
}

export interface RunStats {
  kills: number;
  losses: number;
  starved: number;
  /** Nature's animals eaten by its own predators. */
  eaten: number;
  built: number;
  razed: number;
  lost: number;
}

export interface RunResult {
  stage: number;
  cleared: number;
  genes: number;
  cause: 'fell' | 'returned';
}

export interface RunState {
  rng: number;
  phase: Phase;
  stage: number;
  /** Seconds since the run began, and since this stage began. */
  time: number;
  stageTime: number;
  /** Nature's money. */
  essence: number;
  grassStock: number;
  meatStock: number;
  levels: Record<LevelId, number>;
  picks: string[];
  /** The cards on the table during a pick, and rerolls left for it. */
  offer: string[];
  rerolls: number;
  /** Run time the human lodge fell this stage (the pick follows a moment later), or null. */
  wonAt: number | null;
  human: HumanState;
  /** The map is generated from this seed (saves keep only the seed). */
  mapSeed: number;
  /** 0 ice age, 1 ancient, 2 industrial, 3 modern: how many rings of the map are open. */
  era: number;
  /** Control of each cell: −100 human … +100 nature. */
  control: number[];
  /** Cells nature has seen (1) at least once: everything else is black. */
  explored: number[];
  flags: Flag[];
  units: Unit[];
  buildings: Building[];
  projectiles: Projectile[];
  nextId: number;
  stats: RunStats;
  result: RunResult | null;
}

export interface MetaState {
  genes: number;
  talents: Record<TalentId, number>;
  runs: number;
  /** Highest stage ever cleared. */
  bestStage: number;
  lifetimeGenes: number;
  playTime: number;
}

export interface GameState {
  version: number;
  meta: MetaState;
  run: RunState;
}

export function createMeta(): MetaState {
  return {
    genes: 0,
    talents: Object.fromEntries(TALENT_IDS.map((id) => [id, 0])) as Record<TalentId, number>,
    runs: 0,
    bestStage: 0,
    lifetimeGenes: 0,
    playTime: 0,
  };
}

/** Control at the start of a run: the ice-age square as the map lays it out, the rest untouched. */
export function startControl(mapSeed: number): number[] {
  const map = generateMap(mapSeed);
  const max = BALANCE.territory.max;
  const out = new Array<number>(CELLS).fill(0);
  for (let i = 0; i < CELLS; i++) if (map.ring[i] === 0) out[i] = map.owner[i]! * max;
  return out;
}

export function emptyStats(): RunStats {
  return { kills: 0, losses: 0, starved: 0, eaten: 0, built: 0, razed: 0, lost: 0 };
}

/** A blank run; Game.startRun lays out the buildings. */
export function createRun(seed = randomSeed()): RunState {
  return {
    rng: seed >>> 0,
    phase: 'battle',
    stage: 1,
    time: 0,
    stageTime: 0,
    essence: 0,
    grassStock: 0,
    meatStock: 0,
    levels: Object.fromEntries(LEVEL_IDS.map((id) => [id, 1])) as Record<LevelId, number>,
    picks: [],
    offer: [],
    rerolls: 0,
    wonAt: null,
    human: { supplies: 0, food: 0, think: 0, research: 0, attacking: false },
    mapSeed: seed >>> 0,
    era: 0,
    control: startControl(seed >>> 0),
    explored: new Array<number>(CELLS).fill(0),
    flags: [],
    units: [],
    buildings: [],
    projectiles: [],
    nextId: 1,
    stats: emptyStats(),
    result: null,
  };
}

export function createState(): GameState {
  return { version: SAVE_VERSION, meta: createMeta(), run: createRun() };
}
