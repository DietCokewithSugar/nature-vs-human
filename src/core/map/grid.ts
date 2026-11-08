import type { BuildingId, EraId, Owner, ResourceKind, SiteNeed, ZoneId } from '../types.ts';

/**
 * The one fixed map every run is played on, as a 32 × 32 grid of 4 × 4 cells.
 * North is −z (row 0), east is +x (column 31).
 *
 * Legend:
 *   H human ground      h human beach (white sand)
 *   N nature meadow     n nature sand (weedy, pebbly)   f nature forest   g nature glacier
 *   F neutral dense forest                               d neutral dunes
 *   - fresh water (river, lake)   = ford (shallow, walkable)   ~ sea   ^ volcano
 *
 * The humans start with well over half the ground in the middle and east. Nature holds a few
 * scattered pockets: the north-west by the volcano, the river mouth in the south-west, a park
 * inside the city, the north-east woods and a south-east grove. Dense neutral forest and dunes
 * lie between them. The map opens ring by ring as the humans reach new eras.
 */
export const MAP_ROWS: readonly string[] = [
  '~~gggggggFFFF-FFFFFNNNNNNNFFFFFF',
  '~~gggggggFFFF-FFFFFNNNNNNNFFHHHH',
  '~~nggggFFFFFF-FFFFFFNNNNNF^^FHHH',
  '~~nngggFFFFFF-HHFFFFFNNNF^^^FHHH',
  '~~nnggFFFFFFF-HHHFFFFFNNFF^FFHHH',
  '~~nnfgFFFFFFF-HHHHFFFFFNNFFFFHHH',
  '~~nnffgFFFFFF-HHHHHFFFFNNNFFHHHH',
  '~~nnfff^^^FFF-HHHHHHFFFFNNFFHHHH',
  '~~nnffN^^^HHH=HHHHHHHHFFFNFHHHHH',
  '~~nnfNN^^^HHH-HHHHHHHHHFFFFHHHHH',
  '~~nnNNNffFHHH-HHHHHHHHHHHFFHHHHH',
  '~~nnFNffFFHHH-HHHHHHHHHHHHHHHHHH',
  '~~ndFFFFFHHHH-HHHHHFFHHHHHHHHHHH',
  '~~ddFFFFHHHHH-HHHHHFFHHHHHHHHHHH',
  '~~ddFFFHHHHHH-HHHHHH---HHHHHHHHH',
  '~~ddFFHHHHHHH-HHffHH---hHHHHHHHH',
  '~~dFFFHHHHHH-HHffffH---hHHHHHHHH',
  '~~dFFHHHHH--HHHHffHHHhhHHHHHHHHH',
  '~~dFFnnN==HHHHHHHHHHHHHHFFFHHHHH',
  '~~dFnn--NHHHHHHHHHHHHHFFFFFHHHHH',
  '~~ddn--NNNHHHHHHHHHHHFFFFFFFHHHH',
  '~~d~~~nNNdHHHHHHHHHHFFFFfNFFFHHH',
  '~~~~~nnNdddHHHHHHHHHFFFffNNFFHHH',
  '~~~~~ndddddddHHHHHHHFFFfNNNNFHHH',
  '~~~~~~dddddddHHHHHHHFFFFfNNFFHHH',
  '~~~~~~~ddddddhhhHHHHHFFFFFFFHHHH',
  '~~~~~~~~dddddhhhhHHHHFFFFFFHHHHH',
  '~~~~~~~~~nnnn~hhhhhHHHHFFFFHHHHH',
  '~~~~~~~~~~nn~~~~hhhhhHHHHHHHHHHH',
  '~~~~~~~~~~~~~~~~~~hhhhHHHHHHHHHH',
  '~~~~~~~~~~~~~~~~~~~~~hhhhHHHHHHH',
  '~~~~~~~~~~~~~~~~~~~~~~~~~hhhhhhh',
];

export const GRID = 32;
export const CELL = 4;
export const MAP_HALF = (GRID * CELL) / 2;
export const CELL_COUNT = GRID * GRID;

/** What the ground is, whoever holds it. */
export type Biome = 'plain' | 'sand' | 'forest' | 'ice' | 'fresh' | 'ford' | 'sea' | 'volcano';

export interface CellInfo {
  i: number;
  j: number;
  x: number;
  z: number;
  biome: Biome;
  /** Who holds it when a run starts. */
  start: Owner;
  /** Land that can be held (not water, not the volcano). Fords count as water. */
  claimable: boolean;
  /** Land units can walk here (fords too). */
  walkable: boolean;
  water: boolean;
}

function decode(ch: string): { biome: Biome; start: Owner } {
  switch (ch) {
    case 'H':
      return { biome: 'plain', start: 'human' };
    case 'h':
      return { biome: 'sand', start: 'human' };
    case 'N':
      return { biome: 'plain', start: 'nature' };
    case 'n':
      return { biome: 'sand', start: 'nature' };
    case 'f':
      return { biome: 'forest', start: 'nature' };
    case 'g':
      return { biome: 'ice', start: 'nature' };
    case 'F':
      return { biome: 'forest', start: 'neutral' };
    case 'd':
      return { biome: 'sand', start: 'neutral' };
    case '-':
      return { biome: 'fresh', start: 'neutral' };
    case '=':
      return { biome: 'ford', start: 'neutral' };
    case '~':
      return { biome: 'sea', start: 'neutral' };
    case '^':
      return { biome: 'volcano', start: 'neutral' };
    default:
      throw new Error(`Unknown map character ${ch}`);
  }
}

export const CELLS: readonly CellInfo[] = (() => {
  if (MAP_ROWS.length !== GRID || MAP_ROWS.some((r) => r.length !== GRID)) throw new Error('Map must be 32 × 32');
  const out: CellInfo[] = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const { biome, start } = decode(MAP_ROWS[j]![i]!);
      const water = biome === 'fresh' || biome === 'sea' || biome === 'ford';
      out.push({
        i,
        j,
        x: -MAP_HALF + (i + 0.5) * CELL,
        z: -MAP_HALF + (j + 0.5) * CELL,
        biome,
        start,
        claimable: !water && biome !== 'volcano',
        walkable: (!water || biome === 'ford') && biome !== 'volcano',
        water,
      });
    }
  }
  return out;
})();

export function cellIndex(i: number, j: number): number {
  return j * GRID + i;
}

export function inGrid(i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < GRID && j < GRID;
}

/** The cell under a world point (clamped to the map). */
export function cellAt(x: number, z: number): number {
  const i = Math.min(GRID - 1, Math.max(0, Math.floor((x + MAP_HALF) / CELL)));
  const j = Math.min(GRID - 1, Math.max(0, Math.floor((z + MAP_HALF) / CELL)));
  return cellIndex(i, j);
}

// ── Eras: the map opens ring by ring ───────────────────────────

/** Half-width of the open square, in cells, per era: 20 × 20 in the ice age, the whole map by the modern era. */
export const OPEN_HALF: Record<EraId, number> = { 1: 10, 2: 12, 3: 14, 4: 16 };

export function isOpen(era: EraId, k: number): boolean {
  const c = CELLS[k]!;
  const r = OPEN_HALF[era];
  return c.i >= GRID / 2 - r && c.i < GRID / 2 + r && c.j >= GRID / 2 - r && c.j < GRID / 2 + r;
}

/** World-space bounds of the open area. */
export function openBounds(era: EraId): { x0: number; x1: number; z0: number; z1: number } {
  const r = OPEN_HALF[era] * CELL;
  return { x0: -r, x1: r, z0: -r, z1: r };
}

/** The era a cell first opens in. */
export function openedIn(k: number): EraId {
  for (const e of [1, 2, 3, 4] as EraId[]) if (isOpen(e, k)) return e;
  return 4;
}

// ── Neighbourhoods and resources ───────────────────────────────

export function neighbors4(k: number): number[] {
  const c = CELLS[k]!;
  const out: number[] = [];
  if (c.i > 0) out.push(k - 1);
  if (c.i < GRID - 1) out.push(k + 1);
  if (c.j > 0) out.push(k - GRID);
  if (c.j < GRID - 1) out.push(k + GRID);
  return out;
}

/** Cells within Chebyshev distance r (the cell itself included). */
export function around(k: number, r: number): number[] {
  const c = CELLS[k]!;
  const out: number[] = [];
  for (let j = c.j - r; j <= c.j + r; j++) for (let i = c.i - r; i <= c.i + r; i++) if (inGrid(i, j)) out.push(cellIndex(i, j));
  return out;
}

export function hasResource(k: number, kind: SiteNeed): boolean {
  const b = CELLS[k]!.biome;
  switch (kind) {
    case 'forest':
      return b === 'forest';
    case 'sand':
      return b === 'sand';
    case 'lava':
      return b === 'volcano';
    case 'water':
      return b === 'fresh' || b === 'sea' || b === 'ford';
    case 'sea':
      return b === 'sea';
  }
}

/** How close a site must be to what it needs: two cells, or touching the water for swimmers' homes. */
export function needRadius(kind: SiteNeed): number {
  return kind === 'sea' ? 1 : 2;
}

/** Is a resource within reach of a cell, counting only ground already open in this era? */
export function nearResource(era: EraId, k: number, kind: SiteNeed): boolean {
  for (const n of around(k, needRadius(kind))) if (isOpen(era, n) && hasResource(n, kind)) return true;
  return false;
}

// ── Resource points: where 自然之元 wells up ─────────────────

export interface ResourceNode {
  cell: number;
  kind: ResourceKind;
}

const node = (i: number, j: number, kind: ResourceKind): ResourceNode => ({ cell: cellIndex(i, j), kind });

/**
 * Points that well up 自然之元 for whoever holds their cell. Each pocket of either side starts
 * next to a few of them; the ones on neutral ground go to whoever takes it.
 */
export const NODES: readonly ResourceNode[] = [
  // Nature pockets.
  node(7, 10, 'forest'),
  node(6, 8, 'lava'),
  node(7, 20, 'water'),
  node(6, 21, 'sand'),
  node(16, 16, 'forest'),
  node(24, 7, 'forest'),
  node(24, 22, 'forest'),
  // The city.
  node(10, 9, 'lava'),
  node(14, 9, 'water'),
  node(19, 14, 'water'),
  node(23, 16, 'sand'),
  node(18, 12, 'forest'),
  // Neutral ground in the ice-age map.
  node(10, 22, 'sand'),
  node(12, 6, 'forest'),
  node(22, 20, 'forest'),
  node(12, 24, 'sand'),
  // The outer rings.
  node(4, 8, 'forest'),
  node(24, 4, 'forest'),
  node(26, 12, 'forest'),
  node(15, 4, 'water'),
  node(3, 13, 'sand'),
  node(2, 5, 'sand'),
  node(21, 1, 'forest'),
  node(24, 3, 'lava'),
  node(28, 2, 'lava'),
  node(17, 28, 'sand'),
  node(30, 10, 'forest'),
  node(9, 26, 'sand'),
  node(10, 28, 'water'),
];

// ── Buildings standing when a ring opens ───────────────────────

export interface Preset {
  cell: number;
  kind: BuildingId;
}

const at = (i: number, j: number, kind: BuildingId): Preset => ({ cell: cellIndex(i, j), kind });

/** What stands on each ring when it opens: the ice-age tribe and lairs, then outposts further out. */
export const PRESETS: Record<EraId, readonly Preset[]> = {
  1: [
    at(7, 11, 'den'),
    at(17, 16, 'anthill'),
    at(7, 21, 'anthill'),
    at(18, 10, 'shrine'),
    at(15, 9, 'tent'),
    at(21, 12, 'tent'),
    at(16, 13, 'tent'),
    at(12, 13, 'tent'),
    at(11, 9, 'dugout'),
    at(20, 18, 'dugout'),
    at(12, 15, 'lodge'),
    at(22, 9, 'lodge'),
  ],
  2: [at(22, 4, 'flowers'), at(10, 27, 'reeds'), at(26, 13, 'farmhouse'), at(16, 4, 'farmhouse')],
  3: [at(2, 7, 'reef'), at(21, 2, 'prairie'), at(16, 27, 'harbor'), at(29, 3, 'mine')],
  4: [at(11, 28, 'deepreef'), at(28, 1, 'geothermal'), at(30, 16, 'bank')],
};

/** River cells the humans bridge in each era (fords are open from the start). */
export const BRIDGES: Record<EraId, readonly number[]> = {
  1: [],
  2: [cellIndex(13, 12)],
  3: [cellIndex(13, 12), cellIndex(13, 14)],
  4: [cellIndex(13, 12), cellIndex(13, 14), cellIndex(12, 16), cellIndex(13, 4)],
};

// ── Landmarks ──────────────────────────────────────────────────

const centre = (i: number, j: number) => ({ x: -MAP_HALF + (i + 0.5) * CELL, z: -MAP_HALF + (j + 0.5) * CELL });

/** The two volcanoes: the big one between the north-west pocket and the city, a small one in the far north-east. */
export const VOLCANOES: readonly { x: number; z: number; size: number }[] = [
  { ...centre(8, 8), size: 15 },
  { x: centre(26, 3).x + 1, z: centre(26, 3).z, size: 11 },
];

/** Where each disaster strikes. */
export const ZONES: Record<ZoneId, { x: number; z: number; r: number; name: string }> = {
  volcano: { ...centre(8, 8), r: 16, name: '火山' },
  plains: { ...centre(22, 3), r: 18, name: '东北平原' },
  coast: { ...centre(6, 24), r: 18, name: '西南海湾' },
};

/** Map statistics for a set of owners, over the ground open in an era. */
export function startShares(era: EraId): Record<Owner, number> {
  const out: Record<Owner, number> = { human: 0, nature: 0, neutral: 0 };
  CELLS.forEach((c, k) => {
    if (c.claimable && isOpen(era, k)) out[c.start]++;
  });
  return out;
}
