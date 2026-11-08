import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Object3D,
} from 'three';
import { amber, brown, cyan, grass, gray, iris, jade, lime, olive, orange, pink, plum, slate, tomato, violet } from '@radix-ui/colors';
import { PALETTE } from './palette.ts';

/** Small builder for things no free model covers, styled to sit next to the Polyfork low-poly set. */

const mat = (color: string) => new MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0 });

function teepee(radius: number, height: number, band: string): Group {
  const g = new Group();
  const hide = new Mesh(new ConeGeometry(radius, height, 9, 1, true), mat(PALETTE.hide));
  hide.position.y = height / 2;
  hide.material.side = 2;
  g.add(hide);
  // A painted band a third of the way up.
  const bandH = height * 0.12;
  const at = height * 0.3;
  const rLow = radius * (1 - at / height) + 0.02;
  const rHigh = radius * (1 - (at + bandH) / height) + 0.02;
  const stripe = new Mesh(new CylinderGeometry(rHigh, rLow, bandH, 9, 1, true), mat(band));
  stripe.position.y = at + bandH / 2;
  g.add(stripe);
  // Door flap.
  const door = new Mesh(new ConeGeometry(radius * 0.32, height * 0.38, 3), mat(PALETTE.hideDark));
  door.position.set(0, height * 0.19, radius * 0.78);
  door.rotation.x = -0.32;
  g.add(door);
  // Poles poking out of the top.
  const poleMat = mat(PALETTE.pole);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pole = new Mesh(new CylinderGeometry(0.05, 0.07, height * 0.45, 5), poleMat);
    pole.position.set(Math.cos(a) * 0.18, height * 0.98, Math.sin(a) * 0.18);
    pole.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    g.add(pole);
  }
  g.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function shadows(g: Object3D): Object3D {
  g.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/** A skep: stacked straw rings on a stump, with a dark door. */
function hive(): Object3D {
  const g = new Group();
  const stump = new Mesh(new CylinderGeometry(0.9, 1.05, 0.7, 8), mat(brown.brown9));
  stump.position.y = 0.35;
  g.add(stump);
  const rings = 5;
  for (let i = 0; i < rings; i++) {
    const r = 1.1 * Math.cos((i / rings) * Math.PI * 0.48) + 0.15;
    const ring = new Mesh(new CylinderGeometry(r * 0.92, r, 0.42, 12), mat(i % 2 ? amber.amber9 : amber.amber8));
    ring.position.y = 0.9 + i * 0.4;
    g.add(ring);
  }
  const cap = new Mesh(new SphereGeometry(0.4, 8, 6), mat(amber.amber10));
  cap.position.y = 0.9 + rings * 0.4;
  g.add(cap);
  const door = new Mesh(new SphereGeometry(0.22, 8, 6), mat(brown.brown12));
  door.position.set(0, 1.05, 1.02);
  door.scale.set(1.2, 0.8, 0.5);
  g.add(door);
  return shadows(g);
}

/** A patch of tall wildflowers in every colour. */
function meadow(): Object3D {
  const g = new Group();
  const colors = [pink.pink9, violet.violet9, amber.amber9, plum.plum9, orange.orange9, iris.iris9];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const r = Math.sqrt(i / 26) * 2.3;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.7 + ((i * 37) % 10) / 14;
    const stem = new Mesh(new CylinderGeometry(0.04, 0.05, h, 4), mat(grass.grass9));
    stem.position.set(x, h / 2, z);
    g.add(stem);
    const bloom = new Mesh(new IcosahedronGeometry(0.22, 0), mat(colors[i % colors.length]!));
    bloom.position.set(x, h + 0.1, z);
    g.add(bloom);
    if (i % 3 === 0) {
      const leaf = new Mesh(new ConeGeometry(0.3, 0.6, 4), mat(lime.lime9));
      leaf.position.set(x + 0.2, 0.3, z);
      g.add(leaf);
    }
  }
  return shadows(g);
}

/** A dark rock mound with a cave mouth. */
function batCave(): Object3D {
  const g = new Group();
  const rock = new Mesh(new DodecahedronGeometry(2.2, 0), mat(slate.slate10));
  rock.scale.set(1.2, 0.75, 1);
  rock.position.y = 1.1;
  g.add(rock);
  const top = new Mesh(new DodecahedronGeometry(1.2, 0), mat(slate.slate11));
  top.position.set(0.5, 2.2, -0.3);
  g.add(top);
  const mouth = new Mesh(new SphereGeometry(0.75, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(gray.gray12));
  mouth.rotation.x = Math.PI / 2;
  mouth.position.set(0, 0.8, 1.9);
  g.add(mouth);
  return shadows(g);
}

/** A flat wing from a list of points (x, z) in the wing's plane. */
function wing(points: [number, number][], color: string, name: string): Mesh {
  const geo = new BufferGeometry();
  const v: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    for (const p of [points[0]!, points[i]!, points[i + 1]!]) v.push(p[0], 0, p[1]);
  }
  geo.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  geo.computeVertexNormals();
  const m = new Mesh(geo, new MeshStandardMaterial({ color, flatShading: true, side: DoubleSide, roughness: 0.8 }));
  m.name = name;
  return m;
}

/** A butterfly with two flapping wing pairs (the scene finds the wings by name). */
function butterfly(): Object3D {
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(0.05, 0.05, 0.7, 5), mat(slate.slate12));
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.3;
  g.add(body);
  const shape: [number, number][] = [
    [0, 0.25],
    [0.55, 0.5],
    [0.75, 0.05],
    [0.55, -0.35],
    [0, -0.25],
  ];
  for (const side of [1, -1]) {
    const pivot = new Group();
    pivot.name = side > 0 ? 'wingR' : 'wingL';
    pivot.position.y = 0.3;
    const w = wing(shape.map(([x, z]) => [x * side, z]), side > 0 ? orange.orange9 : orange.orange9, 'wing');
    const spot = wing(shape.map(([x, z]) => [x * side * 0.45 + side * 0.2, z * 0.4 + 0.1]), slate.slate12, 'spot');
    spot.position.y = 0.01;
    pivot.add(w, spot);
    g.add(pivot);
  }
  return g;
}

/** A bat: a dark body with membrane wings. */
function bat(): Object3D {
  const g = new Group();
  const body = new Mesh(new SphereGeometry(0.22, 8, 6), mat(slate.slate12));
  body.scale.set(0.8, 0.8, 1.3);
  body.position.y = 0.3;
  g.add(body);
  for (const side of [-1, 1]) {
    const ear = new Mesh(new ConeGeometry(0.06, 0.18, 4), mat(slate.slate12));
    ear.position.set(side * 0.09, 0.5, 0.18);
    g.add(ear);
  }
  const shape: [number, number][] = [
    [0, 0.15],
    [0.45, 0.3],
    [0.9, 0.1],
    [0.75, -0.15],
    [0.5, -0.05],
    [0.3, -0.2],
    [0, -0.15],
  ];
  for (const side of [1, -1]) {
    const pivot = new Group();
    pivot.name = side > 0 ? 'wingR' : 'wingL';
    pivot.position.y = 0.3;
    pivot.add(wing(shape.map(([x, z]) => [x * side, z]), iris.iris12, 'wing'));
    g.add(pivot);
  }
  return g;
}

/** Nature's rally flag: a pole and a leaf-green banner. */
function flag(): Object3D {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.06, 0.08, 4, 6), mat(brown.brown10));
  pole.position.y = 2;
  g.add(pole);
  const cloth = wing(
    [
      [0, 0],
      [1.6, -0.45],
      [0, -0.9],
    ],
    grass.grass9,
    'cloth',
  );
  cloth.rotation.x = Math.PI / 2;
  cloth.position.set(0.04, 3.9, 0);
  g.add(cloth);
  const leaf = new Mesh(new ConeGeometry(0.18, 0.5, 4), mat(jade.jade11));
  leaf.rotation.z = -Math.PI / 2;
  leaf.position.set(0.55, 3.45, 0.02);
  g.add(leaf);
  const base = new Mesh(new CylinderGeometry(0.35, 0.45, 0.25, 8), mat(gray.gray9));
  base.position.y = 0.12;
  g.add(base);
  return shadows(g);
}

/** A scarecrow: pole, crossbar, straw body, a sack head with a hat. */
function scarecrow(): Object3D {
  const g = new Group();
  const wood = mat(brown.brown10);
  const pole = new Mesh(new CylinderGeometry(0.08, 0.1, 3.2, 6), wood);
  pole.position.y = 1.6;
  const bar = new Mesh(new CylinderGeometry(0.07, 0.07, 2.2, 6), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 2.3;
  const body = new Mesh(new CylinderGeometry(0.35, 0.5, 1.1, 7), mat(amber.amber8));
  body.position.y = 2.05;
  const shirt = new Mesh(new CylinderGeometry(0.38, 0.4, 0.55, 7), mat(iris.iris9));
  shirt.position.y = 2.35;
  const head = new Mesh(new SphereGeometry(0.32, 8, 6), mat(amber.amber6));
  head.position.y = 2.95;
  const brim = new Mesh(new CylinderGeometry(0.6, 0.6, 0.06, 10), mat(amber.amber10));
  brim.position.y = 3.2;
  const crown = new Mesh(new ConeGeometry(0.3, 0.45, 8), mat(amber.amber10));
  crown.position.y = 3.45;
  for (const side of [-1, 1]) {
    const straw = new Mesh(new ConeGeometry(0.16, 0.45, 5), mat(amber.amber9));
    straw.rotation.z = (side * Math.PI) / 2;
    straw.position.set(side * 1.2, 2.3, 0);
    g.add(straw);
  }
  g.add(pole, bar, body, shirt, head, brim, crown);
  return shadows(g);
}

/** A stone dam across a river cell, water spilling over the top. */
function dam(): Object3D {
  const g = new Group();
  const stone = mat(gray.gray9);
  const dark = mat(gray.gray10);
  const wall = new Mesh(new BoxGeometry(4.2, 3.4, 1.4), stone);
  wall.position.y = 1.7;
  g.add(wall);
  for (let i = 0; i < 6; i++) {
    const block = new Mesh(new BoxGeometry(0.62, 0.42, 0.18), i % 2 ? dark : stone);
    block.position.set(-1.6 + i * 0.64, 0.6 + (i % 3) * 0.9, 0.75);
    g.add(block);
  }
  const cap = new Mesh(new BoxGeometry(4.4, 0.3, 1.7), dark);
  cap.position.y = 3.5;
  g.add(cap);
  const spill = new Mesh(new BoxGeometry(1.4, 2.6, 0.12), new MeshStandardMaterial({ color: cyan.cyan7, transparent: true, opacity: 0.75, flatShading: true }));
  spill.position.set(0.6, 2.1, 0.8);
  g.add(spill);
  return shadows(g);
}

/** An electric bug zapper: a pole with a glowing violet cage. */
function zapper(): Object3D {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.07, 0.09, 2.8, 6), mat(slate.slate10));
  pole.position.y = 1.4;
  const cage = new Mesh(new CylinderGeometry(0.42, 0.42, 0.9, 8), new MeshStandardMaterial({ color: violet.violet9, emissive: violet.violet9, emissiveIntensity: 1.2, flatShading: true }));
  cage.position.y = 3.1;
  cage.name = 'glow';
  const top = new Mesh(new ConeGeometry(0.55, 0.35, 8), mat(slate.slate11));
  top.position.y = 3.72;
  const bottom = new Mesh(new CylinderGeometry(0.5, 0.45, 0.12, 8), mat(slate.slate11));
  bottom.position.y = 2.62;
  g.add(pole, cage, top, bottom);
  return shadows(g);
}

/** A jagged rock where the wolves howl. */
function howlRock(): Object3D {
  const g = new Group();
  const base = new Mesh(new DodecahedronGeometry(1.6, 0), mat(slate.slate9));
  base.scale.set(1.3, 0.7, 1);
  base.position.y = 0.8;
  const spire = new Mesh(new ConeGeometry(0.8, 3.4, 5), mat(slate.slate10));
  spire.position.set(0.3, 2.4, -0.2);
  spire.rotation.z = -0.25;
  const ledge = new Mesh(new BoxGeometry(1.1, 0.25, 0.7), mat(slate.slate8));
  ledge.position.set(0.9, 2.6, 0.2);
  ledge.rotation.z = 0.15;
  g.add(base, spire, ledge);
  return shadows(g);
}

/** A tangle of thorny branches with red berries. */
function thorns(): Object3D {
  const g = new Group();
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996;
    const r = 0.4 + (i % 5) * 0.4;
    const spike = new Mesh(new ConeGeometry(0.16, 1.2 + (i % 3) * 0.5, 4), mat(i % 3 ? olive.olive11 : brown.brown11));
    spike.position.set(Math.cos(a) * r, 0.6, Math.sin(a) * r);
    spike.rotation.set(Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7);
    g.add(spike);
    if (i % 3 === 0) {
      const berry = new Mesh(new SphereGeometry(0.12, 6, 4), mat(tomato.tomato9));
      berry.position.set(Math.cos(a) * r * 1.1, 1, Math.sin(a) * r * 1.1);
      g.add(berry);
    }
  }
  const bush = new Mesh(new IcosahedronGeometry(1, 0), mat(olive.olive10));
  bush.scale.set(1.4, 0.6, 1.4);
  bush.position.y = 0.4;
  g.add(bush);
  return shadows(g);
}

/** A toxic marsh: a green pool with bubbles and dead reeds. */
function marsh(): Object3D {
  const g = new Group();
  const pool = new Mesh(new CylinderGeometry(2.5, 2.6, 0.2, 14), new MeshStandardMaterial({ color: lime.lime10, emissive: lime.lime9, emissiveIntensity: 0.25, flatShading: true }));
  pool.position.y = 0.1;
  pool.scale.z = 0.8;
  g.add(pool);
  for (let i = 0; i < 7; i++) {
    const a = i * 1.9;
    const bub = new Mesh(new SphereGeometry(0.14 + (i % 3) * 0.07, 6, 4), mat(lime.lime8));
    bub.position.set(Math.cos(a) * 1.2, 0.25, Math.sin(a) * 0.9);
    g.add(bub);
  }
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7;
    const reed = new Mesh(new CylinderGeometry(0.03, 0.05, 1 + (i % 3) * 0.4, 4), mat(brown.brown9));
    reed.position.set(Math.cos(a) * 2.4, 0.6, Math.sin(a) * 1.9);
    reed.rotation.z = Math.sin(i) * 0.3;
    g.add(reed);
  }
  return shadows(g);
}

/** A wall of wild vines, leaves sprouting all over. */
function vineWall(): Object3D {
  const g = new Group();
  for (let i = 0; i < 7; i++) {
    const x = -2.4 + i * 0.8;
    const h = 2.2 + Math.sin(i * 1.7) * 0.8;
    const stem = new Mesh(new CylinderGeometry(0.12, 0.22, h, 5), mat(olive.olive10));
    stem.position.set(x, h / 2, Math.sin(i) * 0.3);
    stem.rotation.z = Math.sin(i * 2.1) * 0.25;
    g.add(stem);
    for (let k = 0; k < 3; k++) {
      const leaf = new Mesh(new ConeGeometry(0.35, 0.7, 4), mat(k % 2 ? grass.grass9 : jade.jade9));
      leaf.position.set(x + (k - 1) * 0.3, 0.6 + k * h * 0.3, Math.sin(i + k) * 0.5);
      leaf.rotation.set(Math.sin(i + k), 0, Math.cos(i * k) * 1.2);
      g.add(leaf);
    }
  }
  const knot = new Mesh(new IcosahedronGeometry(0.9, 0), mat(grass.grass10));
  knot.scale.set(2.6, 0.6, 1);
  knot.position.y = 0.3;
  g.add(knot);
  return shadows(g);
}

export const PROCEDURAL: Record<string, () => Object3D> = {
  scarecrow,
  dam,
  zapper,
  'howl-rock': howlRock,
  thorns,
  marsh,
  'vine-wall': vineWall,
  teepee: () => teepee(2.6, 5.2, PALETTE.hideBand),
  'teepee-lab': () => teepee(3.4, 7.6, PALETTE.labBand),
  hive,
  meadow,
  'bat-cave': batCave,
  butterfly,
  bat,
  flag,
};
