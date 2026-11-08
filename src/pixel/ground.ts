import { BRIDGES, CELLS, GRID, cellIndex, type EraId } from '../core/index.ts';
import { C, rgbOf } from './palette.ts';
import { TILE } from './specs.ts';

/**
 * The map's ground, painted pixel by pixel from the palette into one 512 × 512 image.
 *
 * Every cell picks a material from its biome, holder and era (the same rules as the 3D ground:
 * flat earth → rice paddies → brick and tiles → asphalt and lawns for the humans; meadows,
 * weedy sand, glaciers and reed beds for nature). Cell borders are jittered with noise so
 * neighbouring materials interlock instead of meeting on a ruler line, and a cell being fought
 * over is dithered between the two sides' ground in proportion to its control value.
 */

export const SIZE = GRID * TILE;

export interface GroundInput {
  era: EraId;
  owner: ArrayLike<number>;
  control: ArrayLike<number>;
}

export function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

type RGB = readonly [number, number, number];
const P = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, rgbOf(v)])) as unknown as Record<keyof typeof C, RGB>;

// Per-pixel noise, fixed for the map: border jitter and texture.
const WARP_X = new Float32Array(SIZE * SIZE);
const WARP_Y = new Float32Array(SIZE * SIZE);
const R = new Float32Array(SIZE * SIZE);
const LUMP = new Float32Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const p = y * SIZE + x;
    WARP_X[p] = (valueNoise(x / 5, y / 5) - 0.5) * 0.55 + (valueNoise(x / 2 + 40, y / 2) - 0.5) * 0.18;
    WARP_Y[p] = (valueNoise(x / 5 + 17, y / 5 - 9) - 0.5) * 0.55 + (valueNoise(x / 2, y / 2 + 40) - 0.5) * 0.18;
    R[p] = hash(x + 0.31, y + 0.77);
    LUMP[p] = valueNoise(x / 3.5 + 5, y / 3.5 + 11);
  }
}

/** Distance (in cells) from the sea, for the tide and the tsunami. */
export const COAST = (() => {
  const d = new Int16Array(GRID * GRID).fill(99);
  const q: number[] = [];
  CELLS.forEach((c, k) => {
    if (c.biome === 'sea') {
      d[k] = 0;
      q.push(k);
    }
  });
  while (q.length) {
    const k = q.shift()!;
    const c = CELLS[k]!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const i = c.i + di;
      const j = c.j + dj;
      if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
      const n = cellIndex(i, j);
      if (d[n]! > d[k]! + 1) {
        d[n] = d[k]! + 1;
        q.push(n);
      }
    }
  }
  return d;
})();

function bankOwner(st: GroundInput, k: number): number {
  const c = CELLS[k]!;
  let n = 0;
  let h = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = c.i + di;
      const j = c.j + dj;
      if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
      const o = st.owner[cellIndex(i, j)];
      if (o === 1) n++;
      else if (o === 2) h++;
    }
  }
  return h > n ? 2 : n > 0 ? 1 : 0;
}

/**
 * Base colour with clustered accents: light patches where the lumpy noise is high, dark where it is
 * low, half-dithered at their edges. Hardly any lone pixels, so the ground reads calm under units.
 */
function tex(p: number, base: RGB, light: RGB, dark: RGB, lightP = 0.12, darkP = 0.12): RGB {
  const l = LUMP[p]!;
  const r = R[p]!;
  if (l > 1 - lightP * 2.2) return r < 0.75 ? light : base;
  if (l < darkP * 2.2) return r < 0.75 ? dark : base;
  if (l > 1 - lightP * 2.8 && r < 0.3) return light;
  if (l < darkP * 2.8 && r < 0.3) return dark;
  return base;
}

const FLOWERS: RGB[] = [P.gold, P.pink, P.lavender, P.red, P.white];
const PEBBLES: RGB[] = [P.steel, P.clay, P.teal, P.violet, P.mist];

function natureLook(biome: string, p: number, x: number, y: number): RGB {
  switch (biome) {
    case 'forest':
      return tex(p, P.forest, P.green, P.pine, 0.1, 0.25);
    case 'ice':
      if ((x + y * 3) % 23 === 0 && R[p]! < 0.5) return P.sky;
      return tex(p, P.mist, P.white, P.steel, 0.25, 0.08);
    case 'sand': {
      const r = R[p]!;
      if (r < 0.025) return PEBBLES[Math.floor(r * 200) % PEBBLES.length]!;
      if (LUMP[p]! > 0.62 && r < 0.4) return r < 0.15 ? P.olive : P.moss;
      return tex(p, P.khaki, P.reed, P.dusk, 0.08, 0.08);
    }
    default: {
      const r = R[p]!;
      // Flowers come as a bright pixel with a darker stem pixel under it.
      if (r < 0.01) return FLOWERS[Math.floor(r * 360) % FLOWERS.length]!;
      // Grass blades: short vertical streaks.
      if (hash(x, Math.floor(y / 2)) < 0.035 && LUMP[p]! > 0.4) return P.green;
      return tex(p, P.forest, P.green, P.pine, 0.1, 0.12);
    }
  }
}

function humanLook(era: EraId, biome: string, i: number, j: number, sx: number, sy: number, p: number): RGB {
  if (biome === 'sand') return era >= 2 ? tex(p, P.white, P.white, P.mist, 0, 0.3) : tex(p, P.skin, P.white, P.apricot, 0.06, 0.1);
  const road = (n: number, w: number) => (i % n === 0 && sx < w) || (j % n === 0 && sy < w);
  switch (era) {
    case 1:
      return tex(p, P.khaki, P.reed, P.dusk, 0.05, 0.07);
    case 2: {
      if (road(4, 3)) return tex(p, P.steel, P.mist, P.lilacGrey, 0.1, 0.15);
      if (hash(i * 3, j * 7) < 0.25) return tex(p, P.khaki, P.reed, P.dusk, 0.05, 0.07);
      // Paddies: rows of rice and water, bunds at the cell edge.
      if (sx === 15 || sy === 15) return P.olive;
      return Math.floor(sy / 2) % 2 === 0 ? (R[p]! < 0.15 ? P.lime : P.moss) : P.teal;
    }
    case 3: {
      if (road(4, 3)) return R[p]! < 0.2 ? P.lilacGrey : P.steel;
      if (hash(i * 5, j) < 0.5) {
        // Brick: 4 × 2 courses with offset joints.
        const course = Math.floor(sy / 2);
        if (sy % 2 === 1 || (sx + (course % 2) * 2) % 4 === 0) return P.dusk;
        return R[p]! < 0.15 ? P.rust : P.brick;
      }
      // Tiles: pale squares with grout lines.
      return sx % 4 === 3 || sy % 4 === 3 ? P.steel : P.mist;
    }
    case 4: {
      if (road(3, 4)) {
        // Asphalt with a dashed centre line.
        if ((i % 3 === 0 && sx === 2 && sy % 4 < 2) || (j % 3 === 0 && sy === 2 && sx % 4 < 2)) return P.gold;
        return R[p]! < 0.08 ? P.slate : P.night;
      }
      const kind = hash(i * 5 + 1, j * 3 + 2);
      if (kind < 0.45) return (sx % 8 === 7 || sy % 8 === 7) ? P.steel : R[p]! < 0.05 ? P.steel : P.mist;
      if (kind < 0.8) {
        if (kind > 0.65 && sx > 5 && sx < 12 && sy > 5 && sy < 12) return R[p]! < 0.4 ? FLOWERS[Math.floor(R[p]! * 20) % 4]! : P.sage;
        // Mown lawn: muted stripes, so city green never reads as wild green.
        return Math.floor(sx / 3) % 2 === 0 ? P.sageLight : P.sage;
      }
      return sx % 8 === 7 || sy % 8 === 7 ? P.steel : R[p]! < 0.04 ? P.white : P.mist;
    }
  }
}

function neutralLook(biome: string, p: number, x: number, y: number): RGB {
  if (biome === 'sand') {
    // Dunes: wind ripples.
    if ((x + Math.floor(y * 0.5 + LUMP[p]! * 6)) % 9 === 0) return P.apricot;
    return tex(p, P.skin, P.white, P.apricot, 0.04, 0.12);
  }
  if (biome === 'ice') return natureLook('ice', p, x, y);
  return tex(p, P.pine, P.forest, P.bog, 0.1, 0.3);
}

function waterLook(st: GroundInput, k: number, biome: string, p: number, x: number, y: number, sx: number, sy: number): RGB {
  const c = CELLS[k]!;
  if (biome === 'sea') {
    // Deeper further from land.
    let near = 99;
    for (let d = 1; d < 4 && near === 99; d++) {
      for (const [di, dj] of [[d, 0], [-d, 0], [0, d], [0, -d]] as const) {
        const i = c.i + di;
        const j = c.j + dj;
        if (i >= 0 && j >= 0 && i < GRID && j < GRID && CELLS[cellIndex(i, j)]!.biome !== 'sea') near = d;
      }
    }
    if (wave(x, y)) return near <= 1 ? P.ice : P.sky;
    return near <= 1 ? tex(p, P.sky, P.sky, P.blue, 0, 0.1) : tex(p, P.blue, P.blue, P.indigo, 0, 0.12);
  }
  if (biome === 'volcano') {
    const lava = LUMP[p]! > 0.72 && R[p]! < 0.5;
    if (lava) return R[p]! < 0.2 ? P.gold : P.orange;
    return tex(p, P.night, P.slate, P.ink, 0.12, 0.15);
  }
  // Rivers, lakes and fords. Bridges in the humans' eras.
  if (BRIDGES[st.era].includes(k)) {
    const ns = CELLS[cellIndex(c.i, Math.max(0, c.j - 1))]!.water && CELLS[cellIndex(c.i, Math.min(GRID - 1, c.j + 1))]!.water;
    const across = ns ? sx : sy;
    const along = ns ? sy : sx;
    if (across > 3 && across < 12) {
      if (across === 4 || across === 11) return P.ink;
      if (st.era === 2) return along % 3 === 0 ? P.umber : P.rust;
      if (st.era === 3) return along % 4 === 0 ? P.lilacGrey : P.steel;
      return across === 7 || across === 8 ? (along % 4 < 2 ? P.white : P.night) : P.night;
    }
  }
  const bank = bankOwner(st, k);
  const edge = Math.min(sx, sy, 15 - sx, 15 - sy);
  if (biome === 'ford') return tex(p, P.ice, P.white, P.sky, 0.15, 0.1);
  if (bank === 2 && st.era >= 2 && edge === 0) return P.steel; // Canal walls.
  if (bank === 1 && edge <= 1 && R[p]! < 0.25) return R[p]! < 0.1 ? P.olive : P.reed; // Reeds along wild banks.
  if (wave(x, y)) return P.ice;
  return tex(p, P.sky, P.sky, P.blue, 0, 0.08);
}

/** Short horizontal wave crests, 3 px long, scattered on a loose grid. */
function wave(x: number, y: number): boolean {
  const cx = Math.floor(x / 7);
  const cy = Math.floor(y / 5);
  const h = hash(cx * 1.7, cy * 2.3);
  if (h > 0.45) return false;
  const ox = Math.floor(h * 13) % 4;
  return y % 5 === Math.floor(h * 10) % 5 && x % 7 >= ox && x % 7 < ox + 3;
}

/** The painter. Keeps the image and repaints only cells whose look changed. */
export class GroundPainter {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private sig = new Int32Array(GRID * GRID).fill(-1);
  private era: EraId | 0 = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(SIZE, SIZE);
  }

  /** Repaint what changed. Returns true when the image changed. */
  update(st: GroundInput): boolean {
    const dirty: number[] = [];
    const eraChanged = st.era !== this.era;
    this.era = st.era;
    for (let k = 0; k < GRID * GRID; k++) {
      const c = CELLS[k]!;
      let s: number;
      if (c.water) s = c.biome === 'sea' ? 1 : 2 + bankOwner(st, k) * 10;
      else if (c.biome === 'volcano') s = 3;
      else s = 100 + st.owner[k]! * 1000 + Math.round((st.control[k]! + 100) / 8);
      s += st.era * 100000;
      if (s !== this.sig[k] || eraChanged) {
        if (s !== this.sig[k]) dirty.push(k);
        this.sig[k] = s;
      }
    }
    if (eraChanged) {
      this.paintRect(0, 0, SIZE, SIZE, st);
    } else {
      if (!dirty.length) return false;
      for (const k of dirty) {
        const c = CELLS[k]!;
        // The jitter reaches about 6 px into neighbours.
        this.paintRect(c.i * TILE - 6, c.j * TILE - 6, TILE + 12, TILE + 12, st);
      }
    }
    this.ctx.putImageData(this.image, 0, 0);
    return true;
  }

  private paintRect(x0: number, y0: number, w: number, h: number, st: GroundInput): void {
    const d = this.image.data;
    const xa = Math.max(0, x0);
    const ya = Math.max(0, y0);
    const xb = Math.min(SIZE, x0 + w);
    const yb = Math.min(SIZE, y0 + h);
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const p = y * SIZE + x;
        const rgb = this.pixel(st, x, y, p);
        const o = p * 4;
        d[o] = rgb[0];
        d[o + 1] = rgb[1];
        d[o + 2] = rgb[2];
        d[o + 3] = 255;
      }
    }
  }

  private pixel(st: GroundInput, x: number, y: number, p: number): RGB {
    // Which cell this pixel belongs to, after jitter.
    const fi = Math.min(GRID - 1, Math.max(0, Math.floor(x / TILE + WARP_X[p]!)));
    const fj = Math.min(GRID - 1, Math.max(0, Math.floor(y / TILE + WARP_Y[p]!)));
    let k = cellIndex(fi, fj);
    let c = CELLS[k]!;
    // Water and patterned human ground keep straight edges where they meet themselves.
    const home = cellIndex(Math.floor(x / TILE), Math.floor(y / TILE));
    const hc = CELLS[home]!;
    if (hc.water !== c.water && (hc.biome === 'fresh' || c.biome === 'fresh') && BRIDGES[st.era].includes(home)) {
      k = home;
      c = hc;
    }
    const sx = x - c.i * TILE;
    const sy = y - c.j * TILE;
    const lx = ((sx % TILE) + TILE) % TILE;
    const ly = ((sy % TILE) + TILE) % TILE;
    if (c.water || c.biome === 'volcano') return waterLook(st, k, c.biome, p, x, y, lx, ly);
    const o = st.owner[k];
    const v = st.control[k]!;
    const r = hash(x * 0.37 + 3, y * 0.61 - 2);
    if (o === 2) {
      // Nature eating into the city: weeds spread in from noise-shaped patches.
      const creep = Math.max(0, Math.min(1, (v + 100) / 150));
      if (creep > 0.02 && (LUMP[p]! * 0.6 + r * 0.4) < creep * 0.75) return natureLook(c.biome === 'sand' ? 'sand' : 'plain', p, x, y);
      return humanLook(st.era, c.biome, c.i, c.j, lx, ly, p);
    }
    if (o === 1) {
      const trample = Math.max(0, Math.min(1, (100 - v) / 150));
      if (trample > 0.02 && (LUMP[p]! * 0.6 + r * 0.4) < trample * 0.65) return tex(p, P.khaki, P.reed, P.dusk, 0.05, 0.07);
      return natureLook(c.biome, p, x, y);
    }
    if (v > 2 && (LUMP[p]! * 0.6 + r * 0.4) < Math.min(1, v / 50) * 0.6) return natureLook(c.biome === 'forest' ? 'forest' : c.biome, p, x, y);
    if (v < -2 && (LUMP[p]! * 0.6 + r * 0.4) < Math.min(1, -v / 50) * 0.6) return tex(p, P.khaki, P.reed, P.dusk, 0.05, 0.07);
    return neutralLook(c.biome, p, x, y);
  }
}
