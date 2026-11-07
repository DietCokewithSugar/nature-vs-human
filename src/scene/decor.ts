import { Group, InstancedMesh, MathUtils, Matrix4, Mesh, Object3D, Quaternion, Vector3, type BufferGeometry, type Material } from 'three';
import type { EraId } from '../core/index.ts';
import { instantiate } from './assets.ts';
import { noise, naturalHeight, riverDistance, seaness, type Terrain } from './terrain.ts';
import { LAIR_SPOTS, MAP_HALF, RIVER_HALF_WIDTH, TERRITORY, VOLCANO, ZONE_AREAS, inTerritory, territoryDistance } from './world.ts';

interface Item {
  model: string;
  x: number;
  z: number;
  size: number;
  rot: number;
  /** Visible in an era? */
  show: (era: EraId, creep: number) => boolean;
}

function hash(a: number, b: number): number {
  const s = Math.sin(a * 91.7 + b * 47.3) * 15731.743;
  return s - Math.floor(s);
}

const pick = <T,>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))]!;

const WOODS = ['tree-oak', 'tree-broadleaf', 'tree-birch', 'bush', 'tree-oak', 'fern'] as const;
const NORTH = ['spruce', 'tree-pine', 'spruce', 'boulders'] as const;
const OPEN = ['grass-tuft', 'bush', 'tree-pine', 'grass-tuft', 'boulders', 'wildflowers', 'tree-oak'] as const;
const PLAINS = ['grass-tuft', 'grass-tuft', 'wildflowers', 'bush', 'grass-tuft'] as const;
const SHORE = ['grass-tuft', 'boulders', 'bush'] as const;

const SIZE: Record<string, [number, number, 'length' | 'height']> = {
  'tree-oak': [4.5, 6.5, 'height'],
  'tree-broadleaf': [4.5, 6, 'height'],
  'tree-birch': [5, 7, 'height'],
  'tree-pine': [5, 7.5, 'height'],
  spruce: [5.5, 8, 'height'],
  bush: [1.8, 3, 'length'],
  fern: [1.2, 1.8, 'length'],
  boulders: [2, 3.6, 'length'],
  'grass-tuft': [0.9, 1.4, 'height'],
  wildflowers: [1, 1.5, 'length'],
  vines: [2.4, 3.6, 'length'],
  stump: [0.9, 1.3, 'length'],
};

const TREES = new Set(['tree-oak', 'tree-broadleaf', 'tree-birch', 'tree-pine', 'spruce']);

function nearLair(x: number, z: number): boolean {
  for (const s of Object.values(LAIR_SPOTS)) if (Math.hypot(x - s.x, z - s.z) < s.size * 0.55 + 2) return true;
  return false;
}

/** The scatter is a pure function of position, so every run shows the same wilderness. */
function scatter(): Item[] {
  const items: Item[] = [];
  const spacing = 3.4;
  for (let gz = -MAP_HALF + 2; gz < MAP_HALF - 1; gz += spacing) {
    for (let gx = -MAP_HALF + 2; gx < MAP_HALF - 1; gx += spacing) {
      const x = gx + (hash(gx, gz) - 0.5) * spacing * 0.9;
      const z = gz + (hash(gz, gx) - 0.5) * spacing * 0.9;
      const h = naturalHeight(x, z);
      if (h < 0.1 || seaness(x, z) > 0.02 || riverDistance(x, z) < RIVER_HALF_WIDTH + 1.2) continue;
      if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.size * 0.55) continue;
      if (nearLair(x, z)) continue;
      // Always-human ground stays bare.
      if (inTerritory(1, x, z, 1)) continue;
      const density = noise(x * 0.8 + 50, z * 0.8);
      const zone = (k: keyof typeof ZONE_AREAS) => Math.hypot(x - ZONE_AREAS[k].x, z - ZONE_AREAS[k].z) / ZONE_AREAS[k].r;
      let list: readonly string[];
      let keep: number;
      if (zone('forest') < 1.05) [list, keep] = [WOODS, 0.92];
      else if (zone('plains') < 1) [list, keep] = [PLAINS, 0.55];
      else if (z < -36 || zone('volcano') < 1) [list, keep] = [NORTH, 0.6];
      else if (seaness(x, z) > 0 || riverDistance(x, z) < RIVER_HALF_WIDTH + 4) [list, keep] = [SHORE, 0.5];
      else [list, keep] = [OPEN, 0.45 + density * 0.4];
      if (hash(x * 3, z * 7) > keep) continue;
      const model = pick(list, hash(x * 13, z * 5));
      const [lo, hi] = SIZE[model]!;
      const size = lo + (hi - lo) * hash(x, z * 3);
      const rot = hash(z, x) * Math.PI * 2;
      // Felled once the city reaches it: a tree leaves a stump if it stood at the city's edge.
      items.push({ model, x, z, size, rot, show: (era) => !inTerritory(era, x, z, 1.2) });
      if (TREES.has(model)) {
        items.push({
          model: 'stump',
          x,
          z,
          size: SIZE.stump![0] + 0.3 * hash(x, z),
          rot,
          show: (era) => era >= 2 && inTerritory(era, x, z, 1.2) && territoryDistance(era, x, z) === 0 && edgeDistance(era, x, z) < 3.5,
        });
      }
    }
  }
  // Nature creeping into the city: vines and flowers just inside its edge, more as the bill gets paid.
  let n = 0;
  for (let gz = -MAP_HALF + 1; gz < MAP_HALF; gz += 3.2) {
    for (let gx = -MAP_HALF + 1; gx < MAP_HALF; gx += 3.2) {
      const x = gx + (hash(gx + 3, gz) - 0.5) * 2;
      const z = gz + (hash(gz + 5, gx) - 0.5) * 2;
      if (naturalHeight(x, z) < 0) continue;
      const order = hash(x * 5 + 1, z * 3 + 2);
      const kind = hash(x * 7 + 3, z * 11 + 1);
      const model = kind < 0.6 ? 'vines' : kind < 0.88 ? 'grass-tuft' : 'wildflowers';
      const [lo, hi] = SIZE[model]!;
      items.push({
        model,
        x,
        z,
        size: lo + (hi - lo) * hash(z, x),
        rot: hash(x, z) * Math.PI * 2,
        show: (era, creep) => {
          if (!inTerritory(era, x, z)) return false;
          const depth = edgeDistance(era, x, z);
          // Deeper into the city as the bill is paid; a share of spots at any depth.
          return depth < 2 + creep * 14 && order * 0.9 < creep;
        },
      });
      n++;
    }
  }
  void n;
  return items;
}

/** How far inside the territory a point is (distance to the nearest edge of the rect containing it). */
function edgeDistance(era: EraId, x: number, z: number): number {
  let best = 0;
  for (const r of TERRITORY[era]) {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    best = Math.max(best, Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z));
  }
  return best;
}

interface Batch {
  meshes: InstancedMesh[];
  /** Mesh-local matrices relative to the model root at unit size. */
  locals: Matrix4[];
  items: Item[];
}

/**
 * The wild scenery: trees, rocks and grass, drawn with instancing.
 * Re-evaluated on era change (clearing for the city) and as the bill progresses (nature creeping in).
 */
export class Decor {
  readonly group = new Group();
  private batches = new Map<string, Batch>();
  private terrain: Terrain;
  private era: EraId = 1;
  private creep = 0;
  private dirty = true;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    const items = scatter();
    const byModel = new Map<string, Item[]>();
    for (const it of items) {
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
    this.dirty = true;
  }

  setEra(era: EraId): void {
    if (era !== this.era) this.dirty = true;
    this.era = era;
  }

  /** 0..1 share of the bill paid. Nature only starts creeping in past a third of it. */
  setCreep(progress: number): void {
    const v = MathUtils.smoothstep(progress, 0.35, 1);
    const q = Math.round(v * 20) / 20;
    if (q !== this.creep) this.dirty = true;
    this.creep = q;
  }

  /** Re-place instances when the era, the creep or the ground moved. */
  update(force = false): void {
    if (!this.dirty && !force) return;
    this.dirty = false;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const pos = new Vector3();
    const scl = new Vector3();
    for (const batch of this.batches.values()) {
      // Visible instances are packed to the front; hidden ones are not drawn at all.
      let n = 0;
      for (const it of batch.items) {
        if (!it.show(this.era, this.creep)) continue;
        q.setFromAxisAngle(up, it.rot);
        pos.set(it.x, this.terrain.targetHeightAt(it.x, it.z) - 0.05, it.z);
        scl.setScalar(it.size);
        batch.meshes.forEach((mesh, k) => {
          m.compose(pos, q, scl).multiply(batch.locals[k]!);
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
