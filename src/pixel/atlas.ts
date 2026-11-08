import { signal } from '@preact/signals';
import { Assets, Texture, type Spritesheet } from 'pixi.js';

/**
 * The sprite atlas (public/sprites/atlas.png + atlas.json, built by `npm run sprites` from art/).
 * The map renders from its textures; the UI gets single frames as image URLs.
 */
let sheet: Spritesheet | null = null;
let image: HTMLImageElement | null = null;
const urls = new Map<string, string>();

/** Bumped when the atlas has loaded, so UI that shows sprites can render them. */
export const atlasReady = signal(false);

export async function loadAtlas(): Promise<Spritesheet> {
  if (sheet) return sheet;
  sheet = await Assets.load<Spritesheet>(`${import.meta.env.BASE_URL}sprites/atlas.json`);
  sheet.textureSource.scaleMode = 'nearest';
  const res = sheet.textureSource.resource as unknown;
  if (res instanceof HTMLImageElement) image = res;
  else {
    image = new Image();
    image.src = `${import.meta.env.BASE_URL}sprites/atlas.png`;
    await image.decode().catch(() => undefined);
  }
  atlasReady.value = true;
  return sheet;
}

export function tex(key: string): Texture {
  return sheet?.textures[key] ?? Texture.EMPTY;
}

export function hasTex(key: string): boolean {
  return !!sheet?.textures[key];
}

/** One frame as a PNG data URL at a whole-number scale, for <img> in the UI. */
export function frameUrl(key: string, scale = 2): string | null {
  const id = `${key}@${scale}`;
  const hit = urls.get(id);
  if (hit) return hit;
  const t = sheet?.textures[key];
  if (!t || !image) return null;
  const f = t.frame;
  const c = document.createElement('canvas');
  c.width = f.width * scale;
  c.height = f.height * scale;
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  g.drawImage(image, f.x, f.y, f.width, f.height, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/png');
  urls.set(id, url);
  return url;
}
