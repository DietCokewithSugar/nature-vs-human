import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import { PALETTE } from './palette.ts';

const MAX_BARS = 2400;

/**
 * Health and lifespan bars as camera-facing quads in one instanced draw.
 * Drawn over everything (like an RTS) and scaled up a little with distance so they stay readable.
 */
export class Bars {
  readonly mesh: InstancedMesh;
  private n = 0;
  private q = new Quaternion();
  private right = new Vector3();
  private up = new Vector3();
  private m = new Matrix4();
  private p = new Vector3();
  private s = new Vector3();
  private c = new Color();
  private cam = new Vector3();

  constructor(scene: Scene) {
    const mat = new MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, MAX_BARS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.count = 0;
    for (let i = 0; i < MAX_BARS; i++) this.mesh.setColorAt(i, this.c.set(0xffffff));
    scene.add(this.mesh);
  }

  begin(camera: Camera): void {
    this.n = 0;
    this.q.copy(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.q);
    this.up.set(0, 1, 0).applyQuaternion(this.q);
    camera.getWorldPosition(this.cam);
  }

  /** Scale for things that should keep roughly the same size on screen. */
  scaleAt(x: number, y: number, z: number): number {
    const d = Math.hypot(this.cam.x - x, this.cam.y - y, this.cam.z - z);
    return Math.min(1.8, Math.max(0.6, d / 95));
  }

  private quad(x: number, y: number, z: number, w: number, h: number, color: string): void {
    if (this.n >= MAX_BARS) return;
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(w, h, 1));
    this.mesh.setMatrixAt(this.n, this.m);
    this.mesh.setColorAt(this.n, this.c.set(color));
    this.n++;
  }

  /**
   * Stacked bars centred over a point: each row is a fill fraction and a colour.
   * `width` and `height` are in world units before the distance scale.
   */
  stack(x: number, y: number, z: number, width: number, height: number, rows: { f: number; color: string }[]): void {
    const k = this.scaleAt(x, y, z);
    const w = width * k;
    const h = height * k;
    const gap = h * 0.35;
    const total = rows.length * h + (rows.length - 1) * gap;
    const pad = h * 0.45;
    // One backing plate for the whole stack.
    const cy = y + total / 2;
    this.quad(x, cy, z, w + pad * 2, total + pad * 2, PALETTE.barBack);
    rows.forEach((row, i) => {
      const f = Math.max(0, Math.min(1, row.f));
      const ry = y + total - h / 2 - i * (h + gap);
      if (f <= 0.001) return;
      const off = (w * (1 - f)) / 2;
      this.quad(x - this.right.x * off, ry - this.right.y * off, z - this.right.z * off, w * f, h, row.color);
    });
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** A round badge with an emoji or a character, drawn once into a texture. */
function badge(text: string, bg: string, ring: string, size = 128): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
  g.fillStyle = bg;
  g.fill();
  g.lineWidth = size * 0.07;
  g.strokeStyle = ring;
  g.stroke();
  g.font = `${Math.round(size * 0.48)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","ZCOOL KuaiLe",sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#1d211c';
  g.fillText(text, size / 2, size / 2 + size * 0.03);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export type IconKind = 'meat' | 'graze' | 'meal' | 'rest' | 'pollen' | 'heal' | 'dazed';

const ICON_TEXT: Record<IconKind, [string, string, string]> = {
  meat: ['🍖', '#fff4e6', '#e5484d'],
  graze: ['🌿', '#effbe9', '#46a758'],
  meal: ['🍙', '#fffbeb', '#ffba18'],
  rest: ['💤', '#eef1ff', '#6e56cf'],
  pollen: ['🌼', '#fffbeb', '#ffba18'],
  heal: ['💚', '#effbe9', '#46a758'],
  dazed: ['💫', '#f4f0fe', '#8e4ec6'],
};

/** Status icons over heads (foraging, resting), pooled sprites. */
export class Icons {
  private pool: Sprite[] = [];
  private mats = new Map<IconKind, SpriteMaterial>();
  private n = 0;
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private mat(kind: IconKind): SpriteMaterial {
    let m = this.mats.get(kind);
    if (!m) {
      const [t, bg, ring] = ICON_TEXT[kind];
      m = new SpriteMaterial({ map: badge(t, bg, ring), depthTest: false, depthWrite: false, transparent: true });
      this.mats.set(kind, m);
    }
    return m;
  }

  begin(): void {
    this.n = 0;
  }

  show(kind: IconKind, x: number, y: number, z: number, size: number): void {
    let s = this.pool[this.n];
    if (!s) {
      s = new Sprite(this.mat(kind));
      s.renderOrder = 21;
      this.scene.add(s);
      this.pool.push(s);
    }
    s.material = this.mat(kind);
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    s.visible = true;
    this.n++;
  }

  end(): void {
    for (let i = this.n; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }
}

/** The 自然之元 orb texture: a green glow with 元 in the middle. */
export function essenceTexture(): CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.35, 'rgba(189,238,99,0.98)');
  grad.addColorStop(0.7, 'rgba(41,163,131,0.6)');
  grad.addColorStop(1, 'rgba(41,163,131,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.font = `bold ${Math.round(size * 0.4)}px "ZCOOL KuaiLe", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#1e4a24';
  g.fillText('元', size / 2, size / 2 + 3);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
