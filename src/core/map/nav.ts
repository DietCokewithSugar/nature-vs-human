import type { EraId } from '../types.ts';
import { BRIDGES, CELL, CELLS, CELL_COUNT, GRID, MAP_HALF, cellAt, cellIndex, isOpen } from './grid.ts';

/** land: walkers (fords and bridges are fine). water: swimmers in any water. sea: open-water swimmers. air: flyers. */
export type NavMode = 'land' | 'water' | 'sea' | 'air';
const MODES: readonly NavMode[] = ['land', 'water', 'sea', 'air'];

/**
 * Walkability on the cell grid, with A* and a small path cache. Paths are lists of world points
 * (corners only), ending at the goal, or at the reachable cell nearest to it.
 */
export class Nav {
  private ok: Record<NavMode, Uint8Array> = {
    land: new Uint8Array(CELL_COUNT),
    water: new Uint8Array(CELL_COUNT),
    sea: new Uint8Array(CELL_COUNT),
    air: new Uint8Array(CELL_COUNT),
  };
  private cache = new Map<string, number[] | null>();
  private era: EraId | null = null;
  /** Cells closed to nature's swimmers by a standing dam. */
  private dammed = new Uint8Array(CELL_COUNT);

  setEra(era: EraId): void {
    if (this.era === era) return;
    this.era = era;
    this.cache.clear();
    const bridged = new Set(BRIDGES[era]);
    CELLS.forEach((c, k) => {
      const open = isOpen(era, k);
      this.ok.land[k] = open && (c.walkable || bridged.has(k)) ? 1 : 0;
      this.ok.water[k] = open && c.water ? 1 : 0;
      this.ok.sea[k] = open && c.biome === 'sea' ? 1 : 0;
      this.ok.air[k] = open ? 1 : 0;
    });
  }

  /** Dams standing now: their cells are closed to wild swimmers. */
  setDams(cells: number[]): void {
    const next = new Uint8Array(CELL_COUNT);
    for (const k of cells) next[k] = 1;
    if (next.every((v, k) => v === this.dammed[k])) return;
    this.dammed = next;
    for (const key of [...this.cache.keys()]) if (key.startsWith('wild')) this.cache.delete(key);
  }

  isDammed(k: number): boolean {
    return this.dammed[k] === 1;
  }

  /** `wild` swimmers (nature's) are stopped by dams; the humans' boats go through the locks. */
  cellOk(k: number, mode: NavMode, wild = false): boolean {
    if (wild && this.dammed[k] && (mode === 'water' || mode === 'sea')) return false;
    return this.ok[mode][k] === 1;
  }

  passable(x: number, z: number, mode: NavMode, wild = false): boolean {
    if (x < -MAP_HALF || z < -MAP_HALF || x >= MAP_HALF || z >= MAP_HALF) return false;
    return this.cellOk(cellAt(x, z), mode, wild);
  }

  /** Is the straight line between two points passable? */
  clear(ax: number, az: number, bx: number, bz: number, mode: NavMode, wild = false): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 1);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (!this.passable(ax + (bx - ax) * t, az + (bz - az) * t, mode, wild)) return false;
    }
    return true;
  }

  /** The passable cell nearest to a cell (searching outwards ring by ring), or -1. */
  nearest(k: number, mode: NavMode, maxRing = 6, wild = false): number {
    if (this.cellOk(k, mode, wild)) return k;
    const c = CELLS[k]!;
    for (let r = 1; r <= maxRing; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let j = c.j - r; j <= c.j + r; j++) {
        for (let i = c.i - r; i <= c.i + r; i++) {
          if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
          if (Math.max(Math.abs(i - c.i), Math.abs(j - c.j)) !== r) continue;
          const n = cellIndex(i, j);
          if (!this.cellOk(n, mode, wild)) continue;
          const d = Math.hypot(i - c.i, j - c.j);
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Waypoints from one point to another, or null if the start is stuck. Flyers go straight. */
  path(fx: number, fz: number, tx: number, tz: number, mode: NavMode, wild = false): [number, number][] | null {
    const w = wild && (mode === 'water' || mode === 'sea');
    if (mode === 'air' || this.clear(fx, fz, tx, tz, mode, w)) return [[tx, tz]];
    const from = this.nearest(cellAt(fx, fz), mode, 2, w);
    const to = this.nearest(cellAt(tx, tz), mode, 6, w);
    if (from < 0 || to < 0) return null;
    const key = `${w ? 'wild' : ''}${mode}:${from}:${to}`;
    let cells = this.cache.get(key);
    if (cells === undefined) {
      cells = this.astar(from, to, mode, w);
      if (this.cache.size > 4000) this.cache.clear();
      this.cache.set(key, cells);
    }
    if (!cells) return null;
    const pts: [number, number][] = cells.map((k) => [CELLS[k]!.x, CELLS[k]!.z]);
    const reached = cells[cells.length - 1] === to && this.passable(tx, tz, mode, w);
    if (reached) pts.push([tx, tz]);
    return simplify([fx, fz], pts, (a, b) => this.clear(a[0], a[1], b[0], b[1], mode, w));
  }

  private astar(start: number, goal: number, mode: NavMode, wild: boolean): number[] | null {
    const base = this.ok[mode];
    const ok = wild ? base.map((v, k) => (v && !this.dammed[k] ? 1 : 0)) : base;
    const g = new Float32Array(CELL_COUNT).fill(Infinity);
    const came = new Int32Array(CELL_COUNT).fill(-1);
    const closed = new Uint8Array(CELL_COUNT);
    const heap = new MinHeap();
    const gi = goal % GRID;
    const gj = Math.floor(goal / GRID);
    const H = (k: number) => Math.hypot((k % GRID) - gi, Math.floor(k / GRID) - gj);
    g[start] = 0;
    heap.push(start, H(start));
    let bestK = start;
    let bestH = H(start);
    while (heap.size) {
      const k = heap.pop();
      if (closed[k]) continue;
      closed[k] = 1;
      const h = H(k);
      if (h < bestH) {
        bestH = h;
        bestK = k;
      }
      if (k === goal) break;
      const i = k % GRID;
      const j = Math.floor(k / GRID);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
          const nk = nj * GRID + ni;
          if (closed[nk] || !ok[nk]) continue;
          if (di && dj && (!ok[j * GRID + ni] || !ok[nj * GRID + i])) continue;
          const cost = g[k]! + (di && dj ? 1.414 : 1);
          if (cost < g[nk]!) {
            g[nk] = cost;
            came[nk] = k;
            heap.push(nk, cost + H(nk));
          }
        }
      }
    }
    const out: number[] = [];
    for (let k = bestK; k !== -1; k = came[k]!) out.push(k);
    out.reverse();
    return out;
  }
}

/** Drop waypoints a straight line can skip, starting from the walker's own position. */
function simplify(from: [number, number], pts: [number, number][], clear: (a: [number, number], b: [number, number]) => boolean): [number, number][] {
  const all: [number, number][] = [from, ...pts];
  const out: [number, number][] = [];
  let i = 0;
  while (i < all.length - 1) {
    let j = all.length - 1;
    while (j > i + 1 && !clear(all[i]!, all[j]!)) j--;
    out.push(all[j]!);
    i = j;
  }
  return out;
}

class MinHeap {
  private keys: number[] = [];
  private pri: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(k: number, p: number): void {
    this.keys.push(k);
    this.pri.push(p);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri[parent]! <= this.pri[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.keys[0]!;
    const lastK = this.keys.pop()!;
    const lastP = this.pri.pop()!;
    if (this.keys.length) {
      this.keys[0] = lastK;
      this.pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.pri[l]! < this.pri[m]!) m = l;
        if (r < this.keys.length && this.pri[r]! < this.pri[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.pri[a], this.pri[b]] = [this.pri[b]!, this.pri[a]!];
  }
}

export { MODES as NAV_MODES, CELL as NAV_CELL };
