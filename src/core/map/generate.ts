import type { HumanBuildingId } from '../types.ts';
import { CELLS, ERA_COUNT, ERA_HALF, GRID, NEIGHBOURS, T, cellGap, cxOf, cyOf, holdable, idx, inGrid, ringOf } from './grid.ts';
import { MinHeap } from './heap.ts';

/**
 * Seeded map generation. The layout is fixed in its broad strokes, like a ladder map in an RTS:
 *
 *   - The humans' capital sits in the middle. When a run starts they hold 51–53 % of the land in
 *     the ice-age square, grown out from the capital over open ground.
 *   - The mother tree stands in the south-west corner of that square, in a small enclave of
 *     nature's, and nature holds a few more small enclaves scattered around.
 *   - Everything else is nobody's: dense forest and dunes (and some snowfields in the cold
 *     middle of the map).
 *   - Both homes have a lake, a volcano, dunes and a forest close by, and a resource site on each.
 *   - Each later ring brings human towns, nature enclaves, lakes and volcanoes; the outermost
 *     ring is bounded by the sea on two sides.
 *
 * The details (where exactly, the shapes, forest against dune) come from the seed, so every run
 * is a different map with the same structure. A map is pure data derived from its seed: saves
 * keep only the seed.
 */

export type SiteKind = 'grove' | 'spring' | 'amber' | 'vent';
export const SITE_KINDS: readonly SiteKind[] = ['grove', 'spring', 'amber', 'vent'];

export interface Site {
  cell: number;
  kind: SiteKind;
}

export interface Town {
  /** The era whose ring it stands in (and which opens it). */
  era: number;
  cell: number;
  buildings: { kind: HumanBuildingId; cell: number }[];
}

export interface WorldMap {
  seed: number;
  /** Terrain code per cell (see T in grid.ts). */
  terrain: Uint8Array;
  /** The era each cell opens in. */
  ring: Uint8Array;
  /** Who holds each cell when its ring opens: 1 nature, −1 humans, 0 nobody. */
  owner: Int8Array;
  /** Top-left cell of the capital's and the mother tree's 2 × 2 footprints. */
  capital: number;
  mother: number;
  sites: Site[];
  towns: Town[];
  /** Centre cells of volcano cones (for the art). */
  volcanoes: number[];
  /** Centre cells of nature's enclaves other than the mother tree's. */
  enclaves: number[];
}

/** Share of the ice-age square's holdable land the humans start with. */
export const HUMAN_START_SHARE = 0.52;

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(ix: number, iy: number, seed: number): number {
  let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Smooth value noise in 0 … 1. */
export function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let tx = fx - ix;
  let ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

const MID = GRID / 2;

/** A point on the square ring of half-size m around the centre, t in 0 … 1 going round. */
function ringPoint(m: number, t: number): [number, number] {
  const u = (((t % 1) + 1) % 1) * 4;
  const side = Math.floor(u);
  const f = u - side;
  const a = -m + 2 * m * f;
  switch (side) {
    case 0:
      return [MID + a, MID - m];
    case 1:
      return [MID + m, MID + a];
    case 2:
      return [MID - a, MID + m];
    default:
      return [MID - m, MID - a];
  }
}

const cache = new Map<number, WorldMap>();

export function generateMap(seed: number): WorldMap {
  const key = seed >>> 0;
  const hit = cache.get(key);
  if (hit) return hit;
  // A seed whose features happen to wall a home off is nudged until the map is whole.
  let map: WorldMap | null = null;
  for (let attempt = 0; !map; attempt++) map = tryGenerate(key, attempt);
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  cache.set(key, map);
  return map;
}

/** Roles a cell can be given while the map is laid out: free, kept wild (a forest or dune patch
 * near a home), or kept out of the humans' start (round nature's enclaves). */
const Role = { Free: 0, Wild: 1, Buffer: 2 } as const;

function tryGenerate(seed: number, attempt: number): WorldMap | null {
  const rnd = mulberry(seed ^ 0x9e3779b9 ^ Math.imul(attempt + 1, 0x85ebca6b));
  const ns = (seed + attempt * 7919) | 0;
  const terrain = new Uint8Array(CELLS).fill(T.grass);
  const ring = new Uint8Array(CELLS);
  const owner = new Int8Array(CELLS);
  const role = new Uint8Array(CELLS);
  for (let cy = 0; cy < GRID; cy++) for (let cx = 0; cx < GRID; cx++) ring[idx(cx, cy)] = ringOf(cx, cy);

  const jit = (k: number) => (rnd() * 2 - 1) * k;
  /** Cells within radius r (wobbly by `wobble`) of the point (x, y), in cell units. */
  const blob = (x: number, y: number, r: number, wobble: number, salt: number, fn: (i: number) => void) => {
    const R = Math.ceil(r * (1 + wobble)) + 1;
    for (let cy = Math.floor(y - R); cy <= Math.ceil(y + R); cy++) {
      for (let cx = Math.floor(x - R); cx <= Math.ceil(x + R); cx++) {
        if (!inGrid(cx, cy)) continue;
        const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y);
        const lim = r * (1 + (valueNoise(cx * 3, cy * 3, 4, ns + salt) - 0.5) * 2 * wobble);
        if (d <= lim) fn(idx(cx, cy));
      }
    }
  };
  const lakes: [number, number][] = [];
  const volcanoes: number[] = [];
  const wildPatches: { x: number; y: number; kind: 'forest' | 'dune' }[] = [];
  let salt = 100;
  const addLake = (x: number, y: number, r: number) => {
    lakes.push([x, y]);
    blob(x, y, r, 0.35, salt++, (i) => (terrain[i] = T.water));
  };
  const addVolcano = (x: number, y: number, r: number) => {
    blob(x, y, r, 0.2, salt++, (i) => (terrain[i] = T.volcano));
    volcanoes.push(idx(Math.floor(x), Math.floor(y)));
  };
  const addWild = (x: number, y: number, r: number, kind: 'forest' | 'dune') => {
    wildPatches.push({ x, y, kind });
    blob(x, y, r, 0.3, salt++, (i) => {
      if (role[i] === Role.Free) role[i] = Role.Wild;
    });
  };

  // ── The capital and its surroundings ──
  const capital = idx(MID - 1, MID - 1);
  const motherX = Math.round(29 + jit(1));
  const motherY = Math.round(49 + jit(1));
  const mother = idx(motherX, motherY);
  const mcx = motherX + 1;
  const mcy = motherY + 1;
  // Forest faces the mother tree; the lake, dunes and volcano go round from there.
  const toMother = Math.atan2(mcy - MID, mcx - MID);
  const around = (k: number, d: number): [number, number] => {
    const a = toMother + (k * Math.PI) / 2 + jit(0.25);
    const dist = d + jit(0.6);
    return [MID + Math.cos(a) * dist, MID + Math.sin(a) * dist];
  };
  {
    const [fx, fy] = around(0, 7.5);
    addWild(fx, fy, 2.3, 'forest');
    const [lx, ly] = around(1, 7);
    addLake(lx, ly, 2.2);
    const [dx, dy] = around(2, 7);
    addWild(dx, dy, 2.1, 'dune');
    const [vx, vy] = around(3, 7);
    addVolcano(vx, vy, 1.4);
  }

  // ── The mother tree's corner: a pond to the west, a volcano to the south, dunes to the north,
  // forest towards the humans.
  {
    const near = (a: number, d: number): [number, number] => {
      const ang = a + jit(0.2);
      return [mcx + Math.cos(ang) * d, mcy + Math.sin(ang) * d];
    };
    const [px, py] = near(Math.PI, 4.3);
    addLake(px, py, 1.5);
    const [vx, vy] = near(Math.PI / 2, 4.2);
    addVolcano(vx, vy, 1);
    const [dx, dy] = near(-Math.PI / 2, 4.6);
    addWild(dx, dy, 1.7, 'dune');
    const [fx, fy] = near(-Math.PI / 5, 5);
    addWild(fx, fy, 1.8, 'forest');
  }

  // ── Nature's other enclaves in the ice-age square: the other three corners. ──
  const enclaves: number[] = [];
  const enclaveR: number[] = [];
  for (const [ex, ey] of [
    [27, 27],
    [53, 27],
    [53, 53],
  ] as const) {
    const x = ex + jit(1.5);
    const y = ey + jit(1.5);
    enclaves.push(idx(Math.floor(x), Math.floor(y)));
    enclaveR.push(1.5);
  }

  // ── Outer rings: towns, enclaves, lakes and volcanoes spread round each ring. ──
  type Item = 'town' | 'enclave' | 'lake' | 'volcano';
  const towns: { era: number; x: number; y: number }[] = [];
  const RING_ITEMS: Record<number, Item[]> = {
    1: ['town', 'enclave', 'lake', 'town', 'volcano', 'enclave', 'town', 'lake', 'enclave'],
    2: ['town', 'lake', 'enclave', 'volcano', 'town', 'enclave', 'lake', 'town', 'volcano', 'enclave'],
    3: ['town', 'enclave', 'lake', 'town', 'volcano', 'enclave', 'town', 'lake', 'town', 'enclave'],
  };
  for (let e = 1; e < ERA_COUNT; e++) {
    const items = RING_ITEMS[e]!;
    const m = (ERA_HALF[e - 1]! + ERA_HALF[e]!) / 2;
    const offset = rnd();
    items.forEach((kind, k) => {
      const t = offset + (k + 0.5 + jit(0.25)) / items.length;
      let [x, y] = ringPoint(m + jit(1.2), t);
      // Keep clear of the sea in the last ring (east and south coasts).
      if (e === ERA_COUNT - 1) {
        x = Math.min(x, GRID - 8);
        y = Math.min(y, GRID - 8);
      }
      if (kind === 'town') towns.push({ era: e, x, y });
      else if (kind === 'enclave') {
        enclaves.push(idx(Math.floor(x), Math.floor(y)));
        enclaveR.push(1.3 + rnd() * 0.5);
      } else if (kind === 'lake') addLake(x, y, 1.8 + rnd() * 0.8);
      else addVolcano(x, y, 1.1 + rnd() * 0.5);
    });
  }

  // ── The sea along the east and south edges of the outermost ring. ──
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const coast = 2.6 + valueNoise(cx * 2, cy * 2, 7, ns + 5) * 2.6;
      if (GRID - 1 - cx < coast || GRID - 1 - cy < coast) terrain[idx(cx, cy)] = T.water;
    }
  }

  // ── Streams: a shallow, walkable creek wanders out of each lake. ──
  for (const [lx, ly] of lakes) {
    let a = rnd() * Math.PI * 2;
    let x = lx;
    let y = ly;
    const len = 5 + Math.floor(rnd() * 5);
    for (let s = 0; s < len + 3; s++) {
      a += jit(0.6);
      x += Math.cos(a);
      y += Math.sin(a);
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      if (!inGrid(cx, cy)) break;
      const i = idx(cx, cy);
      if (terrain[i] === T.volcano) break;
      if (terrain[i] === T.water) continue;
      terrain[i] = T.stream;
      if (s > len) break;
    }
  }

  // Shores: holdable land touching open water is beach.
  for (let i = 0; i < CELLS; i++) {
    if (terrain[i] !== T.grass) continue;
    const cx = cxOf(i);
    const cy = cyOf(i);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (inGrid(nx, ny) && terrain[idx(nx, ny)] === T.water) {
        terrain[i] = T.beach;
        break;
      }
    }
  }

  // ── Homes are plain ground. ──
  const footprint = (top: number) => [top, top + 1, top + GRID, top + GRID + 1];
  for (const i of [...footprint(capital), ...footprint(mother)]) terrain[i] = T.grass;

  // ── Who holds what at the start. ──
  // Nature: the mother tree's enclave and the others. Each keeps a buffer the humans don't start in.
  blob(mcx, mcy, 2.7, 0.15, 900, (i) => {
    if (holdable(terrain[i]!)) owner[i] = 1;
  });
  blob(mcx, mcy, 5.6, 0.1, 901, (i) => {
    if (role[i] === Role.Free) role[i] = Role.Buffer;
  });
  enclaves.forEach((c, k) => {
    const x = cxOf(c) + 0.5;
    const y = cyOf(c) + 0.5;
    blob(x, y, enclaveR[k]!, 0.2, 910 + k, (i) => {
      if (holdable(terrain[i]!)) owner[i] = 1;
    });
    blob(x, y, enclaveR[k]! + 2.2, 0.1, 930 + k, (i) => {
      if (role[i] === Role.Free) role[i] = Role.Buffer;
    });
  });

  // Wildness: the humans settle tame ground first; wild ground stays forest or dune.
  const wild = new Float32Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const x = cxOf(i);
    const y = cyOf(i);
    wild[i] = valueNoise(x, y, 6, ns + 11) * 0.7 + valueNoise(x, y, 2.7, ns + 12) * 0.3;
  }

  // The humans' start in the ice-age square: grown out from the capital to 51–53 %.
  let ownable0 = 0;
  for (let i = 0; i < CELLS; i++) if (ring[i] === 0 && holdable(terrain[i]!)) ownable0++;
  const target = Math.round(ownable0 * HUMAN_START_SHARE);
  const grown = growRegion(capital, target, (i) => ring[i] === 0 && holdable(terrain[i]!) && role[i] === Role.Free && owner[i] === 0, (i) => {
    const d = Math.hypot(cxOf(i) + 0.5 - MID, cyOf(i) + 0.5 - MID);
    return d + wild[i]! * 9 + valueNoise(cxOf(i), cyOf(i), 3, ns + 13) * 3;
  });
  if (grown.length < target) return null;
  for (const i of grown) owner[i] = -1;

  // Towns in the outer rings.
  const townDefs: Town[] = [];
  towns.forEach((t, k) => {
    const r = 2.2 + rnd() * 0.8;
    const cells: number[] = [];
    blob(t.x, t.y, r, 0.25, 960 + k, (i) => {
      if (holdable(terrain[i]!) && owner[i] === 0 && ring[i] === t.era) {
        owner[i] = -1;
        if (terrain[i] !== T.beach && terrain[i] !== T.stream) terrain[i] = T.grass;
        cells.push(i);
      }
    });
    if (!cells.length) return;
    const centre = idx(Math.floor(t.x), Math.floor(t.y));
    cells.sort((a, b) => cellGap(a, centre) - cellGap(b, centre) || a - b);
    const kinds: HumanBuildingId[] =
      t.era === 1 ? ['rack', 'spearcamp'] : t.era === 2 ? ['rack', 'javelincamp', 'tower'] : ['rack', 'firepit', 'tower', 'spearcamp'];
    const placed: { kind: HumanBuildingId; cell: number }[] = [];
    for (const kind of kinds) {
      const cell = cells.find((c) => terrain[c] === T.grass && placed.every((p) => cellGap(p.cell, c) >= 2));
      if (cell === undefined) break;
      placed.push({ kind, cell });
    }
    townDefs.push({ era: t.era, cell: centre, buildings: placed });
  });

  // ── Final terrain: nobody's land is wild (forest, dunes, snow); held land mostly open ground. ──
  for (let i = 0; i < CELLS; i++) {
    const code = terrain[i]!;
    if (code !== T.grass) continue;
    const x = cxOf(i);
    const y = cyOf(i);
    if (owner[i] === -1 && wild[i]! < 0.58) continue;
    if (owner[i] === 1 && wild[i]! < 0.66) continue;
    terrain[i] = wildTerrain(x, y, ring[i]!, ns, lakes, volcanoes);
  }
  // Patches kept wild near the homes have their promised kind.
  for (const p of wildPatches) {
    blob(p.x, p.y, 1.6, 0.2, 990, (i) => {
      if (terrain[i] === T.grass || terrain[i] === T.forest || terrain[i] === T.dune || terrain[i] === T.snow) {
        if (owner[i] === 0) terrain[i] = p.kind === 'forest' ? T.forest : T.dune;
      }
    });
  }
  for (const i of [...footprint(capital), ...footprint(mother)]) terrain[i] = T.grass;
  for (const i of footprint(mother)) owner[i] = 1;

  // ── Everything walkable must be reachable from the capital; closed-off pockets become water. ──
  const seen = new Uint8Array(CELLS);
  const stack = [capital];
  seen[capital] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const cx = cxOf(i);
    const cy = cyOf(i);
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = NEIGHBOURS[k]!;
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inGrid(nx, ny)) continue;
      const n = idx(nx, ny);
      if (seen[n] || !holdable(terrain[n]!)) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  if (!seen[mother]) return null;
  for (let i = 0; i < CELLS; i++) {
    if (holdable(terrain[i]!) && !seen[i]) {
      terrain[i] = T.water;
      owner[i] = 0;
    }
  }
  // The connectivity pass may have drowned a pocket: the start share must still hold.
  let held0 = 0;
  let own0 = 0;
  for (let i = 0; i < CELLS; i++) {
    if (ring[i] !== 0 || !holdable(terrain[i]!)) continue;
    own0++;
    if (owner[i] === -1) held0++;
  }
  if (held0 / own0 < 0.51 || held0 / own0 > 0.53) return null;
  // Every outer ring must have room to walk into.
  for (let e = 1; e < ERA_COUNT; e++) {
    let open = 0;
    for (let i = 0; i < CELLS; i++) if (ring[i] === e && seen[i]) open++;
    if (open < 50) return null;
  }

  // ── Resource sites: one per kind by each home, and by every lake and volcano further out. ──
  const sites: Site[] = [];
  const taken = new Set<number>([...footprint(capital), ...footprint(mother)]);
  for (const t of townDefs) for (const b of t.buildings) taken.add(b.cell);
  const addSite = (kind: SiteKind, x: number, y: number, ok: (i: number) => boolean, maxR = 6) => {
    let best = -1;
    let bestD = Infinity;
    const R = Math.ceil(maxR);
    for (let cy = Math.floor(y) - R; cy <= Math.floor(y) + R; cy++) {
      for (let cx = Math.floor(x) - R; cx <= Math.floor(x) + R; cx++) {
        if (!inGrid(cx, cy)) continue;
        const i = idx(cx, cy);
        if (!holdable(terrain[i]!) || taken.has(i) || !ok(i)) continue;
        if (sites.some((s) => cellGap(s.cell, i) < 3)) continue;
        if ([...taken].some((t) => cellGap(t, i) < 2)) continue;
        const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best >= 0) {
      sites.push({ cell: best, kind });
      taken.add(best);
    }
  };
  const touches = (i: number, code: number) => {
    const cx = cxOf(i);
    const cy = cyOf(i);
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = NEIGHBOURS[k]!;
      if (inGrid(cx + dx, cy + dy) && terrain[idx(cx + dx, cy + dy)] === code) return true;
    }
    return false;
  };
  for (const [lx, ly] of lakes) addSite('spring', lx, ly, (i) => touches(i, T.water));
  for (const v of volcanoes) addSite('vent', cxOf(v) + 0.5, cyOf(v) + 0.5, (i) => touches(i, T.volcano));
  for (const p of wildPatches) addSite(p.kind === 'forest' ? 'grove' : 'amber', p.x, p.y, (i) => terrain[i] === (p.kind === 'forest' ? T.forest : T.dune), 4);
  // A grove and an amber pit in each outer ring, deep in the wilds.
  for (let e = 1; e < ERA_COUNT; e++) {
    const m = (ERA_HALF[e - 1]! + ERA_HALF[e]!) / 2;
    for (const [kind, code] of [
      ['grove', T.forest],
      ['amber', T.dune],
    ] as const) {
      for (let tries = 0; tries < 2; tries++) {
        const [x, y] = ringPoint(m, rnd());
        addSite(kind, Math.min(x, GRID - 9), Math.min(y, GRID - 9), (i) => terrain[i] === code && owner[i] === 0 && ring[i] === e, 5);
      }
    }
  }

  return {
    seed,
    terrain,
    ring,
    owner,
    capital,
    mother,
    sites,
    towns: townDefs,
    volcanoes,
    enclaves,
  };
}

/** Wild ground: forest where it's wet, dunes where it's dry (round volcanoes), snow where it's cold. */
function wildTerrain(x: number, y: number, ringE: number, ns: number, lakes: [number, number][], volcanoes: number[]): number {
  let wet = valueNoise(x, y, 7, ns + 21);
  let dry = valueNoise(x, y, 8, ns + 22);
  for (const [lx, ly] of lakes) {
    const d = Math.hypot(x + 0.5 - lx, y + 0.5 - ly);
    if (d < 6) wet += (6 - d) * 0.05;
  }
  for (const v of volcanoes) {
    const d = Math.hypot(x - cxOf(v), y - cyOf(v));
    if (d < 6) dry += (6 - d) * 0.06;
  }
  // Warmer further out: dunes spread in the outer rings, snow lingers in the middle and the north.
  dry += ringE * 0.02;
  const cold = valueNoise(x, y, 9, ns + 23) + (ringE === 0 ? 0.22 : ringE === 1 ? 0.08 : -0.25) + ((GRID / 2 - y) / GRID) * 0.35;
  if (cold > 0.9) return T.snow;
  return dry > wet + 0.1 ? T.dune : T.forest;
}

/** Grow a region from a 2 × 2 seed footprint, always adding the open frontier cell that scores lowest. */
function growRegion(start: number, target: number, allowed: (i: number) => boolean, score: (i: number) => number): number[] {
  const seeds = [start, start + 1, start + GRID, start + GRID + 1];
  const out: number[] = [];
  const heap = new MinHeap();
  const queued = new Uint8Array(CELLS);
  for (const i of seeds) {
    queued[i] = 1;
    heap.push(i, -1);
  }
  while (heap.size && out.length < target) {
    const i = heap.pop();
    out.push(i);
    const cx = cxOf(i);
    const cy = cyOf(i);
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = NEIGHBOURS[k]!;
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inGrid(nx, ny)) continue;
      const n = idx(nx, ny);
      if (queued[n] || !allowed(n)) continue;
      queued[n] = 1;
      heap.push(n, score(n));
    }
  }
  return out;
}
