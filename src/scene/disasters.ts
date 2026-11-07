import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Vector3,
  type Object3D,
  type Scene,
} from 'three';
import { DISASTERS, type CreatureId, type DisasterId, type EraId } from '../core/index.ts';
import type { SceneView } from './city.ts';
import type { Effects } from './effects.ts';
import { DISASTER_COLORS, PALETTE } from './palette.ts';
import type { Terrain } from './terrain.ts';
import { BAY, LAIR_SPOTS, VOLCANO, ZONE_AREAS } from './world.ts';

type DisasterView = NonNullable<SceneView['disaster']>;

const LAVA = [DISASTER_COLORS.lava, DISASTER_COLORS.lavaGlow, PALETTE.debris[3]!] as const;

/**
 * What a disaster looks like. The core decides when and what it wrecks; this draws the
 * warning (a pulsing outline round the zone, plus a hint: the sea pulls back, clouds gather,
 * the mountain rumbles) and the strike itself.
 */
export class DisasterFx {
  private terrain: Terrain;
  private effects: Effects;
  private current: DisasterView | null = null;
  private phase: 'warning' | 'active' | null = null;
  private t = 0;
  private era: EraId = 1;
  private hitLair: (id: CreatureId) => void = () => {};
  private shakeArea: (x: number, z: number, r: number) => void = () => {};

  private outline: Mesh;
  private outlineMat: MeshBasicMaterial;
  private wave: Group;
  private funnel: Group;
  private funnelPath: Vector3[] = [];
  private volcanoGlow: MeshStandardMaterial[] = [];
  private sea = -Infinity;
  private shakeAmount = 0;
  private clock = 0;

  constructor(scene: Scene, terrain: Terrain, effects: Effects) {
    this.terrain = terrain;
    this.effects = effects;

    const ringGeo = new RingGeometry(0.94, 1, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.outlineMat = new MeshBasicMaterial({ color: DISASTER_COLORS.warn, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false });
    this.outline = new Mesh(ringGeo, this.outlineMat);
    this.outline.visible = false;
    this.outline.renderOrder = 3;
    scene.add(this.outline);

    // The tsunami: a long wall of water with a foam crest.
    this.wave = new Group();
    const body = new Mesh(
      new BoxGeometry(46, 1, 4),
      new MeshLambertMaterial({ color: PALETTE.waterSurge, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    body.position.y = 0.5;
    const crest = new Mesh(new BoxGeometry(46, 0.5, 1.8), new MeshLambertMaterial({ color: DISASTER_COLORS.foam }));
    crest.position.set(0, 1.05, -1.1);
    this.wave.add(body, crest);
    this.wave.visible = false;
    scene.add(this.wave);

    // The tornado: stacked, slowly twisting rings that widen towards the top.
    this.funnel = new Group();
    const funnelMat = new MeshLambertMaterial({ color: DISASTER_COLORS.tornado, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 9; i++) {
      const r0 = 0.6 + i * 0.75;
      const seg = new Mesh(new CylinderGeometry(r0 + 0.75, r0, 2.4, 9, 1, true), funnelMat);
      seg.position.y = 1.2 + i * 2.3;
      seg.userData.spin = 2.5 - i * 0.12;
      this.funnel.add(seg);
    }
    const cap = new Mesh(new CylinderGeometry(10, 7, 3, 12, 1, true), new MeshLambertMaterial({ color: PALETTE.smoke, transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false }));
    cap.position.y = 22;
    this.funnel.add(cap);
    this.funnel.visible = false;
    scene.add(this.funnel);
  }

  setVolcano(obj: Object3D): void {
    obj.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mat = m.material as MeshStandardMaterial;
      if (mat.emissive && mat.emissive.getHex() !== 0) this.volcanoGlow.push(mat);
    });
  }

  /** Raised sea for the tsunami (−Infinity when calm, so the tide decides). */
  seaLevel(): number {
    return this.sea;
  }

  shake(): number {
    return this.shakeAmount;
  }

  sync(d: DisasterView | null, era: EraId, hitLair: (id: CreatureId) => void, shakeArea: (x: number, z: number, r: number) => void): void {
    this.era = era;
    this.hitLair = hitLair;
    this.shakeArea = shakeArea;
    if (!d) {
      if (this.current) this.stop();
      return;
    }
    if (!this.current || this.current.id !== d.id || this.phase !== d.phase) {
      this.current = d;
      this.phase = d.phase;
      this.t = 0;
      if (d.phase === 'warning') this.warn(d.id);
      else this.strike(d);
    }
    this.current = d;
  }

  private stop(): void {
    this.current = null;
    this.phase = null;
    this.outline.visible = false;
    this.wave.visible = false;
    this.funnel.visible = false;
  }

  private warn(id: DisasterId): void {
    const zone = ZONE_AREAS[DISASTERS[id].zone];
    this.outline.position.set(zone.x, Math.max(0, this.terrain.heightAt(zone.x, zone.z)) + 0.6, zone.z);
    this.outline.scale.setScalar(zone.r);
    this.outline.visible = true;
    this.wave.visible = false;
    this.funnel.visible = false;
  }

  private strike(d: DisasterView): void {
    this.outline.visible = false;
    for (const id of d.wrecked) this.hitLair(id);
    if (d.id === 'tsunami') {
      this.wave.visible = true;
      // Broadside to its heading (north-east, from the open sea to the coast); the crest leads.
      this.wave.rotation.y = -Math.PI / 4;
    }
    if (d.id === 'tornado') {
      // Through every lair it wrecked, then off the map.
      const z = ZONE_AREAS.plains;
      const pts = d.wrecked.map((id) => new Vector3(LAIR_SPOTS[id].x, 0, LAIR_SPOTS[id].z));
      pts.sort((a, b) => a.x - b.x);
      this.funnelPath = [new Vector3(z.x - z.r, 0, z.z + 6), ...pts, new Vector3(z.x + z.r, 0, z.z - 4)];
      this.funnel.visible = true;
    }
    if (d.id === 'volcano') {
      const top = new Vector3(VOLCANO.x, 10, VOLCANO.z);
      this.effects.burst(top, 40, 2.2, LAVA);
      this.shakeArea(VOLCANO.x, VOLCANO.z, ZONE_AREAS.volcano.r + 8);
    }
  }

  update(dt: number): void {
    this.clock += dt;
    const d = this.current;
    this.shakeAmount = MathUtils.damp(this.shakeAmount, 0, 3, dt);
    for (const mat of this.volcanoGlow) {
      const erupting = d?.id === 'volcano';
      const goal = erupting ? (d.phase === 'active' ? 3.5 : 2 + Math.sin(this.clock * 8) * 0.8) : 1.4;
      mat.emissiveIntensity = MathUtils.damp(mat.emissiveIntensity, goal, 4, dt);
    }
    if (!d) {
      this.sea = MathUtils.damp(this.sea === -Infinity ? -3 : this.sea, -3, 1.5, dt);
      if (this.sea < -2.9) this.sea = -Infinity;
      return;
    }
    this.t += dt;
    const def = DISASTERS[d.id];
    if (d.phase === 'warning') {
      this.outlineMat.opacity = 0.35 + Math.sin(this.clock * 6) * 0.3;
      if (d.id === 'tsunami') this.sea = MathUtils.damp(this.sea === -Infinity ? -1.2 : this.sea, -2.6, 0.8, dt);
      if (d.id === 'tornado' && Math.random() < dt * 6) {
        const z = ZONE_AREAS.plains;
        this.effects.puff(new Vector3(z.x + (Math.random() - 0.5) * z.r * 1.4, 18 + Math.random() * 4, z.z + (Math.random() - 0.5) * z.r), 6, PALETTE.smoke, 0.3, 3);
      }
      if (d.id === 'volcano') {
        this.shakeAmount = Math.max(this.shakeAmount, 0.25);
        if (Math.random() < dt * 5) this.effects.puff(new Vector3(VOLCANO.x, 11, VOLCANO.z), 3, DISASTER_COLORS.ash, 3, 2.5);
      }
      return;
    }
    const k = MathUtils.clamp(this.t / def.duration, 0, 1);
    if (d.id === 'tsunami') this.updateTsunami(k, dt);
    if (d.id === 'tornado') this.updateTornado(k, dt);
    if (d.id === 'volcano') this.updateVolcano(k, dt);
  }

  private updateTsunami(k: number, dt: number): void {
    // Surge in over the first third, hold, then drain.
    const inK = MathUtils.smoothstep(k, 0, 0.3);
    const outK = MathUtils.smoothstep(k, 0.7, 1);
    this.sea = MathUtils.lerp(MathUtils.lerp(-2.6, -0.12, inK), -1.2, outK);
    this.shakeAmount = Math.max(this.shakeAmount, 0.15 * (1 - outK));
    // The wave rolls in from the open sea towards the coast and the harbour.
    const from = new Vector3(BAY.x - 12, 0, BAY.z + 4);
    const to = new Vector3(BAY.x + 16, 0, BAY.z - 22);
    const p = from.lerp(to, MathUtils.smoothstep(k, 0, 0.45));
    this.wave.position.set(p.x, Math.max(-1.5, this.sea) - 0.2, p.z);
    this.wave.scale.y = MathUtils.lerp(2.6, 0.1, MathUtils.smoothstep(k, 0.3, 0.5));
    this.wave.visible = k < 0.52;
    if (k < 0.5 && Math.random() < dt * 10) {
      this.effects.puff(p.clone().setY(this.sea + 2.5).add(new Vector3((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 6)), 2.4, DISASTER_COLORS.foam, 1.5, 1.2);
    }
    // Once ashore, the harbour and coastal outposts take a beating (later eras have more to lose).
    if (k > 0.25 && k < 0.5 && Math.random() < dt * 2) {
      this.shakeArea(BAY.x + 30 + Math.random() * 25, BAY.z - 4, 14 + this.era * 2);
    }
  }

  private updateTornado(k: number, dt: number): void {
    const path = this.funnelPath;
    const f = k * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(f));
    const p = path[i]!.clone().lerp(path[i + 1]!, MathUtils.smoothstep(f - i, 0, 1));
    p.y = Math.max(0, this.terrain.heightAt(p.x, p.z));
    this.funnel.position.copy(p);
    const grow = Math.min(1, Math.min(k, 1 - k) * 8);
    this.funnel.scale.setScalar(0.2 + grow * 0.8);
    this.funnel.visible = grow > 0.02;
    for (const seg of this.funnel.children) seg.rotation.y += dt * ((seg.userData.spin as number | undefined) ?? 1);
    this.funnel.rotation.z = Math.sin(this.clock * 1.7) * 0.06;
    if (Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 4;
      this.effects.burst(p.clone().add(new Vector3(Math.cos(a) * r, 1 + Math.random() * 6, Math.sin(a) * r)), 2, 0.5);
    }
    if (Math.random() < dt * 3) this.shakeArea(p.x, p.z, 8);
  }

  private updateVolcano(k: number, dt: number): void {
    const top = new Vector3(VOLCANO.x, 11, VOLCANO.z);
    const fading = 1 - MathUtils.smoothstep(k, 0.6, 1);
    this.shakeAmount = Math.max(this.shakeAmount, 0.45 * fading);
    if (Math.random() < dt * 10 * fading) this.effects.puff(top.clone().add(new Vector3((Math.random() - 0.5) * 3, 1, (Math.random() - 0.5) * 3)), 4.5, DISASTER_COLORS.ash, 4, 3);
    if (Math.random() < dt * 6 * fading) this.effects.burst(top, 5, 1.5, LAVA);
    // Lava bombs land around the foot of the mountain.
    if (Math.random() < dt * 2.5 * fading) {
      const z = ZONE_AREAS.volcano;
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * z.r;
      const x = VOLCANO.x + Math.cos(a) * r;
      const zz = VOLCANO.z + Math.sin(a) * r;
      const at = new Vector3(x, Math.max(0, this.terrain.heightAt(x, zz)) + 0.5, zz);
      this.effects.burst(at, 8, 0.8, LAVA);
      this.effects.puff(at, 2.5, DISASTER_COLORS.ash, 1.5, 1.6);
      this.effects.ring(at, 4, DISASTER_COLORS.lavaGlow);
      this.shakeArea(x, zz, 6);
    }
  }
}
