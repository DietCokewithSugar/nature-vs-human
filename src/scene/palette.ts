import { amber, cyan, grass, olive, sand, sky, slate, tomato, brown, lime } from '@radix-ui/colors';

/**
 * Scene colours, all taken from Radix Colors (light).
 * Steps follow Radix usage: 1–2 backgrounds, 3–5 surfaces, 6–8 borders/edges, 9–10 solids, 11–12 text.
 * Model vertex colours are left as authored by Polyfork.
 */
export const PALETTE = {
  skyTop: sky.sky4,
  skyBottom: olive.olive2,

  boardSide: olive.olive7,
  boardSideDark: olive.olive8,

  lawn: grass.grass6,
  lawnDark: grass.grass7,
  hedge: grass.grass8,
  road: olive.olive6,
  roadLine: olive.olive2,
  sidewalk: sand.sand4,
  beach: amber.amber4,
  pier: brown.brown7,
  seabed: cyan.cyan6,
  water: cyan.cyan8,
  waterSurge: cyan.cyan9,
  foam: cyan.cyan3,
  asphalt: slate.slate7,
  plaza: slate.slate4,
  plazaLine: slate.slate6,
  forest: grass.grass8,

  dust: sand.sand7,
  smoke: olive.olive7,
  debris: [olive.olive8, sand.sand8, brown.brown8, slate.slate8],
  spark: amber.amber9,
  fire: tomato.tomato9,
  trail: olive.olive12,
  hit: tomato.tomato9,
  insect: lime.lime11,

  hemiSky: sky.sky2,
  hemiGround: olive.olive6,
  sun: amber.amber2,
} as const;
