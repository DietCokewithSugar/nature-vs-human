/**
 * The one palette every pixel in the game comes from: Resurrect 64 by Kerrie Lake
 * (https://lospec.com/palette-list/resurrect-64). Baked sprites, ground pixels, effects and
 * imported art are all snapped to it, which is what keeps assets from different sources matching.
 * See docs/art-style.md.
 */
export const RESURRECT_64 = [
  '#2e222f', '#3e3546', '#625565', '#966c6c', '#ab947a', '#694f62', '#7f708a', '#9babb2',
  '#c7dcd0', '#ffffff', '#6e2727', '#b33831', '#ea4f36', '#f57d4a', '#ae2334', '#e83b3b',
  '#fb6b1d', '#f79617', '#f9c22b', '#7a3045', '#9e4539', '#cd683d', '#e6904e', '#fbb954',
  '#4c3e24', '#676633', '#a2a947', '#d5e04b', '#fbff86', '#165a4c', '#239063', '#1ebc73',
  '#91db69', '#cddf6c', '#313638', '#374e4a', '#547e64', '#92a984', '#b2ba90', '#0b5e65',
  '#0b8a8f', '#0eaf9b', '#30e1b9', '#8ff8e2', '#323353', '#484a77', '#4d65b4', '#4d9be6',
  '#8fd3ff', '#45293f', '#6b3e75', '#905ea9', '#a884f3', '#eaaded', '#753c54', '#a24b6f',
  '#cf657f', '#ed8099', '#831c5d', '#c32454', '#f04f78', '#f68181', '#fca790', '#fdcbb0',
] as const;

export type Hex = (typeof RESURRECT_64)[number];

/** Named entries, so code says what a colour is for rather than which index it has. */
export const C = {
  ink: '#2e222f',
  night: '#3e3546',
  slate: '#625565',
  dusk: '#966c6c',
  khaki: '#ab947a',
  plum: '#694f62',
  lilacGrey: '#7f708a',
  steel: '#9babb2',
  mist: '#c7dcd0',
  white: '#ffffff',
  blood: '#6e2727',
  brick: '#b33831',
  vermilion: '#ea4f36',
  salmon: '#f57d4a',
  crimson: '#ae2334',
  red: '#e83b3b',
  orange: '#fb6b1d',
  amber: '#f79617',
  gold: '#f9c22b',
  wine: '#7a3045',
  rust: '#9e4539',
  clay: '#cd683d',
  tan: '#e6904e',
  straw: '#fbb954',
  umber: '#4c3e24',
  olive: '#676633',
  moss: '#a2a947',
  lime: '#d5e04b',
  lemon: '#fbff86',
  pine: '#165a4c',
  forest: '#239063',
  green: '#1ebc73',
  leaf: '#91db69',
  pear: '#cddf6c',
  charcoal: '#313638',
  bog: '#374e4a',
  sage: '#547e64',
  sageLight: '#92a984',
  reed: '#b2ba90',
  deepTeal: '#0b5e65',
  teal: '#0b8a8f',
  aqua: '#0eaf9b',
  mint: '#30e1b9',
  foam: '#8ff8e2',
  navy: '#323353',
  indigo: '#484a77',
  blue: '#4d65b4',
  sky: '#4d9be6',
  ice: '#8fd3ff',
  aubergine: '#45293f',
  grape: '#6b3e75',
  violet: '#905ea9',
  lavender: '#a884f3',
  pink: '#eaaded',
  rose: '#753c54',
  raspberry: '#a24b6f',
  coral: '#cf657f',
  blush: '#ed8099',
  magenta: '#831c5d',
  cerise: '#c32454',
  hotPink: '#f04f78',
  peach: '#f68181',
  apricot: '#fca790',
  skin: '#fdcbb0',
} as const satisfies Record<string, Hex>;

export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function numOf(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

const RGB = RESURRECT_64.map(rgbOf);

/** sRGB → linear → OKLab: perceptual distance, so snapping keeps hues instead of drifting grey. */
function oklab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const LAB = RGB.map(([r, g, b]) => oklab(r, g, b));
const cache = new Map<number, number>();

/** Index of the palette colour nearest to an sRGB colour. */
export function nearest(r: number, g: number, b: number): number {
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const [L, A, B] = oklab(r, g, b);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < LAB.length; i++) {
    const [l, a, bb] = LAB[i]!;
    // Lightness counts a little more: silhouettes and shading read by value first.
    const d = (L - l) ** 2 * 1.4 + (A - a) ** 2 + (B - bb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  cache.set(key, best);
  return best;
}

export function paletteRgb(i: number): [number, number, number] {
  return RGB[i]!;
}

/** Snap every pixel of an RGBA buffer to the palette, in place. Alpha becomes 0 or 255. */
export function snapToPalette(data: Uint8ClampedArray, alphaCut = 128): void {
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3]! < alphaCut) {
      data[p] = data[p + 1] = data[p + 2] = data[p + 3] = 0;
      continue;
    }
    const [r, g, b] = RGB[nearest(data[p]!, data[p + 1]!, data[p + 2]!)]!;
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
    data[p + 3] = 255;
  }
}
