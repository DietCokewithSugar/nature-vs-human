import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import { CELLS, holdable } from '../map/grid.ts';
import type { RunState } from '../state.ts';
import type { Diet, Side, UnitId } from '../types.ts';
import { mapOf, unitCell, type Ctx } from './ctx.ts';
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
  sites: number;
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

/** Cells a side holds on the open map, and how many of them are resource sites. */
export function held(run: RunState, side: Side): { cells: number; sites: number } {
  const map = mapOf(run);
  const flip = BALANCE.territory.flip;
  const sign = side === 'nature' ? 1 : -1;
  let cells = 0;
  for (let i = 0; i < CELLS; i++) {
    if (map.ring[i]! > run.era || !holdable(map.terrain[i]!)) continue;
    if (run.control[i]! * sign >= flip) cells++;
  }
  let sites = 0;
  for (const s of map.sites) if (map.ring[s.cell]! <= run.era && run.control[s.cell]! * sign >= flip) sites++;
  return { cells, sites };
}

export function natureIncome(run: RunState, mods: Mods): IncomeParts {
  const h = held(run, 'nature');
  const main = run.buildings.some((b) => b.kind === 'mothertree') ? motherIncome(run, mods) : 0;
  const ground = h.cells * BALANCE.nature.perCell * mods.income;
  const sites = h.sites * BALANCE.nature.site * mods.income;
  return { main, ground, sites, gather: 0, total: main + ground + sites };
}

export function humanIncome(run: RunState): IncomeParts {
  const h = held(run, 'human');
  const lodge = run.buildings.find((b) => b.kind === 'lodge');
  const main = lodge ? (BUILDINGS.lodge.income ?? 0) + BALANCE.human.incomePerStage * (run.stage - 1) : 0;
  const ground = h.cells * BALANCE.human.perCell;
  const sites = h.sites * BALANCE.human.site;
  // Gatherers bring in supplies while they work ground that isn't the humans' yet.
  let workers = 0;
  for (const u of run.units) {
    if (u.kind !== 'gatherer') continue;
    const c = unitCell(run, u);
    if (c >= 0 && run.control[c]! > -BALANCE.territory.flip) workers++;
  }
  const gather = workers * BALANCE.human.gather;
  return { main, ground, sites, gather, total: main + ground + sites + gather };
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
