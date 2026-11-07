import {
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  OctahedronGeometry,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  BoxGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import {
  CREATURE_BY_ID,
  CREATURE_IDS,
  DOMESTICS,
  LAIRS,
  type CreatureId,
  type DisasterId,
  type DomesticId,
  type EraId,
} from '../core/index.ts';
import { instantiate } from './assets.ts';
import { VIEWS, Walker, visibleCount, type NavMode, type ViewId, type WalkerHost } from './creatures.ts';
import { Decor } from './decor.ts';
import { DisasterFx } from './disasters.ts';
import { Effects } from './effects.ts';
import { Lairs } from './lairs.ts';
import { footprint, type Rect } from './layout.ts';
import { NavGrid } from './nav.ts';
import { GROUND, PALETTE } from './palette.ts';
import { Terrain } from './terrain.ts';
import {
  BRIDGES,
  FENCES,
  FRAMES,
  GROUND_TILES,
  LAIR_SPOTS,
  LOTS,
  MAP_HALF,
  PROPS,
  RAID_GATES,
  VOLCANO,
  type Lot,
} from './world.ts';

export interface SceneView {
  era: EraId;
  amounts: Record<CreatureId, number>;
  defected: Partial<Record<CreatureId, number>>;
  taming: Partial<Record<CreatureId, number>>;
  research: number;
  tide: boolean;
  tideLevel: number;
  surge: boolean;
  rampage: boolean;
  /** log10 of income per second; drives how often creatures attack. */
  intensity: number;
  outcome: 'running' | 'won' | 'lost';
  /** Wrecked lairs: seconds until each grows back. */
  lairs: Partial<Record<CreatureId, number>>;
  raid: { target: CreatureId; left: number; total: number } | null;
  disaster: { id: DisasterId; phase: 'warning' | 'active'; left: number; wrecked: CreatureId[] } | null;
  /** 0..1 share of the bill paid: how far nature has crept into the city. */
  creep: number;
}

export interface TapInfo {
  x: number;
  y: number;
  hitBuilding: boolean;
  lair: CreatureId | null;
  raid: boolean;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type BuildingState = 'ok' | 'falling' | 'down' | 'rising';

interface Building {
  lot: Lot;
  model: string;
  outer: Group;
  inner: Group;
  base: Vector3;
  height: number;
  radius: number;
  footprint: Rect;
  hp: number;
  state: BuildingState;
  t: number;
  shake: number;
  tilt: Vector2;
  floats: boolean;
  lab: boolean;
  /** Torn down for good once it has fallen (replaced by a newer era's building). */
  retired: boolean;
  tree: Group | null;
}

interface Beacon {
  group: Group;
  gem: Mesh;
  ring: Mesh;
  mat: MeshStandardMaterial;
}

interface Party {
  target: CreatureId;
  walkers: Walker[];
  done: boolean;
}

const TAP_SLOP = 7;
const RAID_TAP_RADIUS = 46;

function skyTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.75, PALETTE.skyBottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** The lot's stage in an era: the latest entry at or before it. */
function stageAt(lot: Lot, era: EraId): [string, number, 'height'?] | null {
  for (let e = era; e >= 1; e--) {
    const s = lot.eras[e as EraId];
    if (s !== undefined) return s;
  }
  return null;
}

/**
 * Presentation layer: reads a SceneView every tick and renders the map.
 * Never mutates game state; taps are reported through `onTap`.
 */
export class CityScene {
  readonly renderer: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.5, 1600);
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private sun: DirectionalLight;
  private effects: Effects;
  private terrain = new Terrain();
  private decor: Decor;
  private lairs: Lairs;
  private fx: DisasterFx;
  private nav = new NavGrid();
  private navDirty = true;
  private world = new Group();
  private buildings: Building[] = [];
  private tiles = new Group();
  private props = new Group();
  private beacon: Beacon | null = null;
  private walkers = new Map<ViewId, Walker[]>();
  private party: Party | null = null;
  private raycaster = new Raycaster();
  private view: SceneView | null = null;
  private era: EraId | null = null;
  private attackClock = 0;
  private huntClock = 0;
  private lastTime = performance.now();
  private quality: 'high' | 'low' = 'high';
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private insetsGoal: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private insetsSet = false;
  private forest = false;
  private host: WalkerHost;

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

  onTap: (info: TapInfo) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.scene.background = skyTexture();

    this.scene.add(new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 2.2));
    this.sun = new DirectionalLight(PALETTE.sun, 2.6);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 400;
    this.scene.add(this.sun, this.sun.target);
    this.effects = new Effects(this.scene);

    this.scene.add(this.world);
    this.world.add(this.terrain.group, this.tiles, this.props);
    this.decor = new Decor(this.terrain);
    this.world.add(this.decor.group);
    this.lairs = new Lairs(this.terrain, this.effects);
    this.world.add(this.lairs.group);
    this.fx = new DisasterFx(this.scene, this.terrain, this.effects);
    void this.addVolcano();

    this.host = {
      groundAt: (x, z) => this.terrain.heightAt(x, z),
      waterLevel: () => this.waterLevel(),
      wanderPoint: (from, home, radius, mode) => this.wanderPoint(from, home, radius, mode),
      route: (from, to, mode) => this.route(from, to, mode),
    };

    this.setEra(1);
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
        this.gtao = gtao;
      } catch (err) {
        console.warn('Ambient occlusion unavailable', err);
      }
    }
    this.resize();
  }

  /** The part of the canvas the UI covers. The framing eases to the new space rather than jumping. */
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
    this.updateFit(fw, fh);
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

  private updateFit(fw: number, fh: number): void {
    const f = FRAMES[this.frameEra];
    const fullH = this.canvas.clientHeight || window.innerHeight;
    const halfTan = Math.tan(MathUtils.degToRad(this.camera.fov) / 2);
    const hTan = (halfTan * fw) / fullH;
    const vTan = (halfTan * fh) / fullH;
    // Fit the frame's diagonal across, and its depth (foreshortened) plus building height down.
    const byWidth = ((f.size * 1.18) / 2) / hTan;
    const tall = (f.size * 1.18 * Math.cos(this.polar) + f.height * Math.sin(this.polar)) / 2;
    const byHeight = (tall * 1.04) / vTan;
    this.fitDistance = Math.max(byWidth, byHeight) * 0.92;
  }

  sync(view: SceneView): void {
    this.view = view;
    if (view.era !== this.era) {
      this.setEra(view.era);
      this.flyTo(view.era);
    }
    this.lairs.sync(view.era, view.lairs);
    this.decor.setCreep(view.creep);
    const running = view.outcome === 'running';
    for (const id of CREATURE_IDS) {
      // A wrecked lair sends out half as many.
      const wrecked = (view.lairs[id] ?? 0) > 0;
      const amount = running ? (view.amounts[id] ?? 0) : 0;
      this.syncCreature(id, wrecked ? Math.sqrt(amount) : amount);
    }
    for (const [id, d] of Object.entries(DOMESTICS) as [DomesticId, (typeof DOMESTICS)[DomesticId]][]) {
      this.syncCity(id, visibleCount(view.defected[d.from] ?? 0, VIEWS[id].cap));
    }
    const hunter = `hunter-${view.era}` as ViewId;
    for (let e = 1; e <= 4; e++) {
      const id = `hunter-${e}` as ViewId;
      if (id !== hunter) this.syncCity(id, 0);
    }
    this.syncCity(hunter, running ? 1 + Math.floor(view.research * 3) : 0);
    this.syncCity('scientist', view.era >= 3 && running ? 1 : 0);
    this.syncRaid(view);
    this.fx.sync(view.disaster, view.era, (id) => this.lairs.hit(id), (x, z, r) => this.shakeArea(x, z, r));
  }

  /** Frame an era's part of the map. */
  flyTo(era: EraId): void {
    this.frameEra = era;
    const f = FRAMES[era];
    this.targetGoal.set(f.x, f.targetY, f.z);
    this.azimuthGoal = 0.55;
    this.zoom = 1;
    this.moved = false;
    this.resize();
  }

  /** Back to the default view of the current era. */
  recenter(): void {
    this.flyTo(this.era ?? 1);
  }

  /** The player has panned, zoomed or turned away from the default view. */
  get cameraMoved(): boolean {
    return this.moved;
  }

  get focusedEra(): EraId {
    return this.frameEra;
  }

  /** A new run: the map goes back to the ice age, every walker leaves. */
  reset(): void {
    this.setForest(false);
    for (const list of this.walkers.values()) for (const w of list) w.dismiss();
    this.endParty(false);
    this.view = null;
    this.era = null;
    this.setEra(1);
    this.flyTo(1);
  }

  setForest(on: boolean): void {
    if (this.forest === on) return;
    this.forest = on;
    for (const b of this.buildings) {
      if (b.retired) continue;
      if (on) {
        if (b.state === 'ok' || b.state === 'rising') this.collapse(b);
        void this.growTree(b);
      } else {
        if (b.tree) {
          b.tree.userData.shrink = true;
          b.tree = null;
        }
        b.state = 'rising';
        b.t = -Math.random() * 1.5;
        b.hp = 100;
      }
    }
  }

  /** Visual feedback for an active skill or a human move. */
  pulse(kind: 'countermeasure' | 'sabotage' | 'rescue' | 'rampage' | 'surge'): void {
    const lab = this.buildings.find((b) => b.lab && !b.retired);
    if (kind === 'countermeasure' && lab) {
      this.effects.ring(lab.base.clone().setY(0.2), 18, PALETTE.beacon[2]);
      this.effects.ring(lab.base.clone().setY(0.2), 10, PALETTE.beacon[1]);
    }
    if (kind === 'sabotage' && lab) this.hitBuilding(lab, lab.base.clone().setY(lab.height * 0.6), 4);
    if (kind === 'rescue') {
      for (const id of ['wolf', 'wildcat', 'boar'] as CreatureId[]) {
        for (const w of this.walkers.get(id) ?? []) this.effects.ring(w.position.clone(), 3, PALETTE.heart);
      }
    }
    if (kind === 'rampage') {
      for (const id of ['cavebear', 'mammoth', 'boar', 'bison', 'rhino', 'elephant'] as CreatureId[]) {
        for (const w of this.walkers.get(id) ?? []) this.effects.dust(w.position.clone(), 3, 6);
      }
    }
  }

  /** A species switched sides: each visible animal turns into its tame cousin on the spot. */
  defect(id: CreatureId): void {
    const domestic = CREATURE_BY_ID[id].tame;
    if (!domestic) return;
    const list = this.walkers.get(id) ?? [];
    const tame = this.walkers.get(domestic) ?? [];
    this.walkers.set(domestic, tame);
    for (const w of list) {
      this.effects.puff(w.position.clone().setY(w.position.y + 1), 2.4, PALETTE.dust, 1.5, 1.2);
      if (tame.length < VIEWS[domestic].cap) {
        const t = new Walker(domestic, VIEWS[domestic], this.host, this.cityHome(), 16, w.position.clone());
        this.scene.add(t.root);
        tame.push(t);
      }
      w.dismiss();
    }
  }

  /** Where the raid party is on screen, for the tap-to-repel marker. Null when there is none. */
  raidScreen(): { x: number; y: number; onScreen: boolean } | null {
    const p = this.party;
    if (!p || p.done) return null;
    const alive = p.walkers.filter((w) => w.ready && !w.leaving);
    if (!alive.length) return null;
    const c = new Vector3();
    for (const w of alive) c.add(w.position);
    c.divideScalar(alive.length);
    c.y += 4;
    const v = c.project(this.camera);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const x = ((v.x + 1) / 2) * w;
    const y = ((1 - v.y) / 2) * h;
    const onScreen = v.z < 1 && x > this.insets.left && x < w - this.insets.right && y > this.insets.top && y < h - this.insets.bottom;
    return { x, y, onScreen };
  }

  /** Point the camera at a lair (from the creature card). */
  lookAtLair(id: CreatureId): void {
    const s = LAIR_SPOTS[id];
    this.targetGoal.set(s.x, 1, s.z);
    this.zoom = 0.55;
    this.moved = true;
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }

  // ── Era layout ───────────────────────────────────────────────

  private setEra(era: EraId): void {
    if (this.era === era) return;
    this.era = era;
    this.terrain.setEra(era);
    this.decor.setEra(era);
    this.buildTiles(era);
    this.buildProps(era);
    for (const lot of LOTS) this.applyLot(lot, era);
    this.navDirty = true;
  }

  private applyLot(lot: Lot, era: EraId): void {
    const stage = stageAt(lot, era);
    const current = this.buildings.find((b) => b.lot === lot && !b.retired);
    if (current && stage && current.model === stage[0]) return;
    if (current) {
      current.retired = true;
      if (current.state !== 'down') this.collapse(current);
    }
    if (stage) void this.addBuilding(lot, stage, current ? 1.2 : 0);
  }

  private buildTiles(era: EraId): void {
    for (const child of [...this.tiles.children]) {
      child.userData.sink = 1;
    }
    const group = new Group();
    GROUND_TILES[era].forEach((t, i) => {
      const w = t.x1 - t.x0;
      const d = t.z1 - t.z0;
      const h = t.h ?? 0.14;
      const m = new Mesh(new BoxGeometry(w, h, d), new MeshLambertMaterial({ color: GROUND[t.color] }));
      m.position.set((t.x0 + t.x1) / 2, (t.y ?? 0) - h / 2 + 0.06 + i * 0.006, (t.z0 + t.z1) / 2);
      m.receiveShadow = true;
      group.add(m);
    });
    group.userData.rise = 0;
    group.position.y = -0.4;
    this.tiles.add(group);
  }

  private buildProps(era: EraId): void {
    for (const child of [...this.props.children]) child.userData.shrink = true;
    const add = async (model: string, x: number, z: number, size: number, rot = 0, by?: 'length' | 'height') => {
      const prep = await instantiate(model, size, by);
      if (this.era !== era) return;
      prep.object.rotation.y = (rot * Math.PI) / 2;
      prep.object.position.set(x, this.terrain.targetHeightAt(x, z), z);
      prep.object.scale.setScalar(0.001);
      prep.object.userData.grow = -Math.random() * 0.6;
      this.props.add(prep.object);
    };
    for (const p of PROPS) if (era >= p.from && era <= (p.to ?? 4)) void add(p.model, p.x, p.z, p.size, p.rot, p.by);
    for (const f of FENCES) if (era >= f.era) void add('fence', f.x, f.z, 4, f.rot);
  }

  private async addVolcano(): Promise<void> {
    const prep = await instantiate('volcano', VOLCANO.size);
    prep.object.position.set(VOLCANO.x, this.terrain.targetHeightAt(VOLCANO.x, VOLCANO.z) - 1.2, VOLCANO.z);
    prep.object.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && (m.material as MeshStandardMaterial).emissiveIntensity !== undefined) {
        const mat = m.material as MeshStandardMaterial;
        if (mat.emissive.getHex() !== 0) {
          mat.emissive.set(PALETTE.lava);
          mat.emissiveIntensity = 1.4;
          mat.toneMapped = false;
        }
      }
    });
    this.world.add(prep.object);
    this.fx.setVolcano(prep.object);
  }

  // ── Buildings ────────────────────────────────────────────────

  private async addBuilding(lot: Lot, stage: [string, number, 'height'?], delay: number): Promise<void> {
    const [model, size, by] = stage;
    const prep = await instantiate(model, size, by);
    if (this.era === null || stageAt(lot, this.era)?.[0] !== model) return;
    const outer = new Group();
    const inner = prep.object;
    outer.add(inner);
    const y = lot.floats ? 0 : this.terrain.targetHeightAt(lot.x, lot.z);
    outer.position.set(lot.x, y, lot.z);
    this.world.add(outer);
    const box = new Box3().setFromObject(inner).getSize(new Vector3());
    inner.rotation.y = ((lot.rot ?? 0) * Math.PI) / 2;
    const b: Building = {
      lot,
      model,
      outer,
      inner,
      base: new Vector3(lot.x, y, lot.z),
      height: prep.height,
      radius: Math.max(box.x, box.z) / 2,
      footprint: footprint({ model, x: lot.x, z: lot.z, rot: lot.rot, size }, { w: box.x, d: box.z }, 0.6),
      hp: 100,
      state: 'rising',
      t: -delay - Math.random() * 0.8,
      shake: 0,
      tilt: new Vector2(),
      floats: !!lot.floats,
      lab: !!lot.lab,
      retired: false,
      tree: null,
    };
    outer.userData.building = b;
    inner.scale.y = 0.001;
    this.buildings.push(b);
    this.navDirty = true;
    if (b.lab) this.setBeacon(b);
  }

  private setBeacon(b: Building): void {
    if (!this.beacon) {
      const group = new Group();
      const mat = new MeshStandardMaterial({ color: PALETTE.beacon[0], emissive: PALETTE.beacon[0], emissiveIntensity: 0.6, flatShading: true });
      const gem = new Mesh(new OctahedronGeometry(1.3, 0), mat);
      const ring = new Mesh(new TorusGeometry(2.3, 0.14, 6, 32), mat);
      ring.rotation.x = Math.PI / 2;
      group.add(gem, ring);
      this.world.add(group);
      this.beacon = { group, gem, ring, mat };
    }
    this.beacon.group.userData.lab = b;
  }

  private async growTree(b: Building): Promise<void> {
    const kinds = ['tree-oak', 'tree-broadleaf', 'tree-pine', 'tree-birch', 'spruce'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)]!;
    const prep = await instantiate(kind, Math.max(4, b.radius * 1.6));
    if (!this.forest) return;
    const tree = prep.object;
    tree.position.copy(b.base);
    tree.scale.setScalar(0.001);
    tree.userData.grow = -Math.random();
    this.world.add(tree);
    b.tree = tree;
  }

  private standing(): Building[] {
    return this.buildings.filter((b) => b.state === 'ok' && !b.retired);
  }

  private hitBuilding(b: Building, at: Vector3, strength: number): void {
    if (b.state !== 'ok') return;
    b.shake = Math.min(1, b.shake + 0.5 * strength);
    b.hp -= 6 * strength + Math.random() * 6;
    this.effects.burst(at, Math.round(4 + strength * 3), Math.min(1.6, 0.5 + strength * 0.4));
    if (Math.random() < 0.35) this.effects.puff(at, 1 + strength, PALETTE.smoke, 2, 1.4);
    if (b.hp <= 0) this.collapse(b);
  }

  private collapse(b: Building): void {
    b.state = 'falling';
    b.t = 0;
    b.tilt.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
    const at = b.base.clone().setY(b.base.y + 0.5);
    this.effects.dust(at, Math.max(3, b.radius * 1.2), 10);
    this.effects.burst(at.clone().setY(b.base.y + b.height * 0.4), 18, 1.4);
    this.effects.ring(at, b.radius * 1.8, PALETTE.dust);
  }

  /** Disasters shake whatever stands in their way. */
  private shakeArea(x: number, z: number, r: number): void {
    for (const b of this.standing()) {
      const d = Math.hypot(b.base.x - x, b.base.z - z);
      if (d < r) this.hitBuilding(b, b.base.clone().setY(b.base.y + b.height * 0.5), 2.2 * (1 - d / r) + 0.6);
    }
  }

  private updateBuildings(dt: number): void {
    const level = this.waterLevel();
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i]!;
      const inner = b.inner;
      switch (b.state) {
        case 'rising': {
          b.t += dt;
          const k = MathUtils.clamp(b.t / 1.1, 0, 1);
          inner.scale.y = Math.max(0.001, MathUtils.smootherstep(k, 0, 1));
          b.outer.rotation.set(0, 0, 0);
          if (k >= 1) {
            b.state = 'ok';
            b.hp = 100;
          }
          break;
        }
        case 'falling': {
          b.t += dt;
          const k = MathUtils.clamp(b.t / 1.4, 0, 1);
          const e = k * k;
          inner.scale.y = Math.max(0.001, 1 - e);
          b.outer.rotation.x = b.tilt.x * e;
          b.outer.rotation.z = b.tilt.y * e;
          if (k >= 1) {
            b.state = 'down';
            b.t = 0;
          }
          break;
        }
        case 'down': {
          if (b.retired) {
            b.outer.removeFromParent();
            this.buildings.splice(i, 1);
            this.navDirty = true;
            continue;
          }
          b.t += dt;
          if (!this.forest && b.t > 7 + Math.random() * 6) {
            b.state = 'rising';
            b.t = 0;
            b.outer.rotation.set(0, 0, 0);
          }
          break;
        }
        case 'ok': {
          if (b.hp < 55 && Math.random() < dt * 0.6) {
            this.effects.puff(b.base.clone().setY(b.base.y + b.height * 0.9), 1.4, PALETTE.smoke, 2.4, 2);
          }
          break;
        }
      }
      if (b.shake > 0) {
        b.shake = Math.max(0, b.shake - dt * 2.5);
        const s = b.shake * 0.12 * Math.min(2, b.radius / 4);
        b.outer.position.x = b.base.x + (Math.random() - 0.5) * s;
        b.outer.position.z = b.base.z + (Math.random() - 0.5) * s;
      } else {
        b.outer.position.x = b.base.x;
        b.outer.position.z = b.base.z;
      }
      b.outer.position.y = b.floats ? level - 0.35 + Math.sin(performance.now() / 900 + b.base.x) * 0.08 : b.base.y;
    }
    const grow = (group: Object3D) => {
      for (const child of [...group.children]) {
        const g = child.userData.grow as number | undefined;
        if (g === undefined) continue;
        if (child.userData.shrink) {
          const s = Math.max(0, child.scale.x - dt * 1.5);
          child.scale.setScalar(Math.max(0.001, s));
          if (s <= 0) child.removeFromParent();
          continue;
        }
        if (g < 1) {
          const ng = Math.min(1, g + dt * 1.2);
          child.userData.grow = ng;
          child.scale.setScalar(Math.max(0.001, MathUtils.smootherstep(ng, 0, 1)));
        }
      }
    };
    grow(this.world);
    grow(this.props);
    for (const child of [...this.tiles.children]) {
      if (child.userData.sink) {
        child.position.y -= dt * 0.6;
        if (child.position.y < -0.5) child.removeFromParent();
      } else if (child.position.y < 0) {
        child.position.y = Math.min(0, child.position.y + dt * 0.5);
      }
    }
  }

  private updateBeacon(dt: number): void {
    const beacon = this.beacon;
    if (!beacon) return;
    const lab = this.buildings.find((b) => b.lab && !b.retired);
    const v = this.view;
    const now = performance.now() / 1000;
    const c = new Color();
    const active = !!v && v.outcome === 'running';
    const r = v?.research ?? 0;
    if (active) {
      const [a, b, cc] = PALETTE.beacon;
      if (r < 0.5) c.set(a).lerp(new Color(b), r / 0.5);
      else c.set(b).lerp(new Color(cc), (r - 0.5) / 0.5);
    } else {
      c.set(PALETTE.beaconIdle);
    }
    beacon.mat.color.lerp(c, Math.min(1, dt * 4));
    beacon.mat.emissive.copy(beacon.mat.color);
    const speed = active ? 0.8 + r * 3 : 0.2;
    beacon.gem.rotation.y += dt * speed;
    beacon.ring.rotation.z -= dt * speed * 0.6;
    const pulse = active ? 1 + Math.sin(now * (2 + r * 6)) * 0.08 * (0.5 + r) : 1;
    beacon.group.scale.setScalar(pulse * (lab && lab.state !== 'down' ? 1 : 0.001));
    if (lab) {
      const h = lab.height * lab.inner.scale.y;
      beacon.group.position.set(lab.base.x, lab.base.y + h + 3.6 + Math.sin(now * 1.3) * 0.3, lab.base.z);
    }
  }

  // ── Navigation ───────────────────────────────────────────────

  private updateNav(): void {
    if (!this.navDirty || !this.era) return;
    this.navDirty = false;
    this.nav.setWater((x, z) => this.terrain.isWater(x, z, -0.85));
    this.nav.setBridges(BRIDGES.filter((b) => b.era <= this.era!).map((b) => b.rect));
    this.nav.setBlocked(this.buildings.filter((b) => !b.retired && !b.floats).map((b) => b.footprint));
  }

  private wanderPoint(from: Vector3, home: Vector3, radius: number, mode: NavMode): Vector3 {
    const navMode = mode === 'air' ? null : mode;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * radius;
      const x = MathUtils.clamp(home.x + Math.cos(a) * d, -MAP_HALF + 2, MAP_HALF - 2);
      const z = MathUtils.clamp(home.z + Math.sin(a) * d, -MAP_HALF + 2, MAP_HALF - 2);
      if (!navMode) return new Vector3(x, 0, z);
      if (this.nav.passable(x, z, navMode) && this.nav.clear([from.x, from.z], [x, z], navMode)) return new Vector3(x, 0, z);
    }
    return from.clone();
  }

  private route(from: Vector3, to: Vector3, mode: NavMode): Vector3[] | null {
    if (mode === 'air') return [to.clone()];
    const pts = this.nav.path(from.x, from.z, to.x, to.z, mode);
    if (!pts) return null;
    return pts.slice(1).map(([x, z]) => new Vector3(x, 0, z));
  }

  // ── Walkers ──────────────────────────────────────────────────

  private cityHome(): Vector3 {
    return new Vector3(28, 0, -2);
  }

  /** Creatures live at their lair. */
  private syncCreature(id: CreatureId, amount: number): void {
    const view = VIEWS[id];
    const cap = this.quality === 'high' ? view.cap : Math.max(1, Math.ceil(view.cap / 2));
    const want = visibleCount(amount, cap);
    const list = this.list(id);
    const alive = list.filter((w) => !w.leaving);
    if (alive.length < want) {
      const spot = LAIR_SPOTS[id];
      const home = new Vector3(spot.x, 0, spot.z);
      const roam = spot.water ? 9 : Math.max(6, spot.size * 1.4);
      for (let i = alive.length; i < want; i++) {
        const at = home.clone().add(new Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
        const w = new Walker(id, view, this.host, home, roam, at);
        this.scene.add(w.root);
        list.push(w);
        this.lairs.spawn(id);
      }
    } else if (alive.length > want) {
      for (const w of alive.slice(want)) w.dismiss();
    }
  }

  /** Humans and their animals live in the city. */
  private syncCity(id: ViewId, want: number): void {
    const view = VIEWS[id];
    const cap = this.quality === 'high' ? view.cap : Math.max(1, Math.ceil(view.cap / 2));
    want = Math.min(cap, want);
    const list = this.list(id);
    const alive = list.filter((w) => !w.leaving);
    if (alive.length < want) {
      for (let i = alive.length; i < want; i++) {
        const home = id === 'scientist' ? this.labHome() : view.human ? this.gateHome(i) : this.cityHome();
        const w = new Walker(id, view, this.host, home, id === 'scientist' ? 6 : view.human ? 9 : 16, home.clone());
        this.scene.add(w.root);
        list.push(w);
      }
    } else if (alive.length > want) {
      for (const w of alive.slice(want)) w.dismiss();
    }
  }

  private labHome(): Vector3 {
    const lab = LOTS.find((l) => l.lab)!;
    return new Vector3(lab.x + 8, 0, lab.z + 6);
  }

  /** Hunters patrol the city's edges, one gate each. */
  private gateHome(i: number): Vector3 {
    const gates = Object.values(RAID_GATES);
    const [x, z] = gates[i % gates.length]!;
    return new Vector3(x, 0, z);
  }

  private list(id: ViewId): Walker[] {
    let list = this.walkers.get(id);
    if (!list) {
      list = [];
      this.walkers.set(id, list);
    }
    return list;
  }

  private all(ids?: readonly ViewId[]): Walker[] {
    const out: Walker[] = [];
    for (const [id, list] of this.walkers) {
      if (ids && !ids.includes(id)) continue;
      for (const w of list) if (!w.leaving && w.ready) out.push(w);
    }
    return out;
  }

  /** Hunters go after whatever is being tamed; dogs tag along. */
  private directHunters(dt: number): void {
    this.huntClock -= dt;
    if (this.huntClock > 0 || !this.view) return;
    this.huntClock = 3;
    const v = this.view;
    const hunters = this.all([`hunter-${v.era}` as ViewId]);
    const prey = this.all(['wolf', 'wildcat', 'boar']).filter((w) => (v.taming[w.id as CreatureId] ?? 0) > 0.02);
    hunters.forEach((h, i) => {
      const target = prey.length && i < 2 ? prey[i % prey.length]! : null;
      h.chase(target ? () => (target.leaving ? null : target.position) : null);
    });
    this.all(['dog']).forEach((dog, i) => {
      const lead = hunters[i % Math.max(1, hunters.length)];
      dog.chase(lead ? () => (lead.leaving ? null : lead.position) : null);
    });
  }

  private scheduleAttacks(dt: number): void {
    if (!this.view || this.forest || this.view.outcome !== 'running') return;
    const rate = MathUtils.clamp(0.4 + this.view.intensity * 0.12, 0.4, 3.5);
    this.attackClock += dt * rate;
    while (this.attackClock >= 1) {
      this.attackClock -= 1;
      const idle = this.all(CREATURE_IDS).filter((w) => !w.busy);
      if (!idle.length) return;
      const w = idle[Math.floor(Math.random() * idle.length)]!;
      const standing = this.standing().filter((b) => !b.floats || w.nav !== 'land');
      if (!standing.length) continue;
      // The nearest buildings take the most: the frontier and the outposts in the wild.
      let best = standing[0]!;
      let bestD = Infinity;
      for (const b of standing) {
        const dist = Math.hypot(b.base.x - w.position.x, b.base.z - w.position.z) * (0.6 + Math.random());
        if (dist < bestD) {
          bestD = dist;
          best = b;
        }
      }
      const b = best;
      const dir = new Vector2(w.position.x - b.base.x, w.position.z - b.base.z);
      if (dir.lengthSq() < 0.01) dir.set(1, 0);
      dir.normalize();
      const reach = b.radius + VIEWS[w.id].size * 0.35;
      const point = new Vector3(b.base.x + dir.x * reach, 0, b.base.z + dir.y * reach);
      w.goAttack({
        point,
        top: b.base.y + b.height,
        onHit: (at) => {
          const hitAt = new Vector3(b.base.x, b.base.y + Math.min(b.height * 0.6, 4 + Math.random() * b.height * 0.4), b.base.z);
          hitAt.lerp(at.clone().setY(at.y + 1), 0.45);
          this.hitBuilding(b, hitAt, Math.min(2.2, 0.5 + VIEWS[w.id].size * 0.06));
        },
      });
    }
  }

  // ── Raids ────────────────────────────────────────────────────

  private syncRaid(view: SceneView): void {
    const raid = view.outcome === 'running' ? view.raid : null;
    if (raid && (!this.party || this.party.done || this.party.target !== raid.target)) this.startParty(raid.target, raid.left);
    if (!raid && this.party && !this.party.done) this.endParty((view.lairs[this.party.target] ?? 0) > 0);
  }

  private startParty(target: CreatureId, seconds: number): void {
    this.endParty(false);
    const era = this.view?.era ?? 1;
    const id = `hunter-${era}` as ViewId;
    const [gx, gz] = RAID_GATES[LAIRS[target].zone];
    const spot = LAIR_SPOTS[target];
    const goal = spot.water ? this.shoreNear(spot.x, spot.z) : new Vector3(spot.x, 0, spot.z);
    const party: Party = { target, walkers: [], done: false };
    for (let i = 0; i < 3; i++) {
      const at = new Vector3(gx + (i - 1) * 1.5, 0, gz + (i % 2) * 1.5);
      const w = new Walker(id, VIEWS[id], this.host, at, 4, at);
      this.scene.add(w.root);
      party.walkers.push(w);
      // March so the party arrives about when the core says it lands.
      const start = () => {
        if (party.done) return;
        const dist = Math.hypot(goal.x - at.x, goal.z - at.z) * 1.25;
        w.pace = MathUtils.clamp(dist / Math.max(4, seconds - 1) / VIEWS[id].speed, 0.3, 2.5);
        const off = new Vector3((i - 1) * 1.8, 0, ((i + 1) % 2) * 1.6);
        w.goTo(goal.clone().add(off), () => {
          if (!party.done) this.lairs.hit(target);
        });
      };
      setTimeout(start, 700);
    }
    this.effects.ring(new Vector3(gx, 0.3, gz), 4, PALETTE.raid);
    this.party = party;
  }

  /** The party leaves: it wrecked the lair, or it was driven off. */
  private endParty(landed: boolean): void {
    const party = this.party;
    if (!party || party.done) return;
    party.done = true;
    const [gx, gz] = RAID_GATES[LAIRS[party.target].zone];
    for (const w of party.walkers) {
      if (!w.ready) {
        w.dismiss();
        continue;
      }
      if (!landed) this.effects.puff(w.position.clone().setY(w.position.y + 1.5), 1.6, PALETTE.dust, 1.5, 0.8);
      w.pace = landed ? 1 : 1.9;
      if (!w.goTo(new Vector3(gx, 0, gz), () => w.dismiss())) w.dismiss();
      setTimeout(() => w.dismiss(), 14000);
    }
  }

  private shoreNear(x: number, z: number): Vector3 {
    const p = this.nav.nearest(x, z, 'land', 16);
    return p ? new Vector3(p[0], 0, p[1]) : new Vector3(x, 0, z);
  }

  // ── Water ────────────────────────────────────────────────────

  private waterLevel(): number {
    const v = this.view;
    if (!v) return -1.2;
    let level = v.surge ? -0.4 + Math.sin(performance.now() / 260) * 0.1 : v.tide ? -1.8 + v.tideLevel * 1.15 : -1.2;
    level = Math.max(level, this.fx.seaLevel());
    return level;
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
    this.sun.position.set(this.target.x + 60, 120, this.target.z + 70);
    this.sun.target.position.copy(this.target);
    const span = Math.min(110, (FRAMES[this.frameEra].size / 2) * this.zoom * 1.25 + 10);
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
        if (this.pinchStart > 0) this.zoom = MathUtils.clamp((this.zoomStart * this.pinchStart) / dist, 0.3, 1.4);
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
        this.zoom = MathUtils.clamp(this.zoom * (1 + e.deltaY * 0.001), 0.3, 1.4);
        this.moved = true;
      },
      { passive: false },
    );
  }

  private tap(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const raid = this.raidScreen();
    if (raid && Math.hypot(raid.x - (clientX - rect.left), raid.y - (clientY - rect.top)) < RAID_TAP_RADIUS) {
      this.onTap({ x: clientX, y: clientY, hitBuilding: false, lair: null, raid: true });
      return;
    }
    const hit = this.pick(clientX, clientY);
    const lair = hit?.lair ?? null;
    this.onTap({ x: clientX, y: clientY, hitBuilding: !!hit?.building, lair, raid: false });
    if (hit?.building) this.hitBuilding(hit.building, hit.point, 1.2);
    else if (hit && !lair) {
      this.effects.burst(hit.point, 5, 0.5);
      this.effects.ring(hit.point, 2);
    }
  }

  private pick(clientX: number, clientY: number): { point: Vector3; building: Building | null; lair: CreatureId | null } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    for (const h of this.raycaster.intersectObjects([this.world], true)) {
      if (h.object.name === 'water') continue;
      let o: Object3D | null = h.object;
      while (o && !o.userData.building && !o.userData.lair) o = o.parent;
      const b = (o?.userData.building as Building | undefined) ?? null;
      if (b && b.state !== 'ok') continue;
      const lair = Lairs.lairOf(h.object);
      return { point: h.point.clone(), building: b, lair };
    }
    return null;
  }

  // ── Frame ────────────────────────────────────────────────────

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.terrain.update(dt);
    this.decor.update();
    this.updateNav();
    this.scheduleAttacks(dt);
    this.directHunters(dt);
    for (const list of this.walkers.values()) {
      for (const w of list) w.update(dt);
      for (let i = list.length - 1; i >= 0; i--) if (list[i]!.removed) list.splice(i, 1);
    }
    if (this.party) {
      for (const w of this.party.walkers) w.update(dt);
      this.party.walkers = this.party.walkers.filter((w) => !w.removed);
      if (this.party.done && !this.party.walkers.length) this.party = null;
    }
    if (this.view?.rampage && Math.random() < dt * 4) this.pulse('rampage');
    this.updateBuildings(dt);
    this.updateBeacon(dt);
    this.lairs.update(dt);
    this.fx.update(dt);
    this.terrain.setWaterLevel(this.waterLevel(), !!this.view?.surge, dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    if (this.composer && this.quality === 'high') this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    void this.gtao;
  }
}
