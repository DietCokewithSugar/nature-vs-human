import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
import { CELL, CELLS, GRID, MAP_HALF, VOLCANOES, cellIndex, isOpen, type EraId } from '../core/index.ts';
import { GROUND, PALETTE } from './palette.ts';

/** Mesh cells per side: three per map cell, so a cell can carry a pattern (fields, roads, flowerbeds). */
const N = GRID * 3;
const STEP = (MAP_HALF * 2) / N;
const SKIRT_Y = -8;
export const SEABED_Y = -3;

// ── Noise ──────────────────────────────────────────────────────

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

/** Fractal noise in roughly [0, 1]. */
export function noise(x: number, z: number): number {
  return valueNoise(x / 14, z / 14) * 0.6 + valueNoise(x / 6 + 31, z / 6 - 17) * 0.3 + valueNoise(x / 2.5, z / 2.5) * 0.1;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ── Static fields from the map ─────────────────────────────────

const F = {
  sea: new Float32Array(GRID * GRID),
  fresh: new Float32Array(GRID * GRID),
  ford: new Float32Array(GRID * GRID),
  sand: new Float32Array(GRID * GRID),
  ice: new Float32Array(GRID * GRID),
  forest: new Float32Array(GRID * GRID),
};
CELLS.forEach((c, k) => {
  F.sea[k] = c.biome === 'sea' ? 1 : 0;
  F.fresh[k] = c.biome === 'fresh' ? 1 : 0;
  F.ford[k] = c.biome === 'ford' ? 1 : 0;
  F.sand[k] = c.biome === 'sand' ? 1 : 0;
  F.ice[k] = c.biome === 'ice' ? 1 : 0;
  F.forest[k] = c.biome === 'forest' ? 1 : 0;
});

/** Bilinear sample of a per-cell field at a world point (cells sampled at their centres). */
function sampleField(f: ArrayLike<number>, x: number, z: number): number {
  const gx = MathUtils.clamp((x + MAP_HALF) / CELL - 0.5, 0, GRID - 1);
  const gz = MathUtils.clamp((z + MAP_HALF) / CELL - 0.5, 0, GRID - 1);
  const i0 = Math.min(GRID - 2, Math.floor(gx));
  const j0 = Math.min(GRID - 2, Math.floor(gz));
  const u = gx - i0;
  const v = gz - j0;
  const a = f[j0 * GRID + i0]!;
  const b = f[j0 * GRID + i0 + 1]!;
  const c = f[(j0 + 1) * GRID + i0]!;
  const d = f[(j0 + 1) * GRID + i0 + 1]!;
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** How much of a point is under water (0 … 1), with a ragged shore. */
export function wetness(x: number, z: number): number {
  const w = sampleField(F.sea, x, z) + sampleField(F.fresh, x, z) + sampleField(F.ford, x, z) * 0.8;
  const wobble = (valueNoise(x / 3, z / 3) - 0.5) * 0.25;
  return smooth(0.32, 0.62, w + wobble);
}

/** The wild ground before anyone builds on it. */
export function naturalHeight(x: number, z: number): number {
  const n = noise(x, z);
  let h = 0.35 + n * 1.5;
  h = MathUtils.lerp(h, 0.2 + n * 0.35, sampleField(F.sand, x, z));
  h += sampleField(F.ice, x, z) * 1.4;
  h += sampleField(F.forest, x, z) * 0.25;
  // The volcanoes' foothills (the cones are models).
  for (const v of VOLCANOES) h += (v.size * 0.3) * Math.exp(-((Math.hypot(x - v.x, z - v.z) / (v.size * 0.6)) ** 2));
  const sea = sampleField(F.sea, x, z);
  const fresh = sampleField(F.fresh, x, z);
  const ford = sampleField(F.ford, x, z);
  const wsum = sea + fresh + ford;
  if (wsum > 0.01) {
    const bed = (sea * (SEABED_Y - n * 0.6) + fresh * -1.9 + ford * -0.6) / wsum;
    h = MathUtils.lerp(h, bed, wetness(x, z));
  }
  return h;
}

// ── What the ground looks like ─────────────────────────────────

export interface GroundState {
  era: EraId;
  owner: ArrayLike<number>;
  control: ArrayLike<number>;
  /** Cells with a building on them (levelled). */
  built: ArrayLike<number>;
}

const tmp = new Color();
const tmp2 = new Color();

function pick(pair: readonly [string, string], t: number, out: Color): Color {
  return out.set(pair[0]).lerp(tmp2.set(pair[1]), t);
}

/** Who holds most of the land around a water cell: canals for the city, reed beds for the wild. */
function bankOwner(st: GroundState, k: number): number {
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

function humanLook(era: EraId, k: number, si: number, sj: number, t: number, r: number, out: Color): Color {
  const c = CELLS[k]!;
  const H = GROUND.human;
  if (c.biome === 'sand') return pick(era >= 2 ? H.beach : H.beachEarly, t, out);
  switch (era) {
    case 1:
      return pick(c.biome === 'forest' || hash(c.i, c.j) > 0.7 ? H.earthDark : H.earth, t, out);
    case 2: {
      // Rice paddies in rows, stone paths along the field edges.
      if ((c.i % 4 === 0 && si === 0) || (c.j % 4 === 0 && sj === 0)) return pick(H.path, t, out);
      if (hash(c.i * 3, c.j * 7) < 0.25) return pick(H.earth, t, out);
      return pick(sj % 2 === 0 ? H.paddy : H.paddyWater, t, out);
    }
    case 3: {
      if ((c.i % 4 === 0 && si === 0) || (c.j % 4 === 0 && sj === 0)) return pick(H.path, t * 0.5, out);
      return pick((si + sj) % 2 === 0 ? H.brick : H.tile, t, out);
    }
    case 4: {
      if ((c.i % 3 === 0 && si === 0) || (c.j % 3 === 0 && sj === 0)) return pick(H.asphalt, t, out);
      const kind = hash(c.i * 5 + 1, c.j * 3 + 2);
      if (kind < 0.45) return pick(H.plaza, t, out);
      if (kind < 0.8) return pick(si === 1 && sj === 1 && kind > 0.65 ? H.bed : H.lawn, si === 1 && sj === 1 ? r : t, out);
      return pick(H.tile, t, out);
    }
  }
}

function natureLook(k: number, t: number, r: number, out: Color): Color {
  const c = CELLS[k]!;
  const G = GROUND.nature;
  switch (c.biome) {
    case 'forest':
      return pick(G.forest, t, out);
    case 'ice':
      return pick(G.ice, t, out);
    case 'sand':
      if (r < 0.14) return out.set(G.pebbles[Math.floor((r / 0.14) * G.pebbles.length)]!);
      if (r < 0.3) return pick(G.weeds, t, out);
      return pick(G.sand, t, out);
    default:
      if (r < 0.12) return out.set(G.flowers[Math.floor((r / 0.12) * G.flowers.length)]!);
      return pick(G.meadow, t, out);
  }
}

/** Colour of one small triangle of a cell. */
function groundColor(st: GroundState, k: number, si: number, sj: number, t: number, r: number, out: Color): Color {
  const c = CELLS[k]!;
  const open = isOpen(st.era, k);
  if (c.biome === 'sea') pick(GROUND.seabed, t, out);
  else if (c.biome === 'fresh' || c.biome === 'ford') {
    const b = bankOwner(st, k);
    pick(b === 2 ? GROUND.human.canal : b === 1 ? GROUND.nature.mud : GROUND.riverbed, t, out);
  } else if (c.biome === 'volcano') pick(GROUND.volcano, t, out);
  else {
    const o = st.owner[k];
    const v = st.control[k]!;
    if (o === 2) {
      humanLook(st.era, k, si, sj, t, r, out);
      // Nature eating into the city: weeds and cracks spread across it.
      const p = MathUtils.clamp((v + 100) / 150, 0, 1);
      if (p > 0.02) out.lerp(pick(GROUND.nature.weeds, t, tmp), p * 0.7);
    } else if (o === 1) {
      natureLook(k, t, r, out);
      const p = MathUtils.clamp((100 - v) / 150, 0, 1);
      if (p > 0.02) out.lerp(pick(GROUND.human.earth, t, tmp), p * 0.65);
    } else {
      if (c.biome === 'sand') pick(GROUND.neutral.dunes, t, out);
      else if (c.biome === 'ice') pick(GROUND.nature.ice, t, out);
      else pick(GROUND.neutral.forest, t, out);
      if (v > 2) out.lerp(natureLook(k, t, r, tmp), Math.min(1, v / 50) * 0.6);
      else if (v < -2) out.lerp(pick(GROUND.human.earth, t, tmp), Math.min(1, -v / 50) * 0.6);
    }
  }
  if (!open) out.lerp(pick(GROUND.fog, t, tmp), 0.55).multiplyScalar(0.8);
  return out;
}

// ── The mesh ───────────────────────────────────────────────────

const VERTS = (N + 1) * (N + 1);
const TRIS = N * N * 2;

/** Per triangle: map cell, sub-cell, and two noise values for colour. */
const TRI_CELL = new Int16Array(TRIS);
const TRI_SUB = new Uint8Array(TRIS * 2);
const TRI_T = new Float32Array(TRIS);
const TRI_R = new Float32Array(TRIS);
{
  let t = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      for (let half = 0; half < 2; half++) {
        const cx = -MAP_HALF + (i + (half ? 2 / 3 : 1 / 3)) * STEP;
        const cz = -MAP_HALF + (j + (half ? 2 / 3 : 1 / 3)) * STEP;
        TRI_CELL[t] = cellIndex(Math.floor(i / 3), Math.floor(j / 3));
        TRI_SUB[t * 2] = i % 3;
        TRI_SUB[t * 2 + 1] = j % 3;
        TRI_T[t] = noise(cx * 1.7 + 9, cz * 1.7 - 4);
        TRI_R[t] = hash(i * 2 + half + 0.5, j + 0.25);
        t++;
      }
    }
  }
}

/**
 * The map's ground: a faceted heightfield on a floating board, plus the water plane.
 * Human ground is flattened and paved in its era's style; wild ground keeps its hills.
 * Colours and heights ease when cells change hands.
 */
export class Terrain {
  readonly group = new Group();
  readonly water: Mesh;
  private geo = new BufferGeometry();
  private skirtGeo = new BufferGeometry();
  private height = new Float32Array(VERTS);
  private heightTo = new Float32Array(VERTS);
  private natural = new Float32Array(VERTS);
  private color = new Float32Array(TRIS * 3);
  private colorTo = new Float32Array(TRIS * 3);
  private flat = new Float32Array(GRID * GRID);
  private signature = '';
  private heightMoving = false;
  private colorMoving = false;
  private colorClock = 0;
  private first = true;

  constructor() {
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) this.natural[j * (N + 1) + i] = naturalHeight(-MAP_HALF + i * STEP, -MAP_HALF + j * STEP);
    }
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array(TRIS * 9), 3));
    this.geo.setAttribute('color', new BufferAttribute(new Float32Array(TRIS * 9), 3));
    const ground = new Mesh(this.geo, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);

    const edge = N * 4;
    this.skirtGeo.setAttribute('position', new BufferAttribute(new Float32Array(edge * 18), 3));
    const skirt = new Mesh(this.skirtGeo, new MeshLambertMaterial({ color: PALETTE.boardSide, side: DoubleSide }));
    this.group.add(skirt);
    const bottom = new Mesh(new PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2), new MeshLambertMaterial({ color: PALETTE.boardSide }));
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = SKIRT_Y;
    this.group.add(bottom);

    const water = new Mesh(
      new PlaneGeometry(MAP_HALF * 2 - 0.02, MAP_HALF * 2 - 0.02),
      new MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.72, depthWrite: false }),
    );
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 2;
    water.name = 'water';
    this.water = water;
    this.group.add(water);
  }

  /**
   * Take the current state of the ground. Heights are recomputed only when holders or buildings change;
   * colours every call (control creeps continuously).
   */
  setGround(st: GroundState): void {
    let sig = String(st.era);
    for (let k = 0; k < GRID * GRID; k++) sig += st.owner[k] === 2 || st.built[k] ? '1' : '0';
    if (sig !== this.signature) {
      this.signature = sig;
      this.heightMoving = true;
      const strength = st.era === 1 ? 0.6 : 1;
      for (let k = 0; k < GRID * GRID; k++) this.flat[k] = st.owner[k] === 2 ? strength : st.built[k] ? 0.5 : 0;
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i <= N; i++) {
          const x = -MAP_HALF + i * STEP;
          const z = -MAP_HALF + j * STEP;
          const v = j * (N + 1) + i;
          let h = this.natural[v]!;
          if (h > -0.5) {
            const f = smooth(0.15, 0.85, sampleField(this.flat, x, z));
            h = MathUtils.lerp(h, Math.min(h, 0.15 + (h - 0.15) * 0.15), f);
          }
          this.heightTo[v] = h;
        }
      }
    }
    const c = new Color();
    for (let t = 0; t < TRIS; t++) {
      groundColor(st, TRI_CELL[t]!, TRI_SUB[t * 2]!, TRI_SUB[t * 2 + 1]!, TRI_T[t]!, TRI_R[t]!, c);
      const jitter = 1 + (TRI_R[t]! - 0.5) * 0.08;
      this.colorTo[t * 3] = c.r * jitter;
      this.colorTo[t * 3 + 1] = c.g * jitter;
      this.colorTo[t * 3 + 2] = c.b * jitter;
    }
    if (this.first) {
      this.first = false;
      this.height.set(this.heightTo);
      this.color.set(this.colorTo);
      this.writePositions();
      this.writeColors();
      this.heightMoving = false;
      return;
    }
    this.colorMoving = true;
  }

  update(dt: number): void {
    if (this.heightMoving) {
      const k = 1 - Math.exp(-dt * 2.2);
      let delta = 0;
      for (let i = 0; i < VERTS; i++) {
        const d = this.heightTo[i]! - this.height[i]!;
        this.height[i] = this.height[i]! + d * k;
        delta = Math.max(delta, Math.abs(d));
      }
      this.writePositions();
      if (delta < 0.002) this.heightMoving = false;
    }
    // Colours ease at ten frames a second: cheap on phones, still smooth to the eye.
    this.colorClock -= dt;
    if (this.colorMoving && this.colorClock <= 0) {
      const step = 0.1 - this.colorClock;
      this.colorClock = 0.1;
      const k = 1 - Math.exp(-step * 2.5);
      let delta = 0;
      for (let i = 0; i < TRIS * 3; i++) {
        const d = this.colorTo[i]! - this.color[i]!;
        this.color[i] = this.color[i]! + d * k;
        delta = Math.max(delta, Math.abs(d));
      }
      this.writeColors();
      if (delta < 0.003) this.colorMoving = false;
    }
  }

  /** Ground height under a point (current, while easing). */
  heightAt(x: number, z: number): number {
    return this.sample(this.height, x, z);
  }

  /** Ground height it is easing towards. */
  targetHeightAt(x: number, z: number): number {
    return this.sample(this.heightTo, x, z);
  }

  private sample(arr: Float32Array, x: number, z: number): number {
    const fx = MathUtils.clamp((x + MAP_HALF) / STEP, 0, N - 1e-6);
    const fz = MathUtils.clamp((z + MAP_HALF) / STEP, 0, N - 1e-6);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = j * (N + 1) + i;
    const a = arr[k]!;
    const b = arr[k + 1]!;
    const c = arr[k + N + 1]!;
    const d = arr[k + N + 2]!;
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  private writePositions(): void {
    const pos = this.geo.getAttribute('position') as BufferAttribute;
    const p = pos.array as Float32Array;
    const h = this.height;
    let o = 0;
    const put = (i: number, j: number) => {
      p[o++] = -MAP_HALF + i * STEP;
      p[o++] = h[j * (N + 1) + i]!;
      p[o++] = -MAP_HALF + j * STEP;
    };
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        // Triangle a (i,j) c (i,j+1) b (i+1,j), then b c d.
        put(i, j);
        put(i, j + 1);
        put(i + 1, j);
        put(i + 1, j);
        put(i, j + 1);
        put(i + 1, j + 1);
      }
    }
    pos.needsUpdate = true;
    // Flat shading takes its normals from screen-space derivatives; only the bounds need refreshing.
    this.geo.computeBoundingSphere();
    this.writeSkirt();
  }

  private writeColors(): void {
    const col = this.geo.getAttribute('color') as BufferAttribute;
    const cc = col.array as Float32Array;
    for (let t = 0; t < TRIS; t++) {
      const r = this.color[t * 3]!;
      const g = this.color[t * 3 + 1]!;
      const b = this.color[t * 3 + 2]!;
      const o = t * 9;
      cc[o] = cc[o + 3] = cc[o + 6] = r;
      cc[o + 1] = cc[o + 4] = cc[o + 7] = g;
      cc[o + 2] = cc[o + 5] = cc[o + 8] = b;
    }
    col.needsUpdate = true;
  }

  private writeSkirt(): void {
    const pos = this.skirtGeo.getAttribute('position') as BufferAttribute;
    const p = pos.array as Float32Array;
    let o = 0;
    const quad = (x0: number, z0: number, y0: number, x1: number, z1: number, y1: number) => {
      const v = [x0, y0, z0, x0, SKIRT_Y, z0, x1, y1, z1, x1, y1, z1, x0, SKIRT_Y, z0, x1, SKIRT_Y, z1];
      for (const n of v) p[o++] = n;
    };
    const h = this.height;
    const H = (i: number, j: number) => Math.max(h[j * (N + 1) + i]!, SEABED_Y - 1);
    const X = (i: number) => -MAP_HALF + i * STEP;
    for (let i = 0; i < N; i++) {
      quad(X(i), MAP_HALF, H(i, N), X(i + 1), MAP_HALF, H(i + 1, N));
      quad(X(i + 1), -MAP_HALF, H(i + 1, 0), X(i), -MAP_HALF, H(i, 0));
      quad(-MAP_HALF, X(i), H(0, i), -MAP_HALF, X(i + 1), H(0, i + 1));
      quad(MAP_HALF, X(i + 1), H(N, i + 1), MAP_HALF, X(i), H(N, i));
    }
    pos.needsUpdate = true;
    this.skirtGeo.computeVertexNormals();
    this.skirtGeo.computeBoundingSphere();
  }

  setWaterLevel(y: number, surge: boolean, dt: number): void {
    this.water.position.y = MathUtils.damp(this.water.position.y || y, y, 3, dt);
    const mat = this.water.material as MeshLambertMaterial;
    mat.color.lerp(new Color(surge ? PALETTE.waterSurge : PALETTE.water), Math.min(1, dt * 3));
  }

  /** Is a point under water at the given level? */
  isWater(x: number, z: number, level = -0.9): boolean {
    return this.targetHeightAt(x, z) < level;
  }
}
