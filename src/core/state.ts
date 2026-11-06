import { D, ZERO, type Decimal } from './bignum.ts';
import { CREATURE_IDS } from './config/creatures.ts';
import type { CreatureId, EraId } from './types.ts';

export const SAVE_VERSION = 1;

export interface CreatureState {
  /** Units bought with money. Drives cost and milestones. */
  bought: number;
  /** Units produced by breeding. Adds output, never cost. */
  bred: number;
}

export interface TideState {
  /** Seconds since the tide clock started. */
  clock: number;
  /** Seconds of surge left. */
  surgeLeft: number;
  /** Seconds until surge can fire again. */
  cooldownLeft: number;
}

export interface GameState {
  version: number;
  money: Decimal;
  runEarned: Decimal;
  lifetimeEarned: Decimal;
  creatures: Record<CreatureId, CreatureState>;
  upgrades: Record<string, true>;
  queens: number;
  tide: TideState;
  /** Highest era unlocked in the current run. */
  era: EraId;
  /** Highest era ever unlocked. */
  bestEra: EraId;
  genes: number;
  genesSpent: number;
  geneLevels: Record<string, number>;
  autobuy: Record<EraId, boolean>;
  evolutions: number;
  clicks: number;
  /** Seconds of in-game time, across runs. */
  playTime: number;
  /** Seconds of in-game time in the current run. */
  runTime: number;
  /** playTime when era 4 was first unlocked. */
  dinoAt: number | null;
  /** playTime when the ending was reached. */
  endedAt: number | null;
  /** Best run earned (log10), for stats. */
  bestRunLog10: number;
}

export function emptyCreatures(): Record<CreatureId, CreatureState> {
  return Object.fromEntries(CREATURE_IDS.map((id) => [id, { bought: 0, bred: 0 }])) as Record<
    CreatureId,
    CreatureState
  >;
}

export function createState(): GameState {
  return {
    version: SAVE_VERSION,
    money: ZERO,
    runEarned: ZERO,
    lifetimeEarned: ZERO,
    creatures: emptyCreatures(),
    upgrades: {},
    queens: 0,
    tide: { clock: 0, surgeLeft: 0, cooldownLeft: 0 },
    era: 1,
    bestEra: 1,
    genes: 0,
    genesSpent: 0,
    geneLevels: {},
    autobuy: { 1: true, 2: true, 3: true, 4: true },
    evolutions: 0,
    clicks: 0,
    playTime: 0,
    runTime: 0,
    dinoAt: null,
    endedAt: null,
    bestRunLog10: Number.NEGATIVE_INFINITY,
  };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    money: D(s.money),
    runEarned: D(s.runEarned),
    lifetimeEarned: D(s.lifetimeEarned),
    creatures: Object.fromEntries(
      Object.entries(s.creatures).map(([k, v]) => [k, { ...v }]),
    ) as Record<CreatureId, CreatureState>,
    upgrades: { ...s.upgrades },
    tide: { ...s.tide },
    geneLevels: { ...s.geneLevels },
    autobuy: { ...s.autobuy },
  };
}
