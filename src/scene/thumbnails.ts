import {
  DirectionalLight,
  HemisphereLight,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  Box3,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { instantiate } from './assets.ts';
import { PALETTE } from './palette.ts';

const SIZE = 192;
let renderer: WebGLRenderer | null = null;
const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

export interface ThumbOptions {
  /** Keep only the top part of the model (0–1 of its height): 0.5 frames a human as a bust. */
  crop?: number;
  /** How much of the square the silhouette fills. */
  fill?: number;
}

function getRenderer(): WebGLRenderer {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

/** Every vertex in world space, skinning applied, so the frame hugs the real silhouette. */
function worldVertices(root: Object3D): Vector3[] {
  root.updateMatrixWorld(true);
  const out: Vector3[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    if ((mesh as SkinnedMesh).isSkinnedMesh) (mesh as SkinnedMesh).skeleton.update();
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      const v = new Vector3();
      mesh.getVertexPosition(i, v);
      out.push(v.applyMatrix4(mesh.matrixWorld));
    }
  });
  return out;
}

async function render(model: string, opts: ThumbOptions): Promise<string> {
  const prep = await instantiate(model, 2);
  const scene = new Scene();
  scene.add(new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 2.4));
  const sun = new DirectionalLight(PALETTE.sun, 2.4);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const obj = prep.object;
  obj.rotation.y = -Math.PI / 4.5;
  scene.add(obj);

  let verts = worldVertices(obj);
  const box = new Box3().setFromPoints(verts);
  if (opts.crop && opts.crop < 1) {
    const cut = box.max.y - (box.max.y - box.min.y) * opts.crop;
    verts = verts.filter((v) => v.y >= cut);
    box.setFromPoints(verts);
  }
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.62;
  const cam = new PerspectiveCamera(28, 1, 0.1, 100);
  const dist = radius / Math.tan((28 * Math.PI) / 360);
  cam.position.set(center.x + dist * 0.55, center.y + dist * 0.42, center.z + dist * 0.75);
  cam.lookAt(center);
  cam.updateMatrixWorld();

  // Zoom and shift so the projected silhouette fills the square.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const p = new Vector3();
  for (const v of verts) {
    p.copy(v).project(cam);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (Number.isFinite(minX)) {
    const half = Math.max(maxX - minX, maxY - minY) / 2;
    cam.zoom = (opts.fill ?? 0.9) / Math.max(half, 1e-3);
    const cx = ((minX + maxX) / 2) * cam.zoom;
    const cy = ((minY + maxY) / 2) * cam.zoom;
    cam.setViewOffset(SIZE, SIZE, (cx * SIZE) / 2, (-cy * SIZE) / 2, SIZE, SIZE);
    cam.updateProjectionMatrix();
  }

  const r = getRenderer();
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
}

/** A transparent PNG of the model in three-quarter view, rendered once and cached. */
export function thumbnail(model: string, opts: ThumbOptions = {}): Promise<string> {
  const key = `${model}|${opts.crop ?? 1}|${opts.fill ?? 0.9}`;
  let p = cache.get(key);
  if (!p) {
    const job = queue.then(() => render(model, opts));
    queue = job.catch(() => undefined);
    p = job;
    cache.set(key, p);
  }
  return p;
}
