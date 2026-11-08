import { AnimationMixer, Color, Group, MathUtils, Mesh, MeshStandardMaterial, type AnimationAction, type Object3D } from 'three';
import { amber, grass, orange, plum, sky, gold } from '@radix-ui/colors';
import type { Unit, UnitId } from '../core/index.ts';
import { findClip, instantiate } from './assets.ts';
import { HumanRig } from './humanRig.ts';

export type Mode = 'walk' | 'fly' | 'swim' | 'float' | 'drive';

export interface UnitLook {
  model: string;
  size: number;
  mode: Mode;
  alt?: [number, number];
  move?: string[];
  rest?: string[];
  /** Humans: procedural rig, sized by height. */
  human?: boolean;
  /** Tint the whole model (lerp of material colours). */
  tint?: string;
}

/** How each unit looks on the map. Kitbashed variants (taxi, bee, mammoth …) live in kitbash.ts. */
export const LOOKS: Record<UnitId, UnitLook> = {
  // 冰河
  ant: { model: 'ant', size: 1.6, mode: 'walk' },
  wolf: { model: 'wolf', size: 2.8, mode: 'walk' },
  sabertooth: { model: 'sabertooth', size: 3.3, mode: 'walk' },
  cavebear: { model: 'cavebear', size: 3.8, mode: 'walk' },
  mammoth: { model: 'mammoth', size: 6, mode: 'walk' },
  // 古代
  locust: { model: 'locust', size: 1.6, mode: 'walk' },
  rat: { model: 'rat', size: 1.7, mode: 'walk' },
  wildcat: { model: 'wildcat', size: 2.3, mode: 'walk' },
  boar: { model: 'boar', size: 2.9, mode: 'walk' },
  crocodile: { model: 'crocodile', size: 4.2, mode: 'swim', move: ['Walk'] },
  // 工业
  mosquito: { model: 'mosquito', size: 1.5, mode: 'fly', alt: [3, 6], move: ['Fly'], rest: ['Idle'] },
  pigeon: { model: 'pigeon', size: 1.7, mode: 'fly', alt: [2.5, 5] },
  octopus: { model: 'octopus', size: 3.8, mode: 'swim', move: ['Swim'] },
  shark: { model: 'shark', size: 5.5, mode: 'swim', move: ['Swim'] },
  bison: { model: 'bison', size: 4.4, mode: 'walk' },
  // 现代
  termite: { model: 'termite', size: 1.6, mode: 'walk' },
  crow: { model: 'crow', size: 2, mode: 'fly', alt: [4, 8], move: ['Fly'], rest: ['Fly'] },
  tiger: { model: 'tiger', size: 4.2, mode: 'walk' },
  rhino: { model: 'rhino', size: 5, mode: 'walk' },
  elephant: { model: 'elephant', size: 6.5, mode: 'walk' },
  // 授粉者
  bee: { model: 'bee', size: 1.2, mode: 'fly', alt: [1.5, 3.5], move: ['Fly'], rest: ['Idle'] },
  butterfly: { model: 'butterfly', size: 1.4, mode: 'fly', alt: [1.5, 3] },
  bat: { model: 'bat', size: 1.8, mode: 'fly', alt: [3, 6] },
  // 人类
  gatherer: { model: 'hunter-1', size: 2.6, mode: 'walk', human: true },
  hunter: { model: 'hunter-1', size: 2.8, mode: 'walk', human: true, tint: orange.orange9 },
  shaman: { model: 'hunter-1', size: 2.7, mode: 'walk', human: true, tint: plum.plum9 },
  farmer: { model: 'hunter-2', size: 2.7, mode: 'walk', human: true, tint: amber.amber8 },
  archer: { model: 'hunter-2', size: 2.8, mode: 'walk', human: true },
  scholar: { model: 'hunter-2', size: 2.7, mode: 'walk', human: true, tint: gold.gold7 },
  worker: { model: 'hunter-3', size: 2.7, mode: 'walk', human: true, tint: amber.amber9 },
  rifleman: { model: 'hunter-3', size: 2.8, mode: 'walk', human: true },
  researcher: { model: 'scientist', size: 2.7, mode: 'walk', human: true },
  environmentalist: { model: 'scientist', size: 2.7, mode: 'walk', human: true, tint: grass.grass9 },
  fisher: { model: 'fishing-boat', size: 4.6, mode: 'float' },
  officeWorker: { model: 'hunter-4', size: 2.7, mode: 'walk', human: true },
  taxi: { model: 'taxi', size: 3.8, mode: 'drive' },
  animalControl: { model: 'hunter-4', size: 2.8, mode: 'walk', human: true, tint: sky.sky9 },
  plane: { model: 'airliner', size: 9, mode: 'fly', alt: [14, 18] },
  // 驯化的动物
  dog: { model: 'dog', size: 2.2, mode: 'walk' },
  cat: { model: 'cat', size: 1.5, mode: 'walk' },
  pig: { model: 'pig', size: 2.3, mode: 'walk' },
};

export interface UnitHost {
  groundAt(x: number, z: number): number;
  waterLevel(): number;
}

/**
 * One unit on the map, drawn from the core's state. It eases towards the simulated position,
 * walks or idles by how fast it moves, hops when it lands a hit, and fades in and out.
 */
export class UnitView {
  readonly root = new Group();
  readonly id: number;
  readonly kind: UnitId;
  readonly look: UnitLook;
  private host: UnitHost;
  private mixer: AnimationMixer | null = null;
  private rig: HumanRig | null = null;
  private moveAction: AnimationAction | null = null;
  private restAction: AnimationAction | null = null;
  private wings: Object3D[] = [];
  private tx: number;
  private tz: number;
  private dir: number;
  private yaw: number;
  private bob = Math.random() * 10;
  private hop = 0;
  private lastHit = -99;
  private speed = 0;
  height = 1;
  appear = 0;
  dying = false;
  ready = false;
  removed = false;
  /** The core's current task, for the status icon. */
  task: Unit['task'] = 'idle';
  feeding = false;
  dazed = false;
  side: Unit['side'];

  constructor(u: Unit, host: UnitHost) {
    this.id = u.id;
    this.kind = u.kind;
    this.side = u.side;
    this.look = LOOKS[u.kind];
    this.host = host;
    this.tx = u.x;
    this.tz = u.z;
    this.dir = u.dir;
    this.yaw = u.dir;
    this.root.position.set(u.x, this.baseY(u.x, u.z), u.z);
    this.root.visible = false;
    void this.load();
  }

  private async load(): Promise<void> {
    const look = this.look;
    const prep = await instantiate(look.model, look.size, look.human ? 'height' : 'length');
    if (this.removed) return;
    this.height = prep.height;
    if (look.tint) {
      const tint = new Color(look.tint);
      prep.object.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as MeshStandardMaterial).clone();
        mat.color.lerp(tint, 0.35);
        m.material = mat;
      });
    }
    prep.object.traverse((o) => {
      if (o.name === 'wingL' || o.name === 'wingR') this.wings.push(o);
    });
    this.root.add(prep.object);
    if (look.human) {
      this.rig = new HumanRig(prep.model);
    } else if (prep.clips.length) {
      this.mixer = new AnimationMixer(prep.model);
      const move = findClip(prep.clips, ...(look.move ?? ['Walk']), 'Walk', 'Swim', 'Fly');
      const rest = findClip(prep.clips, ...(look.rest ?? ['Idle']), 'Idle');
      if (move) this.moveAction = this.mixer.clipAction(move);
      if (rest) this.restAction = this.mixer.clipAction(rest);
      this.restAction?.play();
      this.mixer.update(Math.random() * 2);
    }
    this.root.scale.setScalar(0.001);
    this.root.visible = true;
    this.ready = true;
  }

  /** Take the core's latest state for this unit. */
  sync(u: Unit): void {
    this.tx = u.x;
    this.tz = u.z;
    this.dir = u.dir;
    this.task = u.task;
    this.feeding = u.feeding;
    this.dazed = u.dazed;
    this.side = u.side;
    if (u.hitAt !== this.lastHit) {
      if (this.lastHit > -99) this.hop = 1;
      this.lastHit = u.hitAt;
    }
  }

  die(): void {
    this.dying = true;
  }

  get position() {
    return this.root.position;
  }

  private baseY(x: number, z: number): number {
    const look = this.look;
    const ground = this.host.groundAt(x, z);
    switch (look.mode) {
      case 'fly': {
        const [lo, hi] = look.alt ?? [3, 6];
        return ground + MathUtils.lerp(lo, hi, (Math.sin(this.bob * 0.7) + 1) / 2);
      }
      case 'swim':
        return Math.max(ground + 0.2, this.host.waterLevel() - this.height * 0.5);
      case 'float':
        return this.host.waterLevel() - this.height * 0.2;
      default:
        return Math.max(ground, this.host.waterLevel() - this.height * 0.35);
    }
  }

  private playMove(): void {
    if (this.moveAction && !this.moveAction.isRunning()) {
      this.moveAction.reset().fadeIn(0.2).play();
      this.restAction?.fadeOut(0.2);
    }
  }

  private playRest(): void {
    if (this.restAction && !this.restAction.isRunning()) {
      this.restAction.reset().fadeIn(0.3).play();
      this.moveAction?.fadeOut(0.3);
    }
  }

  update(dt: number): void {
    if (!this.ready) return;
    this.bob += dt;
    if (this.dying) {
      this.appear -= dt * 2.2;
      this.root.scale.setScalar(Math.max(0.001, this.appear));
      this.root.rotation.z = (1 - this.appear) * 0.8;
      if (this.appear <= 0) {
        this.removed = true;
        this.root.removeFromParent();
      }
      return;
    }
    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt * 2.5);
      this.root.scale.setScalar(MathUtils.smootherstep(this.appear, 0, 1) + 0.001);
    }
    const p = this.root.position;
    const dx = this.tx - p.x;
    const dz = this.tz - p.z;
    const d = Math.hypot(dx, dz);
    let moved = 0;
    if (d > 8) {
      p.x = this.tx;
      p.z = this.tz;
    } else {
      const k = 1 - Math.exp(-dt * 10);
      p.x += dx * k;
      p.z += dz * k;
      moved = d * k;
    }
    this.speed = MathUtils.damp(this.speed, moved / Math.max(dt, 1e-3), 6, dt);
    const moving = this.speed > 0.4;
    if (moving && d > 0.02) this.dir = Math.atan2(dx, dz);
    let diff = this.dir - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 8);
    this.root.rotation.y = this.yaw;
    this.hop = Math.max(0, this.hop - dt * 3.5);
    const hop = Math.sin(this.hop * Math.PI) * Math.min(1, this.height * 0.25);
    p.y = MathUtils.damp(p.y, this.baseY(p.x, p.z), 8, dt) + (this.look.mode === 'walk' ? hop * 0.6 : 0);
    this.root.rotation.x = this.hop * 0.25;
    if (moving) this.playMove();
    else this.playRest();
    this.mixer?.update(dt * (moving ? Math.min(2, 0.6 + this.speed * 0.25) : 1));
    this.rig?.update(dt, moving ? 1 : 0);
    if (this.wings.length) {
      const flap = Math.sin(this.bob * (this.kind === 'bat' ? 14 : 9)) * 0.9;
      for (const w of this.wings) w.rotation.z = w.name === 'wingL' ? -flap : flap;
    }
    if (this.look.mode === 'drive') this.root.rotation.x = 0;
  }
}
