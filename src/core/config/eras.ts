import type { EraId } from '../types.ts';

export interface EraDef {
  id: EraId;
  name: string;
  district: string;
  /** Radix color scale used as this era's accent. */
  accent: 'lime' | 'cyan' | 'brown' | 'tomato';
}

export const ERAS: Record<EraId, EraDef> = {
  1: { id: 1, name: '虫潮', district: '幸福里小区', accent: 'lime' },
  2: { id: 2, name: '海啸', district: '金沙湾港', accent: 'cyan' },
  3: { id: 3, name: '兽群', district: '老城中心', accent: 'brown' },
  4: { id: 4, name: '远古', district: '中央商务区', accent: 'tomato' },
};
