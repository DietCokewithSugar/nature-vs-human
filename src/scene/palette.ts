import { amber, bronze, brown, cyan, gold, grass, gray, iris, jade, lime, olive, orange, sand, sky, slate, tomato } from '@radix-ui/colors';
import type { GroundColor } from './layout.ts';

/**
 * Scene colours, all taken from Radix Colors (light).
 * Steps follow Radix usage: 1–2 backgrounds, 3–5 surfaces, 6–8 borders/edges, 9–10 solids, 11–12 text.
 * Kitbashed creatures are recoloured with Radix ramps too (see kitbash.ts).
 */
export const PALETTE = {
  skyTop: sky.sky5,
  skyBottom: olive.olive2,

  boardSide: olive.olive7,

  seabed: cyan.cyan6,
  water: cyan.cyan8,
  waterSurge: cyan.cyan9,

  dust: sand.sand7,
  smoke: olive.olive7,
  debris: [olive.olive8, sand.sand8, brown.brown8, slate.slate8],
  hit: tomato.tomato9,
  trail: olive.olive12,
  heart: tomato.tomato9,
  sprout: grass.grass9,
  sproutLight: lime.lime9,
  raid: tomato.tomato9,
  lava: orange.orange9,

  /** Lab beacon colours as research rises. */
  beacon: [grass.grass9, amber.amber9, tomato.tomato9] as const,
  beaconIdle: gray.gray8,
  beam: iris.iris9,

  hide: sand.sand9,
  hideBand: brown.brown10,
  hideDark: brown.brown12,
  pole: brown.brown11,
  labBand: tomato.tomato9,

  hemiSky: sky.sky2,
  hemiGround: olive.olive6,
  sun: amber.amber2,
} as const;

export const GROUND: Record<GroundColor, string> = {
  snow: sky.sky2,
  tundra: olive.olive6,
  ice: sky.sky5,
  earth: brown.brown6,
  stone: gray.gray7,
  lawn: grass.grass6,
  cobble: bronze.bronze6,
  brick: bronze.bronze8,
  road: olive.olive6,
  sidewalk: sand.sand4,
  asphalt: slate.slate7,
  plaza: slate.slate4,
  pier: brown.brown7,
  earthDark: brown.brown7,
  field: lime.lime8,
  fieldDark: brown.brown8,
  gravel: slate.slate6,
  rail: slate.slate10,
};

/** Wild ground, by kind. Each entry is a pair to blend between with noise. */
export const NATURE = {
  snow: [sky.sky2, sky.sky3],
  tundra: [olive.olive6, sky.sky4],
  grass: [grass.grass7, grass.grass8],
  forest: [grass.grass8, jade.jade8],
  plains: [lime.lime8, gold.gold8],
  ash: [brown.brown9, slate.slate9],
  rock: [olive.olive8, slate.slate8],
  sand: [sand.sand5, sand.sand7],
  seabed: [cyan.cyan6, cyan.cyan7],
  cleared: [sand.sand6, sand.sand7],
} as const;

export const DISASTER_COLORS = {
  lava: orange.orange9,
  lavaGlow: tomato.tomato9,
  ash: slate.slate9,
  foam: sky.sky2,
  tornado: olive.olive7,
  warn: tomato.tomato9,
  raid: tomato.tomato9,
} as const;
