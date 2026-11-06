import {
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  NeutralToneMapping,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CREATURE_IDS, type CreatureId, type EraId } from '../core/index.ts';
import { instantiate } from './assets.ts';
import { VIEWS, Walker, visibleCount, type ViewId, type Zone } from './creatures.ts';
import { Effects } from './effects.ts';
import { DISTRICTS, footprint, type DistrictDef, type GroundTile, type Placement, type Rect } from './layout.ts';
import { PALETTE } from './palette.ts';

export interface SceneView {
  era: EraId;
  amounts: Record<CreatureId, number>;
  queens: number;
  bredInsects: number;
  tide: boolean;
  tideLevel: number;
  surge: boolean;
  /** log10 of income per second; drives how often creatures attack. */
  intensity: number;
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
  /** Position inside the district group. */
  base: Vector3;
  /** Same point in world space. */
  world: Vector3;
  rect: Rect;
  height: number;
  radius: number;
  hp: number;
  state: BuildingState;
  t: number;
  shake: number;
  tilt: Vector2;
  floats: boolean;
  tree: Group | null;
}

interface District {
  def: DistrictDef;
  group: Group;
  reveal: number;
  buildings: Building[];
  blocked: Rect[];
  water?: Mesh;
}

const FLOATING = new Set(['fishing-boat', 'barge', 'sailboat']);
const SEABED_Y = -3;
const BOARD_H = 4;
const TAP_SLOP = 7;

/**
 * Presentation layer: reads a SceneView every frame and renders the city.
 * It never mutates game state; taps are reported through `onTap`.
 */
export class CityScene {
  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.5, 1200);
  private sun: DirectionalLight;
  private effects: Effects;
  private districts = new Map<EraId, District>();
  private walkers = new Map<ViewId, Walker[]>();
  private trail: InstancedMesh;
  private trailCount = 0;
  private trailT = 0;
  private tmp = new Object3D();
  private raycaster = new Raycaster();
  private view: SceneView | null = null;
  private attackClock = 0;
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

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.type = PCFShadowMap;

    const hemi = new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 2.2);
    this.scene.add(hemi);
    this.sun = new DirectionalLight(PALETTE.sun, 2.6);
    this.sun.position.set(40, 80, 50);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = -75;
    sc.right = 75;
    sc.top = 75;
    sc.bottom = -75;
    sc.near = 1;
    sc.far = 260;
    this.scene.add(this.sun, this.sun.target);

    this.effects = new Effects(this.scene);

    const trailGeo = new BoxGeometry(0.26, 0.14, 0.5);
    const trailMat = new MeshLambertMaterial({ color: PALETTE.trail });
    this.trail = new InstancedMesh(trailGeo, trailMat, 240);
    this.trail.instanceMatrix.setUsage(DynamicDrawUsage);
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);

    this.bindPointer();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ── Public API ───────────────────────────────────────────────

  setQuality(q: 'high' | 'low'): void {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === 'high';
    this.sun.castShadow = q === 'high';
    this.resize();
  }

  /** Portion of the canvas covered by UI; the camera frames the free area. */
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
    // The free area is a sub-window of the full frustum.
    const hTan = (halfTan * fw) / fullH;
    const vTan = (halfTan * fh) / fullH;
    // Seen from three-quarters, the board diagonal must fit across...
    const diag = Math.hypot(def.width, def.depth);
    const byWidth = ((diag / 2) * 1.04) / hTan;
    // ...and the foreshortened board plus its tallest building must fit vertically.
    const tall = (diag * Math.cos(this.polar) + def.camera.height * Math.sin(this.polar)) / 2;
    const byHeight = (tall * 1.06) / vTan;
    this.fitDistance = Math.max(byWidth, byHeight);
  }

  /** Called every frame by the shell with the latest game snapshot. */
  sync(view: SceneView): void {
    const prev = this.view;
    this.view = view;
    for (let e = 1; e <= view.era; e++) this.ensureDistrict(e as EraId);
    if (!prev || view.era > prev.era) this.flyTo(view.era);
    for (const id of CREATURE_IDS) this.syncWalkers(id, view.amounts[id] ?? 0);
    this.syncWalkers('queen', view.queens > 0 ? view.queens * 10 : 0);
    this.trailCount = this.districts.has(1) ? Math.min(240, Math.floor(Math.log10(view.bredInsects + 1) * 34)) : 0;
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

  /** Visual hit where the player tapped. */
  tapEffect(x: number, y: number): void {
    const hit = this.pick(x, y);
    if (!hit) return;
    if (hit.building) this.hitBuilding(hit.building, hit.point, 1.4);
    else {
      this.effects.burst(hit.point, 6, 0.6);
      this.effects.ring(hit.point, 2);
    }
  }

  /** Evolution: the city rebuilds, every creature leaves. */
  rebuildAll(): void {
    for (const d of this.districts.values()) {
      for (const b of d.buildings) {
        if (b.state !== 'ok') {
          b.state = 'rising';
          b.t = 0;
        }
        b.hp = 100;
      }
    }
  }

  /** Ending: buildings fall and trees take over. */
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
            const tree = b.tree;
            b.tree = null;
            tree.userData.shrink = true;
          }
          b.state = 'rising';
          b.t = -Math.random() * 1.5;
          b.hp = 100;
        }
      }
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

  private tileMaterial(color: GroundTile['color']): MeshLambertMaterial {
    return new MeshLambertMaterial({ color: PALETTE[color] });
  }

  private buildGround(d: District): void {
    const { def, group } = d;
    const side = new MeshLambertMaterial({ color: PALETTE.boardSide });
    if (def.water) {
      const landDepth = def.water.z0 + def.depth / 2 - 2;
      const land = new Mesh(new BoxGeometry(def.width, BOARD_H, landDepth), side);
      land.position.set(0, -BOARD_H / 2, -def.depth / 2 + landDepth / 2);
      land.receiveShadow = true;
      group.add(land);
      const seaDepth = def.depth - landDepth;
      const bedH = BOARD_H + SEABED_Y;
      const bed = new Mesh(new BoxGeometry(def.width, bedH, seaDepth), side);
      bed.position.set(0, SEABED_Y - bedH / 2, def.depth / 2 - seaDepth / 2);
      group.add(bed);
      const bedTop = new Mesh(new BoxGeometry(def.width, 0.05, seaDepth), new MeshLambertMaterial({ color: PALETTE.seabed }));
      bedTop.position.set(0, SEABED_Y, def.depth / 2 - seaDepth / 2);
      bedTop.receiveShadow = true;
      group.add(bedTop);
      const water = new Mesh(
        new BoxGeometry(def.width, 1, seaDepth),
        new MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.72, depthWrite: false }),
      );
      water.position.set(0, 0, def.depth / 2 - seaDepth / 2);
      water.renderOrder = 2;
      group.add(water);
      d.water = water;
    } else {
      const base = new Mesh(new BoxGeometry(def.width, BOARD_H, def.depth), side);
      base.position.y = -BOARD_H / 2;
      base.receiveShadow = true;
      group.add(base);
    }
    def.ground.forEach((t, i) => {
      const w = t.x1 - t.x0;
      const dd = t.z1 - t.z0;
      const h = t.h ?? 0.12;
      const m = new Mesh(new BoxGeometry(w, h, dd), this.tileMaterial(t.color));
      m.position.set((t.x0 + t.x1) / 2, (t.y ?? 0) - h / 2 + 0.06 + i * 0.012, (t.z0 + t.z1) / 2);
      m.receiveShadow = true;
      group.add(m);
    });
    // Lane markings on roads
    const lineMat = new MeshLambertMaterial({ color: PALETTE.roadLine });
    for (const t of def.ground) {
      if (t.color !== 'road' && t.color !== 'asphalt') continue;
      const horizontal = t.x1 - t.x0 > t.z1 - t.z0;
      const len = horizontal ? t.x1 - t.x0 : t.z1 - t.z0;
      for (let s = 2; s < len - 2; s += 4) {
        const dash = new Mesh(new BoxGeometry(horizontal ? 1.8 : 0.22, 0.04, horizontal ? 0.22 : 1.8), lineMat);
        const cx = horizontal ? t.x0 + s : (t.x0 + t.x1) / 2;
        const cz = horizontal ? (t.z0 + t.z1) / 2 : t.z0 + s;
        dash.position.set(cx, 0.2 + (t.y ?? 0), cz);
        group.add(dash);
      }
    }
  }

  private async addBuilding(d: District, p: Placement): Promise<void> {
    const prep = await instantiate(p.model, p.size, p.by);
    const outer = new Group();
    const inner = prep.object;
    inner.rotation.y = ((p.rot ?? 0) * Math.PI) / 2;
    outer.add(inner);
    const floats = FLOATING.has(p.model);
    outer.position.set(p.x, 0, p.z);
    d.group.add(outer);
    const size = new Vector3();
    // Footprint from the normalised object (before rotation).
    inner.rotation.y = 0;
    inner.updateMatrixWorld(true);
    new Box3().setFromObject(inner).getSize(size);
    inner.rotation.y = ((p.rot ?? 0) * Math.PI) / 2;
    const local = footprint(p, { w: size.x, d: size.z });
    const { ox, oz } = d.def;
    const world: Rect = { x0: local.x0 + ox, x1: local.x1 + ox, z0: local.z0 + oz, z1: local.z1 + oz };
    d.blocked.push(footprint(p, { w: size.x, d: size.z }, 0.8));
    const b: Building = {
      district: d.def.era,
      outer,
      inner,
      base: new Vector3(p.x, 0, p.z),
      world: new Vector3(p.x + ox, 0, p.z + oz),
      rect: world,
      height: prep.height,
      radius: Math.max(size.x, size.z) / 2,
      hp: 100,
      state: 'rising',
      t: -Math.random() * 0.8,
      shake: 0,
      tilt: new Vector2(),
      floats,
      tree: null,
    };
    outer.userData.building = b;
    inner.scale.y = 0.001;
    d.buildings.push(b);
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
    const kinds = ['tree-oak', 'tree-broadleaf', 'tree-pine', 'tree-birch'];
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

  // ── Creatures ────────────────────────────────────────────────

  private zoneFor(id: ViewId): Zone | null {
    const era: EraId = id === 'queen' ? 1 : (Math.floor(CREATURE_IDS.indexOf(id) / 5) + 1) as EraId;
    const d = this.districts.get(era);
    if (!d) return null;
    const view = VIEWS[id];
    const local = view.zone === 'water' && d.def.water ? d.def.water : d.def.walk;
    const { ox, oz } = d.def;
    const shift = (r: Rect): Rect => ({ x0: r.x0 + ox, x1: r.x1 + ox, z0: r.z0 + oz, z1: r.z1 + oz });
    const area = shift(local);
    const blocked = view.mode === 'walk' ? d.blocked.map(shift) : [];
    return { area, blocked, waterLevel: () => this.waterLevel() };
  }

  private syncWalkers(id: ViewId, amount: number): void {
    const view = VIEWS[id];
    const cap = this.quality === 'high' ? view.cap : Math.max(1, Math.ceil(view.cap / 2));
    const want = id === 'queen' ? Math.min(cap, this.view?.queens ?? 0) : visibleCount(amount, cap);
    let list = this.walkers.get(id);
    if (!list) {
      list = [];
      this.walkers.set(id, list);
    }
    const alive = list.filter((w) => !w.leaving);
    if (alive.length < want) {
      const zone = this.zoneFor(id);
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

  private allWalkers(): Walker[] {
    const out: Walker[] = [];
    for (const list of this.walkers.values()) for (const w of list) if (!w.removed) out.push(w);
    return out;
  }

  private scheduleAttacks(dt: number): void {
    if (!this.view || this.forest) return;
    const rate = MathUtils.clamp(0.4 + this.view.intensity * 0.12, 0.4, 3.5);
    this.attackClock += dt * rate;
    while (this.attackClock >= 1) {
      this.attackClock -= 1;
      const idle = this.allWalkers().filter((w) => w.ready && !w.busy && w.id !== 'queen');
      if (!idle.length) return;
      const w = idle[Math.floor(Math.random() * idle.length)]!;
      const era: EraId = (Math.floor(CREATURE_IDS.indexOf(w.id as CreatureId) / 5) + 1) as EraId;
      const d = this.districts.get(era);
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
      const { x: bx, z: bz } = b.world;
      const dir = new Vector2(w.position.x - bx, w.position.z - bz);
      if (dir.lengthSq() < 0.01) dir.set(1, 0);
      dir.normalize();
      const reach = b.radius + VIEWS[w.id].size * 0.35;
      const point = new Vector3(bx + dir.x * reach, 0, bz + dir.y * reach);
      if (VIEWS[w.id].zone === 'water') {
        point.z = Math.max(point.z, (d.def.water?.z0 ?? 0) + d.def.oz + 0.5);
      }
      w.goAttack({
        point,
        top: b.height,
        onHit: (at) => {
          const hitAt = new Vector3(bx, Math.min(b.height * 0.6, 4 + Math.random() * b.height * 0.4), bz);
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
    const at = new Vector3(b.world.x, 0.5, b.world.z);
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
              const at = new Vector3(b.world.x, b.height * 0.9, b.world.z);
              this.effects.puff(at, 1.4, PALETTE.smoke, 2.4, 2);
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
        b.outer.position.y = b.floats ? level - 0.4 + Math.sin(performance.now() / 900 + b.base.x) * 0.08 : 0;
      }
      // Props and trees grow in / out.
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

  // ── Water & trail ────────────────────────────────────────────

  private waterLevel(): number {
    const v = this.view;
    if (!v) return -1.6;
    if (v.surge) return 0.4 + Math.sin(performance.now() / 260) * 0.15;
    const level = v.tide ? v.tideLevel : 0.35;
    return -1.8 + level * 1.4;
  }

  private updateWater(dt: number): void {
    const d = this.districts.get(2);
    if (!d?.water) return;
    const top = this.waterLevel();
    const h = Math.max(0.1, top - SEABED_Y);
    const water = d.water;
    water.scale.y = MathUtils.damp(water.scale.y, h, 3, dt);
    water.position.y = SEABED_Y + water.scale.y / 2;
    const mat = water.material as MeshLambertMaterial;
    const goal = new Color(this.view?.surge ? PALETTE.waterSurge : PALETTE.water);
    mat.color.lerp(goal, Math.min(1, dt * 3));
  }

  private updateTrail(dt: number): void {
    const n = this.trailCount;
    this.trail.count = n;
    if (!n) return;
    this.trailT += dt;
    const len = 42;
    for (let i = 0; i < n; i++) {
      const lane = i % 4;
      // Golden-ratio hashing spreads ants unevenly along and across the lane.
      const h1 = (i * 0.618034) % 1;
      const h2 = (i * 0.754877) % 1;
      const offset = h1 * len;
      const t = (this.trailT * (1.1 + h2 * 0.7) + offset) % len;
      const s = -21 + t;
      const side = (h2 - 0.5) * 1.6;
      const wiggle = Math.sin(this.trailT * 7 + i) * 0.1 + side;
      let x = 0;
      let z = 0;
      let yaw = 0;
      if (lane === 0) [x, z, yaw] = [s, 1.3 + wiggle, Math.PI / 2];
      else if (lane === 1) [x, z, yaw] = [-s, -1.3 + wiggle, -Math.PI / 2];
      else if (lane === 2) [x, z, yaw] = [1.3 + wiggle, -s, Math.PI];
      else [x, z, yaw] = [-1.3 + wiggle, s, 0];
      this.tmp.position.set(x, 0.22, z);
      this.tmp.rotation.set(0, yaw + Math.sin(this.trailT * 7 + i) * 0.3, 0);
      this.tmp.scale.setScalar(1);
      this.tmp.updateMatrix();
      this.trail.setMatrixAt(i, this.tmp.matrix);
    }
    this.trail.instanceMatrix.needsUpdate = true;
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
    const span = Math.max(DISTRICTS[this.focus].width, DISTRICTS[this.focus].depth) * 0.95;
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
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const h of hits) {
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
    for (const list of this.walkers.values()) {
      for (const w of list) w.update(dt);
      for (let i = list.length - 1; i >= 0; i--) if (list[i]!.removed) list.splice(i, 1);
    }
    this.updateBuildings(dt);
    this.updateWater(dt);
    this.updateTrail(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
