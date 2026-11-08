import type { UnitId } from '../core/index.ts';
import { C, rgbOf } from '../pixel/palette.ts';

/**
 * People are drawn, not baked: at 16 px a shrunken 3D figure is a smudge, so every person is
 * built from one chibi template (big head, one-pixel eye, short body) plus their trade's
 * colours, hat and tool. This is the usual paper-doll approach of pixel games, and it keeps
 * every era's people in one family. New trades are a new entry in LOOKS below.
 */

export interface Frame {
  name: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  data: Uint8ClampedArray;
}

type Hat = 'none' | 'straw' | 'cap' | 'band' | 'feather' | 'knot' | 'tidy';
type Tool = 'none' | 'spear' | 'staff' | 'bow' | 'hoe' | 'scroll' | 'wrench' | 'rifle' | 'clipboard' | 'sapling' | 'briefcase' | 'dartgun' | 'basket';

interface Look {
  hair: string;
  skin?: string;
  top: string;
  topShade: string;
  legs: string;
  feet: string;
  /** Long garment (robe, lab coat) over the legs. */
  robe?: boolean;
  hat: Hat;
  hatColor?: string;
  hatShade?: string;
  tool: Tool;
  /** Arms in sleeves of this colour instead of bare. */
  sleeve?: string;
  tie?: string;
  glasses?: boolean;
}

const LOOKS: Partial<Record<UnitId, Look>> = {
  gatherer: { hair: C.umber, top: C.khaki, topShade: C.dusk, legs: C.apricot, feet: C.dusk, hat: 'none', tool: 'basket' },
  hunter: { hair: C.ink, top: C.rust, topShade: C.blood, legs: C.umber, feet: C.dusk, hat: 'band', hatColor: C.khaki, tool: 'spear' },
  shaman: { hair: C.night, top: C.grape, topShade: C.aubergine, legs: C.grape, feet: C.umber, robe: true, hat: 'feather', tool: 'staff', sleeve: C.grape },
  farmer: { hair: C.umber, top: C.sage, topShade: C.bog, legs: C.umber, feet: C.ink, hat: 'straw', hatColor: C.straw, hatShade: C.tan, tool: 'hoe' },
  archer: { hair: C.ink, top: C.crimson, topShade: C.blood, legs: C.khaki, feet: C.umber, hat: 'band', hatColor: C.red, tool: 'bow', sleeve: C.crimson },
  scholar: { hair: C.ink, top: C.gold, topShade: C.amber, legs: C.gold, feet: C.ink, robe: true, hat: 'knot', tool: 'scroll', sleeve: C.gold },
  worker: { hair: C.umber, top: C.blue, topShade: C.indigo, legs: C.blue, feet: C.ink, hat: 'cap', hatColor: C.navy, hatShade: C.ink, tool: 'wrench' },
  rifleman: { hair: C.umber, top: C.olive, topShade: C.umber, legs: C.khaki, feet: C.umber, hat: 'cap', hatColor: C.moss, hatShade: C.olive, tool: 'rifle', sleeve: C.olive },
  researcher: { hair: C.slate, top: C.white, topShade: C.mist, legs: C.white, feet: C.ink, robe: true, hat: 'tidy', tool: 'clipboard', sleeve: C.white, glasses: true },
  environmentalist: { hair: C.umber, top: C.green, topShade: C.forest, legs: C.khaki, feet: C.umber, hat: 'cap', hatColor: C.forest, hatShade: C.pine, tool: 'sapling' },
  officeWorker: { hair: C.ink, top: C.night, topShade: C.ink, legs: C.night, feet: C.ink, hat: 'tidy', tool: 'briefcase', sleeve: C.night, tie: C.red },
  animalControl: { hair: C.umber, top: C.sky, topShade: C.blue, legs: C.navy, feet: C.ink, hat: 'cap', hatColor: C.blue, hatShade: C.navy, tool: 'dartgun', sleeve: C.sky },
};

export function isDrawnPerson(id: UnitId): boolean {
  return id in LOOKS;
}

const W = 15;
/** Rows above the head are headroom for tall hats (and the walk's one-pixel bob). */
const TOP = 3;
/** The grid ends on the feet row. */
const H = TOP + 14;

/**
 * The body, facing right. H hair, S skin, s skin shade, E eye, T top, t top shade, A arm,
 * B legs, b feet. Legs are drawn per frame.
 */
const HEAD = [
  '.....HHHH......',
  '....HHHHHH.....',
  '...HHHHHHHH....',
  '...HHHSSSSS....',
  '...HHSSSSES....',
  '...HHSSSSSS....',
  '....HsSSSS.....',
];
const BODY = ['.....TTTT......', '....tTTTTA.....', '....tTTTTA.....', '....tTTTT......'];
const LEGS: Record<string, string[]> = {
  stand: ['.....BBBB......', '.....B..B......', '.....b..b......'],
  stride: ['.....BBBB......', '....B....B.....', '...bb....bb....'],
  pass: ['.....BBBB......', '......BB.......', '......bb.......'],
};
const ROBE: Record<string, string[]> = {
  stand: ['....tTTTT......', '....tTTTTT.....', '.....b..b......'],
  stride: ['....tTTTT......', '...tTTTTTT.....', '...bb....bb....'],
  pass: ['....tTTTT......', '....tTTTTT.....', '......bb.......'],
};

type Grid = (string | null)[][];

function put(g: Grid, x: number, y: number, color: string | null): void {
  if (y >= 0 && y < H && x >= 0 && x < W) g[y]![x] = color;
}

function stamp(g: Grid, rows: string[], y0: number, map: Record<string, string>): void {
  rows.forEach((row, dy) => [...row].forEach((ch, x) => ch !== '.' && map[ch] && put(g, x, y0 + dy, map[ch]!)));
}

function hat(g: Grid, look: Look, bob: number): void {
  const c = look.hatColor ?? look.hair;
  const d = look.hatShade ?? C.ink;
  const y = TOP + bob;
  switch (look.hat) {
    case 'straw':
      stamp(g, ['....XXXXX......', '..xXXXXXXXXx...', '.xxxxxxxxxxxx..'], y - 1, { X: c, x: d });
      break;
    case 'cap':
      stamp(g, ['....XXXXX......', '...XXXXXXXX....', '...xxxxxxxxXX..'], y - 1, { X: c, x: d });
      break;
    case 'band':
      stamp(g, ['...XXXXXXXX....'], y + 2, { X: c });
      break;
    case 'feather':
      stamp(g, ['.....R.........', '....RG.........', '....XXXXX......'], y - 2, { R: C.red, G: C.gold, X: C.gold });
      break;
    case 'knot':
      stamp(g, ['......HH.......'], y - 1, { H: look.hair });
      break;
    case 'tidy':
    case 'none':
      break;
  }
}

/** The tool in the leading hand (around column 9–10, rows 9–11). */
function tool(g: Grid, look: Look, bob: number): void {
  const y = TOP + bob;
  const wood = C.umber;
  switch (look.tool) {
    case 'spear':
      for (let r = -1; r <= 12; r++) put(g, 11, y + r, wood);
      put(g, 11, y - 2, C.mist);
      put(g, 11, y - 3, C.white);
      break;
    case 'staff':
      for (let r = 1; r <= 13; r++) put(g, 11, y + r, wood);
      put(g, 11, y, C.gold);
      put(g, 12, y, C.gold);
      put(g, 11, y - 1, C.lemon);
      break;
    case 'bow':
      for (let r = 5; r <= 12; r++) put(g, 10, y + r, C.white);
      for (const [dx, r] of [[11, 5], [12, 6], [12, 7], [12, 8], [12, 9], [12, 10], [12, 11], [11, 12]] as const) put(g, dx, y + r, wood);
      break;
    case 'hoe':
      for (let r = 3; r <= 12; r++) put(g, 11, y + r, wood);
      put(g, 12, y + 3, C.steel);
      put(g, 13, y + 3, C.steel);
      put(g, 13, y + 4, C.steel);
      break;
    case 'scroll':
      put(g, 9, y + 9, C.white);
      put(g, 10, y + 9, C.white);
      put(g, 9, y + 10, C.mist);
      put(g, 10, y + 10, C.tan);
      break;
    case 'wrench':
      put(g, 10, y + 8, C.steel);
      put(g, 11, y + 7, C.steel);
      put(g, 12, y + 7, C.steel);
      put(g, 10, y + 9, C.steel);
      put(g, 10, y + 10, C.steel);
      break;
    case 'rifle':
      for (let x = 7; x <= 13; x++) put(g, x, y + 9, x > 11 ? C.night : wood);
      put(g, 7, y + 10, wood);
      put(g, 8, y + 10, wood);
      break;
    case 'clipboard':
      put(g, 10, y + 8, C.tan);
      put(g, 11, y + 8, C.tan);
      put(g, 10, y + 9, C.white);
      put(g, 11, y + 9, C.white);
      put(g, 10, y + 10, C.white);
      put(g, 11, y + 10, C.tan);
      break;
    case 'sapling':
      put(g, 10, y + 10, C.umber);
      put(g, 10, y + 9, C.forest);
      put(g, 10, y + 8, C.leaf);
      put(g, 11, y + 8, C.leaf);
      put(g, 11, y + 7, C.green);
      put(g, 9, y + 8, C.green);
      break;
    case 'briefcase':
      put(g, 10, y + 10, C.ink);
      put(g, 9, y + 11, C.umber);
      put(g, 10, y + 11, C.umber);
      put(g, 11, y + 11, C.umber);
      put(g, 9, y + 12, C.umber);
      put(g, 10, y + 12, C.rust);
      put(g, 11, y + 12, C.umber);
      break;
    case 'dartgun':
      for (let x = 9; x <= 13; x++) put(g, x, y + 9, x === 13 ? C.red : C.steel);
      put(g, 9, y + 10, C.night);
      break;
    case 'basket':
      put(g, 9, y + 10, C.straw);
      put(g, 10, y + 10, C.tan);
      put(g, 11, y + 10, C.straw);
      put(g, 9, y + 11, C.tan);
      put(g, 10, y + 11, C.straw);
      put(g, 11, y + 11, C.tan);
      put(g, 10, y + 9, C.red);
      break;
    case 'none':
      break;
  }
}

function draw(look: Look, legs: 'stand' | 'stride' | 'pass', bob: number): Grid {
  const g: Grid = Array.from({ length: H }, () => Array<string | null>(W).fill(null));
  const skin = look.skin ?? C.skin;
  const map: Record<string, string> = {
    H: look.hair,
    S: skin,
    s: C.apricot,
    E: C.ink,
    T: look.top,
    t: look.topShade,
    A: look.sleeve ?? skin,
    B: look.legs,
    b: look.feet,
  };
  const y = TOP + bob;
  stamp(g, (look.robe ? ROBE : LEGS)[legs]!, y + 11, map);
  stamp(g, BODY, y + 7, map);
  if (look.tie) {
    put(g, 6, y + 7, C.white);
    put(g, 7, y + 7, C.white);
    put(g, 7, y + 8, look.tie);
    put(g, 7, y + 9, look.tie);
  }
  stamp(g, HEAD, y, map);
  if (look.glasses) {
    put(g, 8, y + 4, C.ink);
    put(g, 9, y + 4, C.steel);
    put(g, 7, y + 4, C.steel);
  }
  hat(g, look, bob);
  tool(g, look, bob);
  return g;
}

function toFrame(name: string, g: Grid): Frame {
  // 1 px border for the outline.
  const w = W + 2;
  const h = H + 2;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = g[y]![x];
      if (!c) continue;
      const [r, gg, b] = rgbOf(c);
      const o = ((y + 1) * w + x + 1) * 4;
      data[o] = r;
      data[o + 1] = gg;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  const src = new Uint8ClampedArray(data);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3]! > 0;
  const [ir, ig, ib] = rgbOf(C.ink);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        const o = (y * w + x) * 4;
        data[o] = ir;
        data[o + 1] = ig;
        data[o + 2] = ib;
        data[o + 3] = 255;
      }
    }
  }
  // The anchor is the bottom edge of the feet (grid row H - 1, plus the border), between the legs.
  return { name, w, h, ax: 8, ay: H + 1, data };
}

/** Walk: stride, pass (body up a pixel), stride, pass. Rest: standing. */
export function personFrames(key: string, id: UnitId): Frame[] {
  const look = LOOKS[id]!;
  return [
    toFrame(`${key}#move0`, draw(look, 'stride', 0)),
    toFrame(`${key}#move1`, draw(look, 'pass', -1)),
    toFrame(`${key}#move2`, draw(look, 'stride', 0)),
    toFrame(`${key}#move3`, draw(look, 'pass', -1)),
    toFrame(`${key}#rest0`, draw(look, 'stand', 0)),
  ];
}
