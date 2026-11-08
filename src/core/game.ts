import { BALANCE } from './config/balance.ts';
import { BUILDINGS } from './config/buildings.ts';
import { META_BY_ID, ROUTES } from './config/meta.ts';
import { SKILL_BY_ID } from './config/skills.ts';
import { UNITS } from './config/units.ts';
import { CELLS, NODES } from './map/grid.ts';
import { computeMods, metaMods, type Mods } from './modifiers.ts';
import { difficultyUnlocked, metaFree, metaLevel, skillStatus } from './progression.ts';
import { createRun, createState, type Building, type GameState, type RunResult } from './state.ts';
import {
  bestSite,
  distanceTo,
  hasRoom,
  kindOpen,
  placeBuilding,
  placePresets,
  siteCheck,
  stepBuildings,
  upgradeBuilding,
  type SiteProblem,
} from './sim/buildings.ts';
import { rand, type Ctx } from './sim/ctx.ts';
import { stepDisaster } from './sim/disasters.ts';
import { collectBubble, humanIncome, humanIncomeParts, natureIncome, stepEconomy } from './sim/economy.ts';
import type { CoreEvent } from './sim/events.ts';
import { addTaming, researchParts, researchRate, stepHumanAI, stepResearch } from './sim/humans.ts';
import { buildingCap, buildingCost, buildingCount, buildingMaxHp, unitMaxHp, upgradeCost } from './sim/stats.ts';
import { initCells, natureShare, stepTerritory } from './sim/territory.ts';
import { advanceTide } from './sim/tide.ts';
import { stepUnits } from './sim/units.ts';
import { stepAuras } from './sim/auras.ts';
import { HUMAN, NATURE, World } from './sim/world.ts';
import type { ActiveId, BuildingId, Difficulty, NatureBuildingId, RouteId } from './types.ts';

export type { CoreEvent } from './sim/events.ts';

export type PlaceProblem = SiteProblem | 'cap' | 'money' | 'shut';

export type PlaceVerdict = { ok: true; speed: number; cost: number } | { ok: false; why: PlaceProblem };

/**
 * The logic core. Owns the state, applies commands, advances time.
 * Knows nothing about the DOM, three.js or storage.
 */
export class Game {
  state: GameState;
  mods: Mods;
  readonly world = new World();
  private listeners = new Set<(e: CoreEvent) => void>();
  private ctx: Ctx;

  constructor(state: GameState = createState()) {
    this.state = state;
    this.mods = computeMods(state);
    this.ctx = this.makeCtx();
    if (!this.run.control.length) this.layout();
    else this.world.rebuild(this.run);
  }

  private makeCtx(): Ctx {
    return {
      run: this.state.run,
      mods: this.mods,
      world: this.world,
      emit: (e) => this.emit(e),
      refresh: () => this.refreshMods(),
    };
  }

  /** Lay out the map for a fresh run: holders, ice-age buildings, resource timers. */
  private layout(): void {
    const run = this.run;
    initCells(run);
    run.nodeTimers = NODES.map(() => 2 + rand(this.ctx) * 10);
    this.world.rebuild(run);
    placePresets(this.ctx, 1);
    this.world.countCells(run);
    this.world.refreshObjectives(run);
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
    const m = computeMods(this.state);
    // Keep the same object so the context sees the change.
    Object.assign(this.mods, m);
  }

  load(state: GameState): void {
    this.state = state;
    this.mods = computeMods(state);
    this.ctx = this.makeCtx();
    if (!this.run.control.length) this.layout();
    else this.world.rebuild(this.run);
    this.emit({ type: 'reset' });
  }

  get running(): boolean {
    return this.run.result === null;
  }

  // ── Time ─────────────────────────────────────────────────────

  /** Advance by dt seconds in fixed steps. A long gap is capped (an open page counts; a frozen one does not). */
  advance(dt: number, step: number = BALANCE.step): void {
    if (!(dt > 0) || !Number.isFinite(dt) || !this.running) return;
    let remaining = Math.min(dt, BALANCE.maxCatchUp);
    while (remaining > 1e-9 && this.running) {
      const h = Math.min(step, remaining);
      this.step(h);
      remaining -= h;
    }
  }

  private step(h: number): void {
    const run = this.run;
    const ctx = this.ctx;
    run.time += h;
    this.meta.playTime += h;
    advanceTide(run.tide, h);
    run.rampageLeft = Math.max(0, run.rampageLeft - h);
    for (const id of Object.keys(run.cooldowns) as ActiveId[]) run.cooldowns[id] = Math.max(0, (run.cooldowns[id] ?? 0) - h);

    this.world.tickObjectives(run, h);
    this.world.bucketUnits(run);
    stepAuras(ctx, h);
    stepUnits(ctx, h);
    stepBuildings(ctx, h);
    const flips = stepTerritory(run, this.world, this.mods, h);
    if (flips.toNature || flips.toHuman) this.emit({ type: 'cellsFlipped', ...flips });
    stepEconomy(ctx, h);
    stepResearch(ctx, h);
    stepHumanAI(ctx, h);
    stepDisaster(ctx, h);

    const share = natureShare(this.world);
    run.best = Math.max(run.best, share);
    if (!this.running) return;
    if ((share >= BALANCE.territory.winShare && run.era === 4) || (buildingCount(run, 'human') === 0 && run.time > 5)) this.endRun(true);
    else if (run.research >= 4 || buildingCount(run, 'nature') === 0) this.endRun(false);
  }

  private endRun(won: boolean): void {
    const run = this.run;
    const meta = this.meta;
    if (run.result) return;
    const territory = natureShare(this.world);
    const progress = won ? 1 : Math.min(1, run.best / BALANCE.territory.winShare);
    const M = BALANCE.meta;
    const points = Math.round((M.base + M.perProgress * progress + (won ? M.winBonus : 0)) * BALANCE.difficulty[run.difficulty].points);
    const result: RunResult = { won, time: run.time, points, territory, best: run.best };
    run.result = result;
    meta.points += points;
    meta.runs++;
    meta.lifetime += run.earned;
    meta.bestTerritory = Math.max(meta.bestTerritory, run.best);
    if (won) {
      meta.wins[run.difficulty]++;
      const best = meta.fastest[run.difficulty];
      if (best === null || run.time < best) meta.fastest[run.difficulty] = run.time;
    }
    this.emit({ type: 'runEnded', result });
  }

  // ── Runs ─────────────────────────────────────────────────────

  canStart(route: RouteId, difficulty: Difficulty): boolean {
    const m = metaMods(this.meta);
    return m.routesUnlocked[route] && difficultyUnlocked(this.meta, difficulty);
  }

  /** Abandon whatever is going on and start a fresh run. */
  startRun(route: RouteId = 'beasts', difficulty: Difficulty = 'normal', seed?: number): boolean {
    if (!this.canStart(route, difficulty)) return false;
    const run = createRun(route, difficulty, seed);
    run.essence = Math.max(run.essence, metaMods(this.meta).startEssence);
    for (const id of ROUTES[route].freeSkills) run.skills[id] = true;
    this.state.run = run;
    this.mods = computeMods(this.state);
    this.ctx = this.makeCtx();
    this.layout();
    this.emit({ type: 'runStarted' });
    return true;
  }

  // ── Commands ─────────────────────────────────────────────────

  /** Tap a bubble of 自然之元. */
  collect(bubbleId: number): number {
    if (!this.running) return 0;
    const v = collectBubble(this.ctx, bubbleId, 'tap');
    if (v > 0) this.run.clicks++;
    return v;
  }

  /** Can nature build this kind on this cell right now, and at what speed and price? */
  placeCheck(kind: BuildingId, cell: number): PlaceVerdict {
    const run = this.run;
    const def = BUILDINGS[kind];
    if (def.side !== 'nature' || !kindOpen(run, this.mods, kind)) return { ok: false, why: 'shut' };
    if (!hasRoom(run, this.world, this.mods, 'nature')) return { ok: false, why: 'cap' };
    const v = siteCheck(run, this.world, this.mods, kind, cell);
    if (!v.ok) return v;
    const cost = buildingCost(run, kind);
    if (cost > run.essence + 1e-9) return { ok: false, why: 'money' };
    return { ok: true, speed: v.speed, cost };
  }

  /** Every cell this kind could go on, with its build speed (for the placement overlay). */
  sites(kind: BuildingId): Map<number, number> {
    const out = new Map<number, number>();
    const def = BUILDINGS[kind];
    if (def.side !== 'nature' || !kindOpen(this.run, this.mods, kind)) return out;
    for (let k = 0; k < CELLS.length; k++) {
      const v = siteCheck(this.run, this.world, this.mods, kind, k);
      if (v.ok) out.set(k, v.speed);
    }
    return out;
  }

  place(kind: BuildingId, cell: number): Building | null {
    if (!this.running) return null;
    const v = this.placeCheck(kind, cell);
    if (!v.ok) return null;
    this.run.essence -= v.cost;
    return placeBuilding(this.ctx, kind, cell);
  }

  /** A good cell for a kind: own ground near the front for fighters, near the bubbles for pollinators. */
  autoSite(kind: BuildingId): number {
    const run = this.run;
    const def = BUILDINGS[kind];
    if (def.side !== 'nature') return -1;
    const pollinator = def.spawns.some((s) => UNITS[s.unit].role === 'collect');
    return bestSite(run, this.world, this.mods, kind, (k, speed) => {
      let s = speed < 1 ? 14 / speed / 5 : 0;
      if (pollinator) {
        let d = 99;
        const c = CELLS[k]!;
        for (const n of NODES) if (run.owner[n.cell] === NATURE) d = Math.min(d, Math.hypot(CELLS[n.cell]!.i - c.i, CELLS[n.cell]!.j - c.j));
        s += d;
      } else {
        s += distanceTo(run, k, HUMAN, 6) * 1.2;
      }
      return s + rand(this.ctx) * 0.8;
    });
  }

  upgradeCost(id: number): number | null {
    const b = this.world.buildings.get(id);
    return b ? upgradeCost(b) : null;
  }

  upgrade(id: number): boolean {
    const b = this.world.buildings.get(id);
    if (!this.running || !b || b.side !== 'nature' || b.build < 1) return false;
    const cost = upgradeCost(b);
    if (cost === null || cost > this.run.essence + 1e-9) return false;
    this.run.essence -= cost;
    upgradeBuilding(this.ctx, b);
    return true;
  }

  skillCost(id: string): number {
    return SKILL_BY_ID[id]?.cost ?? 0;
  }

  buySkill(id: string): boolean {
    const run = this.run;
    const def = SKILL_BY_ID[id];
    if (!this.running || !def || skillStatus(run, this.mods, def) !== 'available') return false;
    if (def.cost > run.essence + 1e-9) return false;
    run.essence -= def.cost;
    run.skills[id] = true;
    for (const e of def.effects) {
      // Lifespans stretch for the living too.
      if (e.type === 'globalLife' || e.type === 'classLife') {
        for (const u of run.units) {
          const d = UNITS[u.kind];
          if (u.side === 'nature' && (e.type === 'globalLife' || d.cls === e.cls)) u.life *= e.x;
        }
      }
      if (e.type === 'convert') this.convertSpecies(e.from, e.to, e.building, e.into);
    }
    this.refreshMods();
    this.emit({ type: 'skillBought', id });
    return true;
  }

  /** Convergent evolution: every unit and home of one species becomes another's. */
  private convertSpecies(from: string, to: string, building: NatureBuildingId, into: NatureBuildingId): void {
    const run = this.run;
    for (const u of run.units) {
      if (u.kind !== from) continue;
      const share = u.hp / unitMaxHp(run, this.mods, u.kind);
      u.kind = to as never;
      u.hp = unitMaxHp(run, this.mods, u.kind) * share;
    }
    for (const b of run.buildings) {
      if (b.kind !== building) continue;
      const share = b.hp / buildingMaxHp(run, b);
      b.kind = into;
      b.hp = buildingMaxHp(run, b) * share;
    }
  }

  setRally(x: number, z: number): void {
    this.run.rally = { x, z };
    this.world.claims.clear();
    for (const u of this.run.units) if (u.side === 'nature') u.think = Math.min(u.think, Math.random() * 0.8);
  }

  clearRally(): void {
    this.run.rally = null;
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
        for (const k of Object.keys(run.taming) as (keyof typeof run.taming)[]) run.taming[k] = Math.max(0, (run.taming[k] ?? 0) - A.rescue.amount);
        run.cooldowns.rescue = A.rescue.cooldown;
        break;
      case 'rampage':
        run.rampageLeft = A.rampage.duration;
        run.cooldowns.rampage = A.rampage.cooldown;
        break;
      case 'sabotage':
        // Knocks research back, but never out of an era the humans already reached.
        run.research = Math.max(Math.floor(run.research), run.research - A.sabotage.amount);
        run.cooldowns.sabotage = A.sabotage.cooldown;
        break;
    }
    this.emit({ type: 'active', id });
    return true;
  }

  /** Push a species' taming meter (hunters and capturers do this in play; tests and the console call it directly). */
  tame(kind: import('./types.ts').CreatureId, amount: number): void {
    addTaming(this.ctx, kind, amount / this.mods.domesticationMult);
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

  income(): number {
    return natureIncome(this.world, this.mods);
  }

  humanIncome(): number {
    return humanIncome(this.run, this.world);
  }

  /** The humans' side at a glance: their 自然之元, where it comes from, what they field, how their research goes. */
  humanReport() {
    const run = this.run;
    return {
      essence: run.humanEssence,
      income: humanIncomeParts(run, this.world),
      buildings: buildingCount(run, 'human'),
      cap: buildingCap(this.world, this.mods, 'human'),
      pop: this.world.pop.human,
      research: researchParts(run, this.world, this.mods),
    };
  }

  researchRate(): number {
    return researchRate(this.run, this.world, this.mods);
  }

  /** Shares of the open, holdable ground. */
  shares(): { nature: number; human: number; neutral: number } {
    const h = this.world.held;
    const t = Math.max(1, h.total);
    return { nature: h.nature / t, human: h.human / t, neutral: h.neutral / t };
  }

  buildingCost(kind: BuildingId): number {
    return buildingCost(this.run, kind);
  }

  buildingCap(): number {
    return buildingCap(this.world, this.mods, 'nature');
  }

  buildingCount(): number {
    return buildingCount(this.run, 'nature');
  }

  kindOpen(kind: BuildingId): boolean {
    return kindOpen(this.run, this.mods, kind);
  }

  building(id: number): Building | undefined {
    return this.world.buildings.get(id);
  }

  buildingMaxHp(b: Building): number {
    return buildingMaxHp(this.run, b);
  }

  unitMaxHp(kind: Parameters<typeof unitMaxHp>[2]): number {
    return unitMaxHp(this.run, this.mods, kind);
  }

  /** Living units a building has out right now. */
  alive(id: number): number {
    return this.world.homeCount.get(id) ?? 0;
  }
}
