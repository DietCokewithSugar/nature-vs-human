import { BALANCE } from './config/balance.ts';
import { BUILDINGS, NATURE_BUILDABLE } from './config/buildings.ts';
import { PICKS, PICK_BY_ID } from './config/picks.ts';
import { TALENTS, talentCost, type TalentId } from './config/talents.ts';
import { UNITS } from './config/units.ts';
import { PADS } from './map/layout.ts';
import { createRun, startSegments, type Building, type GameState, type RunResult, type RunState, type Unit } from './state.ts';
import { randomSeed } from './rng.ts';
import { freeHumanPads, humanOpening, stepHumans } from './sim/ai.ts';
import { stepProjectiles, stepTowers, stepUnits } from './sim/combat.ts';
import { addBuilding, buildingOnPad, isUnit, mainOf, padUser, rand, type Ctx } from './sim/ctx.ts';
import { stepEconomy } from './sim/economy.ts';
import type { CoreEvent } from './sim/events.ts';
import { stepBuildings } from './sim/spawn.ts';
import { buildingMaxHp, computeMods, humanLevel, levelCost, unitMaxHp, type Mods } from './sim/stats.ts';
import { stepTerritory } from './sim/territory.ts';
import type { LevelId, NatureBuildingId, NatureUnitId } from './types.ts';

export type { CoreEvent } from './sim/events.ts';

export type BuildProblem = 'phase' | 'pad' | 'taken' | 'ground' | 'money' | 'kind';
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
    this.ctx = { run: state.run, meta: state.meta, mods: this.mods, emit: (e) => this.emit(e), byId: new Map() };
    this.reindex();
    if (!state.run.buildings.length && state.run.phase !== 'over') this.startRun(state.run.rng);
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
    m.clear();
    for (const u of this.run.units) m.set(u.id, u);
    for (const b of this.run.buildings) m.set(b.id, b);
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

  /** A fresh run from stage 1: a bare home with only the mother tree. */
  startRun(seed = randomSeed()): void {
    this.state.run = createRun(seed);
    this.ctx.run = this.state.run;
    this.refresh();
    this.run.essence = BALANCE.nature.start + this.mods.startEssence;
    this.ctx.byId.clear();
    addBuilding(this.ctx, 'mothertree', -1, true);
    this.setupStage(1);
    this.emit({ type: 'runStarted' });
  }

  /** Lay out the humans' camp for a stage and reset the field. Nature keeps its home. */
  private setupStage(stage: number): void {
    const run = this.run;
    run.stage = stage;
    run.stageTime = 0;
    run.wonAt = null;
    run.phase = 'battle';
    run.offer = [];
    run.units = [];
    run.projectiles = [];
    run.segments = startSegments();
    // Nature keeps everything it built; field buildings now stand on neutral ground and hold it.
    run.buildings = run.buildings.filter((b) => b.side === 'nature');
    run.human = { supplies: BALANCE.human.start + BALANCE.human.startPerStage * (stage - 1), food: 10, think: 3, research: 0 };
    this.reindex();
    addBuilding(this.ctx, 'lodge', -1, true);
    for (const o of humanOpening(stage)) {
      const pad = freeHumanPads(run, o.lane, false)[0] ?? freeHumanPads(run, null, false)[0];
      if (pad !== undefined) addBuilding(this.ctx, o.kind, pad, true);
    }
    this.refresh();
    for (const b of run.buildings) {
      b.hp = b.maxHp;
      b.timer = 0;
      b.blocked = null;
    }
    run.grassStock = 0;
    run.meatStock = 0;
    this.emit({ type: 'stageStarted', stage });
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
          if (b.pad < 0) humanMainLost = true;
        } else {
          run.stats.lost++;
          if (b.pad < 0) natureMainLost = true;
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
      if (b.side === 'nature' && makes && b.pad >= 0) kept.add(makes as NatureUnitId);
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

  buildCheck(padId: number, kind: NatureBuildingId): BuildVerdict {
    const run = this.run;
    if (run.phase !== 'battle' || run.wonAt !== null) return { ok: false, why: 'phase' };
    if (!NATURE_BUILDABLE.includes(kind)) return { ok: false, why: 'kind' };
    if (!PADS[padId]) return { ok: false, why: 'pad' };
    if (buildingOnPad(run, padId)) return { ok: false, why: 'taken' };
    if (padUser(run, padId) !== 'nature') return { ok: false, why: 'ground' };
    const cost = this.buildCost(kind);
    if (run.essence < cost) return { ok: false, why: 'money' };
    return { ok: true, cost };
  }

  /** Pads nature can build on right now. */
  openPads(): number[] {
    return PADS.filter((p) => padUser(this.run, p.id) === 'nature' && !buildingOnPad(this.run, p.id)).map((p) => p.id);
  }

  /**
   * The best free pad for a kind: meadows and ancient trees at home, spawners on the lane
   * with the fewest of nature's spawners, home pads before forward ones. Null if none.
   */
  autoPad(kind: NatureBuildingId): number | null {
    const run = this.run;
    const free = PADS.filter((p) => padUser(run, p.id) === 'nature' && !buildingOnPad(run, p.id));
    if (!free.length) return null;
    const perLane = [0, 0, 0];
    for (const b of run.buildings) if (b.side === 'nature' && b.pad >= 0 && BUILDINGS[b.kind].makes) perLane[PADS[b.pad]!.lane]!++;
    const def = BUILDINGS[kind];
    free.sort((a, b) => {
      if (!def.makes) {
        // Rear pads first for producers; towers want the front of home.
        const rear = kind === 'meadow' ? a.x - b.x : b.x - a.x;
        return (a.home ? 0 : 1) - (b.home ? 0 : 1) || rear;
      }
      return perLane[a.lane]! - perLane[b.lane]! || (a.home ? 0 : 1) - (b.home ? 0 : 1) || b.x - a.x;
    });
    return free[0]!.id;
  }

  build(padId: number, kind: NatureBuildingId): boolean {
    const v = this.buildCheck(padId, kind);
    if (!v.ok) return false;
    this.run.essence -= v.cost;
    const b = addBuilding(this.ctx, kind, padId, false);
    this.run.stats.built++;
    this.emit({ type: 'placed', id: b.id, kind, side: 'nature', pad: padId });
    return true;
  }

  /** Tear down one of nature's buildings for half its price back. */
  demolish(id: number): boolean {
    const run = this.run;
    const b = run.buildings.find((x) => x.id === id);
    if (!b || b.side !== 'nature' || b.pad < 0 || run.phase !== 'battle') return false;
    // Half of what this one cost (the price before it was built).
    const paid = this.buildCost(b.kind as NatureBuildingId) / BUILDINGS[b.kind].costGrowth;
    run.buildings = run.buildings.filter((x) => x !== b);
    run.essence += Math.floor(paid / 2);
    this.reindex();
    return true;
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
