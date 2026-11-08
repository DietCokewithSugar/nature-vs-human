/**
 * Sprite bake (dev only, driven by scripts/bake-sprites.mjs).
 *
 * Renders every model the game uses through one fixed orthographic camera, supersampled,
 * then downsamples, snaps to the Resurrect 64 palette and draws a 1 px ink outline.
 * Because every sprite goes through the same camera, light, palette and outline,
 * sprites baked today and sprites baked from new models later match by construction.
 */
import {
  AnimationMixer,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderTarget,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { findClip, instantiate } from '../scene/assets.ts';
import { HumanRig } from '../scene/humanRig.ts';
import { C, rgbOf, snapToPalette } from '../pixel/palette.ts';
import { allSpecs, type SpriteSpec } from '../pixel/specs.ts';
import type { UnitId } from '../core/index.ts';
import { isDrawnPerson, personFrames, type Frame } from './people.ts';

const SS = 4;
const OUTLINE = rgbOf(C.ink);


const renderer = new WebGLRenderer({ antialias: false, alpha: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NoToneMapping;
renderer.setClearColor(0x000000, 0);

const scene = new Scene();
// Only the light pass is lit (white material); values land in 0…1 and are cut into three bands.
scene.add(new HemisphereLight('#ffffff', '#666666', 0.5));
const sun = new DirectionalLight('#ffffff', 0.7);
// Light from the upper left and a little in front: tops brightest, fronts mid, right sides in shade.
sun.position.set(-4, 8, 5);
scene.add(sun, sun.target);

function prepareMaterials(root: Object3D, spec: SpriteSpec): void {
  const tint = spec.tint ? new Color(spec.tint) : null;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const next = mats.map((mat) => {
      const c = (mat as MeshStandardMaterial).clone();
      if ('roughness' in c) c.roughness = 1;
      if ('metalness' in c) c.metalness = 0;
      if (tint && c.color) c.color.lerp(tint, spec.tintAmount ?? 0.4);
      if (c.emissive && c.emissive.getHex() !== 0) c.emissiveIntensity = Math.min(c.emissiveIntensity, 0.8);
      c.transparent = false;
      c.opacity = 1;
      return c;
    });
    m.material = Array.isArray(m.material) ? next : next[0]!;
  });
}

/** Poses for each animation: a function that sets the model up for frame i. */
async function load(spec: SpriteSpec): Promise<{ root: Group; anims: Record<string, (() => void)[]> }> {
  const prep = await instantiate(spec.model, 1, spec.by);
  prepareMaterials(prep.object, spec);
  const root = new Group();
  prep.object.rotation.y = spec.yaw;
  root.add(prep.object);
  const anims: Record<string, (() => void)[]> = {};
  const still = [() => {}];

  if (spec.anim === 'rig') {
    const rig = new HumanRig(prep.model);
    // Bigger heads: at 17 px a true-to-life head is three pixels and the figure reads as a blob.
    prep.model.traverse((o) => {
      if (o.name === 'Head') o.scale.setScalar(1.6);
    });
    const set = (phase: number, speed: number) => () => {
      (rig as unknown as { phase: number }).phase = phase;
      rig.update(0, speed);
    };
    anims.move = [0, 1, 2, 3].map((i) => set((i * Math.PI) / 2, 1));
    anims.rest = [set(0, 0)];
    return { root, anims };
  }

  const wings: Object3D[] = [];
  prep.object.traverse((o) => {
    if (o.name === 'wingL' || o.name === 'wingR') wings.push(o);
  });
  const flap = (f: number) => {
    for (const w of wings) w.rotation.z = w.name === 'wingL' ? -f : f;
  };

  if (prep.clips.length) {
    const mixer = new AnimationMixer(prep.model);
    const move = findClip(prep.clips, ...(spec.move ?? ['Walk']), 'Walk', 'Swim', 'Fly');
    const rest = findClip(prep.clips, ...(spec.rest ?? ['Idle']), 'Idle');
    const at = (clip: typeof move, t: number, f = 0) => () => {
      mixer.stopAllAction();
      if (clip) {
        const a = mixer.clipAction(clip);
        a.reset().play();
        mixer.setTime(t * clip.duration);
      }
      flap(f);
    };
    anims.move = [0, 1, 2, 3].map((i) => at(move, i / 4, [0.9, 0, -0.9, 0][i]));
    anims.rest = rest && rest !== move ? [at(rest, 0), at(rest, 0.5)] : [at(move, 0)];
    return { root, anims };
  }
  if (wings.length) {
    anims.move = [0.9, 0, -0.9, 0].map((f) => () => flap(f));
    anims.rest = anims.move;
    return { root, anims };
  }
  anims.move = still;
  return { root, anims };
}

/** Materials for the two passes: flat albedo (unlit) and plain white (lit), swapped per render. */
interface PassMats {
  albedo: Map<Mesh, MeshBasicMaterial | MeshBasicMaterial[]>;
  light: Map<Mesh, MeshLambertMaterial | MeshLambertMaterial[]>;
}

function passMaterials(root: Object3D): PassMats {
  const albedo = new Map<Mesh, MeshBasicMaterial | MeshBasicMaterial[]>();
  const light = new Map<Mesh, MeshLambertMaterial | MeshLambertMaterial[]>();
  const white = new MeshLambertMaterial({ color: '#ffffff' });
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const toBasic = (mat: MeshStandardMaterial) => {
      const b = new MeshBasicMaterial({ color: mat.color, map: mat.map, vertexColors: mat.vertexColors, side: mat.side });
      // Glowing parts (lava, lamps) keep their glow colour.
      if (mat.emissive && mat.emissive.getHex() !== 0 && mat.emissiveIntensity > 0.2) b.color = mat.emissive.clone();
      return b;
    };
    albedo.set(m, Array.isArray(m.material) ? m.material.map((x) => toBasic(x as MeshStandardMaterial)) : toBasic(m.material as MeshStandardMaterial));
    light.set(m, Array.isArray(m.material) ? m.material.map(() => white) : white);
  });
  return { albedo, light };
}

function renderPass(root: Group, cam: OrthographicCamera, W: number, H: number): Uint8Array {
  const rt = new WebGLRenderTarget(W * SS, H * SS);
  rt.texture.colorSpace = SRGBColorSpace;
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(scene, cam);
  const big = new Uint8Array(W * SS * H * SS * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W * SS, H * SS, big);
  renderer.setRenderTarget(null);
  rt.dispose();
  void root;
  return big;
}

/** Average an SS×SS block (alpha-weighted). Returns [r, g, b, coverage]. */
function block(big: Uint8Array, W: number, H: number, x: number, y: number): [number, number, number, number] {
  const BW = W * SS;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let sy = 0; sy < SS; sy++) {
    // Render targets read bottom-up.
    const row = (H * SS - 1 - (y * SS + sy)) * BW;
    for (let sx = 0; sx < SS; sx++) {
      const p = (row + x * SS + sx) * 4;
      const al = big[p + 3]! / 255;
      r += big[p]! * al;
      g += big[p + 1]! * al;
      b += big[p + 2]! * al;
      a += al;
    }
  }
  return a > 0 ? [r / a, g / a, b / a, a / (SS * SS)] : [0, 0, 0, 0];
}

/** Light bands: highlight, mid, shadow. Shadows lean cool, highlights warm (the usual pixel-art ramp). */
function shade(l: number): [number, number, number] {
  if (l > 0.82) return [1.14, 1.1, 1.02];
  if (l > 0.5) return [0.92, 0.92, 0.92];
  return [0.66, 0.66, 0.78];
}

/** Render the current pose into a px-scale RGBA buffer with the anchor at (ox, oy). */
function renderPose(root: Group, mats: PassMats, spec: SpriteSpec, W: number, H: number, ox: number, oy: number): Uint8ClampedArray {
  const el = MathUtils.degToRad(spec.elevation);
  // One world unit (the model is normalised to 1 on its measured side) = spec.px pixels.
  const ppu = spec.px;
  const cam = new OrthographicCamera(-ox / ppu, (W - ox) / ppu, oy / ppu, -(H - oy) / ppu, -50, 50);
  cam.position.set(0, Math.sin(el) * 10, Math.cos(el) * 10);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  scene.add(root);
  root.updateMatrixWorld(true);
  for (const [m, mat] of mats.albedo) m.material = mat;
  const albedo = renderPass(root, cam, W, H);
  for (const [m, mat] of mats.light) m.material = mat;
  const light = renderPass(root, cam, W, H);
  scene.remove(root);

  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b, cover] = block(albedo, W, H, x, y);
      // A pixel is solid if enough of it is covered: thin legs survive, fuzz does not.
      if (cover < 0.38) continue;
      const [lr, lg, lb] = block(light, W, H, x, y);
      const k = shade((lr + lg + lb) / 3 / 255);
      const o = (y * W + x) * 4;
      out[o] = r * k[0];
      out[o + 1] = g * k[1];
      out[o + 2] = b * k[2];
      out[o + 3] = 255;
    }
  }
  boost(out);
  snapToPalette(out);
  return cleanup(out, W, H);
}

/** Lone pixels unlike all their neighbours become the colour most neighbours share: no speckle. */
function cleanup(src: Uint8ClampedArray, W: number, H: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const key = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    const p = (y * W + x) * 4;
    return src[p + 3] ? (src[p]! << 16) | (src[p + 1]! << 8) | src[p + 2]! : -1;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const me = key(x, y);
      if (me < 0) continue;
      const counts = new Map<number, number>();
      let same = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const k = key(x + dx, y + dy);
        if (k === me) same++;
        if (k >= 0) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      if (same > 0) continue;
      let best = -1;
      let bestN = 0;
      for (const [k, n] of counts) {
        if (n > bestN) {
          best = k;
          bestN = n;
        }
      }
      if (best >= 0 && bestN >= 3) {
        const p = (y * W + x) * 4;
        out[p] = (best >> 16) & 255;
        out[p + 1] = (best >> 8) & 255;
        out[p + 2] = best & 255;
      }
    }
  }
  return out;
}

/** A touch more saturation before snapping, so midtones do not all land on greys. */
function boost(data: Uint8ClampedArray): void {
  const c = new Color();
  const hsl = { h: 0, s: 0, l: 0 };
  for (let p = 0; p < data.length; p += 4) {
    if (!data[p + 3]) continue;
    c.setRGB(Math.min(1, data[p]! / 255), Math.min(1, data[p + 1]! / 255), Math.min(1, data[p + 2]! / 255), SRGBColorSpace);
    c.getHSL(hsl, SRGBColorSpace);
    c.setHSL(hsl.h, Math.min(1, hsl.s * 1.35), hsl.l, SRGBColorSpace);
    const rgb = c.getStyle(SRGBColorSpace).match(/\d+/g)!.map(Number);
    data[p] = rgb[0]!;
    data[p + 1] = rgb[1]!;
    data[p + 2] = rgb[2]!;
  }
}

/** 1 px ink outline around the silhouette (4-neighbourhood). */
function outline(src: Uint8ClampedArray, W: number, H: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3]! > 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        const o = (y * W + x) * 4;
        out[o] = OUTLINE[0];
        out[o + 1] = OUTLINE[1];
        out[o + 2] = OUTLINE[2];
        out[o + 3] = 255;
      }
    }
  }
  return out;
}

async function bakeSpec(spec: SpriteSpec): Promise<Frame[]> {
  const frames = await bakeAt(spec);
  // Tall buildings are shrunk to the height cap, so a skyscraper does not cover half the screen.
  const h = frames[0]!.h;
  if (spec.maxH && h > spec.maxH) return bakeAt({ ...spec, px: Math.max(6, Math.floor((spec.px * spec.maxH) / h)) });
  return frames;
}

async function bakeAt(spec: SpriteSpec): Promise<Frame[]> {
  const { root, anims } = await load(spec);
  const mats = passMaterials(root);
  // A generous canvas: wide enough for the measured side, tall enough for towers.
  const W = Math.ceil(spec.px * 2.2) + 8;
  const H = Math.ceil(spec.px * 4) + 8;
  const ox = Math.floor(W / 2);
  const oy = H - Math.ceil(spec.px * 0.7) - 4;
  const raw: { name: string; data: Uint8ClampedArray }[] = [];
  for (const [anim, poses] of Object.entries(anims)) {
    poses.forEach((pose, i) => {
      pose();
      raw.push({ name: `${spec.key}#${anim}${i}`, data: outline(renderPose(root, mats, spec, W, H, ox, oy), W, H) });
    });
  }
  // Crop every frame of a sprite to the same box, so the anchor stays put while it animates.
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (const f of raw) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!f.data[(y * W + x) * 4 + 3]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) {
    console.warn('empty sprite', spec.key);
    x0 = y0 = 0;
    x1 = y1 = 0;
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  return raw.map((f) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) data.set(f.data.subarray(((y + y0) * W + x0) * 4, ((y + y0) * W + x0 + w) * 4), y * w * 4);
    return { name: f.name, w, h, ax: ox - x0, ay: oy - y0, data };
  });
}

/** Shelf-pack frames into one atlas. */
function pack(frames: Frame[], width = 1024): { canvas: HTMLCanvasElement; json: unknown } {
  const PAD = 1;
  const order = [...frames].sort((a, b) => b.h - a.h || b.w - a.w);
  const pos = new Map<Frame, { x: number; y: number }>();
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const f of order) {
    if (x + f.w > width) {
      x = 0;
      y += shelf + PAD;
      shelf = 0;
    }
    pos.set(f, { x, y });
    x += f.w + PAD;
    shelf = Math.max(shelf, f.h);
  }
  const height = 2 ** Math.ceil(Math.log2(y + shelf + 1));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  const framesJson: Record<string, unknown> = {};
  const animations: Record<string, string[]> = {};
  for (const f of frames) {
    const p = pos.get(f)!;
    g.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.w, f.h), p.x, p.y);
    framesJson[f.name] = {
      frame: { x: p.x, y: p.y, w: f.w, h: f.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
      sourceSize: { w: f.w, h: f.h },
      anchor: { x: f.ax / f.w, y: f.ay / f.h },
    };
    const anim = f.name.replace(/\d+$/, '');
    (animations[anim] ??= []).push(f.name);
  }
  return {
    canvas,
    json: {
      frames: framesJson,
      animations,
      meta: { app: 'human-bill sprite bake', image: 'atlas.png', format: 'RGBA8888', size: { w: width, h: height }, scale: '1' },
    },
  };
}

declare global {
  interface Window {
    __bake?: { png: string; json: unknown; log: string[] } | { error: string };
    __bakeOverrides?: string[];
  }
}

// ── Art overrides ──────────────────────────────────────────────
// Hand-drawn, AI-made or downloaded sprites in art/sprites/<key>/<anim><n>.png replace what the
// bake would make for that key. They go through the same palette snap and outline, so they match.

async function loadPixels(url: string): Promise<{ w: number; h: number; data: Uint8ClampedArray }> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, data: g.getImageData(0, 0, img.width, img.height).data };
}

/** Does the art already have a dark outline? (Most edge pixels dark.) */
function hasOutline(data: Uint8ClampedArray, W: number, H: number): boolean {
  let edge = 0;
  let dark = 0;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3]! > 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!solid(x, y)) continue;
      if (solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1)) continue;
      edge++;
      const o = (y * W + x) * 4;
      if (data[o]! * 0.3 + data[o + 1]! * 0.59 + data[o + 2]! * 0.11 < 70) dark++;
    }
  }
  return edge > 0 && dark / edge > 0.7;
}

async function overrideFrames(key: string, files: string[]): Promise<Frame[]> {
  const raw: { name: string; w: number; h: number; data: Uint8ClampedArray }[] = [];
  for (const f of files.sort()) {
    const stem = f.slice(f.lastIndexOf('/') + 1).replace(/\.png$/i, '');
    const px = await loadPixels(`/${f}`);
    // Pad by one pixel for the outline.
    const W = px.w + 2;
    const H = px.h + 2;
    let data: Uint8ClampedArray = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < px.h; y++) data.set(px.data.subarray(y * px.w * 4, (y + 1) * px.w * 4), ((y + 1) * W + 1) * 4);
    snapToPalette(data);
    if (!hasOutline(data, W, H)) data = outline(data, W, H);
    raw.push({ name: `${key}#${stem}`, w: W, h: H, data });
  }
  // Same box for every frame; anchor at the bottom centre (feet on the ground).
  const W = Math.max(...raw.map((r) => r.w));
  const H = Math.max(...raw.map((r) => r.h));
  return raw.map((r) => {
    const data = new Uint8ClampedArray(W * H * 4);
    const ox = Math.floor((W - r.w) / 2);
    const oy = H - r.h;
    for (let y = 0; y < r.h; y++) data.set(r.data.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((y + oy) * W + ox) * 4);
    return { name: r.name, w: W, h: H, ax: Math.floor(W / 2), ay: H - 1, data };
  });
}

async function main(): Promise<void> {
  const log: string[] = [];
  const only = new URLSearchParams(location.search).get('only')?.split(',');
  const frames: Frame[] = [];
  const overrides = new Map<string, string[]>();
  for (const f of window.__bakeOverrides ?? []) {
    const key = f.slice('art/sprites/'.length, f.lastIndexOf('/'));
    overrides.set(key, [...(overrides.get(key) ?? []), f]);
  }
  for (const [key, files] of overrides) {
    if (only && !only.some((o) => key.startsWith(o))) continue;
    try {
      const fs = await overrideFrames(key, files);
      frames.push(...fs);
      log.push(`${key}: ${fs.length} frames ${fs[0]!.w}x${fs[0]!.h} (art/sprites)`);
    } catch (err) {
      log.push(`${key}: FAILED override ${String(err)}`);
    }
  }
  for (const spec of allSpecs()) {
    if (only && !only.some((o) => spec.key.startsWith(o))) continue;
    if (overrides.has(spec.key)) continue;
    try {
      const id = spec.key.slice('unit/'.length) as UnitId;
      const fs = spec.key.startsWith('unit/') && isDrawnPerson(id) ? personFrames(spec.key, id) : await bakeSpec(spec);
      frames.push(...fs);
      log.push(`${spec.key}: ${fs.length} frames ${fs[0]!.w}x${fs[0]!.h}`);
    } catch (err) {
      log.push(`${spec.key}: FAILED ${String(err)}`);
    }
  }
  const { canvas, json } = pack(frames);
  document.body.append(canvas);
  canvas.style.imageRendering = 'pixelated';
  canvas.style.width = `${canvas.width * 2}px`;
  window.__bake = { png: canvas.toDataURL('image/png'), json, log };
}

main().catch((err) => {
  window.__bake = { error: String(err?.stack ?? err) };
});
