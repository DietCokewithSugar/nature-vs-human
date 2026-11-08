import {
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  OctahedronGeometry,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import {
  BUILDINGS,
  CELL,
  CELLS,
  CELL_COUNT,
  MAP_HALF,
  NODES,
  OPEN_HALF,
  UNITS,
  VOLCANOES,
  cellAt,
  daylight,
  hourOf,
  isNight,
  tideLevel,
  type Building,
  type BuildingId,
  type CoreEvent,
  type EraId,
  type Game,
  type Unit,
} from '../core/index.ts';
import { instantiate } from './assets.ts';
import { LOOKS, UnitView, type UnitHost } from './creatures.ts';
import { Decor } from './decor.ts';
import { DisasterFx } from './disasters.ts';
import { Effects } from './effects.ts';
import { Bars, Icons, essenceTexture, type IconKind } from './marks.ts';
import { PALETTE } from './palette.ts';
import { Terrain, type GroundState } from './terrain.ts';
import { auraLive, auraRadius } from '../core/sim/auras.ts';

export type SceneMode = 'normal' | 'place' | 'rally';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type BState = 'rising' | 'ok' | 'falling';

interface BuildingView {
  id: number;
  kind: BuildingId;
  side: Building['side'];
  outer: Group;
  inner: Object3D | null;
  mats: MeshStandardMaterial[];
  base: Vector3;
  height: number;
  radius: number;
  level: number;
  build: number;
  hpF: number;
  lastHit: number;
  hitFx: number;
  state: BState;
  t: number;
  shake: number;
  tilt: Vector2;
  token: number;
  /** Ground ring showing an effect building's reach. */
  ring: Mesh | null;
  /** Light at night (lamps, zappers, campfires). */
  glow: Sprite | null;
}

interface BubbleView {
  sprite: Sprite;
  x: number;
  z: number;
  phase: number;
  left: number;
  pop: number;
}

interface Beacon {
  group: Group;
  gem: Mesh;
  ring: Mesh;
  mat: MeshStandardMaterial;
}

const TAP_SLOP = 7;

/** The part of the map the camera frames in each era: it pulls back as the map opens. */
function frameOf(era: EraId): { size: number; height: number; targetY: number } {
  return { size: OPEN_HALF[era] * CELL * 2, height: 10 + era * 4, targetY: 1 + era };
}

/** A soft round light for lamps at night. */
function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function skyTexture(top: string, bottom: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.75, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Presentation layer: reads the core every tick and draws the map.
 * Never mutates game state; taps go out through the on* callbacks.
 */
export class CityScene {
  readonly renderer: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.5, 1600);
  private composer: EffectComposer | null = null;
  private sun: DirectionalLight;
  private hemi: HemisphereLight;
  private effects: Effects;
  private terrain = new Terrain();
  private decor: Decor;
  private fx: DisasterFx;
  private world = new Group();
  private bars: Bars;
  private icons: Icons;
  private units = new Map<number, UnitView>();
  private buildings = new Map<number, BuildingView>();
  private bubbles = new Map<number, BubbleView>();
  private bubbleMat: SpriteMaterial;
  private beacon: Beacon | null = null;
  private flag: Object3D | null = null;
  private selectRing: Mesh;
  private selected: number | null = null;
  private overlay: InstancedMesh;
  private border: Line;
  private raycaster = new Raycaster();
  private game: Game | null = null;
  private era: EraId | null = null;
  private groundClock = 0;
  private skyClock = 0;
  private skyKey = '';
  private lastTime = performance.now();
  private quality: 'high' | 'low' = 'high';
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private insetsGoal: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private insetsSet = false;
  private host: UnitHost;
  private mode: SceneMode = 'normal';
  private token = 0;
  private hpOf = new Map<number, { hp: number; life: number }>();
  private ringGeo = (() => {
    const g = new RingGeometry(0.94, 1, 56);
    g.rotateX(-Math.PI / 2);
    return g;
  })();
  private glowTex = glowTexture();

  // Camera rig
  private frameEra: EraId = 1;
  private target = new Vector3();
  private targetGoal = new Vector3();
  private azimuth = 0.55;
  private azimuthGoal = 0.55;
  private polar = 0.95;
  private zoom = 1;
  private distance = 120;
  private fitDistance = 120;
  private moved = false;

  // Pointer
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; button: number }>();
  private pinchStart = 0;
  private zoomStart = 1;
  private twistStart = 0;
  private azimuthStart = 0;
  private dragged = false;

  onBubble: (id: number, x: number, y: number) => void = () => {};
  onBuilding: (id: number) => void = () => {};
  onUnit: (id: number) => void = () => {};
  onCell: (cell: number) => void = () => {};
  onRally: (x: number, z: number) => void = () => {};
  onEmpty: () => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.scene.background = skyTexture(PALETTE.skyTop, PALETTE.skyBottom);

    this.hemi = new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 2.2);
    this.scene.add(this.hemi);
    this.sun = new DirectionalLight(PALETTE.sun, 2.6);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.scene.add(this.sun, this.sun.target);
    this.effects = new Effects(this.scene);

    this.scene.add(this.world);
    this.world.add(this.terrain.group);
    this.decor = new Decor(this.terrain);
    this.world.add(this.decor.group);
    this.fx = new DisasterFx(this.scene, this.terrain, this.effects);
    this.bars = new Bars(this.scene);
    this.icons = new Icons(this.scene);
    this.bubbleMat = new SpriteMaterial({ map: essenceTexture(), transparent: true, depthWrite: false, toneMapped: false });
    void this.addVolcanoes();
    void this.addFlag();

    const ringGeo = new RingGeometry(0.82, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.selectRing = new Mesh(ringGeo, new MeshBasicMaterial({ color: PALETTE.flag, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }));
    this.selectRing.visible = false;
    this.selectRing.renderOrder = 4;
    this.scene.add(this.selectRing);

    const quad = new PlaneGeometry(CELL * 0.9, CELL * 0.9);
    quad.rotateX(-Math.PI / 2);
    this.overlay = new InstancedMesh(quad, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), CELL_COUNT);
    this.overlay.count = 0;
    this.overlay.renderOrder = 3;
    this.overlay.frustumCulled = false;
    this.scene.add(this.overlay);

    this.border = new Line(new BufferGeometry(), new LineBasicMaterial({ color: PALETTE.flag, transparent: true, opacity: 0.55 }));
    this.border.renderOrder = 3;
    this.scene.add(this.border);

    this.host = {
      groundAt: (x, z) => this.terrain.heightAt(x, z),
      waterLevel: () => this.waterLevel(),
    };

    this.flyTo(1);
    this.bindPointer();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ── Public API ───────────────────────────────────────────────

  setQuality(q: 'high' | 'low'): void {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === 'high';
    this.sun.castShadow = q === 'high';
    if (q === 'high' && !this.composer) {
      try {
        const composer = new EffectComposer(this.renderer);
        composer.addPass(new RenderPass(this.scene, this.camera));
        const gtao = new GTAOPass(this.scene, this.camera, 1, 1);
        gtao.blendIntensity = 0.8;
        gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2, scale: 1 });
        composer.addPass(gtao);
        composer.addPass(new OutputPass());
        this.composer = composer;
      } catch (err) {
        console.warn('Ambient occlusion unavailable', err);
      }
    }
    this.resize();
  }

  setInsets(insets: Insets): void {
    this.insetsGoal = { ...insets };
    if (!this.insetsSet) {
      this.insetsSet = true;
      this.insets = { ...insets };
      this.applyView();
    }
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
    }
    this.applyView();
  }

  /** Placement mode shows where a building can go: green own ground, gold neutral, violet enemy. */
  setMode(mode: SceneMode, sites?: Map<number, number>): void {
    this.mode = mode;
    if (mode !== 'place' || !sites) {
      this.overlay.count = 0;
      return;
    }
    const m = new Matrix4();
    const c = new Color();
    let n = 0;
    for (const [k, speed] of sites) {
      const cell = CELLS[k]!;
      let y = -Infinity;
      for (const [dx, dz] of [[0, 0], [-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const) {
        y = Math.max(y, this.terrain.targetHeightAt(cell.x + dx, cell.z + dz));
      }
      m.makeTranslation(cell.x, y + 0.25, cell.z);
      this.overlay.setMatrixAt(n, m);
      this.overlay.setColorAt(n, c.set(speed >= 1 ? PALETTE.siteOwn : speed >= 0.3 ? PALETTE.siteEnemy : PALETTE.siteWild));
      n++;
    }
    this.overlay.count = n;
    this.overlay.instanceMatrix.needsUpdate = true;
    if (this.overlay.instanceColor) this.overlay.instanceColor.needsUpdate = true;
  }

  select(id: number | null): void {
    this.selected = id;
  }

  /** Read the core. Called at the core's tick rate. */
  sync(game: Game): void {
    this.game = game;
    const run = game.run;
    if (run.era !== this.era) {
      const first = this.era === null;
      this.era = run.era;
      this.drawBorder(run.era);
      this.groundClock = 0;
      if (!first || !this.moved) this.flyTo(run.era);
    }
    this.groundClock -= 0.05;
    if (this.groundClock <= 0) {
      this.groundClock = 0.5;
      const built = new Uint8Array(CELL_COUNT);
      for (const b of run.buildings) built[b.cell] = 1;
      const st: GroundState = { era: run.era, owner: run.owner, control: run.control, built };
      this.terrain.setGround(st);
      this.decor.setGround(st);
    }
    // Units.
    const seen = new Set<number>();
    for (const u of run.units) {
      seen.add(u.id);
      let v = this.units.get(u.id);
      if (!v || v.kind !== u.kind) {
        if (v) v.die();
        v = new UnitView(u, this.host);
        this.scene.add(v.root);
        this.units.set(u.id, v);
      }
      v.sync(u);
      this.hpOf.set(u.id, { hp: u.hp / game.unitMaxHp(u.kind), life: 1 - u.age / u.life });
    }
    for (const [id, v] of this.units) {
      if (!seen.has(id) && !v.dying) {
        v.die();
        this.hpOf.delete(id);
      }
    }
    // Buildings.
    const standing = new Set<number>();
    for (const b of run.buildings) {
      standing.add(b.id);
      let v = this.buildings.get(b.id);
      if (!v) v = this.addBuilding(b);
      this.syncBuilding(v, b, game);
    }
    for (const [id, v] of this.buildings) if (!standing.has(id) && v.state !== 'falling') this.collapse(v);
    // Bubbles.
    const live = new Set<number>();
    for (const b of run.bubbles) {
      live.add(b.id);
      let v = this.bubbles.get(b.id);
      if (!v) {
        const c = CELLS[NODES[b.node]!.cell]!;
        const sprite = new Sprite(this.bubbleMat.clone());
        sprite.renderOrder = 6;
        sprite.scale.setScalar(0.01);
        this.scene.add(sprite);
        v = { sprite, x: c.x, z: c.z, phase: Math.random() * 6, left: b.left, pop: 0 };
        this.bubbles.set(b.id, v);
        this.effects.ring(new Vector3(c.x, this.terrain.heightAt(c.x, c.z) + 0.2, c.z), 2.4, PALETTE.essence);
      }
      v.left = b.left;
    }
    for (const [id, v] of this.bubbles) {
      if (!live.has(id) && v.pop === 0) v.pop = 0.001;
    }
    // The rally flag.
    if (this.flag) {
      this.flag.visible = !!run.rally;
      if (run.rally) this.flag.position.set(run.rally.x, this.terrain.heightAt(run.rally.x, run.rally.z), run.rally.z);
    }
    this.fx.sync(run.disaster, run.era, (x, z, r) => this.shakeArea(x, z, r));
  }

  /** Visual reactions to what the core reports. */
  event(e: CoreEvent): void {
    switch (e.type) {
      case 'unitDied': {
        const v = this.units.get(e.id);
        if (v && e.cause !== 'age') this.effects.puff(v.position.clone().setY(v.position.y + 0.8), 1.2, PALETTE.dust, 1.2, 0.8);
        if (v && e.cause === 'capture') this.effects.ring(v.position.clone(), 2.5, PALETTE.beacon[2]);
        v?.die();
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
          this.effects.ring(v.base.clone().setY(v.base.y + 0.3), v.radius * 2.2, e.kind in BUILDINGS && BUILDINGS[e.kind].side === 'nature' ? PALETTE.sprout : PALETTE.beacon[1]);
          this.effects.burst(v.base.clone().setY(v.base.y + v.height * 0.6), 8, 0.6, [PALETTE.sprout, PALETTE.sproutLight]);
        }
        break;
      }
      case 'collected': {
        for (const [, v] of this.bubbles) {
          if (Math.abs(v.x - e.x) < 0.1 && Math.abs(v.z - e.z) < 0.1 && v.pop === 0) v.pop = 0.001;
        }
        this.effects.burst(new Vector3(e.x, this.terrain.heightAt(e.x, e.z) + 3, e.z), 7, 0.45, [PALETTE.essence, PALETTE.essenceGlow]);
        break;
      }
      case 'defected': {
        for (const v of this.units.values()) if (v.kind === e.id) this.effects.puff(v.position.clone().setY(v.position.y + 1), 2.2, PALETTE.dust, 1.4, 1.1);
        break;
      }
      case 'countermeasure':
      case 'active':
        this.pulseLab();
        break;
      case 'strike': {
        // A bird strike: feathers, smoke and the plane spinning down.
        const at = new Vector3(e.x, this.terrain.heightAt(e.x, e.z) + 15, e.z);
        this.effects.burst(at, 18, 1.2, [PALETTE.dust, PALETTE.smoke, PALETTE.hit]);
        this.effects.puff(at, 3.5, PALETTE.smoke, -2, 2.5);
        break;
      }
      default:
        break;
    }
  }

  /** Frame an era's part of the map. */
  flyTo(era: EraId): void {
    this.frameEra = era;
    const f = frameOf(era);
    this.targetGoal.set(0, f.targetY, 0);
    this.azimuthGoal = 0.55;
    this.zoom = 1;
    this.moved = false;
    this.resize();
  }

  recenter(): void {
    this.flyTo(this.era ?? 1);
  }

  get cameraMoved(): boolean {
    return this.moved;
  }

  /** Point the camera at a spot (a building card's "show me"). */
  lookAt(x: number, z: number): void {
    this.targetGoal.set(x, 1, z);
    this.zoom = 0.5;
    this.moved = true;
  }

  /** A new run: every view goes. */
  reset(): void {
    for (const v of this.units.values()) {
      v.removed = true;
      v.root.removeFromParent();
    }
    this.units.clear();
    for (const v of this.buildings.values()) v.outer.removeFromParent();
    this.buildings.clear();
    for (const v of this.bubbles.values()) v.sprite.removeFromParent();
    this.bubbles.clear();
    this.era = null;
    this.selected = null;
    this.setMode('normal');
    this.flyTo(1);
  }

  /** Where a world point lands on screen (CSS pixels), and whether it is in view. */
  toScreen(x: number, y: number, z: number): { x: number; y: number; onScreen: boolean } {
    const v = new Vector3(x, y, z).project(this.camera);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const sx = ((v.x + 1) / 2) * w;
    const sy = ((1 - v.y) / 2) * h;
    return { x: sx, y: sy, onScreen: v.z < 1 && sx >= 0 && sx <= w && sy >= 0 && sy <= h };
  }

  groundY(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }

  // ── View fitting ─────────────────────────────────────────────

  private applyView(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const fw = Math.max(1, w - this.insets.left - this.insets.right);
    const fh = Math.max(1, h - this.insets.top - this.insets.bottom);
    const cx = this.insets.left + fw / 2;
    const cy = this.insets.top + fh / 2;
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.camera.updateProjectionMatrix();
    const f = frameOf(this.frameEra);
    const halfTan = Math.tan(MathUtils.degToRad(this.camera.fov) / 2);
    const hTan = (halfTan * fw) / h;
    const vTan = (halfTan * fh) / h;
    const byWidth = ((f.size * 1.18) / 2) / hTan;
    const tall = (f.size * 1.18 * Math.cos(this.polar) + f.height * Math.sin(this.polar)) / 2;
    const byHeight = (tall * 1.04) / vTan;
    this.fitDistance = Math.max(byWidth, byHeight) * 0.92;
  }

  private easeInsets(dt: number): void {
    let moved = false;
    for (const k of ['top', 'right', 'bottom', 'left'] as const) {
      const goal = this.insetsGoal[k];
      const cur = this.insets[k];
      if (cur === goal) continue;
      const next = MathUtils.damp(cur, goal, 9, dt);
      this.insets[k] = Math.abs(next - goal) < 0.5 ? goal : next;
      moved = true;
    }
    if (moved) this.applyView();
  }

  private drawBorder(era: EraId): void {
    const r = OPEN_HALF[era] * CELL;
    const pts: number[] = [];
    const y = 0.6;
    for (const [x, z] of [[-r, -r], [r, -r], [r, r], [-r, r], [-r, -r]] as const) pts.push(x, y, z);
    this.border.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.border.visible = era < 4;
  }

  // ── Landmarks ────────────────────────────────────────────────

  private async addVolcanoes(): Promise<void> {
    for (const [i, v] of VOLCANOES.entries()) {
      const prep = await instantiate('volcano', v.size);
      prep.object.position.set(v.x, this.terrain.targetHeightAt(v.x, v.z) - 1, v.z);
      prep.object.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && (m.material as MeshStandardMaterial).emissive) {
          const mat = m.material as MeshStandardMaterial;
          if (mat.emissive.getHex() !== 0) {
            mat.emissive.set(PALETTE.lava);
            mat.emissiveIntensity = 1.4;
            mat.toneMapped = false;
          }
        }
      });
      this.world.add(prep.object);
      if (i === 0) this.fx.setVolcano(prep.object);
    }
  }

  private async addFlag(): Promise<void> {
    const prep = await instantiate('flag', 4.2, 'height');
    prep.object.visible = false;
    this.scene.add(prep.object);
    this.flag = prep.object;
  }

  // ── Buildings ────────────────────────────────────────────────

  private addBuilding(b: Building): BuildingView {
    const v: BuildingView = {
      id: b.id,
      kind: b.kind,
      side: b.side,
      outer: new Group(),
      inner: null,
      mats: [],
      base: new Vector3(b.x, this.terrain.targetHeightAt(b.x, b.z), b.z),
      height: 3,
      radius: 2,
      level: b.level,
      build: b.build,
      hpF: 1,
      lastHit: b.hitAt,
      hitFx: 0,
      state: 'rising',
      t: 0,
      shake: 0,
      tilt: new Vector2(),
      token: 0,
      ring: null,
      glow: null,
    };
    const def = BUILDINGS[b.kind];
    if (def.aura) {
      const ring = new Mesh(this.ringGeo, new MeshBasicMaterial({ color: def.side === 'nature' ? PALETTE.auraNature : PALETTE.auraHuman, transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide }));
      ring.renderOrder = 3;
      ring.position.copy(v.base).setY(v.base.y + 0.3);
      this.scene.add(ring);
      v.ring = ring;
    }
    if (b.kind === 'lamp' || b.kind === 'zapper' || b.kind === 'campfire') {
      const glow = new Sprite(new SpriteMaterial({ map: this.glowTex, color: b.kind === 'zapper' ? PALETTE.zap : PALETTE.lampLight, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
      glow.renderOrder = 5;
      this.scene.add(glow);
      v.glow = glow;
    }
    v.outer.position.copy(v.base);
    v.outer.userData.building = b.id;
    this.world.add(v.outer);
    this.buildings.set(b.id, v);
    void this.loadModel(v, b.kind);
    return v;
  }

  private async loadModel(v: BuildingView, kind: BuildingId): Promise<void> {
    const token = ++this.token;
    v.token = token;
    const def = BUILDINGS[kind];
    const prep = await instantiate(def.model, def.size, def.by);
    if (v.token !== token || !this.buildings.has(v.id)) return;
    const old = v.inner;
    if (old) {
      this.effects.dust(v.base.clone().setY(v.base.y + 0.5), Math.max(2, v.radius), 8);
      old.removeFromParent();
    }
    const inner = prep.object;
    v.mats = [];
    inner.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as MeshStandardMaterial).clone();
      m.material = mat;
      v.mats.push(mat);
      o.userData.building = v.id;
    });
    inner.rotation.y = ((Math.floor(Math.abs(Math.sin(v.id * 12.9898) * 4)) % 4) * Math.PI) / 2;
    v.outer.add(inner);
    v.inner = inner;
    const box = new Box3().setFromObject(inner).getSize(new Vector3());
    v.height = prep.height;
    v.radius = Math.max(box.x, box.z) / 2;
    v.state = 'rising';
    v.t = 0;
    inner.scale.y = 0.001;
  }

  private syncBuilding(v: BuildingView, b: Building, game: Game): void {
    if (b.kind !== v.kind) {
      v.kind = b.kind;
      void this.loadModel(v, b.kind);
    }
    if (b.level !== v.level) v.level = b.level;
    v.build = b.build;
    v.hpF = Math.max(0, b.hp / game.buildingMaxHp(b));
    if (b.hitAt !== v.lastHit) {
      v.lastHit = b.hitAt;
      v.shake = Math.min(1, v.shake + 0.35);
      if (v.hitFx <= 0) {
        v.hitFx = 0.45;
        this.effects.burst(v.base.clone().setY(v.base.y + Math.min(v.height * 0.6, 4)), 3, 0.45);
      }
    }
  }

  private collapse(v: BuildingView): void {
    v.state = 'falling';
    v.t = 0;
    v.tilt.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
    const at = v.base.clone().setY(v.base.y + 0.5);
    this.effects.dust(at, Math.max(3, v.radius * 1.2), 10);
    this.effects.burst(at.clone().setY(v.base.y + v.height * 0.4), 16, 1.2);
    this.effects.ring(at, v.radius * 1.8, PALETTE.dust);
  }

  private shakeArea(x: number, z: number, r: number): void {
    for (const v of this.buildings.values()) {
      if (Math.hypot(v.base.x - x, v.base.z - z) < r) v.shake = Math.min(1, v.shake + 0.4);
    }
  }

  private updateBuildings(dt: number): void {
    const level = this.waterLevel();
    const night = isNight(this.game?.run.time ?? 0);
    for (const [id, v] of this.buildings) {
      const inner = v.inner;
      v.hitFx -= dt;
      const scale = 1 + 0.09 * (v.level - 1);
      if (v.state === 'falling') {
        v.t += dt;
        const k = MathUtils.clamp(v.t / 1.3, 0, 1);
        const e = k * k;
        if (inner) inner.scale.set(scale, Math.max(0.001, (1 - e) * scale), scale);
        v.outer.rotation.x = v.tilt.x * e;
        v.outer.rotation.z = v.tilt.y * e;
        if (v.ring) v.ring.visible = false;
        if (v.glow) v.glow.visible = false;
        if (k >= 1) {
          v.outer.removeFromParent();
          v.ring?.removeFromParent();
          v.glow?.removeFromParent();
          this.buildings.delete(id);
        }
        continue;
      }
      if (inner) {
        v.t += dt;
        const rise = MathUtils.smootherstep(MathUtils.clamp(v.t / 1.1, 0, 1), 0, 1);
        // Under construction: grows from the ground and stays see-through until done.
        const built = v.build >= 1 ? 1 : 0.2 + 0.8 * v.build;
        inner.scale.set(scale, Math.max(0.001, rise * built * scale), scale);
        const ghost = v.build < 1;
        for (const m of v.mats) {
          if (m.transparent !== ghost) {
            m.transparent = ghost;
            m.needsUpdate = true;
          }
          m.opacity = ghost ? 0.55 : 1;
        }
        if (ghost && Math.random() < dt * 1.2) this.effects.puff(v.base.clone().setY(v.base.y + 0.4), 1.2, PALETTE.dust, 0.8, 0.9);
        // Battered buildings smoke.
        if (v.hpF < 0.5 && Math.random() < dt * 0.8) this.effects.puff(v.base.clone().setY(v.base.y + v.height * scale * 0.8), 1.3, PALETTE.smoke, 2.2, 1.8);
      }
      if (v.shake > 0) {
        v.shake = Math.max(0, v.shake - dt * 2.5);
        const s = v.shake * 0.12 * Math.min(2, v.radius / 3);
        v.outer.position.x = v.base.x + (Math.random() - 0.5) * s;
        v.outer.position.z = v.base.z + (Math.random() - 0.5) * s;
      } else {
        v.outer.position.x = v.base.x;
        v.outer.position.z = v.base.z;
      }
      v.base.y = this.terrain.heightAt(v.base.x, v.base.z);
      const def = BUILDINGS[v.kind];
      v.outer.position.y = def.onWater ? v.base.y - 0.2 : def.water && v.base.y < level ? level - 0.3 : v.base.y;
      this.updateAura(v, night);
    }
  }

  /** The reach ring of an effect building, and its light after dark. */
  private updateAura(v: BuildingView, night: boolean): void {
    const live = v.build >= 1 && auraLive(v.kind, night);
    if (v.ring) {
      const r = auraRadius(v.kind, v.level, night);
      v.ring.visible = live;
      v.ring.position.set(v.base.x, Math.max(v.base.y, this.waterLevel()) + 0.3, v.base.z);
      v.ring.scale.setScalar(r);
      (v.ring.material as MeshBasicMaterial).opacity = 0.22 + Math.sin(performance.now() / 500 + v.id) * 0.08;
    }
    if (v.glow && v.inner) {
      const on = live && (night || v.kind === 'zapper');
      const m = v.glow.material as SpriteMaterial;
      m.opacity = MathUtils.lerp(m.opacity, on ? (v.kind === 'zapper' ? 0.7 : 0.9) : 0, 0.1);
      v.glow.visible = m.opacity > 0.02;
      const top = v.base.y + v.height * v.inner.scale.y * (v.kind === 'campfire' ? 0.6 : 0.92);
      v.glow.position.set(v.base.x, top, v.base.z);
      v.glow.scale.setScalar(v.kind === 'campfire' ? 4 : 3 + Math.sin(performance.now() / 120 + v.id) * 0.2);
    }
  }

  private pulseLab(): void {
    const lab = this.labView();
    if (!lab) return;
    this.effects.ring(lab.base.clone().setY(lab.base.y + 0.2), 16, PALETTE.beacon[2]);
    this.effects.ring(lab.base.clone().setY(lab.base.y + 0.2), 9, PALETTE.beacon[1]);
  }

  private labView(): BuildingView | null {
    let best: BuildingView | null = null;
    for (const v of this.buildings.values()) {
      if (v.state === 'falling' || !BUILDINGS[v.kind].lab) continue;
      if (!best || v.level > best.level) best = v;
    }
    return best;
  }

  private updateBeacon(dt: number): void {
    const game = this.game;
    if (!this.beacon) {
      const group = new Group();
      const mat = new MeshStandardMaterial({ color: PALETTE.beacon[0], emissive: PALETTE.beacon[0], emissiveIntensity: 0.6, flatShading: true });
      const gem = new Mesh(new OctahedronGeometry(1.1, 0), mat);
      const ring = new Mesh(new TorusGeometry(2, 0.12, 6, 32), mat);
      ring.rotation.x = Math.PI / 2;
      group.add(gem, ring);
      this.scene.add(group);
      this.beacon = { group, gem, ring, mat };
    }
    const b = this.beacon;
    const lab = this.labView();
    const running = !!game && game.running;
    const r = game ? game.run.research % 1 : 0;
    const c = new Color();
    const [a, mid, hot] = PALETTE.beacon;
    if (!running) c.set(PALETTE.beaconIdle);
    else if (r < 0.5) c.set(a).lerp(new Color(mid), r / 0.5);
    else c.set(mid).lerp(new Color(hot), (r - 0.5) / 0.5);
    b.mat.color.lerp(c, Math.min(1, dt * 4));
    b.mat.emissive.copy(b.mat.color);
    const speed = running ? 0.8 + r * 3 : 0.2;
    b.gem.rotation.y += dt * speed;
    b.ring.rotation.z -= dt * speed * 0.6;
    b.group.visible = !!lab;
    if (lab && lab.inner) {
      const h = lab.height * lab.inner.scale.y;
      b.group.position.set(lab.base.x, lab.base.y + h + 3 + Math.sin(performance.now() / 770) * 0.3, lab.base.z);
    }
  }

  // ── Overlays ─────────────────────────────────────────────────

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
    this.bars.begin(this.camera);
    this.icons.begin();
    for (const v of this.units.values()) {
      if (!v.ready || v.dying) continue;
      const s = this.hpOf.get(v.id);
      if (!s) continue;
      const p = v.position;
      const top = p.y + v.height + 0.5;
      const big = LOOKS[v.kind].size > 3.5;
      this.bars.stack(p.x, top, p.z, big ? 1.7 : 1.1, 0.13, [
        { f: s.hp, color: PALETTE.barHp },
        { f: s.life, color: PALETTE.barLife },
      ]);
      const icon = this.iconFor(v);
      if (icon) {
        const k = this.bars.scaleAt(p.x, top, p.z);
        this.icons.show(icon, p.x, top + 0.7 * k + 0.3, p.z, 1.1 * k);
      }
    }
    for (const v of this.buildings.values()) {
      if (v.state === 'falling' || !v.inner) continue;
      const y = v.base.y + v.height * v.inner.scale.y + 0.8;
      const rows = [{ f: v.hpF, color: PALETTE.barHp }];
      if (v.build < 1) rows.push({ f: v.build, color: PALETTE.barBuild });
      this.bars.stack(v.base.x, y, v.base.z, 2.6, 0.2, rows);
    }
    this.bars.end();
    this.icons.end();
  }

  private updateBubbles(dt: number): void {
    const now = performance.now() / 1000;
    for (const [id, v] of this.bubbles) {
      const s = v.sprite;
      const ground = this.terrain.heightAt(v.x, v.z);
      if (v.pop > 0) {
        v.pop += dt * 3;
        s.scale.setScalar(2.4 * (1 + v.pop));
        (s.material as SpriteMaterial).opacity = Math.max(0, 1 - v.pop);
        s.position.y += dt * 4;
        if (v.pop >= 1) {
          s.removeFromParent();
          this.bubbles.delete(id);
        }
        continue;
      }
      const grow = Math.min(1, s.scale.x / 2.8 + dt * 3);
      const pulse = 1 + Math.sin(now * 3 + v.phase) * 0.06;
      s.scale.setScalar(Math.max(0.01, 2.8 * grow * pulse));
      s.position.set(v.x, ground + 3.2 + Math.sin(now * 1.7 + v.phase) * 0.35, v.z);
      (s.material as SpriteMaterial).opacity = v.left < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(now * 6)) : 1;
    }
  }

  private updateSelection(): void {
    const v = this.selected !== null ? this.buildings.get(this.selected) : null;
    this.selectRing.visible = !!v && v.state !== 'falling';
    if (v) {
      this.selectRing.position.set(v.base.x, v.base.y + 0.25, v.base.z);
      const s = v.radius * 1.4 + 0.6 + Math.sin(performance.now() / 300) * 0.1;
      this.selectRing.scale.setScalar(s);
      (this.selectRing.material as MeshBasicMaterial).color.set(v.side === 'nature' ? PALETTE.siteOwn : PALETTE.hit);
    }
  }

  // ── Light and water ──────────────────────────────────────────

  private waterLevel(): number {
    const g = this.game;
    if (!g) return -1.2;
    const run = g.run;
    const surge = g.mods.tide && run.tide.surgeLeft > 0;
    let level = surge ? -0.4 + Math.sin(performance.now() / 260) * 0.1 : g.mods.tide ? -1.6 + tideLevel(run.tide.clock) * 0.9 : -1.2;
    level = Math.max(level, this.fx.seaLevel());
    return level;
  }

  /** The sun and moon follow the core's clock: warm noon, orange dusk, a blue but readable night. */
  private updateLight(dt: number): void {
    const time = this.game?.run.time ?? 0;
    const day = daylight(time);
    const h = hourOf(time);
    const dusk = Math.max(0, 1 - Math.abs(h - 18.5) / 1.6) + Math.max(0, 1 - Math.abs(h - 6) / 1.4) * 0.7;
    const sunUp = MathUtils.clamp(Math.sin(((h - 6) / 12) * Math.PI), 0, 1);
    const az = ((h - 6) / 12) * Math.PI;
    const r = 140;
    const above = day > 0.08;
    const lx = above ? Math.cos(az) * r : -Math.cos(az) * r * 0.6;
    const ly = above ? 40 + sunUp * 100 : 90;
    this.sun.position.set(this.target.x + lx, ly, this.target.z + 70);
    this.sun.target.position.copy(this.target);
    const sunCol = new Color(PALETTE.sun).lerp(new Color(PALETTE.duskBottom), Math.min(1, dusk * 0.8));
    const col = sunCol.lerp(new Color(PALETTE.moon), 1 - day);
    this.sun.color.lerp(col, Math.min(1, dt * 3));
    this.sun.intensity = MathUtils.damp(this.sun.intensity, 0.7 + 2.0 * day, 3, dt);
    this.hemi.intensity = MathUtils.damp(this.hemi.intensity, 1.1 + 1.1 * day, 3, dt);
    this.skyClock -= dt;
    if (this.skyClock <= 0) {
      this.skyClock = 0.5;
      const top = new Color(PALETTE.nightTop).lerp(new Color(PALETTE.skyTop), day).lerp(new Color(PALETTE.duskTop), Math.min(0.6, dusk * 0.5));
      const bottom = new Color(PALETTE.nightBottom).lerp(new Color(PALETTE.skyBottom), day).lerp(new Color(PALETTE.duskBottom), Math.min(0.7, dusk * 0.6));
      const key = top.getHexString() + bottom.getHexString();
      if (key !== this.skyKey) {
        this.skyKey = key;
        const old = this.scene.background as CanvasTexture | null;
        this.scene.background = skyTexture(`#${top.getHexString()}`, `#${bottom.getHexString()}`);
        old?.dispose();
      }
    }
  }

  // ── Camera & input ───────────────────────────────────────────

  private updateCamera(dt: number): void {
    this.easeInsets(dt);
    this.target.x = MathUtils.damp(this.target.x, this.targetGoal.x, 4, dt);
    this.target.y = MathUtils.damp(this.target.y, this.targetGoal.y, 4, dt);
    this.target.z = MathUtils.damp(this.target.z, this.targetGoal.z, 4, dt);
    this.azimuth = MathUtils.damp(this.azimuth, this.azimuthGoal, 8, dt);
    this.distance = MathUtils.damp(this.distance, this.fitDistance * this.zoom, 4, dt);
    const r = this.distance;
    const sp = Math.sin(this.polar);
    const shake = this.fx.shake();
    this.camera.position.set(
      this.target.x + r * sp * Math.sin(this.azimuth) + (Math.random() - 0.5) * shake,
      this.target.y + r * Math.cos(this.polar),
      this.target.z + r * sp * Math.cos(this.azimuth) + (Math.random() - 0.5) * shake,
    );
    this.camera.lookAt(this.target);
    const span = Math.min(110, (frameOf(this.frameEra).size / 2) * this.zoom * 1.25 + 10);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - span) > 1) {
      sc.left = -span;
      sc.right = span;
      sc.top = span;
      sc.bottom = -span;
      sc.updateProjectionMatrix();
    }
  }

  private pan(dx: number, dy: number): void {
    const h = this.canvas.clientHeight || window.innerHeight;
    const perPixel = (2 * this.distance * Math.tan(MathUtils.degToRad(this.camera.fov) / 2)) / h;
    const right = new Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const forward = new Vector3(-Math.sin(this.azimuth), 0, -Math.cos(this.azimuth));
    const move = right.multiplyScalar(-dx * perPixel).add(forward.multiplyScalar((dy * perPixel) / Math.cos(this.polar - 0.35)));
    this.targetGoal.x = MathUtils.clamp(this.targetGoal.x + move.x, -MAP_HALF, MAP_HALF);
    this.targetGoal.z = MathUtils.clamp(this.targetGoal.z + move.z, -MAP_HALF, MAP_HALF);
    this.target.x = this.targetGoal.x;
    this.target.z = this.targetGoal.z;
    this.moved = true;
  }

  private bindPointer(): void {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button });
      if (this.pointers.size === 1) this.dragged = false;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        this.twistStart = Math.atan2(b!.y - a!.y, b!.x - a!.x);
        this.azimuthStart = this.azimuthGoal;
        this.zoomStart = this.zoom;
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
        if (this.pinchStart > 0) this.zoom = MathUtils.clamp((this.zoomStart * this.pinchStart) / dist, 0.25, 1.4);
        const twist = Math.atan2(b!.y - a!.y, b!.x - a!.x);
        this.azimuthGoal = this.azimuthStart - (twist - this.twistStart);
        this.azimuth = this.azimuthGoal;
        this.moved = true;
        return;
      }
      if (!this.dragged && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > TAP_SLOP) this.dragged = true;
      if (!this.dragged) return;
      if (p.button === 2 || e.shiftKey) {
        this.azimuthGoal -= dx * 0.006;
        this.azimuth = this.azimuthGoal;
        this.polar = MathUtils.clamp(this.polar - dy * 0.004, 0.55, 1.2);
        this.moved = true;
      } else {
        this.pan(dx, dy);
      }
    });
    const end = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!p || this.dragged || this.pointers.size > 0) return;
      if (performance.now() - p.t > 600) return;
      this.tap(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = MathUtils.clamp(this.zoom * (1 + e.deltaY * 0.001), 0.25, 1.4);
        this.moved = true;
      },
      { passive: false },
    );
  }

  private ray(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private groundPoint(clientX: number, clientY: number): Vector3 | null {
    this.ray(clientX, clientY);
    const hit = this.raycaster.intersectObject(this.terrain.group.children[0]!, false)[0];
    return hit ? hit.point.clone() : null;
  }

  private tap(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    if (this.mode === 'place') {
      const p = this.groundPoint(clientX, clientY);
      if (p) this.onCell(cellAt(p.x, p.z));
      return;
    }
    if (this.mode === 'rally') {
      const p = this.groundPoint(clientX, clientY);
      if (p) {
        this.effects.ring(p.clone().setY(p.y + 0.2), 3, PALETTE.flag);
        this.onRally(p.x, p.z);
      }
      return;
    }
    // Bubbles have generous hit areas: they are the thing to tap.
    let best: number | null = null;
    let bestD = 44;
    for (const [id, v] of this.bubbles) {
      if (v.pop > 0) continue;
      const s = this.toScreen(v.sprite.position.x, v.sprite.position.y, v.sprite.position.z);
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
    this.ray(clientX, clientY);
    for (const h of this.raycaster.intersectObjects([this.world], true)) {
      if (h.object.name === 'water') continue;
      let o: Object3D | null = h.object;
      while (o && o.userData.building === undefined) o = o.parent;
      if (o && this.buildings.get(o.userData.building as number)?.state !== 'falling') {
        this.onBuilding(o.userData.building as number);
        return;
      }
      break;
    }
    let unit: number | null = null;
    let unitD = 26;
    for (const v of this.units.values()) {
      if (!v.ready || v.dying) continue;
      const s = this.toScreen(v.position.x, v.position.y + v.height * 0.5, v.position.z);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < unitD) {
        unitD = d;
        unit = v.id;
      }
    }
    if (unit !== null) {
      this.onUnit(unit);
      return;
    }
    const p = this.groundPoint(clientX, clientY);
    if (p) this.effects.ring(p.clone().setY(p.y + 0.15), 1.6, PALETTE.dust);
    this.onEmpty();
  }

  // ── Frame ────────────────────────────────────────────────────

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.terrain.update(dt);
    this.decor.update();
    for (const [id, v] of this.units) {
      v.update(dt);
      if (v.removed) this.units.delete(id);
    }
    this.updateBuildings(dt);
    this.updateBeacon(dt);
    this.updateBubbles(dt);
    this.updateSelection();
    this.fx.update(dt);
    this.terrain.setWaterLevel(this.waterLevel(), !!this.game && this.game.mods.tide && this.game.run.tide.surgeLeft > 0, dt);
    this.effects.update(dt);
    this.updateLight(dt);
    this.updateCamera(dt);
    this.updateOverlays();
    if (this.flag?.visible) this.flag.rotation.y += dt * 0.6;
    if (this.composer && this.quality === 'high') this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}

export type { Unit };
