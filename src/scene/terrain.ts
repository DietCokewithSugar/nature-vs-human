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
import type { EraId } from '../core/index.ts';
import { NATURE, PALETTE } from './palette.ts';
import {
  BAY,
  FORDS,
  LAIR_SPOTS,
  MAP_HALF,
  RIVER,
  RIVER_HALF_WIDTH,
  SEABED_Y,
  VOLCANO,
  ZONE_AREAS,
  southCoastZ,
  territoryDistance,
  westCoastX,
} from './world.ts';

/** Cells per side. Each cell is two flat-shaded triangles, the same faceted look as the models. */
const CELLS = 80;
const STEP = (MAP_HALF * 2) / CELLS;
const SKIRT_Y = -8;

// ── Noise ──────────────────────────────────────────────────────

function hash(x: number, z: number): number {
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

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

export function riverDistance(x: number, z: number): number {
  let d = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i]!;
    const [bx, bz] = RIVER[i + 1]!;
    d = Math.min(d, distToSegment(x, z, ax, az, bx, bz));
  }
  return d;
}

function fordShallowness(x: number, z: number): number {
  let best = 0;
  for (const [fx, fz] of FORDS) best = Math.max(best, smooth(4.5, 2, Math.hypot(x - fx, z - fz)));
  return best;
}

/** 0 on land, 1 out at sea (the west coast, the bay and the south coast). */
export function seaness(x: number, z: number): number {
  const wobble = (valueNoise(x / 5, z / 5) - 0.5) * 3;
  const west = smooth(westCoastX(z) + 2, westCoastX(z) - 3, x + wobble);
  const bay = smooth(BAY.r + 2, BAY.r - 4, Math.hypot(x - BAY.x, z - BAY.z) + wobble);
  const south = x < 34 ? smooth(southCoastZ(x) - 2, southCoastZ(x) + 3, z + wobble) : 0;
  return Math.max(west, bay, south);
}

/** The wild ground before anyone builds on it. */
export function naturalHeight(x: number, z: number): number {
  const n = noise(x, z);
  let h = 0.35 + n * 1.6;
  // Low hills in the north, a ridge along the top edge.
  h += smooth(-46, -62, z) * 2.4;
  // The volcano's foothills (the cone itself is a model).
  h += 4.2 * Math.exp(-((Math.hypot(x - VOLCANO.x, z - VOLCANO.z) / 17) ** 2));
  // The plains are flatter.
  const plains = ZONE_AREAS.plains;
  h -= smooth(plains.r, plains.r * 0.5, Math.hypot(x - plains.x, z - plains.z)) * n * 1.1;
  const sea = seaness(x, z);
  h = MathUtils.lerp(h, SEABED_Y - n * 0.6, sea);
  const river = smooth(RIVER_HALF_WIDTH + 1.6, RIVER_HALF_WIDTH - 0.6, riverDistance(x, z));
  const bed = MathUtils.lerp(-2.4, -0.7, fordShallowness(x, z));
  h = MathUtils.lerp(h, Math.min(h, bed), river);
  return h;
}

/** The ground in an era: human territory flattened to 0, lair sites levelled. Water stays water. */
export function eraHeight(era: EraId, x: number, z: number): number {
  let h = naturalHeight(x, z);
  if (h > -0.6) {
    const f = smooth(4, 0, territoryDistance(era, x, z));
    h = MathUtils.lerp(h, 0, f);
  }
  for (const spot of Object.values(LAIR_SPOTS)) {
    if (spot.water) continue;
    const d = Math.hypot(x - spot.x, z - spot.z);
    const r = spot.size * 0.5;
    if (d > r + 2.5) continue;
    const base = Math.max(0.15, naturalHeight(spot.x, spot.z));
    h = MathUtils.lerp(h, base, smooth(r + 2.5, r, d));
  }
  return h;
}

/** Colour of the wild ground at a point, by era and region. */
function natureColor(era: EraId, x: number, z: number, h: number, out: Color): Color {
  const n = noise(x * 1.7 + 9, z * 1.7 - 4);
  const pick = (pair: readonly [string, string]) => out.set(pair[0]).lerp(new Color(pair[1]), n);
  if (h < -1.1) return pick(NATURE.seabed);
  if (era === 1) {
    if (h < 0.2) return pick(NATURE.tundra);
    if (h > 1.1 || z < -30) return pick(NATURE.snow);
    return pick(NATURE.tundra);
  }
  const zone = (k: keyof typeof ZONE_AREAS, scale = 1) => {
    const a = ZONE_AREAS[k];
    return Math.hypot(x - a.x, z - a.z) < a.r * scale;
  };
  // Beaches along the sea only; river banks stay green.
  if (h < 0.45 && seaness(x, z) > 0.04) return pick(NATURE.sand);
  if (h > 3.2) return pick(NATURE.rock);
  if (zone('volcano', 0.85)) return pick(NATURE.ash);
  if (zone('plains')) return pick(NATURE.plains);
  if (zone('forest', 1.1)) return pick(NATURE.forest);
  if (z < -50 && era < 4) return pick(NATURE.rock);
  return pick(NATURE.grass);
}

// ── The mesh ───────────────────────────────────────────────────

const VERTS = (CELLS + 1) * (CELLS + 1);
const TRIS = CELLS * CELLS * 2;

/**
 * The map's ground: a faceted heightfield on a floating board, plus the water plane.
 * Changing era eases heights and colours to the new layout over a second or two.
 */
export class Terrain {
  readonly group = new Group();
  readonly water: Mesh;
  private geo = new BufferGeometry();
  private skirtGeo = new BufferGeometry();
  private height = new Float32Array(VERTS);
  private heightFrom = new Float32Array(VERTS);
  private heightTo = new Float32Array(VERTS);
  private color = new Float32Array(TRIS * 3);
  private colorFrom = new Float32Array(TRIS * 3);
  private colorTo = new Float32Array(TRIS * 3);
  private blend = 1;
  private era: EraId | null = null;

  constructor() {
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array(TRIS * 9), 3));
    this.geo.setAttribute('color', new BufferAttribute(new Float32Array(TRIS * 9), 3));
    const ground = new Mesh(this.geo, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);

    const edge = CELLS * 4;
    this.skirtGeo.setAttribute('position', new BufferAttribute(new Float32Array(edge * 18), 3));
    const skirt = new Mesh(this.skirtGeo, new MeshLambertMaterial({ color: PALETTE.boardSide, side: DoubleSide }));
    this.group.add(skirt);
    const bottom = new Mesh(new PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2), new MeshLambertMaterial({ color: PALETTE.boardSide }));
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = SKIRT_Y;
    this.group.add(bottom);

    const water = new Mesh(
      new PlaneGeometry(MAP_HALF * 2 - 0.02, MAP_HALF * 2 - 0.02),
      new MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.74, depthWrite: false }),
    );
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 2;
    water.name = 'water';
    this.water = water;
    this.group.add(water);
  }

  /** Move to an era's layout. The first call snaps; later calls ease. */
  setEra(era: EraId): void {
    if (this.era === era) return;
    const first = this.era === null;
    this.era = era;
    const c = new Color();
    for (let j = 0; j <= CELLS; j++) {
      for (let i = 0; i <= CELLS; i++) {
        const k = j * (CELLS + 1) + i;
        this.heightTo[k] = eraHeight(era, -MAP_HALF + i * STEP, -MAP_HALF + j * STEP);
      }
    }
    let t = 0;
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        for (let half = 0; half < 2; half++) {
          // Centroid of the triangle.
          const cx = -MAP_HALF + (i + (half ? 2 / 3 : 1 / 3)) * STEP;
          const cz = -MAP_HALF + (j + (half ? 2 / 3 : 1 / 3)) * STEP;
          const h = this.sampleTo(cx, cz);
          if (h > -0.6 && territoryDistance(era, cx, cz) < 0.6) c.set(NATURE.cleared[0]).lerp(new Color(NATURE.cleared[1]), noise(cx, cz));
          else natureColor(era, cx, cz, h, c);
          const jitter = 1 + (hash(i * 2 + half, j) - 0.5) * 0.07;
          this.colorTo[t * 3] = c.r * jitter;
          this.colorTo[t * 3 + 1] = c.g * jitter;
          this.colorTo[t * 3 + 2] = c.b * jitter;
          t++;
        }
      }
    }
    if (first) {
      this.height.set(this.heightTo);
      this.color.set(this.colorTo);
      this.blend = 1;
      this.write();
    } else {
      this.heightFrom.set(this.height);
      this.colorFrom.set(this.color);
      this.blend = 0;
    }
  }

  /** Done easing into the current era. */
  get settled(): boolean {
    return this.blend >= 1;
  }

  update(dt: number): void {
    if (this.blend >= 1) return;
    this.blend = Math.min(1, this.blend + dt / 1.8);
    const k = MathUtils.smootherstep(this.blend, 0, 1);
    for (let i = 0; i < VERTS; i++) this.height[i] = this.heightFrom[i]! + (this.heightTo[i]! - this.heightFrom[i]!) * k;
    for (let i = 0; i < TRIS * 3; i++) this.color[i] = this.colorFrom[i]! + (this.colorTo[i]! - this.colorFrom[i]!) * k;
    this.write();
  }

  private sampleTo(x: number, z: number): number {
    return this.sample(this.heightTo, x, z);
  }

  /** Ground height under a point (current, while easing between eras). */
  heightAt(x: number, z: number): number {
    return this.sample(this.height, x, z);
  }

  /** Ground height the current era is easing towards. */
  targetHeightAt(x: number, z: number): number {
    return this.sample(this.heightTo, x, z);
  }

  private sample(arr: Float32Array, x: number, z: number): number {
    const fx = MathUtils.clamp((x + MAP_HALF) / STEP, 0, CELLS - 1e-6);
    const fz = MathUtils.clamp((z + MAP_HALF) / STEP, 0, CELLS - 1e-6);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = j * (CELLS + 1) + i;
    const a = arr[k]!;
    const b = arr[k + 1]!;
    const c = arr[k + CELLS + 1]!;
    const d = arr[k + CELLS + 2]!;
    // Match the mesh's triangle split (a-c-b / b-c-d).
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  private write(): void {
    const pos = this.geo.getAttribute('position') as BufferAttribute;
    const col = this.geo.getAttribute('color') as BufferAttribute;
    const p = pos.array as Float32Array;
    const cc = col.array as Float32Array;
    let t = 0;
    const h = this.height;
    const put = (o: number, i: number, j: number) => {
      p[o] = -MAP_HALF + i * STEP;
      p[o + 1] = h[j * (CELLS + 1) + i]!;
      p[o + 2] = -MAP_HALF + j * STEP;
    };
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        // Triangle a (i,j) c (i,j+1) b (i+1,j), then b c d.
        const o = t * 9;
        put(o, i, j);
        put(o + 3, i, j + 1);
        put(o + 6, i + 1, j);
        put(o + 9, i + 1, j);
        put(o + 12, i, j + 1);
        put(o + 15, i + 1, j + 1);
        for (let q = 0; q < 2; q++) {
          const ci = (t + q) * 3;
          for (let v = 0; v < 3; v++) {
            cc[(t + q) * 9 + v * 3] = this.color[ci]!;
            cc[(t + q) * 9 + v * 3 + 1] = this.color[ci + 1]!;
            cc[(t + q) * 9 + v * 3 + 2] = this.color[ci + 2]!;
          }
        }
        t += 2;
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.writeSkirt();
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
    const H = (i: number, j: number) => Math.max(h[j * (CELLS + 1) + i]!, SEABED_Y - 1);
    const X = (i: number) => -MAP_HALF + i * STEP;
    for (let i = 0; i < CELLS; i++) {
      quad(X(i), MAP_HALF, H(i, CELLS), X(i + 1), MAP_HALF, H(i + 1, CELLS));
      quad(X(i + 1), -MAP_HALF, H(i + 1, 0), X(i), -MAP_HALF, H(i, 0));
      quad(-MAP_HALF, X(i), H(0, i), -MAP_HALF, X(i + 1), H(0, i + 1));
      quad(MAP_HALF, X(i + 1), H(CELLS, i + 1), MAP_HALF, X(i), H(CELLS, i));
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
