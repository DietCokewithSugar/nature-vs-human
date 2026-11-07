import { AnimationMixer, Group, MathUtils, Vector3, type AnimationAction } from 'three';
import type { CreatureId, DomesticId } from '../core/index.ts';
import { findClip, instantiate } from './assets.ts';
import { HumanRig } from './humanRig.ts';

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

/** What a walker needs from the world: ground, water and routes. */
export interface WalkerHost {
  groundAt(x: number, z: number): number;
  waterLevel(): number;
  /** A point near `home` reachable in a straight line from `from`. */
  wanderPoint(from: Vector3, home: Vector3, radius: number, mode: NavMode): Vector3;
  /** Waypoints from one point to another, or null if there is no way. */
  route(from: Vector3, to: Vector3, mode: NavMode): Vector3[] | null;
}

export type NavMode = 'land' | 'water' | 'air';

type State = 'move' | 'attack' | 'rest' | 'leave' | 'chase';

export interface AttackTarget {
  point: Vector3;
  top: number;
  onHit: (at: Vector3) => void;
}

/** One animated creature or person on the map. Lives near a home and makes trips from it. */
export class Walker {
  readonly root = new Group();
  readonly id: ViewId;
  readonly view: WalkerView;
  readonly nav: NavMode;
  private readonly host: WalkerHost;
  home: Vector3;
  roam: number;
  private mixer: AnimationMixer | null = null;
  private rig: HumanRig | null = null;
  private moveAction: AnimationAction | null = null;
  private restAction: AnimationAction | null = null;
  private state: State = 'rest';
  private timer = 0;
  private hitTimer = 0;
  private path: Vector3[] = [];
  private attack: AttackTarget | null = null;
  private arrive: (() => void) | null = null;
  private chaseTarget: (() => Vector3 | null) | null = null;
  private yaw = Math.random() * Math.PI * 2;
  private bob = Math.random() * 10;
  private height = 1;
  private appear = 0;
  private moving = 0;
  /** Speed multiplier for trips (raid parties hurry, fleeing people run). */
  pace = 1;
  ready = false;
  removed = false;

  constructor(id: ViewId, view: WalkerView, host: WalkerHost, home: Vector3, roam: number, at?: Vector3) {
    this.id = id;
    this.view = view;
    this.host = host;
    this.home = home.clone();
    this.roam = roam;
    this.nav = view.mode === 'fly' ? 'air' : view.zone === 'water' ? 'water' : 'land';
    this.root.visible = false;
    const p = at ?? this.home;
    this.root.position.set(p.x, 0, p.z);
    this.root.position.y = this.baseY();
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
    if (!this.path.length && !this.arrive) this.wander();
  }

  get leaving(): boolean {
    return this.removed || this.state === 'leave';
  }

  get busy(): boolean {
    return this.attack !== null || this.arrive !== null || this.state === 'leave' || this.chaseTarget !== null;
  }

  get position(): Vector3 {
    return this.root.position;
  }

  get modelHeight(): number {
    return this.height;
  }

  private baseY(): number {
    const v = this.view;
    const p = this.root.position;
    const ground = this.host.groundAt(p.x, p.z);
    if (v.mode === 'fly') return ground + MathUtils.lerp(v.alt![0], v.alt![1], (Math.sin(this.bob * 0.3) + 1) / 2);
    if (v.mode === 'swim') return Math.max(ground + 0.2, this.host.waterLevel() - this.height * 0.55);
    if (v.mode === 'float') return this.host.waterLevel() - this.height * 0.75;
    return Math.max(ground, this.nav === 'land' ? ground : -Infinity);
  }

  private playMove(): void {
    if (this.moveAction && !this.moveAction.isRunning()) {
      this.moveAction.reset().fadeIn(0.25).play();
      this.restAction?.fadeOut(0.25);
    }
  }

  private playRest(): void {
    if (this.restAction && !this.restAction.isRunning()) {
      this.restAction.reset().fadeIn(0.25).play();
      this.moveAction?.fadeOut(0.25);
    }
  }

  /** Follow a route to a point. Straight line for flyers. */
  private travel(to: Vector3): boolean {
    const route = this.nav === 'air' ? [to.clone()] : this.host.route(this.root.position, to, this.nav);
    if (!route || !route.length) return false;
    this.path = route;
    this.state = 'move';
    this.playMove();
    return true;
  }

  private wander(): void {
    const p = this.host.wanderPoint(this.root.position, this.home, this.roam, this.nav);
    this.path = [p];
    this.state = 'move';
    this.playMove();
  }

  private rest(): void {
    this.state = 'rest';
    this.timer = 1 + Math.random() * 3;
    this.playRest();
  }

  goAttack(t: AttackTarget): boolean {
    if (!this.ready || this.busy) return false;
    if (!this.travel(t.point)) return false;
    this.attack = t;
    return true;
  }

  /** Walk somewhere and call back on arrival (raid parties, people fleeing). */
  goTo(point: Vector3, onArrive: () => void): boolean {
    if (!this.ready || this.leaving) return false;
    this.attack = null;
    this.chaseTarget = null;
    if (!this.travel(point)) return false;
    this.arrive = onArrive;
    return true;
  }

  /** Follow a moving target (hunters after prey, dogs after hunters). null stops. */
  chase(target: (() => Vector3 | null) | null): void {
    if (!this.ready || this.leaving || this.arrive) return;
    this.chaseTarget = target;
    this.attack = null;
    if (target) {
      this.state = 'chase';
      this.playMove();
    } else {
      this.wander();
    }
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
    const speed = this.view.speed * this.pace;
    if (this.state === 'chase' && this.chaseTarget) {
      const t = this.chaseTarget();
      if (!t) {
        this.chase(null);
      } else {
        const dx = t.x - pos.x;
        const dz = t.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 2.2) this.steer(dx, dz, dist - 2, dt, speed);
        else this.yaw = Math.atan2(dx, dz);
      }
      pos.y = MathUtils.damp(pos.y, this.baseY(), 6, dt);
    } else if (this.state === 'move') {
      const next = this.path[0];
      if (!next) {
        this.arrived();
      } else {
        const dx = next.x - pos.x;
        const dz = next.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.5) this.path.shift();
        else this.steer(dx, dz, dist, dt, speed);
      }
      pos.y = MathUtils.damp(pos.y, this.baseY(), 8, dt);
    } else if (this.state === 'attack' && this.attack) {
      this.timer -= dt;
      this.hitTimer -= dt;
      const y = this.baseY();
      const hop = Math.abs(Math.sin(this.bob * 9)) * Math.min(1.2, this.view.size * 0.12);
      const ay = this.view.mode === 'fly' ? Math.max(this.attack.top + 1, y * 0.5) : y;
      pos.y = MathUtils.damp(pos.y, ay, 6, dt) + (this.view.mode === 'walk' ? hop * 0.15 : 0);
      if (this.hitTimer <= 0) {
        this.hitTimer = 0.55 + Math.random() * 0.3;
        this.attack.onHit(this.attack.point);
      }
      if (this.timer <= 0) {
        this.attack = null;
        // Head back towards the lair.
        if (!this.travel(this.host.wanderPoint(pos, this.home, this.roam, this.nav))) this.wander();
      }
    } else {
      this.timer -= dt;
      pos.y = MathUtils.damp(pos.y, this.baseY(), 6, dt);
      if (this.timer <= 0) this.wander();
    }
    if (this.view.mode === 'float') pos.y += Math.sin(this.bob * 1.6) * 0.01;
    this.root.rotation.y = this.yaw;
    this.mixer?.update(dt);
    this.rig?.update(dt, this.moving);
  }

  private arrived(): void {
    if (this.attack) {
      this.state = 'attack';
      this.timer = 2.4 + Math.random() * 1.5;
      this.hitTimer = 0.2;
      this.playRest();
      return;
    }
    if (this.arrive) {
      const cb = this.arrive;
      this.arrive = null;
      this.rest();
      cb();
      return;
    }
    this.rest();
  }
}

/** Visible instances for an amount: grows with the order of magnitude, capped. */
export function visibleCount(amount: number, cap: number): number {
  if (amount <= 0) return 0;
  return Math.min(cap, 1 + Math.floor(Math.log10(amount) * 2.2));
}
