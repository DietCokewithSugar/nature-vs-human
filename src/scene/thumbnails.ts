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
} from 'three';
import { instantiate } from './assets.ts';
import { PALETTE } from './palette.ts';

const SIZE = 128;
let renderer: WebGLRenderer | null = null;
const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

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

async function render(model: string): Promise<string> {
  const prep = await instantiate(model, 2);
  const scene = new Scene();
  scene.add(new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 2.4));
  const sun = new DirectionalLight(PALETTE.sun, 2.4);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const obj = prep.object;
  obj.rotation.y = -Math.PI / 4.5;
  scene.add(obj);
  const box = new Box3().setFromObject(obj);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.62;
  const cam = new PerspectiveCamera(28, 1, 0.1, 100);
  const dist = radius / Math.tan((28 * Math.PI) / 360);
  cam.position.set(center.x + dist * 0.55, center.y + dist * 0.42, center.z + dist * 0.75);
  cam.lookAt(center);
  const r = getRenderer();
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
}

/** A transparent PNG of the model in three-quarter view, rendered once and cached. */
export function thumbnail(model: string): Promise<string> {
  let p = cache.get(model);
  if (!p) {
    const job = queue.then(() => render(model));
    queue = job.catch(() => undefined);
    p = job;
    cache.set(model, p);
  }
  return p;
}
