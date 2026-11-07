import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  RingGeometry,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  Vector3,
  type Scene,
} from 'three';
import { PALETTE } from './palette.ts';

interface Debris {
  alive: boolean;
  pos: Vector3;
  vel: Vector3;
  rot: Vector3;
  spin: Vector3;
  life: number;
  size: number;
}

interface Puff {
  mesh: Mesh;
  mat: MeshLambertMaterial;
  vel: Vector3;
  life: number;
  max: number;
  grow: number;
}

interface Ring {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  life: number;
  max: number;
  radius: number;
}

const DEBRIS_MAX = 360;
const PUFF_MAX = 96;
const RING_MAX = 14;
const GRAVITY = -22;

/** Pooled particles: flying debris, smoke/dust puffs and ground shock rings. */
export class Effects {
  private debris: Debris[] = [];
  private debrisMesh: InstancedMesh;
  private puffs: Puff[] = [];
  private rings: Ring[] = [];
  private tmp = new Object3D();
  private mat4 = new Matrix4();
  private cursor = 0;

  constructor(scene: Scene) {
    const geo = new BoxGeometry(1, 1, 1);
    const mat = new MeshLambertMaterial({ color: 0xffffff });
    this.debrisMesh = new InstancedMesh(geo, mat, DEBRIS_MAX);
    this.debrisMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    const c = new Color();
    for (let i = 0; i < DEBRIS_MAX; i++) {
      this.debris.push({
        alive: false,
        pos: new Vector3(),
        vel: new Vector3(),
        rot: new Vector3(),
        spin: new Vector3(),
        life: 0,
        size: 0,
      });
      this.mat4.makeScale(0, 0, 0);
      this.debrisMesh.setMatrixAt(i, this.mat4);
      c.set(PALETTE.debris[i % PALETTE.debris.length]!);
      this.debrisMesh.setColorAt(i, c);
    }
    scene.add(this.debrisMesh);

    const puffGeo = new IcosahedronGeometry(1, 0);
    for (let i = 0; i < PUFF_MAX; i++) {
      const pm = new MeshLambertMaterial({ color: PALETTE.smoke, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new Mesh(puffGeo, pm);
      mesh.visible = false;
      scene.add(mesh);
      this.puffs.push({ mesh, mat: pm, vel: new Vector3(), life: 0, max: 1, grow: 1 });
    }

    const ringGeo = new RingGeometry(0.85, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < RING_MAX; i++) {
      const rm = new MeshBasicMaterial({ color: PALETTE.hit, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false });
      const mesh = new Mesh(ringGeo, rm);
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, mat: rm, life: 0, max: 0.5, radius: 3 });
    }
  }

  burst(at: Vector3, count: number, scale = 1, colors?: readonly string[]): void {
    const c = new Color();
    for (let n = 0; n < count; n++) {
      const i = this.cursor++ % DEBRIS_MAX;
      const d = this.debris[i]!;
      d.alive = true;
      d.pos.copy(at);
      const a = Math.random() * Math.PI * 2;
      const sp = (3 + Math.random() * 6) * scale;
      d.vel.set(Math.cos(a) * sp, (5 + Math.random() * 8) * Math.sqrt(scale), Math.sin(a) * sp);
      d.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      d.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
      d.life = 1.2 + Math.random() * 0.8;
      d.size = (0.25 + Math.random() * 0.45) * scale;
      if (colors) {
        c.set(colors[n % colors.length]!);
        this.debrisMesh.setColorAt(i, c);
      }
    }
    if (colors && this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
  }

  puff(at: Vector3, size = 1.5, color: string = PALETTE.smoke, rise = 2.5, life = 1.6): void {
    const p = this.puffs.find((x) => x.life <= 0) ?? this.puffs[Math.floor(Math.random() * this.puffs.length)]!;
    p.mesh.position.copy(at);
    p.mesh.scale.setScalar(size * 0.4);
    p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    p.mat.color.set(color);
    p.mat.opacity = 0.85;
    p.vel.set((Math.random() - 0.5) * 1.2, rise, (Math.random() - 0.5) * 1.2);
    p.life = life;
    p.max = life;
    p.grow = size;
    p.mesh.visible = true;
  }

  dust(at: Vector3, radius: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const pos = at.clone().add(new Vector3(Math.cos(a) * radius * 0.6, 0.4, Math.sin(a) * radius * 0.6));
      this.puff(pos, radius * 0.5, PALETTE.dust, 1.2, 1.8);
    }
  }

  ring(at: Vector3, radius = 3, color: string = PALETTE.hit): void {
    const r = this.rings.find((x) => x.life <= 0) ?? this.rings[0]!;
    r.mesh.position.set(at.x, at.y + 0.08, at.z);
    r.mat.color.set(color);
    r.life = 0.45;
    r.max = 0.45;
    r.radius = radius;
    r.mesh.visible = true;
  }

  update(dt: number): void {
    let dirty = false;
    for (let i = 0; i < DEBRIS_MAX; i++) {
      const d = this.debris[i]!;
      if (!d.alive) continue;
      dirty = true;
      d.life -= dt;
      d.vel.y += GRAVITY * dt;
      d.pos.addScaledVector(d.vel, dt);
      if (d.pos.y < d.size / 2) {
        d.pos.y = d.size / 2;
        d.vel.y *= -0.3;
        d.vel.x *= 0.6;
        d.vel.z *= 0.6;
      }
      d.rot.addScaledVector(d.spin, dt);
      const s = d.life > 0.3 ? d.size : Math.max(0, (d.size * d.life) / 0.3);
      if (d.life <= 0) d.alive = false;
      this.tmp.position.copy(d.pos);
      this.tmp.rotation.set(d.rot.x, d.rot.y, d.rot.z);
      this.tmp.scale.setScalar(d.alive ? s : 0);
      this.tmp.updateMatrix();
      this.debrisMesh.setMatrixAt(i, this.tmp.matrix);
    }
    if (dirty) this.debrisMesh.instanceMatrix.needsUpdate = true;

    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const t = 1 - p.life / p.max;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 0.8);
      p.mesh.scale.setScalar(p.grow * (0.4 + t * 0.9));
      p.mat.opacity = 0.85 * (1 - t);
      if (p.life <= 0) p.mesh.visible = false;
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.mesh.scale.setScalar(r.radius * (0.3 + t));
      r.mat.opacity = 0.8 * (1 - t);
      if (r.life <= 0) r.mesh.visible = false;
    }
  }
}
