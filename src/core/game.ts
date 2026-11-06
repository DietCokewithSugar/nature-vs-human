import { D, ZERO, type Decimal } from './bignum.ts';
import { BALANCE } from './config/balance.ts';
import { CREATURE_BY_ID, CREATURES } from './config/creatures.ts';
import { DOMESTICS, countermeasureName } from './config/humans.ts';
import { META_BY_ID, ROUTES } from './config/meta.ts';
import { SKILL_BY_ID } from './config/skills.ts';
import { UPGRADE_BY_ID } from './config/upgrades.ts';
import {
  canAfford,
  classIncome,
  clickValue,
  creatureCostN,
  incomePerSec,
  maxAffordable,
  milestonesReached,
  pay,
  runPoints,
  unitProd,
} from './economy.ts';
import { breedRate, nestCost } from './mechanics/breeding.ts';
import { TAMEABLE, billProgress, researchRate, tamingRate } from './mechanics/humans.ts';
import { advanceTide, tideIntegral } from './mechanics/tide.ts';
import { computeMods, metaMods, type Mods } from './modifiers.ts';
import { availableUpgrades, difficultyUnlocked, isCreatureUnlocked, meets, metaFree, metaLevel, skillStatus } from './progression.ts';
import { createRun, createState, type Countermeasure, type GameState, type RunResult } from './state.ts';
import { CLASS_IDS, type ActiveId, type CreatureId, type Difficulty, type DomesticId, type EraId, type RouteId } from './types.ts';

export type CoreEvent =
  | { type: 'creatureBought'; id: CreatureId; count: number; total: number }
  | { type: 'milestone'; id: CreatureId; owned: number }
  | { type: 'upgradeBought'; id: string }
  | { type: 'skillBought'; id: string }
  | { type: 'eraUnlocked'; era: EraId }
  | { type: 'nestBought'; nests: number }
  | { type: 'active'; id: ActiveId }
  | { type: 'click'; gain: Decimal }
  | { type: 'countermeasure'; cm: Countermeasure; name: string }
  | { type: 'defected'; id: CreatureId; count: number; domestic: DomesticId }
  | { type: 'runEnded'; result: RunResult }
  | { type: 'runStarted' }
  | { type: 'metaBought'; id: string; level: number }
  | { type: 'reset' };

/** A fixed count, or as many as money allows. */
export type BuyAmount = number | 'max';

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

  get run() {
    return this.state.run;
  }

  get meta() {
    return this.state.meta;
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

  get running(): boolean {
    return this.run.result === null;
  }

  // ── Time ─────────────────────────────────────────────────────

  /** Advance by dt seconds. Long dt is split into chunks with exact integrals inside each. */
  advance(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt) || !this.running) return;
    const stepSize = dt <= 1 ? dt : Math.max(1, dt / BALANCE.maxChunks);
    let remaining = dt;
    let guard = 0;
    while (remaining > 1e-9 && this.running && guard++ < BALANCE.maxChunks * 3 + 10) {
      let h = Math.min(remaining, stepSize);
      const run = this.run;
      if (this.mods.tide && run.tide.surgeLeft > 0) h = Math.min(h, run.tide.surgeLeft);
      if (run.rampageLeft > 0) h = Math.min(h, run.rampageLeft);
      this.step(h);
      remaining -= h;
    }
  }

  private step(h: number): void {
    const run = this.run;
    const m = this.mods;
    // Production, with breeding and tide integrated exactly over the step.
    const rate = breedRate(run, m);
    const tideFactor = tideIntegral(run.tide, m, h) / h;
    let gain = ZERO;
    for (const def of CREATURES) {
      const c = run.creatures[def.id];
      const amount = c.bought + c.bred;
      if (amount <= 0) continue;
      let amountIntegral = amount * h;
      if (def.cls === 'swarm' && rate > 0 && c.bought > 0) {
        const growth = c.bought * rate;
        amountIntegral += (growth * h * h) / 2;
        c.bred += growth * h;
      }
      let g = unitProd(run, m, def.id).mul(amountIntegral);
      if (def.cls === 'marine') g = g.mul(tideFactor);
      gain = gain.add(g);
    }
    this.addMoney(gain);
    advanceTide(run.tide, h);
    run.rampageLeft = Math.max(0, run.rampageLeft - h);
    for (const id of Object.keys(run.cooldowns) as ActiveId[]) {
      run.cooldowns[id] = Math.max(0, (run.cooldowns[id] ?? 0) - h);
    }
    run.time += h;
    this.meta.playTime += h;

    // The humans push back.
    this.stepTaming(h);
    run.research = Math.min(1, run.research + researchRate(run, this.mods) * h);
    this.fireCountermeasures();

    if (run.earned.gte(BALANCE.difficulty[run.difficulty].bill)) this.endRun(true);
    else if (run.research >= 1) this.endRun(false);
  }

  private stepTaming(h: number): void {
    const run = this.run;
    for (const id of TAMEABLE) {
      const rate = tamingRate(run, this.mods, id);
      if (rate <= 0) continue;
      const next = (run.taming[id] ?? 0) + rate * h;
      run.taming[id] = Math.min(1, next);
      if (next >= 1) this.defect(id);
    }
  }

  private defect(id: CreatureId): void {
    const run = this.run;
    const c = run.creatures[id];
    const count = Math.round(c.bought + c.bred);
    run.defected[id] = count;
    run.creatures[id] = { bought: 0, bred: 0 };
    delete run.taming[id];
    this.refreshMods();
    const domestic = CREATURE_BY_ID[id].tame!;
    this.emit({ type: 'defected', id, count, domestic });
  }

  private fireCountermeasures(): void {
    const run = this.run;
    const thresholds = BALANCE.research.thresholds;
    while (run.countermeasures.length < thresholds.length && run.research >= thresholds[run.countermeasures.length]!) {
      const income = classIncome(run, this.mods);
      let target = CLASS_IDS[0]!;
      for (const cls of CLASS_IDS) if (income[cls].gt(income[target])) target = cls;
      const cm: Countermeasure = { cls: target, era: run.era, at: run.time };
      run.countermeasures.push(cm);
      this.refreshMods();
      this.emit({ type: 'countermeasure', cm, name: countermeasureName(cm.cls, cm.era) });
    }
  }

  private endRun(won: boolean): void {
    const run = this.run;
    const meta = this.meta;
    const progress = won ? 1 : billProgress(run);
    const diff = BALANCE.difficulty[run.difficulty];
    const points = runPoints(progress, won, diff.points);
    const earnedLog10 = run.earned.gt(0) ? run.earned.log10() : 0;
    const result: RunResult = { won, time: run.time, points, earnedLog10 };
    run.result = result;
    meta.points += points;
    meta.runs++;
    meta.bestRunLog10 = Math.max(meta.bestRunLog10, earnedLog10);
    if (won) {
      meta.wins[run.difficulty]++;
      const best = meta.fastest[run.difficulty];
      if (best === null || run.time < best) meta.fastest[run.difficulty] = run.time;
    }
    this.emit({ type: 'runEnded', result });
  }

  private addMoney(gain: Decimal): void {
    const run = this.run;
    run.money = run.money.add(gain);
    run.earned = run.earned.add(gain);
    this.meta.lifetime = this.meta.lifetime.add(gain);
  }

  // ── Runs ─────────────────────────────────────────────────────

  canStart(route: RouteId, difficulty: Difficulty): boolean {
    const m = metaMods(this.meta);
    return m.routesUnlocked[route] && difficultyUnlocked(this.meta, difficulty);
  }

  /** Abandon whatever is going on and start a fresh run. */
  startRun(route: RouteId = 'beasts', difficulty: Difficulty = 'normal'): boolean {
    if (!this.canStart(route, difficulty)) return false;
    const run = createRun(route, difficulty);
    run.money = D(metaMods(this.meta).startMoney);
    for (const id of ROUTES[route].freeSkills) run.skills[id] = true;
    this.state.run = run;
    this.refreshMods();
    this.emit({ type: 'runStarted' });
    return true;
  }

  // ── Commands ─────────────────────────────────────────────────

  click(): Decimal {
    if (!this.running) return ZERO;
    const gain = clickValue(this.run, this.mods);
    this.addMoney(gain);
    this.run.clicks++;
    this.emit({ type: 'click', gain });
    return gain;
  }

  buyCount(id: CreatureId, amount: BuyAmount): number {
    const c = this.run.creatures[id];
    if (amount === 'max') return maxAffordable(id, c.bought, this.run.money);
    return canAfford(creatureCostN(id, c.bought, amount), this.run.money) ? amount : 0;
  }

  buyCreature(id: CreatureId, amount: BuyAmount): number {
    const run = this.run;
    if (!this.running || !isCreatureUnlocked(run, id)) return 0;
    const n = this.buyCount(id, amount);
    if (n <= 0) return 0;
    const c = run.creatures[id];
    const before = milestonesReached(c.bought);
    run.money = pay(run.money, creatureCostN(id, c.bought, n));
    c.bought += n;
    this.emit({ type: 'creatureBought', id, count: n, total: c.bought });
    if (milestonesReached(c.bought) > before) this.emit({ type: 'milestone', id, owned: c.bought });
    return n;
  }

  nestCost(): Decimal {
    return nestCost(this.run.nests);
  }

  buyNest(): boolean {
    const run = this.run;
    if (!this.running || !this.mods.breeding) return false;
    const cost = nestCost(run.nests);
    if (!canAfford(cost, run.money)) return false;
    run.money = pay(run.money, cost);
    run.nests++;
    this.emit({ type: 'nestBought', nests: run.nests });
    return true;
  }

  upgradeCost(id: string): Decimal {
    const def = UPGRADE_BY_ID[id];
    return def ? D(def.cost) : ZERO;
  }

  buyUpgrade(id: string): boolean {
    const run = this.run;
    const def = UPGRADE_BY_ID[id];
    if (!this.running || !def || run.upgrades[id] || !def.req.every((r) => meets(run, r))) return false;
    const cost = D(def.cost);
    if (!canAfford(cost, run.money)) return false;
    run.money = pay(run.money, cost);
    run.upgrades[id] = true;
    for (const e of def.effects) {
      if (e.type === 'unlockEra' && e.era > run.era) {
        run.era = e.era;
        this.emit({ type: 'eraUnlocked', era: e.era });
      }
    }
    this.refreshMods();
    this.emit({ type: 'upgradeBought', id });
    return true;
  }

  skillCost(id: string): Decimal {
    const def = SKILL_BY_ID[id];
    return def ? D(def.cost) : ZERO;
  }

  buySkill(id: string): boolean {
    const run = this.run;
    const def = SKILL_BY_ID[id];
    if (!this.running || !def || skillStatus(run, this.mods, def) !== 'available') return false;
    const cost = D(def.cost);
    if (!canAfford(cost, run.money)) return false;
    run.money = pay(run.money, cost);
    run.skills[id] = true;
    for (const e of def.effects) {
      if (e.type === 'unlockBreeding') run.nests = Math.max(run.nests, 1);
      if (e.type === 'convert') {
        const from = run.creatures[e.from];
        run.creatures[e.to].bred += from.bought + from.bred;
        run.creatures[e.from] = { bought: 0, bred: 0 };
      }
    }
    this.refreshMods();
    this.emit({ type: 'skillBought', id });
    return true;
  }

  /** Seconds until an active skill is ready again (0 = ready). */
  cooldown(id: ActiveId): number {
    return this.run.cooldowns[id] ?? 0;
  }

  activate(id: ActiveId): boolean {
    const run = this.run;
    if (!this.running || !this.mods.actives[id] || this.cooldown(id) > 0) return false;
    const A = BALANCE.actives;
    switch (id) {
      case 'surge':
        if (!this.mods.tide) return false;
        run.tide.surgeLeft = this.mods.surgeDuration;
        run.cooldowns.surge = this.mods.surgeCooldown;
        break;
      case 'rescue':
        for (const k of Object.keys(run.taming) as CreatureId[]) {
          run.taming[k] = Math.max(0, (run.taming[k] ?? 0) - A.rescue.amount);
        }
        run.cooldowns.rescue = A.rescue.cooldown;
        break;
      case 'rampage':
        run.rampageLeft = A.rampage.duration;
        run.cooldowns.rampage = A.rampage.cooldown;
        break;
      case 'sabotage':
        run.research = Math.max(0, run.research - A.sabotage.amount);
        run.cooldowns.sabotage = A.sabotage.cooldown;
        break;
    }
    this.emit({ type: 'active', id });
    return true;
  }

  // ── Meta ─────────────────────────────────────────────────────

  buyMeta(id: string): boolean {
    const meta = this.meta;
    const def = META_BY_ID[id];
    if (!def) return false;
    const level = metaLevel(meta, id);
    const next = def.levels[level];
    if (!next || next.cost > metaFree(meta)) return false;
    meta.levels[id] = level + 1;
    meta.spent += next.cost;
    this.refreshMods();
    this.emit({ type: 'metaBought', id, level: level + 1 });
    return true;
  }

  // ── Queries ──────────────────────────────────────────────────

  income(): Decimal {
    return incomePerSec(this.run, this.mods);
  }

  clickValue(): Decimal {
    return clickValue(this.run, this.mods);
  }

  availableUpgrades() {
    return availableUpgrades(this.run);
  }

  researchRate(): number {
    return researchRate(this.run, this.mods);
  }

  tamingRate(id: CreatureId): number {
    return tamingRate(this.run, this.mods, id);
  }

  billProgress(): number {
    return billProgress(this.run);
  }
}

export { DOMESTICS };
