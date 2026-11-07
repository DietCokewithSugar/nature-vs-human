import type { CreatureId, EraId, ZoneId } from '../core/index.ts';
import type { GroundColor, Placement, Rect } from './layout.ts';

/**
 * The one map every run is played on, from the ice age to the metropolis.
 *
 * North is −z, east is +x; the default camera looks from the south-east.
 * Humans hold the east and grow outwards each era along straight lines on flattened ground.
 * Nature holds the west and the pockets: the sea and the bay, the river with a few fords,
 * the volcano in the north-west, the plains in the north-east, and a forest pocket that
 * sits in the hollow of the city. Early on the two sides are apart; by the modern era the
 * city has outposts in the wild and the wild has lairs among the suburbs.
 */

export const MAP_HALF = 64;
export const SEABED_Y = -3;

// ── Water ──────────────────────────────────────────────────────

/** The river, north to south, into the bay. */
export const RIVER: readonly [number, number][] = [
  [-22, -66],
  [-20, -44],
  [-17, -26],
  [-16, -8],
  [-17, 10],
  [-20, 28],
  [-27, 42],
];
export const RIVER_HALF_WIDTH = 2.8;

/** Shallow crossings in the river, open to everyone from the start. */
export const FORDS: readonly [number, number][] = [
  [-17.2, -30],
  [-18.6, 20],
];

/** Bridges the humans build, by era. Rect in world coordinates. */
export const BRIDGES: readonly { era: EraId; rect: Rect }[] = [
  { era: 3, rect: { x0: -22, x1: -11, z0: -14, z1: -10 } },
  { era: 4, rect: { x0: -23, x1: -12, z0: 2, z1: 6 } },
];

/** The bay in the south-west. */
export const BAY = { x: -42, z: 54, r: 25 };

export function westCoastX(z: number): number {
  return -51 + 3 * Math.sin(z * 0.09) + 2 * Math.sin(z * 0.23 + 1);
}

export function southCoastZ(x: number): number {
  return 57 + 1.5 * Math.sin(x * 0.2) + Math.max(0, x - 18) * 0.9;
}

// ── Landmarks ──────────────────────────────────────────────────

export const VOLCANO = { x: -47, z: -47, size: 34 };

/** Where each disaster strikes, for its warning outline and its effects. */
export const ZONE_AREAS: Record<ZoneId, { x: number; z: number; r: number }> = {
  forest: { x: -3, z: 16, r: 15 },
  plains: { x: 30, z: -52, r: 26 },
  volcano: { x: -40, z: -38, r: 22 },
  coast: { x: -40, z: 40, r: 26 },
};

// ── Lairs ──────────────────────────────────────────────────────

export interface LairSpot {
  x: number;
  z: number;
  model: string;
  size: number;
  rot?: number;
  /** Swimmers live in the water around it. */
  water?: boolean;
}

export const LAIR_SPOTS: Record<CreatureId, LairSpot> = {
  // Forest pocket: the front line, in the city's hollow.
  ant: { x: -7, z: 7, model: 'lair-anthill', size: 4.5 },
  wolf: { x: 4, z: 24, model: 'lair-den', size: 5.5 },
  rat: { x: 7, z: 5, model: 'lair-burrow', size: 4.2 },
  wildcat: { x: -9, z: 22, model: 'lair-thicket', size: 5.5 },
  pigeon: { x: -1, z: 13, model: 'lair-nest-tree', size: 6 },
  tiger: { x: -4, z: 31, model: 'lair-jungle', size: 7 },
  // Volcano, behind the river.
  sabertooth: { x: -30, z: -35, model: 'lair-cave', size: 7 },
  cavebear: { x: -42, z: -24, model: 'lair-cave-big', size: 8.5 },
  mammoth: { x: -27, z: -56, model: 'lair-glacier', size: 9 },
  crow: { x: -27, z: -17, model: 'lair-dead-tree', size: 6.5 },
  // Coast and bay.
  crocodile: { x: -26, z: 33, model: 'lair-reeds', size: 6 },
  mosquito: { x: -37, z: 9, model: 'lair-pond', size: 7 },
  octopus: { x: -40, z: 47, model: 'lair-reef', size: 6.5, water: true },
  shark: { x: -55, z: 57, model: 'lair-reef-deep', size: 8, water: true },
  // Plains in the north-east.
  locust: { x: 29, z: -52, model: 'lair-flowers', size: 6.5 },
  boar: { x: 14, z: -48, model: 'lair-wallow', size: 6 },
  bison: { x: 49, z: -55, model: 'lair-prairie', size: 8 },
  termite: { x: 59, z: -43, model: 'lair-termite-mound', size: 6 },
  rhino: { x: 2, z: -56, model: 'lair-wallow-big', size: 8.5 },
  elephant: { x: 20, z: -59, model: 'lair-baobab', size: 8 },
};

/** Where a raid party sets out from: the edge of the city facing each zone. */
export const RAID_GATES: Record<ZoneId, [number, number]> = {
  forest: [16, 14],
  plains: [24, -30],
  volcano: [10, -24],
  coast: [16, 36],
};

// ── Human territory ────────────────────────────────────────────

/**
 * Ground the humans hold in each era (cumulative): flattened, cleared of nature, paved in that era's style.
 * Straight edges on purpose. The forest pocket (x < 12 between z −2 and 36) stays out of it.
 */
export const TERRITORY: Record<EraId, Rect[]> = {
  1: [{ x0: 10, x1: 44, z0: -20, z1: 12 }],
  2: [
    { x0: 12, x1: 50, z0: -34, z1: 22 },
    { x0: 4, x1: 12, z0: -34, z1: -4 },
    // Watch post on the east bank, eyes on the volcano.
    { x0: -12, x1: -6, z0: -36, z1: -30 },
    // Logging camp at the forest's edge.
    { x0: 12, x1: 22, z0: 22, z1: 32 },
  ],
  3: [
    { x0: 12, x1: 62, z0: -36, z1: 40 },
    { x0: -2, x1: 12, z0: -36, z1: -4 },
    { x0: -6, x1: 30, z0: 36, z1: 60 },
    // Railway cut into the plains.
    { x0: 37, x1: 41, z0: -66, z1: -36 },
    { x0: -12, x1: -6, z0: -36, z1: -30 },
    // Mine at the foot of the volcano, reached over the new bridge.
    { x0: -41, x1: -33, z0: -36, z1: -28 },
  ],
  4: [
    { x0: 12, x1: 66, z0: -44, z1: 60 },
    { x0: -6, x1: 12, z0: -44, z1: -4 },
    { x0: -8, x1: 30, z0: 36, z1: 60 },
    { x0: 37, x1: 41, z0: -66, z1: -44 },
    { x0: -12, x1: -6, z0: -36, z1: -30 },
    { x0: -41, x1: -33, z0: -36, z1: -28 },
    // Geothermal plant on the volcano's flank, wind farm on the plains.
    { x0: -32, x1: -24, z0: -48, z1: -40 },
    { x0: 50, x1: 64, z0: -64, z1: -50 },
  ],
};

export function inTerritory(era: EraId, x: number, z: number, pad = 0): boolean {
  for (const r of TERRITORY[era]) {
    if (x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad) return true;
  }
  return false;
}

/** Distance outside the territory (0 inside), for soft flattening at its edge. */
export function territoryDistance(era: EraId, x: number, z: number): number {
  let best = Infinity;
  for (const r of TERRITORY[era]) {
    const dx = Math.max(r.x0 - x, 0, x - r.x1);
    const dz = Math.max(r.z0 - z, 0, z - r.z1);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

// ── Human ground, per era ──────────────────────────────────────

export interface Tile extends Rect {
  color: GroundColor;
  /** Raised tiles (piers) stand above the ground. */
  y?: number;
  h?: number;
}

const t = (x0: number, x1: number, z0: number, z1: number, color: GroundColor, extra: Partial<Tile> = {}): Tile => ({
  x0,
  x1,
  z0,
  z1,
  color,
  ...extra,
});

/** Rows of a ploughed field: alternating stripes. */
function field(x0: number, x1: number, z0: number, z1: number, rows: number): Tile[] {
  const out: Tile[] = [];
  const step = (z1 - z0) / rows;
  for (let i = 0; i < rows; i++) out.push(t(x0, x1, z0 + i * step, z0 + (i + 1) * step - step * 0.25, i % 2 ? 'field' : 'fieldDark'));
  return out;
}

/** A neat park lawn with a path round it. */
function park(x0: number, x1: number, z0: number, z1: number): Tile[] {
  return [t(x0, x1, z0, z1, 'sidewalk'), t(x0 + 1, x1 - 1, z0 + 1, z1 - 1, 'lawn')];
}

export const GROUND_TILES: Record<EraId, Tile[]> = {
  1: [t(10, 44, -20, 12, 'earth'), t(20, 32, -8, 4, 'earthDark')],
  2: [
    t(12, 50, -34, 22, 'earth'),
    t(4, 12, -34, -4, 'earth'),
    t(-12, -6, -36, -30, 'earth'),
    t(12, 22, 22, 32, 'earth'),
    t(24, 28, -34, 22, 'stone'),
    t(4, 50, -8, -4, 'stone'),
    t(18, 34, -22, -4, 'cobble'),
    ...field(30, 50, -33, -22, 6),
    ...field(12, 22, -33, -24, 4),
  ],
  3: [
    t(12, 62, -36, 40, 'cobble'),
    t(-2, 12, -36, -4, 'cobble'),
    t(-6, 30, 36, 60, 'brick'),
    t(-12, -6, -36, -30, 'earth'),
    t(-41, -33, -36, -28, 'earth'),
    t(37, 41, -66, -36, 'gravel'),
    t(38.3, 39.7, -66, 40, 'rail'),
    t(24, 28, -36, 40, 'road'),
    t(-2, 62, -8, -4, 'road'),
    t(-2, 62, 18, 21, 'road'),
    t(46, 62, -34, -12, 'brick'),
    t(44, 62, 22, 38, 'brick'),
    t(4, 24, 50, 54, 'pier', { y: 0.35, h: 0.5 }),
    t(6, 9, 54, 62, 'pier', { y: 0.35, h: 0.5 }),
    t(16, 19, 54, 62, 'pier', { y: 0.35, h: 0.5 }),
  ],
  4: [
    t(12, 66, -44, 60, 'plaza'),
    t(-6, 12, -44, -4, 'plaza'),
    t(-8, 30, 36, 60, 'plaza'),
    t(-12, -6, -36, -30, 'sidewalk'),
    t(-41, -33, -36, -28, 'sidewalk'),
    t(-32, -24, -48, -40, 'sidewalk'),
    t(50, 64, -64, -50, 'lawn'),
    t(37, 41, -66, -44, 'gravel'),
    t(38.3, 39.7, -66, -4, 'rail'),
    // Avenues and streets.
    t(23, 29, -44, 60, 'asphalt'),
    t(-6, 66, -9, -3, 'asphalt'),
    t(12, 66, 17, 22, 'asphalt'),
    t(-6, 66, -30, -26, 'asphalt'),
    t(46, 50, -44, 60, 'asphalt'),
    t(-8, 30, 40, 44, 'asphalt'),
    ...park(30, 44, 24, 38),
    ...park(-4, 10, -24, -12),
    t(4, 24, 50, 54, 'pier', { y: 0.35, h: 0.5 }),
    t(6, 9, 54, 62, 'pier', { y: 0.35, h: 0.5 }),
    t(16, 19, 54, 62, 'pier', { y: 0.35, h: 0.5 }),
  ],
};

// ── Buildings ──────────────────────────────────────────────────

type Stage = [model: string, size: number, by?: 'height'];

export interface Lot {
  x: number;
  z: number;
  rot?: number;
  /** What stands here from each era on. A missing era keeps the last one; null clears the lot. */
  eras: Partial<Record<EraId, Stage | null>>;
  /** The humans' research building. */
  lab?: boolean;
  /** Boats ride the water level. */
  floats?: boolean;
  /** Human outpost in the wild (counts for disasters striking its zone). */
  zone?: ZoneId;
}

export const LOTS: Lot[] = [
  { x: 26, z: -13, lab: true, eras: { 1: ['teepee-lab', 9], 2: ['temple', 11], 3: ['loft', 12], 4: ['slab', 16] } },
  { x: 15, z: -15, eras: { 1: ['teepee', 6], 2: ['townhouse', 9], 3: ['tenement', 9.2], 4: ['hotel', 10] } },
  { x: 38, z: -1, rot: 2, eras: { 1: ['teepee', 6], 2: ['townhouse', 9], 3: ['corner-tenement', 9], 4: ['bank', 12] } },
  { x: 15, z: 3, eras: { 1: ['teepee', 6], 2: ['storehouse', 6], 3: ['silo', 8, 'height'], 4: ['department-store', 10] } },
  { x: 29, z: 7, eras: { 1: ['teepee', 5.5], 2: ['farmhouse', 8], 3: ['water-tower', 12, 'height'], 4: ['parking-garage', 10] } },
  { x: 41, z: -14, rot: 3, eras: { 1: ['dugout', 5], 2: ['pagoda', 6.5], 3: ['boiler-hall', 8], 4: ['office-tower', 8] } },
  { x: 37, z: 11, rot: 2, eras: { 1: ['lean-to', 4.5], 2: ['market', 2.6], 3: ['container', 5], 4: ['corner-tenement', 9] } },
  { x: 20, z: -3, eras: { 1: ['hide-rack', 3.4], 2: ['market', 2.6], 3: null } },
  { x: 33, z: -6, eras: { 1: ['larder', 3, 'height'], 2: null } },
  { x: 13, z: -6, rot: 1, eras: { 1: ['dugout', 5], 2: ['bell-tower', 6.8, 'height'], 3: ['tenement', 9], 4: ['office-tower', 8] } },
  // Ancient: the town spreads north to the gate and out to the farms.
  { x: 26, z: -30, eras: { 2: ['gatehouse', 8], 3: ['warehouse', 12], 4: ['deco-tower', 16] } },
  { x: 44, z: -29, eras: { 2: ['farmhouse', 8], 3: ['boiler-hall', 8], 4: ['office-tower', 8] } },
  { x: 18, z: 16, eras: { 2: ['storehouse', 6], 3: ['tenement', 9], 4: ['hotel', 10] } },
  { x: 46, z: 15, rot: 1, eras: { 2: ['townhouse', 9], 3: ['warehouse', 12], 4: ['bank', 12] } },
  { x: 8, z: -24, eras: { 2: ['storehouse', 6], 3: ['boiler-hall', 8], 4: ['hotel', 10] } },
  { x: -9, z: -33, zone: 'volcano', eras: { 2: ['watchtower', 6, 'height'] } },
  { x: 17, z: 27, zone: 'forest', eras: { 2: ['lean-to', 4.5], 3: ['tenement', 9], 4: ['department-store', 10] } },
  { x: -17, z: 0, rot: 0, floats: true, eras: { 2: ['river-boat', 5.5], 3: null } },
  // Industrial: factories east, a harbour on the south coast, a mine across the river.
  { x: 55, z: -24, eras: { 3: ['boiler-hall', 8], 4: ['office-tower', 8] } },
  { x: 55, z: -6, eras: { 3: ['warehouse', 12], 4: ['deco-tower', 14] } },
  { x: 54, z: 29, eras: { 3: ['boiler-hall', 8], 4: ['office-tower', 8] } },
  { x: 36, z: 30, eras: { 3: ['silo', 8, 'height'], 4: ['parking-garage', 10] } },
  { x: 11, z: 47, zone: 'coast', eras: { 3: ['yard-crane', 5] } },
  { x: 20, z: 45, rot: 1, zone: 'coast', eras: { 3: ['container', 5] } },
  { x: -4, z: 50, zone: 'coast', eras: { 3: ['lighthouse', 8] } },
  { x: 12, z: 60, rot: 1, floats: true, zone: 'coast', eras: { 3: ['barge', 9] } },
  { x: -2, z: 62, floats: true, zone: 'coast', eras: { 3: ['fishing-boat', 6.8] } },
  { x: -37, z: -32, zone: 'volcano', eras: { 3: ['mine-head', 7] } },
  { x: 55, z: 47, eras: { 3: ['warehouse', 11], 4: ['hotel', 10] } },
  // Modern: towers fill the blocks, the city reaches the wild.
  { x: 3, z: -36, eras: { 4: ['office-tower', 8] } },
  { x: 15, z: -38, eras: { 4: ['parking-garage', 10] } },
  { x: 36, z: -38, eras: { 4: ['office-tower', 8] } },
  { x: 58, z: -38, eras: { 4: ['hotel', 10] } },
  { x: 38, z: 50, eras: { 4: ['bank', 12] } },
  { x: -28, z: -44, zone: 'volcano', eras: { 4: ['geothermal', 8] } },
  { x: -48, z: 36, floats: false, zone: 'coast', eras: { 4: ['oil-rig', 8] } },
  { x: 54, z: -60, zone: 'plains', eras: { 4: ['wind-turbine', 12, 'height'] } },
  { x: 61, z: -53, zone: 'plains', eras: { 4: ['wind-turbine', 12, 'height'] } },
];

/** Things that stand around but are not torn down: campfires, lamps, cars, park trees. */
export interface PropSpot extends Placement {
  from: EraId;
  to?: EraId;
}

export const PROPS: PropSpot[] = [
  { model: 'campfire', x: 26, z: -2, size: 2.6, from: 1, to: 1 },
  { model: 'totem', x: 32, z: -13, size: 4.2, by: 'height', from: 1, to: 1 },
  { model: 'fleshing', x: 30, z: 1, rot: 1, size: 2.4, from: 1, to: 1 },
  { model: 'spear', x: 22, z: 2, size: 3, by: 'height', from: 1, to: 1 },
  { model: 'petroglyph', x: 12, z: -18, size: 2.6, from: 1, to: 2 },
  { model: 'well', x: 26, z: 1, size: 1.8, by: 'height', from: 2, to: 2 },
  { model: 'sakura', x: 33, z: -18, size: 4, from: 2, to: 2 },
  { model: 'maple', x: 20, z: -19, size: 4, from: 2, to: 2 },
  { model: 'sakura', x: 45, z: 4, size: 4.2, from: 2, to: 3 },
  { model: 'log-pile', x: 13, z: 30, rot: 1, size: 3.4, from: 2, to: 2 },
  { model: 'stump', x: 20, z: 30, size: 1.4, from: 2, to: 2 },
  { model: 'street-lamp', x: 30, z: -10, size: 5, by: 'height', from: 3 },
  { model: 'street-lamp', x: 22, z: 12, size: 5, by: 'height', from: 3 },
  { model: 'street-lamp', x: 30, z: 24, size: 5, by: 'height', from: 3 },
  { model: 'tree-street', x: 33, z: 27, size: 3, from: 4 },
  { model: 'tree-street', x: 41, z: 27, size: 3, from: 4 },
  { model: 'tree-street', x: 33, z: 35, size: 3, from: 4 },
  { model: 'tree-street', x: 41, z: 35, size: 3, from: 4 },
  { model: 'tree-street', x: 0, z: -21, size: 3, from: 4 },
  { model: 'tree-street', x: 6, z: -15, size: 3, from: 4 },
  { model: 'coupe', x: 26, z: -22, size: 4.5, from: 4 },
  { model: 'coupe', x: 40, z: -6, rot: 1, size: 4.5, from: 4 },
  { model: 'pickup', x: 26, z: 30, size: 4.8, from: 4 },
  { model: 'coupe', x: 2, z: -28, rot: 1, size: 4.5, from: 4 },
];

/** Fences around the lairs the humans have reached, per era: the frontier closing in. */
export const FENCES: { era: EraId; x: number; z: number; rot: number }[] = [
  { era: 3, x: 34, z: -46, rot: 0 },
  { era: 3, x: 42, z: -46, rot: 0 },
  { era: 3, x: 12, z: 35, rot: 0 },
  { era: 4, x: 8, z: -46, rot: 0 },
  { era: 4, x: 20, z: -46, rot: 0 },
  { era: 4, x: 10, z: 33, rot: 1 },
  { era: 4, x: 10, z: -1, rot: 0 },
  { era: 4, x: -14, z: -34, rot: 1 },
];

// ── Camera ─────────────────────────────────────────────────────

/** The part of the map the camera frames by default in each era: it pulls back as the city grows. */
export const FRAMES: Record<EraId, { x: number; z: number; size: number; targetY: number; height: number }> = {
  1: { x: 6, z: -6, size: 84, targetY: 1, height: 10 },
  2: { x: 4, z: -6, size: 100, targetY: 2, height: 14 },
  3: { x: 2, z: 0, size: 118, targetY: 3, height: 18 },
  4: { x: 0, z: 0, size: 130, targetY: 6, height: 28 },
};
