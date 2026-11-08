import { CELL, CELLS, NEIGHBOURS, cellAt, cxOf, cyOf, holdable, idx, inGrid } from './grid.ts';
import type { WorldMap } from './generate.ts';
import { MinHeap } from './heap.ts';

/**
 * Walking: units go straight when nothing is in the way and otherwise follow a distance field
 * (Dijkstra over cells, 8-way without cutting corners) towards their goal cell. Fields are cached
 * per goal; the cache is keyed by era because each era opens more ground.
 */

const INF = 1e9;
const MAX_FIELDS = 96;

/** Can a unit stand in this cell in this era? */
export function walkable(map: WorldMap, era: number, cell: number): boolean {
  return cell >= 0 && map.ring[cell]! <= era && holdable(map.terrain[cell]!);
}

export class Nav {
  readonly map: WorldMap;
  readonly era: number;
  private fields = new Map<number, Float64Array>();

  constructor(map: WorldMap, era: number) {
    this.map = map;
    this.era = era;
  }

  passable(cell: number): boolean {
    return walkable(this.map, this.era, cell);
  }

  passableAt(x: number, y: number): boolean {
    return this.passable(cellAt(x, y));
  }

  /** Distance (in cells) from every cell to `goal`; INF where it can't be reached. */
  field(goal: number): Float64Array {
    const hit = this.fields.get(goal);
    if (hit) {
      // Refresh its place in the LRU order.
      this.fields.delete(goal);
      this.fields.set(goal, hit);
      return hit;
    }
    const dist = new Float64Array(CELLS).fill(INF);
    if (this.passable(goal)) {
      const heap = new MinHeap();
      dist[goal] = 0;
      heap.push(goal, 0);
      while (heap.size) {
        const d0 = heap.peekKey();
        const i = heap.pop();
        if (d0 > dist[i]!) continue;
        const cx = cxOf(i);
        const cy = cyOf(i);
        for (let k = 0; k < 8; k++) {
          const [dx, dy] = NEIGHBOURS[k]!;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inGrid(nx, ny)) continue;
          const n = idx(nx, ny);
          if (!this.passable(n)) continue;
          // No squeezing diagonally between two blocked cells.
          if (k >= 4 && (!this.passable(idx(cx + dx, cy)) || !this.passable(idx(cx, cy + dy)))) continue;
          const nd = d0 + (k >= 4 ? 1.4142 : 1);
          if (nd < dist[n]!) {
            dist[n] = nd;
            heap.push(n, nd);
          }
        }
      }
    }
    this.fields.set(goal, dist);
    if (this.fields.size > MAX_FIELDS) this.fields.delete(this.fields.keys().next().value!);
    return dist;
  }

  /** Walking distance in cells between two cells (INF if there's no way). */
  distance(from: number, to: number): number {
    return this.field(to)[from]!;
  }

  /** Is the straight line between two points clear of water and volcanoes? */
  clear(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.ceil(d / (CELL / 4));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      if (!this.passableAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  /**
   * Where to head next on the way from (x, y) to (gx, gy): the goal itself when the way is clear,
   * otherwise the furthest of the next few cells down the field that can be seen from here.
   */
  waypoint(x: number, y: number, gx: number, gy: number): [number, number] {
    if (this.clear(x, y, gx, gy)) return [gx, gy];
    const goal = cellAt(gx, gy);
    let cur = cellAt(x, y);
    if (!this.passable(goal) || cur < 0) return [gx, gy];
    const f = this.field(goal);
    if (f[cur]! >= INF) {
      // Standing somewhere odd (pushed into a corner): step to the best neighbour.
      cur = this.bestNeighbour(f, cur) ?? cur;
      return [(cxOf(cur) + 0.5) * CELL, (cyOf(cur) + 0.5) * CELL];
    }
    let target: [number, number] = [gx, gy];
    let found = false;
    for (let step = 0; step < 6; step++) {
      const next = this.bestNeighbour(f, cur);
      if (next === null || next === cur) break;
      cur = next;
      const px = (cxOf(cur) + 0.5) * CELL;
      const py = (cyOf(cur) + 0.5) * CELL;
      if (step > 0 && !this.clear(x, y, px, py)) break;
      target = [px, py];
      found = true;
      if (cur === goal) break;
    }
    return found ? target : [gx, gy];
  }

  private bestNeighbour(f: Float64Array, i: number): number | null {
    const cx = cxOf(i);
    const cy = cyOf(i);
    let best: number | null = null;
    let bestD = f[i]!;
    for (let k = 0; k < 8; k++) {
      const [dx, dy] = NEIGHBOURS[k]!;
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inGrid(nx, ny)) continue;
      const n = idx(nx, ny);
      if (k >= 4 && (!this.passable(idx(cx + dx, cy)) || !this.passable(idx(cx, cy + dy)))) continue;
      if (f[n]! < bestD) {
        bestD = f[n]!;
        best = n;
      }
    }
    return best;
  }
}

/** Nav objects per (map, era), so every step reuses the same field cache. */
const navs = new WeakMap<WorldMap, Nav[]>();

export function navFor(map: WorldMap, era: number): Nav {
  let list = navs.get(map);
  if (!list) {
    list = [];
    navs.set(map, list);
  }
  let nav = list[era];
  if (!nav) {
    nav = new Nav(map, era);
    list[era] = nav;
  }
  return nav;
}

export { INF as UNREACHABLE };
