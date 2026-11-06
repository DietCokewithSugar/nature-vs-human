import type { EraId } from '../types.ts';

export interface EraDef {
  id: EraId;
  name: string;
  /** What the human side looks like in this era. */
  humans: string;
  /** Radix scale used as this era's accent. */
  accent: 'sky' | 'gold' | 'bronze' | 'iris';
}

export const ERAS: Record<EraId, EraDef> = {
  1: { id: 1, name: '冰河', humans: '原始部落', accent: 'sky' },
  2: { id: 2, name: '古代', humans: '城邦', accent: 'gold' },
  3: { id: 3, name: '工业', humans: '工业城镇', accent: 'bronze' },
  4: { id: 4, name: '现代', humans: '大都市', accent: 'iris' },
};
