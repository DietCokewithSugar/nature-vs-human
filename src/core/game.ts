import { BALANCE } from './config/balance.ts';
import { BUILDINGS, NATURE_BUILDABLE } from './config/buildings.ts';
import { PICKS, PICK_BY_ID } from './config/picks.ts';
import { TALENTS, talentCost, type TalentId } from './config/talents.ts';
import { UNITS } from './config/units.ts';
import { generateMap } from './map/generate.ts';
import { CELL, CELLS, cellAt, cellDist, cxOf, cyOf, inGrid, idx } from './map/grid.ts';
import { createRun, type Building, type GameState, type RunResult, type RunState, type Unit } from './state.ts';
import { randomSeed } from './rng.ts';
import { humanOpening, humanSpot, stepHumans } from './sim/ai.ts';
import { stepProjectiles, stepTowers, stepUnits } from './sim/combat.ts';
import {
  addBuilding,
  canPlace,
  cellOwner,
  footprintCells,
  isMain,
  isUnit,
  mainOf,
  mapOf,
  navOf,
  openCell,
  rand,
  type Ctx,
} from './sim/ctx.ts';
import { stepEconomy } from './sim/economy.ts';
import type { CoreEvent } from './sim/events.ts';
import { stepBuildings } from './sim/spawn.ts';
import { buildingMaxHp, computeMods, humanLevel, levelCost, unitMaxHp, type Mods } from './sim/stats.ts';
import { stepTerritory } from './sim/territory.ts';
import { stepVision } from './sim/vision.ts';
import type { LevelId, NatureBuildingId, NatureUnitId } from './types.ts';

export type { CoreEvent } from './sim/events.ts';

export type BuildProblem = 'phase' | 'cell' | 'taken' | 'ground' | 'money' | 'kind';
export type BuildVerdict = { ok: true; cost: number } | { ok: false; why: BuildProblem };

/**
 * The logic core. Owns the state, applies commands, advances time.
 * Knows nothing about the DOM, PixiJS or storage.
 */
export class Game {
  state: GameState;
  mods: Mods;
  private listeners = new Set<(e: CoreEvent) => void>();
  private ctx: Ctx;

  constructor(state: GameState) {
    this.state = state;
    this.mods = computeMods(state.run, state.meta);
    this.ctx = {
      run: state.run,
      meta: state.meta,
      mods: this.mods,
      emit: (e) => this.emit(e),
      byId: new Map(),
      onCell: new Map(),
      visible: new Uint8Array(CELLS),
    };
    this.reindex();
    if (!state.run.buildings.length && state.run.phase !== 'over') this.startRun(state.run.rng);
    else stepVision(this.ctx);
  }

  get run(): RunState {
    return this.state.run;
  }

  on(fn: (e: CoreEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: CoreEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  private reindex(): void {
    const m = this.ctx.byId;
    const on = this.ctx.onCell;
    m.clear();
    on.clear();
    for (const u of this.run.units) m.set(u.id, u);
    for (const b of this.run.buildings) {
      m.set(b.id, b);
      for (const c of footprintCells(b.kind, b.cell)) on.set(c, b);
    }
  }

  /** Cells nature can see right now (1 = visible). Explored cells are in run.explored. */
  get visible(): Uint8Array {
    return this.ctx.visible;
  }

  /** Recompute picks and talents, and rescale everyone's health to match. */
  private refresh(): void {
    this.mods = computeMods(this.run, this.state.meta);
    this.ctx.mods = this.mods;
    for (const u of this.run.units) {
      const max = unitMaxHp(u.kind, this.run, this.mods);
      u.hp = (u.hp / u.maxHp) * max;
      u.maxHp = max;
    }
    for (const b of this.run.buildings) {
      const max = buildingMaxHp(b.kind, this.run, this.mods);
      b.hp = (b.hp / b.maxHp) * max;
      b.maxHp = max;
    }
  }

  // ── Runs and stages ─────────────────────────────────────────

  /** A fresh run from stage 1: a new map, the mother tree in its enclave, the humans' capital. */
  startRun(seed = randomSeed()): void {
    this.state.run = createRun(seed);
    this.ctx.run = this.state.run;
    this.refresh();
    this.run.essence = BALANCE.nature.start + this.mods.startEssence;
    this.ctx.byId.clear();
    this.ctx.onCell.clear();
    addBuilding(this.ctx, 'mothertree', generateMap(this.run.mapSeed).mother, true);
    this.setupStage(1);
    this.emit({ type: 'runStarted' });
  }

  /**
   * Start a stage. Its era opens the next ring of the map (laid out as the map says); nature keeps
   * the ground and buildings it has; the humans rebuild their capital (retaking the cells round
   * it), their opening buildings, and the towns of every open ring where they still hold the land.
   */
  private setupStage(stage: number): void {
    const run = this.run;
    const map = mapOf(run);
    const max = BALANCE.territory.max;
    const era = Math.min(stage - 1, 3);
    const opened = era > run.era;
    for (let e = run.era + 1; e <= era; e++) {
      for (let i = 0; i < CELLS; i++) if (map.ring[i] === e) run.control[i] = map.owner[i]! * max;
    }
    run.era = era;
    run.stage = stage;
    run.stageTime = 0;
    run.wonAt = null;
    run.phase = 'battle';
    run.offer = [];
    run.units = [];
    run.projectiles = [];
    // The capital's quarter goes back to the humans; anything of nature's in it is cleared away.
    const ccx = cxOf(map.capital) + 1;
    const ccy = cyOf(map.capital) + 1;
    const R = BALANCE.territory.capitalRadius;
    const core = new Set<number>();
    for (let cy = Math.floor(ccy - R - 1); cy <= ccy + R; cy++) {
      for (let cx = Math.floor(ccx - R - 1); cx <= ccx + R; cx++) {
        if (!inGrid(cx, cy) || Math.hypot(cx + 0.5 - ccx, cy + 0.5 - ccy) > R) continue;
        const i = idx(cx, cy);
        if (!openCell(run, i)) continue;
        run.control[i] = -max;
        core.add(i);
      }
    }
    run.buildings = run.buildings.filter((b) => b.side === 'nature' && (isMain(b) || !footprintCells(b.kind, b.cell).some((c) => core.has(c))));
    run.human = { supplies: BALANCE.human.start + BALANCE.human.startPerStage * (stage - 1), food: 10, think: 3, research: 0, attacking: false };
    this.reindex();
    const lodge = addBuilding(this.ctx, 'lodge', map.capital, true);
    for (const kind of humanOpening(stage)) {
      const cell = humanSpot(run, kind, lodge.x, lodge.y, 9);
      if (cell !== null) addBuilding(this.ctx, kind, cell, true);
    }
    for (const town of map.towns) {
      if (town.era > era) continue;
      for (const b of town.buildings) if (canPlace(run, 'human', b.kind, b.cell)) addBuilding(this.ctx, b.kind, b.cell, true);
    }
    this.refresh();
    for (const b of run.buildings) {
      b.hp = b.maxHp;
      b.timer = 0;
      b.blocked = null;
    }
    run.grassStock = 0;
    run.meatStock = 0;
    for (const f of run.flags.slice()) if (!openCell(run, cellAt(f.x, f.y))) run.flags = run.flags.filter((x) => x !== f);
    stepVision(this.ctx);
    this.emit({ type: 'stageStarted', stage, era, opened });
  }

  // ── Time ────────────────────────────────────────────────────

  get running(): boolean {
    return this.run.phase === 'battle';
  }

  advance(dt: number, step: number = BALANCE.step): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.state.meta.playTime += Math.min(dt, BALANCE.maxCatchUp);
    let remaining = Math.min(dt, BALANCE.maxCatchUp);
    while (remaining > 1e-9 && this.running) {
      const h = Math.min(step, remaining);
      this.step(h);
      remaining -= h;
    }
  }

  private step(dt: number): void {
    const run = this.run;
    const ctx = this.ctx;
    run.time += dt;
    run.stageTime += dt;
    this.reindex();

    // The humans get better tools as the stage drags on.
    const research = Math.floor(run.stageTime / BALANCE.human.researchPeriod);
    if (research > run.human.research && run.wonAt === null) {
      run.human.research = research;
      this.refresh();
      this.emit({ type: 'research', level: humanLevel(run) });
    }

    stepEconomy(ctx, dt);
    stepBuildings(ctx, dt);
    stepTowers(ctx, dt);
    stepUnits(ctx, dt);
    stepProjectiles(ctx, dt);
    stepTerritory(ctx, dt);
    stepVision(ctx);
    stepHumans(ctx, dt);
    this.cleanup();

    if (run.wonAt !== null && run.time - run.wonAt >= BALANCE.stage.pickDelay) this.openPick();
  }

  private cleanup(): void {
    const run = this.run;
    if (run.units.some((u) => u.hp <= 0)) {
      const alive: Unit[] = [];
      for (const u of run.units) {
        if (u.hp > 0) {
          alive.push(u);
          continue;
        }
        const starved = u.hungry && run.time - u.hitAt > 0.3;
        this.emit({ type: 'death', id: u.id, kind: u.kind, side: u.side, x: u.x, y: u.y, cause: starved ? 'starve' : 'combat' });
        if (u.side === 'human') {
          run.stats.kills++;
          const bounty = UNITS[u.kind].bounty * this.bountyMult();
          run.essence += bounty;
          this.emit({ type: 'bounty', x: u.x, y: u.y, amount: bounty });
        } else if (starved) run.stats.starved++;
        else run.stats.losses++;
      }
      run.units = alive;
    }
    if (run.buildings.some((b) => b.hp <= 0)) {
      const standing: Building[] = [];
      let natureMainLost = false;
      let humanMainLost = false;
      for (const b of run.buildings) {
        if (b.hp > 0) {
          standing.push(b);
          continue;
        }
        this.emit({ type: 'destroyed', id: b.id, kind: b.kind, side: b.side, x: b.x, y: b.y });
        if (b.side === 'human') {
          run.stats.razed++;
          const bounty = BUILDINGS[b.kind].bounty * this.bountyMult();
          if (bounty > 0) {
            run.essence += bounty;
            this.emit({ type: 'bounty', x: b.x, y: b.y, amount: bounty });
          }
          if (isMain(b)) humanMainLost = true;
        } else {
          run.stats.lost++;
          if (isMain(b)) natureMainLost = true;
        }
      }
      run.buildings = standing;
      if (natureMainLost && run.wonAt === null) this.endRun('fell');
      else if (humanMainLost && run.wonAt === null) this.winStage();
    }
  }

  private bountyMult(): number {
    return (1 + 0.3 * (this.run.stage - 1)) * this.mods.bounty;
  }

  private winStage(): void {
    const run = this.run;
    run.wonAt = run.time;
    // The camp scatters: its people run off the field.
    for (const u of run.units) {
      if (u.side !== 'human') continue;
      this.emit({ type: 'death', id: u.id, kind: u.kind, side: u.side, x: u.x, y: u.y, cause: 'rout' });
    }
    run.units = run.units.filter((u) => u.side !== 'human');
    run.projectiles = run.projectiles.filter((p) => p.side !== 'human');
    const reward = BALANCE.stage.reward + BALANCE.stage.rewardPerStage * run.stage;
    run.essence += reward;
    const meta = this.state.meta;
    meta.bestStage = Math.max(meta.bestStage, run.stage);
    this.emit({ type: 'stageWon', stage: run.stage, reward });
  }

  private openPick(): void {
    const run = this.run;
    run.phase = 'pick';
    run.rerolls = this.mods.rerolls;
    run.offer = this.drawOffer();
    this.emit({ type: 'offer', offer: run.offer });
  }

  /** Three different cards, weighted towards species you keep. */
  private drawOffer(exclude: string[] = []): string[] {
    const run = this.run;
    const kept = new Set<NatureUnitId>();
    for (const b of run.buildings) {
      const makes = BUILDINGS[b.kind].makes;
      if (b.side === 'nature' && makes && !isMain(b)) kept.add(makes as NatureUnitId);
    }
    const pool = PICKS.filter((p) => !exclude.includes(p.id));
    const out: string[] = [];
    while (out.length < BALANCE.picks.offer && pool.length) {
      const weights = pool.map((p) => (p.about ? (kept.has(p.about) ? BALANCE.picks.relevantWeight : 0.35) : 1));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rand(this.ctx) * total;
      let i = 0;
      while (i < pool.length - 1 && r >= weights[i]!) r -= weights[i++]!;
      out.push(pool[i]!.id);
      pool.splice(i, 1);
    }
    return out;
  }

  choosePick(id: string): boolean {
    const run = this.run;
    if (run.phase !== 'pick' || !run.offer.includes(id) || !PICK_BY_ID[id]) return false;
    run.picks.push(id);
    this.emit({ type: 'picked', id });
    this.setupStage(run.stage + 1);
    return true;
  }

  reroll(): boolean {
    const run = this.run;
    if (run.phase !== 'pick' || run.rerolls <= 0) return false;
    run.rerolls--;
    run.offer = this.drawOffer(run.offer);
    this.emit({ type: 'offer', offer: run.offer });
    return true;
  }

  /** Genes this run would pay if it ended now. */
  genesNow(): number {
    const run = this.run;
    const cleared = run.wonAt !== null || run.phase === 'pick' ? run.stage : run.stage - 1;
    let genes = 0;
    for (let n = 1; n <= cleared; n++) genes += BALANCE.genes.base + n;
    if (cleared < run.stage) {
      const lodge = mainOf(run, 'human');
      const share = lodge ? 1 - lodge.hp / lodge.maxHp : 0;
      genes += Math.floor((BALANCE.genes.base + run.stage) * share);
    }
    return genes;
  }

  /** End the run (the mother tree fell, or the player chose to return to the earth). */
  endRun(cause: RunResult['cause']): boolean {
    const run = this.run;
    if (run.phase === 'over') return false;
    const cleared = run.wonAt !== null || run.phase === 'pick' ? run.stage : run.stage - 1;
    const genes = this.genesNow();
    const meta = this.state.meta;
    meta.genes += genes;
    meta.lifetimeGenes += genes;
    meta.runs++;
    meta.bestStage = Math.max(meta.bestStage, cleared);
    run.result = { stage: run.stage, cleared, genes, cause };
    run.phase = 'over';
    run.projectiles = [];
    this.emit({ type: 'runEnded', result: run.result });
    return true;
  }

  // ── Building ────────────────────────────────────────────────

  buildCost(kind: NatureBuildingId): number {
    const def = BUILDINGS[kind];
    const n = this.run.buildings.filter((b) => b.kind === kind).length;
    return Math.ceil(def.cost * Math.pow(def.costGrowth, n));
  }

  buildCheck(cell: number, kind: NatureBuildingId): BuildVerdict {
    const run = this.run;
    if (run.phase !== 'battle' || run.wonAt !== null) return { ok: false, why: 'phase' };
    if (!NATURE_BUILDABLE.includes(kind)) return { ok: false, why: 'kind' };
    if (cell < 0 || cell >= CELLS || !openCell(run, cell)) return { ok: false, why: 'cell' };
    if (cellOwner(run, cell) !== 'nature') return { ok: false, why: 'ground' };
    if (!canPlace(run, 'nature', kind, cell)) return { ok: false, why: 'taken' };
    const cost = this.buildCost(kind);
    if (run.essence < cost) return { ok: false, why: 'money' };
    return { ok: true, cost };
  }

  /** Cells nature can build on right now. */
  openCells(): number[] {
    const run = this.run;
    const out: number[] = [];
    for (let i = 0; i < CELLS; i++) {
      if (run.control[i]! < BALANCE.territory.flip) continue;
      if (canPlace(run, 'nature', 'meadow', i)) out.push(i);
    }
    return out;
  }

  /**
   * The best free cell for a kind: meadows close to the mother tree; watch trees on the cell
   * nearest the humans' capital; nests near home, on the side facing the capital. Null if none.
   */
  autoCell(kind: NatureBuildingId): number | null {
    const run = this.run;
    const free = this.openCells();
    if (!free.length) return null;
    const tree = mainOf(run, 'nature');
    const capital = mainOf(run, 'human');
    const map = mapOf(run);
    const home = tree ? cellAt(tree.x, tree.y - CELL) : map.mother;
    const cap = capital ? capital.cell : map.capital;
    const field = navOf(run).field(cap);
    const score = (c: number): number => {
      const toCap = Math.min(field[c]!, 999);
      const toHome = cellDist(c, home);
      if (kind === 'meadow') return toHome;
      if (kind === 'ancient') return toCap;
      return toCap + Math.max(0, toHome - 5) * 2;
    };
    let best = free[0]!;
    let bestS = score(best);
    for (const c of free) {
      const s = score(c);
      if (s < bestS) {
        bestS = s;
        best = c;
      }
    }
    return best;
  }

  build(cell: number, kind: NatureBuildingId): boolean {
    const v = this.buildCheck(cell, kind);
    if (!v.ok) return false;
    this.run.essence -= v.cost;
    const b = addBuilding(this.ctx, kind, cell, false);
    this.run.stats.built++;
    this.emit({ type: 'placed', id: b.id, kind, side: 'nature', cell, x: b.x, y: b.y });
    return true;
  }

  /** Tear down one of nature's buildings for half its price back. */
  demolish(id: number): boolean {
    const run = this.run;
    const b = run.buildings.find((x) => x.id === id);
    if (!b || b.side !== 'nature' || isMain(b) || run.phase !== 'battle') return false;
    // Half of what this one cost (the price before it was built).
    const paid = this.buildCost(b.kind as NatureBuildingId) / BUILDINGS[b.kind].costGrowth;
    run.buildings = run.buildings.filter((x) => x !== b);
    run.essence += Math.floor(paid / 2);
    this.reindex();
    return true;
  }

  // ── Rally flags ─────────────────────────────────────────────

  /** Plant a rally flag on open ground nature has seen. The oldest goes when there are too many. */
  placeFlag(x: number, y: number): boolean {
    const run = this.run;
    const cell = cellAt(x, y);
    if (run.phase === 'over' || cell < 0 || !openCell(run, cell) || !run.explored[cell]) return false;
    while (run.flags.length >= BALANCE.flags.max) run.flags.shift();
    run.flags.push({ id: run.nextId++, x: (cxOf(cell) + 0.5) * CELL, y: (cyOf(cell) + 0.5) * CELL });
    this.flagsChanged();
    return true;
  }

  removeFlag(id: number): boolean {
    const before = this.run.flags.length;
    this.run.flags = this.run.flags.filter((f) => f.id !== id);
    if (this.run.flags.length === before) return false;
    this.flagsChanged();
    return true;
  }

  clearFlags(): void {
    if (!this.run.flags.length) return;
    this.run.flags = [];
    this.flagsChanged();
  }

  private flagsChanged(): void {
    for (const u of this.run.units) if (u.side === 'nature') u.rethink = 0;
    this.emit({ type: 'flags' });
  }

  // ── Levels ──────────────────────────────────────────────────

  levelCost(id: LevelId): number {
    return levelCost(id, this.run.levels[id]);
  }

  levelUp(id: LevelId): boolean {
    const run = this.run;
    if (run.phase === 'over') return false;
    const cost = this.levelCost(id);
    if (run.essence < cost) return false;
    run.essence -= cost;
    run.levels[id]++;
    this.refresh();
    this.emit({ type: 'levelUp', id, level: run.levels[id] });
    return true;
  }

  // ── Talents ─────────────────────────────────────────────────

  talentCost(id: TalentId): number {
    return talentCost(id, this.state.meta.talents[id]);
  }

  buyTalent(id: TalentId): boolean {
    const meta = this.state.meta;
    const lvl = meta.talents[id];
    if (lvl >= TALENTS[id].max) return false;
    const cost = this.talentCost(id);
    if (meta.genes < cost) return false;
    meta.genes -= cost;
    meta.talents[id]++;
    this.refresh();
    this.emit({ type: 'talent', id, level: meta.talents[id] });
    return true;
  }

  /** Lookups for the UI. */
  entity(id: number): Unit | Building | undefined {
    return this.run.units.find((u) => u.id === id) ?? this.run.buildings.find((b) => b.id === id);
  }

  isUnit(e: Unit | Building): e is Unit {
    return isUnit(e);
  }
}
