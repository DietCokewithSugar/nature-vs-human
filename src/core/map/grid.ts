/**
 * The battlefield is a square grid of cells ("地块"). Every cell has a terrain and, if it can be
 * held, a control value (see sim/territory.ts). Coordinates in the simulation are art pixels;
 * a cell is CELL × CELL of them (2 × 2 of the 16 px art tiles).
 *
 * The map opens in rings centred on the humans' capital: the ice age plays on the middle
 * 32 × 32 cells, and each later era opens a ring 8 cells wide, out to 80 × 80 in the modern age.
 */
export const CELL = 32;
export const GRID = 80;
export const CELLS = GRID * GRID;
export const MAP_PX = GRID * CELL;

/** Eras: ice age, ancient, industrial, modern. Stage n plays in era min(n − 1, 3). */
export const ERA_COUNT = 4;
/** Half the side of the open square in each era, in cells. */
export const ERA_HALF: readonly number[] = [16, 24, 32, 40];

export type Terrain = 'grass' | 'forest' | 'dune' | 'beach' | 'snow' | 'stream' | 'water' | 'volcano';
/** Terrain by code (the map stores codes). */
export const TERRAINS: readonly Terrain[] = ['grass', 'forest', 'dune', 'beach', 'snow', 'stream', 'water', 'volcano'];
export const T: Record<Terrain, number> = { grass: 0, forest: 1, dune: 2, beach: 3, snow: 4, stream: 5, water: 6, volcano: 7 };

/** Lakes, seas and volcanoes can't be walked or held by anyone. Everything else can. */
export function holdable(code: number): boolean {
  return code !== T.water && code !== T.volcano;
}

export const idx = (cx: number, cy: number): number => cy * GRID + cx;
export const cxOf = (i: number): number => i % GRID;
export const cyOf = (i: number): number => Math.floor(i / GRID);
export const inGrid = (cx: number, cy: number): boolean => cx >= 0 && cy >= 0 && cx < GRID && cy < GRID;

/** The cell under a map point, or −1 off the map. */
export function cellAt(x: number, y: number): number {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  return inGrid(cx, cy) ? idx(cx, cy) : -1;
}

export function cellX(i: number): number {
  return (cxOf(i) + 0.5) * CELL;
}

export function cellY(i: number): number {
  return (cyOf(i) + 0.5) * CELL;
}

/** The era in which a cell opens: 0 for the ice-age square, 3 for the outermost ring. */
export function ringOf(cx: number, cy: number): number {
  const d = Math.max(Math.abs(cx + 0.5 - GRID / 2), Math.abs(cy + 0.5 - GRID / 2));
  for (let e = 0; e < ERA_COUNT; e++) if (d < ERA_HALF[e]!) return e;
  return ERA_COUNT - 1;
}

/** The open square of an era, in cells: [first, last] on both axes. */
export function eraBounds(era: number): [number, number] {
  const h = ERA_HALF[Math.max(0, Math.min(ERA_COUNT - 1, era))]!;
  return [GRID / 2 - h, GRID / 2 + h - 1];
}

/** Eight neighbours (dx, dy), orthogonal first. */
export const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/** Chebyshev distance between two cells. */
export function cellGap(a: number, b: number): number {
  return Math.max(Math.abs(cxOf(a) - cxOf(b)), Math.abs(cyOf(a) - cyOf(b)));
}

/** Straight-line distance between two cells, in cells. */
export function cellDist(a: number, b: number): number {
  return Math.hypot(cxOf(a) - cxOf(b), cyOf(a) - cyOf(b));
}
