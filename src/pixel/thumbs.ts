import { spriteForModel } from './specs.ts';

/**
 * UI pictures in the pixel look: a sprite's first frame, cut from the atlas and scaled up by a
 * whole number into a square (shown with image-rendering: pixelated).
 */

interface Atlas {
  image: HTMLImageElement;
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
}

let atlas: Promise<Atlas> | null = null;
const cache = new Map<string, Promise<string>>();

function loadAtlas(): Promise<Atlas> {
  atlas ??= (async () => {
    const base = import.meta.env.BASE_URL;
    const json = (await (await fetch(`${base}sprites/atlas.json`)).json()) as Atlas;
    const image = new Image();
    image.src = `${base}sprites/atlas.png`;
    await image.decode();
    return { image, frames: json.frames };
  })();
  return atlas;
}

export interface ThumbOptions {
  /** Keep only the top part (0–1 of the height): 0.5 frames a person as a bust. */
  crop?: number;
  /** How much of the square the sprite fills. */
  fill?: number;
}

async function render(model: string, opts: ThumbOptions): Promise<string> {
  const key = spriteForModel(model);
  if (!key) throw new Error(`no sprite for ${model}`);
  const a = await loadAtlas();
  const f = (a.frames[`${key}#rest0`] ?? a.frames[`${key}#move0`])?.frame;
  if (!f) throw new Error(`no frame for ${key}`);
  const h = opts.crop && opts.crop < 1 ? Math.max(4, Math.round(f.h * opts.crop)) : f.h;
  const side = Math.max(f.w, h);
  const fill = opts.fill ?? 0.92;
  const k = Math.max(1, Math.floor((96 * fill) / side));
  const size = Math.max(96, side * k);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(a.image, f.x, f.y, f.w, h, Math.round((size - f.w * k) / 2), Math.round((size - h * k) / 2), f.w * k, h * k);
  return c.toDataURL('image/png');
}

export function thumbnail(model: string, opts: ThumbOptions = {}): Promise<string> {
  const id = `${model}|${opts.crop ?? 1}|${opts.fill ?? 0.92}`;
  let p = cache.get(id);
  if (!p) {
    p = render(model, opts);
    cache.set(id, p);
  }
  return p;
}
