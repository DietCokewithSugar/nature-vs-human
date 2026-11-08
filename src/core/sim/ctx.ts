import type { Mods } from '../modifiers.ts';
import { nextRandom } from '../rng.ts';
import type { RunState } from '../state.ts';
import type { CoreEvent } from './events.ts';
import type { World } from './world.ts';

/** What every simulation step works with. */
export interface Ctx {
  run: RunState;
  mods: Mods;
  world: World;
  emit: (e: CoreEvent) => void;
  /** Recompute mods after something that changes them (countermeasure, defection, disaster). */
  refresh: () => void;
}

export function rand(ctx: Ctx): number {
  return nextRandom(ctx.run);
}

/** Normal distribution (Box–Muller) on the run's seeded generator. */
export function normal(ctx: Ctx, mean: number, sd: number): number {
  if (sd <= 0) return mean;
  const u = Math.max(1e-9, rand(ctx));
  const v = rand(ctx);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
