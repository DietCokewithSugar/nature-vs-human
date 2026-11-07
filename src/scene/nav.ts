import type { Rect } from './layout.ts';
import { MAP_HALF } from './world.ts';

/** Grid cell size in world units. */
const CELL = 2;
const N = (MAP_HALF * 2) / CELL;

export type NavMode = 'land' | 'water';

/**
 * A coarse walkability grid with A* for creatures, hunters and raid parties.
 * Land walkers keep out of deep water (except fords and bridges) and out of buildings;
 * swimmers keep to the water. Flyers do not path at all.
 */
export class NavGrid {
  private water = new Uint8Array(N * N);
  private blocked = new Uint8Array(N * N);
  private bridged = new Uint8Array(N * N);

  /** Mark water cells from a height test. */
  setWater(isWater: (x: number, z: number) => boolean): void {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) this.water[j * N + i] = isWater(this.cx(i), this.cx(j)) ? 1 : 0;
    }
  }

  setBridges(rects: Rect[]): void {
    this.bridged.fill(0);
    for (const r of rects) this.fill(this.bridged, r, 1);
  }

  setBlocked(rects: Rect[]): void {
    this.blocked.fill(0);
    for (const r of rects) this.fill(this.blocked, r, 1);
  }

  private fill(arr: Uint8Array, r: Rect, v: number): void {
    const [i0, j0] = this.cell(r.x0, r.z0);
    const [i1, j1] = this.cell(r.x1, r.z1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) arr[j * N + i] = v;
  }

  private cx(i: number): number {
    return -MAP_HALF + (i + 0.5) * CELL;
  }

  private cell(x: number, z: number): [number, number] {
    const i = Math.min(N - 1, Math.max(0, Math.floor((x + MAP_HALF) / CELL)));
    const j = Math.min(N - 1, Math.max(0, Math.floor((z + MAP_HALF) / CELL)));
    return [i, j];
  }

  private ok(k: number, mode: NavMode): boolean {
    if (mode === 'water') return this.water[k] === 1;
    if (this.blocked[k]) return false;
    return this.water[k] === 0 || this.bridged[k] === 1;
  }

  passable(x: number, z: number, mode: NavMode): boolean {
    const [i, j] = this.cell(x, z);
    return this.ok(j * N + i, mode);
  }

  /** Nearest passable cell centre to a point (searching outwards), or null. */
  nearest(x: number, z: number, mode: NavMode, maxRing = 12): [number, number] | null {
    const [ci, cj] = this.cell(x, z);
    for (let r = 0; r <= maxRing; r++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let j = cj - r; j <= cj + r; j++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          if (!this.ok(j * N + i, mode)) continue;
          const d = Math.hypot(this.cx(i) - x, this.cx(j) - z);
          if (d < bestD) {
            bestD = d;
            best = [this.cx(i), this.cx(j)];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * A* from one point to another. Returns waypoints (world x/z), simplified to corners,
   * ending exactly at the goal if it is reachable, else at the closest reachable cell. Null if stuck.
   */
  path(fx: number, fz: number, tx: number, tz: number, mode: NavMode): [number, number][] | null {
    const startCell = this.nearest(fx, fz, mode, 3);
    const goalCell = this.nearest(tx, tz, mode, 10);
    if (!startCell || !goalCell) return null;
    const [si, sj] = this.cell(startCell[0], startCell[1]);
    const [gi, gj] = this.cell(goalCell[0], goalCell[1]);
    const start = sj * N + si;
    const goal = gj * N + gi;
    const g = new Float32Array(N * N).fill(Infinity);
    const came = new Int32Array(N * N).fill(-1);
    const closed = new Uint8Array(N * N);
    const heap = new MinHeap();
    g[start] = 0;
    heap.push(start, 0);
    let bestK = start;
    let bestH = Infinity;
    const H = (k: number) => Math.hypot((k % N) - gi, Math.floor(k / N) - gj);
    let guard = 0;
    while (heap.size && guard++ < N * N) {
      const k = heap.pop();
      if (closed[k]) continue;
      closed[k] = 1;
      const h = H(k);
      if (h < bestH) {
        bestH = h;
        bestK = k;
      }
      if (k === goal) break;
      const i = k % N;
      const j = Math.floor(k / N);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const nk = nj * N + ni;
          if (closed[nk] || !this.ok(nk, mode)) continue;
          // No corner cutting past blocked cells.
          if (di && dj && (!this.ok(j * N + ni, mode) || !this.ok(nj * N + i, mode))) continue;
          const cost = g[k]! + (di && dj ? 1.414 : 1);
          if (cost < g[nk]!) {
            g[nk] = cost;
            came[nk] = k;
            heap.push(nk, cost + H(nk));
          }
        }
      }
    }
    const cells: number[] = [];
    for (let k = bestK; k !== -1; k = came[k]!) cells.push(k);
    cells.reverse();
    const pts: [number, number][] = cells.map((k) => [this.cx(k % N), this.cx(Math.floor(k / N))]);
    if (bestK === goal) pts.push([tx, tz]);
    return simplify(pts, (a, b) => this.clear(a, b, mode));
  }

  /** Is the straight line between two points passable? */
  clear(a: [number, number], b: [number, number], mode: NavMode): boolean {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.ceil(d / (CELL * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!this.passable(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, mode)) return false;
    }
    return true;
  }
}

/** Drop waypoints that a straight line can skip. */
function simplify(pts: [number, number][], clear: (a: [number, number], b: [number, number]) => boolean): [number, number][] {
  if (pts.length <= 2) return pts;
  const out: [number, number][] = [pts[0]!];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(pts[i]!, pts[j]!)) j--;
    out.push(pts[j]!);
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
