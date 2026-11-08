import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { DISASTERS, MAP_HALF, VOLCANOES, ZONES, type DisasterId, type DisasterState } from '../core/index.ts';
import { discTexture } from './marks.ts';
import { C, numOf } from './palette.ts';
import { PX_PER_UNIT } from './specs.ts';

const px = (v: number) => (v + MAP_HALF) * PX_PER_UNIT;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smoothstep = (x: number, a: number, b: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

interface Particle {
  s: Sprite;
  x: number;
  y: number;
  /** Height above the ground point, px (drawn upwards). */
  h: number;
  vx: number;
  vy: number;
  vh: number;
  g: number;
  life: number;
  age: number;
  grow: number;
  size: number;
  fade: boolean;
}

interface Ring {
  g: Graphics;
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  color: number;
}

/**
 * Pixel particles: square debris that arcs and lands, round puffs of dust and smoke that rise and
 * fade, and expanding dotted rings. Positions are in map px; everything snaps to whole pixels.
 */
export class Particles {
  readonly layer = new Container();
  private pool: Particle[] = [];
  private live: Particle[] = [];
  private rings: Ring[] = [];

  private take(tex: Texture): Particle {
    const p =
      this.pool.pop() ??
      ({ s: new Sprite(tex), x: 0, y: 0, h: 0, vx: 0, vy: 0, vh: 0, g: 0, life: 1, age: 0, grow: 0, size: 1, fade: false } satisfies Particle);
    p.s.texture = tex;
    p.s.anchor.set(0.5);
    p.s.alpha = 1;
    p.s.visible = true;
    p.age = 0;
    this.layer.addChild(p.s);
    this.live.push(p);
    return p;
  }

  /** Bits flying out and falling back (hits, collapses, lava bombs). */
  burst(x: number, y: number, h: number, n: number, speed: number, colors: readonly string[] = [C.khaki, C.dusk, C.slate]): void {
    for (let i = 0; i < n; i++) {
      const p = this.take(Texture.WHITE);
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * speed * 14;
      Object.assign(p, { x, y, h, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, vh: (0.6 + Math.random()) * speed * 22, g: 70, life: 0.6 + Math.random() * 0.4, grow: 0, fade: false });
      p.size = Math.random() < 0.3 ? 2 : 1;
      p.s.tint = numOf(colors[Math.floor(Math.random() * colors.length)]!);
    }
  }

  /** A soft rising puff (dust, smoke, ash, foam). */
  puff(x: number, y: number, h: number, size: number, color: string, rise = 8, life = 1): void {
    const p = this.take(discTexture(Math.max(2, Math.round(size))));
    Object.assign(p, { x, y, h, vx: (Math.random() - 0.5) * 3, vy: 0, vh: rise, g: 0, life: life * (0.8 + Math.random() * 0.4), grow: 0.6, fade: true });
    p.size = 1;
    p.s.tint = numOf(color);
  }

  dust(x: number, y: number, r: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r;
      this.puff(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, 1, 3 + Math.random() * 3, C.khaki, 4, 0.9);
    }
  }

  ring(x: number, y: number, r: number, color: string, life = 0.6): void {
    const g = new Graphics();
    this.layer.addChild(g);
    this.rings.push({ g, x, y, r, age: 0, life, color: numOf(color) });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        p.s.visible = false;
        p.s.removeFromParent();
        this.live.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vh -= p.g * dt;
      p.h += p.vh * dt;
      if (p.h < 0 && p.g > 0) {
        p.h = 0;
        p.vh = 0;
        p.vx *= 0.5;
        p.vy *= 0.5;
      }
      const k = p.age / p.life;
      p.s.position.set(Math.round(p.x), Math.round(p.y - p.h));
      if (p.fade) {
        p.s.alpha = 0.85 * (1 - k);
        p.s.scale.set(1 + k * p.grow);
      } else {
        p.s.width = p.size;
        p.s.height = p.size;
        p.s.alpha = k > 0.75 ? (1 - k) * 4 : 1;
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.g.destroy();
        this.rings.splice(i, 1);
        continue;
      }
      dottedCircle(r.g.clear(), Math.round(r.x), Math.round(r.y), r.r * (0.3 + 0.7 * smoothstep(k, 0, 1)), r.color, 1 - k, 2);
    }
  }
}

/** A circle of single pixels every `step` px: rings stay crisp at any zoom. */
export function dottedCircle(g: Graphics, cx: number, cy: number, r: number, color: number, alpha: number, step = 3): Graphics {
  const n = Math.max(8, Math.round((Math.PI * 2 * r) / step));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.rect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
  return g.fill({ color, alpha });
}

/**
 * What a disaster looks like: a pulsing dotted outline round the zone while it is coming,
 * then the wave, the funnel or the eruption.
 */
export class DisasterFx {
  readonly layer = new Container();
  private outline = new Graphics();
  private wave = new Graphics();
  private funnel = new Graphics();
  private current: DisasterState | null = null;
  private phase: string | null = null;
  private t = 0;
  private clock = 0;
  private path: { x: number; y: number }[] = [];
  private fx: Particles;
  private shakeAmount = 0;
  /** 0 … 1: how far the sea has come in (the scene floods coastal cells). */
  surge = 0;
  /** The eruption's strength, for the volcano glow. */
  erupt = 0;
  onShakeArea: (x: number, y: number, r: number) => void = () => {};

  constructor(fx: Particles) {
    this.fx = fx;
    this.layer.addChild(this.outline, this.wave, this.funnel);
  }

  shake(): number {
    return this.shakeAmount;
  }

  sync(d: DisasterState | null): void {
    if (!d) {
      this.current = null;
      this.phase = null;
      this.outline.clear();
      this.wave.clear();
      this.funnel.clear();
      return;
    }
    if (!this.current || this.current.id !== d.id || this.phase !== d.phase) {
      this.t = 0;
      this.phase = d.phase;
      if (d.phase === 'active') this.strike(d.id);
    }
    this.current = d;
  }

  private strike(id: DisasterId): void {
    if (id === 'tornado') {
      const z = ZONES.plains;
      const pts = [0.3, 0.55, 0.8].map((f, i) => ({ x: px(z.x - z.r + f * z.r * 2), y: px(z.z + (i % 2 ? -1 : 1) * z.r * 0.35 * Math.random()) }));
      this.path = [{ x: px(z.x - z.r), y: px(z.z + 6) }, ...pts, { x: px(z.x + z.r), y: px(z.z - 4) }];
    }
    if (id === 'volcano') {
      const v = VOLCANOES[0]!;
      this.fx.burst(px(v.x), px(v.z), 30, 40, 2.2, [C.orange, C.gold, C.red, C.night]);
      this.onShakeArea(px(v.x), px(v.z), (ZONES.volcano.r + 8) * PX_PER_UNIT);
    }
  }

  update(dt: number): void {
    this.clock += dt;
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 3);
    const d = this.current;
    this.surge = Math.max(0, this.surge - dt * 0.3);
    this.erupt = Math.max(0, this.erupt - dt * 0.5);
    this.outline.clear();
    this.wave.clear();
    this.funnel.clear();
    if (!d) return;
    this.t += dt;
    const def = DISASTERS[d.id];
    const zone = ZONES[def.zone];
    if (d.phase === 'warning') {
      dottedCircle(this.outline, px(zone.x), px(zone.z), zone.r * PX_PER_UNIT, numOf(C.red), 0.5 + Math.sin(this.clock * 6) * 0.4, 3);
      if (d.id === 'volcano') {
        this.shakeAmount = Math.max(this.shakeAmount, 0.6);
        this.erupt = Math.max(this.erupt, 0.4 + Math.sin(this.clock * 8) * 0.2);
        const v = VOLCANOES[0]!;
        if (Math.random() < dt * 5) this.fx.puff(px(v.x), px(v.z), 28, 5, C.slate, 10, 2.5);
      }
      if (d.id === 'tornado' && Math.random() < dt * 6) {
        this.fx.puff(px(zone.x + (Math.random() - 0.5) * zone.r * 1.4), px(zone.z + (Math.random() - 0.5) * zone.r), 40, 9, C.slate, 1, 3);
      }
      return;
    }
    const k = clamp(this.t / def.duration, 0, 1);
    if (d.id === 'tsunami') this.tsunami(k, dt);
    if (d.id === 'tornado') this.tornado(k, dt);
    if (d.id === 'volcano') this.volcano(k, dt);
  }

  private tsunami(k: number, dt: number): void {
    const inK = smoothstep(k, 0, 0.3);
    const outK = smoothstep(k, 0.7, 1);
    this.surge = Math.max(this.surge, inK * (1 - outK));
    this.shakeAmount = Math.max(this.shakeAmount, 0.4 * (1 - outK));
    // The wave: a foam-crested band rolling north-east across the bay.
    if (k < 0.5) {
      const bay = ZONES.coast;
      const f = smoothstep(k, 0, 0.45);
      const cx = px(bay.x - 22 + 28 * f);
      const cy = px(bay.z + 18 - 24 * f);
      const len = 46 * PX_PER_UNIT * 0.5;
      const g = this.wave;
      for (let i = -len; i <= len; i += 1) {
        const x = Math.round(cx + i * 0.7071);
        const y = Math.round(cy + i * 0.7071);
        const wob = Math.round(Math.sin(i * 0.4 + this.clock * 8) * 1.5);
        g.rect(x - 2 + wob, y + 2, 2, 3).fill({ color: numOf(C.blue) });
        g.rect(x + wob, y, 2, 3).fill({ color: numOf(C.sky) });
        g.rect(x + 2 + wob, y - 2, 2, 2).fill({ color: numOf(C.white) });
      }
      if (Math.random() < dt * 10) this.fx.puff(cx + (Math.random() - 0.5) * len, cy + (Math.random() - 0.5) * len, 4, 4, C.white, 4, 1);
    }
    if (k > 0.25 && k < 0.5 && Math.random() < dt * 2) {
      const bay = ZONES.coast;
      this.onShakeArea(px(bay.x + Math.random() * 20), px(bay.z - Math.random() * 10), 14 * PX_PER_UNIT);
    }
  }

  private tornado(k: number, dt: number): void {
    const path = this.path;
    if (path.length < 2) return;
    const f = k * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(f));
    const u = smoothstep(f - i, 0, 1);
    const x = path[i]!.x + (path[i + 1]!.x - path[i]!.x) * u;
    const y = path[i]!.y + (path[i + 1]!.y - path[i]!.y) * u;
    const grow = Math.min(1, Math.min(k, 1 - k) * 8);
    if (grow < 0.05) return;
    // A funnel of wobbling rows, widest at the top.
    const g = this.funnel;
    const H = Math.round(44 * grow);
    for (let r = 0; r < H; r++) {
      const w = Math.round((2 + (r / H) ** 1.4 * 20) * grow);
      const off = Math.round(Math.sin(r * 0.35 - this.clock * 10) * (1 + r * 0.08));
      const color = (r + Math.floor(this.clock * 12)) % 5 === 0 ? C.mist : r % 2 ? C.steel : C.lilacGrey;
      g.rect(Math.round(x) - w + off, Math.round(y) - r, w * 2, 1).fill({ color: numOf(color), alpha: 0.85 });
    }
    if (Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2;
      this.fx.burst(x + Math.cos(a) * 8, y + Math.sin(a) * 4, 4 + Math.random() * 20, 2, 0.6);
    }
    if (Math.random() < dt * 3) this.onShakeArea(x, y, 8 * PX_PER_UNIT);
  }

  private volcano(k: number, dt: number): void {
    const v = VOLCANOES[0]!;
    const fading = 1 - smoothstep(k, 0.6, 1);
    this.erupt = Math.max(this.erupt, fading);
    this.shakeAmount = Math.max(this.shakeAmount, 1.2 * fading);
    const tx = px(v.x);
    const ty = px(v.z);
    if (Math.random() < dt * 10 * fading) this.fx.puff(tx + (Math.random() - 0.5) * 6, ty, 32, 6, C.slate, 12, 3);
    if (Math.random() < dt * 6 * fading) this.fx.burst(tx, ty, 30, 5, 1.5, [C.orange, C.gold, C.red]);
    if (Math.random() < dt * 2.5 * fading) {
      const z = ZONES.volcano;
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * z.r;
      const x = px(v.x + Math.cos(a) * r);
      const y = px(v.z + Math.sin(a) * r);
      this.fx.burst(x, y, 2, 8, 0.8, [C.orange, C.gold, C.red]);
      this.fx.puff(x, y, 2, 5, C.slate, 4, 1.6);
      this.fx.ring(x, y, 16, C.orange);
      this.onShakeArea(x, y, 6 * PX_PER_UNIT);
    }
  }
}
