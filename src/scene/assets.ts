import { Box3, Group, Mesh, Vector3, type AnimationClip, type Object3D, type SkinnedMesh } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, Promise<GLTF>>();

export function modelUrl(name: string): string {
  return `${import.meta.env.BASE_URL}models/${name}.glb`;
}

export function loadModel(name: string): Promise<GLTF> {
  let p = cache.get(name);
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
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}

export interface Prepared {
  /** A fresh, independent copy with feet on y = 0 and the longest horizontal side = `size`. */
  object: Group;
  clips: AnimationClip[];
  height: number;
}

/**
 * Clone a model and normalise it: centre on x/z, rest on the ground, scale to `size`.
 * `by` chooses which dimension `size` refers to.
 */
export async function instantiate(name: string, size: number, by: 'length' | 'height' = 'length'): Promise<Prepared> {
  const gltf = await loadModel(name);
  const src = gltf.animations.length ? cloneSkinned(gltf.scene) : gltf.scene.clone(true);
  const box = new Box3().setFromObject(src);
  const dims = box.getSize(new Vector3());
  const ref = by === 'height' ? dims.y : Math.max(dims.x, dims.z);
  const scale = ref > 0 ? size / ref : 1;
  const center = box.getCenter(new Vector3());
  src.position.set(-center.x, -box.min.y, -center.z);
  const inner = new Group();
  inner.add(src);
  inner.scale.setScalar(scale);
  const outer = new Group();
  outer.add(inner);
  return { object: outer, clips: gltf.animations, height: dims.y * scale };
}

export function findClip(clips: AnimationClip[], ...names: string[]): AnimationClip | undefined {
  for (const n of names) {
    const c = clips.find((a) => a.name.toLowerCase() === n.toLowerCase());
    if (c) return c;
  }
  return clips[0];
}

export function disposeObject(o: Object3D): void {
  o.removeFromParent();
}
