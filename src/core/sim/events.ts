import type { RunResult } from '../state.ts';
import type { BuildingId, Diet, LevelId, Owner, ProjectileKind, Side, UnitId } from '../types.ts';

export type DeathCause = 'combat' | 'starve' | 'rout' | 'eaten';

/** Things the core tells the shell about: sounds, effects, toasts. */
export type CoreEvent =
  | { type: 'spawn'; id: number; kind: UnitId; side: Side }
  | { type: 'hit'; id: number; x: number; y: number; dmg: number; side: Side; crit: boolean }
  | { type: 'impact'; kind: ProjectileKind; x: number; y: number; side: Side }
  | { type: 'death'; id: number; kind: UnitId; side: Side; x: number; y: number; cause: DeathCause }
  | { type: 'built'; id: number; kind: BuildingId; side: Side }
  | { type: 'placed'; id: number; kind: BuildingId; side: Side; cell: number; x: number; y: number }
  | { type: 'destroyed'; id: number; kind: BuildingId; side: Side; x: number; y: number }
  | { type: 'bounty'; x: number; y: number; amount: number }
  | { type: 'flip'; cell: number; owner: Owner }
  | { type: 'research'; level: number }
  | { type: 'starving'; side: Side; diet: Diet }
  /** A predator caught and ate one of nature's own animals. */
  | { type: 'eaten'; id: number; kind: UnitId; prey: UnitId; x: number; y: number; heal: number }
  /** A predator went hungry: no meal for a long while (no prey of its kind about). */
  | { type: 'noPrey'; kind: UnitId }
  | { type: 'levelUp'; id: LevelId; level: number }
  | { type: 'stageWon'; stage: number; reward: number }
  | { type: 'offer'; offer: string[] }
  | { type: 'picked'; id: string }
  | { type: 'stageStarted'; stage: number; era: number; opened: boolean }
  | { type: 'runEnded'; result: RunResult }
  | { type: 'runStarted' }
  | { type: 'flags' }
  | { type: 'talent'; id: string; level: number };
