import type { UnitClass } from '../types.ts';

export interface ClassDef {
  id: UnitClass;
  name: string;
  /** Share of a countermeasure's penalty this class shrugs off. */
  resist: number;
  /** Radix scale used for this class in the UI. */
  accent: 'lime' | 'amber' | 'orange' | 'brown' | 'cyan';
}

export const CLASSES: Record<UnitClass, ClassDef> = {
  assassin: { id: 'assassin', name: '刺客', resist: 0, accent: 'lime' },
  swarm: { id: 'swarm', name: '群体', resist: 0.15, accent: 'amber' },
  hunter: { id: 'hunter', name: '猎手', resist: 0.3, accent: 'orange' },
  tank: { id: 'tank', name: '重坦', resist: 0.6, accent: 'brown' },
  marine: { id: 'marine', name: '水军', resist: 0.4, accent: 'cyan' },
};
