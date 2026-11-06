import { D, ZERO, type Decimal } from './bignum.ts';
import { BALANCE } from './config/balance.ts';
import { CREATURE_BY_ID, CREATURES } from './config/creatures.ts';
import { breedRate } from './mechanics/breeding.ts';
import { tideMult } from './mechanics/tide.ts';
import type { Mods } from './modifiers.ts';
import type { GameState } from './state.ts';
import type { CreatureId, UpgradeDef } from './types.ts';

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

/** max = ⌊log_r( c(r − 1) / (b·r^k) + 1 )⌋ */
export function maxAffordable(id: CreatureId, bought: number, money: Decimal): number {
  const next = creatureCost(id, bought);
  if (!canAfford(next, money)) return 0;
  const x = money.mul(R - 1).div(next).add(1);
  const n = Math.floor(x.log10() / Math.log10(R));
  // Guard against floating error at the boundary.
  if (!canAfford(creatureCostN(id, bought, n), money)) return Math.max(0, n - 1);
  if (canAfford(creatureCostN(id, bought, n + 1), money)) return n + 1;
  return Math.max(0, n);
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

export function upgradeCost(def: UpgradeDef, mods: Mods): Decimal {
  const base = D(def.cost);
  return def.kind === 'era' ? base.mul(mods.ticketDiscount) : base;
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

/** Output of one unit, before tide. */
export function unitProd(state: GameState, mods: Mods, id: CreatureId): Decimal {
  const def = CREATURE_BY_ID[id];
  const c = state.creatures[id];
  const mult =
    BALANCE.milestoneMult ** milestonesReached(c.bought) *
    mods.creatureMult[id] *
    mods.eraMult[def.era] *
    mods.globalMult *
    mods.geneMult;
  return D(def.baseProd).mul(mult);
}

export function creatureAmount(state: GameState, id: CreatureId): number {
  const c = state.creatures[id];
  return c.bought + c.bred;
}

/** Instantaneous output of all units of one creature. */
export function creatureProd(state: GameState, mods: Mods, id: CreatureId): Decimal {
  const amount = creatureAmount(state, id);
  if (amount <= 0) return ZERO;
  let p = unitProd(state, mods, id).mul(amount);
  if (CREATURE_BY_ID[id].era === 2) p = p.mul(tideMult(state.tide, mods));
  return p;
}

export function incomePerSec(state: GameState, mods: Mods): Decimal {
  let total = ZERO;
  for (const c of CREATURES) total = total.add(creatureProd(state, mods, c.id));
  return total;
}

export function clickValue(state: GameState, mods: Mods): Decimal {
  const base = D(BALANCE.click.base * mods.clickMult);
  if (mods.clickPct <= 0) return base;
  return base.add(incomePerSec(state, mods).mul(mods.clickPct));
}

/** Breeding output per second per insect type, for display. */
export function bredPerSec(state: GameState, mods: Mods, id: CreatureId): number {
  if (CREATURE_BY_ID[id].era !== 1) return 0;
  return state.creatures[id].bought * breedRate(state, mods);
}

// ── Prestige ───────────────────────────────────────────────────

/** Genes after the softcap. Linear up to the cap, then square-root-ish. */
export function effectiveGenes(genes: number): number {
  const { softcap, softcapExp } = BALANCE.genes;
  if (genes <= softcap) return genes;
  return softcap * (genes / softcap) ** softcapExp;
}

/** Total genes a lifetime of damage is worth: ⌊∛(lifetime / base)⌋. */
export function genesForLifetime(lifetime: Decimal): number {
  if (lifetime.lte(0)) return 0;
  const l = lifetime.log10() - Math.log10(BALANCE.genes.base);
  if (l < 0) return 0;
  return Math.floor(10 ** (l / 3) + 1e-9);
}

export function genesOnEvolve(state: GameState): number {
  return Math.max(0, genesForLifetime(state.lifetimeEarned) - state.genes);
}

/** Lifetime damage needed to reach a given total gene count. */
export function lifetimeForGenes(genes: number): Decimal {
  return D(BALANCE.genes.base).mul(D(genes).pow(3));
}
