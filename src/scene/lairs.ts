import { Color, Group, MathUtils, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { CREATURE_BY_ID, CREATURE_IDS, type CreatureId, type EraId } from '../core/index.ts';
import { instantiate } from './assets.ts';
import type { Effects } from './effects.ts';
import { PALETTE } from './palette.ts';
import type { Terrain } from './terrain.ts';
import { LAIR_SPOTS } from './world.ts';

interface LairView {
  id: CreatureId;
  group: Group;
  model: Object3D | null;
  mats: { mat: MeshStandardMaterial; base: Color }[];
  /** 0 hidden … 1 shown. */
  shown: number;
  want: boolean;
  /** 0 intact … 1 wrecked. */
  wreck: number;
  wrecked: boolean;
  /** Short squash when something pops out. */
  pop: number;
  smoke: number;
}

const ASH = new Color(PALETTE.dust).multiplyScalar(0.7);

/** Every species' home on the map: shown once its era opens, wrecked by raids and disasters. */
export class Lairs {
  readonly group = new Group();
  private views = new Map<CreatureId, LairView>();
  private terrain: Terrain;
  private effects: Effects;

  constructor(terrain: Terrain, effects: Effects) {
    this.terrain = terrain;
    this.effects = effects;
    for (const id of CREATURE_IDS) {
      const group = new Group();
      group.visible = false;
      group.userData.lair = id;
      this.group.add(group);
      const view: LairView = { id, group, model: null, mats: [], shown: 0, want: false, wreck: 0, wrecked: false, pop: 0, smoke: 0 };
      this.views.set(id, view);
      void this.load(view);
    }
  }

  private async load(view: LairView): Promise<void> {
    const spot = LAIR_SPOTS[view.id];
    const prep = await instantiate(spot.model, spot.size);
    prep.object.rotation.y = ((spot.rot ?? 0) * Math.PI) / 2;
    // Own materials, so a wrecked lair can turn to ash without touching the others.
    prep.object.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as MeshStandardMaterial).clone();
      m.material = mat;
      view.mats.push({ mat, base: mat.color.clone() });
      o.userData.lair = view.id;
    });
    view.model = prep.object;
    view.group.add(prep.object);
  }

  position(id: CreatureId): Vector3 {
    const s = LAIR_SPOTS[id];
    return new Vector3(s.x, s.water ? -2 : this.terrain.targetHeightAt(s.x, s.z), s.z);
  }

  sync(era: EraId, wrecked: Partial<Record<CreatureId, number>>): void {
    for (const view of this.views.values()) {
      view.want = CREATURE_BY_ID[view.id].era <= era;
      const isWrecked = (wrecked[view.id] ?? 0) > 0;
      if (isWrecked && !view.wrecked && view.shown > 0.5) this.burst(view);
      if (!isWrecked && view.wrecked && view.shown > 0.5) this.regrow(view);
      view.wrecked = isWrecked;
    }
  }

  /** A unit leaves its lair. */
  spawn(id: CreatureId): void {
    const view = this.views.get(id);
    if (!view || view.shown < 0.5) return;
    view.pop = 1;
    const at = this.position(id).setY(this.position(id).y + 0.6);
    this.effects.puff(at, 1.6, PALETTE.dust, 1.4, 0.9);
  }

  /** Something hit the lair (raiders, disaster): shake and spit debris. */
  hit(id: CreatureId): void {
    const view = this.views.get(id);
    if (!view || view.shown < 0.5) return;
    view.pop = 1;
    this.effects.burst(this.position(id).setY(1.5), 6, 0.7, [PALETTE.dust, PALETTE.smoke]);
  }

  private burst(view: LairView): void {
    const at = this.position(view.id);
    this.effects.dust(at.clone().setY(at.y + 0.5), LAIR_SPOTS[view.id].size * 0.5, 10);
    this.effects.burst(at.clone().setY(at.y + 1.5), 16, 1.2);
    this.effects.ring(at.clone().setY(at.y + 0.2), LAIR_SPOTS[view.id].size * 0.8, PALETTE.hit);
  }

  private regrow(view: LairView): void {
    const at = this.position(view.id);
    this.effects.ring(at.clone().setY(at.y + 0.2), LAIR_SPOTS[view.id].size * 0.7, PALETTE.sprout);
    this.effects.burst(at.clone().setY(at.y + 1), 10, 0.6, [PALETTE.sprout, PALETTE.sproutLight]);
  }

  /** The lair a picked object belongs to, if any. */
  static lairOf(o: Object3D | null): CreatureId | null {
    for (let p = o; p; p = p.parent) if (p.userData.lair) return p.userData.lair as CreatureId;
    return null;
  }

  update(dt: number): void {
    const now = performance.now() / 1000;
    for (const view of this.views.values()) {
      const target = view.want ? 1 : 0;
      if (view.shown !== target) view.shown = MathUtils.clamp(view.shown + (target ? dt * 1.2 : -dt * 2), 0, 1);
      view.group.visible = view.shown > 0.001;
      if (!view.group.visible) continue;
      const spot = LAIR_SPOTS[view.id];
      view.group.position.set(spot.x, spot.water ? this.terrain.heightAt(spot.x, spot.z) : this.terrain.heightAt(spot.x, spot.z) - 0.05, spot.z);
      view.wreck = MathUtils.damp(view.wreck, view.wrecked ? 1 : 0, view.wrecked ? 5 : 1.5, dt);
      view.pop = Math.max(0, view.pop - dt * 3);
      const grow = MathUtils.smootherstep(view.shown, 0, 1);
      const squash = 1 - view.wreck * 0.55;
      const pop = Math.sin(view.pop * Math.PI) * 0.12;
      view.group.scale.set(grow * (1 + pop + view.wreck * 0.15), grow * squash * (1 - pop), grow * (1 + pop + view.wreck * 0.15));
      for (const { mat, base } of view.mats) mat.color.copy(base).lerp(ASH, view.wreck * 0.75);
      if (view.wrecked) {
        view.smoke -= dt;
        if (view.smoke <= 0) {
          view.smoke = 0.9 + Math.random() * 0.8;
          this.effects.puff(this.position(view.id).setY(this.terrain.heightAt(spot.x, spot.z) + 1.2), 1.6, PALETTE.smoke, 2.2, 1.8);
        }
      }
      // Lairs breathe a little so the map looks alive.
      if (!view.wrecked && view.model) view.model.rotation.z = Math.sin(now * 0.8 + spot.x) * 0.01;
    }
  }
}
