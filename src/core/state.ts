import { BALANCE } from './config/balance.ts';
import { TALENT_IDS, type TalentId } from './config/talents.ts';
import { SEGMENTS } from './map/layout.ts';
import { randomSeed } from './rng.ts';
import { LEVEL_IDS, type BuildingId, type Diet, type Lane, type LevelId, type Phase, type ProjectileKind, type Side, type UnitId } from './types.ts';

export const SAVE_VERSION = 5;

export interface Unit {
  id: number;
  kind: UnitId;
  side: Side;
  lane: Lane;
  x: number;
  y: number;
  /** Where across the lane this unit likes to walk, px from the centre line. */
  off: number;
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
  hungry: boolean;
}

export interface Building {
  id: number;
  kind: BuildingId;
  side: Side;
  /** Pad index, or −1 for the main building. */
  pad: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Construction 0 … 1; it works once it reaches 1. */
  progress: number;
  /** Spawners: seconds towards the next birth. Towers: seconds until the next shot. */
  timer: number;
  /** Spawners: the food that's holding the next birth back. */
  blocked: Diet | null;
  hitAt: number;
  /** Rotates the main building's births across the lanes. */
  nextLane: Lane;
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
}

export interface RunStats {
  kills: number;
  losses: number;
  starved: number;
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
  /** Control of each stretch, lane by lane: −100 human … +100 nature. */
  segments: number[][];
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

export function startSegments(): number[][] {
  const owned = BALANCE.territory.startOwned;
  return [0, 1, 2].map(() =>
    Array.from({ length: SEGMENTS }, (_, i) => (i < owned ? BALANCE.territory.max : i >= SEGMENTS - owned ? -BALANCE.territory.max : 0)),
  );
}

export function emptyStats(): RunStats {
  return { kills: 0, losses: 0, starved: 0, built: 0, razed: 0, lost: 0 };
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
    human: { supplies: 0, food: 0, think: 0, research: 0 },
    segments: startSegments(),
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
