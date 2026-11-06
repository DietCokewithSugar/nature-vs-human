import { D, ZERO, type Decimal } from './bignum.ts';
import { BALANCE } from './config/balance.ts';
import { CREATURE_BY_ID, CREATURES } from './config/creatures.ts';
import { breedRate } from './mechanics/breeding.ts';
import { tideMult } from './mechanics/tide.ts';
import type { Mods } from './modifiers.ts';
import type { RunState } from './state.ts';
import type { CreatureId, UnitClass } from './types.ts';

const R = BALANCE.costGrowth;

// ── Costs ──────────────────────────────────────────────────────

/** cost_next = base × r^owned */
export function creatureCost(id: CreatureId, bought: number): Decimal {
  return D(CREATURE_BY_ID[id].baseCost).mul(D(R).pow(bought));
}

/** Total cost of the next n units: base × r^owned × (r^n − 1) / (r − 1). */
export function creatureCostN(id: CreatureId, bought: number, n: number): Decimal {
  if (n <= 0) return ZERO;
  if (n === 1) return creatureCost(id, bought);
  return creatureCost(id, bought).mul(D(R).pow(n).sub(1)).div(R - 1);
}

/** Affordability with a relative epsilon, so 15.000000000000002 ≤ 15 holds. */
export function canAfford(cost: Decimal, money: Decimal): boolean {
  return cost.lte(money.mul(1 + 1e-9));
}

/** Subtract a cost, never dipping below zero from rounding. */
export function pay(money: Decimal, cost: Decimal): Decimal {
  const left = money.sub(cost);
  return left.lt(0) ? ZERO : left;
}

/** max = ⌊log_r( c(r − 1) / (b·r^k) + 1 )⌋ */
export function maxAffordable(id: CreatureId, bought: number, money: Decimal): number {
  const next = creatureCost(id, bought);
  if (!canAfford(next, money)) return 0;
  const x = money.mul(R - 1).div(next).add(1);
  const n = Math.floor(x.log10() / Math.log10(R));
  if (!canAfford(creatureCostN(id, bought, n), money)) return Math.max(0, n - 1);
  if (canAfford(creatureCostN(id, bought, n + 1), money)) return n + 1;
  return Math.max(0, n);
}

// ── Production ─────────────────────────────────────────────────

export function milestonesReached(bought: number): number {
  let n = 0;
  for (const m of BALANCE.milestones) if (bought >= m) n++;
  return n;
}

export function nextMilestone(bought: number): number | null {
  for (const m of BALANCE.milestones) if (bought < m) return m;
  return null;
}

/** Megafauna fade as the humans move on. */
export function obsolescence(run: RunState, id: CreatureId): number {
  const def = CREATURE_BY_ID[id];
  if (!def.ancient || run.era <= def.era) return 1;
  return BALANCE.obsolete ** (run.era - def.era);
}

/** Output of one unit, before tide. */
export function unitProd(run: RunState, mods: Mods, id: CreatureId): Decimal {
  const def = CREATURE_BY_ID[id];
  const c = run.creatures[id];
  let mult =
    BALANCE.milestoneMult ** milestonesReached(c.bought) *
    mods.creatureMult[id] *
    mods.classMult[def.cls] *
    mods.globalMult *
    obsolescence(run, id);
  if (def.cls === 'tank' && run.rampageLeft > 0) mult *= BALANCE.actives.rampage.mult;
  return D(def.baseProd).mul(mult);
}

export function creatureProd(run: RunState, mods: Mods, id: CreatureId): Decimal {
  const c = run.creatures[id];
  const amount = c.bought + c.bred;
  if (amount <= 0) return ZERO;
  let p = unitProd(run, mods, id).mul(amount);
  if (CREATURE_BY_ID[id].cls === 'marine') p = p.mul(tideMult(run.tide, mods));
  return p;
}

export function incomePerSec(run: RunState, mods: Mods): Decimal {
  let total = ZERO;
  for (const c of CREATURES) total = total.add(creatureProd(run, mods, c.id));
  return total;
}

export function classIncome(run: RunState, mods: Mods): Record<UnitClass, Decimal> {
  const out: Record<UnitClass, Decimal> = { assassin: ZERO, swarm: ZERO, hunter: ZERO, tank: ZERO, marine: ZERO };
  for (const c of CREATURES) out[c.cls] = out[c.cls].add(creatureProd(run, mods, c.id));
  return out;
}

export function clickValue(run: RunState, mods: Mods): Decimal {
  const base = D(BALANCE.click.base * mods.clickMult);
  if (mods.clickPct <= 0) return base;
  return base.add(incomePerSec(run, mods).mul(mods.clickPct));
}

/** Bred units per second for one swarm species, for display. */
export function bredPerSec(run: RunState, mods: Mods, id: CreatureId): number {
  if (CREATURE_BY_ID[id].cls !== 'swarm') return 0;
  return run.creatures[id].bought * breedRate(run, mods);
}

// ── Meta ───────────────────────────────────────────────────────

/** Points earned at the end of a run. */
export function runPoints(progress: number, won: boolean, difficultyPoints: number): number {
  const M = BALANCE.meta;
  return Math.round((M.base + M.perProgress * progress + (won ? M.winBonus : 0)) * difficultyPoints);
}
