import { BALANCE } from '../config/balance.ts';
import { CREATURES } from '../config/creatures.ts';
import type { Mods } from '../modifiers.ts';
import type { RunState } from '../state.ts';
import type { CreatureId } from '../types.ts';

/** Share of the bill already collected, on a log scale (0..1). */
export function billProgress(run: RunState): number {
  const bill = BALANCE.difficulty[run.difficulty].bill;
  if (run.earned.lte(0)) return 0;
  return Math.max(0, Math.min(1, run.earned.add(1).log10() / Math.log10(bill)));
}

/** Research meter per second: rises with your progress and with the humans' era. */
export function researchRate(run: RunState, mods: Mods): number {
  const R = BALANCE.research;
  const diff = BALANCE.difficulty[run.difficulty].research;
  const era = R.eraMult[run.era - 1] ?? 1;
  return R.base * diff * era * (R.progressFloor + R.progressWeight * billProgress(run)) * mods.researchMult;
}

export const TAMEABLE: readonly CreatureId[] = CREATURES.filter((c) => c.tame).map((c) => c.id);

/** How much the hunters see of a species: more units, more targets. */
export function exposure(amount: number): number {
  if (amount <= 0) return 0;
  return Math.min(1, Math.log10(amount + 1) / Math.log10(BALANCE.domestication.fullExposure + 1));
}

/** Taming meter per second for one species. */
export function tamingRate(run: RunState, mods: Mods, id: CreatureId): number {
  if (run.defected[id] !== undefined) return 0;
  const c = run.creatures[id];
  const ex = exposure(c.bought + c.bred);
  if (ex <= 0) return 0;
  const D = BALANCE.domestication;
  const era = D.eraMult[run.era - 1] ?? 1;
  const hunters = BALANCE.difficulty[run.difficulty].hunters * (mods.dogs ? 1 + D.dogBoost : 1);
  return D.base * era * hunters * mods.domesticationMult * ex;
}

/** Seconds until a species defects at the current pace, or Infinity. */
export function tamingEta(run: RunState, mods: Mods, id: CreatureId): number {
  const rate = tamingRate(run, mods, id);
  if (rate <= 0) return Number.POSITIVE_INFINITY;
  return (1 - (run.taming[id] ?? 0)) / rate;
}
