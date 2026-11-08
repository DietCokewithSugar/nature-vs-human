import { CELL, CELLS, isOpen, type EraId } from '../core/index.ts';
import { hash } from './ground.ts';

/**
 * Trees, rocks, flowers and street furniture: the same scatter rules as the 3D decor
 * (dense forest on neutral ground, meadows on nature's, the city's greenery on the humans',
 * weeds creeping in where nature is winning), as a pure function of the cell.
 */

type When = 'wild' | 'neutral' | 'nature' | 'human' | 'creeping';

export interface DecorItem {
  model: string;
  cell: number;
  x: number;
  z: number;
  flip: boolean;
  when: When;
  from: number;
  to?: number;
}

const pickOf = <T,>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))]!;

const DENSE = ['spruce', 'tree-pine', 'tree-oak', 'tree-broadleaf', 'tree-pine', 'tree-birch'] as const;
const UNDER = ['fern', 'bush', 'fern', 'grass-tuft'] as const;
const MEADOW = ['wildflowers', 'grass-tuft', 'wildflowers', 'bush', 'grass-tuft', 'wildflowers'] as const;
const SHORE = ['grass-tuft', 'boulders', 'grass-tuft', 'wildflowers'] as const;

export function scatter(): DecorItem[] {
  const items: DecorItem[] = [];
  const add = (cell: number, model: string, slot: number, when: When, from = 0, to?: number) => {
    const c = CELLS[cell]!;
    const a = hash(c.i * 7 + slot, c.j * 3 - slot);
    const b = hash(c.j * 5 - slot, c.i * 11 + slot);
    items.push({ model, cell, x: c.x + (a - 0.5) * CELL * 0.85, z: c.z + (b - 0.5) * CELL * 0.85, flip: hash(b, a) < 0.5, when, from, to });
  };
  CELLS.forEach((c, k) => {
    if (!c.claimable) return;
    const r = (n: number) => hash(c.i * 13 + n, c.j * 17 - n);
    switch (c.biome) {
      case 'forest':
        for (let s = 0; s < 4; s++) add(k, pickOf(DENSE, r(s)), s, s < 3 ? 'wild' : 'neutral');
        add(k, pickOf(UNDER, r(9)), 9, 'wild');
        add(k, 'stump', 12, 'human', 1, 1);
        break;
      case 'sand':
        add(k, pickOf(SHORE, r(1)), 1, 'nature');
        if (r(2) < 0.5) add(k, 'boulders', 2, 'nature');
        if (r(3) < 0.4) add(k, 'grass-tuft', 3, 'neutral');
        break;
      case 'ice':
        add(k, 'boulders', 1, 'wild');
        if (r(2) < 0.5) add(k, 'spruce', 2, 'wild');
        break;
      default:
        add(k, pickOf(MEADOW, r(1)), 1, 'nature');
        if (r(2) < 0.5) add(k, pickOf(MEADOW, r(2)), 2, 'nature');
        if (r(3) < 0.45) add(k, pickOf(['tree-oak', 'bush', 'tree-birch'] as const, r(4)), 3, 'nature');
        if (r(5) < 0.18) add(k, 'sakura', 5, 'human', 2, 2);
        if (r(6) < 0.25) add(k, 'tree-street', 6, 'human', 4, 4);
        if (r(7) < 0.12) add(k, 'street-lamp', 7, 'human', 3, 4);
        break;
    }
    add(k, 'vines', 20, 'creeping', 0.35);
    add(k, 'wildflowers', 21, 'creeping', 0.6);
    add(k, 'grass-tuft', 22, 'creeping', 0.2);
  });
  // Back to front, so equal depths keep a stable order.
  return items.sort((a, b) => a.z - b.z);
}

export function shows(it: DecorItem, era: EraId, owner: ArrayLike<number>, control: ArrayLike<number>, built: ArrayLike<number>): boolean {
  if (!isOpen(era, it.cell)) return it.when === 'wild' || it.when === 'neutral' ? owner[it.cell] !== 2 : false;
  if (built[it.cell] && it.when !== 'creeping') {
    const c = CELLS[it.cell]!;
    if (Math.hypot(it.x - c.x, it.z - c.z) < CELL * 0.45) return false;
  }
  const o = owner[it.cell];
  switch (it.when) {
    case 'wild':
      return o !== 2;
    case 'neutral':
      return o === 0;
    case 'nature':
      return o === 1;
    case 'human':
      return o === 2 && era >= it.from && era <= (it.to ?? 4);
    case 'creeping':
      return o === 2 && (control[it.cell]! + 100) / 150 >= it.from;
  }
}
