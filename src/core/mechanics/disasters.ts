import { BALANCE } from '../config/balance.ts';
import { CREATURE_BY_ID, CREATURES } from '../config/creatures.ts';
import { DISASTERS } from '../config/disasters.ts';
import { LAIRS } from '../config/lairs.ts';
import { nextRandom } from '../rng.ts';
import type { RunState } from '../state.ts';
import { DISASTER_IDS, type CreatureId, type DisasterId } from '../types.ts';

/** Any disaster but the last one, picked with the run's seed. */
export function rollDisaster(run: RunState): DisasterId {
  const pool = DISASTER_IDS.filter((d) => d !== run.lastDisaster);
  return pool[Math.floor(nextRandom(run) * pool.length)] ?? pool[0]!;
}

/** Seconds between a disaster ending and the next warning. */
export function rollGap(run: RunState): number {
  const [lo, hi] = BALANCE.disasters.gap;
  return lo + (hi - lo) * nextRandom(run);
}

/** Lairs a disaster wrecks: its zone, minus the class that profits; the tornado only takes a share. */
export function rollVictims(run: RunState, id: DisasterId): CreatureId[] {
  const def = DISASTERS[id];
  const out: CreatureId[] = [];
  for (const c of CREATURES) {
    if (LAIRS[c.id].zone !== def.zone || c.cls === def.boost.cls) continue;
    // Roll for every candidate so the sequence does not depend on what happens to be unlocked.
    const hit = nextRandom(run) < def.wreck;
    if (hit && c.era <= run.era) out.push(c.id);
  }
  return out;
}

/** Research the humans lose to a disaster: how hard it hits × how much they built in the zone. */
export function disasterResearchLoss(run: RunState, id: DisasterId): number {
  const def = DISASTERS[id];
  return def.research * (def.exposure[run.era - 1] ?? 0);
}

/** The class a disaster is currently boosting, if one is raging. */
export function disasterBoost(run: RunState): { cls: (typeof CREATURE_BY_ID)[CreatureId]['cls']; x: number } | null {
  const d = run.disaster;
  if (!d || d.phase !== 'active') return null;
  return DISASTERS[d.id].boost;
}
