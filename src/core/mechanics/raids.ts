import { BALANCE } from '../config/balance.ts';
import { CREATURES } from '../config/creatures.ts';
import { LAIRS, ZONES } from '../config/lairs.ts';
import { creatureProd } from '../economy.ts';
import type { Mods } from '../modifiers.ts';
import type { RunState } from '../state.ts';
import type { CreatureId } from '../types.ts';
import { researchRate } from './humans.ts';

/** Raid meter per second: raids come as fast as the research does. */
export function raidRate(run: RunState, mods: Mods): number {
  return researchRate(run, mods) * BALANCE.raids.perResearch;
}

/** Seconds a party takes to reach a lair. Lairs behind water are further away. */
export function marchTime(id: CreatureId): number {
  return BALANCE.raids.march * ZONES[LAIRS[id].zone].distance;
}

/** Humans go after the intact lair that earns you the most. */
export function raidTarget(run: RunState, mods: Mods): CreatureId | null {
  let best: CreatureId | null = null;
  let bestProd = 0;
  for (const def of CREATURES) {
    if ((run.lairs[def.id] ?? 0) > 0 || run.defected[def.id] !== undefined) continue;
    const prod = creatureProd(run, mods, def.id).toNumber();
    if (prod > bestProd) {
      bestProd = prod;
      best = def.id;
    }
  }
  return best;
}

/** Share of output a species keeps while its lair is wrecked (applied in computeMods). */
export function lairKeep(mods: Mods): number {
  return Math.max(0, 1 - BALANCE.lairs.loss * mods.lairLossMult);
}

export function regrowTime(mods: Mods): number {
  return BALANCE.lairs.regrow * mods.lairRegrowMult;
}
