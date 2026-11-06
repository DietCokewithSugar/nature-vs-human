import { D, type Decimal } from '../bignum.ts';
import { BALANCE } from '../config/balance.ts';
import type { Mods } from '../modifiers.ts';
import type { RunState } from '../state.ts';

/** Bred swarm units per second, per bought unit. Growth of the growth: a derivative economy. */
export function breedRate(run: RunState, mods: Mods): number {
  if (!mods.breeding) return 0;
  return BALANCE.breeding.ratePerNest * run.nests * mods.breedMult;
}

export function nestCost(nests: number): Decimal {
  return D(BALANCE.breeding.nestBaseCost).mul(D(BALANCE.breeding.nestCostGrowth).pow(Math.max(0, nests - 1)));
}
