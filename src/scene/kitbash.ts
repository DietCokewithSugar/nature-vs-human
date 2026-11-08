import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Bone,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { amber, brown, gray, lime, olive, orange, sand, slate } from '@radix-ui/colors';

/**
 * Variants built from Polyfork base models: recoloured with Radix scales and fitted with
 * procedural parts (tusks, fangs, horns, a proboscis) parented to the head bone so they animate.
 * The geometry we add is ours; the base meshes stay CC BY 4.0 Polyfork models (noted in CREDITS).
 */

type Ramp = [dark: string, light: string];

interface PartSpec {
  kind: 'tusk' | 'fang' | 'horn' | 'proboscis';
  bone: string;
  /** Offset from the bone's bind position, in units of the model length: [side, up, forward]. */
  at: [number, number, number];
  /** Length in model lengths. */
  length: number;
  /** Mirror on the other side as well. */
  pair?: boolean;
}

export interface VariantSpec {
  base: string;
  ramp?: Ramp;
  /** Extra ramp for stripes or a lighter belly. */
  pattern?: { kind: 'stripes' | 'belly' | 'bands' | 'mane'; ramp: Ramp; freq?: number };
  parts?: PartSpec[];
  /** Non-uniform stretch, applied to the whole model: [side, up, forward]. */
  stretch?: [number, number, number];
  /** 0..1: how much of the original light/dark variation survives (spots, patches). */
  contrast?: number;
  /** Recolour even the brightest vertices (white-furred bases). */
  allLight?: boolean;
}

export const VARIANTS: Record<string, VariantSpec> = {
  mammoth: {
    base: 'elephant',
    ramp: [brown.brown12, brown.brown9],
    pattern: { kind: 'mane', ramp: [brown.brown12, brown.brown10] },
    parts: [{ kind: 'tusk', bone: 'Head', at: [0.09, -0.12, 0.2], length: 0.55, pair: true }],
  },
  sabertooth: {
    base: 'cat',
    allLight: true,
    ramp: [amber.amber11, amber.amber8],
    contrast: 0.5,
    pattern: { kind: 'belly', ramp: [sand.sand7, sand.sand3] },
    parts: [{ kind: 'fang', bone: 'Head', at: [0.025, -0.03, 0.15], length: 0.24, pair: true }],
    stretch: [1.15, 1.05, 1],
  },
  tiger: {
    base: 'cat',
    allLight: true,
    ramp: [orange.orange10, orange.orange9],
    contrast: 0.5,
    pattern: { kind: 'stripes', ramp: [slate.slate12, slate.slate11], freq: 26 },
    stretch: [1.12, 1.02, 1.05],
  },
  wildcat: {
    base: 'cat',
    allLight: true,
    ramp: [olive.olive11, sand.sand9],
    contrast: 0.5,
    pattern: { kind: 'stripes', ramp: [olive.olive12, olive.olive11], freq: 30 },
  },
  cavebear: {
    base: 'bear',
    ramp: [brown.brown12, brown.brown10],
  },
  boar: {
    base: 'pig',
    ramp: [brown.brown12, brown.brown10],
    contrast: 0.3,
    pattern: { kind: 'mane', ramp: [gray.gray12, brown.brown11] },
    parts: [{ kind: 'tusk', bone: 'Head', at: [0.05, -0.04, 0.15], length: 0.16, pair: true }],
  },
  rhino: {
    base: 'pig',
    ramp: [slate.slate11, slate.slate8],
    contrast: 0.25,
    parts: [
      { kind: 'horn', bone: 'Head', at: [0, 0.0, 0.17], length: 0.22 },
      { kind: 'horn', bone: 'Head', at: [0, 0.06, 0.1], length: 0.1 },
    ],
    stretch: [1.15, 1, 1.1],
  },
  bison: {
    base: 'ox',
    ramp: [brown.brown12, brown.brown11],
    pattern: { kind: 'mane', ramp: [brown.brown12, brown.brown9] },
  },
  locust: {
    base: 'grasshopper',
    ramp: [brown.brown11, amber.amber9],
  },
  mosquito: {
    base: 'wasp',
    ramp: [slate.slate12, slate.slate10],
    pattern: { kind: 'bands', ramp: [slate.slate11, slate.slate8], freq: 16 },
    parts: [{ kind: 'proboscis', bone: 'Head', at: [0, -0.04, 0.12], length: 0.42 }],
    stretch: [0.7, 0.85, 1],
  },
  termite: {
    base: 'ant',
    ramp: [amber.amber11, sand.sand4],
  },
  bee: {
    base: 'wasp',
    ramp: [amber.amber10, amber.amber9],
    pattern: { kind: 'bands', ramp: [slate.slate12, slate.slate11], freq: 18 },
    stretch: [1, 0.95, 0.8],
  },
  taxi: {
    base: 'coupe',
    ramp: [amber.amber10, amber.amber9],
    contrast: 0.35,
  },
};

/** Model key for each creature view. Plain keys load the file of the same name. */
export function baseModel(key: string): string {
  return VARIANTS[key]?.base ?? key;
}

const IVORY = new MeshStandardMaterial({ color: sand.sand2, roughness: 0.55, metalness: 0 });
const HORN = new MeshStandardMaterial({ color: sand.sand9, roughness: 0.7, metalness: 0 });
const NEEDLE = new MeshStandardMaterial({ color: slate.slate12, roughness: 0.6, metalness: 0 });

const tmpA = new Color();
const tmpB = new Color();

function lum(c: Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Recolour a cloned geometry's vertex colours onto a ramp, keeping eyes and teeth. */
function recolor(mesh: SkinnedMesh | Mesh, spec: VariantSpec, bounds: { min: Vector3; size: Vector3; fwd: number }): void {
  const geo = mesh.geometry.clone();
  mesh.geometry = geo;
  const col = geo.getAttribute('color') as BufferAttribute | undefined;
  const pos = geo.getAttribute('position') as BufferAttribute;
  if (!col || !spec.ramp) return;
  const [d, l] = spec.ramp;
  const dark = new Color(d);
  const light = new Color(l);
  const pDark = spec.pattern ? new Color(spec.pattern.ramp[0]) : null;
  const pLight = spec.pattern ? new Color(spec.pattern.ramp[1]) : null;
  const c = new Color();
  const p = new Vector3();
  for (let i = 0; i < col.count; i++) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    const L = lum(c);
    // Keep pure whites (eyes, teeth) and near-blacks (pupils).
    if ((!spec.allLight && L > 0.93) || L < 0.012) continue;
    const raw = Math.min(1, Math.max(0, (L - 0.03) / 0.7));
    const t = 0.5 + (raw - 0.5) * (spec.contrast ?? 1);
    let target = tmpA.copy(dark).lerp(light, t);
    if (spec.pattern && pDark && pLight) {
      p.fromBufferAttribute(pos, i);
      const u = (p.y - bounds.min.y) / bounds.size.y; // 0 = feet, 1 = top
      const v = ((p.z - bounds.min.z) / bounds.size.z) * bounds.fwd + (bounds.fwd < 0 ? 1 : 0); // 0 = tail, 1 = head
      const freq = spec.pattern.freq ?? 20;
      let w = 0;
      switch (spec.pattern.kind) {
        case 'stripes':
          w = Math.sin(v * freq + Math.sin(u * 9) * 1.4) > 0.55 && u > 0.35 ? 1 : 0;
          break;
        case 'bands':
          w = Math.sin(v * freq) > 0.3 ? 1 : 0;
          break;
        case 'belly':
          w = u < 0.42 ? 1 : 0;
          break;
        case 'mane':
          w = v > 0.55 && u > 0.45 ? 1 : 0;
          break;
      }
      if (w > 0) target = tmpB.copy(pDark).lerp(pLight, t);
    }
    col.setXYZ(i, target.r, target.g, target.b);
  }
  col.needsUpdate = true;
}

/** A tapered, curved tube along a curve: radius shrinks from r0 to r1. */
function taperedTube(curve: CatmullRomCurve3, r0: number, r1: number, segments = 14, radial = 7): BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false);
  const verts: number[] = [];
  const index: number[] = [];
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, p);
    const r = r0 + (r1 - r0) * u;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(frames.normals[i]!).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i]!, Math.sin(a));
      verts.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Part geometry in a frame where +Z is the animal's forward and +Y is up; origin at the root. */
function partMesh(part: PartSpec, L: number, side: number): Mesh {
  const len = part.length * L;
  switch (part.kind) {
    case 'tusk': {
      // Down, forward, then curling up and in.
      const curve = new CatmullRomCurve3([
        new Vector3(0, 0, 0),
        new Vector3(side * len * 0.12, -len * 0.38, len * 0.32),
        new Vector3(side * len * 0.1, -len * 0.3, len * 0.72),
        new Vector3(-side * len * 0.12, len * 0.12, len * 0.9),
      ]);
      const m = new Mesh(taperedTube(curve, len * 0.075, len * 0.02), IVORY);
      return m;
    }
    case 'fang': {
      const g = new ConeGeometry(len * 0.16, len, 7);
      g.translate(0, -len / 2, 0);
      g.rotateX(0.18);
      return new Mesh(g, IVORY);
    }
    case 'horn': {
      const g = new ConeGeometry(len * 0.32, len, 8);
      g.translate(0, len / 2, 0);
      g.rotateX(0.42);
      return new Mesh(g, HORN);
    }
    case 'proboscis': {
      const g = new ConeGeometry(len * 0.035, len, 6);
      g.translate(0, len / 2, 0);
      g.rotateX(Math.PI / 2 + 0.5);
      return new Mesh(g, NEEDLE);
    }
  }
}

function findBone(root: Object3D, name: string): Bone | null {
  let found: Bone | null = null;
  root.traverse((o) => {
    if (!found && (o as Bone).isBone && o.name === name) found = o as Bone;
  });
  return found;
}

/**
 * Apply a variant to a freshly cloned base scene (in the base model's own units).
 * Must run before the scene is normalised by `instantiate`.
 */
export function applyVariant(root: Object3D, spec: VariantSpec): void {
  root.updateMatrixWorld(true);
  // Bounds and facing in model space.
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const meshes: (SkinnedMesh | Mesh)[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) {
      const m = o as Mesh;
      meshes.push(m);
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      min.min(bb.min);
      max.max(bb.max);
    }
  });
  // Geometry space (for colour patterns) can differ from bone space after quantisation,
  // so parts are sized from the skinned, visual bounds instead.
  const size = max.clone().sub(min);
  const visual = new Box3().setFromObject(root).getSize(new Vector3());
  const L = Math.max(visual.x, visual.z);
  const head = findBone(root, 'Head');
  const headPos = head ? head.getWorldPosition(new Vector3()) : new Vector3(0, 0, 1);
  const hips = findBone(root, 'Hips');
  const hipsPos = hips ? hips.getWorldPosition(new Vector3()) : new Vector3();
  const fwd = headPos.z >= hipsPos.z ? 1 : -1;
  for (const m of meshes) recolor(m, spec, { min, size, fwd });

  if (spec.stretch) {
    const [sx, sy, sz] = spec.stretch;
    root.scale.multiply(new Vector3(sx, sy, sz));
  }

  for (const part of spec.parts ?? []) {
    const bone = findBone(root, part.bone);
    if (!bone) continue;
    const bonePos = bone.getWorldPosition(new Vector3());
    const boneQuat = bone.getWorldQuaternion(new Quaternion());
    const boneScale = bone.getWorldScale(new Vector3());
    const sides = part.pair ? [1, -1] : [0];
    for (const s of sides) {
      const sign = s === 0 ? 1 : s;
      const mesh = partMesh(part, L, sign);
      // Model frame: forward is fwd·Z. Flip the part if the model faces −Z.
      const world = bonePos
        .clone()
        .add(new Vector3(part.at[0] * L * sign * fwd, part.at[1] * L, part.at[2] * L * fwd));
      const worldQuat = new Quaternion();
      if (fwd < 0) worldQuat.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
      mesh.position.copy(bone.worldToLocal(world.clone()));
      mesh.quaternion.copy(boneQuat.clone().invert().multiply(worldQuat));
      mesh.scale.set(1 / boneScale.x, 1 / boneScale.y, 1 / boneScale.z);
      mesh.castShadow = true;
      bone.add(mesh);
    }
  }
  void lime;
}
