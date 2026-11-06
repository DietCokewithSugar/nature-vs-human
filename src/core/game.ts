import { D, ZERO, type Decimal } from './bignum.ts';
import { BALANCE } from './config/balance.ts';
import { CREATURES, CREATURE_BY_ID } from './config/creatures.ts';
import { GENE_BY_ID } from './config/genes.ts';
import { UPGRADE_BY_ID } from './config/upgrades.ts';
import {
  canAfford,
  clickValue,
  creatureCost,
  creatureCostN,
  genesOnEvolve,
  incomePerSec,
  maxAffordable,
  milestonesReached,
  pay,
  unitProd,
  upgradeCost,
} from './economy.ts';
import { breedRate, queenCost } from './mechanics/breeding.ts';
import { advanceTide, startSurge, tideIntegral } from './mechanics/tide.ts';
import { computeMods, type Mods } from './modifiers.ts';
import { availableUpgrades, geneLevel, geneUnlocked, genesFree, isCreatureUnlocked, meets } from './progression.ts';
import { createState, emptyCreatures, type GameState } from './state.ts';
import type { CreatureId, EraId } from './types.ts';

export type CoreEvent =
  | { type: 'creatureBought'; id: CreatureId; count: number; total: number }
  | { type: 'milestone'; id: CreatureId; owned: number }
  | { type: 'upgradeBought'; id: string }
  | { type: 'eraUnlocked'; era: EraId; first: boolean }
  | { type: 'queenBought'; queens: number }
  | { type: 'surge' }
  | { type: 'click'; gain: Decimal }
  | { type: 'evolved'; gained: number; evolutions: number }
  | { type: 'geneBought'; id: string; level: number }
  | { type: 'ending' }
  | { type: 'reset' };

/** A fixed count, or as many as money allows. */
export type BuyAmount = number | 'max';

/** Upper bound on purchases per autobuy pass, so a long catch-up stays cheap. */
const AUTOBUY_PER_STEP = 40;

/**
 * The logic core. Owns the state, applies commands, advances time.
 * Has no knowledge of the DOM, three.js or storage.
 */
export class Game {
  state: GameState;
  mods: Mods;
  private listeners = new Set<(e: CoreEvent) => void>();

  constructor(state: GameState = createState()) {
    this.state = state;
    this.mods = computeMods(state);
  }

  on(fn: (e: CoreEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: CoreEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  refreshMods(): void {
    this.mods = computeMods(this.state);
  }

  load(state: GameState): void {
    this.state = state;
    this.refreshMods();
    this.emit({ type: 'reset' });
  }

  // ── Time ─────────────────────────────────────────────────────

  /** Advance the simulation by dt seconds. Long dt is split into exact chunks. */
  advance(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const stepSize = dt <= 1 ? dt : Math.max(1, dt / BALANCE.maxChunks);
    let remaining = dt;
    let guard = 0;
    while (remaining > 1e-9 && guard++ < BALANCE.maxChunks * 3 + 10) {
      let h = Math.min(remaining, stepSize);
      const tide = this.state.tide;
      if (this.mods.tide && tide.surgeLeft > 0) h = Math.min(h, tide.surgeLeft);
      this.integrate(h);
      remaining -= h;
      if (this.mods.autoSurge && startSurge(this.state.tide, this.mods)) this.emit({ type: 'surge' });
      this.runAutobuy();
    }
  }

  private integrate(h: number): void {
    const s = this.state;
    const m = this.mods;
    const rate = breedRate(s, m);
    const tideFactor = tideIntegral(s.tide, m, h) / h;
    let gain = ZERO;
    for (const def of CREATURES) {
      const c = s.creatures[def.id];
      const amount = c.bought + c.bred;
      if (amount <= 0) continue;
      let amountIntegral = amount * h;
      if (def.era === 1 && rate > 0 && c.bought > 0) {
        const growth = c.bought * rate;
        amountIntegral += (growth * h * h) / 2;
        c.bred += growth * h;
      }
      let g = unitProd(s, m, def.id).mul(amountIntegral);
      if (def.era === 2) g = g.mul(tideFactor);
      gain = gain.add(g);
    }
    this.addMoney(gain);
    advanceTide(s.tide, h);
    s.playTime += h;
    s.runTime += h;
  }

  private addMoney(gain: Decimal): void {
    const s = this.state;
    s.money = s.money.add(gain);
    s.runEarned = s.runEarned.add(gain);
    s.lifetimeEarned = s.lifetimeEarned.add(gain);
    if (s.runEarned.gt(0)) s.bestRunLog10 = Math.max(s.bestRunLog10, s.runEarned.log10());
  }

  private runAutobuy(): void {
    const s = this.state;
    const m = this.mods;
    let any = false;
    for (const era of [1, 2, 3, 4] as EraId[]) {
      if (m.autobuyUnlocked[era] && s.autobuy[era] && era <= s.era) any = true;
    }
    if (!any) return;
    for (let i = 0; i < AUTOBUY_PER_STEP; i++) {
      let best: CreatureId | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const def of CREATURES) {
        if (!(m.autobuyUnlocked[def.era] && s.autobuy[def.era] && def.era <= s.era)) continue;
        const cost = creatureCost(def.id, s.creatures[def.id].bought);
        if (!canAfford(cost, s.money)) continue;
        const score = cost.div(unitProd(s, m, def.id)).toNumber();
        if (score < bestScore) {
          bestScore = score;
          best = def.id;
        }
      }
      if (!best) return;
      this.buyCreature(best, 1);
    }
  }

  // ── Commands ─────────────────────────────────────────────────

  click(): Decimal {
    const gain = clickValue(this.state, this.mods);
    this.addMoney(gain);
    this.state.clicks++;
    this.emit({ type: 'click', gain });
    return gain;
  }

  /** How many units a buy button would purchase right now (0 if unaffordable). */
  buyCount(id: CreatureId, amount: BuyAmount): number {
    const c = this.state.creatures[id];
    if (amount === 'max') return maxAffordable(id, c.bought, this.state.money);
    return canAfford(creatureCostN(id, c.bought, amount), this.state.money) ? amount : 0;
  }

  buyCreature(id: CreatureId, amount: BuyAmount): number {
    const s = this.state;
    if (!isCreatureUnlocked(s, id)) return 0;
    const n = this.buyCount(id, amount);
    if (n <= 0) return 0;
    const c = s.creatures[id];
    const cost = creatureCostN(id, c.bought, n);
    const before = milestonesReached(c.bought);
    s.money = pay(s.money, cost);
    c.bought += n;
    this.emit({ type: 'creatureBought', id, count: n, total: c.bought });
    if (milestonesReached(c.bought) > before) this.emit({ type: 'milestone', id, owned: c.bought });
    return n;
  }

  queenCost(): Decimal {
    return queenCost(this.state.queens);
  }

  buyQueen(): boolean {
    const s = this.state;
    if (!this.mods.breeding) return false;
    const cost = queenCost(s.queens);
    if (!canAfford(cost, s.money)) return false;
    s.money = pay(s.money, cost);
    s.queens++;
    this.emit({ type: 'queenBought', queens: s.queens });
    return true;
  }

  buyUpgrade(id: string): boolean {
    const s = this.state;
    const def = UPGRADE_BY_ID[id];
    if (!def || s.upgrades[id]) return false;
    if (!def.req.every((r) => meets(s, r))) return false;
    const cost = upgradeCost(def, this.mods);
    if (!canAfford(cost, s.money)) return false;
    s.money = pay(s.money, cost);
    s.upgrades[id] = true;
    for (const e of def.effects) {
      if (e.type === 'unlockEra') this.unlockEra(e.era);
      if (e.type === 'ending' && s.endedAt === null) {
        s.endedAt = s.playTime;
        this.emit({ type: 'ending' });
      }
    }
    if (def.effects.some((e) => e.type === 'unlockBreeding') && s.queens === 0) s.queens = 1;
    this.refreshMods();
    this.emit({ type: 'upgradeBought', id });
    return true;
  }

  private unlockEra(era: EraId): void {
    const s = this.state;
    if (era <= s.era) return;
    s.era = era;
    const first = era > s.bestEra;
    if (first) s.bestEra = era;
    if (era === 4 && s.dinoAt === null) s.dinoAt = s.playTime;
    this.emit({ type: 'eraUnlocked', era, first });
  }

  surge(): boolean {
    const ok = startSurge(this.state.tide, this.mods);
    if (ok) this.emit({ type: 'surge' });
    return ok;
  }

  setAutobuy(era: EraId, on: boolean): void {
    this.state.autobuy[era] = on;
  }

  // ── Evolution ────────────────────────────────────────────────

  genesOnEvolve(): number {
    return genesOnEvolve(this.state);
  }

  evolve(): boolean {
    const s = this.state;
    const gained = genesOnEvolve(s);
    if (gained < 1) return false;
    s.genes += gained;
    s.evolutions++;
    this.resetRun();
    this.emit({ type: 'evolved', gained, evolutions: s.evolutions });
    return true;
  }

  private resetRun(): void {
    const s = this.state;
    s.upgrades = {};
    this.refreshMods();
    const m = this.mods;
    s.money = D(m.startMoney);
    s.runEarned = ZERO;
    s.creatures = emptyCreatures();
    s.queens = m.startQueens;
    s.tide = { clock: 0, surgeLeft: 0, cooldownLeft: 0 };
    s.era = 1;
    s.runTime = 0;
    for (let e = 2; e <= m.startEra; e++) this.unlockEra(e as EraId);
  }

  buyGene(id: string): boolean {
    const s = this.state;
    const def = GENE_BY_ID[id];
    if (!def || !geneUnlocked(s, def)) return false;
    const level = geneLevel(s, id);
    const next = def.levels[level];
    if (!next || next.cost > genesFree(s)) return false;
    s.geneLevels[id] = level + 1;
    s.genesSpent += next.cost;
    const prevQueens = this.mods.startQueens;
    this.refreshMods();
    if (this.mods.startQueens > prevQueens) s.queens = Math.max(s.queens, this.mods.startQueens);
    this.emit({ type: 'geneBought', id, level: level + 1 });
    return true;
  }

  // ── Queries (thin wrappers for the presentation layer) ───────

  income(): Decimal {
    return incomePerSec(this.state, this.mods);
  }

  clickValue(): Decimal {
    return clickValue(this.state, this.mods);
  }

  availableUpgrades() {
    return availableUpgrades(this.state);
  }

  upgradeCost(id: string): Decimal {
    const def = UPGRADE_BY_ID[id];
    return def ? upgradeCost(def, this.mods) : ZERO;
  }

  creatureDef(id: CreatureId) {
    return CREATURE_BY_ID[id];
  }
}
