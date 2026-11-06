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

export interface GroundTile extends Rect {
  color: 'lawn' | 'lawnDark' | 'road' | 'sidewalk' | 'beach' | 'pier' | 'asphalt' | 'plaza' | 'hedge';
  y?: number;
  h?: number;
}

export interface DistrictDef {
  era: EraId;
  /** World position of the board centre. Boards line up along −Z, so later eras sit behind earlier ones. */
  ox: number;
  oz: number;
  width: number;
  depth: number;
  ground: GroundTile[];
  buildings: Placement[];
  props: Placement[];
  /** Where walkers may roam (local coordinates). */
  walk: Rect;
  /** Water basin for swimmers, if any. */
  water?: Rect;
  /** targetY: look-at height; height: tallest thing on the board, for framing. */
  camera: { targetY: number; height: number };
}

const road = (x0: number, x1: number, z0: number, z1: number): GroundTile => ({ x0, x1, z0, z1, color: 'road' });

export const DISTRICTS: Record<EraId, DistrictDef> = {
  // ── 幸福里小区：suburb ────────────────────────────────────────
  1: {
    era: 1,
    ox: 0,
    oz: 0,
    width: 44,
    depth: 44,
    ground: [
      { x0: -22, x1: 22, z0: -22, z1: 22, color: 'lawn' },
      road(-22, 22, -2.5, 2.5),
      road(-2.5, 2.5, -22, 22),
      { x0: 3.5, x1: 21, z0: 3.5, z1: 11, color: 'lawnDark' },
      { x0: -21, x1: -3.5, z0: -21, z1: -13, color: 'lawnDark' },
    ],
    buildings: [
      { model: 'cottage', x: 8, z: 8, rot: 2, size: 8 },
      { model: 'cabin', x: 17, z: 8, rot: 2, size: 7 },
      { model: 'house-aframe', x: 17, z: 17, rot: 1, size: 8 },
      { model: 'corner-shop', x: -8, z: 8, rot: 2, size: 8.85 },
      { model: 'cabin', x: -17, z: 8, rot: 2, size: 7 },
      { model: 'house-aframe', x: -8, z: 17, rot: 3, size: 8 },
      { model: 'clubhouse', x: -11, z: -8, size: 12 },
      { model: 'chalet', x: -8, z: -17, size: 9 },
      { model: 'house-aframe', x: 8, z: -8, size: 8 },
      { model: 'cottage', x: 17, z: -8, rot: 1, size: 8 },
      { model: 'cabin', x: 8, z: -17, size: 7 },
      { model: 'row-house', x: 17, z: -17, size: 8 },
    ],
    props: [
      { model: 'tree-oak', x: 7, z: 17, size: 5 },
      { model: 'tree-birch', x: -17, z: 17, size: 3 },
      { model: 'tree-pine', x: -19, z: -18, size: 3.6 },
      { model: 'tree-broadleaf', x: -15, z: 20, size: 4.5 },
      { model: 'tree-street', x: 4, z: 20, size: 3 },
      { model: 'tree-street', x: -4, z: -20, size: 3 },
      { model: 'bush', x: 12, z: 12, size: 1.6 },
      { model: 'bush', x: -12, z: 12.5, size: 1.6 },
      { model: 'bush', x: 12.5, z: -12, size: 1.6 },
      { model: 'street-lamp', x: 3.4, z: 3.4, size: 5, by: 'height' },
      { model: 'street-lamp', x: -3.4, z: -3.4, size: 5, by: 'height' },
      { model: 'pickup', x: -1.2, z: 12, size: 4.8 },
      { model: 'coupe', x: 13, z: 1.2, rot: 1, size: 4.5 },
    ],
    walk: { x0: -20, x1: 20, z0: -20, z1: 20 },
    camera: { targetY: 3, height: 17 },
  },

  // ── 金沙湾港：harbour ────────────────────────────────────────
  2: {
    era: 2,
    ox: 0,
    oz: -78,
    width: 44,
    depth: 44,
    ground: [
      { x0: -22, x1: 22, z0: -22, z1: -9, color: 'sidewalk' },
      road(-22, 22, -11, -8),
      { x0: -22, x1: 22, z0: -8, z1: -3, color: 'beach', y: -0.4 },
      { x0: -13, x1: -10, z0: -8, z1: 14, color: 'pier', y: 0.3, h: 3.2 },
    ],
    buildings: [
      { model: 'boat-shed', x: -15, z: -16, size: 8 },
      { model: 'beach-cafe', x: -5, z: -15, size: 4 },
      { model: 'yard-crane', x: 3.5, z: -16, size: 5 },
      { model: 'container', x: 9, z: -18.5, size: 6 },
      { model: 'container', x: 9, z: -12.8, size: 6 },
      { model: 'lighthouse', x: 17, z: -15, size: 9 },
      { model: 'lifeguard-tower', x: 3, z: -5.5, size: 4 },
      { model: 'fishing-boat', x: -16.5, z: 4, size: 6.8 },
      { model: 'fishing-boat', x: -4, z: 13, rot: 1, size: 6.8 },
      { model: 'barge', x: 10, z: 7, rot: 1, size: 9 },
      { model: 'sailboat', x: 15, z: 16, size: 5, by: 'height' },
      { model: 'sailboat', x: 3, z: 2.5, size: 4.5, by: 'height' },
    ],
    props: [
      { model: 'tree-street', x: -20, z: -12.5, size: 3 },
      { model: 'tree-street', x: 9, z: -12.5, size: 3 },
      { model: 'street-lamp', x: -1, z: -12, size: 5, by: 'height' },
    ],
    walk: { x0: -20, x1: 20, z0: -7.5, z1: -3.5 },
    water: { x0: -20, x1: 20, z0: -1, z1: 20 },
    camera: { targetY: 2, height: 14 },
  },

  // ── 老城中心：downtown ───────────────────────────────────────
  3: {
    era: 3,
    ox: 0,
    oz: -158,
    width: 52,
    depth: 52,
    ground: [
      { x0: -26, x1: 26, z0: -26, z1: 26, color: 'sidewalk' },
      road(-26, 26, -3, 3),
      road(-3, 3, -26, 26),
      { x0: -26, x1: -18, z0: 17, z1: 26, color: 'lawn' },
    ],
    buildings: [
      { model: 'department-store', x: 12, z: 10, rot: 2, size: 16 },
      { model: 'diner', x: 8, z: 21, rot: 2, size: 8 },
      { model: 'parking-garage', x: -10, z: 10, size: 12 },
      { model: 'fire-station', x: -21, z: 9, rot: 1, size: 8 },
      { model: 'apartment', x: -12, z: -10, size: 16 },
      { model: 'tenement', x: -20, z: -21.5, size: 9.2 },
      { model: 'loft', x: 9.5, z: -9, size: 12 },
      { model: 'corner-tenement', x: 21, z: -10, size: 13.2 },
      { model: 'tenement', x: 9, z: -20.5, size: 9.2 },
    ],
    props: [
      { model: 'tree-oak', x: -22, z: 22, size: 5 },
      { model: 'tree-street', x: 4.5, z: 4.5, size: 3 },
      { model: 'tree-street', x: -4.5, z: -4.5, size: 3 },
      { model: 'tree-street', x: 20, z: 4.5, size: 3 },
      { model: 'coupe', x: 1.4, z: -14, size: 4.5 },
      { model: 'pickup', x: -14, z: -1.4, rot: 1, size: 4.8 },
      { model: 'street-lamp', x: -4.2, z: 4.2, size: 5, by: 'height' },
    ],
    walk: { x0: -24, x1: 24, z0: -24, z1: 24 },
    camera: { targetY: 9, height: 41 },
  },

  // ── 中央商务区：CBD ─────────────────────────────────────────
  4: {
    era: 4,
    ox: 0,
    oz: -246,
    width: 60,
    depth: 60,
    ground: [
      { x0: -30, x1: 30, z0: -30, z1: 30, color: 'plaza' },
      { x0: -30, x1: 30, z0: -4, z1: 4, color: 'asphalt' },
      { x0: -4, x1: 4, z0: -30, z1: 30, color: 'asphalt' },
      { x0: 6, x1: 28, z0: 22, z1: 28, color: 'lawn' },
    ],
    buildings: [
      { model: 'deco-tower', x: -15, z: -15, size: 16 },
      { model: 'slab', x: 16, z: -16, size: 16 },
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
