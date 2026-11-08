import {
  amber,
  bronze,
  brown,
  crimson,
  cyan,
  gold,
  grass,
  gray,
  iris,
  jade,
  lime,
  olive,
  orange,
  pink,
  plum,
  sand,
  sky,
  slate,
  teal,
  tomato,
  violet,
} from '@radix-ui/colors';

/**
 * Scene colours, all taken from Radix Colors (light).
 * Steps follow Radix usage: 1–2 backgrounds, 3–5 surfaces, 6–8 borders/edges, 9–10 solids, 11–12 text.
 * Kitbashed creatures are recoloured with Radix ramps too (see kitbash.ts).
 */
export const PALETTE = {
  skyTop: sky.sky5,
  skyBottom: olive.olive2,
  nightTop: iris.iris12,
  nightBottom: slate.slate11,
  duskTop: plum.plum8,
  duskBottom: orange.orange5,

  boardSide: olive.olive7,

  water: cyan.cyan8,
  waterSurge: cyan.cyan9,

  dust: sand.sand7,
  smoke: olive.olive7,
  debris: [olive.olive8, sand.sand8, brown.brown8, slate.slate8],
  hit: tomato.tomato9,
  heart: tomato.tomato9,
  sprout: grass.grass9,
  sproutLight: lime.lime9,
  raid: tomato.tomato9,
  lava: orange.orange9,
  essence: lime.lime9,
  essenceGlow: jade.jade9,

  /** Lab beacon colours as research rises. */
  beacon: [grass.grass9, amber.amber9, tomato.tomato9] as const,
  beaconIdle: gray.gray8,

  hide: sand.sand9,
  hideBand: brown.brown10,
  hideDark: brown.brown12,
  pole: brown.brown11,
  labBand: tomato.tomato9,

  hemiSky: sky.sky2,
  hemiGround: olive.olive6,
  sun: amber.amber2,
  moon: iris.iris5,

  /** Placement overlay: own ground, neutral ground, enemy ground (with a skill). */
  siteOwn: grass.grass9,
  siteWild: amber.amber9,
  siteEnemy: violet.violet9,

  /** Bars over heads: HP red, lifespan white, construction gold. */
  barBack: slate.slate12,
  barHp: tomato.tomato9,
  barHpHuman: tomato.tomato10,
  barLife: '#ffffff',
  barBuild: gold.gold9,

  flag: grass.grass9,
  auraNature: jade.jade9,
  auraHuman: orange.orange9,
  lampLight: amber.amber8,
  zap: violet.violet9,
  fog: olive.olive6,
} as const;

type Pair = readonly [string, string];

/**
 * Ground by who holds it. Each entry is a pair to blend between with noise.
 * Humans: flat earth → rice paddies and stone paths → brick and tiles → asphalt, lawns, flowerbeds, white beaches.
 * Nature: wildflower meadows, weedy sand with coloured pebbles, glaciers, muddy reed beds.
 * Neutral: dense dark forest and bare dunes.
 */
export const GROUND = {
  human: {
    earth: [brown.brown6, sand.sand7] as Pair,
    earthDark: [brown.brown7, brown.brown6] as Pair,
    paddy: [lime.lime7, grass.grass7] as Pair,
    paddyWater: [teal.teal6, cyan.cyan6] as Pair,
    path: [gray.gray6, sand.sand6] as Pair,
    brick: [bronze.bronze7, brown.brown7] as Pair,
    tile: [sand.sand4, gray.gray5] as Pair,
    rail: [slate.slate9, slate.slate10] as Pair,
    asphalt: [slate.slate8, slate.slate9] as Pair,
    plaza: [slate.slate4, sand.sand3] as Pair,
    lawn: [grass.grass6, lime.lime6] as Pair,
    bed: [pink.pink8, amber.amber8] as Pair,
    beach: [sand.sand2, sand.sand3] as Pair,
    beachEarly: [sand.sand5, sand.sand6] as Pair,
    canal: [slate.slate6, gray.gray6] as Pair,
  },
  nature: {
    meadow: [grass.grass8, jade.jade8] as Pair,
    forest: [grass.grass10, jade.jade9] as Pair,
    sand: [sand.sand6, olive.olive6] as Pair,
    ice: [sky.sky3, sky.sky5] as Pair,
    mud: [olive.olive8, brown.brown8] as Pair,
    flowers: [amber.amber9, pink.pink9, violet.violet8, crimson.crimson8, gold.gold8] as readonly string[],
    pebbles: [slate.slate8, bronze.bronze8, cyan.cyan7, plum.plum7, orange.orange7] as readonly string[],
    weeds: [olive.olive9, grass.grass9] as Pair,
  },
  neutral: {
    forest: [jade.jade11, grass.grass11] as Pair,
    dunes: [sand.sand5, amber.amber4] as Pair,
  },
  volcano: [brown.brown10, slate.slate10] as Pair,
  seabed: [cyan.cyan6, cyan.cyan7] as Pair,
  riverbed: [olive.olive7, cyan.cyan6] as Pair,
  fog: [olive.olive5, olive.olive6] as Pair,
};

export const DISASTER_COLORS = {
  lava: orange.orange9,
  lavaGlow: tomato.tomato9,
  ash: slate.slate9,
  foam: sky.sky2,
  tornado: olive.olive7,
  warn: tomato.tomato9,
  raid: tomato.tomato9,
} as const;
