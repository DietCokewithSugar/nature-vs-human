import {
  Box3,
  BoxGeometry,
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
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { CREATURE_BY_ID, CREATURE_IDS, DOMESTICS, type CreatureId, type DomesticId, type EraId } from '../core/index.ts';
import { instantiate } from './assets.ts';
import { VIEWS, Walker, visibleCount, type ViewId, type Zone } from './creatures.ts';
import { Effects } from './effects.ts';
import { DISTRICTS, footprint, type DistrictDef, type Placement, type Rect } from './layout.ts';
import { GROUND, PALETTE } from './palette.ts';

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
}

export interface TapInfo {
  x: number;
  y: number;
  hitBuilding: boolean;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type BuildingState = 'ok' | 'falling' | 'down' | 'rising';

interface Building {
  district: EraId;
  outer: Group;
  inner: Group;
  base: Vector3;
  world: Vector3;
  height: number;
  radius: number;
  hp: number;
  state: BuildingState;
  t: number;
  shake: number;
  tilt: Vector2;
  floats: boolean;
  lab: boolean;
  tree: Group | null;
}

interface Beacon {
  group: Group;
  gem: Mesh;
  ring: Mesh;
  mat: MeshStandardMaterial;
}

interface District {
  def: DistrictDef;
  group: Group;
  reveal: number;
  buildings: Building[];
  blocked: Rect[];
  water?: Mesh;
  beacon?: Beacon;
}

const FLOATING = new Set(['fishing-boat', 'barge', 'river-boat']);
const SEABED_Y = -3;
const BOARD_H = 4;
const TAP_SLOP = 7;

/** The era a creature lives in, i.e. which board it roams. */
function homeEra(id: ViewId, newest: EraId): EraId {
  if (id in CREATURE_BY_ID) return CREATURE_BY_ID[id as CreatureId].era;
  return newest;
}

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

/**
 * Presentation layer: reads a SceneView every tick and renders the boards.
 * Never mutates game state; taps are reported through `onTap`.
 */
export class CityScene {
  readonly renderer: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.5, 1400);
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private sun: DirectionalLight;
  private effects: Effects;
  private districts = new Map<EraId, District>();
  private walkers = new Map<ViewId, Walker[]>();
  private raycaster = new Raycaster();
  private view: SceneView | null = null;
  private attackClock = 0;
  private huntClock = 0;
  private lastTime = performance.now();
  private quality: 'high' | 'low' = 'high';
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private forest = false;

  // Camera rig
  private focus: EraId = 1;
  private target = new Vector3();
  private targetGoal = new Vector3();
  private azimuth = 0.62;
  private polar = 0.98;
  private zoom = 1;
  private distance = 80;
  private fitDistance = 80;

  // Pointer
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinchStart = 0;
  private zoomStart = 1;
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
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 300;
    this.scene.add(this.sun, this.sun.target);
    this.effects = new Effects(this.scene);

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
        gtao.blendIntensity = 0.85;
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

  setInsets(insets: Insets): void {
    this.insets = insets;
    this.resize();
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
    const fw = Math.max(1, w - this.insets.left - this.insets.right);
    const fh = Math.max(1, h - this.insets.top - this.insets.bottom);
    const cx = this.insets.left + fw / 2;
    const cy = this.insets.top + fh / 2;
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.camera.updateProjectionMatrix();
    this.updateFit(fw, fh);
  }

  private updateFit(fw: number, fh: number): void {
    const def = DISTRICTS[this.focus];
    const fullH = this.canvas.clientHeight || window.innerHeight;
    const halfTan = Math.tan(MathUtils.degToRad(this.camera.fov) / 2);
    const hTan = (halfTan * fw) / fullH;
    const vTan = (halfTan * fh) / fullH;
    const diag = Math.hypot(def.width, def.depth);
    const byWidth = ((diag / 2) * 1.04) / hTan;
    const tall = (diag * Math.cos(this.polar) + def.camera.height * Math.sin(this.polar)) / 2;
    const byHeight = (tall * 1.06) / vTan;
    this.fitDistance = Math.max(byWidth, byHeight);
  }

  sync(view: SceneView): void {
    const prev = this.view;
    this.view = view;
    for (let e = 1; e <= view.era; e++) this.ensureDistrict(e as EraId);
    if (!prev || view.era > prev.era) this.flyTo(view.era);
    if (view.outcome === 'running') {
      for (const id of CREATURE_IDS) this.syncWalkers(id, view.amounts[id] ?? 0);
    } else {
      for (const id of CREATURE_IDS) this.syncWalkers(id, 0);
    }
    for (const [id, d] of Object.entries(DOMESTICS) as [DomesticId, (typeof DOMESTICS)[DomesticId]][]) {
      this.syncWalkers(id, view.defected[d.from] ?? 0);
    }
    for (let e = 1; e <= 4; e++) {
      const era = e as EraId;
      const here = this.districts.has(era);
      const extra = era === view.era ? Math.floor(view.research * 3) : 0;
      this.syncWalkers(`hunter-${era}` as ViewId, 0, era, here ? 1 + extra : 0);
    }
    this.syncWalkers('scientist', 0, view.era, view.era >= 3 && view.outcome === 'running' ? 1 : 0);
  }

  flyTo(era: EraId): void {
    if (!this.districts.has(era)) return;
    this.focus = era;
    const def = DISTRICTS[era];
    this.targetGoal.set(def.ox, def.camera.targetY, def.oz);
    this.zoom = 1;
    this.resize();
  }

  get focusedEra(): EraId {
    return this.focus;
  }

  /** A new run: every board rebuilds, every walker leaves. */
  reset(): void {
    this.setForest(false);
    for (const d of this.districts.values()) {
      for (const b of d.buildings) {
        if (b.state !== 'ok') {
          b.state = 'rising';
          b.t = 0;
        }
        b.hp = 100;
      }
    }
    for (const list of this.walkers.values()) for (const w of list) w.dismiss();
    this.view = null;
  }

  setForest(on: boolean): void {
    if (this.forest === on) return;
    this.forest = on;
    for (const d of this.districts.values()) {
      for (const b of d.buildings) {
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
  }

  /** Visual feedback for an active skill or a human move. */
  pulse(kind: 'countermeasure' | 'sabotage' | 'rescue' | 'rampage' | 'surge'): void {
    const d = this.districts.get(this.view?.era ?? this.focus);
    if (!d) return;
    const lab = d.buildings.find((b) => b.lab);
    if (kind === 'countermeasure' && lab) {
      this.effects.ring(lab.world.clone().setY(0.2), 18, PALETTE.beacon[2]);
      this.effects.ring(lab.world.clone().setY(0.2), 10, PALETTE.beacon[1]);
    }
    if (kind === 'sabotage' && lab) this.hitBuilding(lab, lab.world.clone().setY(lab.height * 0.6), 4);
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
    const zone = this.zoneFor(domestic, CREATURE_BY_ID[id].era);
    for (const w of list) {
      this.effects.puff(w.position.clone().setY(1), 2.4, PALETTE.dust, 1.5, 1.2);
      if (zone && tame.length < VIEWS[domestic].cap) {
        const t = new Walker(domestic, VIEWS[domestic], zone, w.position.clone());
        this.scene.add(t.root);
        tame.push(t);
      }
      w.dismiss();
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }

  // ── Districts ────────────────────────────────────────────────

  private ensureDistrict(era: EraId): void {
    if (this.districts.has(era)) return;
    const def = DISTRICTS[era];
    const group = new Group();
    group.position.set(def.ox, 0, def.oz);
    this.scene.add(group);
    const district: District = { def, group, reveal: 0, buildings: [], blocked: [] };
    this.districts.set(era, district);
    this.buildGround(district);
    for (const p of def.buildings) void this.addBuilding(district, p);
    for (const p of def.props) void this.addProp(district, p);
  }

  private buildGround(d: District): void {
    const { def, group } = d;
    const side = new MeshLambertMaterial({ color: PALETTE.boardSide });
    const top = new MeshLambertMaterial({ color: GROUND[def.base] });
    const slab = (w: number, h: number, depth: number, y: number, z: number, mat = side) => {
      const m = new Mesh(new BoxGeometry(w, h, depth), mat);
      m.position.set(0, y, z);
      m.receiveShadow = true;
      group.add(m);
      return m;
    };
    if (def.water) {
      const landDepth = def.water.z0 + def.depth / 2 - 1;
      const landZ = -def.depth / 2 + landDepth / 2;
      slab(def.width, BOARD_H, landDepth, -BOARD_H / 2, landZ);
      slab(def.width, 0.1, landDepth, 0.0, landZ, top);
      const seaDepth = def.depth - landDepth;
      const seaZ = def.depth / 2 - seaDepth / 2;
      const bedH = BOARD_H + SEABED_Y;
      slab(def.width, bedH, seaDepth, SEABED_Y - bedH / 2, seaZ);
      slab(def.width, 0.05, seaDepth, SEABED_Y, seaZ, new MeshLambertMaterial({ color: PALETTE.seabed }));
      const water = new Mesh(
        new BoxGeometry(def.width, 1, seaDepth),
        new MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.72, depthWrite: false }),
      );
      water.position.set(0, 0, seaZ);
      water.renderOrder = 2;
      group.add(water);
      d.water = water;
    } else {
      slab(def.width, BOARD_H, def.depth, -BOARD_H / 2, 0);
      slab(def.width, 0.1, def.depth, 0, 0, top);
    }
    def.ground.forEach((t, i) => {
      const w = t.x1 - t.x0;
      const dd = t.z1 - t.z0;
      const h = t.h ?? 0.12;
      const m = new Mesh(new BoxGeometry(w, h, dd), new MeshLambertMaterial({ color: GROUND[t.color] }));
      m.position.set((t.x0 + t.x1) / 2, (t.y ?? 0) - h / 2 + 0.1 + i * 0.012, (t.z0 + t.z1) / 2);
      m.receiveShadow = true;
      group.add(m);
    });
  }

  private async addBuilding(d: District, p: Placement & { lab?: boolean }): Promise<void> {
    const prep = await instantiate(p.model, p.size, p.by);
    const outer = new Group();
    const inner = prep.object;
    outer.add(inner);
    outer.position.set(p.x, 0, p.z);
    d.group.add(outer);
    const size = new Box3().setFromObject(inner).getSize(new Vector3());
    inner.rotation.y = ((p.rot ?? 0) * Math.PI) / 2;
    d.blocked.push(footprint(p, { w: size.x, d: size.z }, 0.8));
    const { ox, oz } = d.def;
    const b: Building = {
      district: d.def.era,
      outer,
      inner,
      base: new Vector3(p.x, 0, p.z),
      world: new Vector3(p.x + ox, 0, p.z + oz),
      height: prep.height,
      radius: Math.max(size.x, size.z) / 2,
      hp: 100,
      state: 'rising',
      t: -Math.random() * 0.8,
      shake: 0,
      tilt: new Vector2(),
      floats: FLOATING.has(p.model),
      lab: !!p.lab,
      tree: null,
    };
    outer.userData.building = b;
    inner.scale.y = 0.001;
    d.buildings.push(b);
    if (b.lab) d.beacon = this.makeBeacon(d, b);
  }

  private makeBeacon(d: District, b: Building): Beacon {
    const group = new Group();
    const mat = new MeshStandardMaterial({ color: PALETTE.beacon[0], emissive: PALETTE.beacon[0], emissiveIntensity: 0.6, flatShading: true });
    const gem = new Mesh(new OctahedronGeometry(1.1, 0), mat);
    const ring = new Mesh(new TorusGeometry(2, 0.12, 6, 32), mat);
    ring.rotation.x = Math.PI / 2;
    group.add(gem, ring);
    group.position.set(b.base.x, b.height + 3.2, b.base.z);
    d.group.add(group);
    return { group, gem, ring, mat };
  }

  private async addProp(d: District, p: Placement): Promise<void> {
    const prep = await instantiate(p.model, p.size, p.by);
    prep.object.rotation.y = ((p.rot ?? 0) * Math.PI) / 2;
    prep.object.position.set(p.x, 0, p.z);
    prep.object.scale.setScalar(0.001);
    prep.object.userData.grow = 0;
    d.group.add(prep.object);
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
    b.outer.parent?.add(tree);
    b.tree = tree;
  }

  // ── Walkers ──────────────────────────────────────────────────

  private zoneFor(id: ViewId, era: EraId): Zone | null {
    const d = this.districts.get(era);
    if (!d) return null;
    const view = VIEWS[id];
    const local = view.zone === 'water' && d.def.water ? d.def.water : d.def.walk;
    const { ox, oz } = d.def;
    const shift = (r: Rect): Rect => ({ x0: r.x0 + ox, x1: r.x1 + ox, z0: r.z0 + oz, z1: r.z1 + oz });
    return {
      area: shift(local),
      blocked: view.mode === 'walk' ? d.blocked.map(shift) : [],
      waterLevel: () => this.waterLevel(),
    };
  }

  /** amount: owned units (shown on a log scale). exact: show exactly this many (people). */
  private syncWalkers(id: ViewId, amount: number, era?: EraId, exact?: number): void {
    const view = VIEWS[id];
    const cap = this.quality === 'high' ? view.cap : Math.max(1, Math.ceil(view.cap / 2));
    const want = exact !== undefined ? Math.min(cap, exact) : visibleCount(amount, cap);
    let list = this.walkers.get(id);
    if (!list) {
      list = [];
      this.walkers.set(id, list);
    }
    const alive = list.filter((w) => !w.leaving);
    if (alive.length < want) {
      const zone = this.zoneFor(id, era ?? homeEra(id, this.view?.era ?? 1));
      if (!zone) return;
      for (let i = alive.length; i < want; i++) {
        const w = new Walker(id, view, zone);
        this.scene.add(w.root);
        list.push(w);
      }
    } else if (alive.length > want) {
      for (const w of alive.slice(want)) w.dismiss();
    }
  }

  private all(ids?: ViewId[]): Walker[] {
    const out: Walker[] = [];
    for (const [id, list] of this.walkers) {
      if (ids && !ids.includes(id)) continue;
      for (const w of list) if (!w.leaving && w.ready) out.push(w);
    }
    return out;
  }

  /** Hunters go after whatever is being tamed on their board; dogs tag along. */
  private directHunters(dt: number): void {
    this.huntClock -= dt;
    if (this.huntClock > 0 || !this.view) return;
    this.huntClock = 3;
    const v = this.view;
    for (let e = 1; e <= 4; e++) {
      const hunters = this.all([`hunter-${e}` as ViewId]);
      if (!hunters.length) continue;
      const prey = this.all(['wolf', 'wildcat', 'boar']).filter((w) => {
        const id = w.id as CreatureId;
        return CREATURE_BY_ID[id].era === e && (v.taming[id] ?? 0) > 0.02;
      });
      hunters.forEach((h, i) => {
        const target = prey.length && i < 2 ? prey[i % prey.length]! : null;
        h.chase(target ? () => (target.leaving ? null : target.position) : null);
      });
    }
    const leaders = this.all([`hunter-${v.era}` as ViewId]);
    this.all(['dog']).forEach((dog, i) => {
      const lead = leaders[i % Math.max(1, leaders.length)];
      dog.chase(lead ? () => (lead.leaving ? null : lead.position) : null);
    });
  }

  private scheduleAttacks(dt: number): void {
    if (!this.view || this.forest || this.view.outcome !== 'running') return;
    const rate = MathUtils.clamp(0.4 + this.view.intensity * 0.12, 0.4, 3.5);
    this.attackClock += dt * rate;
    while (this.attackClock >= 1) {
      this.attackClock -= 1;
      const idle = this.all(CREATURE_IDS as unknown as ViewId[]).filter((w) => !w.busy);
      if (!idle.length) return;
      const w = idle[Math.floor(Math.random() * idle.length)]!;
      const d = this.districts.get(CREATURE_BY_ID[w.id as CreatureId].era);
      if (!d) continue;
      const standing = d.buildings.filter((b) => b.state === 'ok');
      if (!standing.length) continue;
      let best = standing[0]!;
      let bestD = Infinity;
      for (const b of standing) {
        const dist = Math.hypot(b.world.x - w.position.x, b.world.z - w.position.z) * (0.6 + Math.random());
        if (dist < bestD) {
          bestD = dist;
          best = b;
        }
      }
      const b = best;
      const dir = new Vector2(w.position.x - b.world.x, w.position.z - b.world.z);
      if (dir.lengthSq() < 0.01) dir.set(1, 0);
      dir.normalize();
      const reach = b.radius + VIEWS[w.id].size * 0.35;
      const point = new Vector3(b.world.x + dir.x * reach, 0, b.world.z + dir.y * reach);
      if (VIEWS[w.id].zone === 'water' && d.def.water) point.z = Math.max(point.z, d.def.water.z0 + d.def.oz + 0.5);
      w.goAttack({
        point,
        top: b.height,
        onHit: (at) => {
          const hitAt = new Vector3(b.world.x, Math.min(b.height * 0.6, 4 + Math.random() * b.height * 0.4), b.world.z);
          hitAt.lerp(at, 0.45);
          this.hitBuilding(b, hitAt, Math.min(2.2, 0.5 + VIEWS[w.id].size * 0.06));
        },
      });
    }
  }

  // ── Buildings ────────────────────────────────────────────────

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
    const at = b.world.clone().setY(0.5);
    this.effects.dust(at, Math.max(3, b.radius * 1.2), 10);
    this.effects.burst(at.clone().setY(b.height * 0.4), 18, 1.4);
    this.effects.ring(at, b.radius * 1.8, PALETTE.dust);
  }

  private updateBuildings(dt: number): void {
    const level = this.waterLevel();
    for (const d of this.districts.values()) {
      for (const b of d.buildings) {
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
              this.effects.puff(b.world.clone().setY(b.height * 0.9), 1.4, PALETTE.smoke, 2.4, 2);
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
        b.outer.position.y = b.floats ? level - 0.35 + Math.sin(performance.now() / 900 + b.base.x) * 0.08 : 0;
      }
      for (const child of d.group.children) {
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
    }
  }

  private updateBeacons(dt: number): void {
    const v = this.view;
    const now = performance.now() / 1000;
    const c = new Color();
    for (const d of this.districts.values()) {
      const beacon = d.beacon;
      if (!beacon) continue;
      const active = !!v && d.def.era === v.era && v.outcome === 'running';
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
      beacon.group.scale.setScalar(pulse);
      beacon.group.position.y = (d.buildings.find((b) => b.lab)?.height ?? 8) + 3.2 + Math.sin(now * 1.3) * 0.3;
    }
  }

  // ── Water ────────────────────────────────────────────────────

  private waterLevel(): number {
    const v = this.view;
    if (!v) return -1.6;
    if (v.surge) return 0.4 + Math.sin(performance.now() / 260) * 0.15;
    const level = v.tide ? v.tideLevel : 0.35;
    return -1.8 + level * 1.4;
  }

  private updateWater(dt: number): void {
    const top = this.waterLevel();
    const h = Math.max(0.1, top - SEABED_Y);
    for (const d of this.districts.values()) {
      const water = d.water;
      if (!water) continue;
      water.scale.y = MathUtils.damp(water.scale.y, h, 3, dt);
      water.position.y = SEABED_Y + water.scale.y / 2;
      const mat = water.material as MeshLambertMaterial;
      mat.color.lerp(new Color(this.view?.surge ? PALETTE.waterSurge : PALETTE.water), Math.min(1, dt * 3));
    }
  }

  // ── Camera & input ───────────────────────────────────────────

  private updateCamera(dt: number): void {
    this.target.x = MathUtils.damp(this.target.x, this.targetGoal.x, 2.6, dt);
    this.target.y = MathUtils.damp(this.target.y, this.targetGoal.y, 2.6, dt);
    this.target.z = MathUtils.damp(this.target.z, this.targetGoal.z, 2.6, dt);
    this.distance = MathUtils.damp(this.distance, this.fitDistance * this.zoom, 3, dt);
    const r = this.distance;
    const sp = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + r * sp * Math.sin(this.azimuth),
      this.target.y + r * Math.cos(this.polar),
      this.target.z + r * sp * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
    this.sun.position.set(this.target.x + 45, 90, this.target.z + 55);
    this.sun.target.position.copy(this.target);
    const def = DISTRICTS[this.focus];
    const span = Math.max(def.width, def.depth) * 0.95;
    const sc = this.sun.shadow.camera;
    if (sc.right !== span) {
      sc.left = -span;
      sc.right = span;
      sc.top = span;
      sc.bottom = -span;
      sc.updateProjectionMatrix();
    }
  }

  private bindPointer(): void {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.pointers.size === 1) this.dragged = false;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y);
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
        if (this.pinchStart > 0) this.zoom = MathUtils.clamp((this.zoomStart * this.pinchStart) / dist, 0.55, 1.5);
        return;
      }
      if (!this.dragged && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > TAP_SLOP) this.dragged = true;
      if (this.dragged) {
        this.azimuth = MathUtils.clamp(this.azimuth - dx * 0.006, -0.5, 1.7);
        this.polar = MathUtils.clamp(this.polar - dy * 0.004, 0.6, 1.2);
      }
    });
    const end = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!p || this.dragged || this.pointers.size > 0) return;
      if (performance.now() - p.t > 600) return;
      const hit = this.pick(e.clientX, e.clientY);
      this.onTap({ x: e.clientX, y: e.clientY, hitBuilding: !!hit?.building });
      if (hit?.building) this.hitBuilding(hit.building, hit.point, 1.2);
      else if (hit) {
        this.effects.burst(hit.point, 5, 0.5);
        this.effects.ring(hit.point, 2);
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = MathUtils.clamp(this.zoom * (1 + e.deltaY * 0.001), 0.55, 1.5);
      },
      { passive: false },
    );
  }

  private pick(clientX: number, clientY: number): { point: Vector3; building: Building | null } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const roots: Object3D[] = [];
    for (const d of this.districts.values()) roots.push(d.group);
    for (const h of this.raycaster.intersectObjects(roots, true)) {
      let o: Object3D | null = h.object;
      while (o && !o.userData.building) o = o.parent;
      const b = (o?.userData.building as Building | undefined) ?? null;
      if (b && b.state !== 'ok') continue;
      return { point: h.point.clone(), building: b };
    }
    return null;
  }

  // ── Frame ────────────────────────────────────────────────────

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    for (const d of this.districts.values()) {
      if (d.reveal < 1) {
        d.reveal = Math.min(1, d.reveal + dt * 1.2);
        const k = MathUtils.smootherstep(d.reveal, 0, 1);
        d.group.position.y = (1 - k) * -12;
        d.group.scale.setScalar(0.85 + 0.15 * k);
      }
    }
    this.scheduleAttacks(dt);
    this.directHunters(dt);
    for (const list of this.walkers.values()) {
      for (const w of list) w.update(dt);
      for (let i = list.length - 1; i >= 0; i--) if (list[i]!.removed) list.splice(i, 1);
    }
    if (this.view?.rampage && Math.random() < dt * 4) this.pulse('rampage');
    this.updateBuildings(dt);
    this.updateBeacons(dt);
    this.updateWater(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    if (this.composer && this.quality === 'high') this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    void this.gtao;
  }
}
