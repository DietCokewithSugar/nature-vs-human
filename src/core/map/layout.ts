import type { Lane, Side } from '../types.ts';

/**
 * The one battlefield every stage is fought on: a landscape map with three lanes.
 * Coordinates are art pixels (one map tile is 16 px). Nature's home is on the left, the
 * humans' camp on the right; snowy pine forest and rock between the lanes can't be walked.
 *
 *   0          120                               456         576
 *   ┌──────────┬─────── top lane (7 stretches) ───┬───────────┐  y 26..94
 *   │ nature   │▒▒▒▒▒▒▒▒▒▒▒ forest ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│ human     │
 *   │ home     ├─────── mid lane ─────────────────┤ camp      │  y 126..194
 *   │          │▒▒▒▒▒▒▒▒▒▒▒ forest ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│           │
 *   └──────────┴─────── bottom lane ──────────────┴───────────┘  y 226..294
 */
export const TILE = 16;
export const MAP_W = 576;
export const MAP_H = 320;

/** Centre line of each lane, and how far either side of it units may walk. */
export const LANE_Y: readonly [number, number, number] = [60, 160, 260];
export const LANE_HALF = 34;

/** The field between the two homes, split into stretches of ground that change hands. */
export const FIELD_X0 = 120;
export const FIELD_X1 = 456;
export const SEGMENTS = 7;
export const SEG_W = (FIELD_X1 - FIELD_X0) / SEGMENTS;

/** Hot springs: the middle stretch of the top and bottom lanes pays its holder more. */
export const SPRINGS: readonly { lane: Lane; seg: number }[] = [
  { lane: 0, seg: 3 },
  { lane: 2, seg: 3 },
];

export interface MainSite {
  x: number;
  y: number;
  /** Footprint radius: units stop at this distance to hit it. */
  r: number;
}

export const MAINS: Record<Side, MainSite> = {
  nature: { x: 40, y: 160, r: 26 },
  human: { x: MAP_W - 40, y: 160, r: 26 },
};

export interface Pad {
  id: number;
  x: number;
  y: number;
  lane: Lane;
  /** Home pads belong to one side; field pads belong to whoever holds that stretch. */
  home: Side | null;
  /** Field pads: the stretch they stand in. */
  seg: number;
}

/** Footprint radius of a building on a pad. */
export const PAD_R = 14;

function segCenter(seg: number): number {
  return FIELD_X0 + SEG_W * (seg + 0.5);
}

function buildPads(): Pad[] {
  const pads: Pad[] = [];
  const add = (x: number, y: number, lane: Lane, home: Side | null, seg = -1) => pads.push({ id: pads.length, x, y, lane, home, seg });
  // Home pads for nature, mirrored for the humans: three per lane around the main building.
  const homePads: [number, number, Lane][] = [
    [36, 58, 0],
    [88, 58, 0],
    [36, 106, 0],
    [88, 108, 1],
    [88, 160, 1],
    [88, 212, 1],
    [36, 214, 2],
    [36, 262, 2],
    [88, 262, 2],
  ];
  for (const [x, y, lane] of homePads) add(x, y, lane, 'nature');
  for (const [x, y, lane] of homePads) add(MAP_W - x, y, lane, 'human');
  // Field pads: four per lane on the stretches either side of the middle, alternating edges.
  for (const lane of [0, 1, 2] as Lane[]) {
    const ly = LANE_Y[lane];
    add(segCenter(1), ly - 20, lane, null, 1);
    add(segCenter(2), ly + 20, lane, null, 2);
    add(segCenter(4), ly - 20, lane, null, 4);
    add(segCenter(5), ly + 20, lane, null, 5);
  }
  return pads;
}

export const PADS: readonly Pad[] = buildPads();

/** The stretch of field at x, or −1 inside either home. */
export function segmentAt(x: number): number {
  if (x < FIELD_X0 || x >= FIELD_X1) return -1;
  return Math.min(SEGMENTS - 1, Math.floor((x - FIELD_X0) / SEG_W));
}

/** The lane whose band contains y, or −1 in the forest between lanes. */
export function laneAt(y: number): Lane | -1 {
  for (const lane of [0, 1, 2] as Lane[]) if (Math.abs(y - LANE_Y[lane]) <= LANE_HALF) return lane;
  return -1;
}

export function segmentSpan(seg: number): [number, number] {
  return [FIELD_X0 + SEG_W * seg, FIELD_X0 + SEG_W * (seg + 1)];
}

/** Which way a side marches along the lanes: nature goes right (+1), the humans left (−1). */
export function forward(side: Side): 1 | -1 {
  return side === 'nature' ? 1 : -1;
}

/** Inside a side's own home (left or right of the field). */
export function inHome(side: Side, x: number): boolean {
  return side === 'nature' ? x < FIELD_X0 : x >= FIELD_X1;
}

/** Inside the enemy's home. */
export function inEnemyHome(side: Side, x: number): boolean {
  return side === 'nature' ? x >= FIELD_X1 : x < FIELD_X0;
}

/** Where a side's units enter the field from their home. */
export function fieldEntry(side: Side): number {
  return side === 'nature' ? FIELD_X0 : FIELD_X1;
}
