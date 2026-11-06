import type { EraId } from '../core/index.ts';

export interface Placement {
  model: string;
  x: number;
  z: number;
  /** Rotation around Y in quarter turns. */
  rot?: number;
  /** Target size in world units (longest horizontal side unless `by` is height). */
  size: number;
  by?: 'length' | 'height';
}

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export type GroundColor =
  | 'snow'
  | 'tundra'
  | 'ice'
  | 'earth'
  | 'stone'
  | 'lawn'
  | 'cobble'
  | 'brick'
  | 'road'
  | 'sidewalk'
  | 'asphalt'
  | 'plaza'
  | 'pier';

export interface GroundTile extends Rect {
  color: GroundColor;
  y?: number;
  h?: number;
}

export interface DistrictDef {
  era: EraId;
  /** World position of the board centre. Boards line up along −Z, so later eras sit behind. */
  ox: number;
  oz: number;
  width: number;
  depth: number;
  /** The board's base colour (its top surface before tiles). */
  base: GroundColor;
  ground: GroundTile[];
  /** Destructible buildings; `lab` marks the humans' research building. */
  buildings: (Placement & { lab?: boolean })[];
  props: Placement[];
  /** Where walkers may roam (local coordinates). */
  walk: Rect;
  /** Water for marine creatures, if any. */
  water?: Rect;
  camera: { targetY: number; height: number };
}

const road = (x0: number, x1: number, z0: number, z1: number, color: GroundColor = 'road'): GroundTile => ({ x0, x1, z0, z1, color });

export const DISTRICTS: Record<EraId, DistrictDef> = {
  // ── 冰河：原始部落 ──────────────────────────────────────────
  1: {
    era: 1,
    ox: 0,
    oz: 0,
    width: 48,
    depth: 48,
    base: 'snow',
    ground: [
      { x0: -20, x1: -6, z0: 8, z1: 21, color: 'tundra' },
      { x0: 6, x1: 21, z0: -21, z1: -9, color: 'tundra' },
      { x0: 9, x1: 19, z0: 11, z1: 19, color: 'ice' },
      { x0: -6, x1: 6, z0: -4, z1: 4, color: 'earth' },
    ],
    buildings: [
      { model: 'teepee-lab', x: 0, z: -11, size: 9, lab: true },
      { model: 'teepee', x: -12, z: -13, size: 6 },
      { model: 'teepee', x: 12, z: 2, size: 6 },
      { model: 'teepee', x: -13, z: 2, size: 6 },
      { model: 'teepee', x: -2, z: 13, size: 5.5 },
      { model: 'dugout', x: -19, z: -4, rot: 1, size: 5 },
      { model: 'dugout', x: 19, z: -4, rot: 3, size: 5 },
      { model: 'lean-to', x: 6, z: 9, rot: 2, size: 4.5 },
      { model: 'hide-rack', x: -7, z: -4, size: 3.4 },
      { model: 'larder', x: 7, z: -5, size: 3, by: 'height' },
    ],
    props: [
      { model: 'campfire', x: 0, z: 0, size: 2.6 },
      { model: 'totem', x: 5, z: -10, size: 4.2, by: 'height' },
      { model: 'fleshing', x: 3.5, z: 4, rot: 1, size: 2.4 },
      { model: 'spear', x: -4, z: 4.5, size: 3, by: 'height' },
      { model: 'spruce', x: -20, z: -20, size: 7, by: 'height' },
      { model: 'spruce', x: -15, z: -21, size: 5.5, by: 'height' },
      { model: 'spruce', x: 20, z: -20, size: 8, by: 'height' },
      { model: 'spruce', x: 21, z: 4, size: 6, by: 'height' },
      { model: 'spruce', x: -21, z: 12, size: 7, by: 'height' },
      { model: 'spruce', x: 3, z: 21, size: 6, by: 'height' },
      { model: 'boulders', x: 16, z: -14, size: 4 },
      { model: 'boulders', x: -8, z: 19, size: 3.6 },
      { model: 'petroglyph', x: -6, z: -18, size: 2.6 },
    ],
    walk: { x0: -21, x1: 21, z0: -21, z1: 21 },
    camera: { targetY: 2, height: 9 },
  },

  // ── 古代：城邦 ──────────────────────────────────────────────
  2: {
    era: 2,
    ox: 0,
    oz: -78,
    width: 52,
    depth: 52,
    base: 'earth',
    ground: [
      road(-3, 3, -26, 13, 'stone'),
      road(-26, 26, -9, -5, 'stone'),
      { x0: -26, x1: 26, z0: 12, z1: 14, color: 'stone' },
    ],
    buildings: [
      { model: 'gatehouse', x: 0, z: -20, size: 8 },
      { model: 'temple', x: -13, z: -16, size: 11, lab: true },
      { model: 'pagoda', x: 14, z: -17, size: 6.5 },
      { model: 'townhouse', x: -14, z: 0, size: 9 },
      { model: 'townhouse', x: 14, z: 0, rot: 2, size: 9 },
      { model: 'storehouse', x: -8, z: 7, size: 6 },
      { model: 'farmhouse', x: 9, z: 7, size: 8 },
      { model: 'bell-tower', x: 21, z: -6, size: 6.8, by: 'height' },
      { model: 'market', x: -6, z: -1, size: 2.4 },
      { model: 'market', x: 6, z: -1, rot: 2, size: 2.4 },
      { model: 'river-boat', x: -10, z: 19, rot: 1, size: 7 },
      { model: 'river-boat', x: 13, z: 21, rot: 1, size: 6 },
    ],
    props: [
      { model: 'well', x: 0, z: 2, size: 1.8, by: 'height' },
      { model: 'sakura', x: -21, z: -21, size: 5 },
      { model: 'sakura', x: 21, z: 9, size: 4.6 },
      { model: 'maple', x: -21, z: 8, size: 5 },
      { model: 'maple', x: 21, z: -21, size: 4.6 },
      { model: 'sakura', x: -3, z: 9, size: 3.2 },
    ],
    walk: { x0: -24, x1: 24, z0: -24, z1: 11 },
    water: { x0: -25, x1: 25, z0: 15, z1: 25 },
    camera: { targetY: 3, height: 14 },
  },

  // ── 工业：港口城镇 ──────────────────────────────────────────
  3: {
    era: 3,
    ox: 0,
    oz: -160,
    width: 52,
    depth: 52,
    base: 'cobble',
    ground: [
      road(-26, 26, -9, -5),
      road(-2, 2, -26, 8),
      { x0: -26, x1: 26, z0: 6, z1: 9, color: 'brick' },
      { x0: -13, x1: -10, z0: 8, z1: 22, color: 'pier', y: 0.3, h: 3.6 },
    ],
    buildings: [
      { model: 'boiler-hall', x: -18, z: -17, size: 8 },
      { model: 'boiler-hall', x: -9, z: -17, size: 8 },
      { model: 'warehouse', x: 14, z: -18, size: 12 },
      { model: 'tenement', x: -17, z: 0, size: 9.2 },
      { model: 'loft', x: 11, z: 0, size: 12, lab: true },
      { model: 'water-tower', x: 22, z: -2, size: 12, by: 'height' },
      { model: 'silo', x: -6, z: 1, size: 8, by: 'height' },
      { model: 'lighthouse', x: 20, z: 13, size: 8 },
      { model: 'yard-crane', x: 1, z: 4, size: 5 },
      { model: 'container', x: 6, z: 3.5, rot: 1, size: 5 },
      { model: 'barge', x: -2, z: 17, rot: 1, size: 9 },
      { model: 'fishing-boat', x: -17, z: 15, size: 6.8 },
    ],
    props: [
      { model: 'street-lamp', x: 3.2, z: -3.2, size: 5, by: 'height' },
      { model: 'street-lamp', x: -3.2, z: -11, size: 5, by: 'height' },
      { model: 'tree-street', x: -24, z: -24, size: 3 },
    ],
    walk: { x0: -24, x1: 24, z0: -24, z1: 6 },
    water: { x0: -25, x1: 25, z0: 10, z1: 25 },
    camera: { targetY: 4, height: 20 },
  },

  // ── 现代：大都市 ────────────────────────────────────────────
  4: {
    era: 4,
    ox: 0,
    oz: -248,
    width: 60,
    depth: 60,
    base: 'plaza',
    ground: [
      road(-30, 30, -4, 4, 'asphalt'),
      road(-4, 4, -30, 30, 'asphalt'),
      { x0: 6, x1: 28, z0: 22, z1: 28, color: 'lawn' },
    ],
    buildings: [
      { model: 'deco-tower', x: -15, z: -15, size: 16 },
      { model: 'slab', x: 16, z: -16, size: 16, lab: true },
      { model: 'office-tower', x: -23, z: 14, size: 8 },
      { model: 'office-tower', x: -11, z: 14, rot: 1, size: 8 },
      { model: 'bank', x: 14, z: 13, rot: 2, size: 12 },
      { model: 'hotel', x: 25, z: 12, size: 10 },
    ],
    props: [
      { model: 'tree-broadleaf', x: 10, z: 25, size: 4.5 },
      { model: 'tree-oak', x: 18, z: 25, size: 5 },
      { model: 'tree-street', x: 25, z: 25, size: 3 },
      { model: 'coupe', x: 1.8, z: 18, size: 4.5 },
      { model: 'coupe', x: -18, z: -1.8, rot: 1, size: 4.5 },
      { model: 'pickup', x: 20, z: 1.8, rot: 1, size: 4.8 },
    ],
    walk: { x0: -27, x1: 27, z0: -27, z1: 27 },
    camera: { targetY: 16, height: 60 },
  },
};

/** Footprint of a placement, inflated by `pad`, for keeping walkers out of buildings. */
export function footprint(p: Placement, dims: { w: number; d: number }, pad = 0): Rect {
  const quarter = ((p.rot ?? 0) % 2 + 2) % 2 === 1;
  const w = (quarter ? dims.d : dims.w) / 2 + pad;
  const d = (quarter ? dims.w : dims.d) / 2 + pad;
  return { x0: p.x - w, x1: p.x + w, z0: p.z - d, z1: p.z + d };
}

export function inRect(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}
