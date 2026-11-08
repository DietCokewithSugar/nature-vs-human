import { Application, Container, Graphics, Sprite, Text, Texture, TextureSource } from 'pixi.js';
import {
  BUILDINGS,
  CELL,
  MAP_PX,
  UNITS,
  buildingSpot,
  cellAt,
  cxOf,
  cyOf,
  eraBounds,
  footprintOf,
  isMain,
  mapOf,
  mainOf,
  type Building,
  type CoreEvent,
  type Game,
  type NatureBuildingId,
  type Unit,
  type UnitId,
} from '../core/index.ts';
import { loadAtlas, tex } from './atlas.ts';
import { Fog } from './fog.ts';
import { Ground } from './ground.ts';
import { C, numOf } from './palette.ts';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** What a click on the map hit. */
export type MapTarget =
  | { type: 'cell'; cell: number }
  | { type: 'building'; id: number }
  | { type: 'unit'; id: number }
  | { type: 'flag'; id: number }
  | { type: 'none' };

const TEAM = {
  nature: { bar: numOf(C.mint), dark: numOf(C.teal) },
  human: { bar: numOf(C.vermilion), dark: numOf(C.blood) },
};
const RING_SIZES = [8, 12, 16, 20, 26, 34];
/** Seen-but-not-visible buildings of the humans are drawn greyed, as last seen. */
const GHOST_TINT = 0x8a8aa0;
/** Keyboard and edge scrolling speed, CSS px per second. */
const PAN_SPEED = 900;
const EDGE = 14;
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
 * The battlefield in PixiJS: the baked ground, resource sites, buildings and units sorted by
 * depth, projectiles and effects, then the fog of war over all of it, then rally flags and
 * health bars. A camera pans and zooms over the map (keys, screen edges, dragging, the wheel).
 * It only reads the game state and reports clicks; it never changes the game.
 */
export class Scene {
  private app = new Application();
  private canvas: HTMLCanvasElement;
  private ready = false;
  private game: Game | null = null;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  private world = new Container();
  private ground: Ground | null = null;
  private fog = new Fog();
  private siteLayer = new Container();
  private cellG = new Graphics();
  private rings = new Container();
  private objects = new Container();
  private shots = new Container();
  private fxLayer = new Container();
  private flagLayer = new Container();
  private bars = new Container();
  private screen = new Container();
  private selectG = new Graphics();
  private ghost = new Sprite(Texture.EMPTY);

  private units = new Map<number, UnitView>();
  private buildings = new Map<number, BuildingView>();
  private sites: { sprite: Sprite; cell: number; ring: Graphics }[] = [];
  private siteSeed = -1;
  private flags = new Map<number, Sprite>();
  private projSprites: Sprite[] = [];
  private fx: Fx[] = [];
  private floats: Float[] = [];
  private steamT = 0;
  private clock = 0;

  /** Zoom in device px per map px; the camera centre in map px. */
  private zoom = 2;
  private baseZoom = 2;
  private camX = MAP_PX / 2;
  private camY = MAP_PX / 2;
  private keys = new Set<string>();
  private pointer = { x: 0, y: 0, over: false };

  private buildable = new Set<number>();
  private placing: NatureBuildingId | null = null;
  private hoverCell = -1;
  private selected: number | null = null;
  private selectedCell: number | null = null;

  onTap: (t: MapTarget) => void = () => {};
  /** Right click: map px. */
  onRightTap: (x: number, y: number) => void = () => {};

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
      background: C.ink,
      preference: 'webgl',
    });
    await loadAtlas();
    this.ground = new Ground(this.app.renderer);
    this.objects.sortableChildren = true;
    this.ghost.alpha = 0.6;
    this.ghost.visible = false;
    this.world.addChild(
      this.ground.layer,
      this.siteLayer,
      this.cellG,
      this.rings,
      this.objects,
      this.ghost,
      this.shots,
      this.fxLayer,
      this.fog.sprite,
      this.fog.border,
      this.selectG,
      this.flagLayer,
      this.bars,
    );
    this.app.stage.addChild(this.world, this.screen);
    this.bindPointer();
    this.bindKeys();
    this.ready = true;
    this.resize();
    if (this.game) this.home();
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
    const v = this.view();
    // About fifteen cells top to bottom at the default zoom.
    const base = Math.max(1, Math.round((v.h * this.res) / (15 * CELL)));
    if (base !== this.baseZoom) {
      this.zoom = clamp(this.zoom + base - this.baseZoom, 1, base + 2);
      this.baseZoom = base;
    }
    this.layout();
  }

  /** The screen rect left over for the map, in CSS px. */
  private view() {
    const i = this.insets;
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: i.left, y: i.top, w: Math.max(1, w - i.left - i.right), h: Math.max(1, h - i.top - i.bottom) };
  }

  private get scaleCss(): number {
    return this.zoom / this.res;
  }

  private layout(): void {
    const s = this.scaleCss;
    const v = this.view();
    // Keep the camera over the open map (with a little of the closed ring showing).
    const era = this.game?.run.era ?? 0;
    const [a, b] = eraBounds(era);
    const lo = (a - 3) * CELL;
    const hi = (b + 4) * CELL;
    const halfW = v.w / 2 / s;
    const halfH = v.h / 2 / s;
    this.camX = hi - lo <= halfW * 2 ? (lo + hi) / 2 : clamp(this.camX, lo + halfW, hi - halfW);
    this.camY = hi - lo <= halfH * 2 ? (lo + hi) / 2 : clamp(this.camY, lo + halfH, hi - halfH);
    const x = v.x + v.w / 2 - this.camX * s;
    const y = v.y + v.h / 2 - this.camY * s;
    this.world.scale.set(s);
    this.world.position.set(Math.round(x * this.res) / this.res, Math.round(y * this.res) / this.res);
  }

  /** The part of the map on screen, in map px. */
  viewRect(): { x0: number; y0: number; x1: number; y1: number } {
    const s = this.scaleCss;
    const v = this.view();
    return { x0: this.camX - v.w / 2 / s, y0: this.camY - v.h / 2 / s, x1: this.camX + v.w / 2 / s, y1: this.camY + v.h / 2 / s };
  }

  centerOn(x: number, y: number): void {
    this.camX = x;
    this.camY = y;
    this.layout();
  }

  /** Back to the mother tree. */
  home(): void {
    const tree = this.game ? mainOf(this.game.run, 'nature') : undefined;
    if (tree) this.centerOn(tree.x, tree.y - CELL);
  }

  zoomBy(step: number, atX?: number, atY?: number): void {
    const before = this.zoom;
    this.zoom = clamp(this.zoom + step, 1, this.baseZoom + 2);
    if (this.zoom === before) return;
    if (atX !== undefined && atY !== undefined) {
      // Keep the map point under the cursor where it is.
      const p = this.toMap(atX, atY);
      const k = before / this.zoom;
      this.camX = p.x + (this.camX - p.x) * k;
      this.camY = p.y + (this.camY - p.y) * k;
    }
    this.layout();
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
    let down: { x: number; y: number; cx: number; cy: number; moved: boolean; button: number } | null = null;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        const p = this.toMap(e.clientX, e.clientY);
        this.onRightTap(p.x, p.y);
        return;
      }
      down = { x: e.clientX, y: e.clientY, cx: this.camX, cy: this.camY, moved: false, button: e.button };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.toMap(e.clientX, e.clientY);
      this.hoverCell = cellAt(p.x, p.y);
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!down.moved && Math.hypot(dx, dy) < 8 && down.button === 0) return;
      down.moved = true;
      const s = this.world.scale.x;
      this.camX = down.cx - dx / s;
      this.camY = down.cy - dy / s;
      this.layout();
    });
    c.addEventListener('pointerup', (e) => {
      const d = down;
      down = null;
      if (!d || d.moved || d.button !== 0) return;
      const p = this.toMap(e.clientX, e.clientY);
      this.onTap(this.hitTest(p.x, p.y));
    });
    c.addEventListener('pointercancel', () => (down = null));
    c.addEventListener('pointerleave', () => (this.hoverCell = -1));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
      },
      { passive: false },
    );
    // Edge scrolling follows the pointer over the map only (not over the panels).
    window.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY, over: e.target === c };
    });
    document.addEventListener('pointerleave', () => (this.pointer.over = false));
    window.addEventListener('blur', () => {
      this.pointer.over = false;
      this.keys.clear();
    });
  }

  private bindKeys(): void {
    const PAN = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (PAN.has(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.keys.add(k);
        e.preventDefault();
      } else if (k === '+' || k === '=') this.zoomBy(1);
      else if (k === '-' || k === '_') this.zoomBy(-1);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  private pan(dt: number): void {
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) dx -= 1;
    if (k.has('d') || k.has('arrowright')) dx += 1;
    if (k.has('w') || k.has('arrowup')) dy -= 1;
    if (k.has('s') || k.has('arrowdown')) dy += 1;
    if (this.pointer.over && document.hasFocus()) {
      const v = this.view();
      const { x, y } = this.pointer;
      if (x >= v.x && x < v.x + EDGE) dx -= 1;
      if (x <= v.x + v.w && x > v.x + v.w - EDGE) dx += 1;
      if (y >= v.y && y < v.y + EDGE) dy -= 1;
      if (y <= v.y + v.h && y > v.y + v.h - EDGE) dy += 1;
    }
    if (!dx && !dy) return;
    const step = (PAN_SPEED * dt) / this.scaleCss;
    this.camX += clamp(dx, -1, 1) * step;
    this.camY += clamp(dy, -1, 1) * step;
    this.layout();
  }

  private visibleAt(x: number, y: number): boolean {
    const g = this.game;
    if (!g) return false;
    const c = cellAt(x, y);
    return c >= 0 && g.visible[c] === 1;
  }

  private hitTest(x: number, y: number): MapTarget {
    const game = this.game;
    if (!game) return { type: 'none' };
    for (const f of game.run.flags) if (Math.abs(x - f.x - 4) <= 8 && y <= f.y + 2 && y >= f.y - 24) return { type: 'flag', id: f.id };
    let best: MapTarget = { type: 'none' };
    let bestD = Infinity;
    for (const b of game.run.buildings) {
      const v = this.buildings.get(b.id);
      if (!v || !v.root.visible) continue;
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
    for (const u of game.run.units) {
      if (u.side === 'human' && !this.visibleAt(u.x, u.y)) continue;
      if (Math.abs(x - u.x) <= UNITS[u.kind].r + 3 && y <= u.y + 3 && y >= u.y - UNITS[u.kind].r * 2 - 6) return { type: 'unit', id: u.id };
    }
    const cell = cellAt(x, y);
    return cell >= 0 ? { type: 'cell', cell } : { type: 'none' };
  }

  // ── Modes ────────────────────────────────────────────────────

  /** Cells nature can build on, and the kind being placed (if any). */
  setBuildable(cells: number[], placing: NatureBuildingId | null): void {
    this.buildable = new Set(cells);
    this.placing = placing;
  }

  select(id: number | null): void {
    this.selected = id;
  }

  selectCell(cell: number | null): void {
    this.selectedCell = cell;
  }

  // ── Sync with the game ───────────────────────────────────────

  sync(game: Game): void {
    const first = !this.game;
    this.game = game;
    if (first && this.ready) this.home();
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
    this.pan(Math.min(dt, 0.05));
    const run = game.run;
    const map = mapOf(run);
    this.ground!.update(map, run.era, run.control, this.viewRect());
    this.fog.update(run.explored, game.visible, map.ring, run.era);
    this.syncSites(game);
    this.syncBuildings(game, dt);
    this.syncUnits(game, dt);
    this.syncProjectiles(game);
    this.syncFlags(game);
    this.stepFx(dt);
    this.steam(dt);
    this.drawCells(game);
    this.drawSelection();
  }

  private syncSites(game: Game): void {
    const run = game.run;
    const map = mapOf(run);
    if (this.siteSeed !== map.seed) {
      this.siteSeed = map.seed;
      for (const s of this.sites) {
        s.sprite.destroy();
        s.ring.destroy();
      }
      this.sites = map.sites.map((site) => {
        const ring = new Graphics();
        const sprite = new Sprite(tex(`site/${site.kind}`));
        sprite.position.set(cxOf(site.cell) * CELL + CELL / 2, cyOf(site.cell) * CELL + CELL - 8);
        this.siteLayer.addChild(ring, sprite);
        return { sprite, ring, cell: site.cell };
      });
    }
    for (const s of this.sites) {
      const shown = run.explored[s.cell] === 1 && map.ring[s.cell]! <= run.era;
      s.sprite.visible = shown;
      s.ring.visible = shown;
      if (!shown) continue;
      const c = run.control[s.cell]!;
      s.ring.clear();
      if (Math.abs(c) < 50) continue;
      const x = cxOf(s.cell) * CELL + CELL / 2;
      const y = cyOf(s.cell) * CELL + CELL - 10;
      s.ring.ellipse(x, y, 14, 6).stroke({ color: c > 0 ? TEAM.nature.bar : TEAM.human.bar, width: 1, alpha: 0.6 + 0.3 * Math.sin(this.clock * 3) });
    }
  }

  /** Build highlights, the selected cell and the ghost of the building being placed. */
  private drawCells(game: Game): void {
    const g = this.cellG;
    g.clear();
    const pulse = 0.55 + 0.25 * Math.sin(this.clock * 5);
    const r = this.viewRect();
    if (this.placing) {
      for (const c of this.buildable) {
        const x = cxOf(c) * CELL;
        const y = cyOf(c) * CELL;
        if (x + CELL < r.x0 || x > r.x1 || y + CELL < r.y0 || y > r.y1) continue;
        g.rect(x + 2, y + 2, CELL - 4, CELL - 4)
          .fill({ color: 0xffffff, alpha: 0.1 + 0.08 * pulse })
          .stroke({ color: numOf(C.foam), width: 1, alpha: 0.5 + 0.4 * pulse });
      }
    }
    if (this.selectedCell !== null) {
      const x = cxOf(this.selectedCell) * CELL;
      const y = cyOf(this.selectedCell) * CELL;
      g.rect(x + 1, y + 1, CELL - 2, CELL - 2).stroke({ color: numOf(C.gold), width: 1, alpha: 0.6 + 0.4 * Math.sin(this.clock * 6) });
    }
    const kind = this.placing;
    if (kind && this.hoverCell >= 0) {
      const ok = game.buildCheck(this.hoverCell, kind);
      const n = footprintOf(kind);
      const col = numOf(ok.ok || (!ok.ok && ok.why === 'money') ? C.mint : C.red);
      g.rect(cxOf(this.hoverCell) * CELL, cyOf(this.hoverCell) * CELL, CELL * n, CELL * n).fill({ color: col, alpha: 0.18 }).stroke({ color: col, width: 1, alpha: 0.9 });
      const spot = buildingSpot(kind, this.hoverCell);
      this.ghost.texture = tex(`building/${kind}`);
      this.ghost.position.set(spot.x, spot.y);
      this.ghost.tint = ok.ok ? 0xffffff : 0xff8080;
      this.ghost.visible = true;
    } else this.ghost.visible = false;
  }

  private syncFlags(game: Game): void {
    const seen = new Set<number>();
    for (const f of game.run.flags) {
      seen.add(f.id);
      let s = this.flags.get(f.id);
      if (!s) {
        s = new Sprite(tex('flag/0'));
        this.flagLayer.addChild(s);
        this.flags.set(f.id, s);
      }
      s.position.set(f.x, f.y + 6);
      s.texture = tex(`flag/${Math.floor(this.clock * 3 + f.id) % 2}`);
    }
    for (const [id, s] of this.flags) {
      if (seen.has(id)) continue;
      s.destroy();
      this.flags.delete(id);
    }
  }

  private makeBuilding(b: Building): BuildingView {
    const root = new Container();
    const plate = new Sprite(tex(`pad/${b.side}`));
    plate.alpha = isMain(b) ? 0 : 1;
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
      // The humans' buildings: shown where nature sees; greyed as last seen under the fog.
      const live = b.side === 'nature' || this.visibleAt(b.x, b.y - 4) || (BUILDINGS[b.kind].main === true && this.visibleAt(b.x, b.y - CELL));
      const ghost = !live && b.seen;
      v.root.visible = live || ghost;
      v.bar.visible = live;
      if (!v.root.visible) continue;
      if (b.hp < v.lastHp - 0.5) v.shake = Math.min(1, v.shake + 0.25);
      v.lastHp = b.hp;
      v.shake = Math.max(0, v.shake - dt * 3);
      const jx = v.shake > 0 && live ? Math.round(Math.sin(this.clock * 60) * v.shake * 1.5) : 0;
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
      v.body.tint = ghost ? GHOST_TINT : time - b.hitAt < 0.06 ? 0xffd6d6 : 0xffffff;
      v.plate.tint = ghost ? GHOST_TINT : 0xffffff;
      // Fire when badly hurt.
      const share = b.hp / b.maxHp;
      const want = b.progress >= 1 && live ? (share < 0.25 ? 2 : share < 0.5 ? 1 : 0) : 0;
      while (v.flames.length < want) {
        const f = new Sprite(tex('fx/flame0'));
        const k = v.flames.length;
        f.position.set(k ? 6 : -7, -Math.round(v.body.height * 0.45) + k * 4);
        v.root.addChild(f);
        v.flames.push(f);
      }
      while (v.flames.length > want) v.flames.pop()!.destroy();
      v.flames.forEach((f, i) => (f.texture = tex(`fx/flame${Math.floor(this.clock * 8 + i) % 3}`)));
      if (live && share < 0.6 && b.progress >= 1 && Math.random() < dt * 2.5) {
        this.spawnFx('smoke', 3, b.x + (Math.random() * 16 - 8), b.y - v.body.height * 0.6, 1.1, 0, -9, true);
      }
      // Waiting for food: show what's missing above the building.
      if (b.blocked && b.side === 'nature') {
        v.blocked.texture = tex(`icon/${b.blocked}`);
        v.blocked.position.set(0, -Math.round(v.body.height * v.body.anchor.y) - 2 - (Math.floor(this.clock * 3) % 2));
        v.blocked.visible = true;
      } else v.blocked.visible = false;
      if (live) this.drawBuildingBar(v, b);
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
    const main = isMain(b);
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
    const r = this.viewRect();
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
      const shown = (u.side === 'nature' || this.visibleAt(u.x, u.y)) && nx > r.x0 - 40 && nx < r.x1 + 40 && ny > r.y0 - 40 && ny < r.y1 + 60;
      v.root.visible = shown;
      v.ring.visible = shown;
      v.bar.visible = shown;
      if (!shown) continue;
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
      if (!p || !this.visibleAt(p.x, p.y)) {
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
    if (this.fx.length > 160) return;
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

  /** Smoke from the volcano cones and the steam vents nature has seen. */
  private steam(dt: number): void {
    this.steamT += dt;
    if (this.steamT < 0.5 || !this.game) return;
    this.steamT = 0;
    const run = this.game.run;
    const map = mapOf(run);
    const r = this.viewRect();
    for (const v of map.volcanoes) {
      if (!run.explored[v] || map.ring[v]! > run.era) continue;
      const x = cxOf(v) * CELL + CELL / 2;
      const y = cyOf(v) * CELL + CELL - 52;
      if (x < r.x0 - 40 || x > r.x1 + 40 || y < r.y0 - 40 || y > r.y1 + 80) continue;
      this.spawnFx('smoke', 3, x + (Math.random() * 10 - 5), y, 2, Math.random() * 4 - 2, -12, true);
    }
    for (const s of map.sites) {
      if (s.kind !== 'vent' || !run.explored[s.cell] || map.ring[s.cell]! > run.era) continue;
      const x = cxOf(s.cell) * CELL + CELL / 2;
      const y = cyOf(s.cell) * CELL + CELL - 14;
      if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1 + 20) continue;
      if (Math.random() < 0.6) this.spawnFx('smoke', 3, x, y, 1.4, 0, -10, true);
    }
  }

  private drawSelection(): void {
    const g = this.selectG;
    g.clear();
    if (this.selected === null) return;
    const v = this.buildings.get(this.selected);
    const b = this.game?.run.buildings.find((x) => x.id === this.selected);
    if (!v || !b || !v.root.visible) return;
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
        if (this.visibleAt(e.x, e.y) && Math.random() < 0.6) this.spawnFx('hit', 3, e.x + (Math.random() * 6 - 3), e.y - 6 - Math.random() * 4, 0.18);
        break;
      case 'impact':
        if (e.kind === 'fire' && this.visibleAt(e.x, e.y)) this.spawnFx('flame', 3, e.x, e.y + 4, 0.35);
        break;
      case 'death':
        if (e.side === 'nature' || this.visibleAt(e.x, e.y)) this.spawnFx('poof', 4, e.x, e.y - 3, e.cause === 'rout' ? 0.5 : 0.42);
        break;
      case 'destroyed':
        if (e.side === 'human' && !this.visibleAt(e.x, e.y)) break;
        this.spawnFx('rubble', 3, e.x, e.y, 0.8);
        for (let i = 0; i < 6; i++) this.spawnFx('smoke', 3, e.x + (Math.random() * 30 - 15), e.y - 6 - Math.random() * 14, 1.2, Math.random() * 8 - 4, -14, true);
        break;
      case 'bounty':
        if (e.amount >= 1) this.float(e.x, e.y - 14, `+${Math.round(e.amount)}`, C.mint);
        break;
      case 'placed':
        if (e.side === 'nature' || this.visibleAt(e.x, e.y)) this.spawnFx('smoke', 3, e.x, e.y - 4, 0.6, 0, -6, true);
        break;
      case 'stageStarted':
        if (e.opened) this.layout();
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

  cellScreen(cell: number): { x: number; y: number } {
    return this.toScreen(cxOf(cell) * CELL + CELL / 2, cyOf(cell) * CELL);
  }

  /** Map px per CSS px at the current zoom. */
  get scale(): number {
    return this.world.scale.x;
  }
}

