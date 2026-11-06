import { D, type Decimal } from '../bignum.ts';
import { BALANCE } from '../config/balance.ts';
import type { Mods } from '../modifiers.ts';
import type { GameState } from '../state.ts';

/** Bred units per second, per bought insect. */
export function breedRate(state: GameState, mods: Mods): number {
  if (!mods.breeding) return 0;
  return BALANCE.breeding.ratePerQueen * state.queens * mods.breedMult;
}

export function queenCost(queens: number): Decimal {
  return D(BALANCE.breeding.queenBaseCost).mul(D(BALANCE.breeding.queenCostGrowth).pow(queens));
}
