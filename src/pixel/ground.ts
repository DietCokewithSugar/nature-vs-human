import { Container, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import { CELL, CELLS, GRID, TERRAINS, T, holdable, type WorldMap } from '../core/index.ts';
import { tex } from './atlas.ts';

/**
 * The ground under everything, baked into chunks of 8 × 8 cells. A chunk is re-baked when a
 * cell in or next to it changes hands (or the era changes the humans' style), and only when it
 * is on screen, a few per frame.
 */
const CHUNK = 8;
const CHUNK_PX = CHUNK * CELL;
const NCH = GRID / CHUNK;
/** Which terrain spills its fringe over which (same order as art/map.py). */
const PRIORITY = [4, 6, 3, 2, 5, 1, 0, 7]; // by terrain code: grass forest dune beach snow stream water volcano
const SIDES = [
  [0, -1, 'n'],
  [1, 0, 'e'],
  [0, 1, 's'],
  [-1, 0, 'w'],
] as const;
const CORNERS = [
  [1, -1, 'ne'],
  [1, 1, 'se'],
  [-1, 1, 'sw'],
  [-1, -1, 'nw'],
] as const;
const NATURE_ALPHA = [0, 0.35, 0.65, 1];
const HUMAN_ALPHA = [0, 0.3, 0.6, 1];

function hash(a: number, b: number, s: number): number {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** −3 … 3: how far a cell has gone towards the humans (−) or nature (+), in steps the art shows. */
export function controlLevel(c: number): number {
  const a = Math.abs(c);
  const l = a >= 50 ? 3 : a >= 35 ? 2 : a >= 20 ? 1 : 0;
  return c < 0 ? -l : l;
}

export class Ground {
  readonly layer = new Container();
  private renderer: Renderer;
  private map: WorldMap | null = null;
  private era = -1;
  private chunks: (Sprite | null)[] = new Array(NCH * NCH).fill(null);
  private dirty = new Uint8Array(NCH * NCH).fill(1);
  private levels = new Int8Array(CELLS);

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  /** A new map (a new run) or a new era: everything is re-baked as it comes into view. */
  reset(map: WorldMap, era: number, control: number[]): void {
    this.map = map;
    this.era = era;
    for (let i = 0; i < CELLS; i++) this.levels[i] = controlLevel(control[i]!);
    this.dirty.fill(1);
  }

  /** Mark chunks whose cells changed level; bake a few dirty chunks inside the view rect (map px). */
  update(map: WorldMap, era: number, control: number[], view: { x0: number; y0: number; x1: number; y1: number }): void {
    if (map !== this.map || era !== this.era) this.reset(map, era, control);
    const lv = this.levels;
    for (let i = 0; i < CELLS; i++) {
      const l = controlLevel(control[i]!);
      if (l === lv[i]) continue;
      lv[i] = l;
      const cx = i % GRID;
      const cy = (i - cx) / GRID;
      // The cell's own chunk and any chunk its overhang or curbs reach.
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        this.dirty[Math.floor(y / CHUNK) * NCH + Math.floor(x / CHUNK)] = 1;
      }
    }
    let budget = 3;
    const j0 = Math.max(0, Math.floor(view.y0 / CHUNK_PX));
    const j1 = Math.min(NCH - 1, Math.floor(view.y1 / CHUNK_PX));
    const i0 = Math.max(0, Math.floor(view.x0 / CHUNK_PX));
    const i1 = Math.min(NCH - 1, Math.floor(view.x1 / CHUNK_PX));
    for (let j = j0; j <= j1 && budget > 0; j++) {
      for (let i = i0; i <= i1 && budget > 0; i++) {
        const k = j * NCH + i;
        if (!this.dirty[k] && this.chunks[k]) continue;
        // A chunk never seen yet is baked even if the budget is spent, so the view has no holes.
        if (this.chunks[k]) budget--;
        this.bake(i, j);
      }
    }
    for (let k = 0; k < this.chunks.length; k++) {
      const s = this.chunks[k];
      if (!s) continue;
      const i = k % NCH;
      const j = (k - i) / NCH;
      s.visible = i >= i0 - 1 && i <= i1 + 1 && j >= j0 - 1 && j <= j1 + 1;
    }
  }

  private bake(ci: number, cj: number): void {
    const map = this.map!;
    const k = cj * NCH + ci;
    this.dirty[k] = 0;
    let s = this.chunks[k];
    if (!s) {
      const rt = RenderTexture.create({ width: CHUNK_PX, height: CHUNK_PX, resolution: 1 });
      rt.source.scaleMode = 'nearest';
      s = new Sprite(rt);
      s.position.set(ci * CHUNK_PX, cj * CHUNK_PX);
      this.layer.addChild(s);
      this.chunks[k] = s;
    }
    const root = new Container();
    const ox = ci * CHUNK_PX;
    const oy = cj * CHUNK_PX;
    const put = (key: string, x: number, y: number, alpha = 1) => {
      const sp = new Sprite(tex(key));
      sp.position.set(x - ox, y - oy);
      sp.alpha = alpha;
      root.addChild(sp);
      return sp;
    };
    const terr = map.terrain;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? -1 : terr[y * GRID + x]!);
    const x0 = ci * CHUNK;
    const y0 = cj * CHUNK;
    // 1. Bare terrain and the fringes where terrains meet.
    for (let cy = y0; cy < y0 + CHUNK; cy++) {
      for (let cx = x0; cx < x0 + CHUNK; cx++) {
        const t = at(cx, cy);
        const px = cx * CELL;
        const py = cy * CELL;
        put(`tile/${TERRAINS[t]}/${Math.floor(hash(cx, cy, 3) * 3)}`, px, py);
        const p = PRIORITY[t]!;
        const sideT: number[] = [];
        for (const [dx, dy, d] of SIDES) {
          const n = at(cx + dx, cy + dy);
          sideT.push(n);
          if (n >= 0 && PRIORITY[n]! > p) put(`edge/${TERRAINS[n]}/${d}`, px, py);
        }
        for (const [dx, dy, d] of CORNERS) {
          const n = at(cx + dx, cy + dy);
          if (n < 0 || PRIORITY[n]! <= p) continue;
          const a = at(cx + dx, cy);
          const b = at(cx, cy + dy);
          if (a === n || b === n) continue;
          put(`edge/${TERRAINS[n]}/${d}`, px, py);
        }
      }
    }
    // 2. Who holds it: nature's patches spill over their neighbours, so draw a cell's ring too.
    const lv = this.levels;
    for (let cy = y0 - 1; cy <= y0 + CHUNK; cy++) {
      for (let cx = x0 - 1; cx <= x0 + CHUNK; cx++) {
        if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) continue;
        const i = cy * GRID + cx;
        const l = lv[i]!;
        if (l <= 0 || !holdable(terr[i]!)) continue;
        put(`own/nature/${TERRAINS[terr[i]!]}/${Math.floor(hash(cx, cy, 5) * 2)}`, cx * CELL - 4, cy * CELL - 4, NATURE_ALPHA[l]);
      }
    }
    for (let cy = y0; cy < y0 + CHUNK; cy++) {
      for (let cx = x0; cx < x0 + CHUNK; cx++) {
        const i = cy * GRID + cx;
        const l = lv[i]!;
        if (l >= 0 || !holdable(terr[i]!)) continue;
        put(`own/human/${this.era}/${TERRAINS[terr[i]!]}/${Math.floor(hash(cx, cy, 6) * 2)}`, cx * CELL, cy * CELL, HUMAN_ALPHA[-l]);
        if (l !== -3) continue;
        for (const [dx, dy, d] of SIDES) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
          if (lv[ny * GRID + nx] !== -3) put(`curb/${this.era}/${d}`, cx * CELL, cy * CELL);
        }
      }
    }
    // 3. Trees, rocks and the volcano cones, back to front. The row below reaches up into this chunk.
    const decos: [number, number, string][] = [];
    for (let cy = y0; cy <= y0 + CHUNK; cy++) {
      for (let cx = x0 - 1; cx <= x0 + CHUNK; cx++) {
        if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) continue;
        const i = cy * GRID + cx;
        const t = terr[i]!;
        const l = lv[i]!;
        const px = cx * CELL;
        const py = cy * CELL;
        const h = (s: number) => hash(cx, cy, s);
        if (t === T.forest) {
          if (l === 3) {
            for (let n = 0; n < 2; n++) decos.push([px + 7 + n * 16 + Math.floor(h(20 + n) * 5), py + 14 + Math.floor(h(30 + n) * 14), `deco/lush/${n}`]);
          } else if (l === -3) {
            if (this.era === 0) decos.push([px + 10 + Math.floor(h(21) * 12), py + 14 + Math.floor(h(31) * 12), 'deco/stump/0']);
          } else {
            const snowy = map.ring[i] === 0 && h(40) < 0.5;
            const kind = snowy ? 'snowpine' : 'pine';
            const spots = [
              [6, 12],
              [20, 10],
              [12, 24],
              [26, 26],
            ];
            for (let n = 0; n < 4; n++) {
              if (n === 3 && h(41) < 0.5) continue;
              const [sx, sy] = spots[n]!;
              decos.push([px + sx! + Math.floor(h(50 + n) * 5) - 2, py + sy! + Math.floor(h(60 + n) * 5), `deco/${kind}/${Math.floor(h(70 + n) * 3)}`]);
            }
          }
        } else if (t === T.dune && l === 0 && h(22) < 0.3) decos.push([px + 8 + Math.floor(h(23) * 16), py + 12 + Math.floor(h(24) * 16), 'deco/shrub/0']);
        else if (t === T.snow && l === 0 && h(25) < 0.35) decos.push([px + 8 + Math.floor(h(26) * 16), py + 12 + Math.floor(h(27) * 16), 'deco/drift/0']);
        else if (t === T.grass && l === 0 && h(28) < 0.12) decos.push([px + 8 + Math.floor(h(29) * 16), py + 12 + Math.floor(h(32) * 16), `deco/rock/${Math.floor(h(33) * 3)}`]);
      }
    }
    for (const v of map.volcanoes) {
      const vx = (v % GRID) * CELL + CELL / 2;
      const vy = Math.floor(v / GRID) * CELL + CELL;
      if (vx < ox - 48 || vx > ox + CHUNK_PX + 48 || vy < oy || vy > oy + CHUNK_PX + 64) continue;
      decos.push([vx, vy, 'deco/volcano/0']);
    }
    decos.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, y, key] of decos) put(key, x, y);
    this.renderer.render({ container: root, target: s.texture as RenderTexture, clear: true });
    root.destroy({ children: true });
  }

  destroy(): void {
    for (const s of this.chunks) s?.destroy({ texture: true, textureSource: true });
    this.chunks.fill(null);
  }
}
