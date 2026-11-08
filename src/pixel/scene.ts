import { Application, Assets, Container, Graphics, Sprite, Texture, TextureSource, type Spritesheet } from 'pixi.js';
import {
  BUILDINGS,
  CELL_COUNT,
  CELLS,
  GRID,
  MAP_HALF,
  NODES,
  OPEN_HALF,
  UNITS,
  VOLCANOES,
  auraLive,
  auraRadius,
  cellAt,
  daylight,
  hourOf,
  isNight,
  isOpen,
  type Building,
  type BuildingId,
  type CoreEvent,
  type EraId,
  type Game,
  type Unit,
  type UnitId,
} from '../core/index.ts';
import { scatter, shows, type DecorItem } from './decor.ts';
import { DisasterFx, Particles, dottedCircle } from './fx.ts';
import { COAST, GroundPainter, SIZE } from './ground.ts';
import { bubbleTexture, gemTexture, glowTexture, iconTextures, shadowTexture, type IconKind } from './marks.ts';
import { C, numOf } from './palette.ts';
import { PX_PER_UNIT, TILE, buildingKey, decorKey, unitKey } from './specs.ts';

export type SceneMode = 'normal' | 'place' | 'rally';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const PX = PX_PER_UNIT;
const toPx = (v: number) => (v + MAP_HALF) * PX;
const toWorld = (p: number) => p / PX - MAP_HALF;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const TAP_SLOP = 7;

/** How high flyers fly (px above their shadow), and who swims or floats. */
const FLY: Partial<Record<UnitId, number>> = { mosquito: 10, pigeon: 10, crow: 15, bee: 7, butterfly: 7, bat: 12, plane: 36 };
const SWIM = new Set<UnitId>(['crocodile', 'octopus', 'shark', 'fisher']);

interface UnitView {
  id: number;
  kind: UnitId;
  side: Unit['side'];
  sprite: Sprite;
  shadow: Sprite;
  move: Texture[];
  rest: Texture[];
  x: number;
  z: number;
  tx: number;
  tz: number;
  face: 1 | -1;
  t: number;
  speed: number;
  hop: number;
  lastHit: number;
  appear: number;
  dying: boolean;
  task: Unit['task'];
  feeding: boolean;
  dazed: boolean;
  hp: number;
  life: number;
  w: number;
  h: number;
  bob: number;
}

interface BuildingView {
  id: number;
  kind: BuildingId;
  side: Building['side'];
  sprite: Sprite;
  shadow: Sprite;
  x: number;
  y: number;
  level: number;
  build: number;
  hpF: number;
  lastHit: number;
  hitFx: number;
  shake: number;
  state: 'rising' | 'ok' | 'falling';
  t: number;
  aura: Graphics | null;
  auraR: number;
  glow: Sprite | null;
}

interface BubbleView {
  sprite: Sprite;
  halo: Sprite;
  x: number;
  y: number;
  phase: number;
  left: number;
  pop: number;
}

/**
 * The pixel-art map, drawn with PixiJS. Same contract as the 3D CityScene: reads the core every
 * tick, never mutates game state, and sends taps out through the on* callbacks.
 *
 * Layers, bottom to top: painted ground → placement / aura / selection marks → shadows →
 * depth-sorted objects (scenery, buildings, units) → particles → night tint → lights →
 * bars, icons and bubbles (kept bright so they read at night).
 */
export class PixelScene {
  private app = new Application();
  private ready = false;
  private canvas: HTMLCanvasElement;
  private sheet: Spritesheet | null = null;

  private world = new Container();
  private groundSprite: Sprite | null = null;
  private painter = new GroundPainter();
  private groundTex: Texture | null = null;
  private marks = new Container();
  private placeLayer = new Graphics();
  private fogLayer = new Graphics();
  private floodLayer = new Graphics();
  private borderLayer = new Graphics();
  private selectRing = new Graphics();
  private shadows = new Container();
  /** Trees, rocks, flowers: below every unit and building, so nothing hides behind a tree. */
  private scenery = new Container();
  private objects = new Container();
  private particles = new Particles();
  private disasters: DisasterFx;
  private night = new Sprite(Texture.WHITE);
  private lights = new Container();
  private overlay = new Container();
  private bars = new Container();
  private icons = new Container();
  private sparkles: Sprite[] = [];

  private units = new Map<number, UnitView>();
  private buildings = new Map<number, BuildingView>();
  private bubbles = new Map<number, BubbleView>();
  private decor: { item: DecorItem; sprite: Sprite }[] = [];
  private volcanoes: Sprite[] = [];
  private volcanoGlow: Sprite | null = null;
  private flag: Sprite | null = null;
  private gem: Sprite | null = null;
  private barPool: Sprite[] = [];
  private barN = 0;
  private iconPool: Sprite[] = [];
  private iconN = 0;

  private game: Game | null = null;
  private era: EraId | null = null;
  private groundClock = 0;
  private decorSig = '';
  private floodKey = -1;
  private mode: SceneMode = 'normal';
  private sites: Map<number, number> | null = null;
  private selected: number | null = null;
  private selectedDrawn: number | null = null;
  private quality: 'high' | 'low' = 'high';
  private lastTime = performance.now();
  private clock = 0;

  // Camera: centre in map px, scale in CSS px per map px (k / resolution, k a whole number).
  private cx = SIZE / 2;
  private cy = SIZE / 2;
  private goalX = SIZE / 2;
  private goalY = SIZE / 2;
  private scale = 2;
  private scaleGoal = 2;
  private frameEra: EraId = 1;
  private moved = false;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private insetsGoal: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private insetsSet = false;

  // Pointer
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinchStart = 0;
  private scaleStart = 2;
  private dragged = false;

  onBubble: (id: number, x: number, y: number) => void = () => {};
  onBuilding: (id: number) => void = () => {};
  onUnit: (id: number) => void = () => {};
  onCell: (cell: number) => void = () => {};
  onRally: (x: number, z: number) => void = () => {};
  onEmpty: () => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.disasters = new DisasterFx(this.particles);
    this.disasters.onShakeArea = (x, y, r) => {
      for (const v of this.buildings.values()) if (Math.hypot(v.x - x, v.y - y) < r) v.shake = Math.min(1, v.shake + 0.4);
    };
    void this.init();
  }

  private get res(): number {
    return Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 3 : 2);
  }

  private async init(): Promise<void> {
    TextureSource.defaultOptions.scaleMode = 'nearest';
    await this.app.init({
      canvas: this.canvas,
      width: this.canvas.clientWidth || window.innerWidth,
      height: this.canvas.clientHeight || window.innerHeight,
      resolution: this.res,
      autoDensity: false,
      antialias: false,
      roundPixels: true,
      background: C.ink,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    this.sheet = await Assets.load<Spritesheet>(`${import.meta.env.BASE_URL}sprites/atlas.json`);
    this.sheet.textureSource.scaleMode = 'nearest';

    this.groundTex = Texture.from(this.painter.canvas);
    this.groundTex.source.scaleMode = 'nearest';
    this.groundSprite = new Sprite(this.groundTex);

    this.objects.sortableChildren = true;
    this.scenery.sortableChildren = true;
    this.night.width = SIZE + 4000;
    this.night.height = SIZE + 4000;
    this.night.position.set(-2000, -2000);
    this.night.blendMode = 'multiply';
    this.lights.blendMode = 'add';
    this.marks.addChild(this.floodLayer, this.placeLayer, this.selectRing, this.borderLayer);
    this.overlay.addChild(this.bars, this.icons);
    this.world.addChild(this.groundSprite, this.marks, this.shadows, this.scenery, this.objects, this.particles.layer, this.disasters.layer, this.fogLayer, this.night, this.lights, this.overlay);
    this.app.stage.addChild(this.world);

    this.buildDecor();
    this.buildLandmarks();
    for (let i = 0; i < 40; i++) {
      const s = new Sprite(Texture.WHITE);
      s.width = 1;
      s.height = 1;
      s.tint = numOf(C.white);
      s.visible = false;
      this.marks.addChild(s);
      this.sparkles.push(s);
    }

    this.bindPointer();
    this.ready = true;
    this.resize();
    if (this.game) this.sync(this.game);
    this.app.ticker.add(() => this.frame());
  }

  private tex(name: string): Texture {
    return this.sheet?.textures[name] ?? Texture.EMPTY;
  }

  private anim(key: string, anim: 'move' | 'rest'): Texture[] {
    const names = this.sheet?.animations[`${key}#${anim}`] ?? this.sheet?.animations[`${key}#move`];
    return names && names.length ? names : [Texture.EMPTY];
  }

  // ── Public API (mirrors CityScene) ───────────────────────────

  setQuality(q: 'high' | 'low'): void {
    this.quality = q;
    this.resize();
  }

  setInsets(insets: Insets): void {
    this.insetsGoal = { ...insets };
    if (!this.insetsSet) {
      this.insetsSet = true;
      this.insets = { ...insets };
    }
  }

  resize(): void {
    if (!this.ready) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.app.renderer.resize(w, h, this.res);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (!this.moved) this.fit(this.frameEra, true);
    else this.scaleGoal = this.snap(this.scaleGoal);
  }

  setMode(mode: SceneMode, sites?: Map<number, number>): void {
    this.mode = mode;
    this.sites = mode === 'place' && sites ? sites : null;
    this.drawSites();
  }

  select(id: number | null): void {
    this.selected = id;
  }

  get cameraMoved(): boolean {
    return this.moved;
  }

  recenter(): void {
    this.flyTo(this.era ?? 1);
  }

  lookAt(x: number, z: number): void {
    this.goalX = toPx(x);
    this.goalY = toPx(z);
    this.scaleGoal = this.snap(Math.max(this.scaleGoal, this.defaultScale() * 1.3));
    this.moved = true;
  }

  flyTo(era: EraId): void {
    this.frameEra = era;
    this.moved = false;
    this.fit(era, false);
  }

  reset(): void {
    for (const v of this.units.values()) this.removeUnit(v);
    this.units.clear();
    for (const v of this.buildings.values()) this.removeBuilding(v);
    this.buildings.clear();
    for (const v of this.bubbles.values()) {
      v.sprite.destroy();
      v.halo.destroy();
    }
    this.bubbles.clear();
    this.era = null;
    this.selected = null;
    this.decorSig = '';
    this.setMode('normal');
    this.flyTo(1);
  }

  /** Where a world point lands on screen (CSS px). */
  toScreen(x: number, _y: number, z: number): { x: number; y: number; onScreen: boolean } {
    const sx = this.world.position.x + toPx(x) * this.scale;
    const sy = this.world.position.y + toPx(z) * this.scale;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return { x: sx, y: sy, onScreen: sx >= 0 && sy >= 0 && sx <= w && sy <= h };
  }

  groundY(): number {
    return 0;
  }

  dispose(): void {
    this.app.destroy();
  }

  /** Read the core. Called at the core's tick rate. */
  sync(game: Game): void {
    this.game = game;
    if (!this.ready) return;
    const run = game.run;
    if (run.era !== this.era) {
      const first = this.era === null;
      this.era = run.era;
      this.groundClock = 0;
      this.drawBorder(run.era);
      if (!first || !this.moved) this.flyTo(run.era);
    }
    this.groundClock -= 0.05;
    if (this.groundClock <= 0) {
      this.groundClock = 0.5;
      if (this.painter.update({ era: run.era, owner: run.owner, control: run.control })) this.groundTex?.source.update();
      this.updateDecor(run.era, run.owner, run.control);
    }

    const seen = new Set<number>();
    for (const u of run.units) {
      seen.add(u.id);
      let v = this.units.get(u.id);
      if (!v || v.kind !== u.kind) {
        if (v) this.removeUnit(v);
        v = this.addUnit(u);
      }
      v.tx = u.x;
      v.tz = u.z;
      if (Math.abs(Math.sin(u.dir)) > 0.2) v.face = Math.sin(u.dir) > 0 ? 1 : -1;
      v.task = u.task;
      v.feeding = u.feeding;
      v.dazed = u.dazed;
      v.side = u.side;
      v.hp = u.hp / game.unitMaxHp(u.kind);
      v.life = 1 - u.age / u.life;
      if (u.hitAt !== v.lastHit) {
        if (v.lastHit > -99) v.hop = 1;
        v.lastHit = u.hitAt;
      }
    }
    for (const v of this.units.values()) if (!seen.has(v.id) && !v.dying) v.dying = true;

    const standing = new Set<number>();
    for (const b of run.buildings) {
      standing.add(b.id);
      let v = this.buildings.get(b.id);
      if (!v) v = this.addBuilding(b);
      if (b.kind !== v.kind) {
        v.kind = b.kind;
        v.sprite.texture = this.tex(`${buildingKey(b.kind)}#move0`);
        v.shadow.texture = shadowTexture(v.sprite.texture.width * 0.9);
        this.particles.dust(v.x, v.y, 8, 8);
      }
      v.level = b.level;
      v.build = b.build;
      v.hpF = Math.max(0, b.hp / game.buildingMaxHp(b));
      if (b.hitAt !== v.lastHit) {
        v.lastHit = b.hitAt;
        v.shake = Math.min(1, v.shake + 0.35);
        if (v.hitFx <= 0) {
          v.hitFx = 0.45;
          this.particles.burst(v.x, v.y, v.sprite.texture.height * 0.5, 3, 0.5);
        }
      }
    }
    for (const v of this.buildings.values()) if (!standing.has(v.id) && v.state !== 'falling') this.collapse(v);

    const live = new Set<number>();
    for (const b of run.bubbles) {
      live.add(b.id);
      let v = this.bubbles.get(b.id);
      if (!v) {
        const c = CELLS[NODES[b.node]!.cell]!;
        const sprite = new Sprite(bubbleTexture());
        sprite.anchor.set(0.5);
        const halo = new Sprite(glowTexture());
        halo.anchor.set(0.5);
        halo.tint = numOf(C.lime);
        halo.blendMode = 'add';
        halo.width = halo.height = 22;
        this.overlay.addChild(halo, sprite);
        v = { sprite, halo, x: toPx(c.x), y: toPx(c.z), phase: Math.random() * 6, left: b.left, pop: 0 };
        this.bubbles.set(b.id, v);
        this.particles.ring(v.x, v.y, 10, C.lime);
      }
      v.left = b.left;
    }
    for (const [id, v] of this.bubbles) if (!live.has(id) && v.pop === 0) v.pop = 0.001;

    if (this.flag) {
      this.flag.visible = !!run.rally;
      if (run.rally) {
        this.flag.position.set(Math.round(toPx(run.rally.x)), Math.round(toPx(run.rally.z)));
        this.flag.zIndex = this.flag.y;
      }
    }
    this.disasters.sync(run.disaster);
  }

  event(e: CoreEvent): void {
    if (!this.ready) return;
    switch (e.type) {
      case 'unitDied': {
        const v = this.units.get(e.id);
        if (!v) break;
        const y = v.z - (FLY[v.kind] ?? 0);
        if (e.cause !== 'age') this.particles.puff(v.x, y, 3, 5, C.khaki, 6, 0.8);
        if (e.cause === 'capture') this.particles.ring(v.x, v.z, 10, C.red);
        v.dying = true;
        break;
      }
      case 'buildingDestroyed': {
        const v = this.buildings.get(e.id);
        if (v) this.collapse(v);
        break;
      }
      case 'buildingUpgraded': {
        const v = this.buildings.get(e.id);
        if (v) {
          this.particles.ring(v.x, v.y, v.sprite.texture.width * 0.8, BUILDINGS[e.kind]?.side === 'nature' ? C.green : C.gold);
          this.particles.burst(v.x, v.y, v.sprite.texture.height * 0.6, 8, 0.6, [C.green, C.leaf, C.gold]);
        }
        break;
      }
      case 'collected': {
        const x = toPx(e.x);
        const y = toPx(e.z);
        for (const v of this.bubbles.values()) if (Math.abs(v.x - x) < 1 && Math.abs(v.y - y) < 1 && v.pop === 0) v.pop = 0.001;
        this.particles.burst(x, y, 10, 7, 0.45, [C.lime, C.leaf, C.white]);
        break;
      }
      case 'defected':
        for (const v of this.units.values()) if (v.kind === e.id) this.particles.puff(v.x, v.z, 4, 8, C.khaki, 6, 1.1);
        break;
      case 'countermeasure':
      case 'active': {
        const lab = this.labView();
        if (lab) {
          this.particles.ring(lab.x, lab.y, 60, C.red, 1);
          this.particles.ring(lab.x, lab.y, 36, C.gold, 0.8);
        }
        break;
      }
      case 'strike': {
        const x = toPx(e.x);
        const y = toPx(e.z);
        this.particles.burst(x, y, 36, 18, 1.2, [C.white, C.slate, C.red]);
        this.particles.puff(x, y, 36, 8, C.slate, -6, 2.5);
        break;
      }
      default:
        break;
    }
  }

  // ── Building the map ─────────────────────────────────────────

  private buildDecor(): void {
    for (const item of scatter()) {
      const t = this.tex(`${decorKey(item.model)}#move0`);
      const s = new Sprite(t);
      s.position.set(Math.round(toPx(item.x)), Math.round(toPx(item.z)));
      s.scale.x = item.flip ? -1 : 1;
      s.zIndex = s.y;
      s.visible = false;
      this.scenery.addChild(s);
      this.decor.push({ item, sprite: s });
    }
  }

  private updateDecor(era: EraId, owner: ArrayLike<number>, control: ArrayLike<number>): void {
    const built = new Uint8Array(CELL_COUNT);
    for (const b of this.game?.run.buildings ?? []) built[b.cell] = 1;
    let sig = String(era);
    for (let k = 0; k < GRID * GRID; k++) {
      const o = owner[k]!;
      sig += o * 10 + (o === 2 ? Math.floor(((control[k]! + 100) / 150) * 5) : 0) + (built[k] ? 100 : 0) + ',';
    }
    if (sig === this.decorSig) return;
    this.decorSig = sig;
    for (const d of this.decor) d.sprite.visible = shows(d.item, era, owner, control, built);
  }

  private buildLandmarks(): void {
    VOLCANOES.forEach((v, i) => {
      const s = new Sprite(this.tex(`volcano/${i}#move0`));
      s.position.set(Math.round(toPx(v.x)), Math.round(toPx(v.z) + v.size * PX * 0.25));
      s.zIndex = s.y;
      this.objects.addChild(s);
      this.volcanoes.push(s);
    });
    const v0 = VOLCANOES[0]!;
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.tint = numOf(C.orange);
    glow.width = glow.height = 40;
    glow.position.set(toPx(v0.x), toPx(v0.z) - v0.size * PX * 0.3);
    this.lights.addChild(glow);
    this.volcanoGlow = glow;
    this.flag = new Sprite(this.tex('flag#move0'));
    this.flag.visible = false;
    this.objects.addChild(this.flag);
    this.gem = new Sprite(gemTexture());
    this.gem.anchor.set(0.5, 1);
    this.gem.visible = false;
    this.overlay.addChild(this.gem);
  }

  private drawBorder(era: EraId): void {
    const g = this.borderLayer.clear();
    const f = this.fogLayer.clear();
    const r = OPEN_HALF[era];
    const a = (GRID / 2 - r) * TILE;
    const b = (GRID / 2 + r) * TILE;
    if (era < 4) {
      for (let p = a; p < b; p += 4) {
        g.rect(p, a - 1, 2, 1).rect(p, b, 2, 1).rect(a - 1, p, 1, 2).rect(b, p, 1, 2);
      }
      g.fill({ color: numOf(C.white), alpha: 0.7 });
    }
    // Ground not yet opened sits in shadow.
    CELLS.forEach((c, k) => {
      if (!isOpen(era, k)) f.rect(c.i * TILE, c.j * TILE, TILE, TILE);
    });
    f.fill({ color: numOf(C.ink), alpha: 0.5 });
  }

  private drawSites(): void {
    const g = this.placeLayer.clear();
    if (!this.sites) return;
    const groups: [number, number[]][] = [
      [numOf(C.green), []],
      [numOf(C.lavender), []],
      [numOf(C.gold), []],
    ];
    for (const [k, speed] of this.sites) groups[speed >= 1 ? 0 : speed >= 0.3 ? 1 : 2]![1].push(k);
    for (const [color, cells] of groups) {
      if (!cells.length) continue;
      for (const k of cells) {
        const c = CELLS[k]!;
        g.rect(c.i * TILE + 1, c.j * TILE + 1, TILE - 2, TILE - 2);
      }
      g.fill({ color, alpha: 0.35 });
      for (const k of cells) {
        const c = CELLS[k]!;
        const x = c.i * TILE + 1;
        const y = c.j * TILE + 1;
        // Corner brackets: readable on any ground.
        for (const [dx, dy, w, h] of [[0, 0, 4, 1], [0, 0, 1, 4], [10, 0, 4, 1], [13, 0, 1, 4], [0, 13, 4, 1], [0, 10, 1, 4], [10, 13, 4, 1], [13, 10, 1, 4]] as const) {
          g.rect(x + dx, y + dy, w, h);
        }
      }
      g.fill({ color, alpha: 1 });
    }
  }

  // ── Units ────────────────────────────────────────────────────

  private addUnit(u: Unit): UnitView {
    const key = unitKey(u.kind);
    const move = this.anim(key, 'move');
    const rest = this.anim(key, 'rest');
    const sprite = new Sprite(rest[0]);
    const w = sprite.texture.width;
    const shadow = new Sprite(shadowTexture(Math.max(6, w * 0.7)));
    shadow.anchor.set(0.5);
    shadow.tint = numOf(u.side === 'nature' ? C.pine : C.blood);
    shadow.alpha = 0.55;
    this.objects.addChild(sprite);
    this.shadows.addChild(shadow);
    const v: UnitView = {
      id: u.id,
      kind: u.kind,
      side: u.side,
      sprite,
      shadow,
      move,
      rest,
      x: toPx(u.x),
      z: toPx(u.z),
      tx: u.x,
      tz: u.z,
      face: Math.sin(u.dir) < 0 ? -1 : 1,
      t: Math.random() * 4,
      speed: 0,
      hop: 0,
      lastHit: u.hitAt,
      appear: 0,
      dying: false,
      task: u.task,
      feeding: u.feeding,
      dazed: u.dazed,
      hp: 1,
      life: 1,
      w,
      h: sprite.texture.height,
      bob: Math.random() * 10,
    };
    this.units.set(u.id, v);
    return v;
  }

  private removeUnit(v: UnitView): void {
    v.sprite.destroy();
    v.shadow.destroy();
    this.units.delete(v.id);
  }

  private updateUnits(dt: number): void {
    for (const v of this.units.values()) {
      v.bob += dt;
      if (v.dying) {
        v.appear -= dt * 2.5;
        if (v.appear <= 0) {
          this.removeUnit(v);
          continue;
        }
      } else if (v.appear < 1) v.appear = Math.min(1, v.appear + dt * 3);
      const gx = toPx(v.tx);
      const gy = toPx(v.tz);
      const dx = gx - v.x;
      const dy = gy - v.z;
      const d = Math.hypot(dx, dy);
      let moved = 0;
      if (d > 32) {
        v.x = gx;
        v.z = gy;
      } else {
        const k = 1 - Math.exp(-dt * 10);
        v.x += dx * k;
        v.z += dy * k;
        moved = d * k;
      }
      v.speed = damp(v.speed, moved / Math.max(dt, 1e-3), 6, dt);
      const moving = v.speed > 1.5;
      if (moving && Math.abs(dx) > 0.3) v.face = dx > 0 ? 1 : -1;
      // Animation: four-frame cycle while moving (faster when running), two slow frames at rest.
      const frames = moving ? v.move : v.rest;
      v.t += dt * (moving ? clamp(5 + v.speed * 0.25, 5, 12) : 1.6);
      v.sprite.texture = frames[Math.floor(v.t) % frames.length]!;
      v.hop = Math.max(0, v.hop - dt * 4);
      const fly = FLY[v.kind];
      const lift = fly ? fly + Math.round(Math.sin(v.bob * 1.6) * 1.5) : Math.round(Math.sin(v.hop * Math.PI) * 3);
      const swim = SWIM.has(v.kind) ? Math.round(Math.sin(v.bob * 2) * 0.6) : 0;
      const x = Math.round(v.x);
      const y = Math.round(v.z);
      const pop = v.appear < 1 ? Math.max(0.2, v.appear) : 1;
      v.sprite.position.set(x, y - lift + swim);
      v.sprite.scale.set(v.face * pop, pop);
      v.sprite.alpha = v.dying ? v.appear : 1;
      // Flyers draw above trees and roofs; everything else sorts by where it stands.
      v.sprite.zIndex = fly ? y + 4000 + fly : y;
      v.shadow.position.set(x, y);
      v.shadow.alpha = (fly ? 0.3 : 0.55) * (v.dying ? v.appear : 1);
      v.shadow.visible = !SWIM.has(v.kind);
    }
  }

  // ── Buildings ────────────────────────────────────────────────

  private addBuilding(b: Building): BuildingView {
    const sprite = new Sprite(this.tex(`${buildingKey(b.kind)}#move0`));
    const x = Math.round(toPx(b.x));
    const y = Math.round(toPx(b.z));
    sprite.position.set(x, y);
    sprite.zIndex = y;
    sprite.alpha = 0;
    const shadow = new Sprite(shadowTexture(sprite.texture.width * 0.9));
    shadow.anchor.set(0.5);
    shadow.tint = numOf(C.ink);
    shadow.alpha = 0.35;
    shadow.position.set(x, y);
    this.objects.addChild(sprite);
    this.shadows.addChild(shadow);
    const def = BUILDINGS[b.kind];
    let aura: Graphics | null = null;
    if (def.aura) {
      aura = new Graphics();
      this.marks.addChild(aura);
    }
    let glow: Sprite | null = null;
    if (b.kind === 'lamp' || b.kind === 'zapper' || b.kind === 'campfire') {
      glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.tint = numOf(b.kind === 'zapper' ? C.lavender : C.gold);
      glow.alpha = 0;
      this.lights.addChild(glow);
    }
    const v: BuildingView = {
      id: b.id,
      kind: b.kind,
      side: b.side,
      sprite,
      shadow,
      x,
      y,
      level: b.level,
      build: b.build,
      hpF: 1,
      lastHit: b.hitAt,
      hitFx: 0,
      shake: 0,
      state: 'rising',
      t: 0,
      aura,
      auraR: -1,
      glow,
    };
    this.buildings.set(b.id, v);
    return v;
  }

  private removeBuilding(v: BuildingView): void {
    v.sprite.destroy();
    v.shadow.destroy();
    v.aura?.destroy();
    v.glow?.destroy();
    this.buildings.delete(v.id);
  }

  private collapse(v: BuildingView): void {
    v.state = 'falling';
    v.t = 0;
    const w = v.sprite.texture.width;
    this.particles.dust(v.x, v.y, w * 0.5, 10);
    this.particles.burst(v.x, v.y, v.sprite.texture.height * 0.4, 16, 1.2);
    this.particles.ring(v.x, v.y, w * 0.8, C.khaki);
  }

  private updateBuildings(dt: number): void {
    const night = isNight(this.game?.run.time ?? 0);
    for (const v of this.buildings.values()) {
      v.hitFx -= dt;
      v.t += dt;
      const s = v.sprite;
      if (v.state === 'falling') {
        const k = clamp(v.t / 1.1, 0, 1);
        s.alpha = 1 - k;
        s.position.set(v.x + Math.round((Math.random() - 0.5) * 2), v.y + Math.round(k * k * 6));
        v.shadow.alpha = 0.35 * (1 - k);
        if (v.aura) v.aura.visible = false;
        if (v.glow) v.glow.visible = false;
        if (k >= 1) this.removeBuilding(v);
        continue;
      }
      // Rising: fades in and drops into place. Under construction: see-through.
      const rise = clamp(v.t / 0.6, 0, 1);
      const ghost = v.build < 1;
      s.alpha = rise * (ghost ? 0.55 : 1);
      if (ghost && Math.random() < dt * 1.2) this.particles.puff(v.x + (Math.random() - 0.5) * 8, v.y, 1, 4, C.khaki, 4, 0.9);
      if (v.hpF < 0.5 && Math.random() < dt * 0.8) this.particles.puff(v.x, v.y, s.texture.height * 0.8, 5, C.slate, 10, 1.8);
      let ox = 0;
      if (v.shake > 0) {
        v.shake = Math.max(0, v.shake - dt * 2.5);
        ox = Math.round((Math.random() - 0.5) * v.shake * 3);
      }
      s.position.set(v.x + ox, v.y - Math.round((1 - rise) * 4));
      this.updateAura(v, night);
    }
  }

  private updateAura(v: BuildingView, night: boolean): void {
    const live = v.build >= 1 && auraLive(v.kind, night);
    if (v.aura) {
      const r = Math.round(auraRadius(v.kind, v.level, night) * PX);
      if (r !== v.auraR) {
        v.auraR = r;
        dottedCircle(v.aura.clear(), v.x, v.y, r, numOf(BUILDINGS[v.kind].side === 'nature' ? C.mint : C.orange), 1, 3);
      }
      v.aura.visible = live;
      v.aura.alpha = 0.55 + Math.sin(this.clock * 2 + v.id) * 0.25;
    }
    if (v.glow) {
      const on = live && (night || v.kind === 'zapper');
      v.glow.alpha = damp(v.glow.alpha, on ? (v.kind === 'zapper' ? 0.6 : 0.85) : 0, 6, 1 / 60);
      v.glow.visible = v.glow.alpha > 0.02;
      const size = (v.kind === 'campfire' ? 34 : 28) + Math.sin(this.clock * 9 + v.id) * 1.5;
      v.glow.width = v.glow.height = size;
      v.glow.position.set(v.x, v.y - v.sprite.texture.height * (v.kind === 'campfire' ? 0.3 : 0.85));
    }
  }

  private labView(): BuildingView | null {
    let best: BuildingView | null = null;
    for (const v of this.buildings.values()) {
      if (v.state === 'falling' || !BUILDINGS[v.kind].lab) continue;
      if (!best || v.level > best.level) best = v;
    }
    return best;
  }

  private updateGem(): void {
    const gem = this.gem;
    if (!gem) return;
    const lab = this.labView();
    gem.visible = !!lab;
    if (!lab) return;
    const g = this.game;
    const running = !!g && g.running;
    const r = g ? g.run.research % 1 : 0;
    gem.tint = numOf(!running ? C.steel : r < 0.4 ? C.green : r < 0.75 ? C.gold : C.red);
    gem.position.set(lab.x, Math.round(lab.y - lab.sprite.texture.height - 3 + Math.sin(this.clock * 2) * 1.5));
  }

  // ── Overlays ─────────────────────────────────────────────────

  private bar(x: number, y: number, w: number, color: number, alpha = 1): Sprite {
    let s = this.barPool[this.barN];
    if (!s) {
      s = new Sprite(Texture.WHITE);
      this.bars.addChild(s);
      this.barPool.push(s);
    }
    s.visible = true;
    s.tint = color;
    s.alpha = alpha;
    s.position.set(x, y);
    s.width = w;
    s.height = 1;
    this.barN++;
    return s;
  }

  /** A pixel meter: ink frame, one row per value. Shown only when something is worth seeing. */
  private meter(cx: number, top: number, w: number, rows: { f: number; color: string }[]): void {
    const x = Math.round(cx - w / 2);
    const bg = this.bar(x - 1, top - 1, w + 2, numOf(C.ink));
    bg.height = rows.length + 2;
    rows.forEach((r, i) => {
      const fill = Math.round(clamp(r.f, 0, 1) * w);
      if (fill < w) this.bar(x + fill, top + i, w - fill, numOf(C.night));
      if (fill > 0) this.bar(x, top + i, fill, numOf(r.color));
    });
  }

  private icon(kind: IconKind, x: number, y: number): void {
    let s = this.iconPool[this.iconN];
    if (!s) {
      s = new Sprite();
      s.anchor.set(0.5, 1);
      this.icons.addChild(s);
      this.iconPool.push(s);
    }
    s.texture = iconTextures()[kind];
    s.visible = true;
    s.position.set(Math.round(x), Math.round(y + Math.sin(this.clock * 3 + x) * 0.8));
    this.iconN++;
  }

  private iconFor(v: UnitView): IconKind | null {
    const def = UNITS[v.kind];
    if (v.dazed) return 'dazed';
    if (v.task === 'rest') return 'rest';
    if (v.task === 'heal') return 'heal';
    if (def.role === 'collect') return v.task === 'collect' || v.task === 'forage' ? 'pollen' : null;
    if (v.task === 'forage' || v.feeding) {
      if (def.diet === 'humans' || def.diet === 'animals') return 'meat';
      return def.side === 'human' && def.role !== 'livestock' ? 'meal' : 'graze';
    }
    return null;
  }

  private updateOverlays(): void {
    this.barN = 0;
    this.iconN = 0;
    // One icon per kind per small area: a resting swarm shows one "Zz", not twenty.
    const shown: { kind: IconKind; x: number; y: number }[] = [];
    for (const v of this.units.values()) {
      if (v.dying || v.appear < 0.5) continue;
      const x = v.sprite.x;
      const top = v.sprite.y - v.h - 2;
      const hurt = v.hp < 0.995;
      const old = v.life < 0.25;
      let iconY = top;
      if (hurt || old) {
        const rows: { f: number; color: string }[] = [{ f: v.hp, color: v.side === 'nature' ? C.green : C.red }];
        if (old || hurt) rows.push({ f: v.life, color: C.white });
        const w = v.w > 18 ? 12 : 8;
        this.meter(x, top - rows.length, w, rows);
        iconY = top - rows.length - 2;
      }
      const icon = this.iconFor(v);
      if (icon && !shown.some((o) => o.kind === icon && Math.abs(o.x - x) < 14 && Math.abs(o.y - iconY) < 12)) {
        shown.push({ kind: icon, x, y: iconY });
        this.icon(icon, x, iconY);
      }
    }
    for (const v of this.buildings.values()) {
      if (v.state === 'falling') continue;
      const hurt = v.hpF < 0.995;
      if (!hurt && v.build >= 1 && this.selected !== v.id) continue;
      const rows: { f: number; color: string }[] = [{ f: v.hpF, color: v.side === 'nature' ? C.green : C.red }];
      if (v.build < 1) rows.push({ f: v.build, color: C.gold });
      this.meter(v.x, v.y - v.sprite.texture.height - 3 - rows.length, 16, rows);
    }
    // Level badge (level 2+): an ink tag with one gold pip per level, at the building's front right.
    for (const v of this.buildings.values()) {
      if (v.state === 'falling' || v.level < 2 || v.build < 1) continue;
      const t = v.sprite.texture;
      const right = Math.round(v.x + (1 - (t.defaultAnchor?.x ?? 0.5)) * t.width);
      const x0 = right - (v.level * 3 + 1);
      const bg = this.bar(x0, v.y - 2, v.level * 3 + 1, numOf(C.ink));
      bg.height = 4;
      for (let i = 0; i < v.level; i++) this.bar(x0 + 1 + i * 3, v.y - 1, 2, numOf(C.gold)).height = 2;
    }
    for (let i = this.barN; i < this.barPool.length; i++) this.barPool[i]!.visible = false;
    for (let i = this.iconN; i < this.iconPool.length; i++) this.iconPool[i]!.visible = false;
  }

  private updateBubbles(dt: number): void {
    for (const [id, v] of this.bubbles) {
      if (v.pop > 0) {
        v.pop += dt * 3;
        v.sprite.alpha = Math.max(0, 1 - v.pop);
        v.halo.alpha = v.sprite.alpha;
        v.sprite.scale.set(1 + v.pop);
        if (v.pop >= 1) {
          v.sprite.destroy();
          v.halo.destroy();
          this.bubbles.delete(id);
        }
        continue;
      }
      const y = Math.round(v.y - 12 + Math.sin(this.clock * 1.7 + v.phase) * 2);
      v.sprite.position.set(Math.round(v.x), y);
      v.halo.position.set(v.x, y);
      v.halo.alpha = 0.5 + Math.sin(this.clock * 3 + v.phase) * 0.15;
      v.sprite.alpha = v.left < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(this.clock * 6)) : 1;
    }
  }

  private updateSelection(): void {
    const v = this.selected !== null ? this.buildings.get(this.selected) : undefined;
    if (!v || v.state === 'falling') {
      if (this.selectedDrawn !== null) this.selectRing.clear();
      this.selectedDrawn = null;
      return;
    }
    if (this.selectedDrawn !== v.id) {
      this.selectedDrawn = v.id;
      const r = Math.max(8, v.sprite.texture.width * 0.6);
      const g = this.selectRing.clear();
      dottedCircle(g, v.x, v.y, r, numOf(v.side === 'nature' ? C.leaf : C.red), 1, 2);
    }
    this.selectRing.alpha = 0.6 + Math.sin(this.clock * 6) * 0.4;
  }

  // ── Water, light and the tsunami ─────────────────────────────

  private updateWater(dt: number): void {
    // A few glints drifting over open water.
    for (const s of this.sparkles) {
      if (s.visible) {
        s.alpha -= dt * 1.5;
        if (s.alpha <= 0) s.visible = false;
        continue;
      }
      if (Math.random() > dt * 2) continue;
      const k = Math.floor(Math.random() * CELL_COUNT);
      const c = CELLS[k]!;
      if (!c.water) continue;
      s.position.set(c.i * TILE + Math.floor(Math.random() * TILE), c.j * TILE + Math.floor(Math.random() * TILE));
      s.width = Math.random() < 0.3 ? 2 : 1;
      s.alpha = 1;
      s.visible = true;
    }
    // Flooded coast: sea surges over cells by their distance from the sea.
    const g = this.game;
    const tideSurge = g && g.mods.tide && g.run.tide.surgeLeft > 0 ? 0.35 : 0;
    const reach = Math.max(this.disasters.surge * 4, tideSurge * 4);
    const key = Math.round(reach * 4);
    if (key !== this.floodKey) {
      this.floodKey = key;
      const f = this.floodLayer.clear();
      if (reach > 0.05) {
        CELLS.forEach((c, k) => {
          if (!c.water && COAST[k]! <= reach) f.rect(c.i * TILE, c.j * TILE, TILE, TILE);
        });
        f.fill({ color: numOf(C.sky), alpha: 0.55 });
      }
    }
  }

  /** Day and night: a multiply tint over the map, warm at dusk, blue at night. */
  private updateLight(): void {
    const time = this.game?.run.time ?? 0;
    const day = daylight(time);
    const h = hourOf(time);
    const dusk = Math.max(0, 1 - Math.abs(h - 18.5) / 1.6) + Math.max(0, 1 - Math.abs(h - 6) / 1.4) * 0.7;
    const nightRGB = [0x5a, 0x5c, 0x9a];
    const duskRGB = [0xff, 0xc8, 0x9a];
    const mix = (i: number) => {
      let v = 255 + (nightRGB[i]! - 255) * (1 - day);
      v += (duskRGB[i]! - v) * Math.min(0.5, dusk * 0.4);
      return Math.round(clamp(v, 0, 255));
    };
    this.night.tint = (mix(0) << 16) | (mix(1) << 8) | mix(2);
    this.night.visible = day < 0.995 || dusk > 0.01;
    this.lights.alpha = clamp(1.2 - day, 0.25, 1);
    if (this.volcanoGlow) {
      const e = this.disasters.erupt;
      this.volcanoGlow.alpha = 0.35 + e * 0.6 + Math.sin(this.clock * 3) * 0.05;
      this.volcanoGlow.width = this.volcanoGlow.height = 40 + e * 30;
    }
  }

  // ── Camera ───────────────────────────────────────────────────

  private view(): { x: number; y: number; w: number; h: number } {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const i = this.insets;
    return { x: i.left, y: i.top, w: Math.max(1, w - i.left - i.right), h: Math.max(1, h - i.top - i.bottom) };
  }

  /** Snap a scale to whole device pixels per map pixel. */
  private snap(scale: number): number {
    const k = clamp(Math.round(scale * this.res), this.minK(), this.maxK());
    return k / this.res;
  }

  private minK(): number {
    const v = this.view();
    // Zoomed all the way out, the whole 32 × 32 map fits.
    return Math.max(1, Math.floor((Math.min(v.w, v.h) * this.res) / (SIZE * 1.05)));
  }

  private maxK(): number {
    return Math.max(this.minK() + 1, Math.round(this.defaultScale() * this.res * 2.5));
  }

  /** About 13 cells across on a phone; the whole open map on a wide screen. */
  private defaultScale(): number {
    const v = this.view();
    if (v.w < 700) return Math.max(1, Math.round((v.w * this.res) / (13 * TILE))) / this.res;
    // Wide screens: the open map if it fits at 2 CSS px per map px or more, else 2 (readable first).
    const span = OPEN_HALF[this.frameEra] * 2 * TILE * 1.08;
    const fit = Math.floor((Math.min(v.w, v.h) * this.res) / span);
    return Math.max(fit, Math.round(2 * this.res)) / this.res;
  }

  private fit(era: EraId, instant: boolean): void {
    this.frameEra = era;
    this.scaleGoal = this.snap(this.defaultScale());
    // Start over nature's home pocket on a phone; the whole map's centre on a wide screen.
    const v = this.view();
    if (v.w < 700 && era === 1) {
      this.goalX = toPx(-MAP_HALF + 10 * 4);
      this.goalY = toPx(-MAP_HALF + 12 * 4);
    } else {
      this.goalX = SIZE / 2;
      this.goalY = SIZE / 2;
    }
    if (instant) {
      this.scale = this.scaleGoal;
      this.cx = this.goalX;
      this.cy = this.goalY;
    }
  }

  private updateCamera(dt: number): void {
    for (const k of ['top', 'right', 'bottom', 'left'] as const) {
      const goal = this.insetsGoal[k];
      const next = damp(this.insets[k], goal, 9, dt);
      this.insets[k] = Math.abs(next - goal) < 0.5 ? goal : next;
    }
    if (this.pointers.size < 2) {
      this.scale = damp(this.scale, this.scaleGoal, 14, dt);
      if (Math.abs(this.scale - this.scaleGoal) < 0.002) this.scale = this.scaleGoal;
    }
    this.cx = damp(this.cx, this.goalX, 8, dt);
    this.cy = damp(this.cy, this.goalY, 8, dt);
    const v = this.view();
    const shake = this.disasters.shake();
    const sx = (Math.random() - 0.5) * shake * 2;
    const sy = (Math.random() - 0.5) * shake * 2;
    const r = this.res;
    // Whole device pixels, so map pixels never shimmer while panning.
    this.world.scale.set(this.scale);
    this.world.position.set(Math.round((v.x + v.w / 2 - this.cx * this.scale + sx) * r) / r, Math.round((v.y + v.h / 2 - this.cy * this.scale + sy) * r) / r);
  }

  private clampGoal(): void {
    this.goalX = clamp(this.goalX, 0, SIZE);
    this.goalY = clamp(this.goalY, 0, SIZE);
  }

  private bindPointer(): void {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.pointers.size === 1) this.dragged = false;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        this.scaleStart = this.scale;
        this.dragged = true;
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (this.pinchStart > 0) {
          const lo = this.minK() / this.res;
          const hi = this.maxK() / this.res;
          this.scale = clamp((this.scaleStart * dist) / this.pinchStart, lo, hi);
          this.scaleGoal = this.scale;
        }
        // Two fingers also pan (half each).
        this.goalX -= dx / this.scale / 2;
        this.goalY -= dy / this.scale / 2;
        this.cx = this.goalX;
        this.cy = this.goalY;
        this.clampGoal();
        this.moved = true;
        return;
      }
      if (!this.dragged && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > TAP_SLOP) this.dragged = true;
      if (!this.dragged) return;
      this.goalX -= dx / this.scale;
      this.goalY -= dy / this.scale;
      this.clampGoal();
      this.cx = this.goalX;
      this.cy = this.goalY;
      this.moved = true;
    });
    const end = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      const wasPinch = this.pointers.size === 2;
      this.pointers.delete(e.pointerId);
      if (wasPinch) this.scaleGoal = this.snap(this.scale);
      if (!p || this.dragged || this.pointers.size > 0) return;
      if (performance.now() - p.t > 600) return;
      this.tap(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      this.scaleGoal = this.snap(this.scale);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const k = Math.round(this.scaleGoal * this.res) + (e.deltaY < 0 ? 1 : -1);
        this.scaleGoal = this.snap(k / this.res);
        this.moved = true;
      },
      { passive: false },
    );
  }

  /** Screen (client) → map px. */
  private mapPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left - this.world.position.x) / this.scale, y: (clientY - rect.top - this.world.position.y) / this.scale };
  }

  private tap(clientX: number, clientY: number): void {
    const p = this.mapPoint(clientX, clientY);
    const wx = toWorld(p.x);
    const wz = toWorld(p.y);
    if (this.mode === 'place') {
      if (p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE) this.onCell(cellAt(wx, wz));
      return;
    }
    if (this.mode === 'rally') {
      this.particles.ring(p.x, p.y, 12, C.green);
      this.onRally(wx, wz);
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const screen = (x: number, y: number) => ({ x: this.world.position.x + x * this.scale, y: this.world.position.y + y * this.scale });
    // Bubbles have generous hit areas: they are the thing to tap.
    let best: number | null = null;
    let bestD = 44;
    for (const [id, v] of this.bubbles) {
      if (v.pop > 0) continue;
      const s = screen(v.sprite.x, v.sprite.y);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    if (best !== null) {
      this.onBubble(best, clientX, clientY);
      return;
    }
    // Units next (they stand in front of buildings), by distance to their middle.
    let unit: number | null = null;
    let unitD = 22;
    for (const v of this.units.values()) {
      if (v.dying) continue;
      const s = screen(v.sprite.x, v.sprite.y - v.h / 2);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < unitD) {
        unitD = d;
        unit = v.id;
      }
    }
    // Buildings: the front-most sprite whose box holds the point.
    let hit: BuildingView | null = null;
    for (const v of this.buildings.values()) {
      if (v.state === 'falling') continue;
      const t = v.sprite.texture;
      const left = v.x - t.defaultAnchor!.x * t.width;
      const top = v.y - t.defaultAnchor!.y * t.height;
      if (p.x >= left && p.x <= left + t.width && p.y >= top && p.y <= top + t.height + 2) {
        if (!hit || v.y > hit.y) hit = v;
      }
    }
    if (unit !== null && (!hit || unitD < 12)) {
      this.onUnit(unit);
      return;
    }
    if (hit) {
      this.onBuilding(hit.id);
      return;
    }
    if (unit !== null) {
      this.onUnit(unit);
      return;
    }
    this.particles.ring(p.x, p.y, 6, C.khaki, 0.4);
    this.onEmpty();
  }

  // ── Frame ────────────────────────────────────────────────────

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.clock += dt;
    this.updateUnits(dt);
    this.updateBuildings(dt);
    this.updateGem();
    this.updateBubbles(dt);
    this.updateSelection();
    this.disasters.update(dt);
    this.particles.update(dt);
    this.updateWater(dt);
    this.updateLight();
    this.updateCamera(dt);
    this.updateOverlays();
  }
}

export type { Unit };
