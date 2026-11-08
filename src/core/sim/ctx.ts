import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import { generateMap, type WorldMap } from '../map/generate.ts';
import { CELL, CELLS, GRID, cellAt, cxOf, cyOf, holdable } from '../map/grid.ts';
import { navFor, walkable, type Nav } from '../map/nav.ts';
import { nextRandom } from '../rng.ts';
import type { Building, MetaState, RunState, Unit } from '../state.ts';
import type { BuildingId, Owner, Side, UnitId } from '../types.ts';
import type { CoreEvent } from './events.ts';
import { buildingMaxHp, unitMaxHp, type Mods } from './stats.ts';

/** What every part of the simulation works with during a step. */
export interface Ctx {
  run: RunState;
  meta: MetaState;
  mods: Mods;
  emit: (e: CoreEvent) => void;
  /** Units and buildings by id, rebuilt at the start of each step. */
  byId: Map<number, Unit | Building>;
  /** The building standing on each cell, rebuilt at the start of each step. */
  onCell: Map<number, Building>;
  /** Cells nature can see right now (1), recomputed every step; not saved. */
  visible: Uint8Array;
}

export function rand(ctx: Ctx): number {
  return nextRandom(ctx.run);
}

export function mapOf(run: RunState): WorldMap {
  return generateMap(run.mapSeed);
}

export function navOf(run: RunState): Nav {
  return navFor(mapOf(run), run.era);
}

export function isUnit(e: Unit | Building): e is Unit {
  return 'goal' in e;
}

export function ownerOf(control: number): Owner {
  if (control >= BALANCE.territory.flip) return 'nature';
  if (control <= -BALANCE.territory.flip) return 'human';
  return 'neutral';
}

export function cellOwner(run: RunState, cell: number): Owner {
  return ownerOf(run.control[cell] ?? 0);
}

/** Is a cell part of the open map and holdable (not water or volcano)? */
export function openCell(run: RunState, cell: number): boolean {
  return walkable(mapOf(run), run.era, cell);
}

/** Side length of a building's footprint, in cells. */
export function footprintOf(kind: BuildingId): number {
  return BUILDINGS[kind].main ? 2 : 1;
}

export function footprintCells(kind: BuildingId, cell: number): number[] {
  return footprintOf(kind) === 2 ? [cell, cell + 1, cell + GRID, cell + GRID + 1] : [cell];
}

/** Body radius of a building: units stop this far from its foot to hit it. */
export function buildingRadius(kind: BuildingId): number {
  return BUILDINGS[kind].main ? 26 : 14;
}

/** Where a building's foot goes for a footprint whose top-left cell is `cell`. */
export function buildingSpot(kind: BuildingId, cell: number): { x: number; y: number } {
  const n = footprintOf(kind);
  return { x: (cxOf(cell) + n / 2) * CELL, y: (cyOf(cell) + n) * CELL - (n === 2 ? 8 : 6) };
}

export function mainOf(run: RunState, side: Side): Building | undefined {
  return run.buildings.find((b) => b.side === side && BUILDINGS[b.kind].main);
}

export function isMain(b: Building): boolean {
  return BUILDINGS[b.kind].main === true;
}

/** The building on a cell (any of a main building's four), if any. */
export function buildingAt(run: RunState, cell: number): Building | undefined {
  for (const b of run.buildings) if (footprintCells(b.kind, b.cell).includes(cell)) return b;
  return undefined;
}

/**
 * Can `side` put a building with this footprint here? Every cell must be open, held by that side
 * and free, with a clear cell between it and any other building (and off the resource sites).
 */
export function canPlace(run: RunState, side: Side, kind: BuildingId, cell: number): boolean {
  if (cell < 0 || cell >= CELLS) return false;
  const n = footprintOf(kind);
  const cx = cxOf(cell);
  const cy = cyOf(cell);
  if (cx + n > GRID || cy + n > GRID) return false;
  const map = mapOf(run);
  const cells = footprintCells(kind, cell);
  for (const c of cells) {
    if (!openCell(run, c) || cellOwner(run, c) !== side) return false;
    if (map.sites.some((s) => s.cell === c)) return false;
  }
  for (const b of run.buildings) {
    const bn = footprintOf(b.kind);
    const bx = cxOf(b.cell);
    const by = cyOf(b.cell);
    // Footprints grown by one cell all round must not overlap.
    if (cx < bx + bn + 1 && bx < cx + n + 1 && cy < by + bn + 1 && by < cy + n + 1) return false;
  }
  return true;
}

export function addBuilding(ctx: Ctx, kind: BuildingId, cell: number, done: boolean): Building {
  const def = BUILDINGS[kind];
  const spot = buildingSpot(kind, cell);
  const maxHp = buildingMaxHp(kind, ctx.run, ctx.mods);
  const b: Building = {
    id: ctx.run.nextId++,
    kind,
    side: def.side,
    cell,
    x: spot.x,
    y: spot.y,
    hp: done ? maxHp : maxHp * 0.1,
    maxHp,
    progress: done ? 1 : 0,
    timer: 0,
    shot: 0,
    blocked: null,
    hitAt: -99,
    seen: def.side === 'nature',
  };
  ctx.run.buildings.push(b);
  ctx.byId.set(b.id, b);
  for (const c of footprintCells(kind, cell)) ctx.onCell.set(c, b);
  return b;
}

export function addUnit(ctx: Ctx, kind: UnitId, home: number, x: number, y: number): Unit {
  const def = UNITS[kind];
  const maxHp = unitMaxHp(kind, ctx.run, ctx.mods);
  const spread = CELL / 2 - def.r - 2;
  const u: Unit = {
    id: ctx.run.nextId++,
    kind,
    side: def.side,
    x,
    y,
    home,
    goal: -1,
    rethink: 0,
    ox: Math.round((rand(ctx) * 2 - 1) * spread),
    oy: Math.round((rand(ctx) * 2 - 1) * spread),
    hp: maxHp,
    maxHp,
    target: 0,
    cd: rand(ctx) * 0.5,
    look: rand(ctx) * BALANCE.retarget,
    fought: -99,
    hitAt: -99,
    struckAt: -99,
    face: def.side === 'nature' ? 1 : -1,
    hungry: false,
  };
  ctx.run.units.push(u);
  ctx.byId.set(u.id, u);
  ctx.emit({ type: 'spawn', id: u.id, kind, side: u.side });
  return u;
}

/** The cell a unit stands on, if it's open ground (else −1). */
export function unitCell(run: RunState, u: Unit): number {
  const c = cellAt(u.x, u.y);
  return c >= 0 && openCell(run, c) ? c : -1;
}

/** Count cells by holder over the open map. */
export function landCounts(run: RunState): { nature: number; human: number; neutral: number; total: number } {
  const map = mapOf(run);
  const flip = BALANCE.territory.flip;
  let nature = 0;
  let human = 0;
  let total = 0;
  for (let i = 0; i < CELLS; i++) {
    if (map.ring[i]! > run.era || !holdable(map.terrain[i]!)) continue;
    total++;
    const c = run.control[i]!;
    if (c >= flip) nature++;
    else if (c <= -flip) human++;
  }
  return { nature, human, neutral: total - nature - human, total };
}
