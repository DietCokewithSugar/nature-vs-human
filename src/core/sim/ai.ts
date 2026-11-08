import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import { FIELD_X1, PADS, segmentAt } from '../map/layout.ts';
import type { RunState } from '../state.ts';
import type { HumanBuildingId, Lane } from '../types.ts';
import { addBuilding, buildingOnPad, padUser, rand, type Ctx } from './ctx.ts';
import { humanFood } from './economy.ts';

/** The buildings the humans start each stage with, besides the lodge. Home pads only. */
export function humanOpening(stage: number): { kind: HumanBuildingId; lane: Lane }[] {
  const list: { kind: HumanBuildingId; lane: Lane }[] = [{ kind: 'rack', lane: 1 }];
  if (stage >= 2) list.push({ kind: 'spearcamp', lane: 1 }, { kind: 'javelincamp', lane: 0 });
  if (stage >= 3) list.push({ kind: 'tower', lane: 1 }, { kind: 'spearcamp', lane: 2 });
  if (stage >= 4) list.push({ kind: 'firepit', lane: 0 }, { kind: 'rack', lane: 0 });
  if (stage >= 5) list.push({ kind: 'tower', lane: 0 }, { kind: 'tower', lane: 2 });
  if (stage >= 6) list.push({ kind: 'javelincamp', lane: 2 }, { kind: 'firepit', lane: 1 });
  return list;
}

export function humanCost(run: RunState, kind: HumanBuildingId): number {
  const def = BUILDINGS[kind];
  const n = run.buildings.filter((b) => b.side === 'human' && b.kind === kind).length;
  return Math.ceil(def.cost * Math.pow(def.costGrowth, n));
}

/** Free pads the humans may build on, on a lane (or any lane), front-most first or back-most first. */
export function freeHumanPads(run: RunState, lane: Lane | null, front: boolean): number[] {
  const ids = PADS.filter((p) => (lane === null || p.lane === lane) && padUser(run, p.id) === 'human' && !buildingOnPad(run, p.id)).map((p) => p.id);
  // Humans march left: smaller x is further forward.
  ids.sort((a, b) => (front ? PADS[a]!.x - PADS[b]!.x : PADS[b]!.x - PADS[a]!.x));
  return ids;
}

/** How hard nature is pressing each lane: health of nature units in the humans' half and home. */
function pressure(run: RunState): number[] {
  const p = [0, 0, 0];
  for (const u of run.units) {
    if (u.side !== 'nature') continue;
    const s = segmentAt(u.x);
    const deep = u.x >= FIELD_X1 || s >= 4;
    if (deep) p[u.lane]! += u.hp;
  }
  return p;
}

/** Which of the humans' camps answers what nature is fielding. */
function counterNeed(run: RunState): Record<'spearcamp' | 'javelincamp' | 'firepit', number> {
  const need = { spearcamp: 0, javelincamp: 0, firepit: 0 };
  for (const u of run.units) {
    if (u.side !== 'nature') continue;
    const tags = UNITS[u.kind].tags;
    const w = u.maxHp;
    if (tags.includes('swarm')) need.firepit += w;
    if (tags.includes('beast')) need.spearcamp += w;
    if (tags.includes('big')) need.javelincamp += w;
  }
  return need;
}

/**
 * The humans think every few seconds: feed the camp, answer pressure with towers, answer
 * nature's army with the camp that counters it, and creep forward onto held ground.
 */
export function stepHumans(ctx: Ctx, dt: number): void {
  const run = ctx.run;
  const h = run.human;
  if (run.wonAt !== null) return;
  h.think -= dt;
  if (h.think > 0) return;
  h.think = BALANCE.human.think * (0.8 + rand(ctx) * 0.4);

  const count = (k: HumanBuildingId) => run.buildings.filter((b) => b.side === 'human' && b.kind === k).length;
  const tryBuild = (kind: HumanBuildingId, lane: Lane | null, front: boolean): boolean => {
    const cost = humanCost(run, kind);
    if (h.supplies < cost) return false;
    const pads = freeHumanPads(run, lane, front);
    const pad = pads[0];
    if (pad === undefined) return false;
    h.supplies -= cost;
    const b = addBuilding(ctx, kind, pad, false);
    ctx.emit({ type: 'placed', id: b.id, kind, side: 'human', pad });
    return true;
  };

  // 1. Food: keep a margin for the next few births.
  const food = humanFood(run);
  if (food.supply - food.demand < 2.5 && count('rack') < BALANCE.human.racks + run.stage) {
    if (tryBuild('rack', null, false)) return;
    if (h.supplies < humanCost(run, 'rack')) return;
  }

  // 2. Towers where nature presses hardest.
  const p = pressure(run);
  let worst = 0;
  for (const l of [1, 2] as Lane[]) if (p[l]! > p[worst]!) worst = l;
  if (p[worst]! > 250 + 60 * run.stage) {
    const towersHere = run.buildings.filter((b) => b.kind === 'tower' && PADS[b.pad]?.lane === worst).length;
    if (towersHere < 2 && tryBuild('tower', worst as Lane, true)) return;
  }

  // 3. The camp that counters nature's army, on the lane under most pressure (or a random one).
  const need = counterNeed(run);
  const camps = ['spearcamp', 'javelincamp', 'firepit'] as const;
  let pick: (typeof camps)[number] = 'spearcamp';
  let bestScore = -Infinity;
  for (const k of camps) {
    const score = need[k] / 400 - count(k) + rand(ctx) * 0.6;
    if (score > bestScore) {
      bestScore = score;
      pick = k;
    }
  }
  // The camp grows with the stage: a small camp can't field a big army.
  const camps_ = run.buildings.filter((b) => b.side === 'human' && BUILDINGS[b.kind].makes && b.pad >= 0).length;
  if (camps_ >= BALANCE.human.campsBase + BALANCE.human.campsPerStage * run.stage) return;
  const lane = (p[worst]! > 0 ? worst : Math.floor(rand(ctx) * 3)) as Lane;
  // Forward pads on held ground now and then; home pads otherwise.
  const front = rand(ctx) < 0.35;
  if (tryBuild(pick, lane, front)) return;
  tryBuild(pick, null, false);
}
