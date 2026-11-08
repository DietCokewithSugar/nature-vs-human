import { Texture } from 'pixi.js';
import { C, rgbOf } from './palette.ts';

/**
 * Small pixel textures drawn in code: status icons, the 自然之元 bubble, shadows, glows.
 * All from the palette, all with the same 1 px ink outline as the baked sprites.
 */

export type IconKind = 'meat' | 'graze' | 'meal' | 'rest' | 'pollen' | 'heal' | 'dazed';

const KEY: Record<string, string> = {
  r: C.red, R: C.crimson, w: C.white, g: C.green, G: C.forest, l: C.leaf, k: C.ink, b: C.sky, B: C.blue,
  y: C.gold, o: C.orange, m: C.mint, p: C.lavender, P: C.violet, s: C.mist, t: C.tan,
};

const ICONS: Record<IconKind, string[]> = {
  meat: ['..rrr..', '.rrrrr.', '.rRrrr.', '..rRr..', '...t...', '..ww...', '.w.....'],
  graze: ['.....gg', '...gggg', '..ggglg', '.gglgg.', '.glgG..', '.lG....', 'l......'],
  meal: ['...w...', '..www..', '.wwwww.', '.wwwsw.', 'wwkkkww', 'wwkkkww', '.......'],
  rest: ['BBBBB..', '...B...', '..B....', '.B..bbb', 'BBBBB.b', '....b..', '....bbb'],
  pollen: ['..y.y..', '.yyyyy.', 'yyyoyyy', '.yyyyy.', '..y.y..', '...g...', '...g...'],
  heal: ['..ggg..', '..gwg..', 'ggggggg', 'gwwwwwg', 'ggggggg', '..gwg..', '..ggg..'],
  dazed: ['p.....p', '.P...P.', '..ppp..', '..pyp..', '..ppp..', '.P...P.', 'p.....p'],
};

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Draw rows of palette letters with a 1 px border for the outline. */
function fromRows(rows: string[], outline = true): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const pad = outline ? 1 : 0;
  const [c, g] = canvasOf(w + pad * 2, h + pad * 2);
  const img = g.createImageData(c.width, c.height);
  const set = (x: number, y: number, hex: string) => {
    const [r, gg, b] = rgbOf(hex);
    const o = (y * c.width + x) * 4;
    img.data[o] = r;
    img.data[o + 1] = gg;
    img.data[o + 2] = b;
    img.data[o + 3] = 255;
  };
  rows.forEach((row, y) => [...row].forEach((ch, x) => KEY[ch] && set(x + pad, y + pad, KEY[ch]!)));
  if (outline) addOutline(img);
  g.putImageData(img, 0, 0);
  return c;
}

function addOutline(img: ImageData): void {
  const { width: W, height: H, data } = img;
  const src = new Uint8ClampedArray(data);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3]! > 0;
  const [r, g, b] = rgbOf(C.ink);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        const o = (y * W + x) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
  }
}

function texture(c: HTMLCanvasElement): Texture {
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

let icons: Record<IconKind, Texture> | null = null;
export function iconTextures(): Record<IconKind, Texture> {
  if (!icons) icons = Object.fromEntries(Object.entries(ICONS).map(([k, rows]) => [k, texture(fromRows(rows))])) as Record<IconKind, Texture>;
  return icons;
}

/** The 自然之元 bubble: a lime orb with a bright core and a highlight. */
export function bubbleTexture(): Texture {
  const R = 4.6;
  const n = 10;
  const rows: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - (n - 1) / 2, y - (n - 1) / 2);
      if (d > R) row += '.';
      else if (x === 3 && y === 2) row += 'w';
      else if (d < 1.6) row += 'w';
      else if (d < 3) row += 'l';
      else row += 'g';
    }
    rows.push(row);
  }
  return texture(fromRows(rows));
}

const shadows = new Map<number, Texture>();
/** A flat oval shadow, w px wide. Tinted per side by the caller. */
export function shadowTexture(w: number): Texture {
  const key = Math.max(4, Math.round(w / 2) * 2);
  let t = shadows.get(key);
  if (!t) {
    const h = Math.max(2, Math.round(key / 3));
    const [c, g] = canvasOf(key, h);
    g.fillStyle = '#ffffff';
    for (let y = 0; y < h; y++) {
      const fy = (y + 0.5) / h - 0.5;
      const half = Math.sqrt(Math.max(0, 0.25 - fy * fy)) * key;
      const x0 = Math.round(key / 2 - half);
      g.fillRect(x0, y, key - x0 * 2, 1);
    }
    t = texture(c);
    shadows.set(key, t);
  }
  return t;
}

let glow: Texture | null = null;
/** A soft round light (the one non-pixel texture: lamps and fire at night). */
export function glowTexture(): Texture {
  if (!glow) {
    const [c, g] = canvasOf(64, 64);
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glow = Texture.from(c);
  }
  return glow;
}

/** A filled pixel disc for puffs of smoke and dust. */
const discs = new Map<number, Texture>();
export function discTexture(d: number): Texture {
  let t = discs.get(d);
  if (!t) {
    const [c, g] = canvasOf(d, d);
    g.fillStyle = '#ffffff';
    const r = d / 2;
    for (let y = 0; y < d; y++) {
      const half = Math.sqrt(Math.max(0, r * r - (y + 0.5 - r) ** 2));
      const x0 = Math.round(r - half);
      g.fillRect(x0, y, d - x0 * 2, 1);
    }
    t = texture(c);
    discs.set(d, t);
  }
  return t;
}

/** The lab's research gem. */
export function gemTexture(): Texture {
  return texture(fromRows(['...w...', '..wsw..', '.wsssw.', 'wsssssw', '.wsssw.', '..wsw..', '...w...']));
}
