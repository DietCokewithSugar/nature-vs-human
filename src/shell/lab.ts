/**
 * Dev-only model gallery: every creature view, domestic animal and human in a grid.
 * Open /lab.html with the dev server (/lab.html?set=world for lairs and landmarks, ?set=procedural for models built in code).
 * Not part of the production build.
 * ?anim=Walk plays that clip; ?side shows profiles.
 */
import {
  AnimationMixer,
  Clock,
  DirectionalLight,
  HemisphereLight,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { findClip, instantiate } from '../scene/assets.ts';
import { HumanRig } from '../scene/humanRig.ts';
import { PALETTE } from '../scene/palette.ts';

const params = new URLSearchParams(location.search);
// ?set=world shows the models built in Blender (tools/blender/models.py): lairs, landmarks, outposts, props.
const SETS: Record<string, string[]> = {
  creatures: [
    'ant', 'wolf', 'sabertooth', 'cavebear', 'mammoth',
    'locust', 'rat', 'wildcat', 'boar', 'crocodile',
    'mosquito', 'pigeon', 'octopus', 'shark', 'bison',
    'termite', 'crow', 'tiger', 'rhino', 'elephant',
    'dog', 'cat', 'pig', 'hunter-1', 'hunter-2', 'hunter-3', 'hunter-4', 'scientist',
    'bee', 'butterfly', 'bat', 'taxi', 'airliner',
  ],
  world: [
    'lair-anthill', 'lair-den', 'lair-cave', 'lair-cave-big', 'lair-glacier',
    'lair-flowers', 'lair-burrow', 'lair-thicket', 'lair-wallow', 'lair-reeds',
    'lair-pond', 'lair-nest-tree', 'lair-reef', 'lair-reef-deep', 'lair-prairie',
    'lair-termite-mound', 'lair-dead-tree', 'lair-jungle', 'lair-wallow-big', 'lair-baobab',
    'volcano', 'watchtower', 'wind-turbine', 'oil-rig', 'mine-head', 'geothermal',
    'grass-tuft', 'fern', 'wildflowers', 'vines', 'stump', 'fence', 'log-pile',
  ],
  // Built in code (src/scene/procedural.ts): pollinator homes, effect buildings, the rally flag.
  procedural: ['teepee', 'teepee-lab', 'hive', 'meadow', 'bat-cave', 'scarecrow', 'dam', 'zapper', 'howl-rock', 'thorns', 'marsh', 'vine-wall', 'flag'],
};
const keys = params.get('only')?.split(',') ?? SETS[params.get('set') ?? 'creatures'] ?? SETS.creatures!;
const cols = Number(params.get('cols') ?? 7);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NeutralToneMapping;
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(PALETTE.skyBottom);
const scene = new Scene();
scene.add(new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 2.2));
const sun = new DirectionalLight(PALETTE.sun, 2.4);
sun.position.set(5, 10, 8);
scene.add(sun);
const rows = Math.ceil(keys.length / cols);
const gap = 3.2;
const camera = new PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 500);
const side = params.has('side');
const center = new Vector3(((cols - 1) * gap) / 2, 0.6, ((rows - 1) * gap) / 2);
const fit = (cols * gap) / 2 / Math.tan((15 * Math.PI) / 180) / (innerWidth / innerHeight) + rows * gap;
camera.position.copy(center).add(side ? new Vector3(0, fit * 0.25, fit) : new Vector3(fit * 0.45, fit * 0.7, fit * 0.8));
camera.lookAt(center);

const mixers: AnimationMixer[] = [];
const rigs: HumanRig[] = [];
const labels = document.getElementById('labels')!;
const placed: { el: HTMLElement; pos: Vector3 }[] = [];

await Promise.all(
  keys.map(async (key, i) => {
    const human = key.startsWith('hunter') || key === 'scientist';
    const prep = await instantiate(key, human ? 2 : 2.4, human ? 'height' : 'length');
    const x = (i % cols) * gap;
    const z = Math.floor(i / cols) * gap;
    prep.object.position.set(x, 0, z);
    if (side) prep.object.rotation.y = Math.PI / 2;
    scene.add(prep.object);
    if (prep.clips.length) {
      const mixer = new AnimationMixer(prep.model);
      const clip = findClip(prep.clips, params.get('anim') ?? 'Idle', 'Idle');
      if (clip) mixer.clipAction(clip).play();
      mixers.push(mixer);
    } else if (human) {
      rigs.push(new HumanRig(prep.model));
    }
    const el = document.createElement('span');
    el.textContent = key;
    labels.appendChild(el);
    placed.push({ el, pos: new Vector3(x, -0.3, z + 1.2) });
  }),
);

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  for (const m of mixers) m.update(dt);
  for (const r of rigs) r.update(dt, params.has('still') ? 0 : 1);
  renderer.render(scene, camera);
  for (const p of placed) {
    const v = p.pos.clone().project(camera);
    p.el.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    p.el.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  }
});
(window as unknown as { __ready: boolean }).__ready = true;
