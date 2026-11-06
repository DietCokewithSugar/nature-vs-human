import { AnimationMixer, Group, MathUtils, Vector3, type AnimationAction } from 'three';
import type { CreatureId } from '../core/index.ts';
import { findClip, instantiate } from './assets.ts';
import { inRect, type Rect } from './layout.ts';

export type Mode = 'walk' | 'fly' | 'swim' | 'float';

export interface CreatureView {
  model: string;
  size: number;
  mode: Mode;
  speed: number;
  /** Max visible instances on high quality. */
  cap: number;
  alt?: [number, number];
  /** Where the creature roams: the district walk area, the beach, or the water. */
  zone?: 'walk' | 'water';
  move?: string[];
  rest?: string[];
}

export type ViewId = CreatureId | 'queen';

export const VIEWS: Record<ViewId, CreatureView> = {
  ant: { model: 'ant', size: 1.8, mode: 'walk', speed: 2.4, cap: 8 },
  grasshopper: { model: 'grasshopper', size: 2.3, mode: 'walk', speed: 3, cap: 6 },
  wasp: { model: 'wasp', size: 1.9, mode: 'fly', speed: 4.5, cap: 6, alt: [5, 9], move: ['Fly'], rest: ['Idle'] },
  beetle: { model: 'beetle', size: 2.6, mode: 'walk', speed: 1.6, cap: 5 },
  mantis: { model: 'mantis', size: 3.2, mode: 'walk', speed: 1.4, cap: 4 },
  queen: { model: 'queen', size: 3.4, mode: 'walk', speed: 0.9, cap: 2 },
  crab: { model: 'crab', size: 2.8, mode: 'walk', speed: 1.8, cap: 6, move: ['Walk Sideways', 'Walk'] },
  jellyfish: { model: 'jellyfish', size: 2.6, mode: 'float', speed: 0.7, cap: 5, zone: 'water', move: ['Swim'] },
  eel: { model: 'eel', size: 5, mode: 'swim', speed: 2.6, cap: 4, zone: 'water', move: ['Swim'] },
  octopus: { model: 'octopus', size: 4.6, mode: 'swim', speed: 1.6, cap: 4, zone: 'water', move: ['Swim'] },
  shark: { model: 'shark', size: 7.5, mode: 'swim', speed: 3.6, cap: 3, zone: 'water', move: ['Swim'] },
  rat: { model: 'rat', size: 2.2, mode: 'walk', speed: 3.2, cap: 6 },
  pigeon: { model: 'pigeon', size: 1.9, mode: 'walk', speed: 1.4, cap: 6 },
  fox: { model: 'fox', size: 3.4, mode: 'walk', speed: 3, cap: 4 },
  bear: { model: 'bear', size: 5, mode: 'walk', speed: 2, cap: 3 },
  elephant: { model: 'elephant', size: 8.5, mode: 'walk', speed: 1.7, cap: 3 },
  raptor: { model: 'raptor', size: 7.5, mode: 'walk', speed: 5.5, cap: 4 },
  pteranodon: { model: 'pteranodon', size: 10, mode: 'fly', speed: 8, cap: 3, alt: [28, 44], move: ['Fly'], rest: ['Fly'] },
  triceratops: { model: 'triceratops', size: 15, mode: 'walk', speed: 2.6, cap: 2 },
  brachiosaurus: { model: 'brachiosaurus', size: 30, mode: 'walk', speed: 1.8, cap: 2 },
  trex: { model: 'trex', size: 21, mode: 'walk', speed: 3.2, cap: 2 },
};

export interface Zone {
  /** World-space area to roam. */
  area: Rect;
  /** World-space rectangles to stay out of. */
  blocked: Rect[];
  waterLevel: () => number;
}

type State = 'move' | 'attack' | 'rest' | 'leave';

export interface AttackTarget {
  point: Vector3;
  top: number;
  onHit: (at: Vector3) => void;
}

/** One animated creature on the board. */
export class Walker {
  readonly root = new Group();
  private mixer: AnimationMixer | null = null;
  private moveAction: AnimationAction | null = null;
  private restAction: AnimationAction | null = null;
  private state: State = 'rest';
  private timer = 0;
  private hitTimer = 0;
  private target = new Vector3();
  private attack: AttackTarget | null = null;
  private yaw = Math.random() * Math.PI * 2;
  private bob = Math.random() * 10;
  private height = 1;
  private appear = 0;
  ready = false;
  removed = false;

  readonly id: ViewId;
  readonly view: CreatureView;
  private readonly zone: Zone;

  constructor(id: ViewId, view: CreatureView, zone: Zone) {
    this.id = id;
    this.view = view;
    this.zone = zone;
    this.root.visible = false;
    this.place(this.randomPoint(), true);
    void this.load();
  }

  private async load(): Promise<void> {
    const prep = await instantiate(this.view.model, this.view.size);
    if (this.removed) return;
    this.height = prep.height;
    this.root.add(prep.object);
    if (prep.clips.length) {
      this.mixer = new AnimationMixer(prep.object);
      const move = findClip(prep.clips, ...(this.view.move ?? ['Walk']), 'Walk', 'Swim', 'Fly');
      const rest = findClip(prep.clips, ...(this.view.rest ?? ['Idle']), 'Idle');
      if (move) this.moveAction = this.mixer.clipAction(move);
      if (rest) this.restAction = this.mixer.clipAction(rest);
      this.restAction?.play();
      this.mixer.update(Math.random() * 2);
    }
    this.root.scale.setScalar(0.001);
    this.root.visible = true;
    this.ready = true;
    this.setState('move');
  }

  get leaving(): boolean {
    return this.removed || this.state === 'leave';
  }

  get busy(): boolean {
    return this.state === 'attack' || this.attack !== null || this.state === 'leave';
  }

  get position(): Vector3 {
    return this.root.position;
  }

  private randomPoint(): Vector3 {
    const { area, blocked } = this.zone;
    for (let i = 0; i < 24; i++) {
      const x = MathUtils.lerp(area.x0, area.x1, Math.random());
      const z = MathUtils.lerp(area.z0, area.z1, Math.random());
      if (!blocked.some((r) => inRect(r, x, z))) return new Vector3(x, 0, z);
    }
    return new Vector3((area.x0 + area.x1) / 2, 0, (area.z0 + area.z1) / 2);
  }

  private baseY(): number {
    const v = this.view;
    if (v.mode === 'fly') return MathUtils.lerp(v.alt![0], v.alt![1], (Math.sin(this.bob * 0.3) + 1) / 2);
    if (v.mode === 'swim') return this.zone.waterLevel() - this.height * 0.55;
    if (v.mode === 'float') return this.zone.waterLevel() - this.height * 0.75;
    return 0;
  }

  private place(p: Vector3, snap: boolean): void {
    this.root.position.set(p.x, snap ? this.baseY() : this.root.position.y, p.z);
  }

  private setState(s: State): void {
    this.state = s;
    const fade = 0.25;
    if (s === 'move' || s === 'leave') {
      this.target.copy(s === 'leave' ? this.target : this.randomPoint());
      if (this.moveAction && !this.moveAction.isRunning()) {
        this.moveAction.reset().fadeIn(fade).play();
        this.restAction?.fadeOut(fade);
      }
    } else {
      this.timer = s === 'attack' ? 2.4 + Math.random() * 1.5 : 1 + Math.random() * 3;
      this.hitTimer = 0.2;
      if (this.restAction && !this.restAction.isRunning()) {
        this.restAction.reset().fadeIn(fade).play();
        this.moveAction?.fadeOut(fade);
      }
    }
  }

  /** Send this walker to attack a building. */
  goAttack(t: AttackTarget): void {
    if (!this.ready || this.busy) return;
    this.attack = t;
    this.target.set(t.point.x, 0, t.point.z);
    this.setState('move');
  }

  /** Walk off and shrink away. */
  dismiss(): void {
    if (!this.ready) {
      this.removed = true;
      this.root.removeFromParent();
      return;
    }
    this.state = 'leave';
    this.appear = Math.min(this.appear, 1);
  }

  update(dt: number): void {
    if (!this.ready) return;
    this.bob += dt;
    this.mixer?.update(dt);

    if (this.state === 'leave') {
      this.appear -= dt * 2.5;
      this.root.scale.setScalar(Math.max(0.001, this.appear));
      if (this.appear <= 0) {
        this.removed = true;
        this.root.removeFromParent();
      }
      return;
    }
    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt * 2);
      this.root.scale.setScalar(MathUtils.smootherstep(this.appear, 0, 1) + 0.001);
    }

    const pos = this.root.position;
    const y = this.baseY();
    if (this.state === 'move') {
      const dx = this.target.x - pos.x;
      const dz = this.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const reach = this.attack ? 0.4 : 0.6;
      if (dist < reach) {
        this.setState(this.attack ? 'attack' : 'rest');
      } else {
        const want = Math.atan2(dx, dz);
        let diff = want - this.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.yaw += diff * Math.min(1, dt * 5);
        const step = Math.min(dist, this.view.speed * dt * (Math.abs(diff) > 1.2 ? 0.3 : 1));
        pos.x += Math.sin(this.yaw) * step;
        pos.z += Math.cos(this.yaw) * step;
      }
      pos.y = MathUtils.damp(pos.y, y, 3, dt);
    } else if (this.state === 'attack' && this.attack) {
      this.timer -= dt;
      this.hitTimer -= dt;
      const hop = Math.abs(Math.sin(this.bob * 9)) * Math.min(1.2, this.view.size * 0.12);
      const ay = this.view.mode === 'fly' ? Math.max(this.attack.top + 1, y * 0.5) : y;
      pos.y = MathUtils.damp(pos.y, ay, 6, dt) + (this.view.mode === 'walk' ? hop * 0.15 : 0);
      if (this.hitTimer <= 0) {
        this.hitTimer = 0.55 + Math.random() * 0.3;
        this.attack.onHit(this.attack.point);
      }
      if (this.timer <= 0) {
        this.attack = null;
        this.setState('move');
      }
    } else {
      this.timer -= dt;
      pos.y = MathUtils.damp(pos.y, y, 3, dt);
      if (this.timer <= 0) this.setState('move');
    }
    if (this.view.mode === 'float') pos.y += Math.sin(this.bob * 1.6) * 0.01;
    this.root.rotation.y = this.yaw;
  }
}

/** Visible instances for an owned amount: grows with the order of magnitude, capped. */
export function visibleCount(amount: number, cap: number): number {
  if (amount <= 0) return 0;
  return Math.min(cap, 1 + Math.floor(Math.log10(amount) * 2.2));
}
