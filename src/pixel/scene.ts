import { Application, Assets, Container, Graphics, Sprite, Text, Texture, TextureSource } from 'pixi.js';
import {
  FIELD_X0,
  LANE_HALF,
  LANE_Y,
  MAP_H,
  MAP_W,
  PADS,
  SEGMENTS,
  SEG_W,
  SPRINGS,
  UNITS,
  buildingOnPad,
  padUser,
  type Building,
  type CoreEvent,
  type Game,
  type Unit,
  type UnitId,
} from '../core/index.ts';
import { loadAtlas, tex } from './atlas.ts';
import { C, numOf } from './palette.ts';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** What a tap on the map hit. */
export type MapTarget = { type: 'pad'; pad: number } | { type: 'building'; id: number } | { type: 'unit'; id: number } | { type: 'none' };

const TEAM = {
  nature: { bar: numOf(C.mint), dark: numOf(C.teal) },
  human: { bar: numOf(C.vermilion), dark: numOf(C.blood) },
};
const RING_SIZES = [8, 12, 16, 20, 26, 34];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

interface UnitView {
  id: number;
  kind: UnitId;
  root: Container;
  body: Sprite;
  ring: Sprite;
  bar: Graphics;
  hunger: Sprite;
  walk: Texture[];
  attack: Texture[];
  x: number;
  y: number;
  travel: number;
  seen: boolean;
}

interface BuildingView {
  id: number;
  root: Container;
  body: Sprite;
  plate: Sprite;
  scaffold: Sprite | null;
  bar: Graphics;
  flames: Sprite[];
  blocked: Sprite;
  shake: number;
  lastHp: number;
  seen: boolean;
}

interface Fx {
  sprite: Sprite;
  frames: Texture[];
  t: number;
  dur: number;
  vx: number;
  vy: number;
  fade: boolean;
}

interface Float {
  text: Text;
  x: number;
  y: number;
  t: number;
}

/**
 * The battlefield in PixiJS: one baked background, the territory overlays, the build pads,
 * buildings and units sorted by depth, projectiles and effects. It only reads the game state
 * and reports taps; it never changes the game.
 */
export class Scene {
  private app = new Application();
  private canvas: HTMLCanvasElement;
  private ready = false;
  private game: Game | null = null;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  private world = new Container();
  private ground = new Container();
  private terrain: Sprite[][][] = [];
  private padLayer = new Container();
  private padViews: { sprite: Sprite; mark: Graphics }[] = [];
  private rings = new Container();
  private objects = new Container();
  private shots = new Container();
  private fxLayer = new Container();
  private bars = new Container();
  private screen = new Container();
  private selectG = new Graphics();

  private units = new Map<number, UnitView>();
  private buildings = new Map<number, BuildingView>();
  private projSprites: Sprite[] = [];
  private fx: Fx[] = [];
  private floats: Float[] = [];
  private steamT = 0;
  private clock = 0;

  /** Zoom in device px per map px, and the pan offset in map px. */
  private zoom = 2;
  private userZoom = 0;
  private panX = 0;
  private panY = 0;
  private buildable = new Set<number>();
  private highlightPads = false;
  private selected: number | null = null;
  private selectedPad: number | null = null;

  onTap: (t: MapTarget) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    void this.init();
  }

  private get res(): number {
    return Math.min(window.devicePixelRatio || 1, 3);
  }

  private async init(): Promise<void> {
    TextureSource.defaultOptions.scaleMode = 'nearest';
    await this.app.init({
      canvas: this.canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: this.res,
      autoDensity: true,
      antialias: false,
      roundPixels: true,
      background: C.pine,
      preference: 'webgl',
    });
    await loadAtlas();
    const mapTex = await Assets.load<Texture>(`${import.meta.env.BASE_URL}sprites/map.png`);
    mapTex.source.scaleMode = 'nearest';
    this.ground.addChild(new Sprite(mapTex));
    // Territory overlays, one per side per stretch; their alpha follows control.
    for (const side of ['nature', 'human'] as const) {
      const bySide: Sprite[][] = [];
      for (let lane = 0; lane < 3; lane++) {
        const row: Sprite[] = [];
        for (let seg = 0; seg < SEGMENTS; seg++) {
          const s = new Sprite(tex(`terrain/${side}/${lane}-${seg}`));
          s.anchor.set(0, 0);
          s.position.set(Math.round(FIELD_X0 + SEG_W * seg - 4), LANE_Y[lane]! - LANE_HALF - 2);
          s.alpha = 0;
          this.ground.addChild(s);
          row.push(s);
        }
        bySide.push(row);
      }
      this.terrain.push(bySide);
    }
    for (const pad of PADS) {
      const sprite = new Sprite(tex(`pad/${pad.home ?? 'field'}`));
      sprite.position.set(pad.x, pad.y);
      const mark = new Graphics();
      mark.position.set(pad.x, pad.y);
      this.padLayer.addChild(sprite, mark);
      this.padViews.push({ sprite, mark });
    }
    this.objects.sortableChildren = true;
    this.world.addChild(this.ground, this.padLayer, this.selectG, this.rings, this.objects, this.shots, this.fxLayer, this.bars);
    this.app.stage.addChild(this.world, this.screen);
    this.bindPointer();
    this.ready = true;
    this.resize();
    this.app.ticker.add((t) => this.frame(t.deltaMS / 1000));
  }

  // ── Camera ───────────────────────────────────────────────────

  setInsets(insets: Insets): void {
    this.insets = { ...insets };
    this.resize();
  }

  resize(): void {
    if (!this.ready) return;
    this.app.renderer.resize(window.innerWidth, window.innerHeight, this.res);
    this.layout();
  }

  /** The screen rect left over for the map, in CSS px. */
  private view() {
    const i = this.insets;
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: i.left, y: i.top, w: Math.max(1, w - i.left - i.right), h: Math.max(1, h - i.top - i.bottom) };
  }

  /** Whole device pixels per map pixel that fit the map (borders may tuck under the UI). */
  private fitZoom(): number {
    const v = this.view();
    const k = Math.floor(Math.min((v.w * this.res) / (MAP_W - 24), (v.h * this.res) / (MAP_H - 28)));
    return Math.max(1, k);
  }

  private layout(): void {
    const fit = this.fitZoom();
    this.zoom = clamp(fit + this.userZoom, Math.max(1, fit - 1), fit + 3);
    const s = this.zoom / this.res;
    const v = this.view();
    const mw = MAP_W * s;
    const mh = MAP_H * s;
    // Centre the map in the free rect; when it's bigger than the rect, allow panning.
    const maxPanX = Math.max(0, (mw - v.w) / 2 / s);
    const maxPanY = Math.max(0, (mh - v.h) / 2 / s);
    this.panX = clamp(this.panX, -maxPanX, maxPanX);
    this.panY = clamp(this.panY, -maxPanY, maxPanY);
    const x = v.x + (v.w - mw) / 2 - this.panX * s;
    const y = v.y + (v.h - mh) / 2 - this.panY * s;
    this.world.scale.set(s);
    this.world.position.set(Math.round(x * this.res) / this.res, Math.round(y * this.res) / this.res);
  }

  private toMap(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const s = this.world.scale.x;
    return { x: (clientX - r.left - this.world.position.x) / s, y: (clientY - r.top - this.world.position.y) / s };
  }

  /** Map px → CSS px on screen (for UI pinned to a spot on the map). */
  toScreen(x: number, y: number): { x: number; y: number } {
    const s = this.world.scale.x;
    return { x: this.world.position.x + x * s, y: this.world.position.y + y * s };
  }

  private bindPointer(): void {
    const c = this.canvas;
    let down: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
    c.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY, moved: false };
    });
    c.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!down.moved && Math.hypot(dx, dy) < 8) return;
      down.moved = true;
      const s = this.world.scale.x;
      this.panX = down.px - dx / s;
      this.panY = down.py - dy / s;
      this.layout();
    });
    c.addEventListener('pointerup', (e) => {
      const d = down;
      down = null;
      if (!d || d.moved) return;
      const p = this.toMap(e.clientX, e.clientY);
      this.onTap(this.hitTest(p.x, p.y));
    });
    c.addEventListener('pointercancel', () => (down = null));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.userZoom = clamp(this.userZoom + (e.deltaY < 0 ? 1 : -1), -1, 3);
        this.layout();
      },
      { passive: false },
    );
  }

  /** Back to the whole map. */
  recenter(): void {
    this.userZoom = 0;
    this.panX = 0;
    this.panY = 0;
    this.layout();
  }

  private hitTest(x: number, y: number): MapTarget {
    const game = this.game;
    if (!game) return { type: 'none' };
    // Buildings first (they're big), nearest anchor whose box contains the point.
    let best: MapTarget = { type: 'none' };
    let bestD = Infinity;
    for (const b of game.run.buildings) {
      const v = this.buildings.get(b.id);
      if (!v) continue;
      const bw = v.body.width / 2 + 2;
      const top = v.body.height * v.body.anchor.y + 2;
      if (x >= b.x - bw && x <= b.x + bw && y >= b.y - top && y <= b.y + 6) {
        const d = Math.abs(x - b.x) + Math.abs(y - b.y);
        if (d < bestD) {
          bestD = d;
          best = { type: 'building', id: b.id };
        }
      }
    }
    if (best.type !== 'none') return best;
    for (const pad of PADS) {
      if (Math.abs(x - pad.x) <= 17 && Math.abs(y - pad.y) <= 12 && !buildingOnPad(game.run, pad.id)) return { type: 'pad', pad: pad.id };
    }
    for (const u of game.run.units) {
      if (Math.abs(x - u.x) <= UNITS[u.kind].r + 3 && y <= u.y + 3 && y >= u.y - UNITS[u.kind].r * 2 - 6) return { type: 'unit', id: u.id };
    }
    return { type: 'none' };
  }

  // ── Modes ────────────────────────────────────────────────────

  /** Pads nature can build on; highlighted strongly while the build menu is open. */
  setBuildable(pads: number[], strong: boolean): void {
    this.buildable = new Set(pads);
    this.highlightPads = strong;
  }

  select(id: number | null): void {
    this.selected = id;
  }

  selectPad(pad: number | null): void {
    this.selectedPad = pad;
  }

  // ── Sync with the game ───────────────────────────────────────

  sync(game: Game): void {
    this.game = game;
  }

  reset(): void {
    for (const v of this.units.values()) {
      v.root.destroy({ children: true });
      v.ring.destroy();
      v.bar.destroy();
    }
    for (const v of this.buildings.values()) {
      v.root.destroy({ children: true });
      v.bar.destroy();
    }
    this.units.clear();
    this.buildings.clear();
    for (const f of this.fx) f.sprite.destroy();
    this.fx = [];
  }

  private frame(dt: number): void {
    const game = this.game;
    if (!game || !this.ready) return;
    this.clock += dt;
    const run = game.run;
    // Territory.
    for (let lane = 0; lane < 3; lane++) {
      for (let seg = 0; seg < SEGMENTS; seg++) {
        const c = run.segments[lane]![seg]!;
        const n = this.terrain[0]![lane]![seg]!;
        const h = this.terrain[1]![lane]![seg]!;
        const na = clamp((c - 12) / 50, 0, 1);
        const ha = clamp((-c - 12) / 50, 0, 1);
        n.alpha += (na - n.alpha) * Math.min(1, dt * 3);
        h.alpha += (ha - h.alpha) * Math.min(1, dt * 3);
      }
    }
    this.syncPads(game);
    this.syncBuildings(game, dt);
    this.syncUnits(game, dt);
    this.syncProjectiles(game);
    this.stepFx(dt);
    this.steam(dt);
    this.drawSelection();
  }

  private syncPads(game: Game): void {
    const pulse = 0.8 + 0.2 * Math.sin(this.clock * 5);
    for (const pad of PADS) {
      const v = this.padViews[pad.id]!;
      const taken = !!buildingOnPad(game.run, pad.id);
      v.sprite.visible = !taken;
      v.mark.clear();
      if (taken) continue;
      const user = padUser(game.run, pad.id);
      // Field pads show who may build there by tint.
      if (!pad.home) v.sprite.alpha = user === null ? 0.55 : 1;
      const chosen = this.selectedPad === pad.id;
      if (this.buildable.has(pad.id) || chosen) {
        const col = numOf(chosen ? C.gold : this.highlightPads ? C.mint : C.aqua);
        const a = chosen ? 1 : this.highlightPads ? pulse : 0.35 + 0.25 * pulse;
        // Corner brackets and a plus: "you can build here".
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          v.mark.rect(sx * 16 - (sx > 0 ? 3 : 0), sy * 10 - (sy > 0 ? 1 : 0), 4, 1).fill({ color: col, alpha: a });
          v.mark.rect(sx * 16 - (sx > 0 ? 1 : 0), sy * 10 - (sy > 0 ? 3 : 0), 1, 4).fill({ color: col, alpha: a });
        }
        v.mark.rect(-2, 0, 5, 1).fill({ color: col, alpha: a });
        v.mark.rect(0, -2, 1, 5).fill({ color: col, alpha: a });
      }
    }
  }

  private makeBuilding(b: Building): BuildingView {
    const root = new Container();
    const plate = new Sprite(tex(`pad/${b.pad < 0 ? (b.side === 'nature' ? 'nature' : 'human') : b.side}`));
    plate.alpha = b.pad < 0 ? 0 : 1;
    const body = new Sprite(tex(`building/${b.kind}`));
    const bar = new Graphics();
    const blocked = new Sprite(Texture.EMPTY);
    blocked.anchor.set(0.5, 1);
    root.addChild(plate, body, blocked);
    this.objects.addChild(root);
    this.bars.addChild(bar);
    return { id: b.id, root, body, plate, scaffold: null, bar, flames: [], blocked, shake: 0, lastHp: b.hp, seen: true };
  }

  private syncBuildings(game: Game, dt: number): void {
    for (const v of this.buildings.values()) v.seen = false;
    const time = game.run.time;
    for (const b of game.run.buildings) {
      let v = this.buildings.get(b.id);
      if (!v) {
        v = this.makeBuilding(b);
        this.buildings.set(b.id, v);
      }
      v.seen = true;
      if (b.hp < v.lastHp - 0.5) v.shake = Math.min(1, v.shake + 0.25);
      v.lastHp = b.hp;
      v.shake = Math.max(0, v.shake - dt * 3);
      const jx = v.shake > 0 ? Math.round(Math.sin(this.clock * 60) * v.shake * 1.5) : 0;
      v.root.position.set(b.x + jx, b.y);
      v.root.zIndex = b.y;
      const building = b.progress < 1;
      v.body.alpha = building ? 0.35 + 0.4 * b.progress : 1;
      if (building && !v.scaffold) {
        v.scaffold = new Sprite(tex(`scaffold/${b.side}`));
        v.root.addChild(v.scaffold);
      } else if (!building && v.scaffold) {
        v.scaffold.destroy();
        v.scaffold = null;
      }
      // Hit flash.
      v.body.tint = time - b.hitAt < 0.06 ? 0xffd6d6 : 0xffffff;
      // Fire when badly hurt.
      const share = b.hp / b.maxHp;
      const want = b.progress >= 1 ? (share < 0.25 ? 2 : share < 0.5 ? 1 : 0) : 0;
      while (v.flames.length < want) {
        const f = new Sprite(tex('fx/flame0'));
        const k = v.flames.length;
        f.position.set(k ? 6 : -7, -Math.round(v.body.height * 0.45) + k * 4);
        v.root.addChild(f);
        v.flames.push(f);
      }
      while (v.flames.length > want) v.flames.pop()!.destroy();
      v.flames.forEach((f, i) => (f.texture = tex(`fx/flame${Math.floor(this.clock * 8 + i) % 3}`)));
      if (share < 0.6 && b.progress >= 1 && Math.random() < dt * 2.5) {
        this.spawnFx('smoke', 3, b.x + (Math.random() * 16 - 8), b.y - v.body.height * 0.6, 1.1, 0, -9, true);
      }
      // Waiting for food: show what's missing above the building.
      if (b.blocked && b.side === 'nature') {
        v.blocked.texture = tex(`icon/${b.blocked}`);
        v.blocked.position.set(0, -Math.round(v.body.height * v.body.anchor.y) - 2 - (Math.floor(this.clock * 3) % 2));
        v.blocked.visible = true;
      } else v.blocked.visible = false;
      this.drawBuildingBar(v, b);
    }
    for (const [id, v] of this.buildings) {
      if (v.seen) continue;
      v.root.destroy({ children: true });
      v.bar.destroy();
      this.buildings.delete(id);
    }
  }

  private drawBuildingBar(v: BuildingView, b: Building): void {
    const g = v.bar;
    g.clear();
    const main = b.pad < 0;
    const building = b.progress < 1;
    if (!main && !building && b.hp >= b.maxHp - 0.5) return;
    const w = main ? 40 : 22;
    const x = Math.round(b.x - w / 2);
    const y = Math.round(b.y - v.body.height * v.body.anchor.y - (main ? 6 : 5));
    g.rect(x - 1, y - 1, w + 2, 4).fill(numOf(C.ink));
    if (building) {
      g.rect(x, y, Math.max(1, Math.round(w * b.progress)), 2).fill(numOf(C.gold));
      return;
    }
    const fill = Math.max(1, Math.round(w * clamp(b.hp / b.maxHp, 0, 1)));
    g.rect(x, y, w, 2).fill(TEAM[b.side].dark);
    g.rect(x, y, fill, 2).fill(TEAM[b.side].bar);
    g.rect(x, y, fill, 1).fill({ color: 0xffffff, alpha: 0.35 });
  }

  private makeUnit(u: Unit): UnitView {
    const def = UNITS[u.kind];
    const root = new Container();
    const want = def.r * 2 + 2;
    const size = RING_SIZES.find((s) => s >= want) ?? 34;
    const ring = new Sprite(tex(`ring/${u.side}/${size}`));
    const walk = [0, 1, 2, 3].map((i) => tex(`unit/${u.kind}/walk${i}`));
    const attack = [0, 1].map((i) => tex(`unit/${u.kind}/attack${i}`));
    const body = new Sprite(walk[0]);
    const hunger = new Sprite(tex(def.diet === 'meat' ? 'icon/meat' : def.diet === 'grass' ? 'icon/grass' : 'icon/food'));
    hunger.anchor.set(0.5, 1);
    hunger.visible = false;
    root.addChild(body, hunger);
    this.rings.addChild(ring);
    this.objects.addChild(root);
    const bar = new Graphics();
    this.bars.addChild(bar);
    return { id: u.id, kind: u.kind, root, body, ring, bar, hunger, walk, attack, x: u.x, y: u.y, travel: 0, seen: true };
  }

  private syncUnits(game: Game, dt: number): void {
    for (const v of this.units.values()) v.seen = false;
    const time = game.run.time;
    const k = Math.min(1, dt * 14);
    for (const u of game.run.units) {
      let v = this.units.get(u.id);
      if (!v) {
        v = this.makeUnit(u);
        this.units.set(u.id, v);
      }
      v.seen = true;
      const nx = v.x + (u.x - v.x) * k;
      const ny = v.y + (u.y - v.y) * k;
      const moved = Math.hypot(nx - v.x, ny - v.y);
      v.travel += moved;
      v.x = nx;
      v.y = ny;
      const rx = Math.round(nx);
      const ry = Math.round(ny);
      v.root.position.set(rx, ry);
      v.root.zIndex = ry;
      v.ring.position.set(rx, ry);
      v.body.scale.x = u.face;
      // Pose: strike just after a hit, wind-up just before the next, else walk or stand.
      const def = UNITS[u.kind];
      let texture: Texture;
      if (time - u.struckAt < 0.16) texture = v.attack[1]!;
      else if (u.target && u.cd < 0.25 && moved < 0.05) texture = v.attack[0]!;
      else if (moved > 0.02) texture = v.walk[Math.floor(v.travel / Math.max(2, def.r * 0.6)) % 4]!;
      else texture = v.walk[0]!;
      v.body.texture = texture;
      v.body.tint = time - u.hitAt < 0.08 ? 0xff8a8a : 0xffffff;
      v.hunger.visible = u.hungry && Math.floor(this.clock * 3) % 2 === 0;
      v.hunger.position.set(0, -Math.round(v.body.height * 0.9) - 2);
      // Health bar only once hurt.
      const g = v.bar;
      g.clear();
      if (u.hp < u.maxHp - 0.5) {
        const w = clamp(def.r * 2 + 2, 8, 22);
        const x = rx - Math.round(w / 2);
        const y = ry - Math.round(v.body.height * 0.95) - 3;
        g.rect(x - 1, y - 1, w + 2, 3).fill(numOf(C.ink));
        g.rect(x, y, Math.max(1, Math.round(w * clamp(u.hp / u.maxHp, 0, 1))), 1).fill(TEAM[u.side].bar);
      }
    }
    for (const [id, v] of this.units) {
      if (v.seen) continue;
      v.root.destroy({ children: true });
      v.ring.destroy();
      v.bar.destroy();
      this.units.delete(id);
    }
  }

  private syncProjectiles(game: Game): void {
    const ps = game.run.projectiles;
    while (this.projSprites.length < ps.length) {
      const s = new Sprite(Texture.EMPTY);
      this.shots.addChild(s);
      this.projSprites.push(s);
    }
    this.projSprites.forEach((s, i) => {
      const p = ps[i];
      if (!p) {
        s.visible = false;
        return;
      }
      s.visible = true;
      const total = Math.max(1, Math.hypot(p.tx - p.x0, p.ty - p.y0));
      const done = clamp(1 - Math.hypot(p.tx - p.x, p.ty - p.y) / total, 0, 1);
      const arc = p.kind === 'fire' ? 0 : Math.sin(done * Math.PI) * Math.min(10, total * 0.12);
      s.position.set(Math.round(p.x), Math.round(p.y - arc));
      const dx = p.tx - p.x0;
      if (p.kind === 'cone') s.texture = tex('proj/cone');
      else if (p.kind === 'fire') s.texture = tex(`proj/fire${Math.floor(this.clock * 10) % 2}`);
      else {
        // Pick the drawn slope closest to the flight's current slope (up while rising, down after).
        const slope = (p.ty - p.y0) / Math.max(1, Math.abs(dx)) - Math.cos(done * Math.PI) * 0.5;
        const idx = clamp(Math.round(slope * 2) + 2, 0, 4);
        s.texture = tex(`proj/${p.kind}${idx}`);
      }
      s.scale.x = dx < 0 ? -1 : 1;
    });
  }

  // ── Effects ─────────────────────────────────────────────────

  private spawnFx(name: string, n: number, x: number, y: number, dur: number, vx = 0, vy = 0, fade = false): void {
    if (this.fx.length > 140) return;
    const frames = Array.from({ length: n }, (_, i) => tex(`fx/${name}${i}`));
    const sprite = new Sprite(frames[0]);
    sprite.position.set(Math.round(x), Math.round(y));
    this.fxLayer.addChild(sprite);
    this.fx.push({ sprite, frames, t: 0, dur, vx, vy, fade });
  }

  private stepFx(dt: number): void {
    const keep: Fx[] = [];
    for (const f of this.fx) {
      f.t += dt;
      if (f.t >= f.dur) {
        f.sprite.destroy();
        continue;
      }
      const k = f.t / f.dur;
      f.sprite.texture = f.frames[Math.min(f.frames.length - 1, Math.floor(k * f.frames.length))]!;
      f.sprite.x += f.vx * dt;
      f.sprite.y += f.vy * dt;
      if (f.fade) f.sprite.alpha = 1 - k;
      keep.push(f);
    }
    this.fx = keep;
    const fl: Float[] = [];
    for (const f of this.floats) {
      f.t += dt;
      if (f.t > 1.1) {
        f.text.destroy();
        continue;
      }
      const p = this.toScreen(f.x, f.y);
      f.text.position.set(Math.round(p.x), Math.round(p.y - f.t * 26));
      f.text.alpha = f.t < 0.8 ? 1 : 1 - (f.t - 0.8) / 0.3;
      fl.push(f);
    }
    this.floats = fl;
  }

  private steam(dt: number): void {
    this.steamT += dt;
    if (this.steamT < 0.45) return;
    this.steamT = 0;
    for (const sp of SPRINGS) {
      const y = LANE_Y[sp.lane]! + (sp.lane === 0 ? -24 : 24);
      this.spawnFx('smoke', 3, 288 + (Math.random() * 20 - 10), y - 2, 1.6, Math.random() * 4 - 2, -10, true);
    }
  }

  private drawSelection(): void {
    const g = this.selectG;
    g.clear();
    if (this.selected === null) return;
    const v = this.buildings.get(this.selected);
    const b = this.game?.run.buildings.find((x) => x.id === this.selected);
    if (!v || !b) return;
    const w = Math.round(v.body.width / 2) + 3;
    const a = 0.6 + 0.4 * Math.sin(this.clock * 6);
    const col = TEAM[b.side].bar;
    g.ellipse(b.x, b.y, w, Math.max(6, Math.round(w * 0.45))).stroke({ color: col, width: 1, alpha: a });
  }

  private float(x: number, y: number, text: string, color: string): void {
    if (this.floats.length > 30) return;
    const t = new Text({
      text,
      style: { fontFamily: 'Pixel UI, Fusion Pixel, monospace', fontSize: 12, fill: color, stroke: { color: C.ink, width: 3 } },
      resolution: this.res,
    });
    t.anchor.set(0.5, 1);
    this.screen.addChild(t);
    this.floats.push({ text: t, x, y, t: 0 });
  }

  event(e: CoreEvent): void {
    if (!this.ready) return;
    switch (e.type) {
      case 'hit':
        if (Math.random() < 0.6) this.spawnFx('hit', 3, e.x + (Math.random() * 6 - 3), e.y - 6 - Math.random() * 4, 0.18);
        break;
      case 'impact':
        if (e.kind === 'fire') this.spawnFx('flame', 3, e.x, e.y + 4, 0.35);
        break;
      case 'death':
        this.spawnFx('poof', 4, e.x, e.y - 3, e.cause === 'rout' ? 0.5 : 0.42);
        break;
      case 'destroyed':
        this.spawnFx('rubble', 3, e.x, e.y, 0.8);
        for (let i = 0; i < 6; i++) this.spawnFx('smoke', 3, e.x + (Math.random() * 30 - 15), e.y - 6 - Math.random() * 14, 1.2, Math.random() * 8 - 4, -14, true);
        break;
      case 'bounty':
        if (e.amount >= 1) this.float(e.x, e.y - 14, `+${Math.round(e.amount)}`, C.mint);
        break;
      case 'placed':
        this.spawnFx('smoke', 3, PADS[e.pad]!.x, PADS[e.pad]!.y - 4, 0.6, 0, -6, true);
        break;
      default:
        break;
    }
  }

  /** Where a building stands on screen (CSS px), for pop-overs. */
  buildingScreen(id: number): { x: number; y: number; top: number } | null {
    const b = this.game?.run.buildings.find((x) => x.id === id);
    const v = this.buildings.get(id);
    if (!b || !v) return null;
    const p = this.toScreen(b.x, b.y);
    const top = this.toScreen(b.x, b.y - v.body.height * v.body.anchor.y);
    return { x: p.x, y: p.y, top: top.y };
  }

  padScreen(pad: number): { x: number; y: number } {
    const p = PADS[pad]!;
    return this.toScreen(p.x, p.y - 10);
  }

  /** Map px per CSS px at the current zoom. */
  get scale(): number {
    return this.world.scale.x;
  }
}
