import { AnimationMixer, Group, MathUtils, Vector3, type AnimationAction } from 'three';
import type { CreatureId, DomesticId } from '../core/index.ts';
import { findClip, instantiate } from './assets.ts';
import { HumanRig } from './humanRig.ts';
import { inRect, type Rect } from './layout.ts';

export type Mode = 'walk' | 'fly' | 'swim' | 'float';

export interface WalkerView {
  model: string;
  size: number;
  mode: Mode;
  speed: number;
  /** Max visible instances on high quality. */
  cap: number;
  alt?: [number, number];
  zone?: 'walk' | 'water';
  move?: string[];
  rest?: string[];
  /** Humans: procedural rig, sized by height. */
  human?: boolean;
}

export type ViewId = CreatureId | DomesticId | 'hunter-1' | 'hunter-2' | 'hunter-3' | 'hunter-4' | 'scientist';

export const VIEWS: Record<ViewId, WalkerView> = {
  // 冰河
  ant: { model: 'ant', size: 1.8, mode: 'walk', speed: 2.4, cap: 8 },
  wolf: { model: 'wolf', size: 3, mode: 'walk', speed: 3.6, cap: 6 },
  sabertooth: { model: 'sabertooth', size: 3.6, mode: 'walk', speed: 3, cap: 4 },
  cavebear: { model: 'cavebear', size: 4.4, mode: 'walk', speed: 1.8, cap: 3 },
  mammoth: { model: 'mammoth', size: 7.5, mode: 'walk', speed: 1.5, cap: 3 },
  // 古代
  locust: { model: 'locust', size: 2, mode: 'walk', speed: 3, cap: 7 },
  rat: { model: 'rat', size: 2, mode: 'walk', speed: 3.2, cap: 7 },
  wildcat: { model: 'wildcat', size: 2.6, mode: 'walk', speed: 3, cap: 5 },
  boar: { model: 'boar', size: 3.4, mode: 'walk', speed: 2.4, cap: 4 },
  crocodile: { model: 'crocodile', size: 5, mode: 'swim', speed: 1.6, cap: 4, zone: 'water', move: ['Walk'] },
  // 工业
  mosquito: { model: 'mosquito', size: 1.8, mode: 'fly', speed: 4.5, cap: 7, alt: [4, 8], move: ['Fly'], rest: ['Idle'] },
  pigeon: { model: 'pigeon', size: 1.9, mode: 'walk', speed: 1.4, cap: 6 },
  octopus: { model: 'octopus', size: 4.6, mode: 'swim', speed: 1.6, cap: 4, zone: 'water', move: ['Swim'] },
  shark: { model: 'shark', size: 7.5, mode: 'swim', speed: 3.6, cap: 3, zone: 'water', move: ['Swim'] },
  bison: { model: 'bison', size: 5.5, mode: 'walk', speed: 2.2, cap: 3 },
  // 现代
  termite: { model: 'termite', size: 1.8, mode: 'walk', speed: 2.4, cap: 8 },
  crow: { model: 'crow', size: 2.2, mode: 'fly', speed: 4.5, cap: 6, alt: [8, 16], move: ['Fly'], rest: ['Fly'] },
  tiger: { model: 'tiger', size: 5, mode: 'walk', speed: 3.4, cap: 3 },
  rhino: { model: 'rhino', size: 6.5, mode: 'walk', speed: 2.4, cap: 3 },
  elephant: { model: 'elephant', size: 8.5, mode: 'walk', speed: 1.7, cap: 3 },
  // Tamed, on the humans' side
  dog: { model: 'dog', size: 2.4, mode: 'walk', speed: 3.6, cap: 5 },
  cat: { model: 'cat', size: 1.6, mode: 'walk', speed: 2.4, cap: 4 },
  pig: { model: 'pig', size: 2.6, mode: 'walk', speed: 1.4, cap: 5 },
  // Humans
  'hunter-1': { model: 'hunter-1', size: 3.2, mode: 'walk', speed: 3.2, cap: 4, human: true },
  'hunter-2': { model: 'hunter-2', size: 3.2, mode: 'walk', speed: 3.2, cap: 4, human: true },
  'hunter-3': { model: 'hunter-3', size: 3.2, mode: 'walk', speed: 3.4, cap: 4, human: true },
  'hunter-4': { model: 'hunter-4', size: 3.2, mode: 'walk', speed: 3.4, cap: 4, human: true },
  scientist: { model: 'scientist', size: 3.1, mode: 'walk', speed: 1.6, cap: 2, human: true },
};

export interface Zone {
  area: Rect;
  blocked: Rect[];
  waterLevel: () => number;
}

type State = 'move' | 'attack' | 'rest' | 'leave' | 'chase';

export interface AttackTarget {
  point: Vector3;
  top: number;
  onHit: (at: Vector3) => void;
}

/** One animated creature or person on a board. */
export class Walker {
  readonly root = new Group();
  readonly id: ViewId;
  readonly view: WalkerView;
  private readonly zone: Zone;
  private mixer: AnimationMixer | null = null;
  private rig: HumanRig | null = null;
  private moveAction: AnimationAction | null = null;
  private restAction: AnimationAction | null = null;
  private state: State = 'rest';
  private timer = 0;
  private hitTimer = 0;
  private target = new Vector3();
  private attack: AttackTarget | null = null;
  private chaseTarget: (() => Vector3 | null) | null = null;
  private yaw = Math.random() * Math.PI * 2;
  private bob = Math.random() * 10;
  private height = 1;
  private appear = 0;
  private moving = 0;
  ready = false;
  removed = false;

  constructor(id: ViewId, view: WalkerView, zone: Zone, at?: Vector3) {
    this.id = id;
    this.view = view;
    this.zone = zone;
    this.root.visible = false;
    this.place(at ?? this.randomPoint(), true);
    void this.load();
  }

  private async load(): Promise<void> {
    const prep = await instantiate(this.view.model, this.view.size, this.view.human ? 'height' : 'length');
    if (this.removed) return;
    this.height = prep.height;
    this.root.add(prep.object);
    if (this.view.human) {
      this.rig = new HumanRig(prep.model);
    } else if (prep.clips.length) {
      this.mixer = new AnimationMixer(prep.model);
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
    return this.state === 'attack' || this.attack !== null || this.state === 'leave' || this.chaseTarget !== null;
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
    if (s === 'move' || s === 'chase') {
      if (s === 'move') this.target.copy(this.randomPoint());
      if (this.moveAction && !this.moveAction.isRunning()) {
        this.moveAction.reset().fadeIn(fade).play();
        this.restAction?.fadeOut(fade);
      }
    } else if (s !== 'leave') {
      this.timer = s === 'attack' ? 2.4 + Math.random() * 1.5 : 1 + Math.random() * 3;
      this.hitTimer = 0.2;
      if (this.restAction && !this.restAction.isRunning()) {
        this.restAction.reset().fadeIn(fade).play();
        this.moveAction?.fadeOut(fade);
      }
    }
  }

  goAttack(t: AttackTarget): void {
    if (!this.ready || this.busy) return;
    this.attack = t;
    this.target.set(t.point.x, 0, t.point.z);
    this.setState('move');
  }

  /** Follow a moving target (hunters after prey, dogs after hunters). null stops. */
  chase(target: (() => Vector3 | null) | null): void {
    if (!this.ready || this.leaving) return;
    this.chaseTarget = target;
    this.attack = null;
    this.setState(target ? 'chase' : 'move');
  }

  dismiss(): void {
    if (!this.ready) {
      this.removed = true;
      this.root.removeFromParent();
      return;
    }
    this.state = 'leave';
    this.appear = Math.min(this.appear, 1);
  }

  private steer(dx: number, dz: number, dist: number, dt: number, speed: number): void {
    const want = Math.atan2(dx, dz);
    let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 5);
    const step = Math.min(dist, speed * dt * (Math.abs(diff) > 1.2 ? 0.3 : 1));
    this.root.position.x += Math.sin(this.yaw) * step;
    this.root.position.z += Math.cos(this.yaw) * step;
    this.moving = 1;
  }

  update(dt: number): void {
    if (!this.ready) return;
    this.bob += dt;
    this.moving = 0;

    if (this.state === 'leave') {
      this.appear -= dt * 2.5;
      this.root.scale.setScalar(Math.max(0.001, this.appear));
      if (this.appear <= 0) {
        this.removed = true;
        this.root.removeFromParent();
      }
      this.mixer?.update(dt);
      return;
    }
    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt * 2);
      this.root.scale.setScalar(MathUtils.smootherstep(this.appear, 0, 1) + 0.001);
    }

    const pos = this.root.position;
    const y = this.baseY();
    if (this.state === 'chase' && this.chaseTarget) {
      const t = this.chaseTarget();
      if (!t) {
        this.chase(null);
      } else {
        const dx = t.x - pos.x;
        const dz = t.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 2.2) this.steer(dx, dz, dist - 2, dt, this.view.speed);
        else this.yaw = Math.atan2(dx, dz);
      }
      pos.y = MathUtils.damp(pos.y, y, 3, dt);
    } else if (this.state === 'move') {
      const dx = this.target.x - pos.x;
      const dz = this.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < (this.attack ? 0.4 : 0.6)) this.setState(this.attack ? 'attack' : 'rest');
      else this.steer(dx, dz, dist, dt, this.view.speed);
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
    this.mixer?.update(dt);
    this.rig?.update(dt, this.moving);
  }
}

/** Visible instances for an amount: grows with the order of magnitude, capped. */
export function visibleCount(amount: number, cap: number): number {
  if (amount <= 0) return 0;
  return Math.min(cap, 1 + Math.floor(Math.log10(amount) * 2.2));
}
