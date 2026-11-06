import type { UnitClass } from '../types.ts';

export interface ClassDef {
  id: UnitClass;
  name: string;
  /** Damage per cost relative to a plain unit: assassins hit hard, tanks less so. */
  atk: number;
  /** Share of a countermeasure's penalty this class shrugs off. */
  resist: number;
  /** Radix scale used for this class in the UI. */
  accent: 'lime' | 'amber' | 'orange' | 'brown' | 'cyan';
}

export const CLASSES: Record<UnitClass, ClassDef> = {
  assassin: { id: 'assassin', name: '刺客', atk: 1.3, resist: 0, accent: 'lime' },
  swarm: { id: 'swarm', name: '群体', atk: 1, resist: 0.15, accent: 'amber' },
  hunter: { id: 'hunter', name: '猎手', atk: 1.15, resist: 0.3, accent: 'orange' },
  tank: { id: 'tank', name: '重坦', atk: 0.85, resist: 0.6, accent: 'brown' },
  marine: { id: 'marine', name: '水军', atk: 1, resist: 0.4, accent: 'cyan' },
};
