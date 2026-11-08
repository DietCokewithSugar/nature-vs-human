import { Group, InstancedMesh, Matrix4, Mesh, Object3D, Quaternion, Vector3, type BufferGeometry, type Material } from 'three';
import { CELL, CELLS, GRID, isOpen, type EraId } from '../core/index.ts';
import { instantiate } from './assets.ts';
import { hash, type GroundState, type Terrain } from './terrain.ts';

/** When an item shows: who must hold the cell, and how the fight over it must stand. */
type When = 'wild' | 'neutral' | 'nature' | 'human' | 'creeping';

interface Item {
  model: string;
  cell: number;
  x: number;
  z: number;
  size: number;
  rot: number;
  when: When;
  /** Human items appear from this era on; creeping items need this much progress (0 … 1). */
  from: number;
  /** Shown in these eras only (human props). */
  to?: number;
}

const SIZE: Record<string, [number, number, 'length' | 'height']> = {
  'tree-oak': [4.5, 6.5, 'height'],
  'tree-broadleaf': [4.5, 6, 'height'],
  'tree-birch': [5, 7, 'height'],
  'tree-pine': [5, 7.5, 'height'],
  spruce: [5.5, 8, 'height'],
  bush: [1.8, 3, 'length'],
  fern: [1.2, 1.8, 'length'],
  boulders: [1.4, 2.6, 'length'],
  'grass-tuft': [0.9, 1.4, 'height'],
  wildflowers: [1, 1.6, 'length'],
  vines: [2.2, 3.4, 'length'],
  stump: [0.9, 1.3, 'length'],
  'tree-street': [2.8, 3.4, 'length'],
  'street-lamp': [4.2, 5, 'height'],
  sakura: [3.6, 4.4, 'length'],
};

const pickOf = <T,>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))]!;

const DENSE = ['spruce', 'tree-pine', 'tree-oak', 'tree-broadleaf', 'spruce', 'tree-birch'] as const;
const UNDER = ['fern', 'bush', 'fern', 'grass-tuft'] as const;
const MEADOW = ['wildflowers', 'grass-tuft', 'wildflowers', 'bush', 'grass-tuft', 'wildflowers'] as const;
const SHORE = ['grass-tuft', 'boulders', 'grass-tuft', 'wildflowers'] as const;

/** The scatter is a pure function of the cell, so every run shows the same wilderness. */
function scatter(): Item[] {
  const items: Item[] = [];
  const add = (cell: number, model: string, slot: number, when: When, from = 0, to?: number, sizeScale = 1) => {
    const c = CELLS[cell]!;
    const a = hash(c.i * 7 + slot, c.j * 3 - slot);
    const b = hash(c.j * 5 - slot, c.i * 11 + slot);
    const x = c.x + (a - 0.5) * CELL * 0.85;
    const z = c.z + (b - 0.5) * CELL * 0.85;
    const [lo, hi] = SIZE[model]!;
    items.push({ model, cell, x, z, size: (lo + (hi - lo) * hash(x, z)) * sizeScale, rot: hash(z, x) * Math.PI * 2, when, from, to });
  };
  CELLS.forEach((c, k) => {
    if (!c.claimable) return;
    const r = (n: number) => hash(c.i * 13 + n, c.j * 17 - n);
    switch (c.biome) {
      case 'forest':
        // Dense neutral forest: a thicket of trees. Nature-held forest keeps them, a little thinner.
        for (let s = 0; s < 4; s++) add(k, pickOf(DENSE, r(s)), s, s < 3 ? 'wild' : 'neutral');
        add(k, pickOf(UNDER, r(9)), 9, 'wild');
        add(k, 'stump', 12, 'human', 1, 1);
        break;
      case 'sand':
        add(k, pickOf(SHORE, r(1)), 1, 'nature');
        add(k, 'boulders', 2, 'nature', 0, undefined, 0.6);
        if (r(3) < 0.4) add(k, 'grass-tuft', 3, 'neutral');
        break;
      case 'ice':
        add(k, 'boulders', 1, 'wild', 0, undefined, 1.2);
        if (r(2) < 0.5) add(k, 'spruce', 2, 'wild');
        break;
      default:
        add(k, pickOf(MEADOW, r(1)), 1, 'nature');
        add(k, pickOf(MEADOW, r(2)), 2, 'nature');
        if (r(3) < 0.45) add(k, pickOf(['tree-oak', 'bush', 'tree-birch'] as const, r(4)), 3, 'nature');
        // The city's own greenery: cherry trees in the old town, street trees and lamps in the modern one.
        if (r(5) < 0.18) add(k, 'sakura', 5, 'human', 2, 2);
        if (r(6) < 0.25) add(k, 'tree-street', 6, 'human', 4, 4);
        if (r(7) < 0.12) add(k, 'street-lamp', 7, 'human', 3, 4);
        break;
    }
    // Nature eating into the city: vines and flowers come up as a cell is taken back.
    add(k, 'vines', 20, 'creeping', 0.35);
    add(k, 'wildflowers', 21, 'creeping', 0.6);
    add(k, 'grass-tuft', 22, 'creeping', 0.2);
  });
  return items;
}

function shows(it: Item, st: GroundState): boolean {
  if (!isOpen(st.era, it.cell)) return it.when === 'wild' || it.when === 'neutral' ? st.owner[it.cell] !== 2 : false;
  if (st.built[it.cell] && it.when !== 'creeping') {
    // Leave room for the building itself.
    const c = CELLS[it.cell]!;
    if (Math.hypot(it.x - c.x, it.z - c.z) < CELL * 0.4) return false;
  }
  const o = st.owner[it.cell];
  switch (it.when) {
    case 'wild':
      return o !== 2;
    case 'neutral':
      return o === 0;
    case 'nature':
      return o === 1;
    case 'human':
      return o === 2 && st.era >= it.from && st.era <= (it.to ?? 4);
    case 'creeping': {
      if (o !== 2) return false;
      const p = (st.control[it.cell]! + 100) / 150;
      return p >= it.from;
    }
  }
}

interface Batch {
  meshes: InstancedMesh[];
  locals: Matrix4[];
  items: Item[];
}

/**
 * Trees, rocks, flowers and street furniture, drawn with instancing and re-placed
 * whenever ground changes hands: dense forest on neutral ground, meadows on nature's,
 * the city's own greenery on the humans', and weeds creeping in where nature is winning.
 */
export class Decor {
  readonly group = new Group();
  private batches = new Map<string, Batch>();
  private terrain: Terrain;
  private state: GroundState | null = null;
  private signature = '';
  private pending = true;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    const byModel = new Map<string, Item[]>();
    for (const it of scatter()) {
      const list = byModel.get(it.model) ?? [];
      list.push(it);
      byModel.set(it.model, list);
    }
    for (const [model, list] of byModel) void this.build(model, list);
  }

  private async build(model: string, items: Item[]): Promise<void> {
    const by = SIZE[model]?.[2] ?? 'length';
    const prep = await instantiate(model, 1, by);
    prep.object.updateMatrixWorld(true);
    const batch: Batch = { meshes: [], locals: [], items };
    prep.object.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const inst = new InstancedMesh(m.geometry as BufferGeometry, m.material as Material, items.length);
      inst.castShadow = true;
      inst.receiveShadow = true;
      batch.meshes.push(inst);
      batch.locals.push(m.matrixWorld.clone());
      this.group.add(inst);
    });
    this.batches.set(model, batch);
    this.pending = true;
  }

  /** New ground state. Re-placing is deferred to update() and only done when something visible changed. */
  setGround(st: GroundState): void {
    this.state = st;
    let sig = String(st.era);
    for (let k = 0; k < GRID * GRID; k++) {
      const o = st.owner[k]!;
      const creep = o === 2 ? Math.floor(((st.control[k]! + 100) / 150) * 5) : 0;
      sig += o * 10 + creep + (st.built[k] ? 100 : 0) + ',';
    }
    if (sig !== this.signature) {
      this.signature = sig;
      this.pending = true;
    }
  }

  update(): void {
    if (!this.pending || !this.state) return;
    this.pending = false;
    const st = this.state;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const pos = new Vector3();
    const scl = new Vector3();
    for (const batch of this.batches.values()) {
      let n = 0;
      for (const it of batch.items) {
        if (!shows(it, st)) continue;
        q.setFromAxisAngle(up, it.rot);
        pos.set(it.x, this.terrain.targetHeightAt(it.x, it.z) - 0.05, it.z);
        scl.setScalar(it.size);
        batch.meshes.forEach((mesh, i) => {
          m.compose(pos, q, scl).multiply(batch.locals[i]!);
          mesh.setMatrixAt(n, m);
        });
        n++;
      }
      for (const mesh of batch.meshes) {
        mesh.count = n;
        mesh.visible = n > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (n) mesh.computeBoundingSphere();
      }
    }
  }
}

export type { EraId };
