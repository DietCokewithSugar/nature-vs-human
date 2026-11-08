import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import { SPRINGS } from '../map/layout.ts';
import type { RunState } from '../state.ts';
import type { Diet, Side, UnitId } from '../types.ts';
import { segOwner, unitSegment, type Ctx } from './ctx.ts';
import { meadowGrass, motherIncome, unitEat, unitMeat, type Mods } from './stats.ts';

export interface FoodLine {
  /** Per second. */
  supply: number;
  demand: number;
  stock: number;
  cap: number;
}

export interface FoodSummary {
  grass: FoodLine;
  meat: FoodLine;
}

export interface IncomeParts {
  main: number;
  ground: number;
  springs: number;
  gather: number;
  total: number;
}

function stockCap(supply: number): number {
  return Math.max(BALANCE.nature.minStock, supply * BALANCE.nature.stockSeconds);
}

export function natureFood(run: RunState, mods: Mods): FoodSummary {
  let meadows = 0;
  for (const b of run.buildings) if (b.kind === 'meadow' && b.progress >= 1) meadows++;
  const grassSupply = meadows * meadowGrass(run, mods);
  let grassDemand = 0;
  let meatSupply = 0;
  let meatDemand = 0;
  for (const u of run.units) {
    if (u.side !== 'nature') continue;
    const def = UNITS[u.kind];
    if (def.diet === 'grass') {
      grassDemand += unitEat(u.kind, mods);
      meatSupply += unitMeat(u.kind, mods);
    } else if (def.diet === 'meat') meatDemand += unitEat(u.kind, mods);
  }
  return {
    grass: { supply: grassSupply, demand: grassDemand, stock: run.grassStock, cap: stockCap(grassSupply) },
    meat: { supply: meatSupply, demand: meatDemand, stock: run.meatStock, cap: stockCap(meatSupply) },
  };
}

export function humanFood(run: RunState): FoodLine {
  let supply = 0;
  for (const b of run.buildings) if (b.side === 'human' && b.progress >= 1) supply += BUILDINGS[b.kind].food ?? 0;
  let demand = 0;
  for (const u of run.units) if (u.side === 'human') demand += UNITS[u.kind].eat;
  return { supply, demand, stock: run.human.food, cap: stockCap(supply) };
}

/** Stretches a side holds, and how many of them are hot springs. */
export function held(run: RunState, side: Side): { segments: number; springs: number } {
  let segments = 0;
  for (const lane of [0, 1, 2] as const) for (let s = 0; s < run.segments[lane]!.length; s++) if (segOwner(run, lane, s) === side) segments++;
  let springs = 0;
  for (const sp of SPRINGS) if (segOwner(run, sp.lane, sp.seg) === side) springs++;
  return { segments, springs };
}

export function natureIncome(run: RunState, mods: Mods): IncomeParts {
  const h = held(run, 'nature');
  const main = run.buildings.some((b) => b.kind === 'mothertree') ? motherIncome(run, mods) : 0;
  const ground = h.segments * BALANCE.nature.perSegment * mods.income;
  const springs = h.springs * BALANCE.nature.spring * mods.income;
  return { main, ground, springs, gather: 0, total: main + ground + springs };
}

export function humanIncome(run: RunState): IncomeParts {
  const h = held(run, 'human');
  const lodge = run.buildings.find((b) => b.kind === 'lodge');
  const main = lodge ? (BUILDINGS.lodge.income ?? 0) + BALANCE.human.incomePerStage * (run.stage - 1) : 0;
  const ground = h.segments * BALANCE.human.perSegment;
  const springs = h.springs * BALANCE.human.spring;
  let workers = 0;
  for (const u of run.units) if (u.kind === 'gatherer' && unitSegment(u) >= 0) workers++;
  const gather = workers * BALANCE.human.gather;
  return { main, ground, springs, gather, total: main + ground + springs + gather };
}

/** Would one more of this unit still be fed? */
export function canFeed(ctx: Ctx, kind: UnitId, nature: FoodSummary, human: FoodLine): boolean {
  const def = UNITS[kind];
  const eat = unitEat(kind, ctx.mods);
  const line = def.diet === 'grass' ? nature.grass : def.diet === 'meat' ? nature.meat : human;
  return line.demand + eat <= line.supply + 1e-6;
}

/** Feed both sides: food stocks fill or drain; when a stock is empty and too many mouths, that layer starves. */
export function stepEconomy(ctx: Ctx, dt: number): void {
  const run = ctx.run;
  const nf = natureFood(run, ctx.mods);
  const hf = humanFood(run);
  run.essence += natureIncome(run, ctx.mods).total * dt;
  if (run.wonAt === null) run.human.supplies += humanIncome(run).total * dt;

  const feed = (line: FoodLine, set: (v: number) => void, side: Side, diet: Diet) => {
    const next = line.stock + (line.supply - line.demand) * dt;
    if (next >= 0) {
      set(Math.min(line.cap, next));
      markHungry(run, diet, false);
      return;
    }
    set(0);
    const short = line.demand > 0 ? Math.min(1, (line.demand - line.supply) / line.demand) : 0;
    if (short <= 0) return;
    const wasHungry = run.units.some((u) => u.hungry && UNITS[u.kind].diet === diet);
    markHungry(run, diet, true);
    if (!wasHungry) ctx.emit({ type: 'starving', side, diet });
    for (const u of run.units) {
      if (UNITS[u.kind].diet !== diet) continue;
      u.hp -= u.maxHp * BALANCE.nature.starve * short * dt;
    }
  };
  feed(nf.grass, (v) => (run.grassStock = v), 'nature', 'grass');
  feed(nf.meat, (v) => (run.meatStock = v), 'nature', 'meat');
  feed(hf, (v) => (run.human.food = v), 'human', 'food');
}

function markHungry(run: RunState, diet: Diet, hungry: boolean): void {
  for (const u of run.units) if (UNITS[u.kind].diet === diet) u.hungry = hungry;
}
