import { CELL, CELLS, CELL_COUNT, GRID, MAP_HALF, NODES, isOpen } from '../map/grid.ts';
import { Nav } from '../map/nav.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import type { Building, RunState, Unit } from '../state.ts';
import type { Side } from '../types.ts';

/** Owner codes in RunState.owner. */
export const NEUTRAL = 0;
export const NATURE = 1;
export const HUMAN = 2;

export function sideCode(side: Side): number {
  return side === 'nature' ? NATURE : HUMAN;
}

export function enemyOf(side: Side): Side {
  return side === 'nature' ? 'human' : 'nature';
}

/** Pollinators live outside the population cap: each hive keeps its own few. */
function isCollector(u: Unit): boolean {
  return UNITS[u.kind].role === 'collect';
}

/** Aura effects on one unit for the current step. */
export interface UnitFx {
  /** Speed multiplier (the strongest slow wins). */
  slow: number;
  /** Attack multipliers: the strongest hindrance and the strongest help. */
  atkDown: number;
  atkUp: number;
  /** The lamp it is drawn to, if any. */
  lure: { x: number; z: number } | null;
}

/** Something worth walking to: an enemy cell to work, or an enemy building to break. */
export interface Objective {
  kind: 'cell' | 'building';
  /** Cell index, or building id. */
  ref: number;
  x: number;
  z: number;
  /** Units already heading there. */
  claim: number;
}

/**
 * Lookups the simulation rebuilds from the run state: entities by id, buildings by cell,
 * units by cell, frontiers. Nothing here is saved.
 */
export class World {
  readonly nav = new Nav();
  readonly units = new Map<number, Unit>();
  readonly buildings = new Map<number, Building>();
  /** Building standing on each cell, or undefined. */
  byCell: (Building | undefined)[] = new Array(CELL_COUNT);
  /** Units in each cell this step. */
  bucket: Unit[][] = Array.from({ length: CELL_COUNT }, () => []);
  /** Living units per home building. */
  homeCount = new Map<number, number>();
  pop = { nature: 0, human: 0 };
  /** Cells held per side, among open claimable ground, and the total of that ground. */
  held = { nature: 0, human: 0, neutral: 0, total: 0 };
  /** Where each side wants to push: cells and buildings at its edge. */
  objectives: Record<Side, Objective[]> = { nature: [], human: [] };
  /** The same, for swimmers: only what can be reached from the water. */
  shore: Record<Side, Objective[]> = { nature: [], human: [] };
  /** Waypoints per unit (not saved; recomputed after loading). */
  paths = new Map<number, [number, number][]>();
  /** Objective each unit is heading for. */
  claims = new Map<number, Objective>();
  /** What auras are doing to each unit this step (missing means untouched). */
  fx = new Map<number, UnitFx>();
  private frontierClock = 0;

  /** Rebuild every lookup from scratch (after loading or starting a run). */
  rebuild(run: RunState): void {
    this.nav.setEra(run.era);
    this.units.clear();
    this.buildings.clear();
    this.byCell = new Array(CELL_COUNT);
    this.homeCount.clear();
    this.paths.clear();
    this.claims.clear();
    this.pop = { nature: 0, human: 0 };
    for (const b of run.buildings) {
      this.buildings.set(b.id, b);
      this.byCell[b.cell] = b;
    }
    for (const u of run.units) this.addUnit(u);
    this.refreshDams(run);
    this.countCells(run);
    this.frontierClock = 0;
    this.refreshObjectives(run);
  }

  addUnit(u: Unit): void {
    this.units.set(u.id, u);
    if (!isCollector(u)) this.pop[u.side]++;
    if (u.home) this.homeCount.set(u.home, (this.homeCount.get(u.home) ?? 0) + 1);
  }

  removeUnit(u: Unit): void {
    this.units.delete(u.id);
    if (!isCollector(u)) this.pop[u.side]--;
    if (u.home) this.homeCount.set(u.home, Math.max(0, (this.homeCount.get(u.home) ?? 1) - 1));
    this.paths.delete(u.id);
    this.release(u.id);
  }

  addBuilding(b: Building): void {
    this.buildings.set(b.id, b);
    this.byCell[b.cell] = b;
  }

  removeBuilding(b: Building): void {
    this.buildings.delete(b.id);
    if (this.byCell[b.cell] === b) this.byCell[b.cell] = undefined;
    this.homeCount.delete(b.id);
  }

  /** Close the river to wild swimmers wherever a finished dam stands. */
  refreshDams(run: RunState): void {
    const cells: number[] = [];
    for (const b of run.buildings) if (b.build >= 1 && BUILDINGS[b.kind].blocks) cells.push(b.cell);
    this.nav.setDams(cells);
  }

  /** Re-sort units into cells. */
  bucketUnits(run: RunState): void {
    for (const list of this.bucket) list.length = 0;
    for (const u of run.units) {
      const i = Math.min(GRID - 1, Math.max(0, Math.floor((u.x + MAP_HALF) / CELL)));
      const j = Math.min(GRID - 1, Math.max(0, Math.floor((u.z + MAP_HALF) / CELL)));
      this.bucket[j * GRID + i]!.push(u);
    }
  }

  /** Units within r of a point (from the last bucketing). */
  near(x: number, z: number, r: number, out: Unit[] = []): Unit[] {
    out.length = 0;
    const i0 = Math.max(0, Math.floor((x - r + MAP_HALF) / CELL));
    const i1 = Math.min(GRID - 1, Math.floor((x + r + MAP_HALF) / CELL));
    const j0 = Math.max(0, Math.floor((z - r + MAP_HALF) / CELL));
    const j1 = Math.min(GRID - 1, Math.floor((z + r + MAP_HALF) / CELL));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (const u of this.bucket[j * GRID + i]!) {
          const dx = u.x - x;
          const dz = u.z - z;
          if (dx * dx + dz * dz <= r2) out.push(u);
        }
      }
    }
    return out;
  }

  countCells(run: RunState): void {
    const h = { nature: 0, human: 0, neutral: 0, total: 0 };
    for (let k = 0; k < CELL_COUNT; k++) {
      if (!CELLS[k]!.claimable || !isOpen(run.era, k)) continue;
      h.total++;
      const o = run.owner[k];
      if (o === NATURE) h.nature++;
      else if (o === HUMAN) h.human++;
      else h.neutral++;
    }
    this.held = h;
  }

  /** Resource points held by a side. */
  nodesHeld(run: RunState, side: Side): number {
    const code = sideCode(side);
    let n = 0;
    for (const node of NODES) if (isOpen(run.era, node.cell) && run.owner[node.cell] === code) n++;
    return n;
  }

  /** Recompute each side's objectives now and then. */
  tickObjectives(run: RunState, dt: number): void {
    this.frontierClock -= dt;
    if (this.frontierClock > 0) return;
    this.frontierClock = 1;
    this.refreshObjectives(run);
  }

  refreshObjectives(run: RunState): void {
    for (const side of ['nature', 'human'] as const) {
      const own = sideCode(side);
      const cells: Objective[] = [];
      const shore: Objective[] = [];
      const seen = new Set<number>();
      const push = (k: number) => {
        if (seen.has(k)) return;
        seen.add(k);
        const c = CELLS[k]!;
        const b = this.byCell[k];
        const target: Objective =
          b && b.side !== side
            ? { kind: 'building', ref: b.id, x: b.x, z: b.z, claim: 0 }
            : { kind: 'cell', ref: k, x: c.x, z: c.z, claim: 0 };
        if (b && b.side === side) return;
        cells.push(target);
        if (this.touchesWater(run, k)) shore.push({ ...target });
      };
      for (let k = 0; k < CELL_COUNT; k++) {
        if (run.owner[k] !== own || !isOpen(run.era, k)) continue;
        const c = CELLS[k]!;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const i = c.i + di;
            const j = c.j + dj;
            if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
            const n = j * GRID + i;
            if (n === k || run.owner[n] === own || !CELLS[n]!.claimable || !isOpen(run.era, n)) continue;
            push(n);
          }
        }
      }
      // Enemy buildings near the front are fair game too.
      for (const b of run.buildings) {
        if (b.side === side) continue;
        const c = CELLS[b.cell]!;
        let close = false;
        for (let dj = -2; dj <= 2 && !close; dj++) {
          for (let di = -2; di <= 2 && !close; di++) {
            const i = c.i + di;
            const j = c.j + dj;
            if (i >= 0 && j >= 0 && i < GRID && j < GRID && run.owner[j * GRID + i] === own) close = true;
          }
        }
        if (close) push(b.cell);
      }
      // Keep claims on objectives that are still there.
      this.objectives[side] = cells;
      this.shore[side] = shore;
    }
    this.claims.clear();
  }

  private touchesWater(run: RunState, k: number): boolean {
    const c = CELLS[k]!;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = c.i + di;
        const j = c.j + dj;
        if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
        const n = j * GRID + i;
        if (CELLS[n]!.water && isOpen(run.era, n)) return true;
      }
    }
    return false;
  }

  claim(unitId: number, o: Objective): void {
    this.release(unitId);
    o.claim++;
    this.claims.set(unitId, o);
  }

  release(unitId: number): void {
    const o = this.claims.get(unitId);
    if (o) o.claim = Math.max(0, o.claim - 1);
    this.claims.delete(unitId);
  }
}
