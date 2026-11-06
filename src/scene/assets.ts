import { Box3, Group, Vector3, type AnimationClip, type Mesh, type Object3D, type SkinnedMesh } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { VARIANTS, applyVariant } from './kitbash.ts';
import { PROCEDURAL } from './procedural.ts';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const files = new Map<string, Promise<GLTF>>();
const templates = new Map<string, Promise<Template>>();

interface Template {
  scene: Object3D;
  clips: AnimationClip[];
  skinned: boolean;
}

export function modelUrl(name: string): string {
  return `${import.meta.env.BASE_URL}models/${name}.glb`;
}

export function loadModel(name: string): Promise<GLTF> {
  let p = files.get(name);
  if (!p) {
    p = loader.loadAsync(modelUrl(name)).then((gltf) => {
      gltf.scene.traverse((o) => {
        if ((o as Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          // Skinned meshes move outside their bind-pose bounds; static ones can be culled.
          if ((o as SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
        }
      });
      return gltf;
    });
    p.catch(() => files.delete(name));
    files.set(name, p);
  }
  return p;
}

/** A plain model, or a kitbashed variant built once and cloned per instance. */
function template(key: string): Promise<Template> {
  let t = templates.get(key);
  if (!t && PROCEDURAL[key]) {
    t = Promise.resolve({ scene: PROCEDURAL[key]!(), clips: [], skinned: false });
    templates.set(key, t);
  }
  if (!t) {
    const spec = VARIANTS[key];
    t = loadModel(spec ? spec.base : key).then((gltf) => {
      let skinned = false;
      gltf.scene.traverse((o) => {
        if ((o as SkinnedMesh).isSkinnedMesh) skinned = true;
      });
      if (!spec) return { scene: gltf.scene, clips: gltf.animations, skinned };
      const scene = cloneSkinned(gltf.scene);
      applyVariant(scene, spec);
      return { scene, clips: gltf.animations, skinned };
    });
    t.catch(() => templates.delete(key));
    templates.set(key, t);
  }
  return t;
}

export interface Prepared {
  /** A fresh, independent copy with feet on y = 0 and the longest horizontal side = `size`. */
  object: Group;
  /** The cloned model inside the normalising wrappers (bones live here). */
  model: Object3D;
  clips: AnimationClip[];
  height: number;
}

/** Clone a model and normalise it: centre on x/z, rest on the ground, scale to `size`. */
export async function instantiate(key: string, size: number, by: 'length' | 'height' = 'length'): Promise<Prepared> {
  const t = await template(key);
  const src = t.skinned ? cloneSkinned(t.scene) : t.scene.clone(true);
  src.updateMatrixWorld(true);
  const box = new Box3().setFromObject(src);
  const dims = box.getSize(new Vector3());
  const ref = by === 'height' ? dims.y : Math.max(dims.x, dims.z);
  const scale = ref > 0 ? size / ref : 1;
  const center = box.getCenter(new Vector3());
  const offset = new Group();
  offset.position.set(-center.x, -box.min.y, -center.z);
  offset.add(src);
  const inner = new Group();
  inner.add(offset);
  inner.scale.setScalar(scale);
  const outer = new Group();
  outer.add(inner);
  return { object: outer, model: src, clips: t.clips, height: dims.y * scale };
}

export function findClip(clips: AnimationClip[], ...names: string[]): AnimationClip | undefined {
  for (const n of names) {
    const c = clips.find((a) => a.name.toLowerCase() === n.toLowerCase());
    if (c) return c;
  }
  return clips[0];
}
